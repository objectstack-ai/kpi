import { DEMO_UNIT_IDS } from './index.js';

/**
 * 演示夹具的租户对齐 —— **临时**,随 objectstack-ai/objectstack#14547 的平台修复一起删除。
 *
 * ⚠️ 这不是发布 / 共享逻辑的一部分,不改 `services/sharing-service.ts` 的任何语义。
 * 它修的是**本应用自己的演示夹具**:种子写入的 `sys_business_unit` 行 `organization_id` 为空,
 * 而管理员在 Setup 里建的单元会被引擎盖上当前组织。共享规则的收件方展开对这一列做**等值**
 * 比较(平台自己的租户过滤是「本组织或为空」),于是只有种子单元展开不出人 —— 演示环境
 * 的数据范围整片消失,真实客户组织不受影响。这里把种子单元补成「管理员建的那样」,让演示
 * 环境与产品路径一致。
 *
 * 平台修复(orgScope 改用平台自己的空值宽松租户过滤)落地后:删除本文件、删除
 * `objectstack.config.ts` 里的调用、删除 README 演示种子一节里的对应说明。
 *
 * 三重收窄,任一不满足就不动:
 *   ① 只在 dev / test 运行(`NODE_ENV === 'production'` 一律跳过);
 *   ② 只认本应用种子写入的那几个 id(`DEMO_UNIT_IDS`),管理员 / API 建的单元 id 不在其中;
 *   ③ 只补 `organization_id` 为空的行 —— 已归属某个组织的行绝不改写。
 */

const SYS = { isSystem: true } as const;

export interface AlignHostContext {
  ql: {
    find: (object: string, query: unknown, options?: unknown) => Promise<unknown>;
    update: (object: string, data: Record<string, unknown>, options?: unknown) => Promise<unknown>;
  };
  logger?: { info?: (...a: unknown[]) => void; warn?: (...a: unknown[]) => void };
  hook?: (event: string, handler: () => Promise<void> | void) => void;
}

function rowsOf(result: unknown): Array<Record<string, any>> {
  if (Array.isArray(result)) return result as Array<Record<string, any>>;
  const records = (result as { records?: unknown })?.records;
  return Array.isArray(records) ? (records as Array<Record<string, any>>) : [];
}

/** 生产环境一律不跑;其余环境(dev / test)才是演示夹具的用武之地。 */
export function isDemoEnvironment(nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  return String(nodeEnv ?? '').toLowerCase() !== 'production';
}

/**
 * 唯一一个组织时返回它;零个(还没引导完)或多个(多租户,谁是「当前」无从判断)都返回 null,
 * 由调用方跳过 —— 猜一个组织去盖章比不盖章危险得多。
 */
export async function resolveSingleOrganization(ctx: AlignHostContext): Promise<string | null> {
  try {
    const orgs = rowsOf(await ctx.ql.find('sys_organization', { limit: 2, context: SYS }));
    if (orgs.length !== 1) return null;
    const id = orgs[0]?.id;
    return id ? String(id) : null;
  } catch (err) {
    ctx.logger?.warn?.('[kpi] demo unit alignment: organization lookup failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export interface AlignOutcome {
  aligned: string[];
  skipped: 'not_demo_env' | 'no_single_organization' | 'nothing_to_align' | null;
}

/** 幂等:补过一次之后再跑,查出来的待补行为空,什么都不写。 */
export async function alignDemoUnits(ctx: AlignHostContext): Promise<AlignOutcome> {
  if (!isDemoEnvironment()) return { aligned: [], skipped: 'not_demo_env' };
  const organizationId = await resolveSingleOrganization(ctx);
  if (!organizationId) return { aligned: [], skipped: 'no_single_organization' };

  let pending: Array<Record<string, any>> = [];
  try {
    pending = rowsOf(await ctx.ql.find('sys_business_unit', {
      where: { id: { $in: [...DEMO_UNIT_IDS] }, organization_id: null },
      fields: ['id', 'name', 'organization_id'],
      limit: 200,
      context: SYS,
    }));
  } catch (err) {
    ctx.logger?.warn?.('[kpi] demo unit alignment: lookup failed', { error: err instanceof Error ? err.message : String(err) });
    return { aligned: [], skipped: 'nothing_to_align' };
  }
  // 二次收窄:即使查询没能过滤掉,也只动 id 在清单里、组织为空的行。
  const targets = pending.filter((u) => DEMO_UNIT_IDS.includes(String(u.id)) && (u.organization_id ?? null) === null);
  if (targets.length === 0) return { aligned: [], skipped: 'nothing_to_align' };

  const aligned: string[] = [];
  for (const unit of targets) {
    try {
      await ctx.ql.update('sys_business_unit', { organization_id: organizationId }, { where: { id: String(unit.id) }, context: SYS });
      aligned.push(String(unit.id));
    } catch (err) {
      ctx.logger?.warn?.('[kpi] demo unit alignment: update failed', { unit: unit.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  ctx.logger?.info?.('[kpi] demo unit tenancy aligned (fixture only — remove with objectstack#14547)', { organization: organizationId, units: aligned });
  return { aligned, skipped: null };
}

/** 在安全引导完成后补齐(与岗位↔权限集绑定同一时机)。 */
export function registerDemoUnitAlignment(ctx: AlignHostContext): void {
  const run = async (): Promise<void> => {
    const outcome = await alignDemoUnits(ctx);
    if (outcome.skipped && outcome.skipped !== 'nothing_to_align') {
      ctx.logger?.info?.('[kpi] demo unit tenancy alignment skipped', { reason: outcome.skipped });
    }
  };
  if (typeof ctx.hook === 'function') ctx.hook('kernel:bootstrapped', run);
  else void Promise.resolve().then(run);
}
