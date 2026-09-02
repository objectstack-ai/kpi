import type { Hook, HookContext } from '@objectstack/spec/data';
import { actorId, fail, findById, isSystem, merged, nowIso, sys } from './util.js';

/** 提出争议:只允许对草稿方案的下达提出;把下达的争议状态置为「争议中」。 */
export const DisputeRaiseHook: Hook = {
  name: 'kpi_dispute_raise',
  label: '提出指标争议',
  object: 'kpi_dispute',
  events: ['beforeInsert'],
  priority: 100,
  handler: async (ctx: HookContext) => {
    const api = sys(ctx);
    const row = merged<Record<string, any>>(ctx);
    const pi = await findById(api, 'kpi_plan_indicator', row.plan_indicator);
    if (!pi) fail('提出争议失败:对应的指标下达不存在或已被删除。请刷新后重新选择。', 'KPI_DISPUTE_TARGET');
    const plan = await findById(api, 'kpi_plan', pi.plan);
    if (plan && plan.status !== 'draft' && !isSystem(ctx)) {
      fail('提出争议失败:方案已发布,指标下达已冻结,不能再对其提出争议。如有异议请联系人力审核。', 'KPI_DISPUTE_FROZEN');
    }
    const input = ctx.input as Record<string, any>;
    if (!input.raised_by) input.raised_by = actorId(ctx);
  },
};

export const DisputeAfterRaiseHook: Hook = {
  name: 'kpi_dispute_after_raise',
  label: '争议同步到指标下达',
  object: 'kpi_dispute',
  events: ['afterInsert'],
  priority: 100,
  handler: async (ctx: HookContext) => {
    const row = merged<Record<string, any>>(ctx);
    if (!row.plan_indicator) return;
    await sys(ctx).object('kpi_plan_indicator').updateById(String(row.plan_indicator), { dispute_status: 'open' });
  },
};

/** 处理争议:盖章;若该下达再无未关闭争议,置为「已解决」。 */
export const DisputeResolveHook: Hook = {
  name: 'kpi_dispute_resolve',
  label: '处理指标争议',
  object: 'kpi_dispute',
  events: ['beforeUpdate'],
  priority: 100,
  handler: async (ctx: HookContext) => {
    const input = ctx.input as Record<string, any>;
    const prev = (ctx.previous ?? {}) as Record<string, any>;
    if (!('status' in input) || input.status === prev.status) return;
    if (input.status === 'accepted' || input.status === 'rejected') {
      input.resolved_by = actorId(ctx);
      input.resolved_at = nowIso();
    }
  },
};

export const DisputeAfterResolveHook: Hook = {
  name: 'kpi_dispute_after_resolve',
  label: '争议关闭后同步',
  object: 'kpi_dispute',
  events: ['afterUpdate'],
  priority: 100,
  handler: async (ctx: HookContext) => {
    const prev = (ctx.previous ?? {}) as Record<string, any>;
    const row = merged<Record<string, any>>(ctx);
    if (row.status === prev.status || row.status === 'open') return;
    const api = sys(ctx);
    const open = await api.object('kpi_dispute').count({ where: { plan_indicator: row.plan_indicator, status: 'open' } });
    if (open === 0) await api.object('kpi_plan_indicator').updateById(String(row.plan_indicator), { dispute_status: 'resolved' });
  },
};
