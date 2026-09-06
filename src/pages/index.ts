import { definePage } from '@objectstack/spec/ui';

/**
 * 工作台 —— 六个岗位共用的待办入口(#34 建、#36 扩)。
 *
 * 设计目标是「登录即处理」:落地页上直接排开当前该我动手的几摞事,不再「回列表 → 重选页签 →
 * 打开 → 审」。五个 `object-grid` 区块合起来构成一条不跳页的动线 ——
 *
 *   1. 「待填报的指标」= `kpi_entry_line` 的可编辑网格(`editable: true`),首列是「所属填报单」,
 *      后面九列是填一行数当场要看的项;实际值与备注可改,其余列在字段定义上就是 `readonly`,
 *      网格照此渲染。保存后 `entry-line.hook` 逐行算分,完成率 / 得分率 / 最终得分当场回填到
 *      同一张表。
 *   2. 「填报单」= `kpi_entry_sheet` 的只读网格,行操作挂 `kpi_sheet_submit`(「提交填报」),
 *      填完即可在同一页提交。
 *   3. 「待我核对」= `kpi_check_task` 中状态为「待核对」的任务,行操作挂「确认无误」「提出争议」。
 *   4. 「待人力审核」= `kpi_entry_sheet` 中状态为「人力审核中」的单,行操作挂「审核通过」「驳回」。
 *   5. 「待领导审批」= 同上,状态为「领导审批中」。
 *
 * **区块不按岗位显隐**(#36 的实现口径)。两个原因,一个是能力、一个是设计:
 *
 *   - 能力:页面组件的 `visibleWhen` 只绑 `record` / `current_user` / `page.<var>`(spec
 *     `ui/page.zod.ts`),没有岗位绑定。实测写 `'kpi_dept_reporter' in current_user.positions`
 *     后,**连部门填报人员本人都看不到网格**(谓词求值为空 = 对所有人隐藏),已回退。
 *   - 设计:**能看到哪些行由数据层决定,不由岗位决定** —— 对象 OWD `private` /
 *     `controlled_by_parent` + 方案发布时写入的动态共享规则 + 权限集 `readScope`。分公司
 *     核对人员在「待我核对」里只读得到本分公司的任务;部门填报人员在「待人力审核」里读得到
 *     的是**本部门那张单**(#38 实测:本部门单进到「人力审核中」时,该区块对填报人员显示
 *     1 行),点动作会被 `sheet.hook` 的岗位闸以 422 拒绝 —— 也就是说区块按数据范围显示,
 *     不按岗位显隐,读得到不等于动得了。按岗位在前端再显隐一次是把同一条边界画两遍,而画
 *     在前端的那一遍不是边界。视图筛选是展示范围,不是安全边界,这里不拿 `filter` 当权限用。
 *     入口噪音(读得到却动不了的行摆在待办区块里)的根治依赖平台按岗位裁剪区块的能力,
 *     见 objectstack-ai/objectstack#15135。
 *
 * 空区块**保留**、不隐藏:它给「这摞事现在是空的」一个确定的回答,比区块时有时无好读;
 * 三个待办区块 `pageSize` 收到 10(填报动线的两块仍是 25),空态只占一行标题加一句空提示。
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
 *     `kpi_entry_line` 上没有任何字段编码填报单状态(#36 复核过一遍字段表:sheet /
 *     plan_indicator / indicator / indicator_name / unit / direction / scoring_method /
 *     target_value / weight / actual_value / completion_rate / score_rate / score /
 *     adjusted_score / final_score / is_adjusted / adjust_type_applied / calc_trace /
 *     last_adjustment / remark —— 没有一个是填报单状态的副本),而反规范化要新增字段 +
 *     写入路径,#36 明写「明细上若无该字段则如实记录,不加字段」。
 *     退化的替代条件(如「实际值为空」)会让保存后的行当场从网格里消失,连带毁掉「同页出分」,
 *     比不过滤更糟,因此不做。已提交 / 已归档的行仍会出现在网格里,改动在保存时被 `sheet.hook`
 *     的冻结闸门拦下并给出三段式提示 —— 拦得住,只是晚一步。
 *   - 三个待办区块**能**过滤,因为过滤的是本对象自己的 `status` 列(`kpi_check_task.status`、
 *     `kpi_entry_sheet.status`),不跨关系。
 *
 * 行动作用 `object-grid` 的 `rowActions`(spec `component.zod.ts` 记有读点,
 * `ObjectGrid.tsx:1927`),挂的是 `actions/index.ts` 里既有的对象级动作 —— 它们本就带
 * `locations: ['record_header', 'list_item']` 与状态谓词,本页只是把它们摆到行上,
 * 不新增动作、不改动作定义。驳回原因 / 争议内容的必填口径写在动作参数上,行级入口与
 * 记录页入口共用同一份定义,不会因为入口不同而松动。
 *
 * ⚠️ 页面网格行上的「打开 ›」按钮点了没反应(平台 objectstack-ai/objectstack#16276),
 * 本页的动线不依赖它:待办都在行操作菜单里就地办完。
 *
 * 区块标题按需求 §1.4 术语表用「填报单」「指标」的表内名词,不用「我的」——`kpi_home` 是
 * `isDefault: true` 的默认落地页,六个岗位共用;对管理员 / 人力审核这类 org 范围岗位,
 * 网格里本来就不止「我的」行,标题不该替它们说话。「待我核对」是例外,也只是例外地跟着
 * 设计方案 §5.5 的原文走(该节把三个队列点名为「待我核对」「待人力审核」「待领导审批」)。
 */

