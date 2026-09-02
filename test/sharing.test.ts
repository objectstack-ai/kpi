import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LEGACY_RULE_PREFIX,
  RECONCILED_DESCRIPTION_MARK,
  RULE_NAME_MAX,
  RULE_SLUG_MAX,
  isReadOnlyPlanStatus,
  isReconciledDeactivation,
  planRulePrefix,
  planSharingIntents,
  provisionPlanSharing,
  ruleSlug,
  type AssignmentRow,
  type SubjectRow,
} from '../src/services/sharing-service.js';
import type { Api } from '../src/hooks/util.js';
import { isDemoEnvironment, resolveEnvironmentMode } from '../src/data/align-demo-units.js';
import { backfillPlanLinks, registerPlanLinkBackfill, type BackfillHostContext } from '../src/data/backfill-plan-links.js';

const PLAN = 'plan_A1';
const SUBJECTS: SubjectRow[] = [
  { subject: 'bu_market', subject_type: 'department', name: '市场部', leader: 'usr_ABC-123' },
  { subject: 'bu_east', subject_type: 'branch', name: '华东分公司', leader: null },
];
const ASSIGNMENTS: AssignmentRow[] = [{ employee: 'usr_XYZ-789', unit: 'bu_market' }];

describe('规则名片段', () => {
  it('合规的单元 id 原样保留,便于管理员在 Setup 里辨认', () => {
    expect(ruleSlug('bu_market')).toBe('bu_market');
  });

  it('带大小写与短横线的 id 折成合规片段,且同一 id 恒得同一片段', () => {
    const a = ruleSlug('usr_ABC-123');
    expect(a).toMatch(/^[a-z0-9_]+$/);
    expect(ruleSlug('usr_ABC-123')).toBe(a);
    expect(ruleSlug('usr_abc-124')).not.toBe(a);
  });

  it('不同方案的规则前缀不同 —— 规则按方案隔离', () => {
    expect(planRulePrefix('plan_A1')).not.toBe(planRulePrefix('plan_B2'));
    expect(planRulePrefix('plan_A1')).toMatch(/^kpi_p[a-z0-9_]+_$/);
  });
});

