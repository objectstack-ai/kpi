// 软件公司演示档案 —— 运行期数据脚本(岗位人员、流程岗位、到人分工、个人承接项、分管领导)。
//
// 为什么是脚本不是种子:这些记录全部引用 `sys_user`,而用户不能种子(必须走注册),
// 见 CLAUDE.md「D4 测试账号」。
//
// 用法(方案必须仍是草稿 —— 到人分工与分管领导随方案发布冻结):
//   OS_PORT=3111 OS_DATABASE_URL=file:./.objectstack/issue-23.db OS_SEED_PROFILE=software pnpm dev
//   OS_PORT=3111 node scripts/software-people.mjs
//
// 可重复执行:账号、岗位分配、到人分工、承接项、分管领导都先查后写,重复跑不产生重复行。

import { list, msg, one, patch, post, signInAdmin, signUp, DEMO_PASSWORD } from './lib/kpi-api.mjs';

const PLAN_NAME = '2026 年第 3 季度考核';

/** 业务岗位人员:每人一个部门、一个流程岗位、一条到人分工、一项个人承接项。 */
const STAFF = [
  { name: '张伟', email: 'rd.engineer@kpi.demo', job: '研发工程师', unit: 'bu_sw_rd', position: 'kpi_dept_reporter', weight: 100, coefficient: 1.1, item: 'SWRD01', itemWeight: 20 },
  { name: '王强', email: 'pd.manager@kpi.demo', job: '产品经理', unit: 'bu_sw_pd', position: 'kpi_dept_reporter', weight: 80, coefficient: 1, item: 'SWPD02', itemWeight: 30 },
  { name: '李娜', email: 'qa.engineer@kpi.demo', job: '测试工程师', unit: 'bu_sw_qa', position: 'kpi_dept_reporter', weight: 100, coefficient: 1, item: 'SWQA02', itemWeight: 25 },
  { name: '赵敏', email: 'sales.manager@kpi.demo', job: '销售经理', unit: 'bu_sw_sales', position: 'kpi_dept_reporter', weight: 100, coefficient: 1.2, item: 'SWSL01', itemWeight: 40 },
  { name: '孙磊', email: 'mkt.specialist@kpi.demo', job: '市场专员', unit: 'bu_sw_mkt', position: 'kpi_dept_reporter', weight: 100, coefficient: 0.9, item: 'SWMK01', itemWeight: 30 },
  { name: '周雪', email: 'cs.manager@kpi.demo', job: '客户成功经理', unit: 'bu_sw_cs', position: 'kpi_dept_reporter', weight: 100, coefficient: 1, item: 'SWCS02', itemWeight: 25 },
  { name: '吴刚', email: 'hrbp@kpi.demo', job: 'HRBP', unit: 'bu_sw_hr', position: 'kpi_dept_reporter', weight: 100, coefficient: 1, item: 'SWHR01', itemWeight: 20 },
  { name: '郑洁', email: 'fin.specialist@kpi.demo', job: '财务专员', unit: 'bu_sw_fin', position: 'kpi_dept_reporter', weight: 100, coefficient: 0.95, item: 'SWFI02', itemWeight: 20 },
];

/** 流程岗位人员:分公司核对、人力审核、人力负责人、分管领导(不建到人分工)。 */
const OFFICERS = [
  { name: '陈东', email: 'east.checker@kpi.demo', job: '华东分公司核对人员', unit: 'bu_sw_east', position: 'kpi_branch_checker' },
  { name: '林南', email: 'south.checker@kpi.demo', job: '华南分公司核对人员', unit: 'bu_sw_south', position: 'kpi_branch_checker' },
  { name: '高北', email: 'north.checker@kpi.demo', job: '华北分公司核对人员', unit: 'bu_sw_north', position: 'kpi_branch_checker' },
  { name: '马丽', email: 'hr.reviewer@kpi.demo', job: '人力审核', unit: 'bu_sw_hr', position: 'kpi_hr_reviewer' },
  { name: '何平', email: 'hr.head@kpi.demo', job: '人力负责人', unit: 'bu_sw_hr', position: 'kpi_hr_head' },
  { name: '徐涛', email: 'leader.tech@kpi.demo', job: '分管领导(技术线)', unit: null, position: 'kpi_exec_leader' },
  { name: '冯薇', email: 'leader.gtm@kpi.demo', job: '分管领导(市场线)', unit: null, position: 'kpi_exec_leader' },
];

