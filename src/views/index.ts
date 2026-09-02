import { defineView } from '@objectstack/spec';

const obj = (object: string) => ({ provider: 'object' as const, object });
const cols = (...fields: string[]) => fields.map((field) => ({ field }));
const XLSX: { formats: Array<'csv' | 'xlsx'> } = { formats: ['csv', 'xlsx'] };

// ── 指标库 ──────────────────────────────────────────────────────────────────
export const IndicatorViews = defineView({
  list: {
    label: '全部指标',
    type: 'grid',
    data: obj('kpi_indicator'),
    columns: cols('code', 'name', 'category', 'owner_unit', 'data_source', 'direction', 'scoring_method', 'unit', 'status', 'version_no'),
    exportOptions: XLSX,
    sort: [{ field: 'code', order: 'asc' }],
  },
  listViews: {
    active: {
      label: '启用中',
      type: 'grid',
      data: obj('kpi_indicator'),
      columns: cols('code', 'name', 'category', 'owner_unit', 'scoring_method', 'unit'),
      filter: [{ field: 'status', operator: 'equals', value: 'active' }],
      exportOptions: XLSX,
    },
  },
  formViews: {
    form: {
      type: 'tabbed',
      data: obj('kpi_indicator'),
      sections: [
        { name: 'basic', label: '基本信息', columns: 2, fields: [{ field: 'code', required: true }, { field: 'name', required: true }, { field: 'category', required: true }, { field: 'owner_unit', required: true }, { field: 'data_source', required: true }, { field: 'unit' }, { field: 'value_scale' }, { field: 'status' }, { field: 'version_no' }, { field: 'superseded_by' }] },
        { name: 'scoring', label: '计分规则', columns: 2, fields: [{ field: 'direction', required: true }, { field: 'scoring_method', required: true }, { field: 'cap_rate' }, { field: 'floor_rate' }, { field: 'range_lower_rate' }, { field: 'range_upper_rate' }, { field: 'score_formula' }] },
        { name: 'desc', label: '口径说明', columns: 1, fields: [{ field: 'description' }] },
      ],
    },
  },
});

export const IndicatorStepViews = defineView({
  list: { label: '阶梯区间', type: 'grid', data: obj('kpi_indicator_step'), columns: cols('indicator', 'seq', 'label', 'min_rate', 'max_rate', 'score_rate'), inlineEdit: true, sort: [{ field: 'seq', order: 'asc' }] },
  formViews: { form: { type: 'simple', data: obj('kpi_indicator_step'), sections: [{ name: 'main', label: '阶梯区间', columns: 2, fields: [{ field: 'indicator', required: true }, { field: 'seq' }, { field: 'label', required: true }, { field: 'min_rate', required: true }, { field: 'max_rate' }, { field: 'score_rate', required: true }] }] } },
});

// ── 考核方案 ────────────────────────────────────────────────────────────────
export const PlanViews = defineView({
  list: {
    label: '全部方案',
    type: 'grid',
    data: obj('kpi_plan'),
    columns: cols('name', 'period_type', 'year', 'period_no', 'period_start', 'period_end', 'version_no', 'status', 'subject_count', 'indicator_count', 'open_dispute_count', 'published_at'),
    exportOptions: XLSX,
    sort: [{ field: 'period_start', order: 'desc' }],
  },
  listViews: {
    draft: { label: '草稿', type: 'grid', data: obj('kpi_plan'), columns: cols('name', 'period_type', 'year', 'period_no', 'version_no', 'subject_count', 'indicator_count', 'open_dispute_count'), filter: [{ field: 'status', operator: 'equals', value: 'draft' }] },
    published: { label: '已发布', type: 'grid', data: obj('kpi_plan'), columns: cols('name', 'period_type', 'year', 'period_no', 'version_no', 'published_at', 'published_by'), filter: [{ field: 'status', operator: 'equals', value: 'published' }] },
    board: { label: '状态看板', type: 'kanban', data: obj('kpi_plan'), columns: ['name', 'period_type', 'year', 'period_no'], kanban: { groupByField: 'status', columns: ['name', 'period_type', 'year', 'period_no'] } },
  },
  formViews: {
    form: {
      type: 'tabbed',
      data: obj('kpi_plan'),
      sections: [
        { name: 'basic', label: '方案信息', columns: 2, fields: [{ field: 'name', required: true }, { field: 'period_type', required: true }, { field: 'year', required: true }, { field: 'period_no', required: true }, { field: 'period_start', required: true }, { field: 'period_end', required: true }, { field: 'version_no' }, { field: 'based_on' }, { field: 'status' }, { field: 'description' }] },
        { name: 'publish', label: '发布信息', columns: 2, fields: [{ field: 'published_at' }, { field: 'published_by' }, { field: 'subject_count' }, { field: 'indicator_count' }, { field: 'open_dispute_count' }] },
      ],
    },
  },
});

