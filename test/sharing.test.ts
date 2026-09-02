import { describe, expect, it } from 'vitest';
import {
  LEGACY_RULE_PREFIX,
  isReadOnlyPlanStatus,
  planRulePrefix,
  planSharingIntents,
  ruleSlug,
  type AssignmentRow,
  type SubjectRow,
} from '../src/services/sharing-service.js';
import { isDemoEnvironment, resolveEnvironmentMode } from '../src/data/align-demo-units.js';

const PLAN = 'plan_A1';
const SUBJECTS: SubjectRow[] = [
  { subject: 'bu_market', subject_type: 'department', name: '市场部', leader: 'usr_ABC-123' },
  { subject: 'bu_east', subject_type: 'branch', name: '华东分公司', leader: null },
];
const ASSIGNMENTS: AssignmentRow[] = [{ employee: 'usr_XYZ-789', unit: 'bu_market' }];

describe('规则名片段', () => {
  it('合规的单元 id 原样保留,便于管理员在 Setup 里辨认', () => {
    expect(ruleSlug('bu_market')).toBe('bu_market');
  });

  it('带大小写与短横线的 id 折成合规片段,且同一 id 恒得同一片段', () => {
    const a = ruleSlug('usr_ABC-123');
    expect(a).toMatch(/^[a-z0-9_]+$/);
    expect(ruleSlug('usr_ABC-123')).toBe(a);
    expect(ruleSlug('usr_abc-124')).not.toBe(a);
  });

  it('不同方案的规则前缀不同 —— 规则按方案隔离', () => {
    expect(planRulePrefix('plan_A1')).not.toBe(planRulePrefix('plan_B2'));
    expect(planRulePrefix('plan_A1')).toMatch(/^kpi_p[a-z0-9_]+_$/);
  });
});

describe('按方案配置推导数据范围规则', () => {
  const intents = planSharingIntents(PLAN, SUBJECTS, ASSIGNMENTS);
  const byName = new Map(intents.map((i) => [i.name, i]));
  const P = planRulePrefix(PLAN);

  it('每条规则的条件都带方案 —— 这是能回收授权的前提', () => {
    expect(intents.length).toBeGreaterThan(0);
    for (const i of intents) expect(i.criteria.plan).toBe(PLAN);
  });

  it('每个考核主体单元:填报单 / 核对任务 / 数据调整可编辑,本单元结果只读', () => {
    expect(byName.get(`${P}sheet_bu_market`)).toMatchObject({
      object: 'kpi_entry_sheet', criteria: { plan: PLAN, subject: 'bu_market' }, recipientType: 'unit_and_subordinates', recipientId: 'bu_market', accessLevel: 'edit',
    });
    expect(byName.get(`${P}check_bu_east`)).toMatchObject({ object: 'kpi_check_task', criteria: { plan: PLAN, branch: 'bu_east' }, accessLevel: 'edit' });
    expect(byName.get(`${P}adjust_bu_market`)).toMatchObject({ object: 'kpi_adjustment', criteria: { plan: PLAN, subject: 'bu_market' }, accessLevel: 'edit' });
    expect(byName.get(`${P}result_bu_market`)).toMatchObject({ object: 'kpi_result', criteria: { plan: PLAN, unit: 'bu_market' }, accessLevel: 'read' });
  });

  it('分管领导:所分管主体的填报单可编辑、该主体的结果只读、本人结果只读', () => {
    const L = ruleSlug('usr_ABC-123');
    expect(byName.get(`${P}sheet_leader_bu_market_${L}`)).toMatchObject({ recipientType: 'user', recipientId: 'usr_ABC-123', accessLevel: 'edit', criteria: { plan: PLAN, subject: 'bu_market' } });
    // 部门 / 分公司结果行 person 为空、只共享给单元成员,而领导通常不是单元成员 —— 少了
    // 这条规则,「分管主体的结果」就是一句空话
    expect(byName.get(`${P}result_leader_bu_market_${L}`)).toMatchObject({ object: 'kpi_result', recipientType: 'user', recipientId: 'usr_ABC-123', accessLevel: 'read', criteria: { plan: PLAN, unit: 'bu_market' } });
    expect(byName.get(`${P}result_person_${L}`)).toMatchObject({ object: 'kpi_result', criteria: { plan: PLAN, person: 'usr_ABC-123' }, accessLevel: 'read' });
  });

  it('未配置分管领导的主体不产生领导规则', () => {
    expect(intents.some((i) => i.recipientType === 'user' && i.name.includes('bu_east'))).toBe(false);
  });

  it('被考核员工对本人到人结果只读', () => {
    expect(byName.get(`${P}result_person_${ruleSlug('usr_XYZ-789')}`)).toMatchObject({ object: 'kpi_result', criteria: { plan: PLAN, person: 'usr_XYZ-789' } });
  });

  it('规则名唯一:同一人既是分管领导又被下达到人分工时只出一条本人结果规则', () => {
    const names = intents.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
    const both = planSharingIntents(PLAN, SUBJECTS, [{ employee: 'usr_ABC-123', unit: 'bu_market' }]);
    expect(both.filter((i) => i.recipientId === 'usr_ABC-123' && i.criteria.person === 'usr_ABC-123')).toHaveLength(1);
  });

  it('规则名全部合规(小写字母、数字、下划线,不超过 100)', () => {
    for (const i of intents) expect(i.name).toMatch(/^[a-z0-9_]{1,100}$/);
  });

  it('每条规则锚定它派生自的组织单元 —— 组织归属要跟单元行一致才展开得出人', () => {
    expect(byName.get(`${P}sheet_bu_market`)?.anchorUnit).toBe('bu_market');
    expect(byName.get(`${P}check_bu_east`)?.anchorUnit).toBe('bu_east');
    expect(intents.find((i) => i.recipientId === 'usr_XYZ-789')?.anchorUnit).toBe('bu_market');
  });

  it('空配置不产生任何规则', () => {
    expect(planSharingIntents(PLAN, [], [])).toEqual([]);
  });
});

