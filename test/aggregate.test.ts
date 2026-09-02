import { describe, expect, it } from 'vitest';
import { aggregateResults, type SheetSummary } from '../src/lib/aggregate.js';

const sheets: SheetSummary[] = [
  { id: 's1', subjectId: 'bu_sales', subjectName: '市场部', subjectType: 'department', totalScore: 92, lineScoreRates: { pi1: 110 } },
  { id: 's2', subjectId: 'bu_east', subjectName: '华东分公司', subjectType: 'branch', totalScore: 85, lineScoreRates: { pi2: 90 } },
  { id: 's3', subjectId: 'bu_south', subjectName: '华南分公司', subjectType: 'branch', totalScore: 85, lineScoreRates: {} },
];
const subjects = [
  { subjectId: 'bu_sales', subjectWeight: 40, leaderId: 'u_vp', leaderName: '王总' },
  { subjectId: 'bu_east', subjectWeight: 30, leaderId: 'u_vp', leaderName: '王总' },
  { subjectId: 'bu_south', subjectWeight: 30, leaderId: 'u_vp2', leaderName: '李总' },
];

describe('aggregateResults', () => {
  it('ranks departments and branches separately, ties share rank', () => {
    const rows = aggregateResults('2026-08 月度', sheets, subjects, []);
    const dept = rows.filter((r) => r.dimension === 'department');
    const br = rows.filter((r) => r.dimension === 'branch');
    expect(dept).toHaveLength(1);
    expect(dept[0]).toMatchObject({ score: 92, weightedScore: 36.8, rank: 1 });
    expect(br.map((r) => r.rank)).toEqual([1, 1]);
  });
  it('person score = unit score × weight × coefficient + personal items', () => {
    const rows = aggregateResults('P', sheets, subjects, [
      { id: 'a1', employeeId: 'u1', employeeName: '张三', unitId: 'bu_sales', weight: 50, coefficient: 1.2, personalItems: [{ planIndicatorId: 'pi1', weight: 20 }] },
      { id: 'a2', employeeId: 'u1', employeeName: '张三', unitId: 'bu_east', weight: 50, coefficient: 1, personalItems: [] },
    ]);
    const p = rows.find((r) => r.dimension === 'person')!;
    // 92×50%×1.2 = 55.2 ; 110×20% = 22 ; 85×50%×1 = 42.5 → 119.7
    expect(p.score).toBe(119.7);
    expect(p.personId).toBe('u1');
  });
  it('leader score = weighted average of led subjects', () => {
    const rows = aggregateResults('P', sheets, subjects, []);
    const leaders = rows.filter((r) => r.dimension === 'leader');
    const vp = leaders.find((r) => r.personId === 'u_vp')!;
    // (92×40 + 85×30) / 70 = 89
    expect(vp.score).toBe(89);
    expect(vp.rank).toBe(1);
    const vp2 = leaders.find((r) => r.personId === 'u_vp2')!;
    expect(vp2.score).toBe(85);
  });
  it('leader with zero weights falls back to plain average', () => {
    const rows = aggregateResults('P', sheets, subjects.map((s) => ({ ...s, subjectWeight: 0 })), []);
    const vp = rows.find((r) => r.dimension === 'leader' && r.personId === 'u_vp')!;
    expect(vp.score).toBe(88.5);
    expect(vp.breakdown.method).toBe('average');
  });
});
