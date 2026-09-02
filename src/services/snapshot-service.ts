import { createHash } from 'node:crypto';
import { nowIso, toNumber, type Api } from '../hooks/util.js';

/** 为一张已通过的填报单生成不可变归档快照(蓝图 C-5)。 */
export async function createSnapshot(api: Api, sheetId: string, actor: string | null): Promise<string> {
  const sheet = await api.object('kpi_entry_sheet').findOne({ where: { id: sheetId } });
  if (!sheet) throw new Error(`sheet ${sheetId} not found`);
  const lines = await api.object('kpi_entry_line').find({ where: { sheet: sheetId }, orderBy: [{ field: 'indicator_name', order: 'asc' }] });
  const bonuses = await api.object('kpi_bonus').find({ where: { sheet: sheetId } });
  const reviews = await api.object('kpi_review_record').find({ where: { sheet: sheetId }, orderBy: [{ field: 'acted_at', order: 'asc' }] });
  const adjustments = await api.object('kpi_adjustment').find({ where: { sheet: sheetId } });

  const pick = (row: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.map((k) => [k, row[k] ?? null]));
  const payload = {
    sheet: pick(sheet, ['id', 'name', 'plan', 'subject', 'subject_type', 'status', 'submitted_at', 'submitted_by', 'approved_at', 'approved_by', 'indicator_score', 'bonus_total', 'total_score', 'weight_total']),
    lines: lines.map((l: Record<string, unknown>) => pick(l, ['id', 'plan_indicator', 'indicator', 'indicator_name', 'unit', 'direction', 'scoring_method', 'target_value', 'weight', 'actual_value', 'completion_rate', 'score_rate', 'score', 'adjusted_score', 'final_score', 'calc_trace', 'remark'])),
    bonuses: bonuses.map((b: Record<string, unknown>) => pick(b, ['id', 'title', 'bonus_type', 'points', 'signed_points', 'reason', 'status', 'approved_by', 'approved_at'])),
    adjustments: adjustments.map((a: Record<string, unknown>) => pick(a, ['id', 'name', 'line', 'adjust_type', 'old_value', 'new_value', 'reason', 'status', 'requested_by', 'decided_by', 'decided_at', 'decision_reason', 'applied_at'])),
    reviews: reviews.map((r: Record<string, unknown>) => pick(r, ['id', 'name', 'action', 'step_label', 'from_status', 'to_status', 'actor', 'reason', 'acted_at'])),
    archived_at: nowIso(),
  };
  const json = JSON.stringify(payload);
  const checksum = createHash('sha256').update(json).digest('hex');
  const indicatorScore = lines.reduce((s: number, l: Record<string, unknown>) => s + (toNumber(l.final_score) ?? 0), 0);
  const bonusTotal = bonuses
    .filter((b: Record<string, unknown>) => b.status === 'approved')
    .reduce((s: number, b: Record<string, unknown>) => s + (toNumber(b.signed_points) ?? 0), 0);
  const created = await api.object('kpi_snapshot').insert({
    name: `${String(sheet.name ?? sheetId)} · 归档快照`,
    plan: sheet.plan,
    sheet: sheetId,
    subject: sheet.subject,
    total_score: Math.round((indicatorScore + bonusTotal) * 100) / 100,
    payload,
    checksum,
    archived_by: actor,
    archived_at: payload.archived_at,
  });
  return String(created?.id ?? '');
}
