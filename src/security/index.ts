import { definePosition } from '@objectstack/spec/identity';
import { definePermissionSet } from '@objectstack/spec/security';

/** 岗位(扁平分发,ADR-0090 D3);上下级关系由平台组织单元树承载。 */
export const AdminPosition = definePosition({ name: 'kpi_admin', label: '考核系统管理员', description: '系统配置、用户/岗位/组织维护,可访问全部功能与数据。' });
export const HrReviewerPosition = definePosition({ name: 'kpi_hr_reviewer', label: '人力审核', description: '指标与方案维护、考核审核、数据调整审批、审计查询。' });
export const HrHeadPosition = definePosition({ name: 'kpi_hr_head', label: '人力负责人', description: '考核审核审批、数据调整审批、审计查询。' });
export const DeptReporterPosition = definePosition({ name: 'kpi_dept_reporter', label: '部门填报人员', description: '本部门数据的填报与提交,发起数据调整申请。' });
export const BranchCheckerPosition = definePosition({ name: 'kpi_branch_checker', label: '分公司核对人员', description: '本分公司相关数据的核对与确认。' });
export const ExecLeaderPosition = definePosition({ name: 'kpi_exec_leader', label: '分管领导', description: '分管范围内结果查看与最终审批。' });

const full = { allowRead: true, allowCreate: true, allowEdit: true, allowDelete: true, allowExport: true, readScope: 'org', writeScope: 'org' } as const;
const readOrg = { allowRead: true, allowCreate: false, allowEdit: false, allowDelete: false, allowExport: true, readScope: 'org' } as const;
const editOrg = { allowRead: true, allowCreate: true, allowEdit: true, allowDelete: false, allowExport: true, readScope: 'org', writeScope: 'org' } as const;

const PLATFORM_READ = {
  sys_business_unit: { allowRead: true, readScope: 'org' },
  sys_user: { allowRead: true, readScope: 'org' },
} as const;

/** 全部范围:系统管理员。 */
export const AdminPermissionSet = definePermissionSet({
  name: 'kpi_admin_set',
  label: 'KPI 系统管理员',
  objects: {
    kpi_indicator: full, kpi_indicator_step: full,
    kpi_plan: full, kpi_plan_step: full, kpi_plan_subject: full, kpi_plan_indicator: full, kpi_dispute: full,
    kpi_staff_assignment: full, kpi_personal_item: full,
    kpi_entry_sheet: full, kpi_entry_line: full, kpi_check_task: full, kpi_review_record: readOrg,
    kpi_bonus: full, kpi_adjustment: full, kpi_result: readOrg, kpi_snapshot: readOrg,
    sys_business_unit: { allowRead: true, allowCreate: true, allowEdit: true, readScope: 'org', writeScope: 'org' },
    sys_user: { allowRead: true, readScope: 'org' },
  },
});

/** 全部范围:人力审核 —— 指标库、方案、审核、调整审批、审计查询。 */
export const HrReviewerPermissionSet = definePermissionSet({
  name: 'kpi_hr_reviewer_set',
  label: 'KPI 人力审核',
  objects: {
    kpi_indicator: full, kpi_indicator_step: full,
    kpi_plan: full, kpi_plan_step: full, kpi_plan_subject: full, kpi_plan_indicator: full, kpi_dispute: editOrg,
    kpi_staff_assignment: full, kpi_personal_item: full,
    kpi_entry_sheet: editOrg, kpi_entry_line: editOrg, kpi_check_task: readOrg, kpi_review_record: readOrg,
    kpi_bonus: editOrg, kpi_adjustment: editOrg, kpi_result: readOrg, kpi_snapshot: readOrg,
    ...PLATFORM_READ,
  },
});

/** 全部范围:人力负责人 —— 审核审批、调整审批、审计查询(不维护指标与方案)。 */
export const HrHeadPermissionSet = definePermissionSet({
  name: 'kpi_hr_head_set',
  label: 'KPI 人力负责人',
  objects: {
    kpi_indicator: readOrg, kpi_indicator_step: readOrg,
    kpi_plan: readOrg, kpi_plan_step: readOrg, kpi_plan_subject: readOrg, kpi_plan_indicator: readOrg, kpi_dispute: readOrg,
    kpi_staff_assignment: readOrg, kpi_personal_item: readOrg,
    kpi_entry_sheet: { ...readOrg, allowEdit: true, writeScope: 'org' }, kpi_entry_line: readOrg, kpi_check_task: readOrg, kpi_review_record: readOrg,
    kpi_bonus: { ...readOrg, allowEdit: true, writeScope: 'org' }, kpi_adjustment: { ...readOrg, allowEdit: true, writeScope: 'org' },
    kpi_result: readOrg, kpi_snapshot: readOrg,
    ...PLATFORM_READ,
  },
});

