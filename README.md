# KPI 考核管理系统(ObjectStack 应用)

面向多部门、多分公司的 KPI 考核管理,覆盖「指标库 → 方案配置 → 指标下达 → 数据填报 →
并行核对 → 审核流程 → 实时计分 → 数据调整 → 汇总 → 归档快照」全流程。基于
[ObjectStack](https://github.com/objectstack-ai/objectstack) 17.x 元数据平台开发,
按 `os-project-*` 交付流程 skill 设计与实现。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/需求/KPI考核管理系统-功能性需求文档-V1.3.md](docs/需求/KPI考核管理系统-功能性需求文档-V1.3.md) | 客户提供的原始功能性需求(V1.3,2026-09-02) |
| [docs/00-设计方案.md](docs/00-设计方案.md) | 设计方案 V1.0(客户 2026-09-02 确认,唯一需求基准);Word 成品在 [docs/交付/](docs/交付/)(V0.9 送审稿、V1.0 客户确认版),由 `pnpm docs:docx` 从本源稿生成 |
| [docs/01-需求解读报告.md](docs/01-需求解读报告.md) | 场景地图、平台能力覆盖度、风险、疑点(疑点已由设计方案 V1.0 关闭) |
| [docs/02-总体方案蓝图.md](docs/02-总体方案蓝图.md) | os 能力映射、对象模型总图、模块依赖与开发顺序 |
| [docs/手册/KPI考核管理系统-操作手册.md](docs/手册/KPI考核管理系统-操作手册.md) | 分角色操作手册 V0.1(送审稿):通用操作 + 五个业务角色分章,含真实系统截图;Word 成品在 [docs/交付/](docs/交付/),由 `pnpm docs:manual` 从本源稿生成 |
| [docs/汇报/KPI考核管理系统-解决方案汇报.html](docs/汇报/KPI考核管理系统-解决方案汇报.html) | 解决方案汇报稿:业务流程、计分与汇总口径、权限模型九张示意图 + 26 张界面截图。图片走相对路径指向操作手册的截图(不重复入库);发布用的自包含单文件由 `pnpm docs:report` 生成 |
| [scripts/build-report-deck.mjs](scripts/build-report-deck.mjs) | 从汇报稿同一批素材生成 19 页汇报 PPT(九张示意图 + 八张界面截图,每页带讲稿备注)。示意图需先从汇报稿 HTML 的内联 SVG 按 `figure` 截取导出;脚本头注说明了用法与依赖 |
| [CLAUDE.md](CLAUDE.md) | 开发约定与 dev-issue 启用清单 |

## 快速开始

```bash
pnpm install
pnpm verify          # validate + typecheck + vitest
pnpm e2e             # 对运行中的 dev 实例(空库、端口 3100)经 REST 走完整考核链路
pnpm dev             # http://localhost:3000 ;Console: /_console/ ;管理员 admin@objectos.ai / admin123
```

开发环境自动加载演示种子:组织树(总公司、3 个部门、4 家分公司)、6 个指标(含阶梯区间)、
1 个草稿方案(4 节点流程、5 个参与主体、18 条指标下达)。用户不能种子,请在 Setup 中创建
用户、加入组织单元并分配岗位。

### 演示种子档案(`OS_SEED_PROFILE`)

| 档案 | 启用方式 | 内容 |
|---|---|---|
| 默认(通用企业) | 不设变量 | 上面那套;操作手册的截图依赖它 |
| 软件公司 | `OS_SEED_PROFILE=software` | 总公司 + 8 个业务部门 + 3 家销售型分公司、24 个指标(四种计分方式全覆盖)、1 个草稿季度方案(11 个参与主体、36 条指标下达) |

**换档案必须换空库**(两条,缺一不可):

1. **删 `dist`** —— 选档结果会被构建产物缓存,不删就还是上一个档案;
2. **换一个空的数据库文件** —— 两套档案都是 `upsert`,种子加载器只写不删。在**已有库**上换档案,另一套档案的记录原地留着:库里会同时躺着两棵组织树和两个方案;换回默认档案后,`bu_sw_*` 那 12 个单元与季度方案仍会出现在操作手册截图取景的那些页面上。

```bash
# 软件公司档案:空库启动 → 建岗位人员与到人分工 → 走完整流程断言
rm -rf dist
rm -f .objectstack/software.db*                                       # 或换一个没用过的文件名
OS_SEED_PROFILE=software OS_DATABASE_URL=file:./.objectstack/software.db pnpm dev
node scripts/software-people.mjs            # 18 个岗位账号、到人分工、个人承接项、分管领导(用户不能种子,只能运行期建)
node scripts/software-flow.mjs [结果.json]  # 发布 → 填报 → 核对 → 审核 → 加减分 → 调整 → 汇总 → 归档 → 数据范围

# 换回默认档案:同样是删 dist + 另指定(或清空)数据库文件
rm -rf dist
OS_DATABASE_URL=file:./.objectstack/default.db pnpm dev
```

两个脚本都读 `KPI_BASE_URL`(缺省 `http://localhost:${OS_PORT:-3000}`);`software-people.mjs` 可重复执行,
且必须在方案仍是草稿时运行 —— 到人分工与分管领导随方案发布冻结;`software-flow.mjs` 要求空库(它会先故意把方案改坏来验发布拦截)。