describe('对账:换人 / 撤主体后旧规则不再出现在目标集合里', () => {
  const P = planRulePrefix(PLAN);
  const oldLeader = ruleSlug('usr_ABC-123');
  const newLeader = ruleSlug('usr_DDD-999');

  it('换掉分管领导:老领导的规则名不在新目标集合中(对账时会被停用)', () => {
    const after = planSharingIntents(PLAN, [{ ...SUBJECTS[0]!, leader: 'usr_DDD-999' }, SUBJECTS[1]!], ASSIGNMENTS);
    const names = new Set(after.map((i) => i.name));
    expect(names.has(`${P}sheet_leader_bu_market_${newLeader}`)).toBe(true);
    expect(names.has(`${P}sheet_leader_bu_market_${oldLeader}`)).toBe(false);
    expect(names.has(`${P}result_person_${oldLeader}`)).toBe(false);
  });

  it('撤掉参与主体:该单元的四类规则一条都不再出现', () => {
    const after = planSharingIntents(PLAN, [SUBJECTS[1]!], []);
    expect(after.some((i) => i.name.includes('bu_market'))).toBe(false);
  });

  it('撤掉到人分工:该员工的本人结果规则不再出现', () => {
    const after = planSharingIntents(PLAN, SUBJECTS, []);
    expect(after.some((i) => i.criteria.person === 'usr_XYZ-789')).toBe(false);
  });

  it('旧版按单元(不带方案)建的规则前缀与方案前缀不同,对账时按前缀能圈到它', () => {
    expect(LEGACY_RULE_PREFIX).toBe('kpi_share_');
    expect(planRulePrefix(PLAN).startsWith(LEGACY_RULE_PREFIX)).toBe(false);
  });
});

describe('已关闭 / 已归档方案:留读、去写', () => {
  it('关闭与归档都算「已结束」,草稿与已发布不算', () => {
    expect(isReadOnlyPlanStatus('closed')).toBe(true);
    expect(isReadOnlyPlanStatus('archived')).toBe(true);
    expect(isReadOnlyPlanStatus('published')).toBe(false);
    expect(isReadOnlyPlanStatus('draft')).toBe(false);
  });

  it('方案结束后填报单 / 核对任务 / 调整由可编辑降为只读,结果本就只读', () => {
    const closed = planSharingIntents(PLAN, SUBJECTS, ASSIGNMENTS, 'closed');
    for (const i of closed) expect(i.accessLevel).toBe('read');
    const live = planSharingIntents(PLAN, SUBJECTS, ASSIGNMENTS, 'published');
    expect(live.filter((i) => i.accessLevel === 'edit').length).toBeGreaterThan(0);
  });

  it('规则名不随状态变化 —— 降级是原地改权限,不是另建一批规则', () => {
    const closed = planSharingIntents(PLAN, SUBJECTS, ASSIGNMENTS, 'closed').map((i) => i.name);
    const live = planSharingIntents(PLAN, SUBJECTS, ASSIGNMENTS, 'published').map((i) => i.name);
    expect(closed).toEqual(live);
  });
});

describe('演示夹具的环境闸门(与平台判定一致,默认闭)', () => {
  it('NODE_ENV 未设时按生产处理 —— 夹具不跑', () => {
    expect(resolveEnvironmentMode({})).toBe('production');
    expect(isDemoEnvironment({})).toBe(false);
  });

  it('生产环境不跑', () => {
    expect(isDemoEnvironment({ NODE_ENV: 'production' })).toBe(false);
  });

  it('dev / development / test 才跑(对齐种子自己声明的 env)', () => {
    expect(isDemoEnvironment({ NODE_ENV: 'development' })).toBe(true);
    expect(isDemoEnvironment({ NODE_ENV: 'dev' })).toBe(true);
    expect(isDemoEnvironment({ NODE_ENV: 'test' })).toBe(true);
  });

  it('未知环境名不开门', () => {
    expect(isDemoEnvironment({ NODE_ENV: 'staging' })).toBe(false);
  });
});
