/**
 * 审核状态机 —— 流程推进口径的唯一真值(蓝图 C-2,方案分级 D-03)。
 *
 * 纯函数:输入方案的流程节点(按 seq 排序)、填报单当前状态与动作,输出目标状态、
 * 目标节点与校验结果。hook 层只负责取数、鉴权(岗位)与落库。
 *
 * 节点类型 → 填报单状态:
 *   dept_submit    → draft(填报中)
 *   branch_check   → branch_checking(分公司核对中,并行)
 *   hr_review      → hr_reviewing(人力审核中)
 *   leader_approve → leader_approving(领导审批中)
 * 最后一个节点通过 → approved;approved → archived 由归档动作完成。
 *
 * 驳回:退回**上一节点**(需求 §3);上一节点是 dept_submit 时回到 draft(重新填报)。
 */

export type StepType = 'dept_submit' | 'branch_check' | 'hr_review' | 'leader_approve';
export type SheetStatus =
  | 'draft' | 'submitted' | 'branch_checking' | 'hr_reviewing' | 'leader_approving' | 'approved' | 'archived';
export type SheetAction = 'submit' | 'approve' | 'reject' | 'archive';

export interface PlanStepDef {
  seq: number;
  step_type: StepType;
  label?: string | null;
  approver_position?: string | null;
}

export interface TransitionResult {
  ok: true;
  toStatus: SheetStatus;
  /** 目标节点序号;approved/archived 时为最后节点序号 */
  toStep: number;
  toStepDef: PlanStepDef | null;
  /** 本次动作所在节点(执行动作的节点) */
  atStepDef: PlanStepDef | null;
}

export interface TransitionError {
  ok: false;
  message: string;
}

export const STATUS_OF_STEP: Record<StepType, SheetStatus> = {
  dept_submit: 'draft',
  branch_check: 'branch_checking',
  hr_review: 'hr_reviewing',
  leader_approve: 'leader_approving',
};

export const STEP_LABEL: Record<StepType, string> = {
  dept_submit: '部门填报',
  branch_check: '分公司核对',
  hr_review: '人力审核',
  leader_approve: '领导审批',
};

export const STATUS_LABEL: Record<SheetStatus, string> = {
  draft: '填报中',
  submitted: '已提交',
  branch_checking: '分公司核对中',
  hr_reviewing: '人力审核中',
  leader_approving: '领导审批中',
  approved: '已通过',
  archived: '已归档',
};

export function sortSteps(steps: PlanStepDef[]): PlanStepDef[] {
  return [...steps].sort((a, b) => a.seq - b.seq);
}

/** 默认流程(方案未配置节点时的兜底,与需求 §3 顺序一致)。 */
export const DEFAULT_STEPS: PlanStepDef[] = [
  { seq: 1, step_type: 'dept_submit', label: '部门填报', approver_position: 'kpi_dept_reporter' },
  { seq: 2, step_type: 'branch_check', label: '分公司核对', approver_position: 'kpi_branch_checker' },
  { seq: 3, step_type: 'hr_review', label: '人力审核', approver_position: 'kpi_hr_reviewer' },
  { seq: 4, step_type: 'leader_approve', label: '领导审批', approver_position: 'kpi_exec_leader' },
];

/** 校验流程节点配置是否可用于发布。 */
export function validateSteps(steps: PlanStepDef[]): string[] {
  const errors: string[] = [];
  const sorted = sortSteps(steps);
  if (sorted.length === 0) errors.push('至少需要一个流程节点');
  if (sorted[0] && sorted[0].step_type !== 'dept_submit') errors.push('第一个节点必须是「部门填报」');
  if (sorted.filter((s) => s.step_type === 'dept_submit').length > 1) errors.push('「部门填报」节点只能有一个');
  const seqs = new Set<number>();
  for (const s of sorted) {
    if (seqs.has(s.seq)) errors.push(`节点顺序 ${s.seq} 重复`);
    seqs.add(s.seq);
  }
  return errors;
}