/** 分管领导的分管范围(两位领导范围不重叠)。 */
const LEADER_SCOPE = {
  'leader.tech@kpi.demo': ['bu_sw_rd', 'bu_sw_pd', 'bu_sw_qa'],
  'leader.gtm@kpi.demo': ['bu_sw_sales', 'bu_sw_mkt', 'bu_sw_cs', 'bu_sw_east', 'bu_sw_south', 'bu_sw_north'],
};

const steps = [];
const step = (title, ok, detail = '') => {
  steps.push({ title, ok, detail });
  console.log(`${ok ? ' OK ' : 'FAIL'} ${title}${detail ? ' — ' + detail : ''}`);
};

await signInAdmin();
step('管理员登录', true);

const plan = (await list('kpi_plan', `?limit=50`)).find((p) => p.name === PLAN_NAME);
if (!plan) {
  console.error(`未找到方案「${PLAN_NAME}」。请先用 OS_SEED_PROFILE=software 在空库启动 dev 实例。`);
  process.exit(1);
}
if (plan.status !== 'draft') {
  console.error(`方案「${PLAN_NAME}」当前状态为 ${plan.status},到人分工与分管领导只能在草稿阶段配置。请用空库重新启动。`);
  process.exit(1);
}
step('找到草稿方案', true, `${plan.name}(${plan.id})`);

// ── 1. 账号 ────────────────────────────────────────────────────────────────
const ALL = [...STAFF, ...OFFICERS];
for (const p of ALL) await signUp(p.name, p.email);
await signInAdmin();
const users = await list('sys_user', '?limit=500');
const byEmail = new Map(users.map((u) => [String(u.email), u]));
const missing = ALL.filter((p) => !byEmail.has(p.email));
step('岗位账号已创建', missing.length === 0, missing.length ? `缺:${missing.map((p) => p.email).join(', ')}` : `${ALL.length} 个账号,统一口令 ${DEMO_PASSWORD}`);
if (missing.length) process.exit(1);

// ── 2. 组织归属与流程岗位 ──────────────────────────────────────────────────
const members = await list('sys_business_unit_member', '?limit=1000');
const hasMember = (userId, unitId) => members.some((m) => String(m.user_id) === String(userId) && String(m.business_unit_id) === String(unitId));
const userPositions = await list('sys_user_position', '?limit=1000');
const hasPos = (userId, position) => userPositions.some((p) => String(p.user_id) === String(userId) && String(p.position) === String(position));

let memberCount = 0;
let positionCount = 0;
for (const p of ALL) {
  const u = byEmail.get(p.email);
  if (p.unit && !hasMember(u.id, p.unit)) {
    const r = await post('sys_business_unit_member', { user_id: u.id, business_unit_id: p.unit, is_primary: true });
    if (r.status < 300) memberCount += 1;
  }
  if (!hasPos(u.id, p.position)) {
    const r = await post('sys_user_position', { user_id: u.id, position: p.position });
    if (r.status < 300) positionCount += 1;
  }
}
const membersAfter = await list('sys_business_unit_member', '?limit=1000');
const positionsAfter = await list('sys_user_position', '?limit=1000');
const withUnit = ALL.filter((p) => p.unit);
const allMembers = withUnit.every((p) => membersAfter.some((m) => String(m.user_id) === String(byEmail.get(p.email).id) && String(m.business_unit_id) === p.unit));
const allPositions = ALL.every((p) => positionsAfter.some((x) => String(x.user_id) === String(byEmail.get(p.email).id) && String(x.position) === p.position));
step('组织归属已分配', allMembers, `新增 ${memberCount} 条,应有 ${withUnit.length} 条`);
step('流程岗位已分配', allPositions, `新增 ${positionCount} 条;六类岗位:${[...new Set(ALL.map((p) => p.position))].join(', ')}`);