export const PlanStepViews = defineView({
  list: { label: '流程节点', type: 'grid', data: obj('kpi_plan_step'), columns: cols('plan', 'seq', 'step_type', 'label', 'approver_position'), inlineEdit: true, sort: [{ field: 'seq', order: 'asc' }] },
  formViews: { form: { type: 'simple', data: obj('kpi_plan_step'), sections: [{ name: 'main', label: '流程节点', columns: 2, fields: [{ field: 'plan', required: true }, { field: 'seq', required: true }, { field: 'step_type', required: true }, { field: 'label', required: true }, { field: 'approver_position', required: true }] }] } },
});

export const PlanSubjectViews = defineView({
  list: { label: '参与主体', type: 'grid', data: obj('kpi_plan_subject'), columns: cols('plan', 'name', 'subject', 'subject_type', 'assessor_unit', 'subject_weight', 'leader'), inlineEdit: true, exportOptions: XLSX },
  formViews: { form: { type: 'simple', data: obj('kpi_plan_subject'), sections: [{ name: 'main', label: '参与主体', columns: 2, fields: [{ field: 'plan', required: true }, { field: 'subject', required: true }, { field: 'subject_type', required: true }, { field: 'assessor_unit' }, { field: 'subject_weight' }, { field: 'leader' }, { field: 'remark' }] }] } },
});

export const PlanIndicatorViews = defineView({
  list: {
    label: '指标下达',
    type: 'grid',
    data: obj('kpi_plan_indicator'),
    columns: cols('plan', 'subject', 'indicator', 'weight', 'target_value', 'baseline_value', 'data_source', 'dispute_status'),
    inlineEdit: true,
    exportOptions: XLSX,
  },
  listViews: {
    disputed: { label: '争议中', type: 'grid', data: obj('kpi_plan_indicator'), columns: cols('plan', 'subject', 'indicator', 'weight', 'target_value', 'dispute_status'), filter: [{ field: 'dispute_status', operator: 'equals', value: 'open' }] },
  },
  formViews: { form: { type: 'simple', data: obj('kpi_plan_indicator'), sections: [{ name: 'main', label: '指标下达', columns: 2, fields: [{ field: 'plan', required: true }, { field: 'indicator', required: true }, { field: 'subject', required: true }, { field: 'weight', required: true }, { field: 'target_value' }, { field: 'baseline_value' }, { field: 'data_source' }, { field: 'dispute_status' }, { field: 'remark' }] }] } },
});

export const DisputeViews = defineView({
  list: { label: '全部争议', type: 'grid', data: obj('kpi_dispute'), columns: cols('name', 'plan_indicator', 'raised_unit', 'raised_by', 'status', 'resolved_by', 'resolved_at'), exportOptions: XLSX, sort: [{ field: 'created_at', order: 'desc' }] },
  listViews: {
    open: { label: '待处理', type: 'grid', data: obj('kpi_dispute'), columns: cols('name', 'plan_indicator', 'raised_unit', 'raised_by', 'reason'), filter: [{ field: 'status', operator: 'equals', value: 'open' }] },
  },
  formViews: { form: { type: 'simple', data: obj('kpi_dispute'), sections: [
    { name: 'raise', label: '争议内容', columns: 2, fields: [{ field: 'plan_indicator', required: true }, { field: 'raised_unit', required: true }, { field: 'raised_by' }, { field: 'reason', required: true }] },
    { name: 'resolve', label: '处理结论', columns: 2, fields: [{ field: 'status' }, { field: 'resolution' }, { field: 'resolved_by' }, { field: 'resolved_at' }] },
  ] } },
});

