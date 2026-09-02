import { definePage } from '@objectstack/spec/ui';

export const HomePage = definePage({
  name: 'kpi_home',
  label: '工作台',
  type: 'home',
  template: 'header-sidebar-main',
  isDefault: true,
  kind: 'full',
  regions: [
    { name: 'header', width: 'full', components: [{ type: 'page:header', properties: { title: 'KPI 考核管理', subtitle: '指标库 → 方案配置 → 指标下达 → 填报 → 并行核对 → 审核 → 计分 → 调整 → 汇总 → 归档' } }] },
    {
      name: 'main', width: 'large',
      components: [
        { type: 'element:text', properties: { content: '部门填报人员:在「填报单」里按行录入实际值,系统即时出分;确认无误后点「提交填报」。分公司核对人员:在「分公司核对」里确认或提出争议。人力审核 / 分管领导:在「填报单」对应队列里审核通过或驳回(驳回必须填写原因)。审批通过后在「结果与归档」查看四个维度的汇总并归档。' } },
      ],
    },
  ],
});
