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

/**
 * 填报明细列表列(#34):只留填报人当场要看的九项 + 「已调整」标记。
 *
 * 移出列表的 所属填报单 / 指标方向 / 计分方式 / 调整类型 / 调整后得分 都是配置或留痕字段 ——
 * 填一行数时用不上,却把「实际值」挤到第 8 列开外。它们仍在记录页与导出里,不是删掉。
 */
const lineCols = cols('indicator_name', 'unit', 'target_value', 'weight', 'actual_value', 'completion_rate', 'score_rate', 'final_score', 'is_adjusted', 'remark');
export const EntryLineViews = defineView({
  list: { label: '填报明细', type: 'grid', data: obj('kpi_entry_line'), columns: lineCols, inlineEdit: true, exportOptions: XLSX, sort: [{ field: 'indicator_name', order: 'asc' }] },
  listViews: {
    unfilled: { label: '未填实际值', type: 'grid', data: obj('kpi_entry_line'), columns: lineCols, inlineEdit: true, filter: [{ field: 'actual_value', operator: 'is_null' }] },
  },
  /**
   * 编辑表单只留「实际值」「备注」两个可写字段(#34)。
   *
   * 原来的「计分」分区把 完成率 / 得分率 / 指标得分 / 调整后得分 / 最终得分 一并摆进表单,
   * 而本版本控制台的记录表单**提交表单上的全部字段**,不只提交改动过的那些:部门填报人员的
   * 字段权限把 `score` / `adjusted_score` 标成不可写,于是只改一格实际值也会被服务端按
   * 「写了不该写的字段」拒掉(平台侧 objectstack-ai/objectstack#15259)。把这些只读字段移出
   * 表单,提交体里就不再带它们 —— 得分照样在记录页与列表里看得到,那是读的地方。
   *
   * 「所属填报单」「来源下达」标 `immutable` 而不是 `readonly`(评审 F1)。两者在对象上都是
   * `required: true`,而这是**唯一**一个 formView,新建与编辑共用:标 `readonly` 时控制台把
   * 两个必填 lookup 的「选择…」按钮一起 `disabled`,管理员与人力审核点「新建」只能得到
   * 「所属填报单不能为空、来源下达不能为空」,表单永远提交不了。`immutable`(spec
   * `ui/view.zod.ts`:Editable on create, locked once the record exists)正是为这两种场景
   * 分开设的键,换上后管理员实测新建成功。
   *
   * ⚠️ 实测边界,别按字面理解:本版控制台**只落实了 `immutable` 的前半句**。编辑弹窗里这两个
   * lookup 的「选择…」按钮仍是 enabled(`button.disabled === false`),没有「记录存在后锁死」
   * 的表现。也就是说,归属字段在编辑表单上并没有 UI 锁 —— 这与改动前主干上的行为一致
   * (主干这两个字段只有 `required`,同样可改),不是本次新开的口子;真正的护栏在数据层:
   * `writeScope: 'own'` 让填报人只够得到自己那张单。另一条路(给「新建」单独一个
   * `formViews.create`)也实测过:控制台的「新建」仍然渲染 `formViews.form`,新建与编辑
   * 不按名字分流,因此这条路不成立。其余业务字段在对象定义上本就是 `readonly`,这里的标记
   * 只是让表单显式一致。
   */
  formViews: { form: { type: 'simple', data: obj('kpi_entry_line'), sections: [
    { name: 'entry', label: '填报', columns: 2, fields: [{ field: 'sheet', immutable: true }, { field: 'plan_indicator', immutable: true }, { field: 'indicator_name', readonly: true }, { field: 'unit', readonly: true }, { field: 'target_value', readonly: true }, { field: 'weight', readonly: true }, { field: 'actual_value' }, { field: 'remark' }] },
  ] } },
});

