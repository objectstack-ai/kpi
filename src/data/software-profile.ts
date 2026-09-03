import { defineSeed, SeedSchema } from '@objectstack/spec/data';
import { Indicator, IndicatorStep } from '../objects/indicator.object.js';
import { Plan, PlanIndicator, PlanStep, PlanSubject } from '../objects/plan.object.js';

/**
 * 「软件公司」演示种子档案 —— 独立档案,**不替换**默认演示种子。
 *
 * 启用:`OS_SEED_PROFILE=software`(见 `src/data/index.ts` 的选档逻辑)。不设该变量时
 * 加载的仍是默认档案,操作手册的截图依赖它,一字不改。
 *
 * 覆盖面(本档案自证):
 * - 组织树:总公司 + 8 个业务部门 + 3 家销售型分公司,编码唯一、上级存在;
 * - 指标库:24 项(每部门 3 项),四种计分方式、两种指标方向、三种数据来源全覆盖,
 *   阶梯指标带完整区间表,公式指标只用 actual / target / weight;
 * - 方案:2026 年第 3 季度考核(四节点默认流程),11 个参与主体、36 条指标下达,
 *   每个主体的指标权重合计 100,主体权重合计 100。
 *
 * 用户不可种子(CLAUDE.md D4):岗位账号、流程岗位分配、到人分工、个人承接项、分管领导
 * 由运行期脚本 `scripts/software-people.mjs` 创建,不进本文件。
 */

const DEV = ['dev', 'test'] as const;

/** 本档案的考核方案名 —— 指标下达/流程节点/参与主体都按名字引用它。 */
export const SOFTWARE_PLAN_NAME = '2026 年第 3 季度考核';

const orgUnits = SeedSchema.parse({
  object: 'sys_business_unit',
  mode: 'upsert',
  externalId: 'id',
  env: [...DEV],
  records: [
    { id: 'bu_sw_hq', name: '软件总公司', code: 'SW-HQ', kind: 'company', active: true },
    { id: 'bu_sw_rd', name: '研发部', code: 'SW-RD', kind: 'department', parent_business_unit_id: 'bu_sw_hq', active: true },
    { id: 'bu_sw_pd', name: '产品部', code: 'SW-PD', kind: 'department', parent_business_unit_id: 'bu_sw_hq', active: true },
    { id: 'bu_sw_qa', name: '测试部', code: 'SW-QA', kind: 'department', parent_business_unit_id: 'bu_sw_hq', active: true },
    { id: 'bu_sw_sales', name: '销售部', code: 'SW-SALES', kind: 'department', parent_business_unit_id: 'bu_sw_hq', active: true },
    { id: 'bu_sw_mkt', name: '市场部', code: 'SW-MKT', kind: 'department', parent_business_unit_id: 'bu_sw_hq', active: true },
    { id: 'bu_sw_cs', name: '客户成功部', code: 'SW-CS', kind: 'department', parent_business_unit_id: 'bu_sw_hq', active: true },
    { id: 'bu_sw_hr', name: '人力行政部', code: 'SW-HR', kind: 'department', parent_business_unit_id: 'bu_sw_hq', active: true },
    { id: 'bu_sw_fin', name: '财务部', code: 'SW-FIN', kind: 'department', parent_business_unit_id: 'bu_sw_hq', active: true },
    { id: 'bu_sw_east', name: '华东分公司', code: 'SW-BR-EAST', kind: 'division', parent_business_unit_id: 'bu_sw_hq', active: true },
    { id: 'bu_sw_south', name: '华南分公司', code: 'SW-BR-SOUTH', kind: 'division', parent_business_unit_id: 'bu_sw_hq', active: true },
    { id: 'bu_sw_north', name: '华北分公司', code: 'SW-BR-NORTH', kind: 'division', parent_business_unit_id: 'bu_sw_hq', active: true },
  ],
});

/**
 * 指标库 —— 每项都显式给出计量单位与数值小数位(数字四件套里数据侧能给的两项;
 * 最小值/最大值由 `kpi_indicator` 的字段定义显式声明,种子不覆盖平台默认)。
 */
