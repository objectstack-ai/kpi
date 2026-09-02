import type { Api } from '../hooks/util.js';

/**
 * 动态数据范围(蓝图 B-M1-03,方案分级 D-01)。
 *
 * 「本部门 / 本分公司 / 分管范围可见」不再靠元数据里逐单元手写的共享规则,而是**按方案**
 * 把共享规则写成数据:规则的条件带方案 id,规则名按方案命名空间隔离。组织变化(新增部门、
 * 分公司、人员进出单元)不需要改任何元数据。
 *
 * 为什么是共享规则而不是逐条记录共享:平台把 `sys_record_share` 定为引擎独占对象
 * (数据 API 上 create 返回 405),且授权入口明示 recipientType 只接受 `user`
 * ——「group/position recipients are delivered via sharing rules (ADR-0111 D7)」;
 * 读侧 `buildReadFilter` 也只查 recipient_type = 'user' 的行。单元级范围的交付通道
 * 就是共享规则:规则求值器把 `unit_and_subordinates` 展开成逐人的 `sys_record_share`
 * 行,并在组织单元树与成员关系变动时自动重算。
 *
 * ## 为什么按方案(而不是按单元)建规则
 *
 * 按单元建的规则是**不可回收**的:换掉市场部的分管领导之后,老领导那条规则的条件仍然是
 * 「市场部的全部填报单」,于是他对这个单元今后**每一个**方案的填报单都保留编辑权。按方案
 * 建,加上每次发布对本方案做一次对账(见 {@link reconcilePlanSharing}),换人、撤主体、
 * 撤到人分工都会让旧规则当场失效,而历史方案的既有授权原样保留。
 *
 * ## 已关闭 / 已归档方案:留读、去写
 *
 * 方案关闭或归档后,填报单、核对任务、调整的规则从 `edit` 降为 `read` —— 分管领导与填报
 * 人员仍要能查历史,但不应再改;快照与已通过的填报单本来就已被 hook 锁死,这里去掉写权限
 * 是同一条纪律在数据范围上的延续。结果类规则本就是只读,不受影响。
 */

/** 一条共享规则的意图(与平台 `sys_sharing_rule` 的字段一一对应)。 */
export interface SharingIntent {
  /** 规则机器名:小写字母、数字、下划线;组织内唯一,用作幂等键。按方案加前缀。 */
  name: string;
  label: string;
  description: string;
  object: string;
  /** 记录筛选条件(平台 FilterCondition 的 JSON 形态),恒含方案 id。 */
  criteria: Record<string, unknown>;
  recipientType: 'unit_and_subordinates' | 'user' | 'position';
  recipientId: string;
  accessLevel: 'read' | 'edit';
  /**
   * 本规则派生自哪个组织单元。规则的组织归属要取自它,不能取自方案:
   * 规则求值把收件方展开成人时,对组织单元与成员关系用的是 `organization_id` 的**等值**
   * 过滤(不是「本组织或为空」的宽松匹配)。规则挂在别的组织上、而单元行的组织为空时,
   * 展开结果是 0 个人 —— 规则、记录、权限集全都看着正常,就是谁也看不到记录。
   */
  anchorUnit: string;
}

export interface SubjectRow {
  subject: string;
  subject_type?: string | null;
  name?: string | null;
  leader?: string | null;
}

export interface AssignmentRow {
  employee: string;
  unit?: string | null;
  name?: string | null;
}

/** 方案状态里「只读」的两个:已关闭、已归档。 */
export function isReadOnlyPlanStatus(status: unknown): boolean {
  return status === 'closed' || status === 'archived';
}

/**
 * 规则名片段:单元 id 这类已经合规的短标识原样保留,便于管理员在 Setup 里认;
 * 方案 id / 用户 id 带大小写与短横线,按稳定散列折成合规片段(同一 id 恒得同一片段)。
 */
export function ruleSlug(raw: string): string {
  const s = String(raw ?? '');
  if (/^[a-z0-9_]{1,32}$/.test(s)) return s;
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  const head = s.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12);
  return `${head || 'x'}_${h.toString(36)}`;
}

