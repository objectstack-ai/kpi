import { describe, expect, it } from 'vitest';
import { celFormulaEvaluator } from '../src/lib/cel.js';
import { computeScore } from '../src/lib/scoring.js';

describe('celFormulaEvaluator', () => {
  it('evaluates arithmetic over the exposed variables', () => {
    expect(celFormulaEvaluator('weight * rate / 100.0', { actual: 90, target: 100, weight: 20, rate: 90, cap: 120, floor: 0 })).toBe(18);
  });
  it('supports conditionals (e.g. threshold rules)', () => {
    const f = 'rate >= 100.0 ? weight * 1.0 : weight * 0.5';
    expect(celFormulaEvaluator(f, { actual: 100, target: 100, weight: 10, rate: 100, cap: 120, floor: 0 })).toBe(10);
    expect(celFormulaEvaluator(f, { actual: 50, target: 100, weight: 10, rate: 50, cap: 120, floor: 0 })).toBe(5);
  });
  it('throws on a broken expression and computeScore reports it', () => {
    expect(() => celFormulaEvaluator('weight *', { weight: 1 })).toThrow();
    const r = computeScore({ method: 'formula', direction: 'positive', formula: 'weight *' }, { actual: 1, target: 1, weight: 1 }, celFormulaEvaluator);
    expect(r.score).toBe(0);
    expect(r.trace).toContain('公式求值失败');
  });
});