describe('按方案配置推导数据范围规则', () => {
  const intents = planSharingIntents(PLAN, SUBJECTS, ASSIGNMENTS);
  const byName = new Map(intents.map((i) => [i.name, i]));
  const P = planRulePrefix(PLAN);

  it('每条规则的条件都带方案 —— 这是能回收授权的前提', () => {
    expect(intents.length).toBeGreaterThan(0);
    for (const i of intents) expect(i.criteria.plan).toBe(PLAN);
  });

  it('每个考核主体单元:填报单 / 核对任务 / 数据调整可编辑,本单元结果只读', () => {
    expect(byName.get(`${P}sheet_bu_market`)).toMatchObject({
      object: 'kpi_entry_sheet', criteria: { plan: PLAN, subject: 'bu_market' }, recipientType: 'unit_and_subordinates', recipientId: 'bu_market', accessLevel: 'edit',
    });
    expect(byName.get(`${P}check_bu_east`)).toMatchObject({ object: 'kpi_check_task', criteria: { plan: PLAN, branch: 'bu_east' }, accessLevel: 'edit' });
    expect(byName.get(`${P}adjust_bu_market`)).toMatchObject({ object: 'kpi_adjustment', criteria: { plan: PLAN, subject: 'bu_market' }, accessLevel: 'edit' });
    expect(byName.get(`${P}result_bu_market`)).toMatchObject({ object: 'kpi_result', criteria: { plan: PLAN, unit: 'bu_market' }, accessLevel: 'read' });
  });

  it('分管领导:所分管主体的填报单可编辑、该主体的结果只读、本人结果只读', () => {
    const L = ruleSlug('usr_ABC-123');
    expect(byName.get(`${P}sheet_leader_bu_market_${L}`)).toMatchObject({ recipientType: 'user', recipientId: 'usr_ABC-123', accessLevel: 'edit', criteria: { plan: PLAN, subject: 'bu_market' } });
    // 部门 / 分公司结果行 person 为空、只共享给单元成员,而领导通常不是单元成员 —— 少了
    // 这条规则,「分管主体的结果」就是一句空话
    expect(byName.get(`${P}result_leader_bu_market_${L}`)).toMatchObject({ object: 'kpi_result', recipientType: 'user', recipientId: 'usr_ABC-123', accessLevel: 'read', criteria: { plan: PLAN, unit: 'bu_market' } });
    expect(byName.get(`${P}result_person_${L}`)).toMatchObject({ object: 'kpi_result', criteria: { plan: PLAN, person: 'usr_ABC-123' }, accessLevel: 'read' });
  });

  it('未配置分管领导的主体不产生领导规则', () => {
    expect(intents.some((i) => i.recipientType === 'user' && i.name.includes('bu_east'))).toBe(false);
  });

  it('被考核员工对本人到人结果只读', () => {
    expect(byName.get(`${P}result_person_${ruleSlug('usr_XYZ-789')}`)).toMatchObject({ object: 'kpi_result', criteria: { plan: PLAN, person: 'usr_XYZ-789' } });
  });

  it('规则名唯一:同一人既是分管领导又被下达到人分工时只出一条本人结果规则', () => {
    const names = intents.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
    const both = planSharingIntents(PLAN, SUBJECTS, [{ employee: 'usr_ABC-123', unit: 'bu_market' }]);
    expect(both.filter((i) => i.recipientId === 'usr_ABC-123' && i.criteria.person === 'usr_ABC-123')).toHaveLength(1);
  });

  it('规则名全部合规(小写字母、数字、下划线,不超过 100)', () => {
    for (const i of intents) expect(i.name).toMatch(/^[a-z0-9_]{1,100}$/);
  });

  it('每条规则锚定它派生自的组织单元 —— 组织归属要跟单元行一致才展开得出人', () => {
    expect(byName.get(`${P}sheet_bu_market`)?.anchorUnit).toBe('bu_market');
    expect(byName.get(`${P}check_bu_east`)?.anchorUnit).toBe('bu_east');
    expect(intents.find((i) => i.recipientId === 'usr_XYZ-789')?.anchorUnit).toBe('bu_market');
  });

  it('人力岗位:本方案全部填报单与数据调整可编辑,收件方是岗位本身', () => {
    for (const position of ['kpi_hr_reviewer', 'kpi_hr_head']) {
      expect(byName.get(`${P}sheet_pos_${position}`)).toMatchObject({
        object: 'kpi_entry_sheet', criteria: { plan: PLAN }, recipientType: 'position', recipientId: position, accessLevel: 'edit',
      });
      expect(byName.get(`${P}adjust_pos_${position}`)).toMatchObject({
        object: 'kpi_adjustment', criteria: { plan: PLAN }, recipientType: 'position', recipientId: position, accessLevel: 'edit',
      });
    }
    // 条件只带方案(全方案范围),但绝不是 match-all —— 平台拒绝空条件的规则
    expect(Object.keys(byName.get(`${P}sheet_pos_kpi_hr_reviewer`)!.criteria)).toEqual(['plan']);
    // 加减分是填报单的主从子记录,记录级判定看主记录,所以不另建规则
    expect(intents.some((i) => i.object === 'kpi_bonus')).toBe(false);
  });

  it('人力岗位规则锚在参与主体上 —— 没有主体就没有这两类规则', () => {
    expect(byName.get(`${P}sheet_pos_kpi_hr_reviewer`)?.anchorUnit).toBe('bu_market');
    expect(planSharingIntents(PLAN, [], ASSIGNMENTS).some((i) => i.recipientType === 'position')).toBe(false);
  });

  it('方案关闭后人力岗位也只留读', () => {
    const closed = planSharingIntents(PLAN, SUBJECTS, ASSIGNMENTS, 'closed');
    const hr = closed.filter((i) => i.recipientType === 'position');
    expect(hr).toHaveLength(4);
    for (const i of hr) expect(i.accessLevel).toBe('read');
  });

  it('空配置不产生任何规则', () => {
    expect(planSharingIntents(PLAN, [], [])).toEqual([]);
  });
});

