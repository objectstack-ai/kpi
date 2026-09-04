import { describe, expect, it } from 'vitest';
import type { Hook, HookContext } from '@objectstack/spec/data';
import { SheetTransitionHook } from '../src/hooks/sheet.hook.js';
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

function matches(row: Record<string, any>, where: Record<string, any> | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && '$in' in v) return (v.$in as unknown[]).map(String).includes(String(row[k]));
    if (v === null) return row[k] === null || row[k] === undefined;
    return String(row[k]) === String(v);
  });
}

/** 最小 ctx.api 替身:只实现 hook 真正会用到的读写。没有 sudo,所以 sys()/sysNoActor() 退化为它自己。 */
function fakeApi(store: StoreShape) {
  const writes: Array<{ object: string; id: string; data: Record<string, any> }> = [];
  const api = {
    object(name: string) {
      const rows = () => store[name] ?? [];
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
          const row = { id: `new_${(store[name] ?? []).length + 1}`, ...data };
          (store[name] ??= []).push(row);
          return row;
        },
        async update(data: Record<string, any>) {
          return data;
        },
        async updateById(id: string, data: Record<string, any>) {
          writes.push({ object: name, id, data });
          const row = rows().find((r) => String(r.id) === String(id));
          if (row) Object.assign(row, data);
          return row;
        },
        async delete() {
          return null;
        },
      };
    },
  };
  return { api, writes };
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

  it('已归档的填报单:按钮路径改业务字段被拒,after 阶段清空流程暂存字段放行', async () => {
    const locked = sheetCtx({ session: viaButton('u_hr'), status: 'archived', input: { total_score: 99 } });
    expect(await codeOf(() => run(SheetTransitionHook)(locked.ctx))).toBe('KPI_SHEET_ARCHIVED');
    const scratch = sheetCtx({ session: viaSystem(), status: 'archived', input: { pending_action: null, action_reason: null } });
    expect(await codeOf(() => run(SheetTransitionHook)(scratch.ctx))).toBeNull();
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
