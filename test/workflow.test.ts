import { describe, expect, it } from 'vitest';
import { DEFAULT_STEPS, requiredPositionFor, transition, validateSteps, type PlanStepDef } from '../src/lib/workflow.js';

describe('transition — default 4-step flow', () => {
  it('submit: draft → branch_checking', () => {
    const r = transition(DEFAULT_STEPS, 'draft', 'submit');
    expect(r.ok && r.toStatus).toBe('branch_checking');
  });
  it('approve walks branch_checking → hr_reviewing → leader_approving → approved', () => {
    let r = transition(DEFAULT_STEPS, 'branch_checking', 'approve');
    expect(r.ok && r.toStatus).toBe('hr_reviewing');
    r = transition(DEFAULT_STEPS, 'hr_reviewing', 'approve');
    expect(r.ok && r.toStatus).toBe('leader_approving');
    r = transition(DEFAULT_STEPS, 'leader_approving', 'approve');
    expect(r.ok && r.toStatus).toBe('approved');
  });
  it('reject goes back exactly one node', () => {
    expect(transition(DEFAULT_STEPS, 'leader_approving', 'reject')).toMatchObject({ ok: true, toStatus: 'hr_reviewing' });
    expect(transition(DEFAULT_STEPS, 'hr_reviewing', 'reject')).toMatchObject({ ok: true, toStatus: 'branch_checking' });
    expect(transition(DEFAULT_STEPS, 'branch_checking', 'reject')).toMatchObject({ ok: true, toStatus: 'draft' });
  });
  it('archive only from approved', () => {
    expect(transition(DEFAULT_STEPS, 'approved', 'archive')).toMatchObject({ ok: true, toStatus: 'archived' });
    expect(transition(DEFAULT_STEPS, 'hr_reviewing', 'archive').ok).toBe(false);
  });
  it('illegal actions are refused with a business message', () => {
    const r = transition(DEFAULT_STEPS, 'draft', 'approve');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain('填报中');
    expect(transition(DEFAULT_STEPS, 'archived', 'submit').ok).toBe(false);
  });
});

describe('transition — configurable flow (no branch check, no leader)', () => {
  const steps: PlanStepDef[] = [
    { seq: 1, step_type: 'dept_submit', approver_position: 'kpi_dept_reporter' },
    { seq: 2, step_type: 'hr_review', approver_position: 'kpi_hr_reviewer' },
  ];
  it('submit → hr_reviewing, approve → approved, reject → draft', () => {
    expect(transition(steps, 'draft', 'submit')).toMatchObject({ ok: true, toStatus: 'hr_reviewing' });
    expect(transition(steps, 'hr_reviewing', 'approve')).toMatchObject({ ok: true, toStatus: 'approved' });
    expect(transition(steps, 'hr_reviewing', 'reject')).toMatchObject({ ok: true, toStatus: 'draft' });
  });
  it('single-node flow approves on submit', () => {
    expect(transition([steps[0]!], 'draft', 'submit')).toMatchObject({ ok: true, toStatus: 'approved' });
  });
  it('unsorted seq input is sorted', () => {
    expect(transition([steps[1]!, steps[0]!], 'draft', 'submit')).toMatchObject({ ok: true, toStatus: 'hr_reviewing' });
  });
});

describe('requiredPositionFor', () => {
  it('maps status to the node approver position', () => {
    expect(requiredPositionFor(DEFAULT_STEPS, 'draft', 'submit')).toBe('kpi_dept_reporter');
    expect(requiredPositionFor(DEFAULT_STEPS, 'hr_reviewing', 'approve')).toBe('kpi_hr_reviewer');
    expect(requiredPositionFor(DEFAULT_STEPS, 'leader_approving', 'reject')).toBe('kpi_exec_leader');
    expect(requiredPositionFor(DEFAULT_STEPS, 'approved', 'archive')).toBe('kpi_hr_reviewer');
  });
});

describe('validateSteps', () => {
  it('accepts the default flow', () => {
    expect(validateSteps(DEFAULT_STEPS)).toEqual([]);
  });
  it('rejects empty, wrong first node, duplicate seq', () => {
    expect(validateSteps([])).toContain('至少需要一个流程节点');
    expect(validateSteps([{ seq: 1, step_type: 'hr_review' }])).toContain('第一个节点必须是「部门填报」');
    expect(validateSteps([{ seq: 1, step_type: 'dept_submit' }, { seq: 1, step_type: 'hr_review' }])).toContain('节点顺序 1 重复');
  });
});
