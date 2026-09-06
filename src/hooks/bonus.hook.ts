import type { Hook, HookContext } from '@objectstack/spec/data';
import { actorId, fail, findById, hasPosition, isSystemWrite, merged, nowIso, sys, toNumber } from './util.js';
import { regenerateResults } from '../services/results-service.js';
import { provisionPlanSharing } from '../services/sharing-service.js';

/**
 * 加减分的岗位职责分离(《设计方案》V1.0 第 10 章第 6 项:加减分由**人力审核**提出、
 * **人力负责人**审批)。
 *
 * 登记与审批要求的是**两个不同**的岗位,所以「人力审核不能审批自己登记的加减分」「人力
 * 负责人不能登记」这两条都由岗位判定本身兑现,不需要再比对经办人:只持有人力审核的账号
 * 走到审批一步就被拒,只持有人力负责人的账号走到登记一步就被拒。
 *
 * 岗位判定沿用 `hasPosition` 的口径:`kpi_admin` 与组织 owner / admin 视同考核系统管理员
 * 放行(需求 §2 六类角色里管理员看全部、做全部),系统上下文放行。
 */
export interface BonusPositionRule {
  /** 该动作要求的岗位机器名。 */
  position: string;
  /** 拒绝时的三段式提示(什么失败 + 原因 + 下一步)。 */
  message: string;
  code: string;
  /** 是否是审批动作(要盖审批人 / 审批时间)。 */
  decision: boolean;
}

export const BONUS_REGISTER_RULE: BonusPositionRule = {
  position: 'kpi_hr_reviewer',
  message: '登记加减分失败:只有人力审核岗位可以登记加减分。请联系人力审核办理。',
  code: 'KPI_BONUS_REGISTER_POSITION',
  decision: false,
};
export const BONUS_APPROVE_RULE: BonusPositionRule = {
  position: 'kpi_hr_head',
  message: '审批加减分失败:只有人力负责人岗位可以审批加减分。请转交人力负责人处理。',
  code: 'KPI_BONUS_APPROVE_POSITION',
  decision: true,
};

/**
 * 本次写入需要哪个岗位 —— 纯函数,岗位分离口径的唯一真值(单元测试点)。
 * 登记 = 新建一条加减分;审批 = 把状态改成已批准 / 已否决;其余改动不受岗位约束。
 */
export function requiredBonusPosition(
  event: string,
  input: Record<string, unknown>,
  prev: Record<string, unknown>,
): BonusPositionRule | null {
  if (event === 'beforeInsert') return BONUS_REGISTER_RULE;
  if (event !== 'beforeUpdate') return null;
  if (!('status' in input) || input.status === prev.status) return null;
  return input.status === 'approved' || input.status === 'rejected' ? BONUS_APPROVE_RULE : null;
}

/** 加减分:计入分值带符号;登记 / 审批按岗位分离把关;归档后锁定。 */
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
    // 免检只给纯系统写入(无发起人):按钮的动作体带发起人以受信任身份写入,
    // 只看 isSystem 会让「批准 / 否决」按钮绕过归档锁。
    if (sheet?.status === 'archived' && !isSystemWrite(ctx)) {
      fail('修改加减分失败:填报单已归档,数据已锁定不可再改。', 'KPI_BONUS_ARCHIVED');
    }
    const points = toNumber(row.points) ?? 0;
    input.signed_points = row.bonus_type === 'deduct' ? -points : points;
    // 状态默认「待审批」(#37):登记表单不再让人力审核选状态,新登记一律从待审批起步。
    // 只在**输入未带 status** 时补 —— 带了状态的写入(批准 / 否决按钮、脚本、导入)行为一个字不变,
    // 合法性仍由对象上的状态机(`initialStates: ['draft']`)与下面的岗位分离判定。
    if (ctx.event === 'beforeInsert' && !input.status) input.status = 'draft';

    const rule = requiredBonusPosition(ctx.event, input, prev);
    if (rule) {
      if (!(await hasPosition(ctx, rule.position))) fail(rule.message, rule.code);
      if (rule.decision) {
        input.approved_by = actorId(ctx);
        input.approved_at = nowIso();
      }
    } else if (ctx.event === 'beforeUpdate' && prev.status === 'approved' && !isSystemWrite(ctx)) {
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
