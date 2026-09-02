import type { Hook, HookContext } from '@objectstack/spec/data';
import { fail, isSystem } from './util.js';

/** 归档快照不可变:任何非系统的改删一律拒绝(蓝图 C-5)。 */
export const SnapshotImmutableHook: Hook = {
  name: 'kpi_snapshot_immutable',
  label: '归档快照不可变',
  object: 'kpi_snapshot',
  events: ['beforeInsert', 'beforeUpdate', 'beforeDelete'],
  priority: 10,
  handler: async (ctx: HookContext) => {
    if (isSystem(ctx)) return;
    fail('操作失败:归档快照由系统在归档时生成,不能手工新建、修改或删除。', 'KPI_SNAPSHOT_IMMUTABLE');
  },
};

/** 审核记录只增不改。 */
export const ReviewRecordImmutableHook: Hook = {
  name: 'kpi_review_record_immutable',
  label: '审核记录只增不改',
  object: 'kpi_review_record',
  events: ['beforeUpdate', 'beforeDelete'],
  priority: 10,
  handler: async (ctx: HookContext) => {
    if (isSystem(ctx)) return;
    fail('操作失败:审核记录是流程留痕,不能修改或删除。', 'KPI_REVIEW_IMMUTABLE');
  },
};

/** 考核结果由系统汇总生成。 */
export const ResultSystemOnlyHook: Hook = {
  name: 'kpi_result_system_only',
  label: '考核结果系统生成',
  object: 'kpi_result',
  events: ['beforeInsert', 'beforeUpdate', 'beforeDelete'],
  priority: 10,
  handler: async (ctx: HookContext) => {
    if (isSystem(ctx)) return;
    fail('操作失败:考核结果由系统在填报单审批通过后自动汇总,不能手工新建、修改或删除。', 'KPI_RESULT_SYSTEM_ONLY');
  },
};
