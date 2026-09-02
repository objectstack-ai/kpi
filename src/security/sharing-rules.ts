import { defineSharingRule } from '@objectstack/spec/security';

/**
 * 按考核主体的共享规则(蓝图 B-M1-03 的开源版落法)。
 *
 * 填报单 / 核对任务 / 数据调整 / 考核结果的 OWD 为 private(仅本人);「本部门可见」
 * 由本文件的条件共享规则从 own 放宽到主体单元的成员:
 *   record.subject == '<单元 id>' → sharedWith business_unit '<单元 id>'
 * 共享规则是元数据、只能写静态单元 id,因此按单元逐条生成:演示环境覆盖种子组织树;
 * 实施阶段按客户真实组织(14 家分公司)在此追加单元 id 即可;企业版可改用
 * `hierarchy-security` 的 unit / unit_and_below 深度(见 security/index.ts 注释)。
 */
export const SHARED_UNITS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'bu_market', label: '市场部' },
  { id: 'bu_ops', label: '运营部' },
  { id: 'bu_hr', label: '人力资源部' },
  { id: 'bu_east', label: '华东分公司' },
  { id: 'bu_south', label: '华南分公司' },
  { id: 'bu_north', label: '华北分公司' },
  { id: 'bu_west', label: '西部分公司' },
];

function rulesFor(unit: { id: string; label: string }) {
  return [
    defineSharingRule({
      type: 'criteria',
      name: `kpi_share_sheet_${unit.id}`,
      label: `填报单共享给${unit.label}`,
      object: 'kpi_entry_sheet',
      condition: `record.subject == '${unit.id}'`,
      accessLevel: 'edit',
      sharedWith: { type: 'business_unit', value: unit.id },
    }),
    defineSharingRule({
      type: 'criteria',
      name: `kpi_share_check_${unit.id}`,
      label: `核对任务共享给${unit.label}`,
      object: 'kpi_check_task',
      condition: `record.branch == '${unit.id}'`,
      accessLevel: 'edit',
      sharedWith: { type: 'business_unit', value: unit.id },
    }),
    defineSharingRule({
      type: 'criteria',
      name: `kpi_share_adjust_${unit.id}`,
      label: `数据调整共享给${unit.label}`,
      object: 'kpi_adjustment',
      condition: `record.subject == '${unit.id}'`,
      accessLevel: 'edit',
      sharedWith: { type: 'business_unit', value: unit.id },
    }),
    defineSharingRule({
      type: 'criteria',
      name: `kpi_share_result_${unit.id}`,
      label: `考核结果共享给${unit.label}`,
      object: 'kpi_result',
      condition: `record.unit == '${unit.id}'`,
      accessLevel: 'read',
      sharedWith: { type: 'business_unit', value: unit.id },
    }),
  ];
}

export const allSharingRules = SHARED_UNITS.flatMap(rulesFor);
