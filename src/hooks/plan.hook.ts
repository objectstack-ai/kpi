import type { Hook, HookContext } from '@objectstack/spec/data';
import { actorId, fail, findById, isSystem, merged, nameOf, nowIso, recordId, sys, toNumber, writeReview } from './util.js';
import { validateSteps, type PlanStepDef } from '../lib/workflow.js';
import { provisionPlanSharing } from '../services/sharing-service.js';
import { loadPlanSteps } from './sheet.hook.js';

const FROZEN_MESSAGE = '修改失败:方案已发布,配置已冻结。如需调整指标、权重、目标或流程,请新建方案版本。';

/**
 * 同一考核周期只有一个生效版本(《设计方案》V1.0 第 5.2 节、第 10 章第 10 项)。
 *
 * 「同一周期」= `period_type` + `year` + `period_no` 三者相同;「生效版本」只指状态为
 * **已发布**的方案 —— 已关闭 / 已归档的是历史版本,不阻断新版本发布,草稿本来就还没生效
 * (草稿与已发布并存正是第 10 项确认的口径)。
 */
export const PLAN_PERIOD_CONFLICT_CODE = 'KPI_PLAN_PERIOD_CONFLICT';

export interface PlanPeriodKey {
  id?: string | null;
  period_type?: unknown;
  year?: unknown;
  period_no?: unknown;
  name?: unknown;
  status?: unknown;
}

/** 两条方案是否落在同一个考核周期(期数按数值比较,避免 "1" 与 1 判成不同周期)。 */
export function samePeriod(a: PlanPeriodKey, b: PlanPeriodKey): boolean {
  return (
    String(a.period_type ?? '') === String(b.period_type ?? '') &&
    toNumber(a.year) === toNumber(b.year) &&
    toNumber(a.period_no) === toNumber(b.period_no)
  );
}

/**
 * 在候选方案里找出挡住本次发布的生效版本 —— 纯函数,唯一性口径的唯一真值(单元测试点)。
 * 候选由调用方按「已发布」筛出;这里再判一次状态,保证口径不依赖调用方的查询条件。
 */
export function findPublishedConflict(candidates: PlanPeriodKey[], self: PlanPeriodKey): PlanPeriodKey | null {
  for (const c of candidates ?? []) {
    if (String(c.status ?? '') !== 'published') continue;
    if (self.id && String(c.id ?? '') === String(self.id)) continue;
    if (samePeriod(c, self)) return c;
  }
  return null;
}

export function planPeriodConflictMessage(name: string): string {
  return `发布失败:该考核周期已有生效版本「${name}」。请先关闭该版本,或改用复制出的新版本替换。`;
}

async function assertPlanEditable(ctx: HookContext, planId: string | null | undefined): Promise<void> {
  if (isSystem(ctx) || !planId) return;
  const plan = await findById(sys(ctx), 'kpi_plan', planId);
  if (plan && plan.status !== 'draft') fail(FROZEN_MESSAGE, 'KPI_PLAN_FROZEN');
}

/** 方案子配置(节点 / 主体 / 下达 / 分工)在方案发布后冻结。 */
export const PlanChildFreezeHook: Hook = {
  name: 'kpi_plan_child_freeze',
  label: '方案配置冻结',
  object: ['kpi_plan_step', 'kpi_plan_subject', 'kpi_plan_indicator', 'kpi_staff_assignment'],
  events: ['beforeInsert', 'beforeUpdate', 'beforeDelete'],
  priority: 90,
  handler: async (ctx: HookContext) => {
    const row = merged<Record<string, any>>(ctx);
    await assertPlanEditable(ctx, row.plan);
  },
};

export const PersonalItemFreezeHook: Hook = {
  name: 'kpi_personal_item_freeze',
  label: '个人承接项冻结',
  object: 'kpi_personal_item',
  events: ['beforeInsert', 'beforeUpdate', 'beforeDelete'],
  priority: 90,
  handler: async (ctx: HookContext) => {
    if (isSystem(ctx)) return;
    const row = merged<Record<string, any>>(ctx);
    const assignment = await findById(sys(ctx), 'kpi_staff_assignment', row.assignment);
    await assertPlanEditable(ctx, assignment?.plan);
  },
};

