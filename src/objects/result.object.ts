import { ObjectSchema, Field } from '@objectstack/spec/data';

/** 考核结果(蓝图 B-M5-01):四个维度的汇总结果,审批通过时由汇总引擎生成。 */
export const Result = ObjectSchema.create({
  name: 'kpi_result',
  label: '考核结果',
  pluralLabel: '考核结果',
  icon: 'trophy',
  description: '按部门、分公司、到人、分管领导四个维度汇总的得分与排名。',
  sharingModel: 'private',
  nameField: 'name',

  fields: {
    name: Field.text({ label: '结果名称', readonly: true, searchable: true, maxLength: 300 }),
    plan: Field.lookup('kpi_plan', { label: '考核方案', required: true }),
    dimension: Field.select({
      label: '汇总维度',
      required: true,
      options: [
        { label: '部门', value: 'department', default: true },
        { label: '分公司', value: 'branch' },
        { label: '到人', value: 'person' },
        { label: '分管领导', value: 'leader' },
      ],
    }),
    unit: Field.lookup('sys_business_unit', { label: '组织单元' }),
    person: Field.user({ label: '人员' }),
    sheet: Field.lookup('kpi_entry_sheet', { label: '来源填报单' }),
    score: Field.number({ label: '得分', readonly: true, scale: 2, min: -1000, max: 1000 }),
    weighted_score: Field.number({ label: '加权得分', readonly: true, scale: 2, min: -1000, max: 1000 }),
    rank: Field.number({ label: '排名', readonly: true, scale: 0, min: 1, max: 100000 }),
    breakdown: Field.json({ label: '计算明细' }),
    generated_at: Field.datetime({ label: '生成时间', readonly: true }),
  },
});

/** 归档快照(蓝图 B-M5-02):审批通过后的不可变留存;hook 拒绝任何改删。 */
export const Snapshot = ObjectSchema.create({
  name: 'kpi_snapshot',
  label: '归档快照',
  pluralLabel: '归档快照',
  icon: 'archive',
  description: '某周期填报单归档后的不可变留存,历史查询以此为准。',
  // 快照里是某主体的最终得分与全量明细,按主体保密;可见范围由动态共享规则按主体放宽。
  sharingModel: 'private',
  nameField: 'name',

  fields: {
    name: Field.text({ label: '快照名称', readonly: true, searchable: true, maxLength: 300 }),
    plan: Field.lookup('kpi_plan', { label: '考核方案', required: true }),
    sheet: Field.lookup('kpi_entry_sheet', { label: '填报单', required: true }),
    subject: Field.lookup('sys_business_unit', { label: '考核主体' }),
    total_score: Field.number({ label: '最终得分', readonly: true, scale: 2, min: -1000, max: 1000 }),
    payload: Field.json({ label: '快照内容' }),
    checksum: Field.text({ label: '校验和', readonly: true, maxLength: 64 }),
    archived_by: Field.user({ label: '归档人', readonly: true }),
    archived_at: Field.datetime({ label: '归档时间', readonly: true }),
  },
});
