import { defineAction } from '@objectstack/spec/ui';

/**
 * 按钮全部是「薄」script action:只改一个字段(或写入待执行动作),规则全在 hook。
 * `has()` 守卫列表行的稀疏投影(列表未投影 status 列时谓词不报错、按钮不消失)。
 */
const rec = (obj: string) =>
  "var id = ctx.recordId || (ctx.record && ctx.record.id) || input.recordId;" +
  `if (!id) throw new Error('未选中记录,请刷新后重试。');` +
  `var repo = ctx.api.object('${obj}');`;

const WRITE = { language: 'js' as const, capabilities: ['api.write' as const] };

// ── 填报单 ──────────────────────────────────────────────────────────────────
export const SheetSubmitAction = defineAction({
  name: 'kpi_sheet_submit',
  label: '提交填报',
  icon: 'send',
  objectName: 'kpi_entry_sheet',
  type: 'script',
  body: { ...WRITE, source: rec('kpi_entry_sheet') + "await repo.update({ id: id, pending_action: 'submit' }); return { ok: true };" },
  confirmText: '提交后填报数据将冻结,进入核对与审核流程。确认提交?',
  successMessage: '填报单已提交,进入核对与审核流程。',
  visible: "has(record.status) && record.status == 'draft'",
  locations: ['record_header', 'list_item'],
  refreshAfter: true,
});

export const SheetApproveAction = defineAction({
  name: 'kpi_sheet_approve',
  label: '审核通过',
  icon: 'check-circle',
  objectName: 'kpi_entry_sheet',
  type: 'script',
  params: [{ name: 'reason', type: 'textarea', label: '审核意见(选填)' }],
  body: { ...WRITE, source: rec('kpi_entry_sheet') + "await repo.update({ id: id, pending_action: 'approve', action_reason: input.reason || null }); return { ok: true };" },
  successMessage: '已审核通过,流程进入下一节点。',
  visible: "has(record.status) && (record.status == 'branch_checking' || record.status == 'hr_reviewing' || record.status == 'leader_approving' || record.status == 'submitted')",
  locations: ['record_header', 'list_item'],
  refreshAfter: true,
});

export const SheetRejectAction = defineAction({
  name: 'kpi_sheet_reject',
  label: '驳回',
  icon: 'undo-2',
  objectName: 'kpi_entry_sheet',
  type: 'script',
  variant: 'danger',
  params: [{ name: 'reason', type: 'textarea', label: '驳回原因', required: true }],
  body: { ...WRITE, source: rec('kpi_entry_sheet') + "if (!input.reason || !String(input.reason).trim()) throw new Error('驳回失败:驳回原因不能为空。请填写原因后再驳回。');" + "await repo.update({ id: id, pending_action: 'reject', action_reason: input.reason }); return { ok: true };" },
  successMessage: '已驳回,填报单退回上一节点。',
  visible: "has(record.status) && (record.status == 'branch_checking' || record.status == 'hr_reviewing' || record.status == 'leader_approving' || record.status == 'submitted')",
  locations: ['record_header', 'list_item'],
  refreshAfter: true,
});

export const SheetArchiveAction = defineAction({
  name: 'kpi_sheet_archive',
  label: '归档',
  icon: 'archive',
  objectName: 'kpi_entry_sheet',
  type: 'script',
  body: { ...WRITE, source: rec('kpi_entry_sheet') + "await repo.update({ id: id, pending_action: 'archive' }); return { ok: true };" },
  confirmText: '归档后将生成不可变快照,数据锁定不可再改。确认归档?',
  successMessage: '已归档并生成快照。',
  visible: "has(record.status) && record.status == 'approved'",
  locations: ['record_header', 'list_item'],
  refreshAfter: true,
});

