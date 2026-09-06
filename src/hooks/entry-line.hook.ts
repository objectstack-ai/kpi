import type { Hook, HookContext } from '@objectstack/spec/data';
import { fail, findById, isSystem, merged, sys, toNumber } from './util.js';
import { scoreLine } from '../services/scoring-service.js';

const EDITABLE_AFTER_SUBMIT = new Set(['remark']);

/**
 * 冻结提示按填报单状态分岔(#38 第 3 条)。
 *
 * 「已提交」和「已归档」是两种不同的锁,出口也不同:提交后还能走数据调整申请更正,
 * 归档后连数据调整都被拒(adjustment.hook 的归档闸),再让提示指向数据调整就是把人
 * 支去一条走不通的路。三段式不变:什么失败、为什么、怎么办。
 */
function lockedMessage(action: '修改' | '删除', sheetStatus: unknown): string {
  return sheetStatus === 'archived'
    ? `${action}填报明细失败:填报单已归档,数据已锁定不可再改。归档数据不能更正,如有疑问请联系人力审核。`
    : `${action}填报明细失败:填报单已提交,数据已冻结。如需更正,请发起数据调整申请。`;
}

/**
 * 填报明细 —— 即时算分 + 提交后锁定(蓝图 B-M4-02 / B-M4-03)。
 *
 * 每一次写入(表单、内联网格、导入、调整落地)都经这里:
 * 1. 插入时从「指标下达」冻结指标、目标值、权重、计分方式、方向的副本;
 * 2. 填报单不在「填报中」时,非系统写入只允许改备注;其余改动一律拒绝
 *    (更正走数据调整申请,由系统上下文落地);
 * 3. 调用计分引擎回写完成率、得分率、得分、最终得分与计算说明。
 */
export const EntryLineScoreHook: Hook = {
  name: 'kpi_entry_line_score',
  label: '填报明细即时算分',
  object: 'kpi_entry_line',
  events: ['beforeInsert', 'beforeUpdate'],
  priority: 100,
  handler: async (ctx: HookContext) => {
    const api = sys(ctx);
    const input = ctx.input as Record<string, any>;
    const line = merged<Record<string, any>>(ctx);

    if (ctx.event === 'beforeUpdate' && !isSystem(ctx)) {
      const sheet = await findById(api, 'kpi_entry_sheet', line.sheet);
      if (sheet && sheet.status !== 'draft') {
        const touched = Object.keys(input).filter((k) => k !== 'id' && !EDITABLE_AFTER_SUBMIT.has(k) && input[k] !== (ctx.previous as any)?.[k]);
        if (touched.length > 0) {
          fail(lockedMessage('修改', sheet.status), 'KPI_LINE_LOCKED');
        }
        return;
      }
    }

    if (ctx.event === 'beforeInsert' || (input.plan_indicator && input.plan_indicator !== (ctx.previous as any)?.plan_indicator)) {
      const pi = await findById(api, 'kpi_plan_indicator', line.plan_indicator);
      if (!pi) fail('保存填报明细失败:来源的指标下达不存在或已被删除。请刷新后重新选择。', 'KPI_PLAN_INDICATOR_MISSING');
      const indicator = await findById(api, 'kpi_indicator', pi.indicator);
      if (!indicator) fail('保存填报明细失败:指标定义不存在或已被删除。请联系人力审核核对指标库。', 'KPI_INDICATOR_MISSING');
      input.indicator = indicator.id;
      input.indicator_name = indicator.name;
      input.unit = indicator.unit ?? null;
      input.direction = indicator.direction ?? 'positive';
      input.scoring_method = indicator.scoring_method ?? 'linear';
      input.target_value = toNumber(pi.target_value);
      input.weight = toNumber(pi.weight) ?? 0;
      Object.assign(line, input);
    }

    const computed = await scoreLine(api, line);
    Object.assign(input, computed);
  },
};

/** 明细不能在填报单提交后被删除(非系统)。 */
export const EntryLineDeleteGuardHook: Hook = {
  name: 'kpi_entry_line_delete_guard',
  label: '填报明细删除保护',
  object: 'kpi_entry_line',
  events: ['beforeDelete'],
  priority: 100,
  handler: async (ctx: HookContext) => {
    if (isSystem(ctx)) return;
    const prev = ctx.previous as Record<string, any> | undefined;
    const sheet = await findById(sys(ctx), 'kpi_entry_sheet', prev?.sheet);
    if (sheet && sheet.status !== 'draft') {
      fail(lockedMessage('删除', sheet.status), 'KPI_LINE_LOCKED');
    }
  },
};
