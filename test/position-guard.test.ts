import { describe, expect, it } from 'vitest';
import type { Hook, HookContext } from '@objectstack/spec/data';
import { SheetAfterTransitionHook, SheetTransitionHook } from '../src/hooks/sheet.hook.js';
import { CheckTaskDecideHook } from '../src/hooks/check-task.hook.js';
import { BonusHook } from '../src/hooks/bonus.hook.js';
import { hasPosition, isSystemWrite, type KpiError } from '../src/hooks/util.js';

/**
 * 流程按钮的岗位闸(工作项 #28)。
 *
 * 平台执行动作体(按钮)时的上下文是「{ ...调用者上下文, isSystem: true }」——
 * 系统标记为真,发起人的 userId 原样保留。所以这里的三类用例分别锁住:
 *  1. 按钮路径(isSystem + 发起人):非本节点岗位必须被拒;
 *  2. 按钮路径(isSystem + 发起人):本节点岗位必须放行;
 *  3. 纯系统写入(isSystem,无发起人):必须放行 —— 发布、重算、hook 内部自动推进
 *     不能被岗位闸误伤。
 * 另外锁住第 4 类:REST 路径(非系统 + 发起人)与按钮路径结论一致,同一口径。
 *
 * 第 5 类是本文件的替身必须**真实**的地方:hook 自己发起的写入会再次穿过 hook 链。
 * 替身因此实现了 `sudo()` 语义与「平台审计戳 hook 先于业务 hook 写同一个 input」的时序,
 * 否则 after 阶段的清场写入根本没被测到 —— 归档半途失败的缺陷就是从这个缝里漏过去的。
 */

const STEPS = [
  { id: 's1', plan: 'plan1', seq: 1, step_type: 'dept_submit', label: '部门填报', approver_position: 'kpi_dept_reporter' },
  { id: 's2', plan: 'plan1', seq: 2, step_type: 'branch_check', label: '分公司核对', approver_position: 'kpi_branch_checker' },
  { id: 's3', plan: 'plan1', seq: 3, step_type: 'hr_review', label: '人力审核', approver_position: 'kpi_hr_reviewer' },
  { id: 's4', plan: 'plan1', seq: 4, step_type: 'leader_approve', label: '领导审批', approver_position: 'kpi_exec_leader' },
];

interface StoreShape {
  [object: string]: Array<Record<string, any>>;
}

/** 平台 ExecutionContext 的最小形状(替身只用到这三项)。 */
interface ExecCtx {
  userId?: string;
  isSystem?: true;
  tenantId?: string;
}

function matches(row: Record<string, any>, where: Record<string, any> | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && '$in' in v) return (v.$in as unknown[]).map(String).includes(String(row[k]));
    if (v === null) return row[k] === null || row[k] === undefined;
    return String(row[k]) === String(v);
  });
}

/** 平台 `ObjectQL.buildSession` 的口径:没有身份信封时返回 undefined。 */
function buildSession(ec: ExecCtx): Record<string, unknown> | undefined {
  const session = { userId: ec.userId, organizationId: ec.tenantId, ...(ec.isSystem ? { isSystem: true as const } : {}) };
  return Object.values(session).some((v) => v !== undefined) ? session : undefined;
}

/** 平台 `ObjectQL.buildUser` 的口径:`userId` 为空时没有「当前用户」。 */
function buildUser(ec: ExecCtx): { id: string } | undefined {
  return ec.userId == null ? undefined : { id: String(ec.userId) };
}

/**
 * 替身引擎:存数据 + 按平台的时序派发 hook。
 *
 * 写入管线刻意复刻两件真实行为,因为缺陷正是从它们的交界处冒出来的:
 *  1. **平台内建的审计戳 hook 先跑**(`sys_stamp_audit_update`,object `'*'`,priority 10),
 *     把 `updated_at` / `updated_by` 写进业务 hook 将要看到的**同一个** `ctx.input`;
 *  2. hook 内部经 `ctx.api` 发起的写入**会再穿一遍 hook 链**,并带着那次写入自己的上下文。
 */
class FakeEngine {
  constructor(
    readonly store: StoreShape,
    readonly hooks: Hook[] = [],
  ) {}

