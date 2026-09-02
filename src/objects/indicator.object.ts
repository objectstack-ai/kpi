import { ObjectSchema, Field } from '@objectstack/spec/data';
import { P } from '@objectstack/spec';

/**
 * 指标库 — 指标定义与计分规则(蓝图 B-M2-01~03)。
 *
 * 计分规则数据化:scoring_method 决定 `src/lib/scoring.ts` 走哪条口径;
 * 阶梯区间在子对象 kpi_indicator_step;公式方法用平台 CEL(变量:actual /
 * target / weight / rate,见 scoring.ts 头注释)。口径改动只改数据,不改代码。
 */
export const Indicator = ObjectSchema.create({
  name: 'kpi_indicator',
  label: '考核指标',
  pluralLabel: '考核指标',
  icon: 'target',
  description: '指标定义、数据来源与计分规则,版本可追溯。',
  sharingModel: 'public_read',
  nameField: 'name',

  fields: {
    code: Field.text({ label: '指标编码', required: true, unique: true, searchable: true, maxLength: 40 }),
    name: Field.text({ label: '指标名称', required: true, searchable: true, maxLength: 200 }),
    category: Field.select({
      label: '指标类别',
      required: true,
      options: [
        { label: '经营业绩', value: 'business', default: true, color: '#2563EB' },
        { label: '管理效能', value: 'management', color: '#7C3AED' },
        { label: '服务质量', value: 'service', color: '#059669' },
        { label: '安全合规', value: 'compliance', color: '#DC2626' },
        { label: '其他', value: 'other', color: '#64748B' },
      ],
    }),
    owner_unit: Field.lookup('sys_business_unit', { label: '责任板块(考核部门)', required: true }),
    data_source: Field.select({
      label: '数据来源',
      required: true,
      options: [
        { label: '人工填报', value: 'manual', default: true },
        { label: '批量导入', value: 'import' },
        { label: '系统计算', value: 'system' },
      ],
    }),
    unit: Field.text({ label: '计量单位', maxLength: 20 }),
    value_scale: Field.number({ label: '数值小数位', scale: 0, min: 0, max: 6, defaultValue: 2 }),
    direction: Field.select({
      label: '指标方向',
      required: true,
      options: [
        { label: '越高越好', value: 'positive', default: true },
        { label: '越低越好', value: 'negative' },
      ],
    }),
    scoring_method: Field.select({
      label: '计分方式',
      required: true,
      options: [
        { label: '完成率线性', value: 'linear', default: true },
        { label: '阶梯计分', value: 'step' },
        { label: '区间插值', value: 'range' },
        { label: '自定义公式', value: 'formula' },
      ],
    }),
    cap_rate: Field.number({ label: '完成率封顶(%)', scale: 2, min: 0, max: 1000, defaultValue: 120 }),
    floor_rate: Field.number({ label: '完成率保底(%)', scale: 2, min: 0, max: 1000, defaultValue: 0 }),
    range_lower_rate: Field.number({
      label: '区间下限完成率(%)',
      scale: 2, min: 0, max: 1000, defaultValue: 60,
      visibleWhen: 'record.scoring_method == "range"',
    }),
    range_upper_rate: Field.number({
      label: '区间上限完成率(%)',
      scale: 2, min: 0, max: 1000, defaultValue: 120,
      visibleWhen: 'record.scoring_method == "range"',
    }),
    score_formula: Field.textarea({
      label: '计分公式',
      visibleWhen: 'record.scoring_method == "formula"',
      requiredWhen: 'record.scoring_method == "formula"',
    }),
    description: Field.textarea({ label: '口径说明' }),
    status: Field.select({
      label: '状态',
      required: true,
      options: [
        { label: '启用', value: 'active', default: true, color: '#10B981' },
        { label: '停用', value: 'retired', color: '#94A3B8' },
      ],
    }),
    version_no: Field.number({ label: '版本号', scale: 0, min: 1, max: 9999, defaultValue: 1 }),
    superseded_by: Field.lookup('kpi_indicator', { label: '替代版本' }),
  },

  validations: [
    {
      type: 'cross_field' as const,
      name: 'indicator_cap_ge_floor',
      label: '封顶不低于保底',
      fields: ['cap_rate', 'floor_rate'],
      condition: P`record.cap_rate != null && record.floor_rate != null && record.cap_rate < record.floor_rate`,
      message: '完成率封顶不能低于保底。请把封顶值改为不小于保底值。',
      events: ['insert', 'update'],
    },
    {
      type: 'cross_field' as const,
      name: 'indicator_range_order',
      label: '区间上限高于下限',
      fields: ['range_lower_rate', 'range_upper_rate'],
      condition: P`record.scoring_method == "range" && record.range_lower_rate != null && record.range_upper_rate != null && record.range_upper_rate <= record.range_lower_rate`,
      message: '区间上限完成率必须高于下限。请调整区间范围。',
      events: ['insert', 'update'],
    },
    {
      type: 'state_machine' as const,
      name: 'indicator_status_flow',
      label: '指标状态流转',
      field: 'status',
      initialStates: ['active'],
      message: '指标状态只能从「启用」变为「停用」。',
      transitions: {
        active: ['retired'],
        retired: [],
      },
    },
  ],

  enable: { trackHistory: true, apiEnabled: true, searchable: true },
});

/** 阶梯计分区间(主从于指标)。完成率落在 [下限, 上限) 时取该行得分率。 */
export const IndicatorStep = ObjectSchema.create({
  name: 'kpi_indicator_step',
  label: '阶梯区间',
  pluralLabel: '阶梯区间',
  icon: 'stairs',
  description: '阶梯计分方式的完成率区间与对应得分率。',
  sharingModel: 'controlled_by_parent',
  nameField: 'label',

  fields: {
    indicator: Field.masterDetail('kpi_indicator', {
      label: '所属指标',
      required: true,
      deleteBehavior: 'cascade',
      inlineEdit: 'grid',
      inlineTitle: '阶梯区间',
    }),
    seq: Field.number({ label: '序号', scale: 0, min: 1, max: 99, defaultValue: 1 }),
    label: Field.text({ label: '区间名称', required: true, maxLength: 50 }),
    min_rate: Field.number({ label: '完成率下限(%,含)', required: true, scale: 2, min: 0, max: 1000 }),
    max_rate: Field.number({ label: '完成率上限(%,不含;空为无上限)', scale: 2, min: 0, max: 1000 }),
    score_rate: Field.number({ label: '得分率(%)', required: true, scale: 2, min: 0, max: 200 }),
  },

  validations: [
    {
      type: 'cross_field' as const,
      name: 'step_range_order',
      label: '区间上限高于下限',
      fields: ['min_rate', 'max_rate'],
      condition: P`record.max_rate != null && record.min_rate != null && record.max_rate <= record.min_rate`,
      message: '区间上限必须高于下限。请调整该阶梯的范围。',
      events: ['insert', 'update'],
    },
  ],
});