/** 一个方案名下全部规则的公共前缀 —— 对账时用它圈出「本方案的规则」。 */
export function planRulePrefix(planId: string): string {
  return `kpi_p${ruleSlug(planId)}_`;
}

/** 旧版本按单元(不带方案)建的规则前缀。它们正是不可回收的那批,发现即停用。 */
export const LEGACY_RULE_PREFIX = 'kpi_share_';

/** 人力岗位:哪两个岗位拿本方案的写范围(详见 {@link planSharingIntents} 的说明)。 */
const HR_POSITION_RULES: ReadonlyArray<{ position: string; label: string }> = [
  { position: 'kpi_hr_reviewer', label: '人力审核' },
  { position: 'kpi_hr_head', label: '人力负责人' },
];

/** 人力岗位规则挂在哪些对象上(填报单 = 审核与加减分;数据调整 = 调整审批)。 */
const HR_POSITION_OBJECTS: ReadonlyArray<{ key: string; object: string; label: string }> = [
  { key: 'sheet', object: 'kpi_entry_sheet', label: '填报单' },
  { key: 'adjust', object: 'kpi_adjustment', label: '数据调整' },
];

/**
 * 由方案配置推导出本方案需要的全部共享规则(纯函数,便于单元测试)。
 *
 * - 考核主体单元:填报单 / 核对任务 / 数据调整可编辑,本单元结果只读;
 * - 人力岗位(人力审核 / 人力负责人):本方案**全部**填报单与数据调整可编辑;
 * - 分管领导:所分管主体的填报单可编辑(领导审批节点要能改状态)、所分管主体的结果只读、
 *   本人结果(分管领导维度)只读;
 * - 被考核员工:本人到人结果只读。
 *
 * 方案已关闭 / 已归档时,可编辑的三类降为只读。
 *
 * ## 人力岗位的记录级写范围(调度员 2026-09-02 裁定,选项 A)
 *
 * 人力审核要在填报单下**登记加减分**、在人力审核节点**审核通过 / 驳回**,人力负责人要
 * **审批加减分与数据调整** —— 这些都是对填报单及其子记录的写。填报单 OWD 是 private,
 * 权限集里的 org 范围只放开读,写仍要过记录级判定,所以两个岗位**必须**拿到记录共享,
 * 否则确认口径(第 10 章第 6 项)在真实岗位账号下根本执行不了。
 *
 * 收件方直接用平台的 `position` 类型(ADR-0090 D3:岗位是扁平收件方,规则求值器
 * `expandRecipient` 把它展开成该岗位的全部持有人),不需要「持有该岗位的用户」这类等价
 * 表达。范围与其它三类规则同一套机制:条件带方案 id、规则名带方案前缀、发布时对账、
 * 方案已关闭 / 已归档后由 `edit` 降为 `read`。
 *
 * 加减分(`kpi_bonus`)不需要自己的规则:它是填报单的主从子记录(`controlled_by_parent`),
 * 记录级判定看的是主记录 —— 拿到填报单的 edit,插入 / 修改子记录就成立。
 */