  readonly writes: Array<{ object: string; id: string; data: Record<string, any>; ec: ExecCtx }> = [];

  rows(object: string): Array<Record<string, any>> {
    return (this.store[object] ??= []);
  }

  private hooksFor(object: string, event: string): Hook[] {
    return this.hooks
      .filter((h) => h.object === object && (h.events as string[]).includes(event))
      .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }

  async update(object: string, id: string, data: Record<string, any>, ec: ExecCtx): Promise<Record<string, any> | null> {
    const previous = this.rows(object).find((r) => String(r.id) === String(id));
    const input: Record<string, any> = { id, ...data };
    // ① 平台审计戳 hook(priority 10)先于业务 hook 写同一个 input
    input.updated_at = new Date().toISOString();
    input.updated_by = ec.userId ?? null;
    const ctx = {
      object,
      event: 'beforeUpdate',
      input,
      previous: previous ? { ...previous } : undefined,
      session: buildSession(ec),
      user: buildUser(ec),
      api: new FakeScopedContext(ec, this),
    } as unknown as HookContext;
    for (const hook of this.hooksFor(object, 'beforeUpdate')) {
      await (hook.handler as (c: HookContext) => Promise<void>)(ctx);
    }
    this.writes.push({ object, id, data: { ...input }, ec });
    if (previous) Object.assign(previous, input);
    for (const hook of this.hooksFor(object, 'afterUpdate')) {
      await (hook.handler as (c: HookContext) => Promise<void>)(ctx);
    }
    return previous ?? null;
  }
}

/** 替身 ScopedContext:`executionContext` 是可写的实例属性,`sudo()` 派生一个新的(与平台一致)。 */
class FakeScopedContext {
  constructor(
    public executionContext: ExecCtx,
    private readonly engine: FakeEngine,
  ) {}

  sudo(): FakeScopedContext {
    return new FakeScopedContext({ ...this.executionContext, isSystem: true }, this.engine);
  }

  object(name: string) {
    // 与平台一致:仓库在 `object()` 调用的这一刻捕获上下文快照
    const ec: ExecCtx = { ...this.executionContext };
    const engine = this.engine;
    const rows = () => engine.rows(name);
    return {
      async find(q?: Record<string, any>) {
        return rows().filter((r) => matches(r, q?.where));
      },
      async findOne(q?: Record<string, any>) {
        return rows().find((r) => matches(r, q?.where)) ?? null;
      },
      async count(q?: Record<string, any>) {
        return rows().filter((r) => matches(r, q?.where)).length;
      },
      async insert(data: Record<string, any>) {
        const row = { id: `${name}_${rows().length + 1}`, ...data };
        rows().push(row);
        return row;
      },
      async update(data: Record<string, any>) {
        return data;
      },
      async updateById(id: string, data: Record<string, any>) {
        return engine.update(name, id, data, ec);
      },
      async delete() {
        return null;
      },
    };
  }
}

type Session = { isSystem?: true; userId?: string };

/** 按钮路径:平台以「受信任」身份跑动作体,系统标记为真、发起人仍在。 */
const viaButton = (userId: string): Session => ({ isSystem: true, userId });
/** REST 路径:调用者身份原样进入。 */
const viaRest = (userId: string): Session => ({ userId });
/** 纯系统写入:有系统标记,没有发起人(种子、脚本、hook 内部自动推进)。 */
const viaSystem = (): Session => ({ isSystem: true });

function baseStore(overrides: Partial<StoreShape> = {}): StoreShape {
  return {
    kpi_plan_step: STEPS,
    kpi_plan_subject: [{ id: 'ps1', plan: 'plan1', subject: 'bu_a', subject_type: 'dept' }],
    kpi_check_task: [],
    kpi_entry_line: [],
    sys_member: [],
    sys_user_position: [
      { id: 'p1', user_id: 'u_reporter', position: 'kpi_dept_reporter' },
      { id: 'p2', user_id: 'u_checker', position: 'kpi_branch_checker' },
      { id: 'p3', user_id: 'u_hr', position: 'kpi_hr_reviewer' },
      { id: 'p4', user_id: 'u_hrhead', position: 'kpi_hr_head' },
      { id: 'p5', user_id: 'u_leader', position: 'kpi_exec_leader' },
    ],
    ...overrides,
  };
}