// ── 核对任务 ────────────────────────────────────────────────────────────────
export const CheckConfirmAction = defineAction({
  name: 'kpi_check_confirm',
  label: '确认无误',
  icon: 'check',
  objectName: 'kpi_check_task',
  type: 'script',
  params: [{ name: 'comment', type: 'textarea', label: '核对意见(选填)' }],
  body: { ...WRITE, source: rec('kpi_check_task') + "await repo.update({ id: id, status: 'confirmed', comment: input.comment || null }); return { ok: true };" },
  successMessage: '已确认核对无误。',
  visible: "has(record.status) && record.status != 'confirmed'",
  locations: ['record_header', 'list_item'],
  refreshAfter: true,
});

export const CheckDisputeAction = defineAction({
  name: 'kpi_check_dispute',
  label: '提出争议',
  icon: 'message-square-warning',
  objectName: 'kpi_check_task',
  type: 'script',
  variant: 'danger',
  params: [{ name: 'comment', type: 'textarea', label: '争议内容', required: true }],
  body: { ...WRITE, source: rec('kpi_check_task') + "if (!input.comment || !String(input.comment).trim()) throw new Error('提出争议失败:核对意见不能为空。请填写争议内容后再提交。');" + "await repo.update({ id: id, status: 'disputed', comment: input.comment }); return { ok: true };" },
  successMessage: '已记录争议,请与填报部门协商后再确认。',
  visible: "has(record.status) && record.status == 'pending'",
  locations: ['record_header', 'list_item'],
  refreshAfter: true,
});

// ── 考核方案 ────────────────────────────────────────────────────────────────
export const PlanPublishAction = defineAction({
  name: 'kpi_plan_publish',
  label: '发布方案',
  icon: 'rocket',
  objectName: 'kpi_plan',
  type: 'script',
  body: { ...WRITE, source: rec('kpi_plan') + "await repo.update({ id: id, status: 'published' }); return { ok: true };" },
  confirmText: '发布前将做完整性检查;通过后方案冻结,并为每个参与主体生成填报单。确认发布?',
  successMessage: '方案已发布,填报单已生成。',
  visible: "has(record.status) && record.status == 'draft'",
  locations: ['record_header', 'list_item'],
  refreshAfter: true,
});

export const PlanCloseAction = defineAction({
  name: 'kpi_plan_close',
  label: '关闭方案',
  icon: 'lock',
  objectName: 'kpi_plan',
  type: 'script',
  body: { ...WRITE, source: rec('kpi_plan') + "await repo.update({ id: id, status: 'closed' }); return { ok: true };" },
  confirmText: '关闭后不再接受新的填报与调整。确认关闭?',
  successMessage: '方案已关闭。',
  visible: "has(record.status) && record.status == 'published'",
  locations: ['record_header'],
  refreshAfter: true,
});

export const PlanArchiveAction = defineAction({
  name: 'kpi_plan_archive',
  label: '归档方案',
  icon: 'archive',
  objectName: 'kpi_plan',
  type: 'script',
  body: { ...WRITE, source: rec('kpi_plan') + "await repo.update({ id: id, status: 'archived' }); return { ok: true };" },
  successMessage: '方案已归档。',
  visible: "has(record.status) && record.status == 'closed'",
  locations: ['record_header'],
  refreshAfter: true,
});

// ── 加减分 ──────────────────────────────────────────────────────────────────
export const BonusApproveAction = defineAction({
  name: 'kpi_bonus_approve',
  label: '批准',
  icon: 'check-circle',
  objectName: 'kpi_bonus',
  type: 'script',
  body: { ...WRITE, source: rec('kpi_bonus') + "await repo.update({ id: id, status: 'approved' }); return { ok: true };" },
  successMessage: '加减分已批准,计入最终得分。',
  visible: "has(record.status) && record.status == 'draft'",
  locations: ['record_header', 'list_item'],
  refreshAfter: true,
});

export const BonusRejectAction = defineAction({
  name: 'kpi_bonus_reject',
  label: '否决',
  icon: 'x-circle',
  objectName: 'kpi_bonus',
  type: 'script',
  variant: 'danger',
  body: { ...WRITE, source: rec('kpi_bonus') + "await repo.update({ id: id, status: 'rejected' }); return { ok: true };" },
  successMessage: '加减分已否决。',
  visible: "has(record.status) && record.status == 'draft'",
  locations: ['record_header', 'list_item'],
  refreshAfter: true,
});

