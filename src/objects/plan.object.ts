import { ObjectSchema, Field } from '@objectstack/spec/data';
import { P } from '@objectstack/spec';

/**
 * 考核方案版本(蓝图 B-M3-01)。发布后冻结:配置子对象(流程节点、参与主体、
 * 指标下达、到人分工)在 hook 中拒绝修改;发布动作生成每个主体的填报单。
 */
export const Plan = ObjectSchema.create({
  name: 'kpi_plan',
  label: '考核方案',
  pluralLabel: '考核方案',
  icon: 'clipboard-list',
  description: '一次考核的配置集合:周期、指标下达、考核关系、到人分工、审核流程。',
  sharingModel: 'public_read',
  nameField: 'name',

  fields: {
    name: Field.text({ label: '方案名称', required: true, searchable: true, maxLength: 200 }),
    period_type: Field.select({
      label: '考核周期类型',
      required: true,
      options: [
        { label: '月度', value: 'month', default: true },
        { label: '季度', value: 'quarter' },
        { label: '半年度', value: 'half_year' },
        { label: '年度', value: 'year' },
      ],
    }),
    year: Field.number({ label: '考核年度', required: true, scale: 0, min: 2000, max: 2100 }),
    period_no: Field.number({ label: '期数(月/季/半年序号)', required: true, scale: 0, min: 1, max: 12, defaultValue: 1 }),
    period_start: Field.date({ label: '周期开始', required: true }),
    period_end: Field.date({ label: '周期结束', required: true }),
    version_no: Field.number({ label: '版本号', scale: 0, min: 1, max: 999, defaultValue: 1 }),
    status: Field.select({
      label: '状态',
      required: true,
      options: [
        { label: '草稿', value: 'draft', default: true, color: '#94A3B8' },
        { label: '已发布', value: 'published', color: '#2563EB' },
        { label: '已关闭', value: 'closed', color: '#F59E0B' },
        { label: '已归档', value: 'archived', color: '#10B981' },
      ],
    }),
    based_on: Field.lookup('kpi_plan', { label: '复制自版本' }),
    published_at: Field.datetime({ label: '发布时间', readonly: true }),
    published_by: Field.user({ label: '发布人', readonly: true }),
    description: Field.textarea({ label: '方案说明' }),
    subject_count: Field.summary({
      label: '参与主体数',
      summaryOperations: { object: 'kpi_plan_subject', field: 'id', function: 'count' },
    }),
    indicator_count: Field.summary({
      label: '下达指标数',
      summaryOperations: { object: 'kpi_plan_indicator', field: 'id', function: 'count' },
    }),
    open_dispute_count: Field.summary({
      label: '未关闭争议数',
      summaryOperations: { object: 'kpi_plan_indicator', field: 'id', function: 'count', filter: { dispute_status: 'open' } },
    }),
  },

  validations: [
    {
      type: 'cross_field' as const,
      name: 'plan_period_order',
      label: '周期结束晚于开始',
      fields: ['period_start', 'period_end'],
      condition: P`record.period_start != null && record.period_end != null && record.period_end < record.period_start`,
      message: '周期结束日期不能早于开始日期。请调整周期范围。',
      events: ['insert', 'update'],
    },
    {
      type: 'state_machine' as const,
      name: 'plan_status_flow',
      label: '方案状态流转',
      field: 'status',
      initialStates: ['draft'],
      message: '方案状态只能按「草稿 → 已发布 → 已关闭 → 已归档」推进。',
      transitions: {
        draft: ['published'],
        published: ['closed'],
        closed: ['archived'],
        archived: [],
      },
    },
  ],

  enable: { trackHistory: true, apiEnabled: true, searchable: true, files: true },
});