/** 最小 ctx.api 替身(带 `sudo()` 语义)。默认不挂 hook —— 单跑一个 handler 的用例用它。 */
function fakeApi(store: StoreShape, hooks: Hook[] = []) {
  const engine = new FakeEngine(store, hooks);
  return { api: new FakeScopedContext({}, engine), engine, writes: engine.writes };
}

function sheetCtx(opts: {
  session: Session;
  status: string;
  input: Record<string, any>;
  store?: StoreShape;
}): { ctx: HookContext; input: Record<string, any> } {
  const store = opts.store ?? baseStore();
  const { api } = fakeApi(store);
  const input = { id: 'sheet1', ...opts.input };
  const ctx = {
    object: 'kpi_entry_sheet',
    event: 'beforeUpdate',
    input,
    previous: { id: 'sheet1', plan: 'plan1', subject: 'bu_a', status: opts.status },
    session: opts.session,
    user: opts.session.userId ? { id: opts.session.userId } : undefined,
    api,
  } as unknown as HookContext;
  return { ctx, input };
}

/** hook 的 `handler` 在规格里是「函数或字符串」的联合类型;单测只跑函数形态。 */
const run = (hook: Hook) => hook.handler as (ctx: HookContext) => Promise<void>;

async function codeOf(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    return (err as KpiError).code ?? null;
  }
}

describe('isSystemWrite —— 系统标记不等于系统写入', () => {
  const ctxWith = (session: Session, user?: { id: string }) =>
    ({ session, user } as unknown as HookContext);

  it('按钮路径带发起人:不是系统写入', () => {
    expect(isSystemWrite(ctxWith(viaButton('u_hr')))).toBe(false);
  });
  it('无发起人的系统上下文:是系统写入', () => {
    expect(isSystemWrite(ctxWith(viaSystem()))).toBe(true);
  });
  it('普通用户写入:不是系统写入', () => {
    expect(isSystemWrite(ctxWith(viaRest('u_hr')))).toBe(false);
  });
  it('ctx.user 存在而 session 没有 userId 时也认得出发起人', () => {
    expect(isSystemWrite(ctxWith({ isSystem: true }, { id: 'u_hr' }))).toBe(false);
  });
});

describe('sysNoActor —— 摘掉发起人的系统上下文', () => {
  it('经 sysNoActor 发起的写入,到达下游 hook 时没有发起人', async () => {
    const seen: Array<{ isSystemWrite: boolean; updatedBy: unknown }> = [];
    const probe: Hook = {
      name: 'probe', label: 'probe', object: 'kpi_entry_sheet', events: ['beforeUpdate'], priority: 100,
      handler: async (c: HookContext) => {
        seen.push({ isSystemWrite: isSystemWrite(c), updatedBy: (c.input as Record<string, any>).updated_by });
      },
    };
    const store = baseStore({ kpi_entry_sheet: [{ id: 'sheet1', plan: 'plan1', status: 'approved' }] });
    const engine = new FakeEngine(store, [probe]);
    const caller = new FakeScopedContext({ userId: 'u_hr', isSystem: true, tenantId: 'org1' }, engine);
    const ctx = { api: caller, session: viaButton('u_hr'), user: { id: 'u_hr' } } as unknown as HookContext;

    const { sys, sysNoActor } = await import('../src/hooks/util.js');
    await sys(ctx).object('kpi_entry_sheet').updateById('sheet1', { remark: 'a' });
    await sysNoActor(ctx).object('kpi_entry_sheet').updateById('sheet1', { remark: 'b' });

    expect(seen[0]).toEqual({ isSystemWrite: false, updatedBy: 'u_hr' });
    expect(seen[1]).toEqual({ isSystemWrite: true, updatedBy: null });
    // 租户信息不能被一并摘掉
    expect((sysNoActor(ctx) as unknown as FakeScopedContext).executionContext.tenantId).toBe('org1');
  });
});