const indicators = defineSeed(Indicator, {
  mode: 'upsert',
  externalId: 'code',
  env: [...DEV],
  records: [
    // ── 研发部 ────────────────────────────────────────────────────────────
    { code: 'SWRD01', name: '版本按期交付率', category: 'business', owner_unit: 'bu_sw_rd', data_source: 'system', unit: '%', value_scale: 2, direction: 'positive', scoring_method: 'linear', cap_rate: 110, floor_rate: 0, status: 'active', description: '按期交付版本数 ÷ 计划交付版本数;完成率封顶 110%。' },
    { code: 'SWRD02', name: '线上严重故障数', category: 'compliance', owner_unit: 'bu_sw_rd', data_source: 'manual', unit: '次', value_scale: 0, direction: 'negative', scoring_method: 'formula', cap_rate: 100, floor_rate: 0, score_formula: 'actual == 0.0 ? weight : (actual <= 2.0 ? weight * 0.5 : 0.0)', status: 'active', description: '零故障得满分,1~2 次得一半,3 次及以上不得分。' },
    { code: 'SWRD03', name: '需求交付周期', category: 'management', owner_unit: 'bu_sw_rd', data_source: 'system', unit: '天', value_scale: 1, direction: 'negative', scoring_method: 'linear', cap_rate: 120, floor_rate: 0, status: 'active', description: '需求从受理到上线的平均自然日;越短越好,按 目标 ÷ 实际 计算完成率。' },
    // ── 产品部 ────────────────────────────────────────────────────────────
    { code: 'SWPD01', name: '需求评审通过率', category: 'management', owner_unit: 'bu_sw_pd', data_source: 'manual', unit: '%', value_scale: 2, direction: 'positive', scoring_method: 'linear', cap_rate: 110, floor_rate: 0, status: 'active', description: '一次评审通过的需求数 ÷ 提交评审的需求数。' },
    { code: 'SWPD02', name: '新功能采纳率', category: 'business', owner_unit: 'bu_sw_pd', data_source: 'import', unit: '%', value_scale: 2, direction: 'positive', scoring_method: 'range', cap_rate: 120, floor_rate: 0, range_lower_rate: 60, range_upper_rate: 120, status: 'active', description: '上线 30 天内使用过新功能的客户数 ÷ 活跃客户数;完成率 60% 以下不得分,100% 得满分,120% 封顶。' },
    { code: 'SWPD03', name: '需求文档准时率', category: 'management', owner_unit: 'bu_sw_pd', data_source: 'system', unit: '%', value_scale: 2, direction: 'positive', scoring_method: 'linear', cap_rate: 100, floor_rate: 0, status: 'active', description: '按约定日期交付的需求文档数 ÷ 应交付数。' },
    // ── 测试部 ────────────────────────────────────────────────────────────
    { code: 'SWQA01', name: '缺陷逃逸率', category: 'service', owner_unit: 'bu_sw_qa', data_source: 'manual', unit: '%', value_scale: 2, direction: 'negative', scoring_method: 'linear', cap_rate: 120, floor_rate: 0, status: 'active', description: '上线后发现的缺陷数 ÷ 总缺陷数;越低越好。' },
    { code: 'SWQA02', name: '自动化测试覆盖率', category: 'management', owner_unit: 'bu_sw_qa', data_source: 'system', unit: '%', value_scale: 2, direction: 'positive', scoring_method: 'step', cap_rate: 100, floor_rate: 0, status: 'active', description: '自动化用例覆盖的功能点 ÷ 全部功能点,阶梯计分。' },
    { code: 'SWQA03', name: '用例执行完成率', category: 'management', owner_unit: 'bu_sw_qa', data_source: 'system', unit: '%', value_scale: 2, direction: 'positive', scoring_method: 'linear', cap_rate: 100, floor_rate: 0, status: 'active', description: '已执行用例数 ÷ 计划用例数。' },
    // ── 销售部 ────────────────────────────────────────────────────────────
    { code: 'SWSL01', name: '签约金额完成率', category: 'business', owner_unit: 'bu_sw_sales', data_source: 'manual', unit: '万元', value_scale: 2, direction: 'positive', scoring_method: 'linear', cap_rate: 120, floor_rate: 0, status: 'active', description: '当期签约合同金额 ÷ 目标金额;完成率封顶 120%。' },
    { code: 'SWSL02', name: '回款率', category: 'business', owner_unit: 'bu_sw_sales', data_source: 'import', unit: '%', value_scale: 2, direction: 'positive', scoring_method: 'range', cap_rate: 120, floor_rate: 0, range_lower_rate: 60, range_upper_rate: 120, status: 'active', description: '当期回款金额 ÷ 应回款金额;完成率 60% 以下不得分,100% 得满分,120% 封顶。' },
    { code: 'SWSL03', name: '新签客户数', category: 'business', owner_unit: 'bu_sw_sales', data_source: 'manual', unit: '家', value_scale: 0, direction: 'positive', scoring_method: 'linear', cap_rate: 120, floor_rate: 0, status: 'active', description: '当期首次签约的客户家数。' },
    // ── 市场部 ────────────────────────────────────────────────────────────
    { code: 'SWMK01', name: '有效线索数', category: 'business', owner_unit: 'bu_sw_mkt', data_source: 'import', unit: '条', value_scale: 0, direction: 'positive', scoring_method: 'linear', cap_rate: 120, floor_rate: 0, status: 'active', description: '经销售确认为有效的市场线索条数。' },
    { code: 'SWMK02', name: '获客成本', category: 'management', owner_unit: 'bu_sw_mkt', data_source: 'import', unit: '元', value_scale: 2, direction: 'negative', scoring_method: 'linear', cap_rate: 120, floor_rate: 0, status: 'active', description: '市场费用 ÷ 新增客户数;越低越好。' },
    { code: 'SWMK03', name: '市场活动完成率', category: 'management', owner_unit: 'bu_sw_mkt', data_source: 'manual', unit: '%', value_scale: 2, direction: 'positive', scoring_method: 'linear', cap_rate: 100, floor_rate: 0, status: 'active', description: '已举办市场活动场次 ÷ 计划场次。' },
    // ── 客户成功部 ────────────────────────────────────────────────────────
    { code: 'SWCS01', name: '客户续费率', category: 'business', owner_unit: 'bu_sw_cs', data_source: 'import', unit: '%', value_scale: 2, direction: 'positive', scoring_method: 'range', cap_rate: 115, floor_rate: 0, range_lower_rate: 70, range_upper_rate: 115, status: 'active', description: '到期客户中完成续费的比例;完成率 70% 以下不得分,100% 得满分,115% 封顶。' },
    { code: 'SWCS02', name: '客户满意度', category: 'service', owner_unit: 'bu_sw_cs', data_source: 'import', unit: '分', value_scale: 1, direction: 'positive', scoring_method: 'step', cap_rate: 100, floor_rate: 0, status: 'active', description: '季度客户满意度调查得分,阶梯计分。' },
    { code: 'SWCS03', name: '工单响应及时率', category: 'service', owner_unit: 'bu_sw_cs', data_source: 'system', unit: '%', value_scale: 2, direction: 'positive', scoring_method: 'linear', cap_rate: 100, floor_rate: 0, status: 'active', description: '在承诺时限内首次响应的工单数 ÷ 工单总数。' },
    // ── 人力行政部 ────────────────────────────────────────────────────────
    { code: 'SWHR01', name: '关键岗位招聘完成率', category: 'management', owner_unit: 'bu_sw_hr', data_source: 'manual', unit: '%', value_scale: 2, direction: 'positive', scoring_method: 'linear', cap_rate: 110, floor_rate: 0, status: 'active', description: '关键岗位到岗人数 ÷ 计划招聘人数。' },
    { code: 'SWHR02', name: '关键人员离职率', category: 'management', owner_unit: 'bu_sw_hr', data_source: 'system', unit: '%', value_scale: 2, direction: 'negative', scoring_method: 'linear', cap_rate: 120, floor_rate: 0, status: 'active', description: '当期关键人员离职人数 ÷ 期初关键人员人数;越低越好。' },
    { code: 'SWHR03', name: '培训计划完成率', category: 'management', owner_unit: 'bu_sw_hr', data_source: 'system', unit: '%', value_scale: 2, direction: 'positive', scoring_method: 'step', cap_rate: 100, floor_rate: 0, status: 'active', description: '已完成培训课时 ÷ 计划课时,阶梯计分。' },
    // ── 财务部 ────────────────────────────────────────────────────────────
    { code: 'SWFI01', name: '费用预算偏差率', category: 'management', owner_unit: 'bu_sw_fin', data_source: 'manual', unit: '%', value_scale: 2, direction: 'negative', scoring_method: 'linear', cap_rate: 110, floor_rate: 0, status: 'active', description: '实际费用与预算的偏差绝对值 ÷ 预算;越低越好。' },
    { code: 'SWFI02', name: '报表准时率', category: 'management', owner_unit: 'bu_sw_fin', data_source: 'system', unit: '%', value_scale: 2, direction: 'positive', scoring_method: 'linear', cap_rate: 100, floor_rate: 0, status: 'active', description: '按期出具的报表份数 ÷ 应出具份数。' },
    { code: 'SWFI03', name: '应收账款周转天数', category: 'business', owner_unit: 'bu_sw_fin', data_source: 'system', unit: '天', value_scale: 1, direction: 'negative', scoring_method: 'linear', cap_rate: 120, floor_rate: 0, status: 'active', description: '平均应收账款 ÷ 当期收入 × 天数;越短越好。' },
  ],
});

