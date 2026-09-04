import type { Hook, HookContext } from '@objectstack/spec/data';
import { actorId, fail, findById, hasPosition, isSystemWrite, merged, nowIso, sys, sysNoActor, writeReview } from './util.js';

/** 核对任务:确认 / 争议时盖章、留痕;全部确认后自动推进填报单(蓝图 B-M4-04)。 */
export const CheckTaskDecideHook: Hook = {
  name: 'kpi_check_task_decide',
  label: '分公司核对',
  object: 'kpi_check_task',
  events: ['beforeUpdate'],
  priority: 100,
  handler: async (ctx: HookContext) => {
    const input = ctx.input as Record<string, any>;
    const prev = (ctx.previous ?? {}) as Record<string, any>;
    if (!('status' in input) || input.status === prev.status) return;
    // 免检只给纯系统写入(无发起人,例如驳回时的批量重置)。「确认无误 / 提出争议」两个
    // 按钮的动作体带着发起人以受信任身份写入,只看 isSystem 会让岗位闸对按钮整体失效。
    if (isSystemWrite(ctx)) return;
    if (input.status === 'pending') {
      fail('核对失败:已确认的核对不能撤回。如需重新核对,请由审核人驳回填报单。', 'KPI_CHECK_REVERT');
    }
    if (!(await hasPosition(ctx, 'kpi_branch_checker'))) {
      fail('核对失败:该操作需要「分公司核对人员」岗位。如需处理,请联系管理员分配岗位。', 'KPI_CHECK_POSITION');
    }
    const sheet = await findById(sys(ctx), 'kpi_entry_sheet', prev.sheet);
    if (!sheet || sheet.status !== 'branch_checking') {
      fail('核对失败:填报单当前不在「分公司核对中」,无法核对。请刷新后查看填报单状态。', 'KPI_CHECK_STATE');
    }
    input.decided_by = actorId(ctx);
    input.decided_at = nowIso();
  },
};

export const CheckTaskAfterDecideHook: Hook = {
  name: 'kpi_check_task_after_decide',
  label: '核对完成后推进填报单',
  object: 'kpi_check_task',
  events: ['afterUpdate'],
  priority: 100,
  handler: async (ctx: HookContext) => {
    const prev = (ctx.previous ?? {}) as Record<string, any>;
    const now = merged<Record<string, any>>(ctx);
    if (now.status === prev.status || now.status === 'pending') return;
    const api = sys(ctx);
    const sheetId = String(now.sheet ?? prev.sheet);
    const bu = await findById(api, 'sys_business_unit', now.branch ?? prev.branch);
    await writeReview(api, {
      sheet: sheetId,
      action: now.status === 'confirmed' ? 'confirm' : 'dispute',
      step_label: `分公司核对 · ${bu?.name ?? ''}`,
      from_status: 'branch_checking',
      to_status: 'branch_checking',
      actor: actorId(ctx),
      reason: now.comment ?? null,
    });
    if (now.status !== 'confirmed') return;
    const pending = await api.object('kpi_check_task').count({ where: { sheet: sheetId, status: 'pending' } });
    const disputed = await api.object('kpi_check_task').count({ where: { sheet: sheetId, status: 'disputed' } });
    if (pending === 0 && disputed === 0) {
      const sheet = await findById(api, 'kpi_entry_sheet', sheetId);
      if (sheet?.status === 'branch_checking') {
        // 自动推进是系统动作:节点审核岗位按方案可改(《设计方案》10.1 第 9 条),
        // 不能指望「最后一个确认的人恰好持有该节点岗位」,必须以无发起人的系统上下文写入。
        await sysNoActor(ctx).object('kpi_entry_sheet').updateById(sheetId, { pending_action: 'approve', action_reason: '全部分公司已确认,系统自动推进' });
      }
    }
  },
};