/** 自动填充子配置的显示名称(主体名、「指标 · 主体」、「员工 · 板块」)。 */
export const PlanChildNameHook: Hook = {
  name: 'kpi_plan_child_name',
  label: '方案配置名称填充',
  object: ['kpi_plan_subject', 'kpi_plan_indicator', 'kpi_staff_assignment', 'kpi_personal_item'],
  events: ['beforeInsert', 'beforeUpdate'],
  priority: 100,
  handler: async (ctx: HookContext) => {
    const api = sys(ctx);
    const input = ctx.input as Record<string, any>;
    const row = merged<Record<string, any>>(ctx);
    switch (ctx.object) {
      case 'kpi_plan_subject': {
        input.name = await nameOf(api, 'sys_business_unit', row.subject, String(row.subject ?? ''));
        break;
      }
      case 'kpi_plan_indicator': {
        const ind = await nameOf(api, 'kpi_indicator', row.indicator, '');
        const bu = await nameOf(api, 'sys_business_unit', row.subject, '');
        input.name = `${ind} · ${bu}`;
        if (ctx.event === 'beforeInsert' && !row.dispute_status) input.dispute_status = 'none';
        break;
      }
      case 'kpi_staff_assignment': {
        const u = await findById(api, 'sys_user', row.employee);
        const bu = await nameOf(api, 'sys_business_unit', row.unit, '');
        input.name = `${u?.name ?? u?.email ?? row.employee ?? ''} · ${bu}`;
        break;
      }
      case 'kpi_personal_item': {
        const a = await findById(api, 'kpi_staff_assignment', row.assignment);
        const pi = await findById(api, 'kpi_plan_indicator', row.plan_indicator);
        input.name = `${a?.name ?? ''} · ${pi?.name ?? ''}`;
        break;
      }
      default:
        break;
    }
  },
};

/**
 * 方案发布(蓝图 B-M3-07,C-3):草稿 → 已发布时做完整性检查,通过后冻结并为每个
 * 参与主体生成填报单与明细;不通过则整笔拒绝并逐条列出问题。
 * 方案状态由「发布」按钮直接写 status(状态机校验保证只能 draft → published)。
 */