export const CheckTaskViews = defineView({
  list: { label: '全部核对任务', type: 'grid', data: obj('kpi_check_task'), columns: cols('name', 'sheet', 'branch', 'status', 'decided_by', 'decided_at', 'comment'), exportOptions: XLSX },
  listViews: {
    /**
     * 「待我核对」开多选 + 批量「确认无误」(#37)。
     *
     * 分公司核对人员清空队列原来要逐条走「更多操作 → 确认无误 → 确认」,10 条 30 击(UI 实测)。
     * `bulkActions` 的裸字符串形式是**逐记录派发**:渲染器按名字取到对象上的 `kpi_check_confirm`,
     * 连同它自己的 label、`params`(核对意见,选填)与 `visible` 谓词一起提升成批量按钮,对勾选的
     * 每条记录各发一次,`recordId` 由该行记录带出。所以状态推进仍然一条不落地走
     * `hooks/check-task.hook.ts`(岗位校验、填报单状态校验、盖章、留痕、全部确认后自动推进),
     * 批量只省点击、不省规则 —— 不用 `bulkActionDefs`,那是给「一次调用覆盖整个选区」的聚合动作
     * 与纯数据面批改准备的,会绕开逐条 hook。
     *
     * 「提出争议」**故意不进** `bulkActions`:争议内容必填且逐条不同,批量填一份意见套给多条记录
     * 就是伪造留痕(《设计方案》§5.5「提出争议必须写意见」)。它保持行内单条。
     */
    pending: {
      label: '待我核对',
      type: 'grid',
      data: obj('kpi_check_task'),
      columns: cols('name', 'sheet', 'branch', 'status'),
      filter: [{ field: 'status', operator: 'equals', value: 'pending' }],
      selection: { type: 'multiple' },
      bulkActions: ['kpi_check_confirm'],
    },
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
  /**
   * 登记表单只留五个业务字段(#37)。
   *
   * 原表单把 状态 / 计入分值 / 审批人 / 审批时间 一并摆给登记人:「状态」是必填下拉、没有默认值,
   * 而下拉里的「已批准」「已否决」都会被对象上的状态机(`initialStates: ['draft']`)与
   * `hooks/bonus.hook.ts` 的岗位分离拒掉 —— 人力审核要试错才登记得出一条待审批的加减分。
   * 现在状态由 hook 的 `beforeInsert` 补「待审批」,表单上不再出现;计入分值由 hook 按类型算符号;
   * 审批人 / 审批时间由「批准 / 否决」按钮盖章。
   *
   * 移出 ≠ 删掉:记录详情页的字段清单来自对象定义、不来自表单视图(与 #34 收敛填报明细表单同一条路),
   * 这四项在记录页照常只读可见。
   */
  formViews: { form: { type: 'simple', data: obj('kpi_bonus'), sections: [{ name: 'main', label: '加减分', columns: 2, fields: [{ field: 'sheet', required: true }, { field: 'title', required: true }, { field: 'bonus_type', required: true }, { field: 'points', required: true }, { field: 'reason', required: true }] }] } },
});

export const AdjustmentViews = defineView({
  list: { label: '数据调整', type: 'grid', data: obj('kpi_adjustment'), columns: cols('name', 'sheet', 'subject', 'line', 'adjust_type', 'old_value', 'new_value', 'status', 'requested_by', 'decided_by', 'applied_at'), exportOptions: XLSX, sort: [{ field: 'created_at', order: 'desc' }] },
  listViews: {
    pending: { label: '待审批', type: 'grid', data: obj('kpi_adjustment'), columns: cols('name', 'sheet', 'line', 'adjust_type', 'old_value', 'new_value', 'reason', 'requested_by'), filter: [{ field: 'status', operator: 'equals', value: 'submitted' }] },
  },
  /**
   * 申请表单只留五个业务字段(#37)。
   *
   * 原表单把 调整前值 / 申请人 / 状态 / 审批人 / 审批时间 / 审批意见 / 落地时间 一并摆给填报人员,
   * 其中两项是实打实的坑:「状态」必填、无默认值,下拉里的「已批准」「已否决」会被状态机
   * (`initialStates: ['draft']`)拒掉;「审批意见」在表单上**可编辑**,等于让申请人替审批人写意见。
   * 现在状态由 `hooks/adjustment.hook.ts` 的 `beforeInsert` 补「草稿」,审批意见只由
   * 「批准并落地 / 否决」两个按钮写。
   *
   * 「调整前值」也移出表单:它由 hook 在保存时按所选明细回填。控制台表单没有「按 lookup 选中值
   * 回查另一对象的字段、即时回填本表单」的联动能力(实测选中明细后该框仍为空,改动前后一致),
   * ObjectStack 表达这类派生值的正规做法是对象上的公式 / 汇总字段,而本单不新增字段 ——
   * 所以维持「保存时回填、记录页只读展示」,不在表单上留一个永远空着的框骗人。
   *
   * 移出 ≠ 删掉:记录详情页的字段清单来自对象定义、不来自表单视图,这七项在记录页照常只读可见。
   */
  formViews: { form: { type: 'simple', data: obj('kpi_adjustment'), sections: [
    { name: 'request', label: '调整申请', columns: 2, fields: [{ field: 'sheet', required: true }, { field: 'line', required: true }, { field: 'adjust_type', required: true }, { field: 'new_value', required: true }, { field: 'reason', required: true }] },
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