export function planSharingIntents(
  planId: string,
  subjects: SubjectRow[],
  assignments: AssignmentRow[],
  planStatus?: unknown,
): SharingIntent[] {
  const intents: SharingIntent[] = [];
  const seen = new Set<string>();
  const prefix = planRulePrefix(planId);
  const frozen = isReadOnlyPlanStatus(planStatus);
  const writable: 'read' | 'edit' = frozen ? 'read' : 'edit';
  const suffix = frozen ? '(已结束,只读)' : '';
  const push = (intent: SharingIntent) => {
    if (seen.has(intent.name)) return;
    seen.add(intent.name);
    intents.push(intent);
  };

  for (const s of subjects) {
    const unit = String(s.subject ?? '');
    if (!unit) continue;
    const unitSlug = ruleSlug(unit);
    const unitLabel = s.name || unit;
    push({
      name: `${prefix}sheet_${unitSlug}`,
      label: `填报单共享给${unitLabel}及其下级${suffix}`,
      description: '考核主体成员',
      object: 'kpi_entry_sheet',
      criteria: { plan: planId, subject: unit },
      recipientType: 'unit_and_subordinates',
      recipientId: unit,
      accessLevel: writable,
      anchorUnit: unit,
    });
    push({
      name: `${prefix}check_${unitSlug}`,
      label: `核对任务共享给${unitLabel}及其下级${suffix}`,
      description: '核对分公司成员',
      object: 'kpi_check_task',
      criteria: { plan: planId, branch: unit },
      recipientType: 'unit_and_subordinates',
      recipientId: unit,
      accessLevel: writable,
      anchorUnit: unit,
    });
    push({
      name: `${prefix}adjust_${unitSlug}`,
      label: `数据调整共享给${unitLabel}及其下级${suffix}`,
      description: '考核主体成员',
      object: 'kpi_adjustment',
      criteria: { plan: planId, subject: unit },
      recipientType: 'unit_and_subordinates',
      recipientId: unit,
      accessLevel: writable,
      anchorUnit: unit,
    });
    push({
      name: `${prefix}result_${unitSlug}`,
      label: `考核结果共享给${unitLabel}及其下级`,
      description: '考核主体成员',
      object: 'kpi_result',
      criteria: { plan: planId, unit },
      recipientType: 'unit_and_subordinates',
      recipientId: unit,
      accessLevel: 'read',
      anchorUnit: unit,
    });

    const leader = s.leader ? String(s.leader) : '';
    if (!leader) continue;
    const leaderSlug = ruleSlug(leader);
    push({
      name: `${prefix}sheet_leader_${unitSlug}_${leaderSlug}`,
      label: `填报单共享给${unitLabel}分管领导${suffix}`,
      description: '分管领导',
      object: 'kpi_entry_sheet',
      criteria: { plan: planId, subject: unit },
      recipientType: 'user',
      recipientId: leader,
      accessLevel: writable,
      anchorUnit: unit,
    });
    // 分管领导要看到所分管主体的部门 / 分公司结果:那些行 person 为空,只共享给单元成员,
    // 而领导通常不是该单元的成员 —— 少了这条,README 与清单承诺的「分管主体结果」就是空的。
    push({
      name: `${prefix}result_leader_${unitSlug}_${leaderSlug}`,
      label: `${unitLabel}考核结果共享给分管领导`,
      description: '分管领导',
      object: 'kpi_result',
      criteria: { plan: planId, unit },
      recipientType: 'user',
      recipientId: leader,
      accessLevel: 'read',
      anchorUnit: unit,
    });
    push({
      name: `${prefix}result_person_${leaderSlug}`,
      label: '本人考核结果共享',
      description: '本人结果(分管领导 / 被考核人)',
      object: 'kpi_result',
      criteria: { plan: planId, person: leader },
      recipientType: 'user',
      recipientId: leader,
      accessLevel: 'read',
      anchorUnit: unit,
    });
  }

  // 人力岗位:本方案全部填报单与数据调整可编辑。规则要有组织归属才展开得出人,而组织归属
  // 取自锚定的组织单元行 —— 这里锚在第一个参与主体上(同一方案的主体在同一组织内);没有
  // 参与主体的方案发布不了,也就不需要这两类规则。
  const anchor = subjects.map((s) => String(s.subject ?? '')).find((u) => !!u) ?? '';
  if (anchor) {
    for (const { position, label } of HR_POSITION_RULES) {
      for (const { key, object, label: objectLabel } of HR_POSITION_OBJECTS) {
        push({
          name: `${prefix}${key}_pos_${position}`,
          label: `${objectLabel}共享给${label}岗位${suffix}`,
          description: `人力岗位(${label})`,
          object,
          criteria: { plan: planId },
          recipientType: 'position',
          recipientId: position,
          accessLevel: writable,
          anchorUnit: anchor,
        });
      }
    }
  }

  for (const a of assignments) {
    const employee = a.employee ? String(a.employee) : '';
    if (!employee) continue;
    push({
      name: `${prefix}result_person_${ruleSlug(employee)}`,
      label: '本人考核结果共享',
      description: '本人结果(分管领导 / 被考核人)',
      object: 'kpi_result',
      criteria: { plan: planId, person: employee },
      recipientType: 'user',
      recipientId: employee,
      accessLevel: 'read',
      anchorUnit: a.unit ? String(a.unit) : '',
    });
  }

  return intents;
}

