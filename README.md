# KPI 考核管理系统(ObjectStack 应用)

面向多部门、多分公司的 KPI 考核管理,覆盖「指标库 → 方案配置 → 指标下达 → 数据填报 →
并行核对 → 审核流程 → 实时计分 → 数据调整 → 汇总 → 归档快照」全流程。基于
[ObjectStack](https://github.com/objectstack-ai/objectstack) 17.x 元数据平台开发,
按 `os-project-*` 交付流程 skill 设计与实现。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/需求/KPI考核管理系统-功能性需求文档-V1.3.md](docs/需求/KPI考核管理系统-功能性需求文档-V1.3.md) | 客户提供的原始功能性需求(V1.3,2026-09-02) |
| [docs/00-设计方案.md](docs/00-设计方案.md) | 设计方案 V1.0(客户 2026-09-02 确认,唯一需求基准) |
| [docs/01-需求解读报告.md](docs/01-需求解读报告.md) | 场景地图、平台能力覆盖度、风险、疑点(疑点已由设计方案 V1.0 关闭) |
| [docs/02-总体方案蓝图.md](docs/02-总体方案蓝图.md) | os 能力映射、对象模型总图、模块依赖与开发顺序 |
| [docs/03-方案分级.md](docs/03-方案分级.md) | 三问分级;三处多路径选型已确认路径 A |
| [docs/04-需求符合度清单.md](docs/04-需求符合度清单.md) | 需求逐条 ✅/⚠️/❌ 对账 |
| [docs/05-自测记录.md](docs/05-自测记录.md) | 静态门禁 + 端到端流程用例结果与问题记录 |
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

> ⚠️ 演示夹具的租户对齐(临时):种子写入的组织单元 `organization_id` 为空,而管理员在
> Setup 里新建的单元会被引擎盖上当前组织;共享规则的收件方展开对这一列做等值比较,所以
> 只有种子单元展开不出人。`src/data/align-demo-units.ts` 在 `kernel:bootstrapped` 时把这几个
> 种子单元(且仅这几个 id、且仅 `organization_id` 为空的行、且仅 dev / test)补成与 Setup 新建
> 单元一致。这是 objectstack-ai/objectstack#14547 的临时夹具修补,平台修复落地后请连同
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
