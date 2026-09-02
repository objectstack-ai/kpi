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
import { allPermissionSets, allPositions } from './src/security/index.js';
import { registerKpiPositionBindings } from './src/security/bind-position-sets.js';
import { allSharingRules } from './src/security/sharing-rules.js';
import { KpiTranslationBundle } from './src/translations/index.js';
import { KpiSeedData } from './src/data/index.js';

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

  hooks: allHooks,

  positions: allPositions,
  permissions: allPermissionSets,
  sharingRules: allSharingRules,

  data: KpiSeedData,
});

/** 岗位↔权限集绑定在安全引导完成后幂等补齐(不能用种子,见 bind-position-sets.ts)。 */
export const onEnable = async (ctx: unknown): Promise<void> => {
  registerKpiPositionBindings(ctx as Parameters<typeof registerKpiPositionBindings>[0]);
};