/** 阶梯区间:三项阶梯指标各带完整区间表(首段从 0 起、末段无上限,不留缝)。 */
const indicatorSteps = defineSeed(IndicatorStep, {
  mode: 'upsert',
  externalId: ['indicator', 'seq'],
  env: [...DEV],
  records: [
    { indicator: 'SWQA02', seq: 1, label: '未达标', min_rate: 0, max_rate: 80, score_rate: 0 },
    { indicator: 'SWQA02', seq: 2, label: '基本达标', min_rate: 80, max_rate: 95, score_rate: 60 },
    { indicator: 'SWQA02', seq: 3, label: '达标', min_rate: 95, max_rate: 100, score_rate: 90 },
    { indicator: 'SWQA02', seq: 4, label: '优秀', min_rate: 100, max_rate: null, score_rate: 100 },
    { indicator: 'SWCS02', seq: 1, label: '未达标', min_rate: 0, max_rate: 80, score_rate: 0 },
    { indicator: 'SWCS02', seq: 2, label: '基本达标', min_rate: 80, max_rate: 95, score_rate: 60 },
    { indicator: 'SWCS02', seq: 3, label: '达标', min_rate: 95, max_rate: 100, score_rate: 90 },
    { indicator: 'SWCS02', seq: 4, label: '优秀', min_rate: 100, max_rate: null, score_rate: 100 },
    { indicator: 'SWHR03', seq: 1, label: '未达标', min_rate: 0, max_rate: 90, score_rate: 0 },
    { indicator: 'SWHR03', seq: 2, label: '达标', min_rate: 90, max_rate: 100, score_rate: 80 },
    { indicator: 'SWHR03', seq: 3, label: '优秀', min_rate: 100, max_rate: null, score_rate: 100 },
  ],
});

