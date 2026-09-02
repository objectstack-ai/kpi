# CLAUDE.md — KPI 考核管理系统(ObjectStack 应用)

本仓库是基于 ObjectStack 平台(`@objectstack/*` 17.x)开发的 KPI 考核管理系统。
流程资产采用 `os-project-*` skill 库(baozhoutao/os-project-skills);领域知识 skill
(`os-project-kb-<行业>`)待需求定稿后再建。**开工前必读**:`docs/00-设计方案.md`(确认后为唯一需求基准)、`docs/01-需求解读报告.md`、`docs/02-总体方案蓝图.md`、
`docs/03-方案分级.md`、`docs/04-需求符合度清单.md`。

## 构建与验证

```bash
pnpm install
pnpm validate     # 元数据校验(每次改 *.object.ts / *.view.ts / *.action.ts 后必跑)
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest(计分引擎、状态机、方案发布校验的单元测试)
pnpm verify       # 以上三项
pnpm dev          # http://localhost:3000 ;Console 在 /_console/ ;管理员 admin@objectos.ai / admin123
```

元数据错误在运行期**静默失败**,`pnpm validate` 不过不得报「完成」。

## 项目约定

- 对象机器名一律 `kpi_` 前缀(manifest namespace),字段 snake_case,配置键 camelCase;
- 用户可见文案默认中文(对象/字段 label 直接中文;`zh-CN` 翻译包只补 en 回退),遵守
  os-project-std-copy 四条红线:无内部代号、无异常原文、名词按需求文档 §1.4 术语表、报错三段式;
- 数字字段四件套(小数位/最小值/最大值/单位)必须显式声明,禁用平台默认;
- 计分口径唯一真值在 `src/lib/scoring.ts`,任何得分都经它算,禁止在视图/公式字段里二次实现;
- 审核状态机唯一真值在 `src/hooks/sheet-transition.hook.ts`,按钮只改状态字段,规则全在 hook;
- 归档快照与已通过填报单只读,禁止绕过 hook 直写;
- 不得修改 `node_modules` 内平台包;平台能力受限按 dev-issue 支线 B 上报 objectstack-ai/objectstack。

## os-project-dev-issue 启用清单(项目实际值)

| 项 | 值 |
|---|---|
| A2 工作项系统 | GitHub Issues(objectstack-ai/kpi),引用格式 `#n` |
| A3 开发侧账号 | 当前 Claude Code 会话身份(共享 GitHub 身份,认领评论须带会话 ID) |
| A4 验收侧处理人 | 工作项创建人 |
| B 状态标签 | 待建:`status:待细化 / 待开发 / 方案确认中 / AI开发中 / 自测报告中 / PR审查中 / PM验收中 / 人工测试中 / 已完成 / 已打回 / 已挂起`;标记 `平台能力受限 / 人工介入 / 待复测`;类型 `回归缺陷 / 验收记录 / 试运行缺陷`;优先级 `P1 / P2 / P3`(首次使用 issue 流程前用 `gh label create` 一次建齐) |
| C1 分支命名 | `issue-<n>-<slug>`(本次初建使用平台指定分支 `claude/standard-assessment-system-qvswav`) |
| C2 worktree 目录 | 仓库外 `../kpi-<task>` |
| C3 worktree 初始化 | `pnpm install` |
| C4 发布级别 | ① main-only(开发期) |
| D1 dev 启动 | `pnpm dev`,默认端口 3000(`OS_PORT` 可改),日志在终端 |
| D2 并行隔离 | 每 worktree 独立端口(`OS_PORT`)与独立数据库文件(`OS_DATABASE_URL=file:./.objectstack/<task>.db`) |
| D3 重启与清理 | 改对象/视图/hook 需重启 dev;清理 `dist/` 与 `.objectstack/` 下本实例数据库(种子数据可重建) |
| D4 测试账号 | 管理员 admin@objectos.ai / admin123;各岗位账号在 Setup 建用户后分配岗位:人力审核、人力负责人、部门填报、分公司核对、分管领导(种子只建组织树,用户不可种子) |
| E1 报告形态 | Markdown 测试报告挂工作项评论(模板见 os-project-dev-test) |
| E2 截图归档 | 孤儿分支 `acceptance-evidence`,图链用 commit SHA 形式;**截图与证据文件禁止提交到 main 或功能分支的代码树**(`docs/evidence/` 已在 .gitignore),维护者 2026-09-02 要求 |
| F2 合并权限 | 无——仅库级授权生效(AI 不自行合并) |
| G1 失败升级 | 工作项评论 @ 技术负责人 |
| G2 平台问题上报 | objectstack-ai/objectstack 仓库 issue(现象、最小复现、期望能力、平台版本) |
| H1 开工前必读 | 本文 + `docs/` 四份文档 |
| H2 测试执行 | 暂不具备双实例条件:同会话自测,计划先落盘、逐条对照(dev-test 最低限度档) |
