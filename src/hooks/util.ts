import type { HookContext } from '@objectstack/spec/data';

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
 * session.positions 只作描述、不作授权输入)。系统上下文放行;`kpi_admin` 通行。
 */
export async function hasPosition(ctx: HookContext, position: string | null): Promise<boolean> {
  if (isSystem(ctx) || !position) return true;
  const uid = actorId(ctx);
  if (!uid) return false;
  const rows = await sys(ctx).object('sys_user_position').find({ where: { user_id: uid } });
  const held = new Set((rows ?? []).map((r: Record<string, unknown>) => String(r.position)));
  return held.has(position) || held.has('kpi_admin');
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
    from_status: data.from_status ?? null,
    to_status: data.to_status ?? null,
    actor: data.actor ?? null,
    reason: data.reason ?? null,
    acted_at: nowIso(),
  });
}
