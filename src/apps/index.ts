import { App } from '@objectstack/spec/ui';

export const KpiApp = App.create({
  name: 'kpi_app',
  label: 'KPI 考核管理',
  icon: 'target',
  branding: { primaryColor: '#1D4ED8' },
  navigation: [
    { id: 'nav_home', type: 'page', pageName: 'kpi_home', label: '工作台', icon: 'home' },
    {
      id: 'group_entry', type: 'group', label: '填报与审核', icon: 'file-spreadsheet',
      children: [
        { id: 'nav_sheets', type: 'object', objectName: 'kpi_entry_sheet', label: '填报单', icon: 'file-spreadsheet' },
        { id: 'nav_lines', type: 'object', objectName: 'kpi_entry_line', label: '填报明细', icon: 'table' },
        { id: 'nav_checks', type: 'object', objectName: 'kpi_check_task', label: '分公司核对', icon: 'clipboard-check' },
        { id: 'nav_bonus', type: 'object', objectName: 'kpi_bonus', label: '加减分', icon: 'plus-minus' },
        { id: 'nav_adjust', type: 'object', objectName: 'kpi_adjustment', label: '数据调整', icon: 'file-pen' },
      ],
    },
    {
      id: 'group_plan', type: 'group', label: '考核方案', icon: 'clipboard-list',
      children: [
        { id: 'nav_plans', type: 'object', objectName: 'kpi_plan', label: '方案版本', icon: 'clipboard-list' },
        { id: 'nav_plan_indicators', type: 'object', objectName: 'kpi_plan_indicator', label: '指标下达', icon: 'list-checks' },
        { id: 'nav_plan_subjects', type: 'object', objectName: 'kpi_plan_subject', label: '参与主体', icon: 'building' },
        { id: 'nav_assignments', type: 'object', objectName: 'kpi_staff_assignment', label: '到人分工', icon: 'users' },
        { id: 'nav_disputes', type: 'object', objectName: 'kpi_dispute', label: '指标争议', icon: 'message-square-warning' },
      ],
    },
    {
      id: 'group_results', type: 'group', label: '结果与归档', icon: 'trophy',
      children: [
        { id: 'nav_dashboard', type: 'dashboard', dashboardName: 'kpi_results_dashboard', label: '结果看板', icon: 'layout-dashboard' },
        { id: 'nav_results', type: 'object', objectName: 'kpi_result', label: '考核结果', icon: 'trophy' },
        { id: 'nav_report_unit', type: 'report', reportName: 'kpi_unit_score_matrix', label: '部门 × 维度矩阵', icon: 'grid-3x3' },
        { id: 'nav_report_person', type: 'report', reportName: 'kpi_person_scores', label: '到人得分', icon: 'user-check' },
        { id: 'nav_report_line', type: 'report', reportName: 'kpi_indicator_completion', label: '指标完成情况', icon: 'bar-chart-3' },
        { id: 'nav_snapshots', type: 'object', objectName: 'kpi_snapshot', label: '归档快照', icon: 'archive' },
      ],
    },
    {
      id: 'group_setup', type: 'group', label: '基础设置', icon: 'settings',
      children: [
        { id: 'nav_indicators', type: 'object', objectName: 'kpi_indicator', label: '指标库', icon: 'target' },
        { id: 'nav_ops_dashboard', type: 'dashboard', dashboardName: 'kpi_progress_dashboard', label: '流程进度', icon: 'activity' },
      ],
    },
    {
      id: 'group_audit', type: 'group', label: '审计查询', icon: 'history',
      children: [
        { id: 'nav_reviews', type: 'object', objectName: 'kpi_review_record', label: '审核记录', icon: 'history' },
      ],
    },
  ],
});
