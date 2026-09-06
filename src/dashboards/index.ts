import type { Dashboard } from '@objectstack/spec/ui';

type ChartType = 'bar' | 'column' | 'donut' | 'horizontal-bar' | 'line' | 'pie';
const axis = (type: ChartType, x: string, y: string) => ({
  type,
  xAxis: { field: x, showGridLines: true, logarithmic: false },
  yAxis: [{ field: y, showGridLines: true, logarithmic: false }],
  showLegend: true,
  showDataLabels: true,
});

/** 结果看板:四个维度的平均得分、排名分布。 */
export const ResultsDashboard: Dashboard = {
  name: 'kpi_results_dashboard',
  label: '考核结果看板',
  description: '部门、分公司、到人、分管领导四个维度的得分总览,可钻取到结果明细。',
  columns: 12,
  globalFilters: [
    {
      name: 'dimension',
      field: 'dimension',
      label: '汇总维度',
      type: 'select',
      options: [
        { value: 'department', label: '部门' },
        { value: 'branch', label: '分公司' },
        { value: 'person', label: '到人' },
        { value: 'leader', label: '分管领导' },
      ],
      scope: 'dashboard',
    },
  ],
  widgets: [
    { id: 'm_count', type: 'metric', title: '结果条数', dataset: 'kpi_result_metrics', values: ['result_count'], colorVariant: 'blue', layout: { x: 0, y: 0, w: 3, h: 2 } },
    { id: 'm_avg', type: 'metric', title: '平均得分', dataset: 'kpi_result_metrics', values: ['avg_score'], colorVariant: 'success', layout: { x: 3, y: 0, w: 3, h: 2 } },
    { id: 'm_max', type: 'metric', title: '最高得分', dataset: 'kpi_result_metrics', values: ['max_score'], colorVariant: 'warning', layout: { x: 6, y: 0, w: 3, h: 2 } },
    { id: 'm_min', type: 'metric', title: '最低得分', dataset: 'kpi_result_metrics', values: ['min_score'], colorVariant: 'danger', layout: { x: 9, y: 0, w: 3, h: 2 } },
    // 只算部门与分公司两个维度(#38 第 4 条):到人 / 分管领导的结果行没有组织单元,
    // 不过滤就会在轴上多出一根把它们全兜进去的「(未指定)」柱。固定过滤 + 关掉与全局
    // 「汇总维度」筛选器的绑定,写法与下面的「人员得分」一致;范围写进标题,免得看图的人
    // 以为全局筛选没生效。
    { id: 'bar_unit', type: 'bar', title: '各组织单元平均得分(部门 / 分公司)', dataset: 'kpi_result_metrics', dimensions: ['unit'], values: ['avg_score'], filter: { dimension: { $in: ['department', 'branch'] } }, filterBindings: { dimension: false }, chartConfig: axis('bar', 'unit', 'avg_score'), layout: { x: 0, y: 2, w: 6, h: 5 } },
    // 轴用 `person_label`(结果记录的名称,含姓名)而不是 `person`:后者出的是原始用户 id
    // ——平台的数据集维度解析只认 lookup 字段,不认 user 字段(见 datasets/index.ts 的说明)。
    { id: 'bar_person', type: 'horizontal-bar', title: '人员得分', dataset: 'kpi_result_metrics', dimensions: ['person_label'], values: ['avg_score'], filter: { dimension: { $in: ['person', 'leader'] } }, filterBindings: { dimension: false }, chartConfig: axis('horizontal-bar', 'person_label', 'avg_score'), layout: { x: 6, y: 2, w: 6, h: 5 } },
    { id: 'tbl_dim', type: 'table', title: '按维度汇总', dataset: 'kpi_result_metrics', dimensions: ['dimension'], values: ['result_count', 'avg_score', 'max_score', 'min_score'], filterBindings: { dimension: false }, layout: { x: 0, y: 7, w: 12, h: 4 } },
  ],
};

/** 流程进度看板:填报单在各节点的分布与指标完成情况。 */
export const ProgressDashboard: Dashboard = {
  name: 'kpi_progress_dashboard',
  label: '考核流程进度',
  description: '各填报单所处节点、主体类型分布与指标平均完成率。',
  columns: 12,
  widgets: [
    { id: 'p_draft', type: 'metric', title: '填报中', dataset: 'kpi_sheet_metrics', values: ['sheet_count'], filter: { status: 'draft' }, colorVariant: 'blue', layout: { x: 0, y: 0, w: 3, h: 2 } },
    { id: 'p_check', type: 'metric', title: '分公司核对中', dataset: 'kpi_sheet_metrics', values: ['sheet_count'], filter: { status: 'branch_checking' }, colorVariant: 'warning', layout: { x: 3, y: 0, w: 3, h: 2 } },
    { id: 'p_review', type: 'metric', title: '审核审批中', dataset: 'kpi_sheet_metrics', values: ['sheet_count'], filter: { status: { $in: ['hr_reviewing', 'leader_approving'] } }, colorVariant: 'warning', layout: { x: 6, y: 0, w: 3, h: 2 } },
    { id: 'p_done', type: 'metric', title: '已通过 / 已归档', dataset: 'kpi_sheet_metrics', values: ['sheet_count'], filter: { status: { $in: ['approved', 'archived'] } }, colorVariant: 'success', layout: { x: 9, y: 0, w: 3, h: 2 } },
    { id: 'p_status', type: 'donut', title: '填报单状态分布', dataset: 'kpi_sheet_metrics', dimensions: ['status'], values: ['sheet_count'], chartConfig: axis('donut', 'status', 'sheet_count'), layout: { x: 0, y: 2, w: 4, h: 5 } },
    { id: 'p_type', type: 'column', title: '主体类型平均指标得分', dataset: 'kpi_sheet_metrics', dimensions: ['subject_type'], values: ['avg_indicator_score'], chartConfig: axis('column', 'subject_type', 'avg_indicator_score'), layout: { x: 4, y: 2, w: 4, h: 5 } },
    { id: 'p_completion', type: 'horizontal-bar', title: '各指标平均完成率(%)', dataset: 'kpi_line_metrics', dimensions: ['indicator_name'], values: ['avg_completion'], chartConfig: axis('horizontal-bar', 'indicator_name', 'avg_completion'), layout: { x: 8, y: 2, w: 4, h: 5 } },
  ],
};
