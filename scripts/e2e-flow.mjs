// 端到端流程验证:对运行中的 dev 实例(默认 http://localhost:3100)以管理员身份经 REST 走完整考核链路。
// 用法:OS_PORT=3100 pnpm dev(空库)→ node scripts/e2e-flow.mjs [结果 json 路径]
// 依赖演示种子;每条用例的预期只来自需求与设计文档,不从实现反推。

const BASE = (process.env.KPI_BASE_URL ?? 'http://localhost:3100') + '/api/v1';
let cookie = '';
const results = [];
function log(id, title, ok, detail = '') { results.push({ id, title, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${title}${detail ? ' — ' + detail : ''}`); }
async function call(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}
const rows = (r) => Array.isArray(r.json) ? r.json : (r.json?.data ?? r.json?.records ?? r.json?.items ?? []);
const one = (r) => r.json?.record ?? r.json?.data ?? r.json;
const list = async (obj, q = '') => rows(await call('GET', `/data/${obj}${q}`));
const get = async (obj, id) => one(await call('GET', `/data/${obj}/${id}`));
const patch = (obj, id, body) => call('PATCH', `/data/${obj}/${id}`, body);
const post = (obj, body) => call('POST', `/data/${obj}`, body);
const msg = (r) => JSON.stringify(r.json).slice(0, 220);

// 0 login
{
  const res = await fetch(BASE + '/auth/sign-in/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@objectos.ai', password: 'admin123' }) });
  cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  log('T0', '管理员登录', res.status === 200, `status ${res.status}`);
}
// 1 seeds & name fill
const plans = await list('kpi_plan');
const plan = plans[0];
log('T1', '种子方案已加载', !!plan, plan?.name);
const pis = await list('kpi_plan_indicator', `?plan=${plan.id}&limit=100`);
log('T2', '指标下达 18 条且名称由 hook 填充', pis.length === 18 && pis.every((p) => p.name && p.name.includes(' · ')), `${pis.length} rows, sample: ${pis[0]?.name}`);
// 2 publish with weight problem: temporarily break a weight
const marketPis = pis.filter((p) => p.name.endsWith('市场部'));
const ORIG = { '营业收入完成率': 50, '利润完成率': 30, '客户满意度': 20 };
for (const p of marketPis) await patch('kpi_plan_indicator', p.id, { weight: ORIG[p.name.split(' · ')[0]] });
const brokenPi = marketPis[0];
const brokenOrig = ORIG[brokenPi.name.split(' · ')[0]];
await patch('kpi_plan_indicator', brokenPi.id, { weight: 10 });
let r = await patch('kpi_plan', plan.id, { status: 'published' });
log('T3', '权重合计≠100 时发布被拒绝并列出问题', r.status >= 400 && msg(r).includes('100%'), msg(r));
await patch('kpi_plan_indicator', brokenPi.id, { weight: brokenOrig });
r = await patch('kpi_plan', plan.id, { status: 'published' });
log('T4', '完整性通过后发布成功', r.status < 300 && one(r)?.status === 'published', msg(r));
const sheets = await list('kpi_entry_sheet', `?plan=${plan.id}&limit=100`);
log('T5', '发布生成 5 张填报单', sheets.length === 5, sheets.map((s) => `${s.name}[${s.status}]`).join(', '));
const allLines = await list('kpi_entry_line', '?limit=200');
log('T6', '生成 18 行明细并冻结目标/权重/计分方式副本', allLines.length === 18 && allLines.every((l) => l.indicator_name && l.weight != null && l.scoring_method), `${allLines.length} rows, sample: ${allLines[0]?.indicator_name} w=${allLines[0]?.weight} target=${allLines[0]?.target_value}`);
r = await patch('kpi_plan_indicator', brokenPi.id, { weight: 40 });
log('T7', '发布后修改指标下达被冻结拒绝', r.status >= 400 && msg(r).includes('冻结'), msg(r));
// 3 scoring on the market sheet
const market = sheets.find((s) => s.name.includes('市场部'));
const mLines = allLines.filter((l) => l.sheet === market.id);
const rev = mLines.find((l) => l.indicator_name === '营业收入完成率');
r = await patch('kpi_entry_line', rev.id, { actual_value: 1320 });
let line = await get('kpi_entry_line', rev.id);
log('T8', '线性:实际 1320/目标 1200 → 完成率 110%,得分 55(权重 50)', line.completion_rate === 110 && line.score === 55 && line.final_score === 55, `rate=${line.completion_rate} score=${line.score} trace=${line.calc_trace}`);
const profit = mLines.find((l) => l.indicator_name === '利润完成率');
await patch('kpi_entry_line', profit.id, { actual_value: 144 });
line = await get('kpi_entry_line', profit.id);
log('T9', '区间插值:144/180=80% → 得分率 50%,得分 15(权重 30)', line.completion_rate === 80 && line.score === 15, `rate=${line.completion_rate} score_rate=${line.score_rate} score=${line.score}`);
const csat = mLines.find((l) => l.indicator_name === '客户满意度');
r = await patch('kpi_entry_sheet', market.id, { pending_action: 'submit' });
log('T10', '有指标未填实际值时提交被拒绝', r.status >= 400 && msg(r).includes('未填写'), msg(r));
await patch('kpi_entry_line', csat.id, { actual_value: 87.3 });
line = await get('kpi_entry_line', csat.id);
log('T11', '阶梯:87.3/90=97% → 命中「达标」得分率 90%,得分 18(权重 20)', line.completion_rate === 97 && line.score === 18, `rate=${line.completion_rate} score=${line.score} trace=${line.calc_trace}`);
let sheet = await get('kpi_entry_sheet', market.id);
log('T12', '填报单汇总:指标得分合计 88、最终得分 88', Number(sheet.indicator_score) === 88 && Number(sheet.total_score) === 88, `indicator_score=${sheet.indicator_score} total=${sheet.total_score} weight_total=${sheet.weight_total}`);
// 4 direct status edit refused
r = await patch('kpi_entry_sheet', market.id, { status: 'approved' });
log('T13', '直接改状态被拒绝', r.status >= 400 && msg(r).includes('按钮'), msg(r));
// 5 submit → branch checking
r = await patch('kpi_entry_sheet', market.id, { pending_action: 'submit' });
sheet = await get('kpi_entry_sheet', market.id);
log('T14', '提交后进入分公司核对中', sheet.status === 'branch_checking' && sheet.submitted_at, `status=${sheet.status} ${msg(r)}`);
let tasks = await list('kpi_check_task', `?sheet=${market.id}`);
log('T15', '按 3 家分公司生成并行核对任务', tasks.length === 3 && tasks.every((t) => t.status === 'pending'), tasks.map((t) => t.name).join(' | '));
r = await patch('kpi_entry_line', rev.id, { actual_value: 9999 });
log('T16', '提交后修改明细被冻结拒绝', r.status >= 400 && msg(r).includes('冻结'), msg(r));
// 6 dispute then confirm
r = await patch('kpi_check_task', tasks[0].id, { status: 'disputed' });
log('T17', '提出争议但无意见被拒绝', r.status >= 400, msg(r));
await patch('kpi_check_task', tasks[0].id, { status: 'disputed', comment: '华东数据口径与业务部门不一致' });
r = await patch('kpi_entry_sheet', market.id, { pending_action: 'approve' });
log('T18', '有争议未解决时不能推进', r.status >= 400 && msg(r).includes('争议'), msg(r));
for (const t of tasks) await patch('kpi_check_task', t.id, { status: 'confirmed', comment: '已确认' });
sheet = await get('kpi_entry_sheet', market.id);
log('T19', '全部分公司确认后自动推进到人力审核中', sheet.status === 'hr_reviewing', `status=${sheet.status}`);
// 7 reject requires reason
r = await patch('kpi_entry_sheet', market.id, { pending_action: 'reject' });
log('T20', '驳回原因为空被拒绝', r.status >= 400 && msg(r).includes('驳回原因'), msg(r));
r = await patch('kpi_entry_sheet', market.id, { pending_action: 'reject', action_reason: '利润数据请复核' });
sheet = await get('kpi_entry_sheet', market.id);
tasks = await list('kpi_check_task', `?sheet=${market.id}`);
log('T21', '驳回退回上一节点(分公司核对),核对任务重置,原因留痕', sheet.status === 'branch_checking' && sheet.last_reject_reason === '利润数据请复核' && tasks.every((t) => t.status === 'pending'), `status=${sheet.status} reason=${sheet.last_reject_reason}`);
for (const t of tasks) await patch('kpi_check_task', t.id, { status: 'confirmed' });
r = await patch('kpi_entry_sheet', market.id, { pending_action: 'approve', action_reason: '人力审核通过' });
sheet = await get('kpi_entry_sheet', market.id);
log('T22', '人力审核通过 → 领导审批中', sheet.status === 'leader_approving', `status=${sheet.status} ${msg(r)}`);
r = await patch('kpi_entry_sheet', market.id, { pending_action: 'approve' });
sheet = await get('kpi_entry_sheet', market.id);
log('T23', '领导审批通过 → 已通过,盖章', sheet.status === 'approved' && sheet.approved_at && sheet.approved_by, `status=${sheet.status}`);
let res = await list('kpi_result', `?plan=${plan.id}&limit=100`);
log('T24', '通过后生成考核结果(部门维度)', res.some((x) => x.dimension === 'department' && Number(x.score) === 88 && x.rank === 1), res.map((x) => `${x.dimension}:${x.score}#${x.rank}`).join(', '));
// 8 bonus
r = await post('kpi_bonus', { sheet: market.id, title: '重大项目中标', bonus_type: 'add', points: 3, reason: '中标 A 项目' });
const bonus = one(r);
r = await patch('kpi_bonus', bonus.id, { status: 'approved' });
sheet = await get('kpi_entry_sheet', market.id);
log('T25', '加减分批准后计入最终得分 91', Number(sheet.bonus_total) === 3 && Number(sheet.total_score) === 91, `bonus_total=${sheet.bonus_total} total=${sheet.total_score} ${msg(r)}`);
// 9 adjustment (source)
r = await post('kpi_adjustment', { line: profit.id, adjust_type: 'source', new_value: 180, reason: '财务复核后利润为 180' });
const adj = one(r);
log('T26', '调整申请记录调整前值 144 与主体', adj && Number(adj.old_value) === 144 && adj.sheet === market.id && adj.subject === market.subject, msg(r));
await patch('kpi_adjustment', adj.id, { status: 'submitted' });
r = await patch('kpi_adjustment', adj.id, { status: 'approved' });
line = await get('kpi_entry_line', profit.id);
sheet = await get('kpi_entry_sheet', market.id);
res = await list('kpi_result', `?plan=${plan.id}&limit=100`);
log('T27', '源数据调整落地并重算:利润 180 → 完成率 100%,得分 30;结果重新汇总', Number(line.actual_value) === 180 && line.score === 30 && line.last_adjustment === adj.id && Number(sheet.total_score) === 106 && res.some((x) => x.dimension === 'department' && Number(x.score) === 106), `actual=${line.actual_value} score=${line.score} total=${sheet.total_score} results=${res.map((x) => x.score).join(',')}`);
// 10 archive
r = await patch('kpi_entry_sheet', market.id, { pending_action: 'archive' });
sheet = await get('kpi_entry_sheet', market.id);
const snaps = await list('kpi_snapshot', `?sheet=${market.id}`);
log('T28', '归档生成不可变快照(含校验和、总分)', sheet.status === 'archived' && snaps.length === 1 && snaps[0].checksum && Number(snaps[0].total_score) === 106, `snap=${snaps[0]?.name} checksum=${String(snaps[0]?.checksum).slice(0, 12)} total=${snaps[0]?.total_score}`);
r = await patch('kpi_snapshot', snaps[0].id, { total_score: 1 });
log('T29', '修改快照被拒绝', r.status >= 400 && msg(r).includes('不能'), msg(r));
r = await call('DELETE', `/data/kpi_snapshot/${snaps[0].id}`);
log('T30', '删除快照被拒绝', r.status >= 400, msg(r));
r = await patch('kpi_entry_line', rev.id, { remark: 'x' });
log('T31', '归档后明细连备注也不可改(已冻结)', r.status >= 400, msg(r));
r = await post('kpi_bonus', { sheet: market.id, title: 'late', bonus_type: 'add', points: 1, reason: 'late' });
log('T32', '归档后不能再加减分', r.status >= 400 && msg(r).includes('归档'), msg(r));
const reviews = await list('kpi_review_record', `?sheet=${market.id}&limit=100`);
const actions = reviews.map((x) => x.action);
log('T33', '审核记录完整留痕(生成/提交/争议/确认/驳回/通过/调整/归档)', ['generate', 'submit', 'dispute', 'confirm', 'reject', 'approve', 'adjust', 'archive'].every((a) => actions.includes(a)), actions.join(','));
r = await patch('kpi_review_record', reviews[0].id, { reason: 'tamper' });
log('T34', '审核记录不可篡改', r.status >= 400, msg(r));
// 11 configurable flow: second plan cloned, fewer steps
r = await post('kpi_plan', { name: '2026 年 9 月 月度考核', period_type: 'month', year: 2026, period_no: 9, period_start: '2026-09-01', period_end: '2026-09-30', based_on: plan.id });
const plan2 = one(r);
const steps2 = await list('kpi_plan_step', `?plan=${plan2.id}`);
const pis2 = await list('kpi_plan_indicator', `?plan=${plan2.id}&limit=100`);
log('T35', '复制上一版本:流程节点 4、指标下达 18 已复制', steps2.length === 4 && pis2.length === 18, `steps=${steps2.length} pis=${pis2.length} ${msg(r).slice(0, 80)}`);
const branchStep = steps2.find((s) => s.step_type === 'branch_check');
const leaderStep = steps2.find((s) => s.step_type === 'leader_approve');
await call('DELETE', `/data/kpi_plan_step/${branchStep.id}`);
await call('DELETE', `/data/kpi_plan_step/${leaderStep.id}`);
r = await patch('kpi_plan', plan2.id, { status: 'published' });
const sheets2 = await list('kpi_entry_sheet', `?plan=${plan2.id}&limit=100`);
const ops2 = sheets2.find((s) => s.name.includes('运营部'));
const lines2 = await list('kpi_entry_line', `?sheet=${ops2.id}&limit=50`);
for (const l of lines2) await patch('kpi_entry_line', l.id, { actual_value: l.indicator_name === '成本费用率' ? 10 : 95 });
await patch('kpi_entry_sheet', ops2.id, { pending_action: 'submit' });
let s2 = await get('kpi_entry_sheet', ops2.id);
const skipped = s2.status === 'hr_reviewing';
await patch('kpi_entry_sheet', ops2.id, { pending_action: 'approve' });
s2 = await get('kpi_entry_sheet', ops2.id);
log('T36', '两节点流程(填报→人力审核):提交直达人力审核,通过即已通过', skipped && s2.status === 'approved', `after submit=${skipped ? 'hr_reviewing' : '?'} final=${s2.status}`);
const costLine = lines2.find((l) => l.indicator_name === '成本费用率');
const cl = await get('kpi_entry_line', costLine.id);
log('T37', '逆向指标:目标 12 实际 10 → 完成率 120%,封顶 110% → 得分 55(权重 50)', cl.completion_rate === 120 && cl.score_rate === 110 && cl.score === 55, `rate=${cl.completion_rate} score_rate=${cl.score_rate} score=${cl.score}`);
const summary = { passed: results.filter((x) => x.ok).length, failed: results.filter((x) => !x.ok).length };
console.log(JSON.stringify(summary));
import('node:fs').then((fs) => fs.writeFileSync(process.argv[2] ?? '/dev/null', JSON.stringify(results, null, 2)));
