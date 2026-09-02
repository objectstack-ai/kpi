import type { Api } from '../hooks/util.js';

/**
 * 动态数据范围(蓝图 B-M1-03,方案分级 D-01)。
 *
 * 「本部门 / 本分公司 / 分管范围可见」不再靠元数据里逐单元手写的共享规则,而是在方案
 * 发布时按方案配置(参与主体、分管领导、到人分工)把**共享规则写成数据**。组织变化
 * (新增部门、分公司、人员进出单元)不需要改任何元数据。
 *
 * 为什么是共享规则而不是逐条记录共享:平台把 `sys_record_share` 定为引擎独占对象
 * (数据 API 上 create 返回 405),且授权入口明示 recipientType 只接受 `user`
 * ——「group/position recipients are delivered via sharing rules (ADR-0111 D7)」;
 * 读侧 `buildReadFilter` 也只查 recipient_type = 'user' 的行。单元级范围的交付通道
 * 就是共享规则:规则求值器把 `unit_and_subordinates` 展开成逐人的 `sys_record_share`
 * 行(source = 'rule'、source_id = 规则 id),并在组织单元树与成员关系变动时自动重算
 * ——后加入单元的人无需本应用做任何事即可看到本单元既有记录。
 */

/** 一条共享规则的意图(与平台 `sys_sharing_rule` 的字段一一对应)。 */
export interface SharingIntent {
  /** 规则机器名:小写字母、数字、下划线;组织内唯一,用作幂等键。 */
  name: string;
  label: string;
  description: string;
  object: string;
  /** 记录筛选条件(平台 FilterCondition 的 JSON 形态)。 */
  criteria: Record<string, unknown>;
  recipientType: 'unit_and_subordinates' | 'user';
  recipientId: string;
  accessLevel: 'read' | 'edit';
  /**
   * 本规则派生自哪个组织单元。规则的组织归属必须取自它,不能取自方案:
   * 规则求值把收件方展开成人时,对组织单元与成员关系用的是 `organization_id` 的**等值**
   * 过滤(不是「本组织或全局」的宽松匹配)。规则挂在方案的组织上、而单元行的组织为空时,
   * 展开结果是 0 个人 —— 规则、记录、权限集全都看着正常,就是谁也看不到记录。
   */
  anchorUnit: string;
}

/** 参与主体(只取本模块需要的字段)。 */
export interface SubjectRow {
  subject: string;
  subject_type?: string | null;
  name?: string | null;
  leader?: string | null;
}

/** 到人分工(只取本模块需要的字段)。 */
export interface AssignmentRow {
  employee: string;
  unit?: string | null;
  name?: string | null;
}

/**
 * 规则名片段:单元 id 这类已经合规的短标识原样保留,便于管理员在 Setup 里认;
 * 用户 id 带大小写与短横线,按稳定散列折成合规片段(同一 id 恒得同一片段)。
 */
export function ruleSlug(raw: string): string {
  const s = String(raw ?? '');
  if (/^[a-z0-9_]{1,32}$/.test(s)) return s;
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  const head = s.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12);
  return `${head || 'x'}_${h.toString(36)}`;
}

/**
 * 由方案配置推导出本方案需要的全部共享规则(纯函数,便于单元测试)。
 *
 * - 考核主体单元:填报单 / 核对任务 / 数据调整可编辑,部门与分公司结果只读;
 * - 分管领导:所分管主体的填报单可编辑(领导审批节点要能改状态);
 * - 分管领导与被考核员工:到人 / 分管领导维度的结果只读(按结果的人员字段匹配)。
 */
