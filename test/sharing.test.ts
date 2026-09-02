import { describe, expect, it } from 'vitest';
import { planSharingIntents, ruleSlug, type AssignmentRow, type SubjectRow } from '../src/services/sharing-service.js';

const SUBJECTS: SubjectRow[] = [
  { subject: 'bu_market', subject_type: 'department', name: '市场部', leader: 'usr_ABC-123' },
  { subject: 'bu_east', subject_type: 'branch', name: '华东分公司', leader: null },
];
const ASSIGNMENTS: AssignmentRow[] = [{ employee: 'usr_XYZ-789', unit: 'bu_market' }];

describe('规则名片段', () => {
  it('合规的单元 id 原样保留,便于管理员在 Setup 里辨认', () => {
    expect(ruleSlug('bu_market')).toBe('bu_market');
  });

  it('带大小写与短横线的用户 id 折成合规片段,且同一 id 恒得同一片段', () => {
    const a = ruleSlug('usr_ABC-123');
    expect(a).toMatch(/^[a-z0-9_]+$/);
    expect(ruleSlug('usr_ABC-123')).toBe(a);
    expect(ruleSlug('usr_abc-124')).not.toBe(a);
  });
});

describe('按方案配置推导数据范围规则', () => {
  const intents = planSharingIntents(SUBJECTS, ASSIGNMENTS);
  const byName = new Map(intents.map((i) => [i.name, i]));

  it('每个考核主体单元:填报单 / 核对任务 / 数据调整可编辑,结果只读', () => {
    expect(byName.get('kpi_share_sheet_bu_market')).toMatchObject({
      object: 'kpi_entry_sheet', criteria: { subject: 'bu_market' }, recipientType: 'unit_and_subordinates', recipientId: 'bu_market', accessLevel: 'edit',
    });
    expect(byName.get('kpi_share_check_bu_east')).toMatchObject({ object: 'kpi_check_task', criteria: { branch: 'bu_east' }, accessLevel: 'edit' });
    expect(byName.get('kpi_share_adjust_bu_market')).toMatchObject({ object: 'kpi_adjustment', criteria: { subject: 'bu_market' }, accessLevel: 'edit' });
    expect(byName.get('kpi_share_result_bu_market')).toMatchObject({ object: 'kpi_result', criteria: { unit: 'bu_market' }, accessLevel: 'read' });
  });

  it('配置了分管领导的主体:领导对该主体填报单可编辑,对本人结果只读', () => {
    const sheet = intents.find((i) => i.object === 'kpi_entry_sheet' && i.recipientType === 'user');
    expect(sheet).toMatchObject({ criteria: { subject: 'bu_market' }, recipientId: 'usr_ABC-123', accessLevel: 'edit' });
    expect(intents.some((i) => i.object === 'kpi_result' && i.recipientId === 'usr_ABC-123' && i.accessLevel === 'read')).toBe(true);
  });

  it('未配置分管领导的主体不产生领导规则', () => {
    expect(intents.some((i) => i.recipientType === 'user' && i.name.includes('bu_east'))).toBe(false);
  });

  it('被考核员工对本人到人结果只读', () => {
    expect(intents.some((i) => i.object === 'kpi_result' && i.recipientId === 'usr_XYZ-789' && i.criteria.person === 'usr_XYZ-789')).toBe(true);
  });

  it('规则名唯一:同一人既是分管领导又被下达到人分工时只出一条本人结果规则', () => {
    const names = intents.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
    const both = planSharingIntents(SUBJECTS, [{ employee: 'usr_ABC-123' }]);
    expect(both.filter((i) => i.recipientId === 'usr_ABC-123' && i.object === 'kpi_result')).toHaveLength(1);
  });

  it('规则名全部合规(小写字母、数字、下划线)', () => {
    for (const i of intents) expect(i.name).toMatch(/^[a-z0-9_]{1,100}$/);
  });

  it('每条规则锚定它派生自的组织单元 —— 规则的组织归属要跟单元行一致才展开得出人', () => {
    expect(byName.get('kpi_share_sheet_bu_market')?.anchorUnit).toBe('bu_market');
    expect(byName.get('kpi_share_check_bu_east')?.anchorUnit).toBe('bu_east');
    // 分管领导规则锚定它分管的主体单元,不是领导本人
    expect(intents.find((i) => i.object === 'kpi_entry_sheet' && i.recipientType === 'user')?.anchorUnit).toBe('bu_market');
    expect(intents.find((i) => i.recipientId === 'usr_XYZ-789')?.anchorUnit).toBe('bu_market');
  });

  it('空配置不产生任何规则', () => {
    expect(planSharingIntents([], [])).toEqual([]);
  });
});