describe('hasPosition —— 免检只留给纯系统写入', () => {
  it('按钮路径的发起人没有该岗位:不放行', async () => {
    const { api } = fakeApi(baseStore());
    const ctx = { session: viaButton('u_hr'), user: { id: 'u_hr' }, api } as unknown as HookContext;
    expect(await hasPosition(ctx, 'kpi_exec_leader')).toBe(false);
  });
  it('按钮路径的发起人持有该岗位:放行', async () => {
    const { api } = fakeApi(baseStore());
    const ctx = { session: viaButton('u_leader'), user: { id: 'u_leader' }, api } as unknown as HookContext;
    expect(await hasPosition(ctx, 'kpi_exec_leader')).toBe(true);
  });
  it('无发起人的系统写入:放行', async () => {
    const { api } = fakeApi(baseStore());
    const ctx = { session: viaSystem(), api } as unknown as HookContext;
    expect(await hasPosition(ctx, 'kpi_exec_leader')).toBe(true);
  });
});

describe('填报单流程推进 —— 按钮路径按发起人校验岗位', () => {
  it('人力审核对「领导审批中」的单点「审核通过」被拒(越节点)', async () => {
    const { ctx } = sheetCtx({ session: viaButton('u_hr'), status: 'leader_approving', input: { pending_action: 'approve' } });
    expect(await codeOf(() => run(SheetTransitionHook)(ctx))).toBe('KPI_SHEET_POSITION');
  });

  it('部门填报人员对「领导审批中」的单点「审核通过」被拒', async () => {
    const { ctx } = sheetCtx({ session: viaButton('u_reporter'), status: 'leader_approving', input: { pending_action: 'approve' } });
    expect(await codeOf(() => run(SheetTransitionHook)(ctx))).toBe('KPI_SHEET_POSITION');
  });

  it('部门填报人员对「已通过」的单点「归档」被拒(归档要人力审核岗位)', async () => {
    const { ctx } = sheetCtx({ session: viaButton('u_reporter'), status: 'approved', input: { pending_action: 'archive' } });
    expect(await codeOf(() => run(SheetTransitionHook)(ctx))).toBe('KPI_SHEET_POSITION');
  });

  it('部门填报人员对「领导审批中」的单点「驳回」被拒', async () => {
    const { ctx } = sheetCtx({ session: viaButton('u_reporter'), status: 'leader_approving', input: { pending_action: 'reject', action_reason: '不同意' } });
    expect(await codeOf(() => run(SheetTransitionHook)(ctx))).toBe('KPI_SHEET_POSITION');
  });

  it('分管领导对「领导审批中」的单点「审核通过」放行,状态推进到已通过', async () => {
    const { ctx, input } = sheetCtx({ session: viaButton('u_leader'), status: 'leader_approving', input: { pending_action: 'approve' } });
    await run(SheetTransitionHook)(ctx);
    expect(input.status).toBe('approved');
    expect(input.approved_by).toBe('u_leader');
  });

  it('人力审核对「人力审核中」的单点「审核通过」放行', async () => {
    const { ctx, input } = sheetCtx({ session: viaButton('u_hr'), status: 'hr_reviewing', input: { pending_action: 'approve' } });
    await run(SheetTransitionHook)(ctx);
    expect(input.status).toBe('leader_approving');
  });

  it('人力审核对「已通过」的单点「归档」放行', async () => {
    const { ctx, input } = sheetCtx({ session: viaButton('u_hr'), status: 'approved', input: { pending_action: 'archive' } });
    await run(SheetTransitionHook)(ctx);
    expect(input.status).toBe('archived');
  });

  it('无发起用户的系统写入放行(hook 内部自动推进 / 脚本建链)', async () => {
    const { ctx, input } = sheetCtx({ session: viaSystem(), status: 'branch_checking', input: { pending_action: 'approve', action_reason: '全部分公司已确认,系统自动推进' } });
    await run(SheetTransitionHook)(ctx);
    expect(input.status).toBe('hr_reviewing');
  });

  it('REST 路径与按钮路径同一结论:人力审核越节点仍被拒、分管领导仍放行', async () => {
    const denied = sheetCtx({ session: viaRest('u_hr'), status: 'leader_approving', input: { pending_action: 'approve' } });
    expect(await codeOf(() => run(SheetTransitionHook)(denied.ctx))).toBe('KPI_SHEET_POSITION');
    const allowed = sheetCtx({ session: viaRest('u_leader'), status: 'leader_approving', input: { pending_action: 'approve' } });
    await run(SheetTransitionHook)(allowed.ctx);
    expect(allowed.input.status).toBe('approved');
  });

  it('按钮路径不能直改 status(不带流程动作的写入)', async () => {
    const { ctx } = sheetCtx({ session: viaButton('u_hr'), status: 'hr_reviewing', input: { status: 'approved' } });
    expect(await codeOf(() => run(SheetTransitionHook)(ctx))).toBe('KPI_SHEET_DIRECT_STATUS');
  });
});

