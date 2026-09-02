import type { Hook, HookContext } from '@objectstack/spec/data';
import { actorId, fail, findById, hasPosition, isSystem, merged, nowIso, sys, toNumber } from './util.js';
import { regenerateResults } from '../services/results-service.js';
import { provisionPlanSharing } from '../services/sharing-service.js';

/** 加减分:计入分值带符号;审批盖章需人力岗位;归档后锁定。 */
export const BonusHook: Hook = {
  name: 'kpi_bonus_rules',
  label: '加减分规则',
  object: 'kpi_bonus',
  events: ['beforeInsert', 'beforeUpdate'],
  priority: 100,
  handler: async (ctx: HookContext) => {
    const input = ctx.input as Record<string, any>;
    const prev = (ctx.previous ?? {}) as Record<string, any>;
    const row = merged<Record<string, any>>(ctx);
    const api = sys(ctx);

    const sheet = await findById(api, 'kpi_entry_sheet', row.sheet);
    if (sheet?.status === 'archived' && !isSystem(ctx)) {
      fail('修改加减分失败:填报单已归档,数据已锁定不可再改。', 'KPI_BONUS_ARCHIVED');
    }
    const points = toNumber(row.points) ?? 0;
    input.signed_points = row.bonus_type === 'deduct' ? -points : points;

    if (ctx.event === 'beforeUpdate' && 'status' in input && input.status !== prev.status) {
      if (input.status === 'approved' || input.status === 'rejected') {
        const ok = (await hasPosition(ctx, 'kpi_hr_reviewer')) || (await hasPosition(ctx, 'kpi_hr_head'));
        if (!ok) fail('审批加减分失败:该操作需要「人力审核」或「人力负责人」岗位。如需处理,请联系管理员分配岗位。', 'KPI_BONUS_POSITION');
        input.approved_by = actorId(ctx);
        input.approved_at = nowIso();
      }
    } else if (ctx.event === 'beforeUpdate' && prev.status === 'approved' && !isSystem(ctx)) {
      const touched = Object.keys(input).filter((k) => !['id', 'signed_points'].includes(k) && input[k] !== prev[k]);
      if (touched.length) fail('修改加减分失败:已批准的加减分不能再修改。如需更正,请否决后重新申请。', 'KPI_BONUS_LOCKED');
    }
  },
};

/**
 * 加减分审批落定后立即重算四维结果(需求符合度清单 #7)。
 *
 * 加减分计入填报单的最终得分,而结果汇总只在填报单通过 / 归档 / 调整落地时重算 ——
 * 已通过的填报单上批准一条加减分,结果会停在旧分值上直到下一次触发。
 *
 * 批准与否决两个按钮都在这里收口:否决只能从「待审批」发生(状态机不允许从已批准回退),
 * 被否决的分从未计入,所以那一路重算出来的分与原值相同 —— 保留它是为了两个按钮走同一
 * 条路径,任何一次审批落定后结果与填报单最终得分都不会各说各话。
 *
 * 重算失败不回滚审批:审批本身已经成立,结果可在下次通过 / 调整 / 归档时补算。
 */
export const BonusAfterDecideHook: Hook = {
  name: 'kpi_bonus_after_decide',
  label: '加减分审批后重算结果',
  object: 'kpi_bonus',
  events: ['afterUpdate'],
  priority: 100,
  handler: async (ctx: HookContext) => {
    const input = (ctx.input ?? {}) as Record<string, any>;
    const prev = (ctx.previous ?? {}) as Record<string, any>;
    if (!('status' in input) || input.status === prev.status) return;
    if (input.status !== 'approved' && input.status !== 'rejected') return;

    const api = sys(ctx);
    const row = merged<Record<string, any>>(ctx);
    const sheet = await findById(api, 'kpi_entry_sheet', row.sheet);
    if (!sheet || (sheet.status !== 'approved' && sheet.status !== 'archived')) return;
    try {
      await regenerateResults(api, String(sheet.plan));
      await provisionPlanSharing(api, String(sheet.plan), { objects: ['kpi_result'] });
    } catch (err) {
      console.error('[kpi] regenerate results after bonus decision failed', { sheet: sheet.id, error: err instanceof Error ? err.message : String(err) });
    }
  },
};
