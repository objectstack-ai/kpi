/**
 * 平台管理员 ↔ 考核系统管理员权限集的绑定(幂等,`kernel:bootstrapped` 后补齐)。
 *
 * ## 为什么需要它
 *
 * 配置类菜单按岗位裁剪走的是 `requiredPermissions` 这条服务端闸门(见 `apps/index.ts`),
 * 而平台对它的判定是**逐条 AND、字符串精确匹配、没有通配**:导航项要求 `kpi_plan_config`,
 * 就只有真正持有这条能力的账号才收得到该菜单项 —— 平台管理员的 `admin_full_access`
 * (manage_metadata / manage_platform_settings / studio.access …)在这里不构成豁免
 * (这条判定的实测记录见 objectstack-ai/objectstack#15135)。
 *
 * 本项目的安排是「考核系统管理员由平台内置管理员账号承担」(CLAUDE.md D4),这条安排此前
 * 是隐含的:没人持有 `kpi_admin_set`,靠平台超级权限绕过对象闸门。菜单闸门不认绕过,于是
 * 这条隐含安排必须写出来 —— 否则管理员登录 KPI 应用会看不到「考核方案」「基础设置」。
 *
 * ## 为什么按「持有 admin_full_access」而不是按邮箱
 *
 * `admin@objectos.ai` 只是开发种子的管理员;正式部署里管理员是谁由客户决定。按能力持有者
 * 匹配,换人、多管理员、改邮箱都不需要改代码。
 *
 * 只增不减:已存在的绑定行原样保留,本函数从不删除任何授权。
 */

/** 平台内置的管理员权限集 —— 持有它的用户即本应用认定的考核系统管理员。 */
const PLATFORM_ADMIN_SET = 'admin_full_access';
const KPI_ADMIN_SET = 'kpi_admin_set';

const SYS = { isSystem: true } as const;

interface BindHostContext {
  ql: {
    find: (object: string, query: unknown, options?: unknown) => Promise<unknown>;
    insert: (object: string, data: Record<string, unknown>, options?: unknown) => Promise<unknown>;
  };
  logger?: { info?: (...a: unknown[]) => void; warn?: (...a: unknown[]) => void };
  hook?: (event: string, handler: () => Promise<void> | void) => void;
}

function toRows<T = Record<string, any>>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const records = (result as { records?: unknown })?.records;
  return Array.isArray(records) ? (records as T[]) : [];
}

async function setIdByName(ctx: BindHostContext, name: string): Promise<string | null> {
  try {
    const rows = toRows(await ctx.ql.find('sys_permission_set', { where: { name }, limit: 1, context: SYS }));
    return rows[0]?.id ? String(rows[0].id) : null;
  } catch (err) {
    ctx.logger?.warn?.('[kpi] admin set lookup failed', { set: name, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export function registerKpiAdminSetBinding(ctx: BindHostContext): void {
  const run = async (): Promise<void> => {
    const platformSetId = await setIdByName(ctx, PLATFORM_ADMIN_SET);
    const kpiSetId = await setIdByName(ctx, KPI_ADMIN_SET);
    if (!platformSetId || !kpiSetId) {
      ctx.logger?.warn?.('[kpi] admin set binding skipped (permission set row missing)', { platformSetId, kpiSetId });
      return;
    }
    let created = 0;
    try {
      const admins = toRows(await ctx.ql.find('sys_user_permission_set', { where: { permission_set_id: platformSetId }, limit: 200, context: SYS }));
      for (const row of admins) {
        const userId = row.user_id ? String(row.user_id) : '';
        if (!userId) continue;
        const existing = toRows(await ctx.ql.find('sys_user_permission_set', { where: { user_id: userId, permission_set_id: kpiSetId }, limit: 1, context: SYS }));
        if (existing.length > 0) continue;
        await ctx.ql.insert('sys_user_permission_set', { user_id: userId, permission_set_id: kpiSetId }, { context: SYS });
        created += 1;
      }
    } catch (err) {
      ctx.logger?.warn?.('[kpi] admin set binding failed', { error: err instanceof Error ? err.message : String(err) });
      return;
    }
    ctx.logger?.info?.('[kpi] platform admins bound to the KPI admin permission set', { created });
  };
  if (typeof ctx.hook === 'function') ctx.hook('kernel:bootstrapped', run);
  else void Promise.resolve().then(run);
}
