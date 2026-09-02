/**
 * 结果汇总引擎 —— 四维汇总口径的唯一真值(蓝图 C-6)。纯函数。
 * 口径依据《设计方案》V1.0 第 8 章表 6(客户 2026-09-02 确认),口径改动只改本文件。
 *
 * - 部门 / 分公司:填报单最终得分(指标得分合计 + 已批准加减分),按主体类型分维度,组内排名;
 * - 到人:个人得分 = Σ(所属板块得分 × 分工权重% × 个人系数)+ Σ(承接项得分率% × 承接权重%)
 *   ——承接项得分率取该下达指标在主体填报单里的得分率;
 * - 分管领导:分管主体的最终得分按主体权重加权平均(权重全 0 时算术平均,表 7 第 7 项)。
 *
 * 计算明细(breakdown)按指标逐条给出得分率、得分与「已调整」标记(第 10 章第 14 项),
 * 让结果能钻取回是哪一行被调整过。
 */

import { round2 } from './scoring.js';

/** 填报明细的一行,进入结果的计算明细 JSON(带「已调整」标记)。 */
export interface SheetLineSummary {
  planIndicatorId: string;
  indicatorName?: string | null;
  scoreRate: number;
  score: number;
  isAdjusted: boolean;
  /** 调整类型:source(源数据)/ result(计算结果);未调整为 null。 */
  adjustTypeApplied?: string | null;
}

export interface SheetSummary {
  id: string;
  subjectId: string;
  subjectName?: string | null;
  subjectType: 'department' | 'branch' | string;
  totalScore: number;
  /** 明细:plan_indicator id → 得分率(%) */
  lineScoreRates: Record<string, number>;
  /** 逐指标明细;缺省时计算明细里不带指标行(得分不受影响)。 */
  lines?: SheetLineSummary[];
}

export interface SubjectDef {
  subjectId: string;
  subjectWeight: number;
  leaderId?: string | null;
  leaderName?: string | null;
}

export interface AssignmentDef {
  id: string;
  employeeId: string;
  employeeName?: string | null;
  unitId: string;
  weight: number;
  coefficient: number;
  personalItems: Array<{ planIndicatorId: string; weight: number }>;
}

export interface ResultRow {
  dimension: 'department' | 'branch' | 'person' | 'leader';
  name: string;
  unitId?: string | null;
  personId?: string | null;
  sheetId?: string | null;
  score: number;
  weightedScore: number;
  rank: number;
  breakdown: Record<string, unknown>;
}

function rankRows(rows: ResultRow[]): ResultRow[] {
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  let rank = 0;
  let prev: number | null = null;
  sorted.forEach((r, i) => {
    if (prev === null || r.score !== prev) rank = i + 1;
    r.rank = rank;
    prev = r.score;
  });
  return sorted;
}

export function aggregateResults(
  planName: string,
  sheets: SheetSummary[],
  subjects: SubjectDef[],
  assignments: AssignmentDef[],
): ResultRow[] {
  const bySubject = new Map(sheets.map((s) => [s.subjectId, s]));
  const subjectWeight = new Map(subjects.map((s) => [s.subjectId, s.subjectWeight]));

  // 部门 / 分公司
  const unitRows: ResultRow[] = sheets.map((s) => ({
    dimension: s.subjectType === 'branch' ? 'branch' : 'department',
    name: `${planName} · ${s.subjectName ?? s.subjectId}`,
    unitId: s.subjectId,
    sheetId: s.id,
    score: round2(s.totalScore),
    weightedScore: round2((s.totalScore * (subjectWeight.get(s.subjectId) ?? 0)) / 100),
    rank: 0,
    breakdown: {
      total_score: s.totalScore,
      subject_weight: subjectWeight.get(s.subjectId) ?? 0,
      lines: (s.lines ?? []).map((l) => ({
        plan_indicator: l.planIndicatorId,
        indicator_name: l.indicatorName ?? null,
        score_rate: l.scoreRate,
        score: l.score,
        is_adjusted: l.isAdjusted,
        adjust_type_applied: l.adjustTypeApplied ?? null,
      })),
    },
  }));
  const deptRows = rankRows(unitRows.filter((r) => r.dimension === 'department'));
  const branchRows = rankRows(unitRows.filter((r) => r.dimension === 'branch'));

  // 到人
  const byEmployee = new Map<string, { name: string | null; parts: Array<Record<string, unknown>>; score: number }>();
  for (const a of assignments) {
    const sheet = bySubject.get(a.unitId);
    const unitScore = sheet?.totalScore ?? 0;
    const fromUnit = round2((unitScore * a.weight) / 100 * a.coefficient);
    let fromItems = 0;
    const items: Array<Record<string, unknown>> = [];
    for (const it of a.personalItems) {
      const rate = sheet?.lineScoreRates[it.planIndicatorId] ?? 0;
      const s = round2((rate * it.weight) / 100);
      const src = sheet?.lines?.find((l) => l.planIndicatorId === it.planIndicatorId);
      fromItems += s;
      items.push({
        plan_indicator: it.planIndicatorId,
        score_rate: rate,
        weight: it.weight,
        score: s,
        is_adjusted: src?.isAdjusted ?? false,
        adjust_type_applied: src?.adjustTypeApplied ?? null,
      });
    }
    const entry = byEmployee.get(a.employeeId) ?? { name: a.employeeName ?? null, parts: [], score: 0 };
    entry.parts.push({ unit: a.unitId, unit_score: unitScore, weight: a.weight, coefficient: a.coefficient, from_unit: fromUnit, items, from_items: round2(fromItems) });
    entry.score = round2(entry.score + fromUnit + fromItems);
    byEmployee.set(a.employeeId, entry);
  }
  const personRows = rankRows(
    [...byEmployee.entries()].map(([employeeId, e]) => ({
      dimension: 'person' as const,
      name: `${planName} · ${e.name ?? employeeId}`,
      personId: employeeId,
      score: e.score,
      weightedScore: e.score,
      rank: 0,
      breakdown: { parts: e.parts },
    })),
  );

  // 分管领导
  const byLeader = new Map<string, { name: string | null; items: Array<{ subjectId: string; score: number; weight: number }> }>();
  for (const sub of subjects) {
    if (!sub.leaderId) continue;
    const sheet = bySubject.get(sub.subjectId);
    if (!sheet) continue;
    const entry = byLeader.get(sub.leaderId) ?? { name: sub.leaderName ?? null, items: [] };
    entry.items.push({ subjectId: sub.subjectId, score: sheet.totalScore, weight: sub.subjectWeight });
    byLeader.set(sub.leaderId, entry);
  }
  const leaderRows = rankRows(
    [...byLeader.entries()].map(([leaderId, e]) => {
      const totalWeight = e.items.reduce((s, i) => s + i.weight, 0);
      const score = totalWeight > 0
        ? e.items.reduce((s, i) => s + i.score * i.weight, 0) / totalWeight
        : e.items.reduce((s, i) => s + i.score, 0) / e.items.length;
      return {
        dimension: 'leader' as const,
        name: `${planName} · ${e.name ?? leaderId}`,
        personId: leaderId,
        score: round2(score),
        weightedScore: round2(score),
        rank: 0,
        breakdown: { subjects: e.items, method: totalWeight > 0 ? 'weighted_average' : 'average' },
      };
    }),
  );

  return [...deptRows, ...branchRows, ...personRows, ...leaderRows];
}