`software-people.mjs` 建的 18 个账号里,三家分公司**各有两名**:一名「分公司填报人员」(沈月 /
黄鹤 / 秦朗,岗位 `kpi_dept_reporter`)、一名「分公司核对人员」(陈东 / 林南 / 高北,岗位
`kpi_branch_checker`)。分公司在方案里既是被考核主体、又是核对方,而核对人员按《设计方案》
§3 表 1 只能「确认无误 / 提出争议」、改不了数值 —— 分公司自己那张填报单必须由分公司填报
人员来填,不是管理员代填(`software-flow.mjs` 的 T11b 就断言这一条)。他们的数据范围与部门
填报人员同源:方案发布时按参与主体写入的共享规则把本主体的填报单放宽到本单元成员,分公司
本身就是参与主体,不需要任何额外的元数据。

> ⚠️ 演示夹具的租户对齐(临时):种子写入的组织单元 `organization_id` 为空,而管理员在
> Setup 里新建的单元会被引擎盖上当前组织;共享规则的收件方展开对这一列做等值比较,所以
> 只有种子单元展开不出人。`src/data/align-demo-units.ts` 在 `kernel:bootstrapped` 时把这几个
> 种子单元(且仅这几个 id —— 两套档案的单元 id 取并集、且仅 `organization_id` 为空的行、且仅
> dev / test)补成与 Setup 新建单元一致。这是 objectstack-ai/objectstack#14547 的临时夹具修补,平台修复落地后请连同
> `objectstack.config.ts` 里的调用一起删除。

## 角色与岗位

| 需求角色 | 岗位(position) | 权限集 | 数据范围 |
|---|---|---|---|
| 系统管理员 | `kpi_admin`(组织 owner/admin 自动等同) | `kpi_admin_set` | 全部 |
| 人力审核 | `kpi_hr_reviewer` | `kpi_hr_reviewer_set` | 全部 |
| 人力负责人 | `kpi_hr_head` | `kpi_hr_head_set` | 全部 |
| 部门填报人员 | `kpi_dept_reporter` | `kpi_dept_reporter_set` | 本部门(private + 动态记录共享) |
| 分公司核对人员 | `kpi_branch_checker` | `kpi_branch_checker_set` | 本分公司核对任务(private + 动态记录共享) |
| 分管领导 | `kpi_exec_leader` | `kpi_exec_leader_set` | 所分管主体(private + 动态记录共享) |

「本部门 / 本分公司 / 分管范围」不依赖平台企业版 `hierarchy-security` 的 `unit / unit_and_below`
深度:填报单、核对任务、数据调整、考核结果的 OWD 都是 private,可见性由方案发布时按
「参与主体」「分管领导」「到人分工」写入的**共享规则数据**(`src/services/sharing-service.ts`)
放宽。接入新客户组织只改数据,不改元数据。

规则**按方案**建:条件里带方案 id,规则名按方案加前缀,发布时对本方案做一次对账 ——
换掉分管领导、撤掉参与主体、撤掉到人分工,旧授权当场失效,而历史方案的授权原样保留。
方案**已关闭 / 已归档**后转为「留读、去写」:填报单、核对任务、数据调整由可编辑降为只读
(还要查得到历史,但不该再改),考核结果本就只读。

## 业务流程(默认 4 节点,可按方案配置)

```
方案草稿 ─发布(完整性检查)─▶ 生成填报单/明细(冻结目标、权重、计分规则副本)
填报中 ─提交─▶ 分公司核对中(并行核对任务,全部确认自动推进)─▶ 人力审核中 ─▶ 领导审批中 ─▶ 已通过 ─归档─▶ 已归档(不可变快照)
任一审核节点 ─驳回(原因必填)─▶ 上一节点
```

- 计分引擎:`src/lib/scoring.ts`(线性 / 阶梯 / 区间插值 / CEL 公式),填报保存即算分,计算说明落库可复核;
- 审核状态机:`src/lib/workflow.ts` + `src/hooks/sheet.hook.ts`,按钮只写「待执行动作」,规则全在 hook;
- 汇总:`src/lib/aggregate.ts`,通过 / 归档 / 调整落地时重算部门、分公司、到人、分管领导四维结果;
- 留痕:`kpi_review_record` 只增不改 + 平台审计日志;归档快照 `kpi_snapshot` 带 SHA-256 校验和;
- 口径基准:计分、汇总、流程、加减分、调整的口径以 docs/00 第 7~10 章为准;到人 = Σ(部门板块得分 × 分工权重 × 个人系数)+ Σ(承接项得分率 × 承接权重)。

## 目录

```
objectstack.config.ts   应用装配(对象、视图、按钮、hook、权限、共享规则、看板、报表、种子)
src/objects             17 个业务对象
src/hooks               计分、流程、发布、争议、加减分、调整、不可变保护
src/lib                 纯函数:计分 / 状态机 / 汇总 / CEL 求值(有单元测试)
src/services            计分装配、结果汇总、快照生成
src/security            岗位、权限集、共享规则、岗位绑定
src/views | actions | apps | pages | datasets | dashboards | reports | translations | data
test                    vitest 单元测试
scripts/e2e-flow.mjs    端到端流程验证(REST)
docs                    设计与验收文档
```

## 许可

Apache-2.0