export const StaffAssignmentViews = defineView({
  list: { label: '到人分工', type: 'grid', data: obj('kpi_staff_assignment'), columns: cols('plan', 'employee', 'unit', 'weight', 'coefficient', 'remark'), inlineEdit: true, exportOptions: XLSX },
  formViews: { form: { type: 'simple', data: obj('kpi_staff_assignment'), sections: [{ name: 'main', label: '到人分工', columns: 2, fields: [{ field: 'plan', required: true }, { field: 'employee', required: true }, { field: 'unit', required: true }, { field: 'weight', required: true }, { field: 'coefficient', required: true }, { field: 'remark' }] }] } },
});

export const PersonalItemViews = defineView({
  list: { label: '个人承接项', type: 'grid', data: obj('kpi_personal_item'), columns: cols('assignment', 'plan_indicator', 'weight', 'target_value'), inlineEdit: true },
  formViews: { form: { type: 'simple', data: obj('kpi_personal_item'), sections: [{ name: 'main', label: '个人承接项', columns: 2, fields: [{ field: 'assignment', required: true }, { field: 'plan_indicator', required: true }, { field: 'weight', required: true }, { field: 'target_value' }] }] } },
});

// ── 填报与审核 ──────────────────────────────────────────────────────────────
const sheetCols = cols('name', 'plan', 'subject', 'subject_type', 'status', 'current_step', 'line_count', 'weight_total', 'indicator_score', 'bonus_total', 'total_score', 'submitted_at');
export const EntrySheetViews = defineView({
  list: { label: '全部填报单', type: 'grid', data: obj('kpi_entry_sheet'), columns: sheetCols, exportOptions: XLSX, sort: [{ field: 'updated_at', order: 'desc' }] },
  listViews: {
    filling: { label: '填报中', type: 'grid', data: obj('kpi_entry_sheet'), columns: sheetCols, filter: [{ field: 'status', operator: 'equals', value: 'draft' }] },
    checking: { label: '分公司核对中', type: 'grid', data: obj('kpi_entry_sheet'), columns: sheetCols, filter: [{ field: 'status', operator: 'equals', value: 'branch_checking' }] },
    hr: { label: '待人力审核', type: 'grid', data: obj('kpi_entry_sheet'), columns: sheetCols, filter: [{ field: 'status', operator: 'equals', value: 'hr_reviewing' }] },
    leader: { label: '待领导审批', type: 'grid', data: obj('kpi_entry_sheet'), columns: sheetCols, filter: [{ field: 'status', operator: 'equals', value: 'leader_approving' }] },
    approved: { label: '已通过', type: 'grid', data: obj('kpi_entry_sheet'), columns: sheetCols, filter: [{ field: 'status', operator: 'equals', value: 'approved' }] },
    archived: { label: '已归档', type: 'grid', data: obj('kpi_entry_sheet'), columns: sheetCols, filter: [{ field: 'status', operator: 'equals', value: 'archived' }] },
    board: { label: '流程看板', type: 'kanban', data: obj('kpi_entry_sheet'), columns: ['name', 'subject', 'total_score'], kanban: { groupByField: 'status', summarizeField: 'total_score', columns: ['name', 'subject', 'total_score'] } },
  },
  formViews: {
    form: {
      type: 'tabbed',
      data: obj('kpi_entry_sheet'),
      sections: [
        { name: 'head', label: '填报单', columns: 3, fields: [{ field: 'name' }, { field: 'plan' }, { field: 'subject' }, { field: 'subject_type' }, { field: 'status' }, { field: 'current_step' }, { field: 'weight_total' }, { field: 'indicator_score' }, { field: 'bonus_total' }, { field: 'total_score' }, { field: 'remark' }] },
        { name: 'flow', label: '流程信息', columns: 2, fields: [{ field: 'submitted_at' }, { field: 'submitted_by' }, { field: 'approved_at' }, { field: 'approved_by' }, { field: 'archived_at' }, { field: 'last_reject_reason' }] },
      ],
    },
  },
});

