import type { HookContext } from '@objectstack/spec/data';
import { statusLabel } from '../lib/workflow.js';

/** 平台 IScopedContext 的运行时实现带 `sudo()`(系统上下文:可写只读字段、绕过数据范围)。 */
export interface Repo {
  find(query?: Record<string, unknown>): Promise<any[]>;
  findOne(query?: Record<string, unknown>): Promise<any>;
  count(query?: Record<string, unknown>): Promise<number>;
  insert(data: Record<string, unknown>): Promise<any>;
  update(data: Record<string, unknown>, options?: Record<string, unknown>): Promise<any>;
  updateById(id: string, data: Record<string, unknown>): Promise<any>;
  delete(options?: Record<string, unknown>): Promise<any>;
}
export interface Api {
  object(name: string): Repo;
}

export class KpiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = 'KPI_RULE') {
    super(message);
    this.name = 'KpiError';
    this.code = code;
    this.status = 422;
  }
}

export function fail(message: string, code = 'KPI_RULE'): never {
  throw new KpiError(message, code);
}

/** 以系统上下文访问其他对象(hook 内部回写只读字段、跨主体读取)。 */
export function sys(ctx: HookContext): Api {
  const api = ctx.api as unknown as (Api & { sudo?: () => Api }) | undefined;
  if (!api) fail('系统内部错误:数据访问上下文不可用,请稍后重试或联系管理员。', 'KPI_NO_API');
  return api.sudo ? api.sudo() : api;
}

/**
 * 无发起人的系统上下文:在 `sudo()` 的基础上摘掉发起用户,租户与事务信息原样保留。
 *
 * 给 hook **内部**自发的写入用(核对全部完成后自动推进填报单、驳回时重置核对任务)。
 * 这类写入不是任何人「点」出来的,按发起人校验岗位既没有对象也没有意义 —— 摘掉发起人
 * 让它落在 {@link isSystemWrite} 这一侧,规则明确免检,而不是靠「恰好这个人有那个岗位」
 * 蒙混过关(节点审核岗位是按方案配置的,见《设计方案》10.1 第 9 条)。
 */
export function sysNoActor(ctx: HookContext): Api {
  const api = ctx.api as unknown as (Api & { sudo?: () => Api }) | undefined;
  if (!api) fail('系统内部错误:数据访问上下文不可用,请稍后重试或联系管理员。', 'KPI_NO_API');
  if (!api.sudo) return api;
  const elevated = api.sudo() as Api & { executionContext?: Record<string, unknown> };
  if (elevated && typeof elevated === 'object' && elevated.executionContext) {
    elevated.executionContext = { ...elevated.executionContext, isSystem: true, userId: undefined };
  }
  return elevated;
}

/** 以当前用户上下文访问(受数据范围约束)。 */
export function user(ctx: HookContext): Api {
  const api = ctx.api as unknown as Api | undefined;
  if (!api) fail('系统内部错误:数据访问上下文不可用,请稍后重试或联系管理员。', 'KPI_NO_API');
  return api;
}

export function isSystem(ctx: HookContext): boolean {
  return ctx.session?.isSystem === true;
}

export function actorId(ctx: HookContext): string | null {
  return (ctx.user?.id as string | undefined) ?? (ctx.session?.userId as string | undefined) ?? null;
}

/**
 * 是否是**纯系统写入** —— 带系统标记**并且**没有发起用户。
 *
 * 为什么不能只看 `isSystem`:平台执行动作体(按钮)时用的上下文是
 * `{ ...调用者上下文, isSystem: true }`,发起人的 `userId` 原样保留。也就是说
 * 「用户点了按钮」和「系统自己写」在 `isSystem` 这一位上完全一样,只用它做闸,
 * 任何岗位的人点按钮都会被当成系统写入放行(objectstack-ai/objectstack#2849)。
 * 真正的系统写入 —— 种子、脚本、hook 内部自动推进 —— 是**没有发起人**的,
 * 这一位才把两者分得开。
 */
export function isSystemWrite(ctx: HookContext): boolean {
  return isSystem(ctx) && actorId(ctx) === null;
}

/** 当前记录的合并视图(更新时 = 旧记录 + 本次改动)。 */
export function merged<T = Record<string, any>>(ctx: HookContext): T {
  return { ...((ctx.previous ?? {}) as Record<string, unknown>), ...((ctx.input ?? {}) as Record<string, unknown>) } as T;
}

export function recordId(ctx: HookContext): string | null {
  const input = ctx.input as Record<string, unknown> | undefined;
  return (input?.id as string | undefined) ?? ((ctx.previous as Record<string, unknown> | undefined)?.id as string | undefined) ?? null;
}

/**
 * 是否持有岗位(业务规则,经 ctx.api 通道查询 sys_user_position;平台明示
 * session.positions 只作描述、不作授权输入)。`kpi_admin` 通行。
 *
 * 免检只留给**纯系统写入**({@link isSystemWrite}:有系统标记且没有发起人)。
 * 带发起人的写入一律按发起人校验 —— 无论它是从 REST 直接进来的,还是经按钮的
 * 动作体以「受信任」身份进来的,两条路径同一口径。
 */
export async function hasPosition(ctx: HookContext, position: string | null): Promise<boolean> {
  if (!position || isSystemWrite(ctx)) return true;
  const uid = actorId(ctx);
  if (!uid) return false;
  const api = sys(ctx);
  const rows = await api.object('sys_user_position').find({ where: { user_id: uid } });
  const held = new Set((rows ?? []).map((r: Record<string, unknown>) => String(r.position)));
  if (held.has(position) || held.has('kpi_admin')) return true;
  // 组织 owner / admin(sys_member.role)等同考核系统管理员
  const memberships = await api.object('sys_member').find({ where: { user_id: uid } });
  return (memberships ?? []).some((m: Record<string, unknown>) => m.role === 'owner' || m.role === 'admin');
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function changed(ctx: HookContext, field: string): boolean {
  const input = (ctx.input ?? {}) as Record<string, unknown>;
  if (!(field in input)) return false;
  const prev = (ctx.previous ?? {}) as Record<string, unknown>;
  return input[field] !== prev[field];
}

export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function findById(api: Api, object: string, id: string | null | undefined): Promise<Record<string, any> | null> {
  if (!id) return null;
  const row = await api.object(object).findOne({ where: { id } });
  return row ?? null;
}

export async function nameOf(api: Api, object: string, id: string | null | undefined, fallback = ''): Promise<string> {
  const row = await findById(api, object, id);
  return (row?.name as string | undefined) ?? fallback;
}

/**
 * 写一条审核记录 —— 全系统留痕的唯一入口(流程推进、核对、调整落地、方案发布都经这里)。
 *
 * 原状态 / 新状态按 {@link statusLabel} 写中文:这两个字段是文本字段、列表直出,写内部值
 * 就是把 `draft` / `branch_checking` 摆给用户看。转换放在这一处,四个调用点一次覆盖。
 */
export async function writeReview(
  api: Api,
  data: {
    sheet: string;
    action: 'generate' | 'submit' | 'confirm' | 'dispute' | 'approve' | 'reject' | 'archive' | 'adjust';
    step_label?: string | null;
    from_status?: string | null;
    to_status?: string | null;
    actor?: string | null;
    reason?: string | null;
  },
): Promise<void> {
  await api.object('kpi_review_record').insert({
    sheet: data.sheet,
    action: data.action,
    step_label: data.step_label ?? null,
    from_status: statusLabel(data.from_status),
    to_status: statusLabel(data.to_status),
    actor: data.actor ?? null,
    reason: data.reason ?? null,
    acted_at: nowIso(),
  });
}