export type EnsureOutcome = 'created' | 'reasserted' | 'skipped_customized' | 'skipped_inactive';

/**
 * 写入一条规则。**内容相同也照写一次**,这不是多余的:平台对 `isSystem` 写入**跳过**记录
 * 共享的物化(plugin-sharing 的 rule-hooks:「sharing materialisation skipped for isSystem
 * writes」,官方补偿手段是重新求值规则,`evaluateRule` 幂等)。本应用的填报单、核对任务、
 * 调整、结果**全部**由 hook 以系统上下文创建,所以这些记录不会在创建时拿到共享行 ——
 * 重新写一次规则会触发求值器把该规则匹配到的记录整批补齐,这正是官方的补偿路径。
 *
 * 两条不碰管理员的红线:
 *   · `active` **绝不**出现在更新载荷里 —— 它是管理员在 Setup 里撤销授权的开关
 *     (「Turn off to withdraw the access this rule granted」),被关掉的规则只记一行日志;
 *   · `customized` 被标记的行整条跳过 —— 那是管理员按自己需要调过的规则。
 *
 * 组织归属在**插入与更新两条路径上都写**:只在插入时写会让一条早期无组织的规则永远无组织,
 * 而无组织的规则在收件方展开时匹配不到任何单元(等值过滤),在条件扫描时又会跨租户全表扫。
 */
async function ensureRule(api: Api, intent: SharingIntent, organizationId: string): Promise<EnsureOutcome> {
  const criteriaJson = JSON.stringify(intent.criteria);
  const existing = await api.object('sys_sharing_rule').findOne({ where: { name: intent.name, organization_id: organizationId } });
  const payload: Record<string, unknown> = {
    label: intent.label,
    description: intent.description,
    object_name: intent.object,
    criteria_json: criteriaJson,
    recipient_type: intent.recipientType,
    recipient_id: intent.recipientId,
    access_level: intent.accessLevel,
    organization_id: organizationId,
  };
  if (!existing) {
    await api.object('sys_sharing_rule').insert({ ...payload, name: intent.name, active: true });
    return 'created';
  }
  if (existing.customized === true) return 'skipped_customized';
  if (existing.active === false) return 'skipped_inactive';
  await api.object('sys_sharing_rule').updateById(String(existing.id), payload);
  return 'reasserted';
}

/**
 * 每条规则的组织归属 = 它所锚定的组织单元行上的组织。
 *
 * 必须与单元行一致,不能取方案或当前会话的组织:收件方展开对 `sys_business_unit` /
 * `sys_business_unit_member` 用的是组织等值过滤,组织对不上就展开出 0 个人。
 */
async function unitOrganizations(api: Api, unitIds: Iterable<string>): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  for (const id of unitIds) {
    if (!id || map.has(id)) continue;
    const unit = await api.object('sys_business_unit').findOne({ where: { id } });
    map.set(id, unit?.organization_id ? String(unit.organization_id) : null);
  }
  return map;
}

export interface ProvisionOutcome {
  created: number;
  reasserted: number;
  skipped: number;
  deactivated: number;
  failed: number;
}

export interface ProvisionOptions {
  /** 只重新声明这些对象上的规则;省略 = 全部(方案发布 / 关闭时用)。 */
  objects?: readonly string[];
  /**
   * 是否对账(停用本方案下已不该存在的规则)。只有覆盖全部对象的那次调用才对账 ——
   * 按对象做的增量重声明看不到全集,拿它去对账会把没在本次范围里的规则全停掉。
   */
  reconcile?: boolean;
}

