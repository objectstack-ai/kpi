import { App } from '@objectstack/spec/ui';
import { PLAN_CONFIG_CAPABILITY } from '../security/index.js';

/**
 * 配置类菜单按岗位裁剪(维护者 2026-09-03 拍板:各部门目标值互相保密)。
 *
 * 用 `requiredPermissions` 而不是 `visible`:平台把 `visible` 定为浏览器里求值的 CEL
 * 谓词,而 `requiredPermissions` 是**服务端**闸门 —— 不满足的导航项在 `/meta` 里就被剥掉,
 * 根本不下发到浏览器(spec `app.zod.ts`:「anything that must never reach the browser goes
 * in `requiredPermissions`, never in `visible`」)。本次实测还证实了这一点的另一半:本版本
 * 的控制台对导航项的 `visible` **根本不求值**(分组与叶子项都不生效,谓词原样下发到浏览器
 * 后被忽略),已按「只上报不修复」报到平台:objectstack-ai/objectstack#15135。
 *
 * ⚠️ `requiredPermissions` 是**逐条 AND、字符串精确匹配、无通配、无超级用户豁免**,平台
 * 管理员也不例外 —— 所以平台管理员必须真正持有本能力,见 `security/bind-admin-set.ts`。
 *
 * 菜单裁剪只是入口层面的整洁,真正的边界仍是数据层 —— 对象 OWD 收成 `private` + 按方案的
 * 动态共享规则(services/sharing-service.ts)+ 权限集 `readScope: 'own'`。
 */
const PLAN_CONFIG_MENU = [PLAN_CONFIG_CAPABILITY];

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
      id: 'group_plan', type: 'group', label: '考核方案', icon: 'clipboard-list', requiredPermissions: PLAN_CONFIG_MENU,
      children: [
        { id: 'nav_plans', type: 'object', objectName: 'kpi_plan', label: '方案版本', icon: 'clipboard-list', requiredPermissions: PLAN_CONFIG_MENU },
        { id: 'nav_plan_indicators', type: 'object', objectName: 'kpi_plan_indicator', label: '指标下达', icon: 'list-checks', requiredPermissions: PLAN_CONFIG_MENU },
        { id: 'nav_plan_subjects', type: 'object', objectName: 'kpi_plan_subject', label: '参与主体', icon: 'building', requiredPermissions: PLAN_CONFIG_MENU },
        { id: 'nav_assignments', type: 'object', objectName: 'kpi_staff_assignment', label: '到人分工', icon: 'users', requiredPermissions: PLAN_CONFIG_MENU },
        { id: 'nav_disputes', type: 'object', objectName: 'kpi_dispute', label: '指标争议', icon: 'message-square-warning', requiredPermissions: PLAN_CONFIG_MENU },
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
      id: 'group_setup', type: 'group', label: '基础设置', icon: 'settings', requiredPermissions: PLAN_CONFIG_MENU,
      children: [
        { id: 'nav_indicators', type: 'object', objectName: 'kpi_indicator', label: '指标库', icon: 'target', requiredPermissions: PLAN_CONFIG_MENU },
        { id: 'nav_ops_dashboard', type: 'dashboard', dashboardName: 'kpi_progress_dashboard', label: '流程进度', icon: 'activity', requiredPermissions: PLAN_CONFIG_MENU },
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
