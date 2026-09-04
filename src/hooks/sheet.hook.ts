import type { Hook, HookContext } from '@objectstack/spec/data';
import { actorId, fail, findById, hasPosition, isSystem, isSystemWrite, merged, nowIso, recordId, sys, sysNoActor, writeReview } from './util.js';
import { requiredPositionFor, STATUS_LABEL, transition, type PlanStepDef, type SheetAction, type SheetStatus } from '../lib/workflow.js';
import { regenerateResults } from '../services/results-service.js';
import { provisionPlanSharing } from '../services/sharing-service.js';
import { createSnapshot } from '../services/snapshot-service.js';

export async function loadPlanSteps(api: ReturnType<typeof sys>, planId: string): Promise<PlanStepDef[]> {
  const rows = await api.object('kpi_plan_step').find({ where: { plan: planId }, orderBy: [{ field: 'seq', order: 'asc' }] });
  return (rows ?? []).map((r: Record<string, any>) => ({
    seq: Number(r.seq),
    step_type: r.step_type,
    label: r.label ?? null,
    approver_position: r.approver_position ?? null,
  }));
}

/** 流程暂存字段:按钮写进来、after 阶段清空,不承载业务数据。 */
const SCRATCH_FIELDS = new Set(['pending_action', 'action_reason']);

/**
 * 填报单由方案发布生成;非系统上下文不能手工新建。
 *
 * 这里的免检仍按 `isSystem` 而不是「无发起人」:发布是**用户点**「发布方案」触发的,
 * 生成填报单由方案 hook 以带发起人的系统上下文完成,收紧会直接打断发布。填报单
 * 也没有任何 insert 型按钮,动作体到不了这条分支;REST 手工新建走非系统上下文,照拦。
 */
export const SheetInsertGuardHook: Hook = {
  name: 'kpi_sheet_insert_guard',
  label: '填报单新建保护',
  object: 'kpi_entry_sheet',
  events: ['beforeInsert'],
  priority: 100,
  handler: async (ctx: HookContext) => {
    if (isSystem(ctx)) return;
    if (!(await hasPosition(ctx, 'kpi_admin'))) {
      fail('新建填报单失败:填报单由考核方案发布时自动生成,不能手工新建。请在考核方案中发布方案。', 'KPI_SHEET_MANUAL_INSERT');
    }
  },
};

/**
 * 填报单审核状态机(蓝图 C-2,方案分级 D-03)—— before 阶段:只做校验与字段计算。
 *
 * 按钮只写 `pending_action`(+ `action_reason`);本 hook 按方案的流程节点计算目标状态、
 * 校验岗位、校验驳回原因必填、校验并行核对是否完成;直接改 `status` 的非系统写入一律拒绝。
 * 所有副作用(审核记录、核对任务、快照、结果汇总)在 after 阶段执行,主写入被平台校验
 * 拒绝时不会留下半截数据。`pending_action` / `action_reason` 随本次写入落库,after 阶段
 * 读取后清空。
 */
