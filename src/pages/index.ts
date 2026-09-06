import { definePage } from '@objectstack/spec/ui';

/**
 * 工作台 —— 填报人员的待办入口(#34)。
 *
 * 设计目标是「一屏填数出分提交」:登录后直接落在本页,不再先跳「填报明细」再跳「填报单」。
 * 两个 `object-grid` 区块合起来构成一条不跳页的动线 ——
 *
 *   1. 「我的指标填报」= `kpi_entry_line` 的可编辑网格(`editable: true`),列只放填报人真正
 *      要看的九项;实际值与备注可改,其余列在字段定义上就是 `readonly`,网格照此渲染。
 *      保存后 `entry-line.hook` 逐行算分,完成率 / 得分率 / 最终得分当场回填到同一张表。
 *   2. 「我的填报单」= `kpi_entry_sheet` 的只读网格,行操作挂 `kpi_sheet_submit`(「提交填报」),
 *      填完即可在同一页提交。
 *
 * 两张网格都**不带筛选**:能看到哪些行完全由数据层决定(对象 OWD `private` /
 * `controlled_by_parent` + 方案发布时写入的动态共享规则 + 权限集 `readScope`),部门填报人员
 * 因此只看得到本部门的行。页面上再加一层 `filter` 只会把「看得见」和「该看见」拆成两处口径,
 * 组织一变就对不上 —— 视图筛选是展示范围,不是安全边界。
 */
export const HomePage = definePage({
  name: 'kpi_home',
  label: '工作台',
  type: 'home',
  template: 'header-sidebar-main',
  isDefault: true,
  kind: 'full',
  regions: [
    { name: 'header', width: 'full', components: [{ type: 'page:header', properties: { title: 'KPI 考核管理', subtitle: '指标库 → 方案配置 → 指标下达 → 填报 → 并行核对 → 审核 → 计分 → 调整 → 汇总 → 归档' } }] },
    {
      name: 'main', width: 'full',
      components: [
        { type: 'element:text', properties: { content: '在「我的指标填报」里直接填实际值,保存即出分;确认无误后在「我的填报单」里点「提交填报」。' } },
        { type: 'element:text', properties: { content: '我的指标填报', variant: 'subheading' } },
        {
          type: 'object-grid',
          properties: {
            objectName: 'kpi_entry_line',
            editable: true,
            singleClickEdit: true,
            columns: ['indicator_name', 'unit', 'target_value', 'weight', 'actual_value', 'completion_rate', 'score_rate', 'final_score', 'remark'],
            sort: [{ field: 'indicator_name', order: 'asc' }],
            pageSize: 25,
          },
        },
        { type: 'element:divider', properties: {} },
        { type: 'element:text', properties: { content: '我的填报单', variant: 'subheading' } },
        {
          type: 'object-grid',
          properties: {
            objectName: 'kpi_entry_sheet',
            columns: ['name', 'subject', 'status', 'line_count', 'weight_total', 'indicator_score', 'bonus_total', 'total_score'],
            rowActions: ['kpi_sheet_submit'],
            sort: [{ field: 'updated_at', order: 'desc' }],
            pageSize: 25,
          },
        },
      ],
    },
  ],
});