/** 方案的审核流程节点(蓝图 B-M3-02):顺序、类型、审核岗位,随方案发布冻结。 */
export const PlanStep = ObjectSchema.create({
  name: 'kpi_plan_step',
  label: '流程节点',
  pluralLabel: '流程节点',
  icon: 'git-branch',
  description: '方案的审核节点顺序与审核岗位。',
  sharingModel: 'controlled_by_parent',
  nameField: 'label',

  fields: {
    plan: Field.masterDetail('kpi_plan', {
      label: '所属方案',
      required: true,
      deleteBehavior: 'cascade',
      inlineEdit: 'grid',
      inlineTitle: '审核流程节点',
    }),
    seq: Field.number({ label: '顺序', required: true, scale: 0, min: 1, max: 20 }),
    step_type: Field.select({
      label: '节点类型',
      required: true,
      options: [
        { label: '部门填报', value: 'dept_submit', default: true },
        { label: '分公司核对(并行)', value: 'branch_check' },
        { label: '人力审核', value: 'hr_review' },
        { label: '领导审批', value: 'leader_approve' },
      ],
    }),
    label: Field.text({ label: '节点名称', required: true, maxLength: 50 }),
    approver_position: Field.select({
      label: '审核岗位',
      required: true,
      options: [
        { label: '部门填报人员', value: 'kpi_dept_reporter', default: true },
        { label: '分公司核对人员', value: 'kpi_branch_checker' },
        { label: '人力审核', value: 'kpi_hr_reviewer' },
        { label: '人力负责人', value: 'kpi_hr_head' },
        { label: '分管领导', value: 'kpi_exec_leader' },
      ],
    }),
  },
});

/** 参与主体与考核关系(蓝图 B-M3-03):谁被考核、谁考核、主体权重、分管领导。 */
export const PlanSubject = ObjectSchema.create({
  name: 'kpi_plan_subject',
  label: '参与主体',
  pluralLabel: '参与主体',
  icon: 'building',
  description: '方案的考核主体、考核部门、主体权重与分管领导。',
  sharingModel: 'controlled_by_parent',
  nameField: 'name',

  fields: {
    plan: Field.masterDetail('kpi_plan', {
      label: '所属方案',
      required: true,
      deleteBehavior: 'cascade',
      inlineEdit: 'grid',
      inlineTitle: '参与主体与考核关系',
    }),
    name: Field.text({ label: '主体名称', readonly: true, maxLength: 200 }),
    subject: Field.lookup('sys_business_unit', { label: '考核主体', required: true }),
    subject_type: Field.select({
      label: '主体类型',
      required: true,
      options: [
        { label: '总公司部门', value: 'department', default: true },
        { label: '分公司', value: 'branch' },
      ],
    }),
    assessor_unit: Field.lookup('sys_business_unit', { label: '考核部门(出指标方)' }),
    subject_weight: Field.number({ label: '主体权重(%)', scale: 2, min: 0, max: 100, defaultValue: 0 }),
    leader: Field.user({ label: '分管领导' }),
    remark: Field.text({ label: '备注', maxLength: 200 }),
  },
});

/** 指标下达(蓝图 B-M3-04):指标 × 主体 × 权重 × 目标值。发布后冻结。 */
export const PlanIndicator = ObjectSchema.create({
  name: 'kpi_plan_indicator',
  label: '指标下达',
  pluralLabel: '指标下达',
  icon: 'list-checks',
  description: '把指标分配到考核主体,并给定权重与目标值。',
  sharingModel: 'controlled_by_parent',
  nameField: 'name',

  fields: {
    plan: Field.masterDetail('kpi_plan', {
      label: '所属方案',
      required: true,
      deleteBehavior: 'cascade',
      inlineEdit: 'grid',
      inlineTitle: '指标下达',
    }),
    name: Field.text({ label: '下达名称', readonly: true, maxLength: 300 }),
    indicator: Field.lookup('kpi_indicator', { label: '指标', required: true }),
    subject: Field.lookup('sys_business_unit', { label: '考核主体', required: true }),
    weight: Field.number({ label: '权重(%)', required: true, scale: 2, min: 0, max: 100 }),
    target_value: Field.number({ label: '目标值', scale: 4, min: -999999999, max: 999999999 }),
    baseline_value: Field.number({ label: '基准值(上期)', scale: 4, min: -999999999, max: 999999999 }),
    data_source: Field.select({
      label: '数据来源(覆盖指标默认)',
      options: [
        { label: '沿用指标定义', value: 'inherit', default: true },
        { label: '人工填报', value: 'manual' },
        { label: '批量导入', value: 'import' },
        { label: '系统计算', value: 'system' },
      ],
    }),
    dispute_status: Field.select({
      label: '争议状态',
      readonly: true,
      options: [
        { label: '无争议', value: 'none', default: true, color: '#94A3B8' },
        { label: '争议中', value: 'open', color: '#F59E0B' },
        { label: '已解决', value: 'resolved', color: '#10B981' },
      ],
    }),
    remark: Field.text({ label: '备注', maxLength: 200 }),
  },
});

