import { ObjectSchema, Field } from '@objectstack/spec/data';
import { cel, P } from '@objectstack/spec';

/**
 * 填报单(蓝图 B-M4-01~05):方案 × 考核主体的一张填报表,承载审核状态机。
 *
 * 状态机唯一真值在 `src/hooks/sheet-transition.hook.ts`;这里的 state_machine 校验
 * 只是拓扑护栏(合法相邻状态),节点顺序、审核岗位、驳回原因必填、并行核对聚合
 * 都在 hook 里按方案的流程节点判定。按钮(script action)只改 status 字段。
 */
export const EntrySheet = ObjectSchema.create({
  name: 'kpi_entry_sheet',
  label: '填报单',
  pluralLabel: '填报单',
  icon: 'file-spreadsheet',
  description: '某方案下某考核主体的指标填报与审核记录。',
  sharingModel: 'private',
  nameField: 'name',

  fields: {
    name: Field.text({ label: '填报单名称', readonly: true, searchable: true, maxLength: 300 }),
    plan: Field.lookup('kpi_plan', { label: '考核方案', required: true }),
    subject: Field.lookup('sys_business_unit', { label: '考核主体', required: true }),
    subject_type: Field.select({
      label: '主体类型',
      options: [
        { label: '总公司部门', value: 'department', default: true },
        { label: '分公司', value: 'branch' },
      ],
    }),
    status: Field.select({
      label: '状态',
      required: true,
      options: [
        { label: '填报中', value: 'draft', default: true, color: '#94A3B8' },
        { label: '已提交', value: 'submitted', color: '#3B82F6' },
        { label: '分公司核对中', value: 'branch_checking', color: '#F59E0B' },
        { label: '人力审核中', value: 'hr_reviewing', color: '#8B5CF6' },
        { label: '领导审批中', value: 'leader_approving', color: '#EC4899' },
        { label: '已通过', value: 'approved', color: '#10B981' },
        { label: '已归档', value: 'archived', color: '#0F766E' },
      ],
    }),
    current_step: Field.number({ label: '当前节点序号', readonly: true, scale: 0, min: 0, max: 20, defaultValue: 0 }),
    pending_action: Field.select({
      label: '待执行动作(按钮写入)',
      options: [
        { label: '提交', value: 'submit' },
        { label: '审核通过', value: 'approve' },
        { label: '驳回', value: 'reject' },
        { label: '归档', value: 'archive' },
      ],
    }),
    action_reason: Field.textarea({ label: '动作原因/意见' }),
    last_reject_reason: Field.textarea({ label: '最近驳回原因', readonly: true }),
    submitted_at: Field.datetime({ label: '提交时间', readonly: true }),
    submitted_by: Field.user({ label: '提交人', readonly: true }),
    approved_at: Field.datetime({ label: '审批通过时间', readonly: true }),
    approved_by: Field.user({ label: '最终审批人', readonly: true }),
    archived_at: Field.datetime({ label: '归档时间', readonly: true }),
    line_count: Field.summary({
      label: '指标数',
      summaryOperations: { object: 'kpi_entry_line', field: 'id', function: 'count' },
    }),
    weight_total: Field.summary({
      label: '权重合计(%)',
      summaryOperations: { object: 'kpi_entry_line', field: 'weight', function: 'sum' },
    }),
    indicator_score: Field.summary({
      label: '指标得分合计',
      summaryOperations: { object: 'kpi_entry_line', field: 'final_score', function: 'sum' },
    }),
    bonus_total: Field.summary({
      label: '加减分合计',
      summaryOperations: { object: 'kpi_bonus', field: 'signed_points', function: 'sum', filter: { status: 'approved' } },
    }),
    total_score: Field.formula({
      label: '最终得分',
      returnType: 'number',
      scale: 2,
      expression: cel`(record.indicator_score == null ? 0.0 : record.indicator_score) + (record.bonus_total == null ? 0.0 : record.bonus_total)`,
    }),
    remark: Field.textarea({ label: '填报说明' }),
  },

  validations: [
    {
      type: 'state_machine' as const,
      name: 'sheet_status_flow',
      label: '填报单状态流转',
      field: 'status',
      initialStates: ['draft'],
      message: '填报单状态流转不合法。请使用页面上的提交、核对、审核、驳回按钮操作。',
      // 拓扑护栏:允许流程内的合法相邻状态;节点顺序、岗位、驳回原因等真正的规则在 hook。
      transitions: {
        draft: ['submitted', 'branch_checking', 'hr_reviewing', 'leader_approving', 'approved'],
        submitted: ['branch_checking', 'hr_reviewing', 'leader_approving', 'approved', 'draft'],
        branch_checking: ['hr_reviewing', 'leader_approving', 'approved', 'draft', 'submitted'],
        hr_reviewing: ['leader_approving', 'approved', 'branch_checking', 'submitted', 'draft'],
        leader_approving: ['approved', 'hr_reviewing', 'branch_checking', 'submitted', 'draft'],
        approved: ['archived'],
        archived: [],
      },
    },
  ],

  enable: { trackHistory: true, apiEnabled: true, searchable: true, files: true, activities: true },
});