// ── 3. 到人分工与个人承接项 ────────────────────────────────────────────────
const planIndicators = await list('kpi_plan_indicator', `?plan=${plan.id}&limit=200`);
const indicators = await list('kpi_indicator', '?limit=200');
const indicatorByCode = new Map(indicators.map((i) => [String(i.code), i]));
const piOf = (subject, indicatorCode) => {
  const indicator = indicatorByCode.get(indicatorCode);
  return planIndicators.find((x) => String(x.subject) === subject && String(x.indicator) === String(indicator?.id));
};

const existingAssignments = await list('kpi_staff_assignment', `?plan=${plan.id}&limit=200`);
let assignmentCount = 0;
let itemCount = 0;
for (const p of STAFF) {
  const u = byEmail.get(p.email);
  let a = existingAssignments.find((x) => String(x.employee) === String(u.id) && String(x.unit) === p.unit);
  if (!a) {
    const r = await post('kpi_staff_assignment', { plan: plan.id, employee: u.id, unit: p.unit, weight: p.weight, coefficient: p.coefficient, remark: p.job });
    if (r.status >= 300) {
      step(`到人分工:${p.name}`, false, msg(r));
      continue;
    }
    a = one(r);
    assignmentCount += 1;
  }
  const pi = piOf(p.unit, p.item);
  if (!pi) {
    step(`个人承接项:${p.name}`, false, `找不到 ${p.unit} 的下达 ${p.item}`);
    continue;
  }
  const items = await list('kpi_personal_item', `?assignment=${a.id}&limit=50`);
  if (!items.some((x) => String(x.plan_indicator) === String(pi.id))) {
    const r = await post('kpi_personal_item', { assignment: a.id, plan_indicator: pi.id, weight: p.itemWeight, target_value: pi.target_value });
    if (r.status >= 300) step(`个人承接项:${p.name}`, false, msg(r));
    else itemCount += 1;
  }
}
const assignmentsAfter = await list('kpi_staff_assignment', `?plan=${plan.id}&limit=200`);
const coefficients = assignmentsAfter.map((a) => Number(a.coefficient));
step('到人分工已建立', assignmentsAfter.length === STAFF.length, `${assignmentsAfter.length} 条(新增 ${assignmentCount});个人系数样本 ${[...new Set(coefficients)].join(' / ')},含 ≠1 的样例:${coefficients.some((c) => c !== 1)}`);
let itemsTotal = 0;
for (const a of assignmentsAfter) itemsTotal += (await list('kpi_personal_item', `?assignment=${a.id}&limit=50`)).length;
step('个人承接项已建立', itemsTotal >= STAFF.length, `${itemsTotal} 条(新增 ${itemCount}),每人至少 1 项`);

// ── 4. 分管领导 ────────────────────────────────────────────────────────────
const subjects = await list('kpi_plan_subject', `?plan=${plan.id}&limit=100`);
let leaderCount = 0;
for (const [email, units] of Object.entries(LEADER_SCOPE)) {
  const u = byEmail.get(email);
  for (const unit of units) {
    const sub = subjects.find((s) => String(s.subject) === unit);
    if (!sub) continue;
    if (String(sub.leader ?? '') === String(u.id)) continue;
    const r = await patch('kpi_plan_subject', sub.id, { leader: u.id });
    if (r.status < 300) leaderCount += 1;
    else step(`分管领导:${email} → ${unit}`, false, msg(r));
  }
}
const subjectsAfter = await list('kpi_plan_subject', `?plan=${plan.id}&limit=100`);
const leaderIds = new Set(subjectsAfter.map((s) => String(s.leader ?? '')).filter(Boolean));
const covered = subjectsAfter.filter((s) => s.leader).length;
step('分管领导已设置', leaderIds.size >= 2 && covered === 9, `${leaderIds.size} 位领导,覆盖 ${covered} 个主体(技术线 3 + 市场线 6),分管范围不重叠`);

// ── 账号清单(供测试报告引用)────────────────────────────────────────────
console.log('\n岗位账号清单(口令统一为 ' + DEMO_PASSWORD + '):');
for (const p of ALL) console.log(`  ${p.name}\t${p.job}\t${p.email}\t${p.unit ?? '—'}\t${p.position}`);

const failed = steps.filter((s) => !s.ok);
console.log(`\n${JSON.stringify({ ok: steps.length - failed.length, failed: failed.length })}`);
if (failed.length) process.exit(1);
