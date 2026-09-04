import { defineStack } from '@objectstack/spec';
import * as objects from './src/objects/index.js';
import * as views from './src/views/index.js';
import * as actions from './src/actions/index.js';
import * as datasets from './src/datasets/index.js';
import * as dashboards from './src/dashboards/index.js';
import * as reports from './src/reports/index.js';
import * as pages from './src/pages/index.js';
import { KpiApp } from './src/apps/index.js';
import { allHooks } from './src/hooks/index.js';
import { scopeMaterializeHooks } from './src/services/scope-materialize.js';
import { allPermissionSets, allPositions } from './src/security/index.js';
import { registerKpiPositionBindings } from './src/security/bind-position-sets.js';
import { registerKpiAdminSetBinding } from './src/security/bind-admin-set.js';
import { KpiTranslationBundle } from './src/translations/index.js';
import { KpiSeedData } from './src/data/index.js';
import { registerDemoUnitAlignment } from './src/data/align-demo-units.js';
import { registerPlanLinkBackfill } from './src/data/backfill-plan-links.js';

/**
 * KPI 考核管理系统 — 基于 ObjectStack 的独立应用。
 * 设计依据:docs/02-总体方案蓝图.md;方案分级:docs/03-方案分级.md。
 */
export default defineStack({
  manifest: {
    id: 'com.objectstack.kpi',
    namespace: 'kpi',
    version: '0.1.0',
    type: 'app',
    name: 'KPI 考核管理',
    description: 'KPI assessment management: indicator library, plan versions, entry with instant scoring, parallel branch checks, configurable multi-step review, adjustments, four-dimension aggregation and immutable archives.',
    engines: { protocol: '^17' },
  },

  requires: ['ui', 'automation', 'sharing'],

  translations: [KpiTranslationBundle],
  i18n: { defaultLocale: 'zh-CN', supportedLocales: ['zh-CN', 'en'], fallbackLocale: 'zh-CN' },

  objects: Object.values(objects),

  apps: [KpiApp],
  views: Object.values(views),
  pages: Object.values(pages),
  actions: Object.values(actions),
  datasets: Object.values(datasets),
  dashboards: Object.values(dashboards),
  reports: Object.values(reports),

  // 数据范围补齐 hook 单独注册(见 services/scope-materialize.ts):它补的是平台对系统上下文
  // 写入跳过的共享物化,与 hooks/ 下的业务规则不是一类东西。
  hooks: [...allHooks, ...scopeMaterializeHooks],

  positions: allPositions,
  permissions: allPermissionSets,

  data: KpiSeedData,
});

/** 岗位↔权限集绑定在安全引导完成后幂等补齐(不能用种子,见 bind-position-sets.ts)。 */
export const onEnable = async (ctx: unknown): Promise<void> => {
  registerKpiPositionBindings(ctx as Parameters<typeof registerKpiPositionBindings>[0]);
  // 平台管理员即考核系统管理员(CLAUDE.md D4):菜单闸门按能力精确匹配、不认平台超级权限,
  // 这条隐含安排必须写成绑定行,否则管理员在 KPI 应用里看不到配置类菜单。
  registerKpiAdminSetBinding(ctx as Parameters<typeof registerKpiAdminSetBinding>[0]);
  // 演示夹具的租户对齐 —— 临时,随 objectstack-ai/objectstack#14547 的平台修复一起删除。
  registerDemoUnitAlignment(ctx as Parameters<typeof registerDemoUnitAlignment>[0]);
  // 历史行的方案回填:升级前建的核对任务 / 数据调整 plan 为空,落不进按方案的共享规则条件。
  registerPlanLinkBackfill(ctx as Parameters<typeof registerPlanLinkBackfill>[0]);
};