describe('对账:换人 / 撤主体后旧规则不再出现在目标集合里', () => {
  const P = planRulePrefix(PLAN);
  const oldLeader = ruleSlug('usr_ABC-123');
  const newLeader = ruleSlug('usr_DDD-999');

  it('换掉分管领导:老领导的规则名不在新目标集合中(对账时会被停用)', () => {
    const after = planSharingIntents(PLAN, [{ ...SUBJECTS[0]!, leader: 'usr_DDD-999' }, SUBJECTS[1]!], ASSIGNMENTS);
    const names = new Set(after.map((i) => i.name));
    expect(names.has(`${P}sheet_leader_bu_market_${newLeader}`)).toBe(true);
    expect(names.has(`${P}sheet_leader_bu_market_${oldLeader}`)).toBe(false);
    expect(names.has(`${P}result_person_${oldLeader}`)).toBe(false);
  });

  it('撤掉参与主体:该单元的四类规则一条都不再出现', () => {
    const after = planSharingIntents(PLAN, [SUBJECTS[1]!], []);
    expect(after.some((i) => i.name.includes('bu_market'))).toBe(false);
  });

  it('撤掉到人分工:该员工的本人结果规则不再出现', () => {
    const after = planSharingIntents(PLAN, SUBJECTS, []);
    expect(after.some((i) => i.criteria.person === 'usr_XYZ-789')).toBe(false);
  });

  it('旧版按单元(不带方案)建的规则前缀与方案前缀不同,对账时按前缀能圈到它', () => {
    expect(LEGACY_RULE_PREFIX).toBe('kpi_share_');
    expect(planRulePrefix(PLAN).startsWith(LEGACY_RULE_PREFIX)).toBe(false);
  });
});

describe('已关闭 / 已归档方案:留读、去写', () => {
  it('关闭与归档都算「已结束」,草稿与已发布不算', () => {
    expect(isReadOnlyPlanStatus('closed')).toBe(true);
    expect(isReadOnlyPlanStatus('archived')).toBe(true);
    expect(isReadOnlyPlanStatus('published')).toBe(false);
    expect(isReadOnlyPlanStatus('draft')).toBe(false);
  });

  it('方案结束后填报单 / 核对任务 / 调整由可编辑降为只读,结果本就只读', () => {
    const closed = planSharingIntents(PLAN, SUBJECTS, ASSIGNMENTS, 'closed');
    for (const i of closed) expect(i.accessLevel).toBe('read');
    const live = planSharingIntents(PLAN, SUBJECTS, ASSIGNMENTS, 'published');
    expect(live.filter((i) => i.accessLevel === 'edit').length).toBeGreaterThan(0);
  });

  it('规则名不随状态变化 —— 降级是原地改权限,不是另建一批规则', () => {
    const closed = planSharingIntents(PLAN, SUBJECTS, ASSIGNMENTS, 'closed').map((i) => i.name);
    const live = planSharingIntents(PLAN, SUBJECTS, ASSIGNMENTS, 'published').map((i) => i.name);
    expect(closed).toEqual(live);
  });
});

describe('演示夹具的环境闸门(与平台判定一致,默认闭)', () => {
  it('NODE_ENV 未设时按生产处理 —— 夹具不跑', () => {
    expect(resolveEnvironmentMode({})).toBe('production');
    expect(isDemoEnvironment({})).toBe(false);
  });

  it('生产环境不跑', () => {
    expect(isDemoEnvironment({ NODE_ENV: 'production' })).toBe(false);
  });

  it('dev / development / test 才跑(对齐种子自己声明的 env)', () => {
    expect(isDemoEnvironment({ NODE_ENV: 'development' })).toBe(true);
    expect(isDemoEnvironment({ NODE_ENV: 'dev' })).toBe(true);
    expect(isDemoEnvironment({ NODE_ENV: 'test' })).toBe(true);
  });

  it('未知环境名不开门', () => {
    expect(isDemoEnvironment({ NODE_ENV: 'staging' })).toBe(false);
  });
});

