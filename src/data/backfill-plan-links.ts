/**
 * 历史行的方案回填 —— 一次性、幂等的升级补齐。
 *
 * `kpi_check_task` 与 `kpi_adjustment` 都冗余存了一份 `plan`:数据范围按「方案 × 单元」
 * 授权,而共享规则的条件只能比较本对象自己的列,顺不着填报单跳一层(见两个对象上 `plan`
 * 字段的注释)。这两处的写入是后加的 —— 升级之前建的行 `plan` 为空,于是它们**落不进**
 * 任何按方案建的规则条件里:规则、权限集、记录都看着正常,就是这些历史行谁也看不到。
 *
 * 这里在应用启动时把它们补齐(挂点与 `align-demo-units.ts` 相同)。三重收窄,任一不满足
 * 就不动那一行:
 *   ① 只写 `plan` 一个字段,不碰行上任何其它列;
 *   ② 只动 `plan` 为空的行 —— 已有方案的行绝不改写;
 *   ③ 方案取自该行自己的填报单;填报单缺失或它自己也没有方案的行,计入 `unresolved` 跳过。
 *
 * 与演示夹具对齐不同,**这里没有环境闸门**:它修的是真实升级留下的数据缺口,生产环境同样要跑。
 * 幂等:补过一次之后再启动,查出来的待补行为空,零写入。
 */

const SYS = { isSystem: true } as const;

export interface BackfillHostContext {
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

/** 带方案冗余列、需要回填的对象。两者的方案都取自 `sheet` 指向的填报单。 */
export const BACKFILL_OBJECTS: ReadonlyArray<{ object: string; label: string }> = [
  { object: 'kpi_check_task', label: '核对任务' },
  { object: 'kpi_adjustment', label: '数据调整' },
];

/** 一次扫描最多取多少行。 */
const BATCH = 500;

/** 分批的轮次上限 —— 兜底,防止任何意料之外的查询行为把启动卡住。 */
const MAX_ROUNDS = 200;

export interface BackfillObjectOutcome {
  object: string;
  /** 成功写入 `plan` 的行数。 */
  filled: number;
  /** `plan` 为空但推导不出方案(填报单缺失 / 填报单自己也没有方案)而跳过的行数。 */
  unresolved: number;
  /** 写入被拒(例如被不可变 hook 挡下)而跳过的行数。 */
  failed: number;
}

export interface BackfillOutcome {
  filled: number;
  unresolved: number;
  failed: number;
  byObject: BackfillObjectOutcome[];
}

/** 空值判定:`plan` 为 null / undefined / 空串都算「没填」。 */
function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

async function planOfSheets(ctx: BackfillHostContext, sheetIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (sheetIds.length === 0) return map;
  const sheets = rowsOf(await ctx.ql.find('kpi_entry_sheet', {
    where: { id: { $in: sheetIds } },
    fields: ['id', 'plan'],
    limit: sheetIds.length,
    context: SYS,
  }));
  for (const sheet of sheets) {
    if (!isBlank(sheet.plan)) map.set(String(sheet.id), String(sheet.plan));
  }
  return map;
}

/**
 * 分批处理。平台的查询选项里没有可依赖的偏移量,所以这里不翻页,而是**重取同一个条件**:
 * 写成功的行会从「plan 为空」的结果集里消失,于是下一批自然是新行。用 `seen` 去重,一轮
 * 没有取到任何新 id 就说明剩下的都是写不动的(推不出方案 / 被 hook 拒绝),就地收工 ——
 * 这同时也是「不会无限重取同一批」的保证。
 */
async function backfillObject(ctx: BackfillHostContext, object: string): Promise<BackfillObjectOutcome> {
  const outcome: BackfillObjectOutcome = { object, filled: 0, unresolved: 0, failed: 0 };
  const seen = new Set<string>();
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    let batch: Array<Record<string, any>>;
    try {
      batch = rowsOf(await ctx.ql.find(object, {
        where: { plan: null },
        fields: ['id', 'sheet', 'plan'],
        limit: BATCH,
        context: SYS,
      }));
    } catch (err) {
      ctx.logger?.warn?.('[kpi] plan backfill: lookup failed', { object, error: err instanceof Error ? err.message : String(err) });
      return outcome;
    }
    const fresh = batch.filter((r) => !seen.has(String(r.id)));
    if (fresh.length === 0) return outcome;
    for (const r of fresh) seen.add(String(r.id));

    // 二次收窄:即使查询没能过滤掉,也只动 plan 确实为空、且有填报单的行。
    const targets = fresh.filter((r) => isBlank(r.plan) && !isBlank(r.sheet));
    outcome.unresolved += fresh.length - targets.length;
    const plans = await planOfSheets(ctx, [...new Set(targets.map((r) => String(r.sheet)))]);

    for (const row of targets) {
      const plan = plans.get(String(row.sheet));
      if (!plan) {
        outcome.unresolved += 1;
        continue;
      }
      try {
        await ctx.ql.update(object, { plan }, { where: { id: String(row.id) }, context: SYS });
        outcome.filled += 1;
      } catch (err) {
        // 某类行被不可变 hook 拒绝写(例如已归档):跳过并计数,绝不绕过 hook 直写。
        outcome.failed += 1;
        ctx.logger?.warn?.('[kpi] plan backfill: row skipped, write refused', { object, record: row.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (batch.length < BATCH) return outcome;
  }
  ctx.logger?.warn?.('[kpi] plan backfill: round budget exhausted, remaining rows left for the next start', { object, rounds: MAX_ROUNDS });
  return outcome;
}

export async function backfillPlanLinks(ctx: BackfillHostContext): Promise<BackfillOutcome> {
  const byObject: BackfillObjectOutcome[] = [];
  for (const { object } of BACKFILL_OBJECTS) byObject.push(await backfillObject(ctx, object));
  return {
    filled: byObject.reduce((n, o) => n + o.filled, 0),
    unresolved: byObject.reduce((n, o) => n + o.unresolved, 0),
    failed: byObject.reduce((n, o) => n + o.failed, 0),
    byObject,
  };
}

/**
 * 在安全引导完成后跑一次(与演示夹具对齐、岗位↔权限集绑定同一时机)。
 *
 * 无事可做时**不记日志**:这是每次启动都会跑的一步,补齐之后恒为零,恒定的一行零值只会
 * 让真正有回填发生的那次启动淹没在噪音里。
 */
export function registerPlanLinkBackfill(ctx: BackfillHostContext): void {
  const run = async (): Promise<void> => {
    const outcome = await backfillPlanLinks(ctx);
    if (outcome.filled === 0 && outcome.unresolved === 0 && outcome.failed === 0) return;
    ctx.logger?.info?.('[kpi] 历史行方案回填完成', {
      filled: outcome.filled,
      unresolved: outcome.unresolved,
      failed: outcome.failed,
      byObject: outcome.byObject,
    });
  };
  if (typeof ctx.hook === 'function') ctx.hook('kernel:bootstrapped', run);
  else void Promise.resolve().then(run);
}
