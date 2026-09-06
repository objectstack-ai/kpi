import { definePage } from '@objectstack/spec/ui';

/**
 * 工作台 —— 填报人员的待办入口(#34)。
 *
 * 设计目标是「一屏填数出分提交」:登录后直接落在本页,不再先跳「填报明细」再跳「填报单」。
 * 两个 `object-grid` 区块合起来构成一条不跳页的动线 ——
 *
 *   1. 「待填报的指标」= `kpi_entry_line` 的可编辑网格(`editable: true`),首列是「所属填报单」,
 *      后面九列是填一行数当场要看的项;实际值与备注可改,其余列在字段定义上就是 `readonly`,
 *      网格照此渲染。保存后 `entry-line.hook` 逐行算分,完成率 / 得分率 / 最终得分当场回填到
 *      同一张表。
 *   2. 「填报单」= `kpi_entry_sheet` 的只读网格,行操作挂 `kpi_sheet_submit`(「提交填报」),
 *      填完即可在同一页提交。
 *
 * **能看到哪些行**由数据层决定(对象 OWD `private` / `controlled_by_parent` + 方案发布时
 * 写入的动态共享规则 + 权限集 `readScope`)—— 视图筛选是展示范围,不是安全边界,这里不拿
 * `filter` 当权限用。
 *
 * **屏幕上怎么分辨哪一行是哪一张单**是另一回事(评审 F3),三处按平台实际能到的程度处理:
 *
 *   - 首列 `sheet`(所属填报单)是识别列,`sort` 也以它打头:跨方案 / 跨期间的同名指标
 *     (两行「回款率」)靠它区分归属并排到一起,没有它,单击即改的网格里写错行不会有任何提示。
 *   - 「只显示填报中的单的明细」**做不到**,不是没做:这是 `kpi_entry_sheet.status`,而查询
 *     引擎明确拒绝跨关系过滤 —— `$filter` 上写 `sheet.status` 返回 400 `INVALID_FIELD`:
 *     「filters on 'sheet.status', which follows the relationship 'sheet' into another object
 *     — a filter reaches only columns of 'kpi_entry_line' itself … Denormalise the value onto
 *     'kpi_entry_line' (a stored field, written when the source changes) and filter that.」
 *     本对象上没有任何字段编码填报单状态,而反规范化要新增字段 + 写入路径,超出本工作项范围。
 *     退化的替代条件(如「实际值为空」)会让保存后的行当场从网格里消失,连带毁掉「同页出分」,
 *     比不过滤更糟,因此不做。已提交 / 已归档的行仍会出现在网格里,改动在保存时被 `sheet.hook`
 *     的冻结闸门拦下并给出三段式提示 —— 拦得住,只是晚一步。
 *   - 「对 org 范围岗位隐藏本区块」**做不到**:页面组件的 `visibleWhen` 只绑 `record` /
 *     `current_user` / `page.<var>`(spec `ui/page.zod.ts`),没有岗位绑定。实测写
 *     `'kpi_dept_reporter' in current_user.positions` 后,**连部门填报人员本人都看不到网格**
 *     (谓词求值为空 = 对所有人隐藏),已回退。
 *
 * 区块标题按需求 §1.4 术语表用「填报单」「指标」的表内名词,不用「我的」——`kpi_home` 是
 * `isDefault: true` 的默认落地页,六个岗位共用;对管理员 / 人力审核这类 org 范围岗位,
 * 网格里本来就不止「我的」行,标题不该替它们说话。
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
        { type: 'element:text', properties: { content: '部门填报人员:在下方「待填报的指标」直接填实际值,保存即出分,再到「填报单」点「提交填报」;分公司核对人员:在「分公司核对」确认或提出争议;人力审核 / 分管领导:在「填报单」对应队列里审核通过或驳回(驳回必须填写原因);审批通过后在「结果与归档」查看四个维度的汇总并归档。' } },
        { type: 'element:text', properties: { content: '待填报的指标', variant: 'subheading' } },
        {
          type: 'object-grid',
          properties: {
            objectName: 'kpi_entry_line',
            editable: true,
            singleClickEdit: true,
            columns: ['sheet', 'indicator_name', 'unit', 'target_value', 'weight', 'actual_value', 'completion_rate', 'score_rate', 'final_score', 'remark'],
            sort: [{ field: 'sheet', order: 'asc' }, { field: 'indicator_name', order: 'asc' }],
            pageSize: 25,
          },
        },
        { type: 'element:divider', properties: {} },
        { type: 'element:text', properties: { content: '填报单', variant: 'subheading' } },
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