/** 状态对应的节点序号(当前所在节点)。 */
export function stepIndexForStatus(steps: PlanStepDef[], status: SheetStatus): number {
  const sorted = sortSteps(steps);
  if (status === 'draft') return sorted[0]?.seq ?? 1;
  if (status === 'submitted') return sorted[0]?.seq ?? 1;
  if (status === 'approved' || status === 'archived') return sorted[sorted.length - 1]?.seq ?? 1;
  const found = sorted.find((s) => STATUS_OF_STEP[s.step_type] === status);
  return found?.seq ?? sorted[0]?.seq ?? 1;
}

/** 计算动作后的目标状态。 */
export function transition(
  stepsInput: PlanStepDef[],
  fromStatus: SheetStatus,
  action: SheetAction,
): TransitionResult | TransitionError {
  const steps = sortSteps(stepsInput.length ? stepsInput : DEFAULT_STEPS);
  const last = steps[steps.length - 1]!;

  const stepAt = (seq: number) => steps.find((s) => s.seq === seq) ?? null;
  const nextAfter = (seq: number) => steps.find((s) => s.seq > seq) ?? null;
  const prevBefore = (seq: number) => [...steps].reverse().find((s) => s.seq < seq) ?? null;

  if (action === 'archive') {
    if (fromStatus !== 'approved') return { ok: false, message: `只有「已通过」的填报单才能归档,当前状态为「${STATUS_LABEL[fromStatus]}」。` };
    return { ok: true, toStatus: 'archived', toStep: last.seq, toStepDef: last, atStepDef: last };
  }

  if (action === 'submit') {
    if (fromStatus !== 'draft') return { ok: false, message: `只有「填报中」的填报单才能提交,当前状态为「${STATUS_LABEL[fromStatus]}」。` };
    const first = steps[0]!;
    const next = nextAfter(first.seq);
    if (!next) return { ok: true, toStatus: 'approved', toStep: first.seq, toStepDef: first, atStepDef: first };
    return { ok: true, toStatus: STATUS_OF_STEP[next.step_type], toStep: next.seq, toStepDef: next, atStepDef: first };
  }

  // approve / reject:必须处于某个审核节点
  if (fromStatus === 'draft' || fromStatus === 'approved' || fromStatus === 'archived') {
    return { ok: false, message: `当前状态「${STATUS_LABEL[fromStatus]}」不能执行${action === 'approve' ? '审核通过' : '驳回'}。` };
  }
  const curSeq = fromStatus === 'submitted' ? (nextAfter(steps[0]!.seq)?.seq ?? steps[0]!.seq) : stepIndexForStatus(steps, fromStatus);
  const cur = stepAt(curSeq);
  if (!cur) return { ok: false, message: '当前状态与方案流程节点不匹配,请联系管理员核对方案流程配置。' };

  if (action === 'approve') {
    const next = nextAfter(cur.seq);
    if (!next) return { ok: true, toStatus: 'approved', toStep: cur.seq, toStepDef: cur, atStepDef: cur };
    return { ok: true, toStatus: STATUS_OF_STEP[next.step_type], toStep: next.seq, toStepDef: next, atStepDef: cur };
  }

  // reject → 上一节点
  const prev = prevBefore(cur.seq);
  if (!prev) return { ok: false, message: '当前已是第一个审核节点之前,无法再驳回。' };
  return { ok: true, toStatus: STATUS_OF_STEP[prev.step_type], toStep: prev.seq, toStepDef: prev, atStepDef: cur };
}

/** 某状态下允许执行动作的岗位(取该状态对应节点的审核岗位;draft 取部门填报节点)。 */
export function requiredPositionFor(stepsInput: PlanStepDef[], status: SheetStatus, action: SheetAction): string | null {
  const steps = sortSteps(stepsInput.length ? stepsInput : DEFAULT_STEPS);
  if (action === 'archive') return 'kpi_hr_reviewer';
  if (action === 'submit') return steps[0]?.approver_position ?? 'kpi_dept_reporter';
  const seq = status === 'submitted' ? (steps.find((s) => s.seq > steps[0]!.seq)?.seq ?? steps[0]!.seq) : stepIndexForStatus(steps, status);
  return steps.find((s) => s.seq === seq)?.approver_position ?? null;
}
