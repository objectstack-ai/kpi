import type { Hook, HookContext } from '@objectstack/spec/data';
import { provisionPlanSharing } from './sharing-service.js';
import { sys } from '../hooks/util.js';

/**
 * 补齐「系统上下文写入」被跳过的记录共享物化。
 *
 * 平台的规则钩子对 `ctx.session.isSystem` 的写入**不物化**记录共享
 * (plugin-sharing:`sharing materialisation skipped for isSystem writes; re-evaluate rules
 * or restart to backfill`),官方补偿手段就是重新求值规则。本应用的审核记录与归档快照全部
 * 由 hook 以系统上下文创建,于是这两个对象在 OWD 收成 `private` 之后,不补这一手就会
 * 「谁都看不到」—— 包括本该看到的本部门成员。
 *
 * 这与 `hooks/sheet.hook.ts` 里既有的 `kpi_check_task` / `kpi_result` 补偿是同一条路径,
 * 只是触发点换成了记录自己的 `afterInsert`。**单独成文件、单独注册**(见
 * `objectstack.config.ts`),不并进 `hooks/` 下任何既有文件。
 *
 * 代价控制:审核记录的规则按填报单建,重申时用 `sheets` 选项收窄到本条记录所属的那一张单,
 * 避免「插一条审核记录 → 重申全方案所有填报单的规则」的平方级放大。
 */

/** 失败只记日志,绝不阻断业务动作 —— 数据范围是可补偿的(再次发布 / 下一次动作即补齐)。 */
async function reassert(
  ctx: HookContext,
  planId: string,
  objects: readonly string[],
  sheets?: readonly string[],
): Promise<void> {
  if (!planId) return;
  try {
    await provisionPlanSharing(sys(ctx), planId, { objects, sheets });
  } catch (err) {
    console.error('[kpi] reassert scope sharing failed', {
      plan: planId,
      objects,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function insertedRow(ctx: HookContext): Record<string, any> {
  const result = (ctx.result ?? {}) as Record<string, any>;
  const input = (ctx.input ?? {}) as Record<string, any>;
  return { ...input, ...result };
}

/** 审核记录:按它所属填报单重申审核记录规则。 */
export const ReviewScopeMaterializeHook: Hook = {
  name: 'kpi_review_scope_materialize',
  label: '审核记录数据范围补齐',
  object: 'kpi_review_record',
  events: ['afterInsert'],
  priority: 80,
  handler: async (ctx: HookContext) => {
    const row = insertedRow(ctx);
    const sheetId = row.sheet ? String(row.sheet) : '';
    if (!sheetId) return;
    const api = sys(ctx);
    const sheet = await api.object('kpi_entry_sheet').findOne({ where: { id: sheetId } });
    const planId = sheet?.plan ? String(sheet.plan) : '';
    await reassert(ctx, planId, ['kpi_review_record'], [sheetId]);
  },
};

/** 归档快照:按方案重申快照规则(每张填报单只归档一次,不需要按单收窄)。 */
export const SnapshotScopeMaterializeHook: Hook = {
  name: 'kpi_snapshot_scope_materialize',
  label: '归档快照数据范围补齐',
  object: 'kpi_snapshot',
  events: ['afterInsert'],
  priority: 80,
  handler: async (ctx: HookContext) => {
    const row = insertedRow(ctx);
    await reassert(ctx, row.plan ? String(row.plan) : '', ['kpi_snapshot']);
  },
};

export const scopeMaterializeHooks: Hook[] = [ReviewScopeMaterializeHook, SnapshotScopeMaterializeHook];