export const SheetTransitionHook: Hook = {
  name: 'kpi_sheet_transition',
  label: '填报单流程推进',
  object: 'kpi_entry_sheet',
  events: ['beforeUpdate'],
  priority: 100,
  handler: async (ctx: HookContext) => {
    const input = ctx.input as Record<string, any>;
    const prev = (ctx.previous ?? {}) as Record<string, any>;
    const api = sys(ctx);
    const id = recordId(ctx);
    const action = input.pending_action as SheetAction | null | undefined;

    if (!action) {
      // 免检只给纯系统写入(无发起人)。按钮的动作体带着发起人以「受信任」身份写入,
      // 只看 isSystem 会把它当系统写入放行(objectstack#2849),这两条锁就等于没上。
      if ('status' in input && input.status !== prev.status && !isSystemWrite(ctx)) {
        fail('修改填报单状态失败:状态由流程推进,不能直接修改。请使用提交、审核通过、驳回或归档按钮。', 'KPI_SHEET_DIRECT_STATUS');
      }
      if (prev.status === 'archived' && !isSystemWrite(ctx)) {
        // pending_action / action_reason 是流程的暂存字段,after 阶段的清场写入只动这两个,
        // 不算「改数据」;带真实动作的写入走不到这个分支(上面 `action` 为真时已分流)。
        const touched = Object.keys(input).filter((k) => !SCRATCH_FIELDS.has(k) && k !== 'id' && input[k] !== prev[k]);
        if (touched.length) fail('修改填报单失败:该填报单已归档,数据已锁定不可再改。', 'KPI_SHEET_ARCHIVED');
      }
      return;
    }
    if (!id) fail('系统内部错误:无法识别填报单。请刷新后重试。', 'KPI_SHEET_NO_ID');

    const fromStatus = prev.status as SheetStatus;
    const steps = await loadPlanSteps(api, String(prev.plan));
    const result = transition(steps, fromStatus, action);
    if (!result.ok) fail(`操作失败:${result.message}`, 'KPI_SHEET_TRANSITION');

    // 岗位闸:按**发起人**校验,不看写入是否带系统标记 —— 按钮路径与 REST 路径同一口径
    // (hasPosition 的免检只留给无发起人的纯系统写入)。
    const required = requiredPositionFor(steps, fromStatus, action);
    if (!(await hasPosition(ctx, required))) {
      fail(`操作失败:当前节点「${result.atStepDef?.label ?? STATUS_LABEL[fromStatus]}」需要由对应岗位处理,你没有该岗位。如需处理,请联系管理员分配岗位。`, 'KPI_SHEET_POSITION');
    }

    const reason = typeof input.action_reason === 'string' ? input.action_reason.trim() : '';
    if (action === 'reject' && !reason) {
      fail('驳回失败:驳回原因不能为空。请填写原因后再驳回。', 'KPI_REJECT_REASON_REQUIRED');
    }

    if (action === 'submit') {
      const missing = await api.object('kpi_entry_line').count({ where: { sheet: id, actual_value: null } });
      if (missing > 0) fail(`提交失败:还有 ${missing} 个指标未填写实际值。请补齐后再提交。`, 'KPI_SUBMIT_INCOMPLETE');
    }

    if (action === 'approve' && fromStatus === 'branch_checking') {
      const pending = await api.object('kpi_check_task').count({ where: { sheet: id, status: 'pending' } });
      const disputed = await api.object('kpi_check_task').count({ where: { sheet: id, status: 'disputed' } });
      if (pending > 0 || disputed > 0) {
        fail(`推进失败:还有 ${pending} 家分公司未核对、${disputed} 家分公司有争议未解决。请待全部确认后再推进。`, 'KPI_CHECK_INCOMPLETE');
      }
    }

    const actor = actorId(ctx);
    const at = nowIso();
    let toStatus = result.toStatus;
    let toStep = result.toStep;

    // 进入分公司核对但方案里没有其他分公司需要核对:自动越过该节点
    if (toStatus === 'branch_checking') {
      const branches = await api.object('kpi_plan_subject').find({ where: { plan: prev.plan, subject_type: 'branch' } });
      const others = branches.filter((b: Record<string, any>) => String(b.subject) !== String(prev.subject));
      if (others.length === 0) {
        const next = transition(steps, 'branch_checking', 'approve');
        if (next.ok) {
          toStatus = next.toStatus;
          toStep = next.toStep;
        }
      }
    }

    input.status = toStatus;
    input.current_step = toStep;
    input.pending_action = action;
    input.action_reason = reason || null;
    if (action === 'submit') {
      input.submitted_at = at;
      input.submitted_by = actor;
      input.last_reject_reason = null;
    }
    if (action === 'reject') input.last_reject_reason = reason;
    if (toStatus === 'approved') {
      input.approved_at = at;
      input.approved_by = actor;
    }
    if (toStatus === 'archived') input.archived_at = at;
  },
};

