/**
 * 计分引擎 —— 全系统得分口径的唯一真值(蓝图 C-1,方案分级 D-02)。
 *
 * 纯函数,不依赖平台运行时,便于单元测试与逐条复核。四种计分方式:
 *
 * - linear  完成率线性:得分率 = clamp(完成率, 保底, 封顶)
 * - step    阶梯计分:完成率落在 [min_rate, max_rate) 的阶梯行,取该行得分率;无命中 = 0
 * - range   区间插值:完成率 ≤ 下限 → 0;≥ 上限 → 封顶;两者之间按 下限→0、100%→100%、
 *           上限→封顶 三点折线插值(下限=100 时退化为 100%→100% 与 上限→封顶 两点)
 * - formula 自定义公式(平台 CEL):变量 actual / target / weight / rate(完成率%,已按方向
 *           换算)/ cap / floor;表达式必须返回**得分**(不是得分率)
 *
 * 完成率(%)按指标方向计算:
 * - 越高越好:actual / target × 100;
 * - 越低越好:target / actual × 100(actual 为 0 且 target > 0 时按封顶处理)。
 * 目标值为 0 或空时无法计算完成率:linear / step / range 得分为 0 并在 trace 里说明;
 * formula 仍可用 actual / target 直接算。
 *
 * 指标得分 = 权重 × 得分率 / 100。所有金额、比例保留 2 位小数(四舍五入,银行家舍入不采用)。
 */

export type Direction = 'positive' | 'negative';
export type ScoringMethod = 'linear' | 'step' | 'range' | 'formula';

export interface ScoreStep {
  min_rate: number;
  max_rate?: number | null;
  score_rate: number;
  label?: string | null;
}

export interface ScoringRule {
  method: ScoringMethod;
  direction: Direction;
  /** 完成率封顶(%),默认 120 */
  capRate?: number | null;
  /** 完成率保底(%),默认 0 */
  floorRate?: number | null;
  /** 区间插值下限完成率(%),默认 60 */
  rangeLowerRate?: number | null;
  /** 区间插值上限完成率(%),默认 = capRate */
  rangeUpperRate?: number | null;
  steps?: readonly ScoreStep[] | null;
  formula?: string | null;
}

export interface ScoringInput {
  actual: number | null | undefined;
  target: number | null | undefined;
  /** 权重(%) */
  weight: number | null | undefined;
}

export interface ScoringResult {
  /** 完成率(%);无法计算时为 null */
  completionRate: number | null;
  /** 得分率(%) */
  scoreRate: number;
  /** 指标得分 = 权重 × 得分率 / 100 */
  score: number;
  /** 人类可读的计算说明(供逐条复核) */
  trace: string;
}

/** 公式求值器注入点:由 hook 层用平台 CEL 引擎实现;单元测试可注入简单实现。 */
export type FormulaEvaluator = (formula: string, vars: Record<string, number | null>) => number;

