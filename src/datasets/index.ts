import { defineDataset } from '@objectstack/spec/ui';

export const ResultDataset = defineDataset({
  name: 'kpi_result_metrics',
  label: '考核结果指标',
  description: '四维汇总结果的得分与排名分析。',
  object: 'kpi_result',
  dimensions: [
    { name: 'dimension', label: '汇总维度', field: 'dimension', type: 'string' },
    { name: 'plan', label: '考核方案', field: 'plan', type: 'lookup' },
    { name: 'unit', label: '组织单元', field: 'unit', type: 'lookup' },
    { name: 'person', label: '人员', field: 'person', type: 'lookup' },
  ],
  measures: [
    { name: 'result_count', label: '结果数', aggregate: 'count' },
    { name: 'avg_score', label: '平均得分', aggregate: 'avg', field: 'score', format: '0.00' },
    { name: 'max_score', label: '最高得分', aggregate: 'max', field: 'score', format: '0.00' },
    { name: 'min_score', label: '最低得分', aggregate: 'min', field: 'score', format: '0.00' },
    { name: 'sum_weighted', label: '加权得分合计', aggregate: 'sum', field: 'weighted_score', format: '0.00' },
  ],
});

export const SheetDataset = defineDataset({
  name: 'kpi_sheet_metrics',
  label: '填报单进度',
  description: '填报单按状态、主体类型、方案的分布与得分。',
  object: 'kpi_entry_sheet',
  dimensions: [
    { name: 'status', label: '状态', field: 'status', type: 'string' },
    { name: 'subject_type', label: '主体类型', field: 'subject_type', type: 'string' },
    { name: 'plan', label: '考核方案', field: 'plan', type: 'lookup' },
    { name: 'subject', label: '考核主体', field: 'subject', type: 'lookup' },
  ],
  measures: [
    { name: 'sheet_count', label: '填报单数', aggregate: 'count' },
    { name: 'avg_indicator_score', label: '平均指标得分', aggregate: 'avg', field: 'indicator_score', format: '0.00' },
    { name: 'sum_bonus', label: '加减分合计', aggregate: 'sum', field: 'bonus_total', format: '0.00' },
  ],
});

export const LineDataset = defineDataset({
  name: 'kpi_line_metrics',
  label: '指标完成情况',
  description: '填报明细的完成率与得分,按指标和填报单分析。',
  object: 'kpi_entry_line',
  dimensions: [
    { name: 'indicator_name', label: '指标', field: 'indicator_name', type: 'string' },
    { name: 'scoring_method', label: '计分方式', field: 'scoring_method', type: 'string' },
    { name: 'sheet', label: '填报单', field: 'sheet', type: 'lookup' },
  ],
  measures: [
    { name: 'line_count', label: '指标行数', aggregate: 'count' },
    { name: 'avg_completion', label: '平均完成率(%)', aggregate: 'avg', field: 'completion_rate', format: '0.00' },
    { name: 'sum_score', label: '得分合计', aggregate: 'sum', field: 'final_score', format: '0.00' },
    { name: 'sum_weight', label: '权重合计', aggregate: 'sum', field: 'weight', format: '0.00' },
  ],
});