export function planSharingIntents(subjects: SubjectRow[], assignments: AssignmentRow[]): SharingIntent[] {
  const intents: SharingIntent[] = [];
  const seen = new Set<string>();
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
      name: `kpi_share_sheet_${unitSlug}`,
      label: `填报单共享给${unitLabel}`,
      description: '考核主体成员',
      object: 'kpi_entry_sheet',
      criteria: { subject: unit },
      recipientType: 'unit_and_subordinates',
      recipientId: unit,
      accessLevel: 'edit',
      anchorUnit: unit,
    });
    push({
      name: `kpi_share_check_${unitSlug}`,
      label: `核对任务共享给${unitLabel}`,
      description: '核对分公司成员',
      object: 'kpi_check_task',
      criteria: { branch: unit },
      recipientType: 'unit_and_subordinates',
      recipientId: unit,
      accessLevel: 'edit',
      anchorUnit: unit,
    });
    push({
      name: `kpi_share_adjust_${unitSlug}`,
      label: `数据调整共享给${unitLabel}`,
      description: '考核主体成员',
      object: 'kpi_adjustment',
      criteria: { subject: unit },
      recipientType: 'unit_and_subordinates',
      recipientId: unit,
      accessLevel: 'edit',
      anchorUnit: unit,
    });
    push({
      name: `kpi_share_result_${unitSlug}`,
      label: `考核结果共享给${unitLabel}`,
      description: '考核主体成员',
      object: 'kpi_result',
      criteria: { unit },
      recipientType: 'unit_and_subordinates',
      recipientId: unit,
      accessLevel: 'read',
      anchorUnit: unit,
    });

    const leader = s.leader ? String(s.leader) : '';
    if (!leader) continue;
    const leaderSlug = ruleSlug(leader);
    push({
      name: `kpi_share_sheet_leader_${unitSlug}_${leaderSlug}`,
      label: `填报单共享给${unitLabel}分管领导`,
      description: '分管领导',
      object: 'kpi_entry_sheet',
      criteria: { subject: unit },
      recipientType: 'user',
      recipientId: leader,
      accessLevel: 'edit',
      anchorUnit: unit,
    });
    push({
      name: `kpi_share_result_person_${leaderSlug}`,
      label: '本人考核结果共享',
      description: '分管领导',
      object: 'kpi_result',
      criteria: { person: leader },
      recipientType: 'user',
      recipientId: leader,
      accessLevel: 'read',
      anchorUnit: unit,
    });
  }

  for (const a of assignments) {
    const employee = a.employee ? String(a.employee) : '';
    if (!employee) continue;
    push({
      name: `kpi_share_result_person_${ruleSlug(employee)}`,
      label: '本人考核结果共享',
      description: '被考核人',
      object: 'kpi_result',
      criteria: { person: employee },
      recipientType: 'user',
      recipientId: employee,
      accessLevel: 'read',
      anchorUnit: a.unit ? String(a.unit) : '',
    });
  }

  return intents;
}

/**
 * 写入一条规则。**内容相同也照写一次**,这不是多余的:平台对 `isSystem` 写入**跳过**记录
 * 共享的物化(plugin-sharing 的 rule-hooks:「sharing materialisation skipped for isSystem
 * writes」,官方补偿手段是重新求值规则,`evaluateRule` 幂等)。本应用的填报单、核对任务、
 * 调整、结果**全部**由 hook 以系统上下文创建,所以这些记录不会在创建时拿到共享行 ——
 * 重新写一次规则会触发求值器把该规则匹配到的记录整批补齐,这正是官方的补偿路径。
 *
 * 因此每个业务触发点(发布、进入分公司核对、调整新建、结果重算)都重新声明一次相关规则。
 */
async function ensureRule(api: Api, intent: SharingIntent, organizationId: string | null): Promise<'created' | 'reasserted'> {
  const criteriaJson = JSON.stringify(intent.criteria);
  const existing = await api.object('sys_sharing_rule').findOne({ where: { name: intent.name } });
  const payload: Record<string, unknown> = {
    name: intent.name,
    label: intent.label,
    description: intent.description,
    object_name: intent.object,
    criteria_json: criteriaJson,
    recipient_type: intent.recipientType,
    recipient_id: intent.recipientId,
    access_level: intent.accessLevel,
    active: true,
  };
  if (!existing) {
    if (organizationId) payload.organization_id = organizationId;
    await api.object('sys_sharing_rule').insert(payload);
    return 'created';
  }
  await api.object('sys_sharing_rule').updateById(String(existing.id), payload);
  return 'reasserted';
}

/**
 * 每条规则的组织归属 = 它所锚定的组织单元行上的组织(取不到就留空 = 平台级)。
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
  failed: number;
}

export interface ProvisionOptions {
  /** 只重新声明这些对象上的规则;省略 = 全部(方案发布时用)。 */
  objects?: readonly string[];
}

/**
 * 按方案配置补齐数据范围规则。幂等:同一方案重复发布、驳回后重新推进都不会产生重复行。
 *
 * 单条规则写失败只记服务端日志并继续,绝不阻断发布 —— 数据范围是可补偿的:再次发布
 * 或管理员在 Setup 里补一条即可,而发布回滚会让已生成的填报单与业务动作一起丢失。
 */
export async function provisionPlanSharing(api: Api, planId: string, options: ProvisionOptions = {}): Promise<ProvisionOutcome> {
  const outcome: ProvisionOutcome = { created: 0, reasserted: 0, failed: 0 };
  const subjects = (await api.object('kpi_plan_subject').find({ where: { plan: planId } })) as SubjectRow[];
  const assignments = (await api.object('kpi_staff_assignment').find({ where: { plan: planId } })) as AssignmentRow[];
  const all = planSharingIntents(subjects ?? [], assignments ?? []);
  const intents = options.objects ? all.filter((i) => options.objects!.includes(i.object)) : all;
  const orgOf = await unitOrganizations(api, intents.map((i) => i.anchorUnit));

  for (const intent of intents) {
    try {
      outcome[await ensureRule(api, intent, orgOf.get(intent.anchorUnit) ?? null)] += 1;
    } catch (err) {
      outcome.failed += 1;
      console.error('[kpi] provision sharing rule failed', { rule: intent.name, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return outcome;
}
