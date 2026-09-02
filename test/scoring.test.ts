import { describe, expect, it } from 'vitest';
import { computeCompletionRate, computeScore, round2 } from '../src/lib/scoring.js';

describe('completion rate', () => {
  it('positive: actual / target', () => {
    expect(computeCompletionRate(110, 100, 'positive')).toBe(110);
    expect(computeCompletionRate(33, 100, 'positive')).toBe(33);
  });
  it('negative: target / actual, zero actual hits cap', () => {
    expect(computeCompletionRate(80, 100, 'negative')).toBe(125);
    expect(computeCompletionRate(0, 100, 'negative', 120)).toBe(120);
  });
  it('returns null when it cannot be computed', () => {
    expect(computeCompletionRate(null, 100, 'positive')).toBeNull();
    expect(computeCompletionRate(10, 0, 'positive')).toBeNull();
    expect(computeCompletionRate(10, null, 'negative')).toBeNull();
  });
});

describe('linear', () => {
  const rule = { method: 'linear', direction: 'positive', capRate: 120, floorRate: 0 } as const;
  it('score = weight × clamped rate', () => {
    const r = computeScore(rule, { actual: 90, target: 100, weight: 20 });
    expect(r.completionRate).toBe(90);
    expect(r.scoreRate).toBe(90);
    expect(r.score).toBe(18);
    expect(r.trace).toContain('完成率 90%');
  });
  it('caps at capRate', () => {
    const r = computeScore(rule, { actual: 200, target: 100, weight: 10 });
    expect(r.scoreRate).toBe(120);
    expect(r.score).toBe(12);
  });
  it('floors at floorRate', () => {
    const r = computeScore({ ...rule, floorRate: 60 }, { actual: 10, target: 100, weight: 10 });
    expect(r.scoreRate).toBe(60);
    expect(r.score).toBe(6);
  });
  it('missing target → score 0 with explanation', () => {
    const r = computeScore(rule, { actual: 10, target: null, weight: 10 });
    expect(r.score).toBe(0);
    expect(r.completionRate).toBeNull();
    expect(r.trace).toContain('无法计算');
  });
});

describe('step', () => {
  const rule = {
    method: 'step',
    direction: 'positive',
    steps: [
      { min_rate: 0, max_rate: 80, score_rate: 0, label: '未达标' },
      { min_rate: 80, max_rate: 100, score_rate: 60, label: '基本达标' },
      { min_rate: 100, max_rate: null, score_rate: 100, label: '达标' },
    ],
  } as const;
  it('picks the [min, max) band', () => {
    expect(computeScore(rule, { actual: 79.99, target: 100, weight: 10 }).score).toBe(0);
    expect(computeScore(rule, { actual: 80, target: 100, weight: 10 }).score).toBe(6);
    expect(computeScore(rule, { actual: 99.99, target: 100, weight: 10 }).score).toBe(6);
    expect(computeScore(rule, { actual: 150, target: 100, weight: 10 }).score).toBe(10);
  });
  it('no band → 0', () => {
    const r = computeScore({ ...rule, steps: [{ min_rate: 100, max_rate: null, score_rate: 100 }] }, { actual: 50, target: 100, weight: 10 });
    expect(r.score).toBe(0);
    expect(r.trace).toContain('未命中');
  });
});

describe('range', () => {
  const rule = { method: 'range', direction: 'positive', capRate: 120, rangeLowerRate: 60, rangeUpperRate: 120 } as const;
  it('below lower → 0, at 100 → 100, above upper → cap', () => {
    expect(computeScore(rule, { actual: 60, target: 100, weight: 10 }).scoreRate).toBe(0);
    expect(computeScore(rule, { actual: 80, target: 100, weight: 10 }).scoreRate).toBe(50);
    expect(computeScore(rule, { actual: 100, target: 100, weight: 10 }).scoreRate).toBe(100);
    expect(computeScore(rule, { actual: 110, target: 100, weight: 10 }).scoreRate).toBe(110);
    expect(computeScore(rule, { actual: 130, target: 100, weight: 10 }).scoreRate).toBe(120);
  });
});

describe('formula', () => {
  const evaluator = (formula: string, vars: Record<string, number | null>) => {
    // minimal evaluator for tests: supports "weight * rate / 100" and "actual - target"
    if (formula === 'weight * rate / 100') return (vars.weight ?? 0) * (vars.rate ?? 0) / 100;
    if (formula === 'boom') throw new Error('bad formula');
    return Number.NaN;
  };
  it('formula returns the score directly', () => {
    const r = computeScore({ method: 'formula', direction: 'positive', formula: 'weight * rate / 100' }, { actual: 90, target: 100, weight: 20 }, evaluator);
    expect(r.score).toBe(18);
    expect(r.scoreRate).toBe(90);
  });
  it('evaluator failure → 0 with explanation, never throws', () => {
    const r = computeScore({ method: 'formula', direction: 'positive', formula: 'boom' }, { actual: 90, target: 100, weight: 20 }, evaluator);
    expect(r.score).toBe(0);
    expect(r.trace).toContain('公式求值失败');
  });
  it('missing formula → 0', () => {
    const r = computeScore({ method: 'formula', direction: 'positive', formula: null }, { actual: 1, target: 1, weight: 1 }, evaluator);
    expect(r.score).toBe(0);
  });
});

describe('round2', () => {
  it('rounds half up at two decimals', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
  });
});