const plans = defineSeed(Plan, {
  mode: 'upsert',
  externalId: 'name',
  env: [...DEV],
  records: [
    {
      name: SOFTWARE_PLAN_NAME,
      period_type: 'quarter',
      year: 2026,
      period_no: 3,
      period_start: '2026-07-01',
      period_end: '2026-09-30',
      version_no: 1,
      status: 'draft',
      description: '软件公司演示档案:8 个业务部门 + 3 家销售型分公司,发布后生成 11 张填报单。',
    },
  ],
});

const planSteps = defineSeed(PlanStep, {
  mode: 'upsert',
  externalId: ['plan', 'seq'],
  env: [...DEV],
  records: [
    { plan: SOFTWARE_PLAN_NAME, seq: 1, step_type: 'dept_submit', label: '部门填报', approver_position: 'kpi_dept_reporter' },
    { plan: SOFTWARE_PLAN_NAME, seq: 2, step_type: 'branch_check', label: '分公司核对', approver_position: 'kpi_branch_checker' },
    { plan: SOFTWARE_PLAN_NAME, seq: 3, step_type: 'hr_review', label: '人力审核', approver_position: 'kpi_hr_reviewer' },
    { plan: SOFTWARE_PLAN_NAME, seq: 4, step_type: 'leader_approve', label: '领导审批', approver_position: 'kpi_exec_leader' },
  ],
});

/** 参与主体:8 个部门 + 3 家分公司,主体权重合计 100;分公司的出指标方为销售部。 */
const planSubjects = defineSeed(PlanSubject, {
  mode: 'upsert',
  externalId: ['plan', 'subject'],
  env: [...DEV],
  records: [
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_rd', subject_type: 'department', assessor_unit: 'bu_sw_hr', subject_weight: 12 },
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_pd', subject_type: 'department', assessor_unit: 'bu_sw_hr', subject_weight: 8 },
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_qa', subject_type: 'department', assessor_unit: 'bu_sw_hr', subject_weight: 8 },
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_sales', subject_type: 'department', assessor_unit: 'bu_sw_hr', subject_weight: 14 },
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_mkt', subject_type: 'department', assessor_unit: 'bu_sw_hr', subject_weight: 8 },
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_cs', subject_type: 'department', assessor_unit: 'bu_sw_hr', subject_weight: 10 },
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_hr', subject_type: 'department', assessor_unit: 'bu_sw_hr', subject_weight: 6 },
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_fin', subject_type: 'department', assessor_unit: 'bu_sw_hr', subject_weight: 6 },
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_east', subject_type: 'branch', assessor_unit: 'bu_sw_sales', subject_weight: 12 },
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_south', subject_type: 'branch', assessor_unit: 'bu_sw_sales', subject_weight: 9 },
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_north', subject_type: 'branch', assessor_unit: 'bu_sw_sales', subject_weight: 7 },
  ],
});

