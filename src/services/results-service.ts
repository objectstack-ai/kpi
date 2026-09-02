import { aggregateResults, type AssignmentDef, type SheetSummary, type SubjectDef } from '../lib/aggregate.js';
import { nowIso, toNumber, type Api } from '../hooks/util.js';

/**
 * 重新生成某方案的四维考核结果(蓝图 C-6)。只统计「已通过 / 已归档」的填报单;
 * 先删后插,结果对象由系统独占写入。
 */
export async function regenerateResults(api: Api, planId: string): Promise<number> {
  const plan = await api.object('kpi_plan').findOne({ where: { id: planId } });
  if (!plan) return 0;
  const planName = String(plan.name ?? planId);

  const sheets = await api.object('kpi_entry_sheet').find({ where: { plan: planId, status: { $in: ['approved', 'archived'] } } });
  const subjectsRaw = await api.object('kpi_plan_subject').find({ where: { plan: planId } });
  const assignmentsRaw = await api.object('kpi_staff_assignment').find({ where: { plan: planId } });

  const unitIds = new Set<string>();
  for (const s of sheets) unitIds.add(String(s.subject));
  const unitNames = new Map<string, string>();
  for (const id of unitIds) {
    const bu = await api.object('sys_business_unit').findOne({ where: { id } });
    unitNames.set(id, String(bu?.name ?? id));
  }
  const userName = async (id: string | null | undefined): Promise<string | null> => {
    if (!id) return null;
    const u = await api.object('sys_user').findOne({ where: { id } });
    return (u?.name as string | undefined) ?? (u?.email as string | undefined) ?? null;
  };

  const sheetSummaries: SheetSummary[] = [];
  for (const s of sheets) {
    const lines = await api.object('kpi_entry_line').find({ where: { sheet: s.id } });
    const lineScoreRates: Record<string, number> = {};
    for (const l of lines) {
      if (l.plan_indicator) lineScoreRates[String(l.plan_indicator)] = toNumber(l.score_rate) ?? 0;
    }
    const indicatorScore = lines.reduce((sum: number, l: Record<string, unknown>) => sum + (toNumber(l.final_score) ?? 0), 0);
    const bonuses = await api.object('kpi_bonus').find({ where: { sheet: s.id, status: 'approved' } });
    const bonusTotal = bonuses.reduce((sum: number, b: Record<string, unknown>) => sum + (toNumber(b.signed_points) ?? 0), 0);
    sheetSummaries.push({
      id: String(s.id),
      subjectId: String(s.subject),
      subjectName: unitNames.get(String(s.subject)) ?? null,
      subjectType: String(s.subject_type ?? 'department'),
      totalScore: Math.round((indicatorScore + bonusTotal) * 100) / 100,
      lineScoreRates,
    });
  }

  const subjects: SubjectDef[] = [];
  for (const sub of subjectsRaw) {
    subjects.push({
      subjectId: String(sub.subject),
      subjectWeight: toNumber(sub.subject_weight) ?? 0,
      leaderId: (sub.leader as string | undefined) ?? null,
      leaderName: await userName(sub.leader as string | undefined),
    });
  }

  const assignments: AssignmentDef[] = [];
  for (const a of assignmentsRaw) {
    const items = await api.object('kpi_personal_item').find({ where: { assignment: a.id } });
    assignments.push({
      id: String(a.id),
      employeeId: String(a.employee),
      employeeName: await userName(a.employee as string | undefined),
      unitId: String(a.unit),
      weight: toNumber(a.weight) ?? 0,
      coefficient: toNumber(a.coefficient) ?? 1,
      personalItems: items.map((it: Record<string, unknown>) => ({ planIndicatorId: String(it.plan_indicator), weight: toNumber(it.weight) ?? 0 })),
    });
  }

  const rows = aggregateResults(planName, sheetSummaries, subjects, assignments);
  const results = api.object('kpi_result');
  await results.delete({ where: { plan: planId }, multi: true });
  const at = nowIso();
  for (const r of rows) {
    await results.insert({
      name: r.name,
      plan: planId,
      dimension: r.dimension,
      unit: r.unitId ?? null,
      person: r.personId ?? null,
      sheet: r.sheetId ?? null,
      score: r.score,
      weighted_score: r.weightedScore,
      rank: r.rank,
      breakdown: r.breakdown,
      generated_at: at,
    });
  }
  return rows.length;
}
