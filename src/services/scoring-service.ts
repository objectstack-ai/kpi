import { computeScore, type ScoreStep, type ScoringRule } from '../lib/scoring.js';
import { celFormulaEvaluator } from '../lib/cel.js';
import { toNumber, type Api } from '../hooks/util.js';

export interface LineLike {
  indicator?: string | null;
  scoring_method?: string | null;
  direction?: string | null;
  target_value?: unknown;
  weight?: unknown;
  actual_value?: unknown;
  adjusted_score?: unknown;
}

/** 从指标定义装配计分规则(阶梯行按需加载)。 */
export async function loadRule(api: Api, indicatorId: string | null | undefined, line: LineLike): Promise<ScoringRule> {
  const indicator = indicatorId ? await api.object('kpi_indicator').findOne({ where: { id: indicatorId } }) : null;
  const method = (line.scoring_method ?? indicator?.scoring_method ?? 'linear') as ScoringRule['method'];
  const direction = (line.direction ?? indicator?.direction ?? 'positive') as ScoringRule['direction'];
  let steps: ScoreStep[] | null = null;
  if (method === 'step' && indicatorId) {
    const rows = await api.object('kpi_indicator_step').find({ where: { indicator: indicatorId }, orderBy: [{ field: 'seq', order: 'asc' }] });
    steps = (rows ?? []).map((r: Record<string, unknown>) => ({
      min_rate: toNumber(r.min_rate) ?? 0,
      max_rate: toNumber(r.max_rate),
      score_rate: toNumber(r.score_rate) ?? 0,
      label: (r.label as string | undefined) ?? null,
    }));
  }
  return {
    method,
    direction,
    capRate: toNumber(indicator?.cap_rate),
    floorRate: toNumber(indicator?.floor_rate),
    rangeLowerRate: toNumber(indicator?.range_lower_rate),
    rangeUpperRate: toNumber(indicator?.range_upper_rate),
    steps,
    formula: (indicator?.score_formula as string | undefined) ?? null,
  };
}

/** 对一行明细计分,返回要回写的字段。 */
export async function scoreLine(api: Api, line: LineLike): Promise<Record<string, unknown>> {
  const rule = await loadRule(api, line.indicator ?? null, line);
  const result = computeScore(
    rule,
    { actual: toNumber(line.actual_value), target: toNumber(line.target_value), weight: toNumber(line.weight) },
    celFormulaEvaluator,
  );
  const adjusted = toNumber(line.adjusted_score);
  return {
    completion_rate: result.completionRate,
    score_rate: result.scoreRate,
    score: result.score,
    final_score: adjusted ?? result.score,
    calc_trace: adjusted !== null ? `${result.trace};结果调整为 ${adjusted}(以调整后得分为准)` : result.trace,
  };
}
