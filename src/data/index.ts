import { defineSeed, SeedSchema } from '@objectstack/spec/data';
import { Indicator, IndicatorStep } from '../objects/indicator.object.js';
import { Plan, PlanIndicator, PlanStep, PlanSubject } from '../objects/plan.object.js';
import { SOFTWARE_UNIT_IDS, SoftwareSeedData } from './software-profile.js';

const DEV = ['dev', 'test'] as const;

/**
 * 演示组织树(平台 `sys_business_unit`):总公司 → 3 个业务部门 + 4 家分公司。
 * 真实项目在实施阶段用 impl-data 模板导入客户组织(14 家分公司),此处只做演示。
 * 用户不能种子(需注册),用户↔组织、岗位分配在 Setup 里由管理员完成。
 */
const orgUnits = SeedSchema.parse({
  object: 'sys_business_unit',
  mode: 'upsert',
  externalId: 'id',
  env: [...DEV],
  records: [
    { id: 'bu_hq', name: '总公司', code: 'HQ', kind: 'company', active: true },
    { id: 'bu_market', name: '市场部', code: 'HQ-MKT', kind: 'department', parent_business_unit_id: 'bu_hq', active: true },
    { id: 'bu_ops', name: '运营部', code: 'HQ-OPS', kind: 'department', parent_business_unit_id: 'bu_hq', active: true },
    { id: 'bu_hr', name: '人力资源部', code: 'HQ-HR', kind: 'department', parent_business_unit_id: 'bu_hq', active: true },
    { id: 'bu_east', name: '华东分公司', code: 'BR-EAST', kind: 'division', parent_business_unit_id: 'bu_hq', active: true },
    { id: 'bu_south', name: '华南分公司', code: 'BR-SOUTH', kind: 'division', parent_business_unit_id: 'bu_hq', active: true },
    { id: 'bu_north', name: '华北分公司', code: 'BR-NORTH', kind: 'division', parent_business_unit_id: 'bu_hq', active: true },
    { id: 'bu_west', name: '西部分公司', code: 'BR-WEST', kind: 'division', parent_business_unit_id: 'bu_hq', active: true },
  ],
});

const indicators = defineSeed(Indicator, {
  mode: 'upsert',
  externalId: 'code',
  env: [...DEV],
  records: [
    { code: 'REV', name: '营业收入完成率', category: 'business', owner_unit: 'bu_market', data_source: 'manual', unit: '万元', direction: 'positive', scoring_method: 'linear', cap_rate: 120, floor_rate: 0, status: 'active', description: '当期营业收入 ÷ 目标收入。' },
    { code: 'PROFIT', name: '利润完成率', category: 'business', owner_unit: 'bu_market', data_source: 'manual', unit: '万元', direction: 'positive', scoring_method: 'range', cap_rate: 120, floor_rate: 0, range_lower_rate: 60, range_upper_rate: 120, status: 'active', description: '完成率 60% 以下不得分,100% 得满分,120% 封顶。' },
    { code: 'COST', name: '成本费用率', category: 'management', owner_unit: 'bu_ops', data_source: 'manual', unit: '%', direction: 'negative', scoring_method: 'linear', cap_rate: 110, floor_rate: 0, status: 'active', description: '费用 ÷ 收入;越低越好,按 目标 ÷ 实际 计算完成率。' },
    { code: 'CSAT', name: '客户满意度', category: 'service', owner_unit: 'bu_ops', data_source: 'import', unit: '分', direction: 'positive', scoring_method: 'step', cap_rate: 100, floor_rate: 0, status: 'active', description: '季度满意度调查得分,阶梯计分。' },
    { code: 'SAFE', name: '安全事故次数', category: 'compliance', owner_unit: 'bu_hr', data_source: 'manual', unit: '次', direction: 'negative', scoring_method: 'formula', cap_rate: 100, floor_rate: 0, score_formula: 'actual == 0.0 ? weight : (actual <= 1.0 ? weight * 0.5 : 0.0)', status: 'active', description: '零事故满分,1 起减半,2 起及以上不得分。' },
    { code: 'TRAIN', name: '培训完成率', category: 'management', owner_unit: 'bu_hr', data_source: 'system', unit: '%', direction: 'positive', scoring_method: 'linear', cap_rate: 100, floor_rate: 0, status: 'active', description: '完成培训人次 ÷ 计划人次。' },
  ],
});

const indicatorSteps = defineSeed(IndicatorStep, {
  mode: 'upsert',
  externalId: ['indicator', 'seq'],
  env: [...DEV],
  records: [
    { indicator: 'CSAT', seq: 1, label: '未达标', min_rate: 0, max_rate: 80, score_rate: 0 },
    { indicator: 'CSAT', seq: 2, label: '基本达标', min_rate: 80, max_rate: 95, score_rate: 60 },
    { indicator: 'CSAT', seq: 3, label: '达标', min_rate: 95, max_rate: 100, score_rate: 90 },
    { indicator: 'CSAT', seq: 4, label: '优秀', min_rate: 100, max_rate: null, score_rate: 100 },
  ],
});