/**
 * 填报明细(蓝图 B-M4-01/02):每个指标一行。目标值、权重、计分方式在发布时从
 * 指标下达冻结为副本,计分引擎只读本行数据,历史周期结果不随指标库改动漂移。
 */
export const EntryLine = ObjectSchema.create({
  name: 'kpi_entry_line',
  label: '填报明细',
  pluralLabel: '填报明细',
  icon: 'table',
  description: '单个指标的实际值、完成率、得分与计算说明。',
  sharingModel: 'controlled_by_parent',
  nameField: 'indicator_name',

  fields: {
    sheet: Field.masterDetail('kpi_entry_sheet', {
      label: '所属填报单',
      required: true,
      deleteBehavior: 'cascade',
      inlineEdit: 'grid',
      inlineTitle: '指标填报',
    }),
    plan_indicator: Field.lookup('kpi_plan_indicator', { label: '来源下达', required: true }),
    indicator: Field.lookup('kpi_indicator', { label: '指标', readonly: true }),
    indicator_name: Field.text({ label: '指标名称', readonly: true, searchable: true, maxLength: 200 }),
    unit: Field.text({ label: '计量单位', readonly: true, maxLength: 20 }),
    direction: Field.select({
      label: '指标方向',
      readonly: true,
      options: [
        { label: '越高越好', value: 'positive', default: true },
        { label: '越低越好', value: 'negative' },
      ],
    }),
    scoring_method: Field.select({
      label: '计分方式',
      readonly: true,
      options: [
        { label: '完成率线性', value: 'linear', default: true },
        { label: '阶梯计分', value: 'step' },
        { label: '区间插值', value: 'range' },
        { label: '自定义公式', value: 'formula' },
      ],
    }),
    target_value: Field.number({ label: '目标值', readonly: true, scale: 4, min: -999999999, max: 999999999 }),
    weight: Field.number({ label: '权重(%)', readonly: true, scale: 2, min: 0, max: 100 }),
    actual_value: Field.number({ label: '实际值', scale: 4, min: -999999999, max: 999999999 }),
    completion_rate: Field.number({ label: '完成率(%)', readonly: true, scale: 2, min: -100000, max: 100000 }),
    score_rate: Field.number({ label: '得分率(%)', readonly: true, scale: 2, min: 0, max: 1000 }),
    score: Field.number({ label: '指标得分', readonly: true, scale: 2, min: 0, max: 1000 }),
    adjusted_score: Field.number({ label: '调整后得分', readonly: true, scale: 2, min: 0, max: 1000 }),
    final_score: Field.number({ label: '最终得分', readonly: true, scale: 2, min: 0, max: 1000 }),
    calc_trace: Field.textarea({ label: '计算说明', readonly: true }),
    last_adjustment: Field.lookup('kpi_adjustment', { label: '最近调整' }),
    remark: Field.text({ label: '备注', maxLength: 300 }),
  },

  enable: { trackHistory: true, apiEnabled: true, files: true },
});

