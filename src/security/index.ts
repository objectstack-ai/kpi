import { definePosition } from '@objectstack/spec/identity';
import { definePermissionSet } from '@objectstack/spec/security';

/** 岗位(扁平分发,ADR-0090 D3);上下级关系由平台组织单元树承载。 */
export const AdminPosition = definePosition({ name: 'kpi_admin', label: '考核系统管理员', description: '系统配置、用户/岗位/组织维护,可访问全部功能与数据。' });
export const HrReviewerPosition = definePosition({ name: 'kpi_hr_reviewer', label: '人力审核', description: '指标与方案维护、考核审核、数据调整审批、审计查询。' });
export const HrHeadPosition = definePosition({ name: 'kpi_hr_head', label: '人力负责人', description: '考核审核审批、数据调整审批、审计查询。' });
export const DeptReporterPosition = definePosition({ name: 'kpi_dept_reporter', label: '部门填报人员', description: '本部门数据的填报与提交,发起数据调整申请。' });
export const BranchCheckerPosition = definePosition({ name: 'kpi_branch_checker', label: '分公司核对人员', description: '本分公司相关数据的核对与确认。' });
export const ExecLeaderPosition = definePosition({ name: 'kpi_exec_leader', label: '分管领导', description: '分管范围内结果查看与最终审批。' });

/**
 * 「能进配置类菜单」的能力标记(方案版本 / 指标下达 / 参与主体 / 到人分工 / 指标争议 /
 * 指标库 / 流程进度)。
 *
 * 导航裁剪走 `requiredPermissions` 这条**服务端**闸门:不持有本能力的账号,这些菜单项在
 * `/meta` 里就被剥掉,不下发到浏览器。它只管入口,数据边界仍在对象 OWD + 共享规则 +
 * `readScope` 那三层。
 */
export const PLAN_CONFIG_CAPABILITY = 'kpi_plan_config';

const full = { allowRead: true, allowCreate: true, allowEdit: true, allowDelete: true, allowExport: true, readScope: 'org', writeScope: 'org' } as const;
const readOrg = { allowRead: true, allowCreate: false, allowEdit: false, allowDelete: false, allowExport: true, readScope: 'org' } as const;
/**
 * 只读 + 本人拥有或被共享(各部门目标值与权重互相保密,维护者 2026-09-03 拍板)。
 *
 * 「看得到什么」完全由方案发布时写入的动态共享规则决定(services/sharing-service.ts),
 * 权限集这一侧一律声明最窄的 `own` —— 组织调整、换分管领导、增删参与主体都不需要改元数据。
 * 前提是对象的 OWD 必须是 `private`:平台把 `controlled_by_parent` 与 `public_read` 都归入
 * 「读不过滤」,`readScope` 在那两种 OWD 下不起作用(plugin-sharing `buildReadFilter`)。
 */
const readOwn = { allowRead: true, allowCreate: false, allowEdit: false, allowDelete: false, allowExport: true, readScope: 'own' } as const;

/**
 * 个人承接项(到人分工的主从子记录)的读授权。
 *
 * 声明它是**必需**的,不是补充:主从子表随主记录收窄靠的是 OWD `controlled_by_parent`,
 * 那只解决「哪些行」;能不能读这张表本身仍要权限集给出 CRUD 位。三个受限岗位拿到
 * `kpi_staff_assignment: readOwn` 之后若不同时授予本项,「到人分工」详情页展开子表会
 * 直接 403 —— 用户看到的是一个报错的页面,不是一张空表。
 *
 * 范围与主记录一致、不放宽到全量:`readScope` 写最窄的 `own`,行的可见性由主记录的
 * 共享规则决定(平台对 `controlled_by_parent` 的读判定见 `objects/plan.object.ts` 的说明)。
 */
const readOwnChild = readOwn;
const editOrg = { allowRead: true, allowCreate: true, allowEdit: true, allowDelete: false, allowExport: true, readScope: 'org', writeScope: 'org' } as const;

const PLATFORM_READ = {
  sys_business_unit: { allowRead: true, readScope: 'org' },
  sys_user: { allowRead: true, readScope: 'org' },
} as const;