const plans = defineSeed(Plan, {
  mode: 'upsert',
  externalId: 'name',
  env: [...DEV],
  records: [
    { name: '2026 年 8 月 月度考核', period_type: 'month', year: 2026, period_no: 8, period_start: '2026-08-01', period_end: '2026-08-31', version_no: 1, status: 'draft', description: '演示方案:发布后为 5 个参与主体生成填报单。' },
  ],
});

const planSteps = defineSeed(PlanStep, {
  mode: 'upsert',
  externalId: ['plan', 'seq'],
  env: [...DEV],
  records: [
    { plan: '2026 年 8 月 月度考核', seq: 1, step_type: 'dept_submit', label: '部门填报', approver_position: 'kpi_dept_reporter' },
    { plan: '2026 年 8 月 月度考核', seq: 2, step_type: 'branch_check', label: '分公司核对', approver_position: 'kpi_branch_checker' },
    { plan: '2026 年 8 月 月度考核', seq: 3, step_type: 'hr_review', label: '人力审核', approver_position: 'kpi_hr_reviewer' },
    { plan: '2026 年 8 月 月度考核', seq: 4, step_type: 'leader_approve', label: '领导审批', approver_position: 'kpi_exec_leader' },
  ],
});

const planSubjects = defineSeed(PlanSubject, {
  mode: 'upsert',
  externalId: ['plan', 'subject'],
  env: [...DEV],
  records: [
    { plan: '2026 年 8 月 月度考核', subject: 'bu_market', subject_type: 'department', assessor_unit: 'bu_hr', subject_weight: 30 },
    { plan: '2026 年 8 月 月度考核', subject: 'bu_ops', subject_type: 'department', assessor_unit: 'bu_hr', subject_weight: 20 },
    { plan: '2026 年 8 月 月度考核', subject: 'bu_east', subject_type: 'branch', assessor_unit: 'bu_market', subject_weight: 20 },
    { plan: '2026 年 8 月 月度考核', subject: 'bu_south', subject_type: 'branch', assessor_unit: 'bu_market', subject_weight: 15 },
    { plan: '2026 年 8 月 月度考核', subject: 'bu_north', subject_type: 'branch', assessor_unit: 'bu_market', subject_weight: 15 },
  ],
});

const planIndicators = defineSeed(PlanIndicator, {
  mode: 'upsert',
  externalId: ['plan', 'subject', 'indicator'],
  env: [...DEV],
  records: [
    { plan: '2026 年 8 月 月度考核', subject: 'bu_market', indicator: 'REV', weight: 50, target_value: 1200 },
    { plan: '2026 年 8 月 月度考核', subject: 'bu_market', indicator: 'PROFIT', weight: 30, target_value: 180 },
    { plan: '2026 年 8 月 月度考核', subject: 'bu_market', indicator: 'CSAT', weight: 20, target_value: 90 },
    { plan: '2026 年 8 月 月度考核', subject: 'bu_ops', indicator: 'COST', weight: 50, target_value: 12 },
    { plan: '2026 年 8 月 月度考核', subject: 'bu_ops', indicator: 'CSAT', weight: 30, target_value: 90 },
    { plan: '2026 年 8 月 月度考核', subject: 'bu_ops', indicator: 'TRAIN', weight: 20, target_value: 100 },
    ...['bu_east', 'bu_south', 'bu_north'].flatMap((subject) => [
      { plan: '2026 年 8 月 月度考核', subject, indicator: 'REV', weight: 40, target_value: 400 },
      { plan: '2026 年 8 月 月度考核', subject, indicator: 'PROFIT', weight: 30, target_value: 60 },
      { plan: '2026 年 8 月 月度考核', subject, indicator: 'SAFE', weight: 15, target_value: 0 },
      { plan: '2026 年 8 月 月度考核', subject, indicator: 'TRAIN', weight: 15, target_value: 100 },
    ]),
  ],
});

/** 默认演示档案(操作手册的 62 张截图依赖它)—— 记录内容与 main 一致,不随档案切换而变。 */
const DefaultSeedData = [orgUnits, indicators, indicatorSteps, plans, planSteps, planSubjects, planIndicators];

/**
 * 种子档案选择 —— `OS_SEED_PROFILE=software` 加载「软件公司」档案,
 * 不设(或设为其他值)时加载默认演示档案,行为与未引入档案机制时逐字一致。
 */
export const SEED_PROFILE: string = (process.env.OS_SEED_PROFILE ?? 'default').trim().toLowerCase();

/**
 * 演示组织单元的 id 清单 —— 从各档案的种子记录派生,不另抄一份(抄一份就会漂)。
 * 只有这些 id 才是本应用的演示夹具;管理员在 Setup 里建的单元不在其中。
 *
 * 取**全部档案的并集**而不是当前档案:夹具按 `id IN (...)` 且 `organization_id IS NULL` 查,
 * 没加载的档案其单元根本不存在,查不出行、什么都不写;并集写法则免掉「切了档案忘了切夹具、
 * 新单元静默失去数据范围」这一类错。
 */
export const DEMO_UNIT_IDS: readonly string[] = [
  ...orgUnits.records.map((r) => String(r.id)),
  ...SOFTWARE_UNIT_IDS,
];

export const KpiSeedData = SEED_PROFILE === 'software' ? SoftwareSeedData : DefaultSeedData;
