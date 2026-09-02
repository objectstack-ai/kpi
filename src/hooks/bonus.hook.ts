import type { Hook, HookContext } from '@objectstack/spec/data';
import { actorId, fail, findById, hasPosition, isSystem, merged, nowIso, sys, toNumber } from './util.js';

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