export const PlanPublishHook: Hook = {
  name: 'kpi_plan_publish',
  label: '方案发布',
  object: 'kpi_plan',
  events: ['beforeUpdate'],
  priority: 100,
  handler: async (ctx: HookContext) => {
    const input = ctx.input as Record<string, any>;
    const prev = (ctx.previous ?? {}) as Record<string, any>;
    const id = recordId(ctx);
    if (!id) return;
    const api = sys(ctx);

    if (!('status' in input) || input.status === prev.status) {
      // 已发布方案的基本信息冻结(说明与关闭/归档动作除外)
      if (prev.status !== 'draft' && !isSystem(ctx)) {
        const allowed = new Set(['id', 'description', 'status']);
        const touched = Object.keys(input).filter((k) => !allowed.has(k) && input[k] !== prev[k]);
        if (touched.length) fail(FROZEN_MESSAGE, 'KPI_PLAN_FROZEN');
      }
      return;
    }
    // 已发布 → 已关闭 / 已归档:方案结束后留读、去写(填报单 / 核对任务 / 调整由 edit 降为
    // read,结果本就只读)。副作用挂在 after 阶段的 PlanFreezeSharingHook 上,避免主写入被
    // 平台校验拒绝时留下半截改动。
    if (!(prev.status === 'draft' && input.status === 'published')) return;

    // 同周期唯一生效版本:先于完整性检查判定 —— 这一条与方案内部配置无关,先说清楚
    // 「这个周期已经有生效版本了」比让作者先去补权重更省事。
    const period = merged<Record<string, any>>(ctx);
    const published = await api.object('kpi_plan').find({ where: { status: 'published' } });
    const conflict = findPublishedConflict(published as PlanPeriodKey[], { ...period, id });
    if (conflict) fail(planPeriodConflictMessage(String(conflict.name ?? '')), PLAN_PERIOD_CONFLICT_CODE);

    const problems: string[] = [];
    const steps = await loadPlanSteps(api, id);
    problems.push(...validateSteps(steps).map((m) => `流程节点:${m}`));

    const subjects = await api.object('kpi_plan_subject').find({ where: { plan: id } });
    if (subjects.length === 0) problems.push('参与主体:至少需要一个考核主体');
    const indicators = await api.object('kpi_plan_indicator').find({ where: { plan: id } });
    const bySubject = new Map<string, Record<string, any>[]>();
    for (const pi of indicators) {
      const key = String(pi.subject);
      bySubject.set(key, [...(bySubject.get(key) ?? []), pi]);
    }
    for (const s of subjects) {
      const rows = bySubject.get(String(s.subject)) ?? [];
      const label = s.name || String(s.subject);
      if (rows.length === 0) {
        problems.push(`指标下达:主体「${label}」没有下达任何指标`);
        continue;
      }
      const total = rows.reduce((sum, r) => sum + (toNumber(r.weight) ?? 0), 0);
      if (Math.abs(total - 100) > 0.01) problems.push(`指标下达:主体「${label}」的权重合计为 ${Math.round(total * 100) / 100}%,必须等于 100%`);
      for (const r of rows) {
        if (toNumber(r.target_value) === null) {
          const ind = await findById(api, 'kpi_indicator', r.indicator);
          if (ind?.scoring_method !== 'formula') problems.push(`指标下达:「${r.name || ind?.name || r.indicator}」未设置目标值`);
        }
      }
    }
    const subjectIds = new Set(subjects.map((s: Record<string, any>) => String(s.subject)));
    for (const key of bySubject.keys()) {
      if (!subjectIds.has(key)) problems.push(`指标下达:存在下达给未参与主体(${key})的指标,请先把该主体加入参与主体或删除下达`);
    }
    const openDisputes = indicators.filter((pi: Record<string, any>) => pi.dispute_status === 'open').length;
    if (openDisputes > 0) problems.push(`指标争议:还有 ${openDisputes} 项指标争议未关闭`);

    if (problems.length) {
      fail(`发布失败,发布前完整性检查未通过:\n${problems.map((p, i) => `${i + 1}. ${p}`).join('\n')}`, 'KPI_PLAN_INCOMPLETE');
    }

    const actor = actorId(ctx);
    const at = nowIso();
    input.published_at = at;
    input.published_by = actor;

    const firstStep: PlanStepDef | undefined = steps[0];
    for (const s of subjects) {
      const existing = await api.object('kpi_entry_sheet').findOne({ where: { plan: id, subject: s.subject } });
      if (existing) continue;
      const bu = await findById(api, 'sys_business_unit', s.subject);
      const sheet = await api.object('kpi_entry_sheet').insert({
        name: `${prev.name} · ${bu?.name ?? s.name ?? s.subject}`,
        plan: id,
        subject: s.subject,
        subject_type: s.subject_type ?? 'department',
        status: 'draft',
        current_step: firstStep?.seq ?? 1,
      });
      const sheetId = String(sheet?.id ?? '');
      for (const pi of bySubject.get(String(s.subject)) ?? []) {
        await api.object('kpi_entry_line').insert({ sheet: sheetId, plan_indicator: pi.id, actual_value: null });
      }
      await writeReview(api, { sheet: sheetId, action: 'generate', step_label: '方案发布', from_status: null, to_status: 'draft', actor, reason: `方案「${prev.name}」发布,生成填报单` });
    }

    // 数据范围:按参与主体、分管领导、到人分工补齐共享规则,并对账停用本方案下已不该存在
    // 的规则(换掉分管领导、撤掉主体、撤掉到人分工)。失败不阻断发布。
    try {
      await provisionPlanSharing(api, id, { reconcile: true });
    } catch (err) {
      console.error('[kpi] provision plan sharing failed', { plan: id, error: err instanceof Error ? err.message : String(err) });
    }
  },
};