describe('归档锁 —— 只锁业务字段,不锁平台盖的戳', () => {
  it('按钮路径改业务字段被拒', async () => {
    const { ctx } = sheetCtx({ session: viaButton('u_hr'), status: 'archived', input: { total_score: 99 } });
    expect(await codeOf(() => run(SheetTransitionHook)(ctx))).toBe('KPI_SHEET_ARCHIVED');
  });

  it('只带平台审计戳与流程暂存字段的写入放行(戳不是「改动」)', async () => {
    const { ctx } = sheetCtx({
      session: viaButton('u_hr'),
      status: 'archived',
      input: { pending_action: null, action_reason: null, updated_at: '2026-09-04T00:00:00.000Z', updated_by: 'u_hr' },
    });
    expect(await codeOf(() => run(SheetTransitionHook)(ctx))).toBeNull();
  });

  it('审计戳与业务字段混在一起时,业务字段照拦', async () => {
    const { ctx } = sheetCtx({
      session: viaButton('u_hr'),
      status: 'archived',
      input: { updated_at: '2026-09-04T00:00:00.000Z', updated_by: 'u_hr', remark: '偷改' },
    });
    expect(await codeOf(() => run(SheetTransitionHook)(ctx))).toBe('KPI_SHEET_ARCHIVED');
  });

  it('无发起人的系统写入不受归档锁约束', async () => {
    const { ctx } = sheetCtx({ session: viaSystem(), status: 'archived', input: { total_score: 99 } });
    expect(await codeOf(() => run(SheetTransitionHook)(ctx))).toBeNull();
  });
});

describe('归档 after 阶段 —— 清场写入不能被自己的归档锁拦下', () => {
  /** 归档刚落库的现场:填报单已是 archived,after 阶段即将清场并生成快照。 */
  function archivedCtx() {
    const sheetRow = {
      id: 'sheet1', name: '2026 年第 3 季度考核 · 销售部', plan: 'plan1', subject: 'bu_a',
      status: 'archived', current_step: 4, pending_action: 'archive', action_reason: null,
      total_score: 95, indicator_score: 95, archived_at: '2026-09-04T00:00:00.000Z',
    };
    const store = baseStore({
      kpi_entry_sheet: [sheetRow],
      kpi_entry_line: [{ id: 'l1', sheet: 'sheet1', indicator_name: '签约金额', final_score: 95 }],
      kpi_bonus: [],
      kpi_adjustment: [],
      kpi_review_record: [],
      kpi_snapshot: [],
      kpi_result: [],
    });
    const engine = new FakeEngine(store, [SheetTransitionHook]);
    const ctx = {
      object: 'kpi_entry_sheet',
      event: 'afterUpdate',
      input: { id: 'sheet1', status: 'archived', current_step: 4, pending_action: 'archive', action_reason: null, archived_at: sheetRow.archived_at },
      previous: { id: 'sheet1', name: sheetRow.name, plan: 'plan1', subject: 'bu_a', status: 'approved', current_step: 4 },
      session: viaButton('u_hr'),
      user: { id: 'u_hr' },
      api: new FakeScopedContext({ userId: 'u_hr', isSystem: true, tenantId: 'org1' }, engine),
    } as unknown as HookContext;
    return { ctx, store, engine };
  }

  it('人力审核归档:清场写入通过,审核记录与快照都落库', async () => {
    const { ctx, store } = archivedCtx();
    await run(SheetAfterTransitionHook)(ctx);

    const sheet = store.kpi_entry_sheet![0]!;
    expect(sheet.pending_action).toBeNull();
    expect(sheet.action_reason).toBeNull();

    const reviews = store.kpi_review_record ?? [];
    expect(reviews.map((r) => r.action)).toContain('archive');
    expect(reviews.find((r) => r.action === 'archive')?.to_status).toBe('archived');

    const snapshots = store.kpi_snapshot ?? [];
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.sheet).toBe('sheet1');
    expect(snapshots[0]!.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshots[0]!.archived_by).toBe('u_hr');
  });

  it('清场写入到达 beforeUpdate 时确实是「无发起人的系统写入」', async () => {
    const seen: boolean[] = [];
    const probe: Hook = {
      name: 'probe', label: 'probe', object: 'kpi_entry_sheet', events: ['beforeUpdate'], priority: 90,
      handler: async (c: HookContext) => { seen.push(isSystemWrite(c)); },
    };
    const { ctx, engine } = archivedCtx();
    engine.hooks.push(probe);
    await run(SheetAfterTransitionHook)(ctx);
    expect(seen[0]).toBe(true);
  });
});