const lineCols = cols('sheet', 'indicator_name', 'unit', 'direction', 'scoring_method', 'target_value', 'weight', 'actual_value', 'completion_rate', 'score_rate', 'score', 'adjusted_score', 'is_adjusted', 'adjust_type_applied', 'final_score', 'remark');
export const EntryLineViews = defineView({
  list: { label: '填报明细', type: 'grid', data: obj('kpi_entry_line'), columns: lineCols, inlineEdit: true, exportOptions: XLSX, sort: [{ field: 'indicator_name', order: 'asc' }] },
  listViews: {
    unfilled: { label: '未填实际值', type: 'grid', data: obj('kpi_entry_line'), columns: lineCols, inlineEdit: true, filter: [{ field: 'actual_value', operator: 'is_null' }] },
  },
  formViews: { form: { type: 'simple', data: obj('kpi_entry_line'), sections: [
    { name: 'entry', label: '填报', columns: 2, fields: [{ field: 'sheet', required: true }, { field: 'plan_indicator', required: true }, { field: 'indicator_name' }, { field: 'unit' }, { field: 'target_value' }, { field: 'weight' }, { field: 'actual_value' }, { field: 'remark' }] },
    { name: 'score', label: '计分', columns: 2, fields: [{ field: 'direction' }, { field: 'scoring_method' }, { field: 'completion_rate' }, { field: 'score_rate' }, { field: 'score' }, { field: 'adjusted_score' }, { field: 'is_adjusted' }, { field: 'adjust_type_applied' }, { field: 'final_score' }, { field: 'last_adjustment' }, { field: 'calc_trace' }] },
  ] } },
});

export const CheckTaskViews = defineView({
  list: { label: '全部核对任务', type: 'grid', data: obj('kpi_check_task'), columns: cols('name', 'sheet', 'branch', 'status', 'decided_by', 'decided_at', 'comment'), exportOptions: XLSX },
  listViews: {
    pending: { label: '待我核对', type: 'grid', data: obj('kpi_check_task'), columns: cols('name', 'sheet', 'branch', 'status'), filter: [{ field: 'status', operator: 'equals', value: 'pending' }] },
    disputed: { label: '有争议', type: 'grid', data: obj('kpi_check_task'), columns: cols('name', 'sheet', 'branch', 'comment', 'decided_by'), filter: [{ field: 'status', operator: 'equals', value: 'disputed' }] },
  },
  formViews: { form: { type: 'simple', data: obj('kpi_check_task'), sections: [{ name: 'main', label: '核对任务', columns: 2, fields: [{ field: 'name' }, { field: 'sheet' }, { field: 'branch' }, { field: 'status' }, { field: 'comment' }, { field: 'decided_by' }, { field: 'decided_at' }] }] } },
});

export const ReviewRecordViews = defineView({
  list: { label: '审核记录', type: 'grid', data: obj('kpi_review_record'), columns: cols('name', 'sheet', 'action', 'step_label', 'from_status', 'to_status', 'actor', 'reason', 'acted_at'), exportOptions: XLSX, sort: [{ field: 'acted_at', order: 'desc' }] },
  listViews: {
    rejects: { label: '驳回记录', type: 'grid', data: obj('kpi_review_record'), columns: cols('name', 'sheet', 'step_label', 'actor', 'reason', 'acted_at'), filter: [{ field: 'action', operator: 'equals', value: 'reject' }] },
    timeline: { label: '时间线', type: 'timeline', data: obj('kpi_review_record'), columns: ['name', 'sheet', 'action', 'actor'], timeline: { startDateField: 'acted_at', titleField: 'name', colorField: 'action', scale: 'day' } },
  },
  formViews: { form: { type: 'simple', data: obj('kpi_review_record'), sections: [{ name: 'main', label: '审核记录', columns: 2, fields: [{ field: 'name' }, { field: 'sheet' }, { field: 'action' }, { field: 'step_label' }, { field: 'from_status' }, { field: 'to_status' }, { field: 'actor' }, { field: 'acted_at' }, { field: 'reason' }] }] } },
});

