import { defineTranslationBundle } from '@objectstack/spec';
import { zhCNTranslations } from './zh-CN.objects.generated.js';
import { enTranslations } from './en.objects.generated.js';

/**
 * 翻译包按平台正式写法组织:每个受支持语言各一个包,均由
 * `pnpm i18n:extract`(`os i18n extract --locales=zh-CN,en --fill=default`)生成。
 *
 * - `zh-CN`(默认语言)的叶子由工具从元数据中文 label 直接填充,**全部词条禁止手改**;
 *   元数据 label 改动后重跑生成即可。
 * - `en` 的叶子由 `--fill=default` 先填入中文源串,再**逐条人工翻译**;
 *   重跑生成时 merge 只补空缺(present-but-stale 不算空缺),已译词条原样保留 ——
 *   所以元数据 label 改了之后,对应的英文词条要人工重译,工具不会提醒。
 *
 * 两个包都由 `pnpm verify` 里的 `extract --check` 守新鲜度:少了键就失败。
 *
 * 覆盖范围是元数据词条(objects / apps / dashboards / pages)。视图页签、动作按钮文案与
 * hook 抛出的三段式报错**不在**翻译包内 —— 它们写在各自的定义与代码里,目前只有中文。
 */
export const KpiTranslationBundle = defineTranslationBundle({
  'zh-CN': zhCNTranslations,
  en: enTranslations,
});