/** 新建方案时若指定「复制自版本」,复制其流程节点、参与主体、指标下达、到人分工与承接项。 */
export const PlanCloneHook: Hook = {
  name: 'kpi_plan_clone',
  label: '方案版本复制',
  object: 'kpi_plan',
  events: ['afterInsert'],
  priority: 100,
  handler: async (ctx: HookContext) => {
    const row = merged<Record<string, any>>(ctx);
    const result = ctx.result as Record<string, any> | undefined;
    const newId = String(result?.id ?? row.id ?? '');
    const sourceId = row.based_on ? String(row.based_on) : null;
    if (!newId || !sourceId || newId === sourceId) return;
    const api = sys(ctx);
    const copy = (r: Record<string, any>, keys: string[]) => Object.fromEntries(keys.map((k) => [k, r[k] ?? null]));

    for (const st of await api.object('kpi_plan_step').find({ where: { plan: sourceId } })) {
      await api.object('kpi_plan_step').insert({ ...copy(st, ['seq', 'step_type', 'label', 'approver_position']), plan: newId });
    }
    for (const s of await api.object('kpi_plan_subject').find({ where: { plan: sourceId } })) {
      await api.object('kpi_plan_subject').insert({ ...copy(s, ['subject', 'subject_type', 'assessor_unit', 'subject_weight', 'leader', 'remark']), plan: newId });
    }
    const piMap = new Map<string, string>();
    for (const pi of await api.object('kpi_plan_indicator').find({ where: { plan: sourceId } })) {
      const created = await api.object('kpi_plan_indicator').insert({
        ...copy(pi, ['indicator', 'subject', 'weight', 'target_value', 'data_source', 'remark']),
        baseline_value: pi.target_value ?? null,
        plan: newId,
      });
      piMap.set(String(pi.id), String(created?.id ?? ''));
    }
    for (const a of await api.object('kpi_staff_assignment').find({ where: { plan: sourceId } })) {
      const created = await api.object('kpi_staff_assignment').insert({ ...copy(a, ['employee', 'unit', 'weight', 'coefficient', 'remark']), plan: newId });
      for (const it of await api.object('kpi_personal_item').find({ where: { assignment: a.id } })) {
        const target = piMap.get(String(it.plan_indicator));
        if (!target) continue;
        await api.object('kpi_personal_item').insert({ assignment: String(created?.id ?? ''), plan_indicator: target, weight: it.weight ?? 0, target_value: it.target_value ?? null });
      }
    }
  },
};

/**
 * 方案关闭 / 归档后把数据范围降为只读(留读、去写)。
 *
 * 分管领导与填报人员仍要查得到历史方案的填报单与结果,但不应再改;快照与已通过的填报单
 * 本来就被 hook 锁死,这里是同一条纪律在数据范围上的延续。
 */
export const PlanFreezeSharingHook: Hook = {
  name: 'kpi_plan_freeze_sharing',
  label: '方案结束后数据范围降为只读',
  object: 'kpi_plan',
  events: ['afterUpdate'],
  priority: 90,
  handler: async (ctx: HookContext) => {
    const input = (ctx.input ?? {}) as Record<string, any>;
    const prev = (ctx.previous ?? {}) as Record<string, any>;
    if (!('status' in input) || input.status === prev.status) return;
    if (input.status !== 'closed' && input.status !== 'archived') return;
    const id = recordId(ctx);
    if (!id) return;
    try {
      await provisionPlanSharing(sys(ctx), id, { reconcile: true });
    } catch (err) {
      console.error('[kpi] downgrade plan sharing failed', { plan: id, error: err instanceof Error ? err.message : String(err) });
    }
  },
};