export const DEFAULT_CAP_RATE = 120;
export const DEFAULT_FLOOR_RATE = 0;
export const DEFAULT_RANGE_LOWER_RATE = 60;

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function num(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** 完成率(%),按指标方向换算;无法计算返回 null。 */
export function computeCompletionRate(
  actual: number | null | undefined,
  target: number | null | undefined,
  direction: Direction,
  capRate = DEFAULT_CAP_RATE,
): number | null {
  const a = num(actual);
  const t = num(target);
  if (a === null || t === null) return null;
  if (direction === 'positive') {
    if (t === 0) return null;
    return round2((a / t) * 100);
  }
  // negative: 越低越好
  if (t <= 0) return null;
  if (a <= 0) return round2(capRate);
  return round2((t / a) * 100);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function stepScoreRate(rate: number, steps: readonly ScoreStep[]): { scoreRate: number; hit: ScoreStep | null } {
  const sorted = [...steps].sort((x, y) => x.min_rate - y.min_rate);
  for (const s of sorted) {
    const upper = s.max_rate == null ? Number.POSITIVE_INFINITY : s.max_rate;
    if (rate >= s.min_rate && rate < upper) return { scoreRate: s.score_rate, hit: s };
  }
  return { scoreRate: 0, hit: null };
}

function rangeScoreRate(rate: number, lower: number, upper: number, cap: number): number {
  if (rate <= lower) return 0;
  if (rate >= upper) return cap;
  // 三点折线:(lower, 0) → (100, 100) → (upper, cap);lower ≥ 100 时退化为两点
  if (lower < 100 && rate <= 100) {
    return ((rate - lower) / (100 - lower)) * 100;
  }
  const from = lower < 100 ? 100 : lower;
  const fromRate = lower < 100 ? 100 : 0;
  if (upper === from) return cap;
  return fromRate + ((rate - from) / (upper - from)) * (cap - fromRate);
}

export function computeScore(rule: ScoringRule, input: ScoringInput, evaluator?: FormulaEvaluator): ScoringResult {
  const weight = num(input.weight) ?? 0;
  const cap = num(rule.capRate) ?? DEFAULT_CAP_RATE;
  const floor = num(rule.floorRate) ?? DEFAULT_FLOOR_RATE;
  const rate = computeCompletionRate(input.actual, input.target, rule.direction, cap);
  const traceHead = `实际 ${fmt(input.actual)} / 目标 ${fmt(input.target)}(${rule.direction === 'positive' ? '越高越好' : '越低越好'})→ 完成率 ${rate === null ? '无法计算' : rate + '%'};权重 ${weight}%`;

  if (rule.method === 'formula') {
    if (!rule.formula || !evaluator) {
      return { completionRate: rate, scoreRate: 0, score: 0, trace: `${traceHead};公式缺失或求值器不可用,得分 0` };
    }
    let value: number;
    try {
      value = evaluator(rule.formula, {
        actual: num(input.actual),
        target: num(input.target),
        weight,
        rate,
        cap,
        floor,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { completionRate: rate, scoreRate: 0, score: 0, trace: `${traceHead};公式求值失败(${msg}),得分 0` };
    }
    const score = Number.isFinite(value) ? round2(Math.max(0, value)) : 0;
    const scoreRate = weight > 0 ? round2((score / weight) * 100) : 0;
    return { completionRate: rate, scoreRate, score, trace: `${traceHead};公式 ${rule.formula} → 得分 ${score}` };
  }

  if (rate === null) {
    return { completionRate: null, scoreRate: 0, score: 0, trace: `${traceHead};完成率无法计算(目标值为空或 0,或实际值为空),得分 0` };
  }

  let scoreRate: number;
  let how: string;
  switch (rule.method) {
    case 'linear': {
      scoreRate = clamp(rate, floor, cap);
      how = `线性:得分率 = 完成率限定在 [${floor}%, ${cap}%] = ${round2(scoreRate)}%`;
      break;
    }
    case 'step': {
      const steps = rule.steps ?? [];
      const r = stepScoreRate(rate, steps);
      scoreRate = r.scoreRate;
      how = r.hit
        ? `阶梯:命中「${r.hit.label ?? `${r.hit.min_rate}%~${r.hit.max_rate ?? '∞'}`}」得分率 ${scoreRate}%`
        : `阶梯:未命中任何区间(共 ${steps.length} 段),得分率 0%`;
      break;
    }
    case 'range': {
      const lower = num(rule.rangeLowerRate) ?? DEFAULT_RANGE_LOWER_RATE;
      const upper = num(rule.rangeUpperRate) ?? cap;
      scoreRate = rangeScoreRate(rate, lower, upper, cap);
      how = `区间插值:下限 ${lower}% → 0,100% → 100%,上限 ${upper}% → ${cap}%;得分率 ${round2(scoreRate)}%`;
      break;
    }
    default: {
      scoreRate = 0;
      how = `未知计分方式 ${String(rule.method)},得分率 0%`;
    }
  }
  scoreRate = round2(scoreRate);
  const score = round2((weight * scoreRate) / 100);
  return { completionRate: rate, scoreRate, score, trace: `${traceHead};${how};得分 = ${weight}% × ${scoreRate}% = ${score}` };
}

function fmt(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? String(v) : '空';
}