export const BonusViews = defineView({
  list: { label: '加减分', type: 'grid', data: obj('kpi_bonus'), columns: cols('sheet', 'title', 'bonus_type', 'points', 'signed_points', 'status', 'approved_by', 'approved_at'), exportOptions: XLSX },
  listViews: {
    pending: { label: '待审批', type: 'grid', data: obj('kpi_bonus'), columns: cols('sheet', 'title', 'bonus_type', 'points', 'reason'), filter: [{ field: 'status', operator: 'equals', value: 'draft' }] },
  },
  formViews: { form: { type: 'simple', data: obj('kpi_bonus'), sections: [{ name: 'main', label: '加减分', columns: 2, fields: [{ field: 'sheet', required: true }, { field: 'title', required: true }, { field: 'bonus_type', required: true }, { field: 'points', required: true }, { field: 'reason', required: true }, { field: 'status' }, { field: 'signed_points' }, { field: 'approved_by' }, { field: 'approved_at' }] }] } },
});

export const AdjustmentViews = defineView({
  list: { label: '数据调整', type: 'grid', data: obj('kpi_adjustment'), columns: cols('name', 'sheet', 'subject', 'line', 'adjust_type', 'old_value', 'new_value', 'status', 'requested_by', 'decided_by', 'applied_at'), exportOptions: XLSX, sort: [{ field: 'created_at', order: 'desc' }] },
  listViews: {
    pending: { label: '待审批', type: 'grid', data: obj('kpi_adjustment'), columns: cols('name', 'sheet', 'line', 'adjust_type', 'old_value', 'new_value', 'reason', 'requested_by'), filter: [{ field: 'status', operator: 'equals', value: 'submitted' }] },
  },
  formViews: { form: { type: 'simple', data: obj('kpi_adjustment'), sections: [
    { name: 'request', label: '调整申请', columns: 2, fields: [{ field: 'sheet', required: true }, { field: 'line', required: true }, { field: 'adjust_type', required: true }, { field: 'old_value' }, { field: 'new_value', required: true }, { field: 'reason', required: true }, { field: 'requested_by' }, { field: 'status' }] },
    { name: 'decision', label: '审批', columns: 2, fields: [{ field: 'decided_by' }, { field: 'decided_at' }, { field: 'decision_reason' }, { field: 'applied_at' }] },
  ] } },
});

// ── 汇总与归档 ──────────────────────────────────────────────────────────────
const resultCols = cols('name', 'plan', 'dimension', 'unit', 'person', 'score', 'weighted_score', 'rank', 'generated_at');
export const ResultViews = defineView({
  list: { label: '考核结果', type: 'grid', data: obj('kpi_result'), columns: resultCols, exportOptions: XLSX, sort: [{ field: 'rank', order: 'asc' }] },
  listViews: {
    department: { label: '部门', type: 'grid', data: obj('kpi_result'), columns: resultCols, filter: [{ field: 'dimension', operator: 'equals', value: 'department' }] },
    branch: { label: '分公司', type: 'grid', data: obj('kpi_result'), columns: resultCols, filter: [{ field: 'dimension', operator: 'equals', value: 'branch' }] },
    person: { label: '到人', type: 'grid', data: obj('kpi_result'), columns: resultCols, filter: [{ field: 'dimension', operator: 'equals', value: 'person' }] },
    leader: { label: '分管领导', type: 'grid', data: obj('kpi_result'), columns: resultCols, filter: [{ field: 'dimension', operator: 'equals', value: 'leader' }] },
  },
  formViews: { form: { type: 'simple', data: obj('kpi_result'), sections: [{ name: 'main', label: '考核结果', columns: 2, fields: [{ field: 'name' }, { field: 'plan' }, { field: 'dimension' }, { field: 'unit' }, { field: 'person' }, { field: 'sheet' }, { field: 'score' }, { field: 'weighted_score' }, { field: 'rank' }, { field: 'generated_at' }, { field: 'breakdown' }] }] } },
});

export const SnapshotViews = defineView({
  list: { label: '归档快照', type: 'grid', data: obj('kpi_snapshot'), columns: cols('name', 'plan', 'subject', 'total_score', 'checksum', 'archived_by', 'archived_at'), exportOptions: XLSX, sort: [{ field: 'archived_at', order: 'desc' }] },
  formViews: { form: { type: 'simple', data: obj('kpi_snapshot'), sections: [{ name: 'main', label: '归档快照', columns: 2, fields: [{ field: 'name' }, { field: 'plan' }, { field: 'sheet' }, { field: 'subject' }, { field: 'total_score' }, { field: 'checksum' }, { field: 'archived_by' }, { field: 'archived_at' }, { field: 'payload' }] }] } },
});