/** 只读待办网格的共同形状:不可编辑、按 10 行压缩、行操作就地办完。 */
const TODO_GRID = { editable: false, pageSize: 10 } as const;

/** 三个待办区块共用的填报单列:够认出是哪张单、够看出分,不铺满一屏。 */
const SHEET_TODO_COLUMNS = ['name', 'subject', 'status', 'line_count', 'weight_total', 'indicator_score', 'bonus_total', 'total_score'];

/** 待办区块的行操作:审核通过 / 驳回,两者都在 `actions/index.ts` 里定义。 */
const SHEET_REVIEW_ACTIONS = ['kpi_sheet_approve', 'kpi_sheet_reject'];

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
        { type: 'element:text', properties: { content: '部门填报人员:在下方「待填报的指标」直接填实际值,保存即出分,再到「填报单」点「提交填报」;分公司核对人员:在「待我核对」确认无误或提出争议(争议内容必填);人力审核 / 分管领导:在「待人力审核」「待领导审批」就地审核通过或驳回(驳回原因必填);审批通过后在「结果与归档」查看四个维度的汇总并归档。当前没有待办的区块会显示为空,不影响其他区块。' } },
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
        { type: 'element:divider', properties: {} },
        { type: 'element:text', properties: { content: '待我核对', variant: 'subheading' } },
        {
          type: 'object-grid',
          properties: {
            ...TODO_GRID,
            objectName: 'kpi_check_task',
            columns: ['name', 'sheet', 'branch', 'status', 'comment'],
            filter: [{ field: 'status', operator: 'equals', value: 'pending' }],
            rowActions: ['kpi_check_confirm', 'kpi_check_dispute'],
            sort: [{ field: 'created_at', order: 'asc' }],
          },
        },
        { type: 'element:divider', properties: {} },
        { type: 'element:text', properties: { content: '待人力审核', variant: 'subheading' } },
        {
          type: 'object-grid',
          properties: {
            ...TODO_GRID,
            objectName: 'kpi_entry_sheet',
            columns: SHEET_TODO_COLUMNS,
            filter: [{ field: 'status', operator: 'equals', value: 'hr_reviewing' }],
            rowActions: SHEET_REVIEW_ACTIONS,
            sort: [{ field: 'submitted_at', order: 'asc' }],
          },
        },
        { type: 'element:divider', properties: {} },
        { type: 'element:text', properties: { content: '待领导审批', variant: 'subheading' } },
        {
          type: 'object-grid',
          properties: {
            ...TODO_GRID,
            objectName: 'kpi_entry_sheet',
            columns: SHEET_TODO_COLUMNS,
            filter: [{ field: 'status', operator: 'equals', value: 'leader_approving' }],
            rowActions: SHEET_REVIEW_ACTIONS,
            sort: [{ field: 'submitted_at', order: 'asc' }],
          },
        },
      ],
    },
  ],
});