/** 本部门范围:部门填报人员 —— 只见本部门填报单,可填报、提交、发起调整与加减分申请。 */
export const DeptReporterPermissionSet = definePermissionSet({
  name: 'kpi_dept_reporter_set',
  label: 'KPI 部门填报人员',
  objects: {
    kpi_indicator: readOrg, kpi_indicator_step: readOrg,
    kpi_plan: readOrg, kpi_plan_step: readOrg, kpi_plan_subject: readOrg, kpi_plan_indicator: readOrg,
    kpi_dispute: { allowRead: true, allowCreate: true, allowEdit: false, allowDelete: false, readScope: 'org', writeScope: 'own' },
    kpi_staff_assignment: { allowRead: true, readScope: 'org' }, kpi_personal_item: { allowRead: true, readScope: 'org' },
    // 填报单 OWD 为 private:本部门可见性由方案发布时写入的动态共享规则(services/sharing-service.ts)从 own 放宽到本单元
    kpi_entry_sheet: { allowRead: true, allowCreate: false, allowEdit: true, allowDelete: false, allowExport: true, readScope: 'own', writeScope: 'own' },
    kpi_entry_line: { allowRead: true, allowCreate: true, allowEdit: true, allowDelete: true, allowExport: true, readScope: 'own', writeScope: 'own' },
    kpi_check_task: { allowRead: true, readScope: 'own' },
    kpi_review_record: { allowRead: true, readScope: 'org' },
    kpi_bonus: { allowRead: true, allowCreate: true, allowEdit: true, allowDelete: false, readScope: 'own', writeScope: 'own' },
    kpi_adjustment: { allowRead: true, allowCreate: true, allowEdit: true, allowDelete: false, readScope: 'own', writeScope: 'own' },
    kpi_result: { allowRead: true, readScope: 'own' }, kpi_snapshot: { allowRead: true, readScope: 'org' },
    ...PLATFORM_READ,
  },
  fields: {
    'kpi_entry_line.adjusted_score': { readable: true, editable: false },
    'kpi_entry_line.score': { readable: true, editable: false },
  },
  // 到人结果只看本人(行级安全只收窄)
  rowLevelSecurity: [
    { name: 'kpi_result_own_person', object: 'kpi_result', operation: 'select', using: 'person == current_user.id', positions: ['kpi_dept_reporter'], enabled: true },
  ],
});

/** 本分公司范围:分公司核对人员 —— 核对任务只见本分公司,可读需核对的填报单。 */
export const BranchCheckerPermissionSet = definePermissionSet({
  name: 'kpi_branch_checker_set',
  label: 'KPI 分公司核对人员',
  objects: {
    kpi_indicator: readOrg, kpi_plan: readOrg, kpi_plan_subject: readOrg, kpi_plan_indicator: readOrg,
    kpi_dispute: { allowRead: true, allowCreate: true, allowEdit: false, allowDelete: false, readScope: 'org', writeScope: 'own' },
    kpi_entry_sheet: { allowRead: true, allowExport: true, readScope: 'org' },
    kpi_entry_line: { allowRead: true, allowExport: true, readScope: 'org' },
    // 核对任务 OWD 为 private:本分公司可见性由方案发布时写入的动态共享规则放宽
    kpi_check_task: { allowRead: true, allowCreate: false, allowEdit: true, allowDelete: false, readScope: 'own', writeScope: 'own' },
    kpi_review_record: { allowRead: true, readScope: 'org' },
    kpi_result: { allowRead: true, readScope: 'own' }, kpi_snapshot: { allowRead: true, readScope: 'org' },
    ...PLATFORM_READ,
  },
});

/** 分管范围:分管领导 —— 所分管主体的填报单与结果查看、最终审批。 */
export const ExecLeaderPermissionSet = definePermissionSet({
  name: 'kpi_exec_leader_set',
  label: 'KPI 分管领导',
  objects: {
    kpi_indicator: readOrg, kpi_plan: readOrg, kpi_plan_subject: readOrg, kpi_plan_indicator: readOrg,
    // 「分管范围」= 方案「参与主体」上配置的分管领导,由 services/sharing-service.ts 在方案发布时
    // 写成共享规则(记录级放宽),不依赖企业版 hierarchy-security 的 unit / unit_and_below 深度。
    // 因此这里一律声明最窄的 own:能看到什么完全由记录共享决定,组织变化零元数据改动。
    kpi_entry_sheet: { allowRead: true, allowEdit: true, allowExport: true, readScope: 'own', writeScope: 'own' },
    kpi_entry_line: { allowRead: true, allowExport: true, readScope: 'own' },
    kpi_check_task: { allowRead: true, readScope: 'own' },
    kpi_review_record: { allowRead: true, readScope: 'org' },
    kpi_bonus: { allowRead: true, readScope: 'own' },
    kpi_adjustment: { allowRead: true, readScope: 'own' },
    kpi_result: { allowRead: true, allowExport: true, readScope: 'own' },
    kpi_snapshot: { allowRead: true, readScope: 'own' },
    ...PLATFORM_READ,
  },
});

export const allPositions = [AdminPosition, HrReviewerPosition, HrHeadPosition, DeptReporterPosition, BranchCheckerPosition, ExecLeaderPosition];
export const allPermissionSets = [AdminPermissionSet, HrReviewerPermissionSet, HrHeadPermissionSet, DeptReporterPermissionSet, BranchCheckerPermissionSet, ExecLeaderPermissionSet];