/** 全部范围:系统管理员。 */
export const AdminPermissionSet = definePermissionSet({
  name: 'kpi_admin_set',
  systemPermissions: [PLAN_CONFIG_CAPABILITY],
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
  systemPermissions: [PLAN_CONFIG_CAPABILITY],
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
  systemPermissions: [PLAN_CONFIG_CAPABILITY],
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
    kpi_plan: readOrg, kpi_plan_step: readOrg,
    // 参与主体 / 指标下达 / 到人分工:只见本部门(共享规则放宽),各部门目标值互相保密。
    kpi_plan_subject: readOwn, kpi_plan_indicator: readOwn,
    kpi_dispute: { allowRead: true, allowCreate: true, allowEdit: false, allowDelete: false, readScope: 'org', writeScope: 'own' },
    kpi_staff_assignment: readOwn, kpi_personal_item: { allowRead: true, readScope: 'org' },
    // 填报单 OWD 为 private:本部门可见性由方案发布时写入的动态共享规则(services/sharing-service.ts)从 own 放宽到本单元
    kpi_entry_sheet: { allowRead: true, allowCreate: false, allowEdit: true, allowDelete: false, allowExport: true, readScope: 'own', writeScope: 'own' },
    kpi_entry_line: { allowRead: true, allowCreate: true, allowEdit: true, allowDelete: true, allowExport: true, readScope: 'own', writeScope: 'own' },
    kpi_check_task: { allowRead: true, readScope: 'own' },
    // 审核记录:只见本部门填报单的留痕(共享规则按填报单放宽)。
    kpi_review_record: readOwn,
    // 登记加减分 = 人力审核岗位(《设计方案》V1.0 第 10 章第 6 项);声明与执行一致:
    // 业务规则已只允许人力审核登记,这里就不再声明新建权限,按钮层面即不可用。
    kpi_bonus: { allowRead: true, allowCreate: false, allowEdit: true, allowDelete: false, readScope: 'own', writeScope: 'own' },
    kpi_adjustment: { allowRead: true, allowCreate: true, allowEdit: true, allowDelete: false, readScope: 'own', writeScope: 'own' },
    kpi_result: { allowRead: true, readScope: 'own' }, kpi_snapshot: readOwn,
    ...PLATFORM_READ,
  },
  fields: {
    'kpi_entry_line.adjusted_score': { readable: true, editable: false },
    'kpi_entry_line.score': { readable: true, editable: false },
  },
  // 到人结果只看本人(行级安全只收窄)。
  // 谓词必须把「到人」维度和其它维度分开:`person == current_user.id` 一条会把部门 / 分公司
  // 维度的行一并挡掉 —— 那些行 person 为空,填报人员于是连本部门的结果都看不到。
  // 共享才是外层闸门(结果对象 OWD 为 private,只有本单元的结果行被共享规则放行),
  // 行级安全只在其上再收窄一层:非到人维度照常,到人维度只留本人。
  rowLevelSecurity: [
    { name: 'kpi_result_own_person', object: 'kpi_result', operation: 'select', using: "dimension != 'person' || person == current_user.id", positions: ['kpi_dept_reporter'], enabled: true },
  ],
});

/** 本分公司范围:分公司核对人员 —— 核对任务只见本分公司,可读需核对的填报单。 */
export const BranchCheckerPermissionSet = definePermissionSet({
  name: 'kpi_branch_checker_set',
  label: 'KPI 分公司核对人员',
  objects: {
    // 指标库是公共口径(指标定义与计分规则),不过滤;参与主体 / 指标下达只见本分公司相关。
    kpi_indicator: readOrg, kpi_plan: readOrg, kpi_plan_subject: readOwn, kpi_plan_indicator: readOwn,
    kpi_dispute: { allowRead: true, allowCreate: true, allowEdit: false, allowDelete: false, readScope: 'org', writeScope: 'own' },
    kpi_entry_sheet: { allowRead: true, allowExport: true, readScope: 'org' },
    kpi_entry_line: { allowRead: true, allowExport: true, readScope: 'org' },
    // 核对任务 OWD 为 private:本分公司可见性由方案发布时写入的动态共享规则放宽
    kpi_check_task: { allowRead: true, allowCreate: false, allowEdit: true, allowDelete: false, readScope: 'own', writeScope: 'own' },
    kpi_staff_assignment: readOwn, kpi_personal_item: readOwnChild,
    kpi_review_record: readOwn,
    kpi_result: { allowRead: true, readScope: 'own' }, kpi_snapshot: readOwn,
    ...PLATFORM_READ,
  },
});

/** 分管范围:分管领导 —— 所分管主体的填报单与结果查看、最终审批。 */
export const ExecLeaderPermissionSet = definePermissionSet({
  name: 'kpi_exec_leader_set',
  systemPermissions: [PLAN_CONFIG_CAPABILITY],
  label: 'KPI 分管领导',
  objects: {
    // 指标库公共口径不过滤;参与主体 / 指标下达 / 到人分工只见所分管的主体。
    kpi_indicator: readOrg, kpi_plan: readOrg, kpi_plan_subject: readOwn, kpi_plan_indicator: readOwn,
    kpi_staff_assignment: readOwn, kpi_personal_item: readOwnChild,
    // 「分管范围」= 方案「参与主体」上配置的分管领导,由 services/sharing-service.ts 在方案发布时
    // 写成共享规则(记录级放宽),不依赖企业版 hierarchy-security 的 unit / unit_and_below 深度。
    // 因此这里一律声明最窄的 own:能看到什么完全由记录共享决定,组织变化零元数据改动。
    kpi_entry_sheet: { allowRead: true, allowEdit: true, allowExport: true, readScope: 'own', writeScope: 'own' },
    kpi_entry_line: { allowRead: true, allowExport: true, readScope: 'own' },
    kpi_check_task: { allowRead: true, readScope: 'own' },
    kpi_review_record: readOwn,
    kpi_bonus: { allowRead: true, readScope: 'own' },
    kpi_adjustment: { allowRead: true, readScope: 'own' },
    kpi_result: { allowRead: true, allowExport: true, readScope: 'own' },
    kpi_snapshot: readOwn,
    ...PLATFORM_READ,
  },
});

export const allPositions = [AdminPosition, HrReviewerPosition, HrHeadPosition, DeptReporterPosition, BranchCheckerPosition, ExecLeaderPosition];
export const allPermissionSets = [AdminPermissionSet, HrReviewerPermissionSet, HrHeadPermissionSet, DeptReporterPermissionSet, BranchCheckerPermissionSet, ExecLeaderPermissionSet];