describe('规则名长度上界(平台 sys_sharing_rule.name 最长 100)', () => {
  it('方案名 200 个汉字:所有派生规则名 ≤ 100,且两次派生完全相同(幂等)', () => {
    const longPlan = '考核方案'.repeat(50); // 200 个汉字
    expect(longPlan.length).toBe(200);
    const first = planSharingIntents(longPlan, SUBJECTS, ASSIGNMENTS).map((i) => i.name);
    const second = planSharingIntents(longPlan, SUBJECTS, ASSIGNMENTS).map((i) => i.name);
    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
    for (const name of first) {
      expect(name.length).toBeLessThanOrEqual(RULE_NAME_MAX);
      expect(name).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it('最坏形态:方案 / 单元 / 领导三段 id 都超长时,最长的规则名恰好 99', () => {
    const plan = 'p'.repeat(64);
    const unit = 'u'.repeat(64);
    const leader = 'l'.repeat(64);
    const names = planSharingIntents(plan, [{ subject: unit, name: '超长单元', leader }], [{ employee: 'e'.repeat(64), unit }]).map((i) => i.name);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(name.length).toBeLessThanOrEqual(RULE_NAME_MAX);
      expect(name).toMatch(/^[a-z0-9_]+$/);
    }
    // 贴着上界而不是留一大截:预算算宽了这里会掉下来,算窄了会越过 100
    expect(Math.max(...names.map((n) => n.length))).toBe(99);
  });

  it('修复前真正越界的形态:三段都是 32 位合规 id(旧代码原样保留,拼出 117)', () => {
    // 32 位是旧代码「原样保留」的上限,也正是它唯一会越过 100 的入口 —— 更长的 id 旧代码
    // 反而会折短。这条用例盯的就是那个入口,越界的算术在这里写死:5 + 32 + 1 + 14 + 32 + 1 + 32。
    const plan = 'p'.repeat(32);
    const unit = 'u'.repeat(32);
    const leader = 'l'.repeat(32);
    expect(5 + plan.length + 1 + 'result_leader_'.length + unit.length + 1 + leader.length).toBe(117);
    const names = planSharingIntents(plan, [{ subject: unit, name: '单元', leader }], []).map((i) => i.name);
    expect(names.some((n) => n.includes('result_leader_'))).toBe(true);
    for (const name of names) expect(name.length).toBeLessThanOrEqual(RULE_NAME_MAX);
  });

  it('片段上界之内的 id 原样保留 —— 已写入的规则名不因本次改动而改名', () => {
    expect(ruleSlug('bu_market')).toBe('bu_market');
    expect(ruleSlug('a'.repeat(RULE_SLUG_MAX))).toBe('a'.repeat(RULE_SLUG_MAX));
  });

  it('UUID 形态的 id(平台记录 id)仍走既有折法:头部 12 位 + 稳定哈希', () => {
    // 这是升级兼容的钉子:改了这条折法,升级前写入的规则会整批改名,旧名既不在目标集合里
    // 又不落在新前缀下,对账从此圈不到它们 —— 恰是本模块要消灭的不可回收授权。
    const uuid = '9F8E7D6C-1234-4ABC-9DEF-0123456789AB';
    const slug = ruleSlug(uuid);
    expect(slug).toMatch(/^9f8e7d6c1234_[a-z0-9]{1,7}$/);
    expect(slug.length).toBeLessThanOrEqual(RULE_SLUG_MAX);
    expect(ruleSlug(uuid)).toBe(slug);
  });

  it('合规但超长的 id 折成「截断 + 8 位稳定哈希」,长度恒为片段上界', () => {
    const long = 'x'.repeat(64);
    const slug = ruleSlug(long);
    expect(slug.length).toBe(RULE_SLUG_MAX);
    expect(slug).toMatch(/^x{17}_[a-z0-9]{8}$/);
    expect(ruleSlug(long)).toBe(slug);
    expect(ruleSlug('x'.repeat(65))).not.toBe(slug); // 只差一位也得出不同片段
  });
});

// ---------------------------------------------------------------------------
// 内存版数据 API —— 只实现 sharing-service 真正用到的那几条读写路径。
// ---------------------------------------------------------------------------
const ORG = 'org_1';

interface FakeApiOptions {
  planStatus?: string;
  subjects?: SubjectRow[];
  assignments?: AssignmentRow[];
  units?: Record<string, string | null>;
  rules?: Array<Record<string, any>>;
}

function fakeSharingApi(options: FakeApiOptions = {}): { api: Api; rules: Array<Record<string, any>> } {
  const rules: Array<Record<string, any>> = (options.rules ?? []).map((r, i) => ({ id: `seed_${i}`, active: true, organization_id: ORG, ...r }));
  const units: Record<string, string | null> = options.units ?? { bu_market: ORG, bu_east: ORG };
  let next = 0;
  const api = {
    object(name: string) {
      return {
        async find(query: Record<string, any> = {}) {
          const where = (query.where ?? {}) as Record<string, any>;
          if (name === 'kpi_plan_subject') return options.subjects ?? SUBJECTS;
          if (name === 'kpi_staff_assignment') return options.assignments ?? ASSIGNMENTS;
          if (name === 'sys_sharing_rule') return rules.filter((r) => r.organization_id === where.organization_id);
          return [];
        },
        async findOne(query: Record<string, any> = {}) {
          const where = (query.where ?? {}) as Record<string, any>;
          if (name === 'kpi_plan') return { id: where.id, status: options.planStatus ?? 'published' };
          if (name === 'sys_business_unit') {
            return where.id in units ? { id: where.id, organization_id: units[where.id] } : null;
          }
          if (name === 'sys_sharing_rule') {
            return rules.find((r) => r.name === where.name && r.organization_id === where.organization_id) ?? null;
          }
          return null;
        },
        async count() { return 0; },
        async insert(data: Record<string, unknown>) {
          const row = { id: `new_${next++}`, ...data };
          rules.push(row);
          return row;
        },
        async update() { return null; },
        async updateById(id: string, data: Record<string, unknown>) {
          const row = rules.find((r) => r.id === id);
          if (row) Object.assign(row, data);
          return row ?? null;
        },
        async delete() { return null; },
      };
    },
  } as unknown as Api;
  return { api, rules };
}

describe('对账:停用旧式 kpi_share_* 规则', () => {
  it('存在旧规则 → 停用(并盖上对账标记,行保留不删)', async () => {
    const legacy = { id: 'legacy_1', name: `${LEGACY_RULE_PREFIX}bu_market_sheet`, organization_id: ORG, active: true, description: '旧版按单元建的规则' };
    const { api, rules } = fakeSharingApi({ rules: [legacy] });
    const outcome = await provisionPlanSharing(api, PLAN, { reconcile: true });

    expect(outcome.deactivated).toBe(1);
    const after = rules.find((r) => r.id === 'legacy_1')!;
    expect(after.active).toBe(false);
    expect(isReconciledDeactivation(after)).toBe(true);
    expect(after.description).toBe(`${RECONCILED_DESCRIPTION_MARK}旧版按单元建的规则`);
    // 行保留,不删除 —— 管理员仍看得到它曾经存在
    expect(rules.some((r) => r.id === 'legacy_1')).toBe(true);
  });

  it('不存在旧规则 → 一条都不动(本方案自己刚写的规则全部保持启用)', async () => {
    const { api, rules } = fakeSharingApi();
    const outcome = await provisionPlanSharing(api, PLAN, { reconcile: true });

    expect(outcome.deactivated).toBe(0);
    expect(outcome.created).toBeGreaterThan(0);
    expect(rules.some((r) => r.active === false)).toBe(false);
    expect(rules.some((r) => isReconciledDeactivation(r))).toBe(false); // 无任何行被盖上对账标记
  });

  it('别的方案的规则与被管理员改过的规则都不在对账射程内', async () => {
    const other = { id: 'other_1', name: `${planRulePrefix('plan_B2')}sheet_bu_market`, organization_id: ORG, active: true };
    const customized = { id: 'cust_1', name: `${LEGACY_RULE_PREFIX}bu_east_sheet`, organization_id: ORG, active: true, customized: true };
    const { api, rules } = fakeSharingApi({ rules: [other, customized] });
    const outcome = await provisionPlanSharing(api, PLAN, { reconcile: true });

    expect(outcome.deactivated).toBe(0);
    expect(rules.find((r) => r.id === 'other_1')!.active).toBe(true);
    expect(rules.find((r) => r.id === 'cust_1')!.active).toBe(true);
  });
});

describe('已停用规则的日志:管理员手工停用 vs 本应用对账停用', () => {
  afterEach(() => vi.restoreAllMocks());

  const targetName = `${planRulePrefix(PLAN)}sheet_bu_market`;

  it('管理员手工停用的规则记 skipped_inactive_admin', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { api } = fakeSharingApi({ rules: [{ id: 'x1', name: targetName, active: false, description: '考核主体成员' }] });
    const outcome = await provisionPlanSharing(api, PLAN, {});

    expect(outcome.skipped).toBe(1);
    const reasons = info.mock.calls.map((c) => (c[1] as Record<string, unknown>)?.reason);
    expect(reasons).toContain('skipped_inactive_admin');
    expect(reasons).not.toContain('skipped_inactive_reconciled');
  });

  it('本应用上次对账停用的规则记 skipped_inactive_reconciled', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { api } = fakeSharingApi({ rules: [{ id: 'x1', name: targetName, active: false, description: `${RECONCILED_DESCRIPTION_MARK}考核主体成员` }] });
    const outcome = await provisionPlanSharing(api, PLAN, {});

    expect(outcome.skipped).toBe(1);
    const reasons = info.mock.calls.map((c) => (c[1] as Record<string, unknown>)?.reason);
    expect(reasons).toContain('skipped_inactive_reconciled');
    expect(reasons).not.toContain('skipped_inactive_admin');
  });

  it('两种情形都不改写 active —— 撤销授权的开关只归管理员', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const { api, rules } = fakeSharingApi({ rules: [{ id: 'x1', name: targetName, active: false, description: '考核主体成员' }] });
    await provisionPlanSharing(api, PLAN, {});
    expect(rules.find((r) => r.id === 'x1')!.active).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 历史行的方案回填
// ---------------------------------------------------------------------------
interface FakeStore extends Record<string, Array<Record<string, any>>> {
  kpi_check_task: Array<Record<string, any>>;
  kpi_adjustment: Array<Record<string, any>>;
  kpi_entry_sheet: Array<Record<string, any>>;
}

function fakeBackfillCtx(store: Partial<FakeStore>, refuse: ReadonlySet<string> = new Set(), failSheetLookup = false): {
  ctx: BackfillHostContext;
  writes: Array<{ object: string; id: string; data: Record<string, unknown>; context: unknown }>;
  logs: unknown[][];
  tables: FakeStore;
} {
  const tables: FakeStore = {
    kpi_check_task: store.kpi_check_task ?? [],
    kpi_adjustment: store.kpi_adjustment ?? [],
    kpi_entry_sheet: store.kpi_entry_sheet ?? [],
  };
  const writes: Array<{ object: string; id: string; data: Record<string, unknown>; context: unknown }> = [];
  const logs: unknown[][] = [];
  const ctx: BackfillHostContext = {
    ql: {
      async find(object: string, query: unknown) {
        const q = (query ?? {}) as Record<string, any>;
        const rows = tables[object] ?? [];
        if (object === 'kpi_entry_sheet') {
          if (failSheetLookup) throw new Error('SQLITE_TOOBIG: too many SQL variables');
          const ids: string[] = q.where?.id?.$in ?? [];
          return rows.filter((r) => ids.includes(String(r.id)));
        }
        // 平台的 `where: { plan: null }` 语义:只回 plan 为 null 的行
        return rows.filter((r) => (r.plan ?? null) === null).slice(0, q.limit ?? 500);
      },
      async update(object: string, data: Record<string, unknown>, options: unknown) {
        const o = (options ?? {}) as Record<string, any>;
        const id = String(o.where?.id);
        if (refuse.has(id)) throw new Error('KPI_ADJ_ARCHIVED');
        writes.push({ object, id, data, context: o.context });
        const row = (tables[object] ?? []).find((r) => String(r.id) === id);
        if (row) Object.assign(row, data);
        return row ?? null;
      },
    },
    logger: { info: (...a: unknown[]) => logs.push(a), warn: (...a: unknown[]) => logs.push(a) },
  };
  return { ctx, writes, logs, tables };
}

describe('历史行方案回填', () => {
  const sheets = [
    { id: 'sheet_ok', plan: 'plan_A1' },
    { id: 'sheet_noplan', plan: null },
  ];

  it('三种行只写第一种;第二次运行零写入', async () => {
    const { ctx, writes, tables } = fakeBackfillCtx({
      kpi_check_task: [
        { id: 'ct_fill', sheet: 'sheet_ok', plan: null },      // ① plan 为空、可推导 → 写
        { id: 'ct_orphan', sheet: 'sheet_noplan', plan: null }, // ② plan 为空、推不出 → 跳过
        { id: 'ct_done', sheet: 'sheet_ok', plan: 'plan_A1' },  // ③ plan 已有 → 根本不在结果集里
      ],
      kpi_entry_sheet: sheets,
    });

    const first = await backfillPlanLinks(ctx);
    expect(first).toMatchObject({ filled: 1, unresolved: 1, failed: 0 });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ object: 'kpi_check_task', id: 'ct_fill', data: { plan: 'plan_A1' } });
    // 只写 plan 一个字段,不碰行上任何其它列
    expect(Object.keys(writes[0]!.data)).toEqual(['plan']);
    // 以系统上下文写(plan 是 readonly 字段),但不绕过 hook —— 走的是同一条 ql.update
    expect(writes[0]!.context).toEqual({ isSystem: true });
    expect(tables.kpi_check_task.find((r) => r.id === 'ct_done')!.plan).toBe('plan_A1');

    writes.length = 0;
    const second = await backfillPlanLinks(ctx);
    expect(writes).toHaveLength(0);
    expect(second.filled).toBe(0);
  });

  it('核对任务与数据调整两个对象都回填', async () => {
    const { ctx, writes } = fakeBackfillCtx({
      kpi_check_task: [{ id: 'ct_1', sheet: 'sheet_ok', plan: null }],
      kpi_adjustment: [{ id: 'adj_1', sheet: 'sheet_ok', plan: null }],
      kpi_entry_sheet: sheets,
    });
    const outcome = await backfillPlanLinks(ctx);
    expect(outcome.filled).toBe(2);
    expect(writes.map((w) => w.object).sort()).toEqual(['kpi_adjustment', 'kpi_check_task']);
    expect(outcome.byObject.map((o) => [o.object, o.filled])).toEqual([['kpi_check_task', 1], ['kpi_adjustment', 1]]);
  });

  it('被不可变 hook 拒绝写的行:跳过并计数,不阻断其余行', async () => {
    const { ctx, writes, logs } = fakeBackfillCtx({
      kpi_adjustment: [
        { id: 'adj_locked', sheet: 'sheet_ok', plan: null },
        { id: 'adj_ok', sheet: 'sheet_ok', plan: null },
      ],
      kpi_entry_sheet: sheets,
    }, new Set(['adj_locked']));

    const outcome = await backfillPlanLinks(ctx);
    expect(outcome).toMatchObject({ filled: 1, failed: 1 });
    expect(writes.map((w) => w.id)).toEqual(['adj_ok']);
    expect(logs.some((l) => String(l[0]).includes('write refused'))).toBe(true);
  });

  it('没有填报单的行推不出方案,计入 unresolved 而不是写空', async () => {
    const { ctx, writes } = fakeBackfillCtx({
      kpi_check_task: [{ id: 'ct_nosheet', sheet: null, plan: null }],
      kpi_entry_sheet: sheets,
    });
    const outcome = await backfillPlanLinks(ctx);
    expect(outcome).toMatchObject({ filled: 0, unresolved: 1, failed: 0 });
    expect(writes).toHaveLength(0);
  });

  it('挂在 kernel:bootstrapped;无可回填行时零写入、零日志', async () => {
    const { ctx, writes, logs } = fakeBackfillCtx({ kpi_entry_sheet: sheets });
    const handlers: Array<() => Promise<void> | void> = [];
    registerPlanLinkBackfill({ ...ctx, hook: (event, handler) => { expect(event).toBe('kernel:bootstrapped'); handlers.push(handler); } });
    expect(handlers).toHaveLength(1);
    await handlers[0]!();
    expect(writes).toHaveLength(0);
    expect(logs).toHaveLength(0);
  });

  it('读填报单失败:不抛、不阻断另一个对象的回填,本批延到下次启动', async () => {
    // 整条链挂在 kernel:bootstrapped 上,从这里抛出去就是启动期未捕获拒绝
    const { ctx, writes, logs } = fakeBackfillCtx({
      kpi_check_task: [{ id: 'ct_1', sheet: 'sheet_ok', plan: null }],
      kpi_adjustment: [{ id: 'adj_1', sheet: 'sheet_ok', plan: null }],
      kpi_entry_sheet: sheets,
    }, new Set(), true);

    const outcome = await backfillPlanLinks(ctx);
    expect(outcome).toMatchObject({ filled: 0, failed: 0 });
    // 两个对象都跑到了(读失败没有把第二遍带走),各自一行落进 unresolved
    expect(outcome.byObject.map((o) => o.object)).toEqual(['kpi_check_task', 'kpi_adjustment']);
    expect(outcome.unresolved).toBe(2);
    expect(writes).toHaveLength(0);
    expect(logs.filter((l) => String(l[0]).includes('entry sheet lookup failed'))).toHaveLength(2);
  });

  it('注册入口即便内部整体失败也不抛 —— kernel:bootstrapped 上不能有未捕获拒绝', async () => {
    const logs: unknown[][] = [];
    const handlers: Array<() => Promise<void> | void> = [];
    registerPlanLinkBackfill({
      ql: {
        find: async () => { throw new Error('engine not bound'); },
        update: async () => null,
      },
      logger: { info: (...a: unknown[]) => logs.push(a), warn: (...a: unknown[]) => logs.push(a) },
      hook: (_e, handler) => { handlers.push(handler); },
    });
    await expect(handlers[0]!()).resolves.toBeUndefined();
    // 内层 lookup 自己兜住了,记一条 warn 而不是把异常抛给引导流程
    expect(logs.some((l) => String(l[0]).includes('lookup failed'))).toBe(true);
  });

  it('整批都没写动时留下一条 warn,而不是静默停在中途', async () => {
    // 500 行都推不出方案:取满一批、一个新 id 都没有 —— 收工,但要说出来
    const many = Array.from({ length: 500 }, (_, i) => ({ id: `ct_${i}`, sheet: 'sheet_noplan', plan: null }));
    const { ctx, logs } = fakeBackfillCtx({ kpi_check_task: many, kpi_entry_sheet: sheets });
    const outcome = await backfillPlanLinks(ctx);
    expect(outcome).toMatchObject({ filled: 0, unresolved: 500 });
    expect(logs.some((l) => String(l[0]).includes('made no progress'))).toBe(true);
  });

  it('有回填发生时摘要走 warn 级 —— dev 的默认日志级别看不见 info', async () => {
    const { ctx } = fakeBackfillCtx({
      kpi_check_task: [{ id: 'ct_1', sheet: 'sheet_ok', plan: null }],
      kpi_entry_sheet: sheets,
    });
    const levels: string[] = [];
    const handlers: Array<() => Promise<void> | void> = [];
    registerPlanLinkBackfill({ ...ctx, logger: { info: () => levels.push('info'), warn: () => levels.push('warn') }, hook: (_e, h) => { handlers.push(h); } });
    await handlers[0]!();
    expect(levels).toEqual(['warn']);
  });

  it('有回填发生时把条数记进日志', async () => {
    const { ctx, logs } = fakeBackfillCtx({
      kpi_check_task: [{ id: 'ct_1', sheet: 'sheet_ok', plan: null }],
      kpi_entry_sheet: sheets,
    });
    const handlers: Array<() => Promise<void> | void> = [];
    registerPlanLinkBackfill({ ...ctx, hook: (_e, handler) => { handlers.push(handler); } });
    await handlers[0]!();
    expect(logs).toHaveLength(1);
    expect(String(logs[0]![0])).toContain('历史行方案回填');
    expect(logs[0]![1]).toMatchObject({ filled: 1 });
  });
});