/** 分公司(销售型)统一承接销售 / 客户成功 / 市场口径的四项指标,权重合计 100。 */
const branchTargets: Record<string, Record<string, number>> = {
  bu_sw_east: { SWSL01: 1600, SWSL02: 90, SWCS01: 92, SWMK01: 500 },
  bu_sw_south: { SWSL01: 1200, SWSL02: 88, SWCS01: 90, SWMK01: 400 },
  bu_sw_north: { SWSL01: 900, SWSL02: 85, SWCS01: 90, SWMK01: 300 },
};
const branchWeights: Record<string, number> = { SWSL01: 40, SWSL02: 30, SWCS01: 20, SWMK01: 10 };

const planIndicators = defineSeed(PlanIndicator, {
  mode: 'upsert',
  externalId: ['plan', 'subject', 'indicator'],
  env: [...DEV],
  records: [
    // 研发部
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_rd', indicator: 'SWRD01', weight: 50, target_value: 95 },
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_rd', indicator: 'SWRD02', weight: 20, target_value: 0 },
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_rd', indicator: 'SWRD03', weight: 30, target_value: 15 },
    // 产品部
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_pd', indicator: 'SWPD01', weight: 40, target_value: 90 },
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_pd', indicator: 'SWPD02', weight: 35, target_value: 60 },
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_pd', indicator: 'SWPD03', weight: 25, target_value: 95 },
    // 测试部
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_qa', indicator: 'SWQA01', weight: 35, target_value: 2 },
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_qa', indicator: 'SWQA02', weight: 40, target_value: 70 },
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_qa', indicator: 'SWQA03', weight: 25, target_value: 98 },
    // 销售部
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_sales', indicator: 'SWSL01', weight: 50, target_value: 4000 },
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_sales', indicator: 'SWSL02', weight: 30, target_value: 90 },
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_sales', indicator: 'SWSL03', weight: 20, target_value: 60 },
    // 市场部
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_mkt', indicator: 'SWMK01', weight: 45, target_value: 1500 },
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_mkt', indicator: 'SWMK02', weight: 30, target_value: 800 },
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_mkt', indicator: 'SWMK03', weight: 25, target_value: 100 },
    // 客户成功部
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_cs', indicator: 'SWCS01', weight: 40, target_value: 92 },
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_cs', indicator: 'SWCS02', weight: 35, target_value: 90 },
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_cs', indicator: 'SWCS03', weight: 25, target_value: 95 },
    // 人力行政部
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_hr', indicator: 'SWHR01', weight: 40, target_value: 100 },
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_hr', indicator: 'SWHR02', weight: 30, target_value: 8 },
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_hr', indicator: 'SWHR03', weight: 30, target_value: 100 },
    // 财务部
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_fin', indicator: 'SWFI01', weight: 35, target_value: 3 },
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_fin', indicator: 'SWFI02', weight: 35, target_value: 100 },
    { plan: SOFTWARE_PLAN_NAME, subject: 'bu_sw_fin', indicator: 'SWFI03', weight: 30, target_value: 60 },
    // 3 家分公司
    ...Object.entries(branchTargets).flatMap(([subject, targets]) =>
      Object.entries(targets).map(([indicator, target_value]) => ({
        plan: SOFTWARE_PLAN_NAME,
        subject,
        indicator,
        weight: branchWeights[indicator]!,
        target_value,
      })),
    ),
  ],
});

/**
 * 本档案写入的组织单元 id —— 从种子记录派生,进入 `align-demo-units.ts` 的夹具覆盖范围
 * (objectstack-ai/objectstack#14547 的临时夹具),否则按方案的共享规则对新单元静默失效。
 */
export const SOFTWARE_UNIT_IDS: readonly string[] = orgUnits.records.map((r) => String(r.id));

export const SoftwareSeedData = [orgUnits, indicators, indicatorSteps, plans, planSteps, planSubjects, planIndicators];