/** after 阶段:留痕、核对任务生成/重置、快照、结果汇总;最后清空待执行动作。 */
export const SheetAfterTransitionHook: Hook = {
  name: 'kpi_sheet_after_transition',
  label: '填报单流程副作用',
  object: 'kpi_entry_sheet',
  events: ['afterUpdate'],
  priority: 100,
  handler: async (ctx: HookContext) => {
    const input = (ctx.input ?? {}) as Record<string, any>;
    const prev = (ctx.previous ?? {}) as Record<string, any>;
    const now = merged<Record<string, any>>(ctx);
    // 只有本次写入携带动作(按钮触发)才是流程推进;汇总字段重算等系统写入不带动作,直接跳过
    const action = ('pending_action' in input ? input.pending_action : null) as SheetAction | null | undefined;
    if (!action) return;
    const id = String(now.id ?? prev.id ?? recordId(ctx) ?? '');
    if (!id) return;
    const api = sys(ctx);
    const actor = actorId(ctx);
    // 先清空动作,再做副作用:副作用失败也不会让动作残留而被反复触发
    await api.object('kpi_entry_sheet').updateById(id, { pending_action: null, action_reason: null });
    const fromStatus = prev.status as SheetStatus;
    const toStatus = now.status as SheetStatus;
    const steps = await loadPlanSteps(api, String(now.plan ?? prev.plan));
    const planned = transition(steps, fromStatus, action);
    const stepLabel = planned.ok ? planned.atStepDef?.label ?? null : null;

    await writeReview(api, { sheet: id, action, step_label: stepLabel, from_status: fromStatus, to_status: toStatus, actor, reason: now.action_reason ?? null });
    if (planned.ok && planned.toStatus === 'branch_checking' && toStatus !== 'branch_checking') {
      await writeReview(api, { sheet: id, action: 'approve', step_label: '分公司核对', from_status: 'branch_checking', to_status: toStatus, actor: null, reason: '方案中没有需要核对的其他分公司,系统自动跳过' });
    }

    if (toStatus === 'branch_checking') {
      const branches = await api.object('kpi_plan_subject').find({ where: { plan: now.plan ?? prev.plan, subject_type: 'branch' } });
      const existing = await api.object('kpi_check_task').find({ where: { sheet: id } });
      const existingBranches = new Set(existing.map((t: Record<string, any>) => String(t.branch)));
      const sheetName = String(now.name ?? prev.name ?? id);
      for (const b of branches) {
        if (String(b.subject) === String(now.subject ?? prev.subject)) continue;
        if (existingBranches.has(String(b.subject))) continue;
        const bu = await findById(api, 'sys_business_unit', b.subject);
        await api.object('kpi_check_task').insert({ name: `${sheetName} · ${bu?.name ?? b.subject} 核对`, sheet: id, plan: now.plan ?? prev.plan, branch: b.subject, status: 'pending' });
      }
      if (action === 'reject') {
        // 重置是系统动作,不是「谁把核对撤回了」:用无发起人的系统上下文写,
        // 否则会被核对 hook 的「已确认不能撤回」按发起人拦下。
        const sysApi = sysNoActor(ctx);
        for (const t of existing) {
          if (t.status !== 'pending') await sysApi.object('kpi_check_task').updateById(String(t.id), { status: 'pending', comment: null, decided_by: null, decided_at: null });
        }
      }
    }

    if (toStatus === 'archived') await createSnapshot(api, id, actor);
    if (toStatus === 'approved' || toStatus === 'archived') {
      try {
        await regenerateResults(api, String(now.plan ?? prev.plan));
      } catch (err) {
        // 汇总失败不回滚流程:结果可在下次通过 / 归档 / 调整落地时重算;错误进服务端日志
        console.error('[kpi] regenerate results failed', { plan: now.plan ?? prev.plan, error: err instanceof Error ? err.message : String(err) });
      }
    }

    // 本 hook 新建的记录(核对任务、结果)都是系统上下文写入,平台不会在写入时物化记录共享;
    // 重新声明相关规则让求值器补齐(见 services/sharing-service.ts 的 ensureRule)。
    const touched: string[] = [];
    if (toStatus === 'branch_checking') touched.push('kpi_check_task');
    if (toStatus === 'approved' || toStatus === 'archived') touched.push('kpi_result');
    if (touched.length) {
      try {
        await provisionPlanSharing(api, String(now.plan ?? prev.plan), { objects: touched });
      } catch (err) {
        console.error('[kpi] reassert sharing after transition failed', { sheet: id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  },
};

export const SheetDeleteGuardHook: Hook = {
  name: 'kpi_sheet_delete_guard',
  label: '填报单删除保护',
  object: 'kpi_entry_sheet',
  events: ['beforeDelete'],
  priority: 100,
  handler: async (ctx: HookContext) => {
    // 没有删除型按钮,动作体到不了这条分支;删除一律走非系统上下文,免检维持 isSystem。
    if (isSystem(ctx)) return;
    const prev = (ctx.previous ?? {}) as Record<string, any>;
    if (prev.status && prev.status !== 'draft') {
      fail(`删除填报单失败:状态为「${STATUS_LABEL[prev.status as SheetStatus] ?? prev.status}」的填报单不能删除。`, 'KPI_SHEET_DELETE');
    }
  },
};
