import { defineReport } from '@objectstack/spec/ui';

/** 组织单元 × 汇总维度 的得分矩阵,可钻取到结果记录。 */
export const UnitScoreMatrixReport = defineReport({
  name: 'kpi_unit_score_matrix',
  label: '组织单元 × 维度 得分矩阵',
  description: '部门与分公司在各汇总维度下的平均得分交叉表。',
  type: 'matrix',
  drilldown: true,
  dataset: 'kpi_result_metrics',
  rows: ['unit'],
  columns: ['dimension'],
  values: ['avg_score'],
});

/** 到人得分汇总(含分管领导),按人员分组。 */
export const PersonScoresReport = defineReport({
  name: 'kpi_person_scores',
  label: '到人得分',
  description: '每位员工与分管领导的得分与排名。',
  type: 'summary',
  drilldown: true,
  dataset: 'kpi_result_metrics',
  // 行维度用 `person_label`(结果记录的名称,含姓名):`person` 出的是原始用户 id,
  // 平台的数据集维度解析只认 lookup 字段、不认 user 字段(见 datasets/index.ts 的说明)。
  rows: ['person_label', 'dimension'],
  values: ['avg_score', 'sum_weighted'],
  runtimeFilter: { dimension: { $in: ['person', 'leader'] } },
});

/** 指标完成情况:按指标看平均完成率与得分合计。 */
export const IndicatorCompletionReport = defineReport({
  name: 'kpi_indicator_completion',
  label: '指标完成情况',
  description: '各指标的填报行数、平均完成率与得分合计。',
  type: 'summary',
  drilldown: true,
  dataset: 'kpi_line_metrics',
  rows: ['indicator_name', 'scoring_method'],
  values: ['line_count', 'avg_completion', 'sum_score'],
  chart: { type: 'bar', xAxis: 'indicator_name', yAxis: 'avg_completion' },
});