/** 分公司核对任务(蓝图 B-M4-04):提交时按分公司生成,全部确认后自动推进。 */
export const CheckTask = ObjectSchema.create({
  name: 'kpi_check_task',
  label: '核对任务',
  pluralLabel: '核对任务',
  icon: 'clipboard-check',
  description: '分公司对填报单的并行核对:确认或提出争议。',
  sharingModel: 'private',
  nameField: 'name',

  fields: {
    name: Field.text({ label: '任务名称', readonly: true, maxLength: 300 }),
    sheet: Field.lookup('kpi_entry_sheet', { label: '填报单', required: true }),
    // 冗余存一份方案:数据范围按「方案 × 分公司」授权,共享规则的条件需要一个能直接筛的
    // 方案字段(条件只能比较本对象的列,不能顺着填报单跳一层)。由系统在生成任务时写入。
    plan: Field.lookup('kpi_plan', { label: '考核方案', readonly: true }),
    branch: Field.lookup('sys_business_unit', { label: '核对分公司', required: true }),
    status: Field.select({
      label: '核对状态',
      required: true,
      options: [
        { label: '待核对', value: 'pending', default: true, color: '#F59E0B' },
        { label: '已确认', value: 'confirmed', color: '#10B981' },
        { label: '有争议', value: 'disputed', color: '#EF4444' },
      ],
    }),
    comment: Field.textarea({ label: '核对意见' }),
    decided_by: Field.user({ label: '核对人', readonly: true }),
    decided_at: Field.datetime({ label: '核对时间', readonly: true }),
  },

  validations: [
    {
      type: 'state_machine' as const,
      name: 'check_task_flow',
      label: '核对状态流转',
      field: 'status',
      initialStates: ['pending'],
      message: '核对任务只能从「待核对」变为「已确认」或「有争议」;有争议的任务可重新确认。',
      // confirmed → pending 只在填报单被驳回回到核对节点时由系统重置(核对 hook 拒绝非系统的回退)
      transitions: { pending: ['confirmed', 'disputed'], disputed: ['confirmed', 'pending'], confirmed: ['pending'] },
    },
    {
      type: 'script' as const,
      name: 'check_task_dispute_comment',
      label: '争议须填意见',
      condition: P`record.status == "disputed" && (record.comment == null || record.comment == "")`,
      message: '提出争议失败:核对意见不能为空。请填写争议内容后再提交。',
      severity: 'error' as const,
      events: ['insert', 'update'],
    },
  ],
});

/** 审核记录(蓝图 B-M1-05 / B-M4-05):提交、核对、审核、驳回、归档全部留痕,只增不改。 */
export const ReviewRecord = ObjectSchema.create({
  name: 'kpi_review_record',
  label: '审核记录',
  pluralLabel: '审核记录',
  icon: 'history',
  description: '填报单每一次流程动作的留痕:谁、何时、从哪到哪、原因。',
  sharingModel: 'public_read',
  nameField: 'name',

  fields: {
    name: Field.autonumber({ label: '记录编号', autonumberFormat: 'SH-{YYYY}{MM}{DD}-{00000}' }),
    sheet: Field.lookup('kpi_entry_sheet', { label: '填报单', required: true }),
    action: Field.select({
      label: '动作',
      required: true,
      options: [
        { label: '生成', value: 'generate' },
        { label: '提交', value: 'submit' },
        { label: '核对确认', value: 'confirm' },
        { label: '提出争议', value: 'dispute' },
        { label: '审核通过', value: 'approve' },
        { label: '驳回', value: 'reject' },
        { label: '归档', value: 'archive' },
        { label: '数据调整', value: 'adjust' },
      ],
    }),
    step_label: Field.text({ label: '节点', maxLength: 50 }),
    from_status: Field.text({ label: '原状态', maxLength: 30 }),
    to_status: Field.text({ label: '新状态', maxLength: 30 }),
    actor: Field.user({ label: '经办人' }),
    reason: Field.textarea({ label: '原因/意见' }),
    acted_at: Field.datetime({ label: '时间' }),
  },
});

