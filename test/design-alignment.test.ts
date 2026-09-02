import { describe, expect, it } from 'vitest';
import { BONUS_APPROVE_RULE, BONUS_REGISTER_RULE, requiredBonusPosition } from '../src/hooks/bonus.hook.js';
import { findPublishedConflict, planPeriodConflictMessage, samePeriod } from '../src/hooks/plan.hook.js';
import { adjustmentLinePatch } from '../src/hooks/adjustment.hook.js';
import { aggregateResults, type SheetSummary } from '../src/lib/aggregate.js';

/**
 * 《设计方案》V1.0 已确认口径的落地校验(第 10 章第 6 / 10 / 14 项)。
 * 三条规则各自的唯一真值都是纯函数,这里直接对函数取证,不经运行期。
 */

describe('加减分岗位职责分离(第 10 章第 6 项:人力审核提出、人力负责人审批)', () => {
  it('登记(新建)要求人力审核岗位', () => {
    expect(requiredBonusPosition('beforeInsert', { title: '重大项目中标' }, {})).toBe(BONUS_REGISTER_RULE);
    expect(BONUS_REGISTER_RULE.position).toBe('kpi_hr_reviewer');
    expect(BONUS_REGISTER_RULE.message).toContain('登记加减分失败');
  });

  it('批准 / 驳回要求人力负责人岗位 —— 人力审核因此审批不了自己登记的加减分', () => {
    expect(requiredBonusPosition('beforeUpdate', { status: 'approved' }, { status: 'draft' })).toBe(BONUS_APPROVE_RULE);
    expect(requiredBonusPosition('beforeUpdate', { status: 'rejected' }, { status: 'draft' })).toBe(BONUS_APPROVE_RULE);
    expect(BONUS_APPROVE_RULE.position).toBe('kpi_hr_head');
    expect(BONUS_APPROVE_RULE.decision).toBe(true);
  });

  it('不改状态的修改不受岗位约束(备注、依据等)', () => {
    expect(requiredBonusPosition('beforeUpdate', { reason: '补充依据' }, { status: 'draft' })).toBeNull();
    expect(requiredBonusPosition('beforeUpdate', { status: 'draft' }, { status: 'draft' })).toBeNull();
  });
});

describe('同周期唯一生效版本(第 10 章第 10 项 / 设计 5.2)', () => {
  const draft = { id: 'p_new', period_type: 'month', year: 2026, period_no: 8, status: 'draft' };
  const live = { id: 'p_live', period_type: 'month', year: 2026, period_no: 8, status: 'published', name: '2026 年 8 月 月度考核' };

  it('同一周期 = 周期类型 + 年度 + 期数三者相同(期数按数值比较)', () => {
    expect(samePeriod(draft, live)).toBe(true);
    expect(samePeriod(draft, { ...live, period_no: '8' })).toBe(true);
    expect(samePeriod(draft, { ...live, period_no: 9 })).toBe(false);
    expect(samePeriod(draft, { ...live, period_type: 'quarter' })).toBe(false);
    expect(samePeriod(draft, { ...live, year: 2025 })).toBe(false);
  });

  it('同周期已有已发布方案时,发布被挡下并点名那个生效版本', () => {
    const conflict = findPublishedConflict([live], draft);
    expect(conflict?.id).toBe('p_live');
    const message = planPeriodConflictMessage(String(conflict?.name));
    expect(message).toBe('发布失败:该考核周期已有生效版本「2026 年 8 月 月度考核」。请先关闭该版本,或改用复制出的新版本替换。');
  });

  it('已关闭 / 已归档不是生效版本,不阻断发布;草稿同样不阻断;自己不挡自己', () => {
    expect(findPublishedConflict([{ ...live, status: 'closed' }], draft)).toBeNull();
    expect(findPublishedConflict([{ ...live, status: 'archived' }], draft)).toBeNull();
    expect(findPublishedConflict([{ ...live, status: 'draft' }], draft)).toBeNull();
    expect(findPublishedConflict([{ ...live, id: 'p_new' }], draft)).toBeNull();
  });
});

describe('调整落地标记「已调整」(第 10 章第 14 项 = A / 设计 5.7)', () => {
  it('结果调整改得分并标记已调整,调整类型 = 计算结果', () => {
    expect(adjustmentLinePatch('result', 26, 'adj_1')).toEqual({
      last_adjustment: 'adj_1', is_adjusted: true, adjust_type_applied: 'result', adjusted_score: 26,
    });
  });

  it('源数据调整改实际值并同样标记已调整,调整类型 = 源数据', () => {
    expect(adjustmentLinePatch('source', 180, 'adj_2')).toEqual({
      last_adjustment: 'adj_2', is_adjusted: true, adjust_type_applied: 'source', actual_value: 180,
    });
  });

  it('计算明细 JSON 逐指标带 is_adjusted —— 部门维度与到人承接项都带', () => {
    const sheets: SheetSummary[] = [
      {
        id: 's1', subjectId: 'bu_market', subjectName: '市场部', subjectType: 'department', totalScore: 90,
        lineScoreRates: { pi1: 100, pi2: 80 },
        lines: [
          { planIndicatorId: 'pi1', indicatorName: '利润完成率', scoreRate: 100, score: 30, isAdjusted: true, adjustTypeApplied: 'result' },
          { planIndicatorId: 'pi2', indicatorName: '客户满意度', scoreRate: 80, score: 16, isAdjusted: false, adjustTypeApplied: null },
        ],
      },
    ];
    const rows = aggregateResults('2026-08 月度', sheets, [{ subjectId: 'bu_market', subjectWeight: 100 }], [
      { id: 'a1', employeeId: 'u1', employeeName: '张三', unitId: 'bu_market', weight: 100, coefficient: 1, personalItems: [{ planIndicatorId: 'pi1', weight: 20 }] },
    ]);
    const dept = rows.find((r) => r.dimension === 'department')!;
    expect(dept.breakdown.lines).toEqual([
      { plan_indicator: 'pi1', indicator_name: '利润完成率', score_rate: 100, score: 30, is_adjusted: true, adjust_type_applied: 'result' },
      { plan_indicator: 'pi2', indicator_name: '客户满意度', score_rate: 80, score: 16, is_adjusted: false, adjust_type_applied: null },
    ]);
    const person = rows.find((r) => r.dimension === 'person')!;
    const parts = person.breakdown.parts as Array<Record<string, any>>;
    expect(parts[0].items[0]).toMatchObject({ plan_indicator: 'pi1', is_adjusted: true, adjust_type_applied: 'result' });
    // 得分不因标记而变:90×100%×1 + 100%×20% = 110
    expect(person.score).toBe(110);
  });
});
