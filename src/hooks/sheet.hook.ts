import type { Hook, HookContext } from '@objectstack/spec/data';
import { actorId, fail, findById, hasPosition, isSystem, merged, nowIso, recordId, sys, writeReview } from './util.js';
import { requiredPositionFor, STATUS_LABEL, transition, type PlanStepDef, type SheetAction, type SheetStatus } from '../lib/workflow.js';
import { regenerateResults } from '../services/results-service.js';
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

/** 填报单由方案发布生成;非系统上下文不能手工新建。 */
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
 * 填报单审核状态机(蓝图 C-2,方案分级 D-03)。
 *
 * 按钮只写 `pending_action`(+ `action_reason`);本 hook 按方案的流程节点计算目标状态、
 * 校验岗位、校验驳回原因必填、校验并行核对是否完成、写审核记录,并在通过 / 归档时
 * 触发结果汇总与归档快照。直接改 `status` 的非系统写入一律拒绝。
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
      if ('status' in input && input.status !== prev.status && !isSystem(ctx)) {
        fail('修改填报单状态失败:状态由流程推进,不能直接修改。请使用提交、审核通过、驳回或归档按钮。', 'KPI_SHEET_DIRECT_STATUS');
      }
      if (prev.status === 'archived' && !isSystem(ctx)) {
        const touched = Object.keys(input).filter((k) => k !== 'id' && input[k] !== prev[k]);
        if (touched.length) fail('修改填报单失败:该填报单已归档,数据已锁定不可再改。', 'KPI_SHEET_ARCHIVED');
      }
      return;
    }
    if (!id) fail('系统内部错误:无法识别填报单。请刷新后重试。', 'KPI_SHEET_NO_ID');

    const fromStatus = prev.status as SheetStatus;
    const steps = await loadPlanSteps(api, String(prev.plan));
    const result = transition(steps, fromStatus, action);
    if (!result.ok) fail(`操作失败:${result.message}`, 'KPI_SHEET_TRANSITION');

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
    input.status = result.toStatus;
    input.current_step = result.toStep;
    input.pending_action = null;
    input.action_reason = null;
    if (action === 'submit') {
      input.submitted_at = at;
      input.submitted_by = actor;
      input.last_reject_reason = null;
    }
    if (action === 'reject') input.last_reject_reason = reason;
    if (result.toStatus === 'approved') {
      input.approved_at = at;
      input.approved_by = actor;
    }
    if (result.toStatus === 'archived') input.archived_at = at;

    await writeReview(api, {
      sheet: id,
      action,
      step_label: result.atStepDef?.label ?? null,
      from_status: fromStatus,
      to_status: result.toStatus,
      actor,
      reason: reason || null,
    });

    // 进入分公司并行核对:按方案参与的分公司生成核对任务(重复推进时复用未完成任务)
    if (result.toStatus === 'branch_checking') {
      const branches = await api.object('kpi_plan_subject').find({ where: { plan: prev.plan, subject_type: 'branch' } });
      const existing = await api.object('kpi_check_task').find({ where: { sheet: id } });
      const existingBranches = new Set(existing.map((t: Record<string, any>) => String(t.branch)));
      const sheetName = String(prev.name ?? id);
      let created = 0;
      for (const b of branches) {
        if (String(b.subject) === String(prev.subject)) continue; // 主体自己不核对自己
        if (existingBranches.has(String(b.subject))) continue;
        const bu = await findById(api, 'sys_business_unit', b.subject);
        await api.object('kpi_check_task').insert({
          name: `${sheetName} · ${bu?.name ?? b.subject} 核对`,
          sheet: id,
          branch: b.subject,
          status: 'pending',
        });
        created += 1;
      }
      // 驳回回到核对节点时,把已确认的任务重置为待核对
      if (action === 'reject') {
        for (const t of existing) {
          if (t.status !== 'pending') await api.object('kpi_check_task').updateById(String(t.id), { status: 'pending', comment: null, decided_by: null, decided_at: null });
        }
      }
      if (created === 0 && existing.length === 0) {
        // 没有任何需要核对的分公司:自动越过该节点
        const next = transition(steps, 'branch_checking', 'approve');
        if (next.ok) {
          input.status = next.toStatus;
          input.current_step = next.toStep;
          if (next.toStatus === 'approved') {
            input.approved_at = at;
            input.approved_by = actor;
          }
          await writeReview(api, { sheet: id, action: 'approve', step_label: '分公司核对', from_status: 'branch_checking', to_status: next.toStatus, actor: null, reason: '无需核对的分公司,系统自动跳过' });
        }
      }
    }

    // 结果汇总在本次写入落库后才准确:延后到 after 阶段(见 SheetAfterTransitionHook)
    if (input.status === 'archived') {
      await createSnapshot(api, id, actor);
    }
  },
};

/** 通过 / 归档后重新生成四维结果(after 阶段读到的是已落库的新状态)。 */
export const SheetAfterTransitionHook: Hook = {
  name: 'kpi_sheet_after_transition',
  label: '填报单通过后汇总结果',
  object: 'kpi_entry_sheet',
  events: ['afterUpdate'],
  priority: 100,
  handler: async (ctx: HookContext) => {
    const prev = (ctx.previous ?? {}) as Record<string, any>;
    const now = merged<Record<string, any>>(ctx);
    const entered = (now.status === 'approved' || now.status === 'archived') && now.status !== prev.status;
    if (!entered) return;
    const planId = String(now.plan ?? prev.plan ?? '');
    if (!planId) return;
    await regenerateResults(sys(ctx), planId);
  },
};

export const SheetDeleteGuardHook: Hook = {
  name: 'kpi_sheet_delete_guard',
  label: '填报单删除保护',
  object: 'kpi_entry_sheet',
  events: ['beforeDelete'],
  priority: 100,
  handler: async (ctx: HookContext) => {
    if (isSystem(ctx)) return;
    const prev = (ctx.previous ?? {}) as Record<string, any>;
    if (prev.status && prev.status !== 'draft') {
      fail(`删除填报单失败:状态为「${STATUS_LABEL[prev.status as SheetStatus] ?? prev.status}」的填报单不能删除。`, 'KPI_SHEET_DELETE');
    }
  },
};
