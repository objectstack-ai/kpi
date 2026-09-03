import { defineTranslationBundle } from '@objectstack/spec';
import { zhCNTranslations } from './zh-CN.objects.generated.js';

/**
 * 翻译包按平台正式写法组织:每个受支持语言各一个包。
 *
 * - `zh-CN`(默认语言)由 `pnpm i18n:extract` 从元数据中文 label 生成,
 *   全部词条为工具产出,禁止手改;元数据 label 改动后重跑生成,
 *   `pnpm verify` 里的 `extract --check` 新鲜度门禁负责兜底。
 * - `en` 手工维护,只为英文界面用户提供英文回退。
 */
export const KpiTranslationBundle = defineTranslationBundle({
  'zh-CN': zhCNTranslations,
  en: {
    objects: {
      kpi_indicator: { label: 'Indicator', pluralLabel: 'Indicators', fields: { code: { label: 'Code' }, name: { label: 'Name' }, category: { label: 'Category' }, owner_unit: { label: 'Department Segment' }, scoring_method: { label: 'Scoring Method' }, status: { label: 'Status' } } },
      kpi_plan: { label: 'Assessment Plan', pluralLabel: 'Assessment Plans', fields: { name: { label: 'Plan Name' }, period_type: { label: 'Period Type' }, year: { label: 'Year' }, status: { label: 'Status' } } },
      kpi_entry_sheet: { label: 'Entry Sheet', pluralLabel: 'Entry Sheets', fields: { name: { label: 'Sheet' }, plan: { label: 'Plan' }, subject: { label: 'Subject' }, status: { label: 'Status' }, total_score: { label: 'Final Score' } } },
      kpi_entry_line: { label: 'Entry Line', pluralLabel: 'Entry Lines', fields: { indicator_name: { label: 'Indicator' }, actual_value: { label: 'Actual' }, target_value: { label: 'Target' }, weight: { label: 'Weight (%)' }, completion_rate: { label: 'Completion (%)' }, score: { label: 'Score' }, final_score: { label: 'Final Score' } } },
      kpi_result: { label: 'Assessment Result', pluralLabel: 'Assessment Results', fields: { dimension: { label: 'Dimension' }, score: { label: 'Score' }, rank: { label: 'Rank' } } },
      kpi_snapshot: { label: 'Archive Snapshot', pluralLabel: 'Archive Snapshots' },
    },
    apps: { kpi_app: { label: 'KPI Assessment' } },
  },
});
