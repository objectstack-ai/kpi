/**
 * 岗位 ↔ 权限集绑定(与平台参考应用同一做法)。权限模型以记录为准(ADR-0090/0094),
 * 绑定只存在于 `sys_position_permission_set` 行;种子加载早于安全引导,不能用种子写,
 * 因此在 `kernel:bootstrapped` 后幂等补齐。
 */
const BINDINGS: ReadonlyArray<readonly [position: string, permissionSet: string]> = [
  ['kpi_admin', 'kpi_admin_set'],
  ['kpi_hr_reviewer', 'kpi_hr_reviewer_set'],
  ['kpi_hr_head', 'kpi_hr_head_set'],
  ['kpi_dept_reporter', 'kpi_dept_reporter_set'],
  ['kpi_branch_checker', 'kpi_branch_checker_set'],
  ['kpi_exec_leader', 'kpi_exec_leader_set'],
];

const SYS = { isSystem: true } as const;

interface BindHostContext {
  ql: {
    find: (object: string, query: unknown, options?: unknown) => Promise<unknown>;
    insert: (object: string, data: Record<string, unknown>, options?: unknown) => Promise<unknown>;
  };
  logger?: { info?: (...a: unknown[]) => void; warn?: (...a: unknown[]) => void };
  hook?: (event: string, handler: () => Promise<void> | void) => void;
}

async function findOneByName(ctx: BindHostContext, object: string, name: string): Promise<{ id?: string } | undefined> {
  try {
    const rows = (await ctx.ql.find(object, { where: { name }, limit: 1, context: SYS })) as Array<{ id?: string }> | { records?: Array<{ id?: string }> };
    if (Array.isArray(rows)) return rows[0];
    return rows?.records?.[0];
  } catch (err) {
    ctx.logger?.warn?.('[kpi] position binding lookup failed', { object, name, error: err instanceof Error ? err.message : String(err) });
    return undefined;
  }
}

export function registerKpiPositionBindings(ctx: BindHostContext): void {
  const run = async (): Promise<void> => {
    let created = 0;
    for (const [positionName, setName] of BINDINGS) {
      const position = await findOneByName(ctx, 'sys_position', positionName);
      const set = await findOneByName(ctx, 'sys_permission_set', setName);
      if (!position?.id || !set?.id) {
        ctx.logger?.warn?.('[kpi] position binding skipped (row missing)', { position: positionName, set: setName });
        continue;
      }
      const existing = (await ctx.ql.find('sys_position_permission_set', { where: { position_id: position.id, permission_set_id: set.id }, limit: 1, context: SYS })) as unknown;
      const hit = Array.isArray(existing) ? existing[0] : (existing as { records?: unknown[] })?.records?.[0];
      if (hit) continue;
      try {
        await ctx.ql.insert('sys_position_permission_set', { id: `ppsb_kpi_${positionName}`, position_id: position.id, permission_set_id: set.id }, { context: SYS });
        created += 1;
      } catch (err) {
        ctx.logger?.warn?.('[kpi] position binding insert failed', { position: positionName, set: setName, error: err instanceof Error ? err.message : String(err) });
      }
    }
    ctx.logger?.info?.('[kpi] position bindings ensured', { created, total: BINDINGS.length });
  };
  if (typeof ctx.hook === 'function') ctx.hook('kernel:bootstrapped', run);
  else void Promise.resolve().then(run);
}