/** 停用一条不再需要的规则(保留行以便管理员看到它曾经存在,不删除)。 */
async function deactivateRule(api: Api, rule: Record<string, any>): Promise<void> {
  await api.object('sys_sharing_rule').updateById(String(rule.id), { active: false });
}

/**
 * 对账:本方案名下、由本应用管理的规则,凡不在目标集合里的一律停用。
 *
 * 这是「换掉分管领导后老领导仍保有编辑权」的收口 —— 也覆盖撤掉参与主体、撤掉到人分工。
 * 顺带停用旧版本按单元(不带方案)建的 `kpi_share_*` 规则:它们条件里没有方案,天生回收
 * 不了,正是本次要消灭的形态。
 */
async function reconcilePlanSharing(
  api: Api,
  planId: string,
  organizationId: string,
  desiredNames: ReadonlySet<string>,
): Promise<number> {
  const prefix = planRulePrefix(planId);
  const all = (await api.object('sys_sharing_rule').find({ where: { organization_id: organizationId }, limit: 5000 })) ?? [];
  let deactivated = 0;
  for (const rule of all as Array<Record<string, any>>) {
    const name = String(rule.name ?? '');
    const mine = name.startsWith(prefix) || name.startsWith(LEGACY_RULE_PREFIX);
    if (!mine) continue;
    if (desiredNames.has(name)) continue;
    if (rule.active === false) continue;
    if (rule.customized === true) continue;
    await deactivateRule(api, rule);
    deactivated += 1;
  }
  return deactivated;
}

/**
 * 按方案配置补齐数据范围规则。幂等:同一方案重复发布、驳回后重新推进都不会产生重复行。
 *
 * 单条规则写失败只记服务端日志并继续,绝不阻断发布 —— 数据范围是可补偿的:再次发布
 * 或管理员在 Setup 里补一条即可,而发布回滚会让已生成的填报单与业务动作一起丢失。
 */
export async function provisionPlanSharing(api: Api, planId: string, options: ProvisionOptions = {}): Promise<ProvisionOutcome> {
  const outcome: ProvisionOutcome = { created: 0, reasserted: 0, skipped: 0, deactivated: 0, failed: 0 };
  const plan = await api.object('kpi_plan').findOne({ where: { id: planId } });
  const subjects = (await api.object('kpi_plan_subject').find({ where: { plan: planId } })) as SubjectRow[];
  const assignments = (await api.object('kpi_staff_assignment').find({ where: { plan: planId } })) as AssignmentRow[];
  const all = planSharingIntents(planId, subjects ?? [], assignments ?? [], plan?.status);
  const intents = options.objects ? all.filter((i) => options.objects!.includes(i.object)) : all;
  const orgOf = await unitOrganizations(api, all.map((i) => i.anchorUnit));

  for (const intent of intents) {
    const organizationId = orgOf.get(intent.anchorUnit) ?? null;
    if (!organizationId) {
      // 无组织的规则展开不出人、扫描又跨租户 —— 宁可不写,响亮地记一条。
      outcome.failed += 1;
      console.error('[kpi] KPI_SHARING_NO_ORG: sharing rule not written because its business unit has no organization', { rule: intent.name, unit: intent.anchorUnit });
      continue;
    }
    try {
      const result = await ensureRule(api, intent, organizationId);
      if (result === 'created') outcome.created += 1;
      else if (result === 'reasserted') outcome.reasserted += 1;
      else {
        outcome.skipped += 1;
        console.info('[kpi] sharing rule left untouched by admin decision', { rule: intent.name, reason: result });
      }
    } catch (err) {
      outcome.failed += 1;
      console.error('[kpi] provision sharing rule failed', { rule: intent.name, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (options.reconcile) {
    const organizationId = [...orgOf.values()].find((o) => !!o) ?? null;
    if (organizationId) {
      try {
        outcome.deactivated = await reconcilePlanSharing(api, planId, organizationId, new Set(all.map((i) => i.name)));
      } catch (err) {
        console.error('[kpi] reconcile sharing rules failed', { plan: planId, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }
  return outcome;
}
