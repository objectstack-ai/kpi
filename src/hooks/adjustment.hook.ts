import type { Hook, HookContext } from '@objectstack/spec/data';
import { actorId, fail, findById, hasPosition, isSystem, merged, nowIso, recordId, sys, toNumber, writeReview } from './util.js';
import { regenerateResults } from '../services/results-service.js';
import { provisionPlanSharing } from '../services/sharing-service.js';

/** 数据调整申请:插入时记录调整前值;审批时盖章;批准后落地到明细并重算。 */
export const AdjustmentHook: Hook = {
  name: 'kpi_adjustment_rules',
  label: '数据调整规则',
  object: 'kpi_adjustment',
  events: ['beforeInsert', 'beforeUpdate'],
  priority: 100,
  handler: async (ctx: HookContext) => {
    const input = ctx.input as Record<string, any>;
    const prev = (ctx.previous ?? {}) as Record<string, any>;
    const row = merged<Record<string, any>>(ctx);
    const api = sys(ctx);

    const line = await findById(api, 'kpi_entry_line', row.line);
    if (!line) fail('保存调整申请失败:调整的指标明细不存在或已被删除。请刷新后重新选择。', 'KPI_ADJ_LINE');
    if (row.sheet && String(line.sheet) !== String(row.sheet)) {
      fail('保存调整申请失败:所选指标明细不属于该填报单。请重新选择。', 'KPI_ADJ_SHEET_MISMATCH');
    }
    const sheet = await findById(api, 'kpi_entry_sheet', line.sheet);
    if (sheet?.status === 'archived' && !isSystem(ctx)) {
      fail('保存调整申请失败:填报单已归档,数据已锁定不可再改。', 'KPI_ADJ_ARCHIVED');
    }

    if (ctx.event === 'beforeInsert') {
      input.sheet = line.sheet;
      input.plan = sheet?.plan ?? null;
      input.subject = sheet?.subject ?? null;
      input.old_value = row.adjust_type === 'result' ? toNumber(line.final_score) : toNumber(line.actual_value);
      if (!input.requested_by) input.requested_by = actorId(ctx);
      return;
    }

    if (prev.status === 'approved' && !isSystem(ctx)) {
      const touched = Object.keys(input).filter((k) => k !== 'id' && input[k] !== prev[k]);
      if (touched.length) fail('修改调整申请失败:已批准并落地的调整不能再修改。如需再次更正,请新建调整申请。', 'KPI_ADJ_LOCKED');
      return;
    }
    if (!('status' in input) || input.status === prev.status) return;

    if (input.status === 'approved' || input.status === 'rejected') {
      const ok = (await hasPosition(ctx, 'kpi_hr_reviewer')) || (await hasPosition(ctx, 'kpi_hr_head'));
      if (!ok) fail('审批调整申请失败:该操作需要「人力审核」或「人力负责人」岗位。如需处理,请联系管理员分配岗位。', 'KPI_ADJ_POSITION');
      input.decided_by = actorId(ctx);
      input.decided_at = nowIso();
    }
    if (input.status === 'approved') {
      const newValue = toNumber(row.new_value);
      if (newValue === null) fail('批准调整申请失败:调整后值不能为空。请填写调整后值。', 'KPI_ADJ_VALUE');
      const id = recordId(ctx);
      const patch: Record<string, unknown> = { last_adjustment: id };
      if (row.adjust_type === 'result') patch.adjusted_score = newValue;
      else patch.actual_value = newValue;
      await api.object('kpi_entry_line').updateById(String(line.id), patch);
      input.applied_at = nowIso();
      await writeReview(api, {
        sheet: String(line.sheet),
        action: 'adjust',
        step_label: row.adjust_type === 'result' ? '结果调整' : '源数据调整',
        from_status: sheet?.status ?? null,
        to_status: sheet?.status ?? null,
        actor: actorId(ctx),
        reason: `「${line.indicator_name ?? line.id}」${row.adjust_type === 'result' ? '得分' : '实际值'} ${row.old_value ?? '空'} → ${newValue};原因:${row.reason ?? ''}`,
      });
      if (sheet && (sheet.status === 'approved')) {
        // 重算与共享重声明都不阻断审批:审批本身已经成立,两者都可在下次通过 / 调整 / 归档
        // 时补上。这与 SheetAfterTransitionHook、BonusAfterDecideHook 的处置保持一致。
        try {
          await regenerateResults(api, String(sheet.plan));
          await provisionPlanSharing(api, String(sheet.plan), { objects: ['kpi_result'] });
        } catch (err) {
          console.error('[kpi] regenerate results / reassert sharing after adjustment failed', { sheet: sheet.id, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }
  },
};
