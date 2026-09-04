// 软件公司演示档案 —— 全流程实测(API 断言)。
//
// 覆盖:发布前完整性检查 → 发布 → 填报(超额 / 未达 / 临界三类样本)→ 提交 →
// 分公司并行核对(含一处争议及其处理)→ 人力审核(含一次驳回与重提)→ 领导审批 →
// 加减分(登记 + 审批)→ 数据调整(源数据 / 计算结果各一)→ 四维汇总 → 归档 → 数据范围。
//
// 得分预期按《设计方案》V1.0 §7 表 4 手算写死,不从实现反推;到人 / 分管领导预期按 §8 表 6
// 的公式在本脚本内**独立**实现一遍再比对,不调用应用代码。
//
// 用法(空库 + 已跑过 scripts/software-people.mjs):
//   OS_PORT=3111 OS_DATABASE_URL=file:./.objectstack/issue-23.db OS_SEED_PROFILE=software pnpm dev
//   OS_PORT=3111 node scripts/software-people.mjs
//   OS_PORT=3111 node scripts/software-flow.mjs [结果 json 路径]

import { call, currentCookie, del, get, list, msg, one, patch, post, signIn, signInAdmin, useCookie, waitUntil } from './lib/kpi-api.mjs';

const PLAN_NAME = '2026 年第 3 季度考核';
const results = [];
function log(id, title, ok, detail = '') {
  results.push({ id, title, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${title}${detail ? ' — ' + detail : ''}`);
}
const n = (v) => (v === null || v === undefined ? null : Number(v));
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

const ACCOUNT = {
  sales: 'sales.manager@kpi.demo',
  east: 'east.checker@kpi.demo',
  south: 'south.checker@kpi.demo',
  north: 'north.checker@kpi.demo',
  hr: 'hr.reviewer@kpi.demo',
  head: 'hr.head@kpi.demo',
  leaderTech: 'leader.tech@kpi.demo',
  leaderGtm: 'leader.gtm@kpi.demo',
};

/** 各主体的实际值(按指标编码)。销售部与客户成功部的数字用于手算断言。 */
const ACTUALS = {
  bu_sw_rd: { SWRD01: 98.8, SWRD02: 1, SWRD03: 12.5 },
  bu_sw_pd: { SWPD01: 94.5, SWPD02: 63, SWPD03: 91.2 },
  bu_sw_qa: { SWQA01: 1.6, SWQA02: 66.5, SWQA03: 93.1 },
  bu_sw_sales: { SWSL01: 5000, SWSL02: 72, SWSL03: 60 },
  bu_sw_mkt: { SWMK01: 1650, SWMK02: 760, SWMK03: 100 },
  bu_sw_cs: { SWCS01: 92, SWCS02: 87.3, SWCS03: 91.2 },
  bu_sw_hr: { SWHR01: 90, SWHR02: 9.6, SWHR03: 100 },
  bu_sw_fin: { SWFI01: 3.3, SWFI02: 98, SWFI03: 55 },
  bu_sw_east: { SWSL01: 1760, SWSL02: 94.5, SWCS01: 93, SWMK01: 520 },
  bu_sw_south: { SWSL01: 1140, SWSL02: 83, SWCS01: 88, SWMK01: 380 },
  bu_sw_north: { SWSL01: 990, SWSL02: 86, SWCS01: 91, SWMK01: 330 },
};

// ── T0 环境与种子 ──────────────────────────────────────────────────────────
await signInAdmin();
const ADMIN_COOKIE = currentCookie();
const asAdmin = () => useCookie(ADMIN_COOKIE);
log('T0', '管理员登录', true);

const units = await list('sys_business_unit', '?limit=200');
const swUnits = units.filter((u) => String(u.id).startsWith('bu_sw_'));
log('T1a', '软件档案组织树:1 家总公司 + 8 个部门 + 3 家分公司,编码唯一、上级存在', swUnits.length === 12
  && swUnits.filter((u) => u.kind === 'department').length === 8
  && swUnits.filter((u) => u.kind === 'division').length === 3
  && new Set(swUnits.map((u) => u.code)).size === 12
  && swUnits.every((u) => u.id === 'bu_sw_hq' || String(u.parent_business_unit_id) === 'bu_sw_hq'),
  `${swUnits.length} 个单元:${swUnits.map((u) => u.name).join('、')}`);

const indicators = (await list('kpi_indicator', '?limit=200')).filter((i) => String(i.code).startsWith('SW'));
const byCode = new Map(indicators.map((i) => [String(i.code), i]));
const methods = new Set(indicators.map((i) => i.scoring_method));
const directions = new Set(indicators.map((i) => i.direction));
const sources = new Set(indicators.map((i) => i.data_source));
const perUnit = new Map();
for (const i of indicators) perUnit.set(String(i.owner_unit), (perUnit.get(String(i.owner_unit)) ?? 0) + 1);
log('T1b', '指标库:24 项,每部门 ≥3 项,四种计分方式 / 两种方向 / 三种数据来源全覆盖', indicators.length === 24
  && perUnit.size === 8 && [...perUnit.values()].every((c) => c >= 3)
  && methods.size === 4 && directions.size === 2 && sources.size === 3,
  `${indicators.length} 项;计分方式 ${[...methods].join('/')};方向 ${[...directions].join('/')};来源 ${[...sources].join('/')}`);

const stepRows = await list('kpi_indicator_step', '?limit=200');
const stepIndicators = indicators.filter((i) => i.scoring_method === 'step');
const stepsOk = stepIndicators.every((i) => {
  const rows = stepRows.filter((s) => String(s.indicator) === String(i.id)).sort((a, b) => n(a.min_rate) - n(b.min_rate));
  if (rows.length < 3) return false;
  if (n(rows[0].min_rate) !== 0) return false;
  if (n(rows[rows.length - 1].max_rate) !== null) return false;
  return rows.every((r, idx) => idx === 0 || n(r.min_rate) === n(rows[idx - 1].max_rate));
});
log('T1c', '阶梯指标带完整区间表(首段从 0 起、段间不留缝、末段无上限)', stepIndicators.length === 3 && stepsOk,
  `${stepIndicators.length} 项阶梯指标,共 ${stepRows.length} 段`);

const formulaIndicators = indicators.filter((i) => i.scoring_method === 'formula');
const ALLOWED_VARS = new Set(['actual', 'target', 'weight']);
const formulaVarsOk = formulaIndicators.every((i) => {
  const names = String(i.score_formula ?? '').match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  return names.length > 0 && names.every((v) => ALLOWED_VARS.has(v));
});
log('T1d', '公式指标只使用 actual / target / weight 变量', formulaIndicators.length >= 1 && formulaVarsOk,
  formulaIndicators.map((i) => `${i.name}: ${i.score_formula}`).join(' | '));

const plan = (await list('kpi_plan', '?limit=50')).find((p) => p.name === PLAN_NAME);
const subjects = await list('kpi_plan_subject', `?plan=${plan.id}&limit=100`);
const planSteps = await list('kpi_plan_step', `?plan=${plan.id}&limit=50`);
let planIndicators = await list('kpi_plan_indicator', `?plan=${plan.id}&limit=200`);
const subjectWeightTotal = subjects.reduce((s, x) => s + (n(x.subject_weight) ?? 0), 0);
const weightBySubject = new Map();
for (const pi of planIndicators) weightBySubject.set(String(pi.subject), (weightBySubject.get(String(pi.subject)) ?? 0) + (n(pi.weight) ?? 0));
log('T1e', '方案:季度周期、四节点流程、11 个参与主体、36 条下达;每主体权重合计 100,主体权重合计 100',
  plan.period_type === 'quarter' && String(plan.period_start).startsWith('2026-07-01') && String(plan.period_end).startsWith('2026-09-30')
  && planSteps.length === 4 && subjects.length === 11 && planIndicators.length === 36
  && [...weightBySubject.values()].every((w) => Math.abs(w - 100) < 0.01) && Math.abs(subjectWeightTotal - 100) < 0.01,
  `节点 ${planSteps.length};主体 ${subjects.length};下达 ${planIndicators.length};主体权重合计 ${subjectWeightTotal}`);

const alignedUnits = swUnits.filter((u) => !!u.organization_id);
log('T1f', '软件档案的组织单元已进入租户对齐夹具覆盖范围(objectstack-ai/objectstack#14547 的临时夹具)',
  alignedUnits.length === swUnits.length, `${alignedUnits.length}/${swUnits.length} 个单元已补上组织归属`);

const userByEmail = new Map((await list('sys_user', '?limit=500')).map((u) => [String(u.email), u]));
const assignments = await list('kpi_staff_assignment', `?plan=${plan.id}&limit=100`);
const leaderSubjects = subjects.filter((s) => s.leader);
log('T1g', '运行期脚本产物就位:8 条到人分工(含个人系数 ≠1 的样例)、≥2 位分管领导',
  assignments.length === 8 && assignments.some((a) => n(a.coefficient) !== 1)
  && new Set(leaderSubjects.map((s) => String(s.leader))).size >= 2,
  `分工 ${assignments.length} 条;分管领导 ${new Set(leaderSubjects.map((s) => String(s.leader))).size} 位、覆盖 ${leaderSubjects.length} 个主体`);

// ── T2 发布前完整性检查 ────────────────────────────────────────────────────
const piOf = (subject, code) => planIndicators.find((x) => String(x.subject) === subject && String(x.indicator) === String(byCode.get(code)?.id));
const salesRev = piOf('bu_sw_sales', 'SWSL01');

await patch('kpi_plan_indicator', salesRev.id, { target_value: null });
let r = await patch('kpi_plan', plan.id, { status: 'published' });
log('T2a', '抹掉一个目标值后发布被拦截,并逐条列出问题', r.status >= 400 && msg(r).includes('未设置目标值') && msg(r).includes('完整性检查'), msg(r));
await patch('kpi_plan_indicator', salesRev.id, { target_value: 4000 });

const salesCash = piOf('bu_sw_sales', 'SWSL02');
const origWeight = n(salesCash.weight);
await patch('kpi_plan_indicator', salesCash.id, { weight: 10 });
r = await patch('kpi_plan', plan.id, { status: 'published' });
log('T2b', '主体权重合计 ≠ 100 时发布被拦截并点名主体与实际合计', r.status >= 400 && msg(r).includes('100%') && msg(r).includes('销售部'), msg(r));
await patch('kpi_plan_indicator', salesCash.id, { weight: origWeight });

r = await post('kpi_dispute', { plan_indicator: piOf('bu_sw_east', 'SWSL01').id, raised_unit: 'bu_sw_east', reason: '华东分公司认为签约金额目标高于本区域市场容量,申请下调。', status: 'open' });
const dispute = one(r);
r = await patch('kpi_plan', plan.id, { status: 'published' });
log('T2c', '有未关闭的指标争议时发布被拦截', r.status >= 400 && msg(r).includes('争议'), msg(r));
r = await patch('kpi_dispute', dispute.id, { status: 'rejected', resolution: '目标经销售部与分公司复核后维持不变,理由:上年度同期实际签约已达 1520 万元。' });
log('T2d', '争议处理后关闭(处理结论必填、状态留痕)', r.status < 300 && one(r).status === 'rejected' && !!one(r).resolved_at, msg(r).slice(0, 120));

r = await patch('kpi_plan', plan.id, { status: 'published' });
log('T3', '完整性检查通过后发布成功', r.status < 300 && one(r)?.status === 'published' && !!one(r)?.published_at, msg(r).slice(0, 140));

const sheets = await list('kpi_entry_sheet', `?plan=${plan.id}&limit=100`);
const sheetOf = (unit) => sheets.find((s) => String(s.subject) === unit);
log('T4a', '发布生成的填报单数 = 参与主体数(11)', sheets.length === 11 && sheets.every((s) => s.status === 'draft'),
  `${sheets.length} 张:${sheets.map((s) => s.name.split(' · ')[1]).join('、')}`);

let allLines = [];
for (const s of sheets) allLines.push(...await list('kpi_entry_line', `?sheet=${s.id}&limit=100`));
log('T4b', '明细行数 = 指标下达数(36),每行带目标 / 权重 / 计分规则的冻结副本', allLines.length === 36
  && allLines.every((l) => l.indicator_name && n(l.weight) !== null && l.scoring_method && l.direction && n(l.target_value) !== null),
  `${allLines.length} 行;样例:${allLines[0]?.indicator_name} 目标 ${allLines[0]?.target_value} 权重 ${allLines[0]?.weight} 计分 ${allLines[0]?.scoring_method}`);

r = await patch('kpi_plan_indicator', salesRev.id, { weight: 45 });
log('T4c', '发布后修改指标下达被冻结拒绝', r.status >= 400 && msg(r).includes('冻结'), msg(r).slice(0, 120));

// ── T5 销售部:真实岗位账号走完整流程 ──────────────────────────────────────
const salesSheet = sheetOf('bu_sw_sales');
const salesShared = await waitUntil('销售部填报单共享给销售经理', async () => {
  const shares = await list('sys_record_share', '?limit=1000');
  return shares.some((x) => x.object_name === 'kpi_entry_sheet' && String(x.record_id) === String(salesSheet.id) && x.access_level === 'edit');
});
log('T5a', '发布把填报单的数据范围展开成逐人记录共享行', salesShared, `sheet=${salesSheet.name}`);

await signIn(ACCOUNT.sales);
let salesLines = await list('kpi_entry_line', `?sheet=${salesSheet.id}&limit=50`);
const lineOf = (lines, code) => lines.find((l) => l.indicator_name === byCode.get(code)?.name);

// 只填两项 → 提交应被拦截
await patch('kpi_entry_line', lineOf(salesLines, 'SWSL01').id, { actual_value: ACTUALS.bu_sw_sales.SWSL01 });
await patch('kpi_entry_line', lineOf(salesLines, 'SWSL02').id, { actual_value: ACTUALS.bu_sw_sales.SWSL02 });
r = await patch('kpi_entry_sheet', salesSheet.id, { pending_action: 'submit' });
log('T6', '仍有指标未填实际值时提交被拒绝并说明缺几项', r.status >= 400 && msg(r).includes('未填写实际值'), msg(r).slice(0, 140));

await patch('kpi_entry_line', lineOf(salesLines, 'SWSL03').id, { actual_value: ACTUALS.bu_sw_sales.SWSL03 });
salesLines = await list('kpi_entry_line', `?sheet=${salesSheet.id}&limit=50`);
const revLine = lineOf(salesLines, 'SWSL01');
const cashLine = lineOf(salesLines, 'SWSL02');
const newLine = lineOf(salesLines, 'SWSL03');
log('T5b', '线性封顶(超额):签约金额 5000/4000 = 125% → 封顶 120% → 得分 50 × 120% = 60.00',
  n(revLine.completion_rate) === 125 && n(revLine.score_rate) === 120 && n(revLine.score) === 60 && !!revLine.calc_trace,
  `完成率 ${revLine.completion_rate}% 得分率 ${revLine.score_rate}% 得分 ${revLine.score};计算说明:${revLine.calc_trace}`);
log('T5c', '区间插值(未达):回款率 72/90 = 80% → (80−60)/(100−60) = 50% → 得分 30 × 50% = 15.00',
  n(cashLine.completion_rate) === 80 && n(cashLine.score_rate) === 50 && n(cashLine.score) === 15,
  `完成率 ${cashLine.completion_rate}% 得分率 ${cashLine.score_rate}% 得分 ${cashLine.score};计算说明:${cashLine.calc_trace}`);
log('T5d', '临界:新签客户数 60/60 = 100% → 得分率 100% → 得分 20 × 100% = 20.00',
  n(newLine.completion_rate) === 100 && n(newLine.score_rate) === 100 && n(newLine.score) === 20,
  `完成率 ${newLine.completion_rate}% 得分 ${newLine.score}`);
let sheet = await get('kpi_entry_sheet', salesSheet.id);
log('T5e', '填报单指标得分合计 = 60 + 15 + 20 = 95.00(手算,《设计方案》§7 表 4)',
  n(sheet.indicator_score) === 95 && n(sheet.total_score) === 95 && n(sheet.weight_total) === 100,
  `指标得分 ${sheet.indicator_score} 最终得分 ${sheet.total_score} 权重合计 ${sheet.weight_total}`);

r = await patch('kpi_entry_sheet', salesSheet.id, { pending_action: 'submit' });
sheet = await get('kpi_entry_sheet', salesSheet.id);
log('T7a', '销售经理提交本部门填报单 → 进入分公司核对中', r.status < 300 && sheet.status === 'branch_checking' && !!sheet.submitted_at, `status=${sheet.status}`);
r = await patch('kpi_entry_line', revLine.id, { actual_value: 1 });
log('T7b', '提交后修改实际值被冻结拒绝(更正须走数据调整申请)', r.status >= 400 && msg(r).includes('冻结'), msg(r).slice(0, 140));

asAdmin();
let tasks = await list('kpi_check_task', `?sheet=${salesSheet.id}&limit=20`);
log('T8a', '按方案里的 3 家分公司生成并行核对任务', tasks.length === 3 && tasks.every((t) => t.status === 'pending'), tasks.map((t) => t.name).join(' | '));

await signIn(ACCOUNT.east);
await waitUntil('华东核对任务共享给华东核对人员', async () => (await list('kpi_check_task', '?limit=100')).some((t) => String(t.sheet) === String(salesSheet.id)));
let eastTask = (await list('kpi_check_task', '?limit=100')).find((t) => String(t.sheet) === String(salesSheet.id));
r = await patch('kpi_check_task', eastTask.id, { status: 'disputed' });
log('T8b', '提出争议但未写核对意见被拒绝', r.status >= 400, msg(r).slice(0, 140));
r = await patch('kpi_check_task', eastTask.id, { status: 'disputed', comment: '华东区域 12 月的回款数据与分公司台账不一致,请销售部复核。' });
log('T8c', '分公司核对人员提出争议(意见必填)成功', r.status < 300, msg(r).slice(0, 120));

asAdmin();
r = await patch('kpi_entry_sheet', salesSheet.id, { pending_action: 'approve' });
log('T8d', '有分公司争议未解决时不能推进到下一节点', r.status >= 400 && msg(r).includes('争议'), msg(r).slice(0, 160));

await signIn(ACCOUNT.east);
r = await patch('kpi_check_task', eastTask.id, { status: 'confirmed', comment: '销售部已提供回款对账单,数据一致,争议撤回。' });
log('T8e', '争议处理后改为确认无误', r.status < 300, msg(r).slice(0, 120));
for (const [account, unit] of [[ACCOUNT.south, 'bu_sw_south'], [ACCOUNT.north, 'bu_sw_north']]) {
  await signIn(account);
  await waitUntil(`${unit} 核对任务共享`, async () => (await list('kpi_check_task', '?limit=100')).some((t) => String(t.sheet) === String(salesSheet.id)));
  const t = (await list('kpi_check_task', '?limit=100')).find((x) => String(x.sheet) === String(salesSheet.id));
  if (t) await patch('kpi_check_task', t.id, { status: 'confirmed', comment: '数据无异议。' });
}
asAdmin();
sheet = await get('kpi_entry_sheet', salesSheet.id);
log('T8f', '3 家分公司全部确认后自动推进到人力审核中', sheet.status === 'hr_reviewing', `status=${sheet.status}`);

await signIn(ACCOUNT.hr);
r = await patch('kpi_entry_sheet', salesSheet.id, { pending_action: 'reject' });
log('T9a', '驳回原因为空被拒绝', r.status >= 400 && msg(r).includes('驳回原因'), msg(r).slice(0, 140));
r = await patch('kpi_entry_sheet', salesSheet.id, { pending_action: 'reject', action_reason: '新签客户数请附客户清单后重报。' });
asAdmin();
sheet = await get('kpi_entry_sheet', salesSheet.id);
tasks = await list('kpi_check_task', `?sheet=${salesSheet.id}&limit=20`);
log('T9b', '人力审核驳回 → 退回上一节点(分公司核对),核对任务重置为待核对,原因留痕',
  r.status < 300 && sheet.status === 'branch_checking' && sheet.last_reject_reason === '新签客户数请附客户清单后重报。' && tasks.every((t) => t.status === 'pending'),
  `status=${sheet.status} 原因=${sheet.last_reject_reason} 任务=${tasks.map((t) => t.status).join(',')}`);

for (const [account] of [[ACCOUNT.east], [ACCOUNT.south], [ACCOUNT.north]]) {
  await signIn(account);
  const t = (await list('kpi_check_task', '?limit=100')).find((x) => String(x.sheet) === String(salesSheet.id));
  if (t) await patch('kpi_check_task', t.id, { status: 'confirmed', comment: '重报后数据一致。' });
}
asAdmin();
sheet = await get('kpi_entry_sheet', salesSheet.id);
log('T9c', '重新核对后再次推进到人力审核中', sheet.status === 'hr_reviewing', `status=${sheet.status}`);

await signIn(ACCOUNT.hr);
r = await patch('kpi_entry_sheet', salesSheet.id, { pending_action: 'approve', action_reason: '客户清单已补齐,审核通过。' });
asAdmin();
sheet = await get('kpi_entry_sheet', salesSheet.id);
log('T9d', '人力审核通过 → 领导审批中', r.status < 300 && sheet.status === 'leader_approving', `status=${sheet.status}`);

await signIn(ACCOUNT.leaderGtm);
await waitUntil('销售部填报单共享给分管领导', async () => (await list('kpi_entry_sheet', '?limit=100')).some((s) => String(s.id) === String(salesSheet.id)));
r = await patch('kpi_entry_sheet', salesSheet.id, { pending_action: 'approve' });
asAdmin();
sheet = await get('kpi_entry_sheet', salesSheet.id);
log('T10', '分管领导审批通过 → 已通过并盖章', r.status < 300 && sheet.status === 'approved' && !!sheet.approved_at && !!sheet.approved_by, `status=${sheet.status}`);

// ── 其余 10 张填报单:管理员批量推到已通过,让四维汇总有完整数据 ──────────
async function pushToApproved(target) {
  const lines = await list('kpi_entry_line', `?sheet=${target.id}&limit=50`);
  for (const l of lines) {
    const code = [...byCode.entries()].find(([, ind]) => String(ind.id) === String(l.indicator))?.[0];
    await patch('kpi_entry_line', l.id, { actual_value: ACTUALS[String(target.subject)][code] });
  }
  await patch('kpi_entry_sheet', target.id, { pending_action: 'submit' });
  let s = await get('kpi_entry_sheet', target.id);
  if (s.status === 'branch_checking') {
    for (const t of await list('kpi_check_task', `?sheet=${target.id}&limit=20`)) {
      if (t.status !== 'confirmed') await patch('kpi_check_task', t.id, { status: 'confirmed', comment: '数据无异议。' });
    }
    s = await get('kpi_entry_sheet', target.id);
  }
  while (s.status === 'branch_checking' || s.status === 'hr_reviewing' || s.status === 'leader_approving') {
    await patch('kpi_entry_sheet', target.id, { pending_action: 'approve', action_reason: '审核通过。' });
    const next = await get('kpi_entry_sheet', target.id);
    if (next.status === s.status) break;
    s = next;
  }
  return s;
}
const pushed = [];
for (const s of sheets) {
  if (String(s.id) === String(salesSheet.id)) continue;
  pushed.push(await pushToApproved(s));
}
log('T11', '其余 10 张填报单全部推进到已通过', pushed.every((s) => s.status === 'approved'),
  pushed.map((s) => `${s.name.split(' · ')[1]}:${s.status}/${s.total_score}`).join(' | '));

const csSheet = await get('kpi_entry_sheet', sheetOf('bu_sw_cs').id);
const csLines = await list('kpi_entry_line', `?sheet=${csSheet.id}&limit=50`);
const csatLine = lineOf(csLines, 'SWCS02');
log('T12', '阶梯计分:客户满意度 87.3/90 = 97% → 命中「达标」区间得分率 90% → 得分 35 × 90% = 31.50',
  n(csatLine.completion_rate) === 97 && n(csatLine.score_rate) === 90 && n(csatLine.score) === 31.5 && n(csSheet.indicator_score) === 95.5,
  `完成率 ${csatLine.completion_rate}% 得分率 ${csatLine.score_rate}% 得分 ${csatLine.score};部门合计 ${csSheet.indicator_score};计算说明:${csatLine.calc_trace}`);

// ── T13 加减分:人力审核登记 → 人力负责人审批 ─────────────────────────────
const hrUser = userByEmail.get(ACCOUNT.hr);
await waitUntil('销售部填报单共享给人力审核岗位持有人', async () => {
  const shares = await list('sys_record_share', '?limit=2000');
  return shares.some((x) => x.object_name === 'kpi_entry_sheet' && String(x.record_id) === String(salesSheet.id) && String(x.recipient_id) === String(hrUser.id) && x.access_level === 'edit');
});
await signIn(ACCOUNT.hr);
r = await post('kpi_bonus', { sheet: salesSheet.id, title: '重大项目中标', bonus_type: 'add', points: 3, reason: '中标某省级政务云项目,合同额 1200 万元。' });
const bonus = one(r);
const registered = r.status < 300 && !!bonus?.id;
const selfApprove = await patch('kpi_bonus', bonus?.id ?? 'none', { status: 'approved' });
log('T13a', '人力审核登记加减分成功;同一账号自批被岗位判定拒绝(职责分离)',
  registered && selfApprove.status >= 400 && msg(selfApprove).includes('人力负责人'), `登记 ${r.status};自批 ${selfApprove.status} ${msg(selfApprove).slice(0, 100)}`);
await signIn(ACCOUNT.head);
r = await patch('kpi_bonus', bonus.id, { status: 'approved' });
asAdmin();
sheet = await get('kpi_entry_sheet', salesSheet.id);
log('T13b', '人力负责人批准加减分后计入最终得分:95.00 + 3 = 98.00', r.status < 300 && n(sheet.bonus_total) === 3 && n(sheet.total_score) === 98,
  `加减分合计 ${sheet.bonus_total} 最终得分 ${sheet.total_score}`);

// ── T14 数据调整:源数据 / 计算结果各一 ───────────────────────────────────
await signIn(ACCOUNT.sales);
r = await post('kpi_adjustment', { line: newLine.id, adjust_type: 'source', new_value: 66, reason: '客户清单复核后新签客户数为 66 家。' });
const srcAdj = one(r);
await signIn(ACCOUNT.hr);
await patch('kpi_adjustment', srcAdj.id, { status: 'submitted' });
r = await patch('kpi_adjustment', srcAdj.id, { status: 'approved' });
asAdmin();
let adjustedLine = await get('kpi_entry_line', newLine.id);
sheet = await get('kpi_entry_sheet', salesSheet.id);
log('T14a', '源数据调整落地并触发重算:新签客户数 60 → 66,完成率 110%,得分 20 × 110% = 22.00;最终得分 100.00',
  r.status < 300 && n(srcAdj.old_value) === 60 && n(adjustedLine.actual_value) === 66 && n(adjustedLine.completion_rate) === 110
  && n(adjustedLine.score) === 22 && adjustedLine.is_adjusted === true && adjustedLine.adjust_type_applied === 'source' && n(sheet.total_score) === 100,
  `调整前 ${srcAdj.old_value} → ${adjustedLine.actual_value};得分 ${adjustedLine.score};最终得分 ${sheet.total_score}`);

const csSlaLine = lineOf(csLines, 'SWCS03');
r = await post('kpi_adjustment', { line: csSlaLine.id, adjust_type: 'result', new_value: 20, reason: '复核后按第 14 项调整该指标得分。' });
const resAdj = one(r);
await patch('kpi_adjustment', resAdj.id, { status: 'submitted' });
r = await patch('kpi_adjustment', resAdj.id, { status: 'approved' });
const csSlaAfter = await get('kpi_entry_line', csSlaLine.id);
const csUntouched = await get('kpi_entry_line', csatLine.id);
const csSheetAfter = await get('kpi_entry_sheet', csSheet.id);
log('T14b', '计算结果调整只改被调整指标的得分并标记「已调整」,未调整行保持否',
  r.status < 300 && n(resAdj.old_value) === 24 && n(csSlaAfter.adjusted_score) === 20 && n(csSlaAfter.final_score) === 20
  && csSlaAfter.is_adjusted === true && csSlaAfter.adjust_type_applied === 'result'
  && csUntouched.is_adjusted !== true && n(csSheetAfter.total_score) === 91.5,
  `调整前得分 ${resAdj.old_value} → ${csSlaAfter.final_score};部门最终得分 ${csSheetAfter.total_score}`);

// ── T15 四维汇总 ──────────────────────────────────────────────────────────
const allSheets = await list('kpi_entry_sheet', `?plan=${plan.id}&limit=100`);
const totalBySubject = new Map(allSheets.map((s) => [String(s.subject), n(s.total_score) ?? 0]));
const rateBySheet = new Map();
for (const s of allSheets) {
  const lines = await list('kpi_entry_line', `?sheet=${s.id}&limit=50`);
  rateBySheet.set(String(s.subject), new Map(lines.map((l) => [String(l.plan_indicator), n(l.score_rate) ?? 0])));
}
const resultRows = await list('kpi_result', `?plan=${plan.id}&limit=200`);
const dim = (d) => resultRows.filter((x) => x.dimension === d);
const rankOk = (list_) => {
  const sorted = [...list_].sort((a, b) => n(b.score) - n(a.score));
  return sorted.every((x, i) => (i > 0 && n(x.score) === n(sorted[i - 1].score) ? n(x.rank) === n(sorted[i - 1].rank) : n(x.rank) === i + 1));
};
log('T15a', '四维结果均非空:部门 8、分公司 3、到人 8、分管领导 2,且各维度组内排名正确',
  dim('department').length === 8 && dim('branch').length === 3 && dim('person').length === 8 && dim('leader').length === 2
  && rankOk(dim('department')) && rankOk(dim('branch')) && rankOk(dim('person')) && rankOk(dim('leader')),
  `部门 ${dim('department').length} / 分公司 ${dim('branch').length} / 到人 ${dim('person').length} / 分管领导 ${dim('leader').length}`);

const deptTop = [...dim('department')].sort((a, b) => n(b.score) - n(a.score))[0];
log('T15b', '部门维度得分等于填报单最终得分,加权得分 = 得分 × 主体权重',
  dim('department').every((x) => n(x.score) === totalBySubject.get(String(x.unit)))
  && dim('department').every((x) => {
    const w = n(subjects.find((s) => String(s.subject) === String(x.unit))?.subject_weight) ?? 0;
    return Math.abs(n(x.weighted_score) - round2((n(x.score) * w) / 100)) < 0.01;
  }),
  `第 1 名 ${deptTop?.name}(${deptTop?.score})`);

// 到人:Σ(部门板块得分 × 分工权重 × 个人系数) + Σ(承接项得分率 × 承接权重)——本脚本按 §8 表 6 独立实现
const personExpected = new Map();
for (const a of assignments) {
  const unitScore = totalBySubject.get(String(a.unit)) ?? 0;
  let score = round2((unitScore * (n(a.weight) ?? 0)) / 100 * (n(a.coefficient) ?? 1));
  for (const it of await list('kpi_personal_item', `?assignment=${a.id}&limit=50`)) {
    const rate = rateBySheet.get(String(a.unit))?.get(String(it.plan_indicator)) ?? 0;
    score = round2(score + round2((rate * (n(it.weight) ?? 0)) / 100));
  }
  personExpected.set(String(a.employee), score);
}
const personOk = dim('person').every((x) => Math.abs(n(x.score) - (personExpected.get(String(x.person)) ?? -1)) < 0.01);
log('T15c', '到人得分 = Σ(部门板块得分 × 分工权重 × 个人系数) + Σ(承接项得分率 × 承接权重)', personOk,
  dim('person').map((x) => `${x.name.split(' · ')[1]}:${x.score}(期望 ${personExpected.get(String(x.person))})`).join(' | '));

// 分管领导:分管主体最终得分按主体权重加权平均
const leaderExpected = new Map();
for (const s of subjects) {
  if (!s.leader) continue;
  const e = leaderExpected.get(String(s.leader)) ?? { num: 0, den: 0 };
  e.num += (totalBySubject.get(String(s.subject)) ?? 0) * (n(s.subject_weight) ?? 0);
  e.den += n(s.subject_weight) ?? 0;
  leaderExpected.set(String(s.leader), e);
}
const leaderOk = dim('leader').every((x) => {
  const e = leaderExpected.get(String(x.person));
  return e && Math.abs(n(x.score) - round2(e.num / e.den)) < 0.01;
});
log('T15d', '分管领导得分 = 分管主体最终得分按主体权重加权平均', leaderOk && dim('leader').length === 2,
  dim('leader').map((x) => { const e = leaderExpected.get(String(x.person)); return `${x.name.split(' · ')[1]}:${x.score}(期望 ${e ? round2(e.num / e.den) : '—'})`; }).join(' | '));

const parseJson = (v) => { if (!v) return null; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch { return null; } };
const csRow = dim('department').find((x) => String(x.unit) === 'bu_sw_cs');
const csBreakdown = parseJson(csRow?.breakdown);
const adjustedInBreakdown = (csBreakdown?.lines ?? []).find((l) => String(l.plan_indicator) === String(csSlaLine.plan_indicator));
log('T15e', '结果的计算明细逐指标带「已调整」标记,可钻取回被调整的那一行',
  !!adjustedInBreakdown && adjustedInBreakdown.is_adjusted === true && adjustedInBreakdown.adjust_type_applied === 'result',
  `明细 ${(csBreakdown?.lines ?? []).length} 行;被调整行:${JSON.stringify(adjustedInBreakdown ?? null)}`);

// ── T16 归档 ──────────────────────────────────────────────────────────────
await signIn(ACCOUNT.hr);
r = await patch('kpi_entry_sheet', salesSheet.id, { pending_action: 'archive' });
asAdmin();
sheet = await get('kpi_entry_sheet', salesSheet.id);
const snaps = await list('kpi_snapshot', `?sheet=${salesSheet.id}&limit=10`);
log('T16a', '归档生成带校验和的不可变快照(总分与填报单一致)',
  r.status < 300 && sheet.status === 'archived' && snaps.length === 1 && String(snaps[0].checksum).length === 64 && n(snaps[0].total_score) === n(sheet.total_score),
  `快照 ${snaps[0]?.name};校验和 ${String(snaps[0]?.checksum).slice(0, 16)}…;总分 ${snaps[0]?.total_score}`);
r = await patch('kpi_snapshot', snaps[0].id, { total_score: 1 });
const delSnap = await del('kpi_snapshot', snaps[0].id);
log('T16b', '归档快照不可修改、不可删除', r.status >= 400 && delSnap.status >= 400, `改 ${r.status} / 删 ${delSnap.status}`);
r = await patch('kpi_entry_line', newLine.id, { remark: '归档后补备注' });
const lateBonus = await post('kpi_bonus', { sheet: salesSheet.id, title: '归档后登记', bonus_type: 'add', points: 1, reason: '反例' });
const lateAdj = await post('kpi_adjustment', { line: newLine.id, adjust_type: 'source', new_value: 70, reason: '反例' });
log('T16c', '归档后填报明细、加减分、数据调整一律被拒绝', r.status >= 400 && lateBonus.status >= 400 && lateAdj.status >= 400,
  `改明细 ${r.status} / 加减分 ${lateBonus.status} / 调整 ${lateAdj.status};${msg(lateAdj).slice(0, 90)}`);

const reviews = await list('kpi_review_record', `?sheet=${salesSheet.id}&limit=100`);
const actions = new Set(reviews.map((x) => x.action));
log('T16d', '审核记录完整留痕(生成 / 提交 / 争议 / 确认 / 驳回 / 通过 / 调整 / 归档)且不可篡改',
  ['generate', 'submit', 'dispute', 'confirm', 'reject', 'approve', 'adjust', 'archive'].every((a) => actions.has(a))
  && (await patch('kpi_review_record', reviews[0].id, { reason: 'tamper' })).status >= 400,
  `${reviews.length} 条:${[...actions].join(',')}`);

// ── T17 数据范围(三类岗位账号)────────────────────────────────────────────
const rdSheet = sheetOf('bu_sw_rd');
await signIn(ACCOUNT.sales);
const salesVisible = await list('kpi_entry_sheet', '?limit=100');
const crossRead = await call('GET', `/data/kpi_entry_sheet/${rdSheet.id}`);
log('T17a', '部门填报人员只见本部门填报单,打开其他部门的填报单被拒绝',
  salesVisible.length > 0 && salesVisible.every((s) => String(s.subject) === 'bu_sw_sales') && (crossRead.status === 403 || crossRead.status === 404),
  `可见 ${salesVisible.length} 张:${salesVisible.map((s) => s.name.split(' · ')[1]).join('、')};越权读取 status=${crossRead.status}`);
const salesResults = await list('kpi_result', '?limit=200');
const salesPersonRows = salesResults.filter((x) => x.dimension === 'person');
const salesUser = userByEmail.get(ACCOUNT.sales);
log('T17b', '到人结果只见本人', salesPersonRows.length > 0 && salesPersonRows.every((x) => String(x.person) === String(salesUser.id)),
  `可见到人结果 ${salesPersonRows.length} 条,全部为本人:${salesPersonRows.every((x) => String(x.person) === String(salesUser.id))}`);

await signIn(ACCOUNT.east);
const eastTasks = await list('kpi_check_task', '?limit=200');
log('T17c', '分公司核对人员只见本分公司的核对任务', eastTasks.length > 0 && eastTasks.every((t) => String(t.branch) === 'bu_sw_east'),
  `可见 ${eastTasks.length} 条,分公司取值:${[...new Set(eastTasks.map((t) => String(t.branch)))].join(',')}`);

await signIn(ACCOUNT.leaderTech);
await waitUntil('技术线分管主体填报单共享给分管领导', async () => (await list('kpi_entry_sheet', '?limit=100')).length > 0);
const techSheets = await list('kpi_entry_sheet', '?limit=100');
// 分管范围以方案里实际配置的分管领导为准(每个参与主体都要配分管领导,范围会随档案调整)。
const techLeaderId = String(userByEmail.get(ACCOUNT.leaderTech)?.id ?? '');
const techScope = new Set(subjects.filter((x) => String(x.leader ?? '') === techLeaderId).map((x) => String(x.subject)));
const leaderCross = await call('GET', `/data/kpi_entry_sheet/${salesSheet.id}`);
log('T17d', '分管领导只见分管主体的填报单,打开非分管主体的填报单被拒绝',
  techScope.size > 0 && techSheets.length === techScope.size && techSheets.every((s) => techScope.has(String(s.subject))) && (leaderCross.status === 403 || leaderCross.status === 404),
  `分管 ${techScope.size} 个主体,可见 ${techSheets.length} 张:${techSheets.map((s) => s.name.split(' · ')[1]).join('、')};越权读取 status=${leaderCross.status}`);

asAdmin();
const summary = { passed: results.filter((x) => x.ok).length, failed: results.filter((x) => !x.ok).length };
console.log(JSON.stringify(summary));
if (process.argv[2]) (await import('node:fs')).writeFileSync(process.argv[2], JSON.stringify(results, null, 2));
if (summary.failed > 0) process.exitCode = 1;
