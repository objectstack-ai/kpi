import { celEngine } from '@objectstack/formula';
import type { FormulaEvaluator } from './scoring.js';

/**
 * 自定义公式求值器:用平台 CEL 引擎(与平台公式字段同一方言)求值。
 * 变量通过 scope 顶层暴露:actual / target / weight / rate / cap / floor。
 */
export const celFormulaEvaluator: FormulaEvaluator = (formula, vars) => {
  const result = celEngine.evaluate<unknown>(
    { dialect: 'cel', source: formula },
    { extra: { ...vars } },
  );
  if (!result.ok) throw new Error(result.error.message);
  const v = result.value;
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error('公式结果不是数值');
  return n;
};