describe('分公司核对 —— 按钮路径按发起人校验岗位', () => {
  function checkCtx(session: Session, input: Record<string, any>) {
    const store = baseStore({ kpi_entry_sheet: [{ id: 'sheet1', status: 'branch_checking' }] });
    const { api } = fakeApi(store);
    const ctx = {
      object: 'kpi_check_task',
      event: 'beforeUpdate',
      input: { id: 'task1', ...input },
      previous: { id: 'task1', sheet: 'sheet1', branch: 'bu_b', status: 'pending' },
      session,
      user: session.userId ? { id: session.userId } : undefined,
      api,
    } as unknown as HookContext;
    return ctx;
  }

  it('部门填报人员经动作体点「确认无误」被拒', async () => {
    expect(await codeOf(() => run(CheckTaskDecideHook)(checkCtx(viaButton('u_reporter'), { status: 'confirmed' })))).toBe('KPI_CHECK_POSITION');
  });
  it('分公司核对人员经动作体点「确认无误」放行', async () => {
    expect(await codeOf(() => run(CheckTaskDecideHook)(checkCtx(viaButton('u_checker'), { status: 'confirmed' })))).toBeNull();
  });
  it('无发起用户的系统写入(驳回时重置为待核对)放行', async () => {
    const ctx = {
      object: 'kpi_check_task',
      event: 'beforeUpdate',
      input: { id: 'task1', status: 'pending' },
      previous: { id: 'task1', sheet: 'sheet1', branch: 'bu_b', status: 'confirmed' },
      session: viaSystem(),
      api: fakeApi(baseStore()).api,
    } as unknown as HookContext;
    expect(await codeOf(() => run(CheckTaskDecideHook)(ctx))).toBeNull();
  });
});

describe('加减分 —— 按钮路径按发起人校验岗位分离', () => {
  function bonusCtx(session: Session, input: Record<string, any>, prev: Record<string, any>) {
    const store = baseStore({
      kpi_entry_sheet: [{ id: 'sheet1', status: 'approved', plan: 'plan1' }],
      kpi_bonus: [{ id: 'b1', ...prev }],
    });
    const { api } = fakeApi(store);
    return {
      object: 'kpi_bonus',
      event: 'beforeUpdate',
      input: { id: 'b1', ...input },
      previous: { id: 'b1', ...prev },
      session,
      user: session.userId ? { id: session.userId } : undefined,
      api,
    } as unknown as HookContext;
  }

  it('人力审核经动作体点「批准」被拒(审批归人力负责人)', async () => {
    const ctx = bonusCtx(viaButton('u_hr'), { status: 'approved' }, { sheet: 'sheet1', status: 'draft', bonus_type: 'add', points: 3 });
    expect(await codeOf(() => run(BonusHook)(ctx))).toBe('KPI_BONUS_APPROVE_POSITION');
  });
  it('人力负责人经动作体点「批准」放行并盖审批人', async () => {
    const ctx = bonusCtx(viaButton('u_hrhead'), { status: 'approved' }, { sheet: 'sheet1', status: 'draft', bonus_type: 'add', points: 3 });
    expect(await codeOf(() => run(BonusHook)(ctx))).toBeNull();
    expect((ctx.input as Record<string, any>).approved_by).toBe('u_hrhead');
  });
});