/** 指标争议(蓝图 B-M3-05):分公司对下达指标提出的异议与处理结论。 */
export const Dispute = ObjectSchema.create({
  name: 'kpi_dispute',
  label: '指标争议',
  pluralLabel: '指标争议',
  icon: 'message-square-warning',
  description: '业务部门与分公司就某项指标下达的争议协商记录。',
  sharingModel: 'public_read_write',
  nameField: 'name',

  fields: {
    name: Field.autonumber({ label: '争议编号', autonumberFormat: 'ZY-{YYYY}{MM}-{0000}' }),
    plan_indicator: Field.lookup('kpi_plan_indicator', { label: '争议的指标下达', required: true }),
    raised_unit: Field.lookup('sys_business_unit', { label: '提出单位', required: true }),
    raised_by: Field.user({ label: '提出人', defaultValue: 'current_user', readonly: true }),
    reason: Field.textarea({ label: '争议理由', required: true }),
    status: Field.select({
      label: '状态',
      required: true,
      options: [
        { label: '待处理', value: 'open', default: true, color: '#F59E0B' },
        { label: '已采纳', value: 'accepted', color: '#10B981' },
        { label: '已驳回', value: 'rejected', color: '#EF4444' },
      ],
    }),
    resolution: Field.textarea({ label: '处理结论' }),
    resolved_by: Field.user({ label: '处理人', readonly: true }),
    resolved_at: Field.datetime({ label: '处理时间', readonly: true }),
  },

  validations: [
    {
      type: 'state_machine' as const,
      name: 'dispute_status_flow',
      label: '争议状态流转',
      field: 'status',
      initialStates: ['open'],
      message: '争议只能从「待处理」变为「已采纳」或「已驳回」。',
      transitions: { open: ['accepted', 'rejected'], accepted: [], rejected: [] },
    },
    {
      type: 'script' as const,
      name: 'dispute_resolution_required',
      label: '处理结论必填',
      condition: P`(record.status == "accepted" || record.status == "rejected") && (record.resolution == null || record.resolution == "")`,
      message: '处理争议失败:处理结论不能为空。请填写处理结论后再提交。',
      severity: 'error' as const,
      events: ['update'],
    },
  ],

  enable: { trackHistory: true, files: true },
});

/** 到人分工(蓝图 B-M3-06):员工与部门板块的对应关系、权重与个人系数。 */
export const StaffAssignment = ObjectSchema.create({
  name: 'kpi_staff_assignment',
  label: '到人分工',
  pluralLabel: '到人分工',
  icon: 'users',
  description: '员工与部门板块的对应关系及其权重、个人系数。',
  sharingModel: 'controlled_by_parent',
  nameField: 'name',

  fields: {
    plan: Field.masterDetail('kpi_plan', {
      label: '所属方案',
      required: true,
      deleteBehavior: 'cascade',
      inlineEdit: 'grid',
      inlineTitle: '到人分工',
    }),
    name: Field.text({ label: '分工名称', readonly: true, maxLength: 200 }),
    employee: Field.user({ label: '员工', required: true }),
    unit: Field.lookup('sys_business_unit', { label: '部门板块', required: true }),
    weight: Field.number({ label: '分工权重(%)', required: true, scale: 2, min: 0, max: 100, defaultValue: 100 }),
    coefficient: Field.number({ label: '个人系数', required: true, scale: 2, min: 0, max: 2, defaultValue: 1 }),
    remark: Field.text({ label: '备注', maxLength: 200 }),
  },
});

/** 个人承接项(蓝图 B-M3-06):员工直接承担的下达指标及权重、目标。 */
export const PersonalItem = ObjectSchema.create({
  name: 'kpi_personal_item',
  label: '个人承接项',
  pluralLabel: '个人承接项',
  icon: 'user-check',
  description: '员工个人承担的具体指标及权重、目标。',
  sharingModel: 'controlled_by_parent',
  nameField: 'name',

  fields: {
    assignment: Field.masterDetail('kpi_staff_assignment', {
      label: '所属分工',
      required: true,
      deleteBehavior: 'cascade',
      inlineEdit: 'grid',
      inlineTitle: '个人承接项',
    }),
    name: Field.text({ label: '承接项名称', readonly: true, maxLength: 300 }),
    plan_indicator: Field.lookup('kpi_plan_indicator', { label: '承接的指标下达', required: true }),
    weight: Field.number({ label: '承接权重(%)', required: true, scale: 2, min: 0, max: 100 }),
    target_value: Field.number({ label: '个人目标值', scale: 4, min: -999999999, max: 999999999 }),
  },
});