/** 加减分(蓝图 B-M4-06):指标得分之外的加分或扣分,审批通过后计入最终得分。 */
export const Bonus = ObjectSchema.create({
  name: 'kpi_bonus',
  label: '加减分',
  pluralLabel: '加减分',
  icon: 'plus-minus',
  description: '在指标得分之外单独记录的加分或扣分项。',
  sharingModel: 'controlled_by_parent',
  nameField: 'title',

  fields: {
    sheet: Field.masterDetail('kpi_entry_sheet', {
      label: '所属填报单',
      required: true,
      deleteBehavior: 'cascade',
      inlineEdit: 'grid',
      inlineTitle: '加减分',
    }),
    title: Field.text({ label: '事项', required: true, maxLength: 200 }),
    bonus_type: Field.select({
      label: '类型',
      required: true,
      options: [
        { label: '加分', value: 'add', default: true, color: '#10B981' },
        { label: '扣分', value: 'deduct', color: '#EF4444' },
      ],
    }),
    points: Field.number({ label: '分值', required: true, scale: 2, min: 0, max: 100 }),
    signed_points: Field.number({ label: '计入分值', readonly: true, scale: 2, min: -100, max: 100 }),
    reason: Field.textarea({ label: '依据', required: true }),
    status: Field.select({
      label: '状态',
      required: true,
      options: [
        { label: '待审批', value: 'draft', default: true, color: '#F59E0B' },
        { label: '已批准', value: 'approved', color: '#10B981' },
        { label: '已否决', value: 'rejected', color: '#94A3B8' },
      ],
    }),
    approved_by: Field.user({ label: '审批人', readonly: true }),
    approved_at: Field.datetime({ label: '审批时间', readonly: true }),
  },

  validations: [
    {
      type: 'state_machine' as const,
      name: 'bonus_status_flow',
      label: '加减分状态流转',
      field: 'status',
      initialStates: ['draft'],
      message: '加减分只能从「待审批」变为「已批准」或「已否决」。',
      transitions: { draft: ['approved', 'rejected'], approved: [], rejected: [] },
    },
  ],

  enable: { trackHistory: true, files: true },
});

/** 数据调整申请(蓝图 B-M4-07):源数据或计算结果的事后更正,审批通过后落地并留痕。 */
export const Adjustment = ObjectSchema.create({
  name: 'kpi_adjustment',
  label: '数据调整',
  pluralLabel: '数据调整',
  icon: 'file-pen',
  description: '对已提交的实际值(源数据)或得分(计算结果)发起调整申请。',
  sharingModel: 'private',
  nameField: 'name',

  fields: {
    name: Field.autonumber({ label: '调整单号', autonumberFormat: 'TZ-{YYYY}{MM}-{0000}' }),
    sheet: Field.lookup('kpi_entry_sheet', { label: '填报单', required: true }),
    // 与核对任务同理:数据范围按「方案 × 考核主体」授权,方案要能直接筛。由 hook 写入。
    plan: Field.lookup('kpi_plan', { label: '考核方案', readonly: true }),
    subject: Field.lookup('sys_business_unit', { label: '考核主体', readonly: true }),
    line: Field.lookup('kpi_entry_line', { label: '调整的指标明细', required: true }),
    adjust_type: Field.select({
      label: '调整类型',
      required: true,
      options: [
        { label: '源数据(实际值)', value: 'source', default: true },
        { label: '计算结果(得分)', value: 'result' },
      ],
    }),
    old_value: Field.number({ label: '调整前值', readonly: true, scale: 4, min: -999999999, max: 999999999 }),
    new_value: Field.number({ label: '调整后值', required: true, scale: 4, min: -999999999, max: 999999999 }),
    reason: Field.textarea({ label: '调整原因', required: true }),
    status: Field.select({
      label: '状态',
      required: true,
      options: [
        { label: '草稿', value: 'draft', default: true, color: '#94A3B8' },
        { label: '待审批', value: 'submitted', color: '#F59E0B' },
        { label: '已批准', value: 'approved', color: '#10B981' },
        { label: '已否决', value: 'rejected', color: '#EF4444' },
      ],
    }),
    requested_by: Field.user({ label: '申请人', defaultValue: 'current_user', readonly: true }),
    decided_by: Field.user({ label: '审批人', readonly: true }),
    decided_at: Field.datetime({ label: '审批时间', readonly: true }),
    decision_reason: Field.textarea({ label: '审批意见' }),
    applied_at: Field.datetime({ label: '落地时间', readonly: true }),
  },

  validations: [
    {
      type: 'state_machine' as const,
      name: 'adjustment_status_flow',
      label: '调整状态流转',
      field: 'status',
      initialStates: ['draft'],
      message: '调整申请只能按「草稿 → 待审批 → 已批准 / 已否决」推进。',
      transitions: { draft: ['submitted'], submitted: ['approved', 'rejected', 'draft'], approved: [], rejected: [] },
    },
    {
      type: 'script' as const,
      name: 'adjustment_reject_reason',
      label: '否决须填意见',
      condition: P`record.status == "rejected" && (record.decision_reason == null || record.decision_reason == "")`,
      message: '否决调整申请失败:审批意见不能为空。请填写否决原因后再提交。',
      severity: 'error' as const,
      events: ['update'],
    },
  ],

  enable: { trackHistory: true, files: true },
});
