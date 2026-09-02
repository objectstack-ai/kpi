import { defineTranslationBundle } from '@objectstack/spec';

/**
 * 元数据 label 本身即中文(客户业务语言),这里只提供英文回退,便于英文界面用户。
 */
export const KpiTranslationBundle = defineTranslationBundle({
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