// ── 数据调整 ────────────────────────────────────────────────────────────────
export const AdjustmentSubmitAction = defineAction({
  name: 'kpi_adjustment_submit',
  label: '提交审批',
  icon: 'send',
  objectName: 'kpi_adjustment',
  type: 'script',
  body: { ...WRITE, source: rec('kpi_adjustment') + "await repo.update({ id: id, status: 'submitted' }); return { ok: true };" },
  successMessage: '调整申请已提交,等待人力审批。',
  visible: "has(record.status) && record.status == 'draft'",
  locations: ['record_header', 'list_item'],
  refreshAfter: true,
});

export const AdjustmentApproveAction = defineAction({
  name: 'kpi_adjustment_approve',
  label: '批准并落地',
  icon: 'check-circle',
  objectName: 'kpi_adjustment',
  type: 'script',
  description: '批准后将立即更正明细并重新计分。确认批准?',
  params: [{ name: 'decision_reason', type: 'textarea', label: '审批意见(选填)' }],
  body: { ...WRITE, source: rec('kpi_adjustment') + "await repo.update({ id: id, status: 'approved', decision_reason: input.decision_reason || null }); return { ok: true };" },
  successMessage: '调整已批准并落地,得分已重算。',
  visible: "has(record.status) && record.status == 'submitted'",
  locations: ['record_header', 'list_item'],
  refreshAfter: true,
});

export const AdjustmentRejectAction = defineAction({
  name: 'kpi_adjustment_reject',
  label: '否决',
  icon: 'x-circle',
  objectName: 'kpi_adjustment',
  type: 'script',
  variant: 'danger',
  params: [{ name: 'decision_reason', type: 'textarea', label: '否决原因', required: true }],
  body: { ...WRITE, source: rec('kpi_adjustment') + "if (!input.decision_reason || !String(input.decision_reason).trim()) throw new Error('否决调整申请失败:审批意见不能为空。请填写否决原因后再提交。');" + "await repo.update({ id: id, status: 'rejected', decision_reason: input.decision_reason }); return { ok: true };" },
  successMessage: '调整申请已否决。',
  visible: "has(record.status) && record.status == 'submitted'",
  locations: ['record_header', 'list_item'],
  refreshAfter: true,
});

// ── 指标争议 ────────────────────────────────────────────────────────────────
export const DisputeAcceptAction = defineAction({
  name: 'kpi_dispute_accept',
  label: '采纳',
  icon: 'check-circle',
  objectName: 'kpi_dispute',
  type: 'script',
  params: [{ name: 'resolution', type: 'textarea', label: '处理结论', required: true }],
  body: { ...WRITE, source: rec('kpi_dispute') + "if (!input.resolution || !String(input.resolution).trim()) throw new Error('处理争议失败:处理结论不能为空。请填写处理结论后再提交。');" + "await repo.update({ id: id, status: 'accepted', resolution: input.resolution }); return { ok: true };" },
  successMessage: '争议已采纳,请据此调整指标下达。',
  visible: "has(record.status) && record.status == 'open'",
  locations: ['record_header', 'list_item'],
  refreshAfter: true,
});

export const DisputeRejectAction = defineAction({
  name: 'kpi_dispute_reject',
  label: '不采纳',
  icon: 'x-circle',
  objectName: 'kpi_dispute',
  type: 'script',
  variant: 'danger',
  params: [{ name: 'resolution', type: 'textarea', label: '处理结论', required: true }],
  body: { ...WRITE, source: rec('kpi_dispute') + "if (!input.resolution || !String(input.resolution).trim()) throw new Error('处理争议失败:处理结论不能为空。请填写处理结论后再提交。');" + "await repo.update({ id: id, status: 'rejected', resolution: input.resolution }); return { ok: true };" },
  successMessage: '争议已关闭(不采纳)。',
  visible: "has(record.status) && record.status == 'open'",
  locations: ['record_header', 'list_item'],
  refreshAfter: true,
});
