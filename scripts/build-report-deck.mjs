/**
 * 从汇报稿源稿生成 19 页汇报 PPT(pptxgenjs)。
 *
 * 内容与 docs/汇报/KPI考核管理系统-解决方案汇报.html 同源:九张业务示意图 +
 * 八张界面截图,每页带讲稿备注。配色取应用自身的品牌色(src/apps/index.ts 的
 * primaryColor)与汇报稿同一套语义色,三份交付物看起来是一家的。
 *
 * 用法:
 *   node scripts/build-report-deck.mjs <示意图目录> [输出.pptx]
 *
 * <示意图目录> 需含九张 PNG(图1-角色动线泳道图.png … 图9-对象模型总图.png),
 * 由汇报稿 HTML 里的内联 SVG 渲染导出 —— 图是页面的一部分,不单独入库,
 * 需要时用无头浏览器按 figure 截取。截图直接读 docs/手册/图片/ 下操作手册已归档的那批。
 *
 * 依赖 pptxgenjs,**未列入 package.json** —— 这是一次性的成稿工具,不值得让
 * 元数据项目的依赖图为它变长。要跑先装:pnpm add -D pptxgenjs
 *
 * 生成后务必跑一遍校验(pptxgenjs 会写出 PowerPoint 拒绝打开的图表 XML):
 *   python3 <pptx skill>/scripts/office/validate.py <输出.pptx>
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const PptxGenJS = require('pptxgenjs');

// ── 取自应用自身的品牌色(src/apps/index.ts 的 primaryColor)+ 汇报稿同一套语义色 ──
const NAVY   = '111A3E';   // 主色:封面、结尾、强调块
const BLUE   = '1D4ED8';   // 品牌蓝:重点、图标
const BLUE_D = '12379E';
const TINT   = 'F1F4F8';   // 卡片底
const ICE    = 'C3D2F0';   // 深色底上的次要文字
const INK    = '151A21';
const MUTED  = '5A6675';
const RULE   = 'DBE2EB';
const OK     = '0E7A57';
const WARN   = '96590C';
const STOP   = 'A81F27';

const FONT   = 'Microsoft YaHei';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, '..');
const SHOT = path.join(REPO, 'docs/手册/图片');

const DIA = process.argv[2];
if (!DIA || !fs.existsSync(DIA)) {
  console.error('用法: node scripts/build-report-deck.mjs <示意图目录> [输出.pptx]');
  console.error('  <示意图目录> 需含「图1-…png」到「图9-…png」九张图。');
  process.exit(2);
}

const W = 13.333, H = 7.5, M = 0.62;
const CW = W - M * 2;

/** 读 PNG 宽高(IHDR:signature 8 + length 4 + "IHDR" 4,之后是 4+4 字节大端宽高)。 */
function pngSize(file) {
  const b = fs.readFileSync(file, { length: 33 });
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/** 等比缩放并在给定框内居中。 */
function fit(file, bx, by, bw, bh) {
  const { w, h } = pngSize(file);
  const s = Math.min(bw / w, bh / h);
  const dw = w * s, dh = h * s;
  return { path: file, x: bx + (bw - dw) / 2, y: by + (bh - dh) / 2, w: dw, h: dh };
}

const dia = (n) => path.join(DIA, n);
const shot = (n) => path.join(SHOT, n);

const pres = new PptxGenJS();
pres.layout = 'LAYOUT_WIDE';           // 必须在 addSlide 之前
pres.author = 'KPI 考核管理系统项目组';
pres.title = 'KPI 考核管理系统 解决方案汇报';

let pageNo = 0;

/** 浅色内容页的统一版头:眉标 + 标题 + 一句话结论。返回内容区起始 y。 */
function head(s, eyebrow, title, takeaway) {
  s.background = { color: 'FFFFFF' };
  s.addShape(pres.ShapeType.rect, { x: M, y: 0.42, w: 0.1, h: 0.1, fill: { color: BLUE }, line: { color: BLUE } });
  s.addText(eyebrow, {
    x: M + 0.2, y: 0.32, w: 8, h: 0.3, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 12, color: BLUE, bold: true, charSpacing: 1, valign: 'middle',
  });
  s.addText(title, {
    x: M, y: 0.66, w: CW, h: 0.56, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 30, bold: true, color: INK, valign: 'middle',
  });
  if (takeaway) {
    s.addText(takeaway, {
      x: M, y: 1.24, w: CW, h: 0.34, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 14, color: MUTED, valign: 'top',
    });
    return 1.72;
  }
  return 1.36;
}

function foot(s) {
  pageNo += 1;
  s.addText(String(pageNo), {
    x: W - M - 0.6, y: H - 0.52, w: 0.6, h: 0.3, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 10, color: MUTED, align: 'right', valign: 'middle',
  });
  s.addText('KPI 考核管理系统 · 解决方案汇报', {
    x: M, y: H - 0.52, w: 6, h: 0.3, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 10, color: 'A7B0BC', valign: 'middle',
  });
}

/** 一张图占满内容区的版式。 */
function diagramSlide({ eyebrow, title, takeaway, image, note }) {
  const s = pres.addSlide();
  const top = head(s, eyebrow, title, takeaway);
  s.addImage(fit(image, M, top, CW, H - top - 0.72));
  foot(s);
  if (note) s.addNotes(note);
  return s;
}

/** 两张界面截图并排,各带一句说明。 */
function shotsSlide({ eyebrow, title, takeaway, items, note }) {
  const s = pres.addSlide();
  const top = head(s, eyebrow, title, takeaway);
  const gap = 0.4;
  const cw = (CW - gap) / 2;
  const imgH = H - top - 1.5;
  items.forEach((it, i) => {
    const bx = M + i * (cw + gap);
    s.addImage(fit(shot(it.file), bx, top, cw, imgH));
    if (it.tag) {
      s.addShape(pres.ShapeType.roundRect, {
        x: bx, y: top + imgH + 0.14, w: 0.72, h: 0.26, rectRadius: 0.05,
        fill: { color: it.tagColor }, line: { color: it.tagColor },
      });
      s.addText(it.tag, {
        x: bx, y: top + imgH + 0.14, w: 0.72, h: 0.26, isTextBox: true, margin: 0,
        fontFace: FONT, fontSize: 10, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle',
      });
    }
    s.addText(it.caption, {
      x: bx + (it.tag ? 0.82 : 0), y: top + imgH + 0.1, w: cw - (it.tag ? 0.82 : 0), h: 0.72,
      isTextBox: true, margin: 0, fontFace: FONT, fontSize: 12, color: MUTED, valign: 'top',
    });
  });
  foot(s);
  if (note) s.addNotes(note);
  return s;
}

// ══════════════════════════════════════════════════════════════════
// 1 封面
// ══════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: NAVY };
  s.addShape(pres.ShapeType.rect, { x: 1.0, y: 1.72, w: 0.13, h: 0.13, fill: { color: BLUE }, line: { color: BLUE } });
  s.addText('解决方案汇报', {
    x: 1.26, y: 1.62, w: 8, h: 0.32, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 14, color: ICE, bold: true, charSpacing: 2, valign: 'middle',
  });
  s.addText('KPI 考核管理系统', {
    x: 1.0, y: 2.16, w: 11, h: 1.16, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 54, bold: true, color: 'FFFFFF', valign: 'middle',
  });
  s.addText('指标库 · 方案配置 · 指标下达 · 数据填报 · 并行核对 · 审核审批 · 实时计分 · 数据调整 · 四维汇总 · 归档快照', {
    x: 1.0, y: 3.38, w: 10.6, h: 0.4, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 15, color: ICE, valign: 'middle',
  });
  s.addText('把考核从 Excel 与聊天工具的来回传递,搬成一条口径唯一、全程留痕、发布即冻结的线上流程。', {
    x: 1.0, y: 3.92, w: 10.6, h: 0.4, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 15, color: 'FFFFFF', valign: 'middle',
  });
  const meta = [
    ['需求基准', '《设计方案》V1.0 客户确认版'],
    ['技术底座', 'ObjectStack 17.x 元数据平台'],
    ['当前阶段', '全流程已跑通 · PM 验收中'],
    ['汇报日期', '2026 年 09 月 07 日'],
  ];
  meta.forEach(([k, v], i) => {
    const x = 1.0 + i * 2.72;
    s.addText(k, {
      x, y: 5.32, w: 2.5, h: 0.26, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 10.5, color: '8095C4', bold: true, charSpacing: 1, valign: 'middle',
    });
    s.addText(v, {
      x, y: 5.6, w: 2.6, h: 0.42, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 12.5, color: 'FFFFFF', valign: 'top',
    });
  });
  s.addNotes('开场:这套系统覆盖一个考核周期的全部环节。今天重点讲三件事 —— 流程怎么转、分怎么算、谁能看见什么。');
}

// ══════════════════════════════════════════════════════════════════
// 2 三个痛点 + 关键数字
// ══════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  const top = head(s, '为什么要建', '用 Excel 做考核,三件事必然失控',
    '考核本身不复杂,难的是口径与留痕。');
  const pains = [
    ['口径不唯一', '同一个「完成率」,各部门表里的公式写法不同;表一改,历史周期的分数跟着变 —— 过去算过的账对不上。'],
    ['过程不可追', '谁在什么时候改了哪个数、为什么改、谁批准的,散落在聊天记录和邮件附件里,复核时拼不回来。'],
    ['协作靠人盯', '分公司核对、人力审核、领导审批的先后顺序靠人催,谁卡在哪一步没有统一视图。'],
  ];
  const gap = 0.34, cw = (CW - gap * 2) / 3;
  pains.forEach(([t, d], i) => {
    const x = M + i * (cw + gap);
    s.addShape(pres.ShapeType.roundRect, {
      x, y: top, w: cw, h: 2.32, rectRadius: 0.08, fill: { color: TINT }, line: { color: RULE },
    });
    s.addShape(pres.ShapeType.ellipse, {
      x: x + 0.34, y: top + 0.32, w: 0.42, h: 0.42, fill: { color: STOP }, line: { color: STOP },
    });
    s.addText(String(i + 1), {
      x: x + 0.34, y: top + 0.32, w: 0.42, h: 0.42, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 15, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle',
    });
    s.addText(t, {
      x: x + 0.34, y: top + 0.88, w: cw - 0.68, h: 0.38, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 19, bold: true, color: INK, valign: 'middle',
    });
    s.addText(d, {
      x: x + 0.34, y: top + 1.3, w: cw - 0.68, h: 0.86, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 12.5, color: MUTED, valign: 'top', lineSpacingMultiple: 1.25,
    });
  });

  const stats = [['17', '业务对象'], ['6', '岗位与权限集'], ['4', '计分方式'], ['4', '汇总维度'], ['8', '发布前检查项'], ['139', '单元测试用例']];
  const sy = top + 2.78;
  const sw = CW / 6;
  s.addText('系统规模', {
    x: M, y: sy - 0.4, w: 6, h: 0.3, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 12, bold: true, color: BLUE, charSpacing: 1, valign: 'middle',
  });
  stats.forEach(([n, l], i) => {
    const x = M + i * sw;
    s.addText(n, {
      x, y: sy, w: sw - 0.2, h: 0.8, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 40, bold: true, color: NAVY, valign: 'middle',
    });
    s.addText(l, {
      x, y: sy + 0.82, w: sw - 0.2, h: 0.3, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 12, color: MUTED, valign: 'top',
    });
  });
  foot(s);
  s.addNotes('三个痛点是客户自己在需求文档里写的现状。右下六个数字是系统当前的实际规模,不是估算。');
}

// ══════════════════════════════════════════════════════════════════
// 3 五个机制
// ══════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  const top = head(s, '解法概览', '系统给出的五个机制',
    '每一个机制都对应上一页的某一个痛点,而不是功能清单上的一条。');
  const items = [
    ['计分口径唯一真值', '四种计分方式是数据不是代码。全系统任何一个得分都出自同一个计分引擎,视图与公式字段里不允许二次实现。', BLUE],
    ['发布即冻结', '方案一发布,目标值、权重、计分规则以副本形式落到每一行明细上。之后改指标库,历史周期分毫不动。', BLUE],
    ['状态机带闸门', '未填全不能提交、有争议不能推进、驳回必须写原因、归档后全表只读 —— 规则全在服务端,按钮只写「待执行动作」。', WARN],
    ['只增不改的留痕', '每次提交、核对、审核、驳回、调整、归档都写一条审核记录;归档快照带 SHA-256 校验和,不可修改删除。', OK],
    ['数据范围随方案生成', '「本部门 / 分管范围」由方案发布时按参与主体、分管领导、到人分工自动写入。组织调整只改数据,不改元数据。', BLUE],
  ];
  const gap = 0.3;
  const cw = (CW - gap * 2) / 3;
  const ch = 2.28;
  items.forEach(([t, d, c], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = M + col * (cw + gap);
    const y = top + row * (ch + gap);
    s.addShape(pres.ShapeType.roundRect, {
      x, y, w: cw, h: ch, rectRadius: 0.08, fill: { color: TINT }, line: { color: RULE },
    });
    s.addShape(pres.ShapeType.ellipse, {
      x: x + 0.3, y: y + 0.3, w: 0.34, h: 0.34, fill: { color: c }, line: { color: c },
    });
    s.addText(t, {
      x: x + 0.76, y: y + 0.26, w: cw - 1.06, h: 0.42, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 16, bold: true, color: INK, valign: 'middle',
    });
    s.addText(d, {
      x: x + 0.3, y: y + 0.82, w: cw - 0.6, h: 1.24, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 12, color: MUTED, valign: 'top', lineSpacingMultiple: 1.25,
    });
  });
  // 第六格:范围边界的提醒,放在 2×3 网格的空位
  const x6 = M + 2 * (cw + gap), y6 = top + (ch + gap);
  s.addShape(pres.ShapeType.roundRect, {
    x: x6, y: y6, w: cw, h: ch, rectRadius: 0.08, fill: { color: NAVY }, line: { color: NAVY },
  });
  s.addText('代价:一处口径变化', {
    x: x6 + 0.3, y: y6 + 0.3, w: cw - 0.6, h: 0.4, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 16, bold: true, color: 'FFFFFF', valign: 'middle',
  });
  s.addText('Excel 自由公式与跨表引用不进系统,公式的作用由「指标计分规则」统一承担。这是换取「口径唯一、可复核、可重算」的代价,实施阶段需逐条翻译现行公式。', {
    x: x6 + 0.3, y: y6 + 0.8, w: cw - 0.6, h: 1.26, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 12, color: ICE, valign: 'top', lineSpacingMultiple: 1.25,
  });
  foot(s);
  s.addNotes('深色那一格是要主动讲的:这是本方案与现状最大的差别,也是实施阶段风险最集中的地方,不要等客户自己发现。');
}

// ══════════════════════════════════════════════════════════════════
// 4 角色与职责
// ══════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  const top = head(s, '角色', '六个岗位,六套权限集',
    '能看到什么由数据范围决定,能按哪个按钮由当前流程节点决定 —— 两条边界都在服务端。');
  const rows = [
    ['系统管理员', '维护组织、用户与岗位', '全部'],
    ['人力审核', '维护指标库与方案、指标下达、发布方案、人力节点审核、登记加减分、审批调整、归档、审计查询', '全部'],
    ['人力负责人', '审批加减分、审批数据调整', '全部'],
    ['部门填报人员', '填报本部门数据并提交、发起数据调整申请', '本部门'],
    ['分公司核对人员', '核对与本分公司相关的数据,只能「确认无误」或「提出争议」,不能改数值', '本分公司'],
    ['分管领导', '分管主体的最终审批、查看分管范围的结果与看板', '分管范围'],
  ];
  const c1 = 2.5, c3 = 1.6, c2 = CW - c1 - c3;
  const rh = 0.62;
  ['角色', '在系统里做什么', '能看到的范围'].forEach((h, i) => {
    const x = M + (i === 0 ? 0 : i === 1 ? c1 : c1 + c2);
    const w = i === 0 ? c1 : i === 1 ? c2 : c3;
    s.addText(h, {
      x: x + 0.14, y: top, w: w - 0.28, h: 0.42, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 11.5, bold: true, color: BLUE, charSpacing: 1, valign: 'middle',
    });
  });
  rows.forEach((r, i) => {
    const y = top + 0.5 + i * rh;
    s.addShape(pres.ShapeType.rect, {
      x: M, y, w: CW, h: rh, fill: { color: i % 2 ? 'FFFFFF' : TINT }, line: { color: 'FFFFFF' },
    });
    s.addText(r[0], {
      x: M + 0.14, y, w: c1 - 0.28, h: rh, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 13.5, bold: true, color: INK, valign: 'middle',
    });
    s.addText(r[1], {
      x: M + c1 + 0.14, y, w: c2 - 0.28, h: rh, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 12.5, color: MUTED, valign: 'middle',
    });
    s.addText(r[2], {
      x: M + c1 + c2 + 0.14, y, w: c3 - 0.28, h: rh, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 12.5, bold: true, color: r[2] === '全部' ? MUTED : BLUE_D, valign: 'middle',
    });
  });
  const ny = top + 0.5 + rows.length * rh + 0.3;
  s.addShape(pres.ShapeType.roundRect, {
    x: M, y: ny, w: CW, h: 0.76, rectRadius: 0.06, fill: { color: 'F6EAD8' }, line: { color: 'E3CFA8' },
  });
  s.addText([
    { text: '一条容易被忽略的约束:', options: { bold: true, color: WARN } },
    { text: '核对人员不能改数值。发现数据对不上只能提出争议,由填报部门经调整流程更正 —— 让「谁报的数谁负责」这条责任线不被核对环节冲淡。', options: { color: INK } },
  ], {
    x: M + 0.28, y: ny, w: CW - 0.56, h: 0.76, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 12.5, valign: 'middle',
  });
  foot(s);
  s.addNotes('分公司在方案里既是被考核主体、又是核对方 —— 这两件事由两个人做:分公司填报人员填本分公司那张单,分公司核对人员只对别人的数据表态。');
}

// ══════════════════════════════════════════════════════════════════
// 5-7 流程三张图
// ══════════════════════════════════════════════════════════════════
diagramSlide({
  eyebrow: '业务流程 · 全景',
  title: '一个考核周期的角色动线',
  takeaway: '实线是单据的流转方向,虚线是人的动作触发的系统动作 —— 发布、保存、提交、审批、归档这五处,系统各自做一件不需要人参与的事。',
  image: dia('图1-角色动线泳道图.png'),
  note: '讲这张图的顺序:先横着念一遍五个阶段,再指最下面那条「系统 · 自动」泳道 —— 客户最关心的省人力,就在这一条。',
});

diagramSlide({
  eyebrow: '业务流程 · 规则',
  title: '状态机与它的闸门:什么情况下走不动',
  takeaway: '每一次流转都由服务端判定,按钮本身只写「待执行动作」;绕过按钮直接写状态字段,同样会被拦下。',
  image: dia('图2-状态机与闸门.png'),
  note: '重点讲两条:一是「有一家分公司提争议就不推进」,二是驳回退回核对节点时全部分公司重新核对 —— 避免半有效状态。',
});

diagramSlide({
  eyebrow: '方案配置与发布',
  title: '发布即冻结:八项检查,以及为什么必须是副本',
  takeaway: '八项检查任意一项不过,方案原地保持草稿并逐条给出问题;全部通过才生成填报单。',
  image: dia('图3-发布即冻结.png'),
  note: '客户最容易问的是「以后指标口径变了怎么办」。答案就在右下的时间轴:T2 改口径,已发布周期分毫不动,新口径从 T3 的下期方案开始生效。',
});

shotsSlide({
  eyebrow: '方案配置与发布 · 界面',
  title: '发布不是「保存并推进」,而是一次全量体检',
  takeaway: '检查不通过时系统不做部分发布 —— 方案原地不动,把问题逐条摆出来。',
  items: [
    { file: '02-23-fabu-jiancha-butongguo.png', tag: '拦下', tagColor: STOP,
      caption: '提示直接点名是哪个主体的哪一条:「市场部的权重合计为 90%,必须等于 100%」「华北分公司的培训完成率未设置目标值」,不是一句「配置有误」。' },
    { file: '02-24-fabu-chenggong.png', tag: '放行', tagColor: OK,
      caption: '发布成功,状态条推进到「已发布」,盖上发布时间与发布人;右上角按钮换成「关闭方案」—— 同一个位置不会再出现第二次发布。' },
  ],
  note: '现场可以演示一次失败发布再改到成功 —— 这是操作手册里给人力审核的练习任务之一。',
});

// ══════════════════════════════════════════════════════════════════
// 9-11 计分
// ══════════════════════════════════════════════════════════════════
diagramSlide({
  eyebrow: '填报与计分',
  title: '从实际值到最终得分,只有五步',
  takeaway: '四种计分方式只在中间一段分岔 —— 换计分方式改的是一个下拉,不是一套算法。',
  image: dia('图4-计分链路.png'),
  note: '强调「口径唯一」的具体含义:计分引擎是纯函数,可单元测试、可逐条复核;每一行都落一段计算说明,得分和手算对不上时打开就能看到差在哪一步。',
});

{
  const s = pres.addSlide();
  const top = head(s, '填报与计分', '同一个完成率,四种方式给出的分完全不同',
    '选哪一种取决于指标想鼓励什么:线性鼓励多超额,区间插值容忍未达标但压缩超额收益,阶梯只认档位不认零头。');
  const chartW = 7.9;
  s.addImage(fit(dia('图5-四种计分方式曲线.png'), M, top, chartW, H - top - 0.72));
  const rx = M + chartW + 0.42;
  const rw = CW - chartW - 0.42;
  s.addText('完成率 97% 时', {
    x: rx, y: top + 0.06, w: rw, h: 0.34, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 13, bold: true, color: BLUE, charSpacing: 1, valign: 'middle',
  });
  const cases = [['97', '完成率线性', '得分率 = 完成率,限定在保底与封顶之间', '2563EB'],
                 ['92.5', '区间插值', '下限 60% 得 0,100% 得满分,中间按直线插值', '0E8A6E'],
                 ['90', '阶梯计分', '落在「95~100%」这一档,取该档得分率', 'B26A0B']];
  cases.forEach(([n, t, d, c], i) => {
    const y = top + 0.52 + i * 1.46;
    s.addShape(pres.ShapeType.roundRect, {
      x: rx, y, w: rw, h: 1.28, rectRadius: 0.08, fill: { color: TINT }, line: { color: RULE },
    });
    s.addText(n, {
      x: rx + 0.24, y: y + 0.12, w: 1.5, h: 0.62, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 34, bold: true, color: c, valign: 'middle',
    });
    s.addText(t, {
      x: rx + 1.72, y: y + 0.16, w: rw - 1.96, h: 0.54, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 14, bold: true, color: INK, valign: 'middle',
    });
    s.addText(d, {
      x: rx + 0.24, y: y + 0.74, w: rw - 0.48, h: 0.44, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 11.5, color: MUTED, valign: 'top',
    });
  });
  s.addText('第四种「自定义公式」由 CEL 表达式直接给出得分,形状不固定,不在本图。', {
    x: rx, y: top + 4.7, w: rw, h: 0.48, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 11, color: MUTED, valign: 'top', lineSpacingMultiple: 1.2,
  });
  foot(s);
  s.addNotes('这一页是全场最容易引起讨论的:三个数字的差异不是误差,是口径选择。实施阶段翻译现行 Excel 公式,就是在这三条曲线里选一条。');
}

shotsSlide({
  eyebrow: '填报与计分 · 界面',
  title: '保留 Excel 的手感:按行填数,保存即出分',
  takeaway: '变的只有口径来源 —— 得分不再由每张表自己的公式算出,而是由全系统唯一的计分引擎算出,并把算式写下来备查。',
  items: [
    { file: '03-03-luru-shijizhi.png',
      caption: '双击单元格填实际值,保存后完成率、得分率、得分当场回填到同一张表,不用跳页、不用等批处理。指标条数多时可走「导出 XLSX → 填 → 导入」。' },
    { file: '03-04-jisuan-shuoming.png', tag: '可复核', tagColor: BLUE,
      caption: '每一行都落一段「计算说明」:完成率怎么来的、封顶保底在哪一步生效、得分率取了哪一档 —— 逐条可复核。' },
  ],
  note: '「保存即出分」是填报人员感知最强的一点,值得现场演示一次。',
});

shotsSlide({
  eyebrow: '核对与审核 · 界面',
  title: '并行核对与逐级审核:放行,或写明原因退回',
  takeaway: '各分公司同时核对,但推进条件是「全部确认无误」—— 有一家提出争议,单据就停在核对节点。',
  items: [
    { file: '04-01-daiwo-hedui.png',
      caption: '「待我核对」队列只列得出与本分公司相关的任务 —— 别的分公司的任务在数据层就不可见,不是靠视图筛选藏起来的。' },
    { file: '02-26-bohui-duihuakuang.png', tag: '退回', tagColor: STOP,
      caption: '驳回原因必填,不填点不动;填完退回上一节点,并在审核记录里留下一条带原因的驳回记录。' },
  ],
  note: '审核人从队列进入,不需要知道单据在哪个环节 —— 队列本身就是环节。三个待办队列在左侧菜单有直达入口。',
});

// ══════════════════════════════════════════════════════════════════
// 13-15 调整、汇总
// ══════════════════════════════════════════════════════════════════
diagramSlide({
  eyebrow: '加减分与数据调整',
  title: '三条受控的改数通道,以及它们的重算传播',
  takeaway: '考核不可能一次填对。每条通道都要审批、都要留痕、都会触发重算 —— 而不是让人回到表格里悄悄把数字改掉。',
  image: dia('图6-调整与加减分的重算传播.png'),
  note: '关键在最右边那一格:任何一条通道落地,四维结果与排名都自动重算,不需要有人记得去「刷新汇总」—— 这是 Excel 时代最容易漏掉的一步。',
});

diagramSlide({
  eyebrow: '汇总与结果',
  title: '一个最终得分,落到四个不同的问题上',
  takeaway: '这个部门考得怎么样、这家分公司排第几、张三个人该拿多少、王总分管的这一摊整体如何 —— 四个维度、四套口径,一次生成。',
  image: dia('图7-四维汇总口径.png'),
  note: '到人与分管领导两个维度是跨对象加权计算,这也是它们必须由服务端算、而不能由视图公式表达的原因。口径的唯一真值在一个文件里。',
});

shotsSlide({
  eyebrow: '汇总与结果 · 界面',
  title: '结果、看板与三张报表',
  takeaway: '看板回答「整体什么水平」,报表回答「具体哪一格」,两者都能钻取回填报单与指标明细。',
  items: [
    { file: '06-04-fenguan-zhuti-jieguo.png',
      caption: '考核结果列表,四个维度各一个页签。分管领导维度那一行的得分,是它下面几个主体按主体权重加权出来的 —— 点进去能看到是哪几个主体。' },
    { file: '06-05-jieguo-kanban.png',
      caption: '结果看板:结果条数、平均分、最高最低分与各组织单元平均得分,「汇总维度」下拉可以只看某一个维度。' },
  ],
  note: '另有三张报表:组织单元 × 维度矩阵(可钻取)、到人得分、指标完成情况。',
});

// ══════════════════════════════════════════════════════════════════
// 16-17 权限、架构
// ══════════════════════════════════════════════════════════════════
diagramSlide({
  eyebrow: '权限与数据安全',
  title: '「本部门 / 分管范围」不是配置项,是算出来的结果',
  takeaway: '分管领导分管的主体跨部门、逐期变化,按组织层级授权会立刻失效 —— 所以可见范围的真值在方案里,不在组织树上。',
  image: dia('图8-数据范围模型.png'),
  note: '实际收益在实施阶段:接入一家新单位的组织架构,或者本单位年中调整部门,都不需要动系统里的任何一条权限配置 —— 重新发布方案,可见范围自己就对了。',
});

diagramSlide({
  eyebrow: '系统架构',
  title: '17 个自建对象,六个服务端代码点',
  takeaway: '组织、账号、权限、审计、导入导出、列表与表单直接复用平台;考核专属的六件事由服务端代码点承担,不改平台包。',
  image: dia('图9-对象模型总图.png'),
  note: '六个代码点:计分引擎、审核状态机、方案发布生成、调整落地重算、归档快照与只读锁、结果汇总。计分、状态机、汇总、CEL 求值写成纯函数,139 条单元测试守住口径。',
});

// ══════════════════════════════════════════════════════════════════
// 18 交付状态
// ══════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  const top = head(s, '交付状态', '一期已跑通,第二批 18 项待确认档次',
    '一期已确认口径(设计方案第 1~10 章共 17 项)已全部实现并逐条验证。');
  const tiers = [
    ['一期(已确认)', '17', '设计方案第 1~10 章,客户 2026-09-02 逐条确认', '已实现并跑通', OK],
    ['一期补强', '9', '通知与待办、公式试算器、批量操作与 Excel 直接导入、结果等级、统一争议等', '待确认档次', WARN],
    ['二期', '7', '定性指标计分、否决项与不占权重指标、目标三档与派生指标、个人考核单等', '待确认档次', WARN],
    ['产品化候选', '2', '外部接口与单点登录、指标库与方案模板库', '单独立项', MUTED],
  ];
  const rh = 0.92;
  tiers.forEach((t, i) => {
    const y = top + i * (rh + 0.10);
    s.addShape(pres.ShapeType.roundRect, {
      x: M, y, w: 7.55, h: rh, rectRadius: 0.06, fill: { color: TINT }, line: { color: RULE },
    });
    s.addText(t[1], {
      x: M + 0.22, y, w: 0.82, h: rh, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 26, bold: true, color: t[4], align: 'center', valign: 'middle',
    });
    s.addText(t[0], {
      x: M + 1.14, y: y + 0.1, w: 4.66, h: 0.34, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 14, bold: true, color: INK, valign: 'middle',
    });
    s.addText(t[2], {
      x: M + 1.14, y: y + 0.44, w: 4.66, h: 0.44, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 10.5, color: MUTED, valign: 'top',
    });
    s.addText(t[3], {
      x: M + 7.55 - 1.5, y, w: 1.34, h: rh, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 11, bold: true, color: t[4], align: 'right', valign: 'middle',
    });
  });
  const bx = M + 7.55 + 0.34;
  const bw = CW - 7.55 - 0.34;
  s.addShape(pres.ShapeType.roundRect, {
    x: bx, y: top, w: bw, h: 3.98, rectRadius: 0.08, fill: { color: NAVY }, line: { color: NAVY },
  });
  s.addText('下一步', {
    x: bx + 0.32, y: top + 0.24, w: bw - 0.64, h: 0.4, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 17, bold: true, color: 'FFFFFF', valign: 'middle',
  });
  const steps = [
    '确认第二批 18 项的档次 —— 当前唯一的阻塞项,决定本期验收范围',
    '界面走查评审与真实数据量性能验证,需贵方参与走查',
    '现行 Excel 模板的口径翻译,建议配合公式试算器一并推进',
    '主数据准备:组织、用户与岗位、指标库、首个方案',
    '试运行:一个真实考核周期跑一遍,出试运行报告',
  ];
  steps.forEach((t, i) => {
    const y = top + 0.78 + i * 0.64;
    s.addShape(pres.ShapeType.ellipse, {
      x: bx + 0.32, y: y + 0.06, w: 0.3, h: 0.3, fill: { color: BLUE }, line: { color: BLUE },
    });
    s.addText(String(i + 1), {
      x: bx + 0.32, y: y + 0.06, w: 0.3, h: 0.3, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 11, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle',
    });
    s.addText(t, {
      x: bx + 0.74, y, w: bw - 1.06, h: 0.56, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 11.5, color: ICE, valign: 'middle', lineSpacingMultiple: 1.15,
    });
  });
  // 底部:验证手段三层 —— 交付状态的证据,不是口号
  const vy = 6.22;
  s.addText('验证手段', {
    x: M, y: vy - 0.30, w: 4, h: 0.3, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 12, bold: true, color: BLUE, charSpacing: 1, valign: 'middle',
  });
  const proofs = [
    ['139 条单元测试', '守计分、状态机、汇总、数据范围与岗位闸门的口径'],
    ['端到端脚本', '经 REST 走完整考核链路,发布到归档逐条断言'],
    ['两套演示种子档案', '通用企业 / 软件公司,四种计分方式全覆盖'],
  ];
  const pw = CW / 3;
  proofs.forEach(([t, d], i) => {
    const x = M + i * pw;
    s.addText(t, {
      x, y: vy, w: pw - 0.3, h: 0.3, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 14, bold: true, color: INK, valign: 'middle',
    });
    s.addText(d, {
      x, y: vy + 0.32, w: pw - 0.3, h: 0.42, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 11.5, color: MUTED, valign: 'top',
    });
  });
  foot(s);
  s.addNotes('另交付一册分角色操作手册,六个业务角色分章成册,62 张截图全部取自真实界面。');
}

// ══════════════════════════════════════════════════════════════════
// 19 结尾
// ══════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: NAVY };
  s.addText('需要贵方决定的一件事', {
    x: 1.0, y: 1.72, w: 11, h: 0.5, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 15, color: '8095C4', bold: true, charSpacing: 2, valign: 'middle',
  });
  s.addText('对第 18~35 项逐条回复\n「同意默认」「改为 X」或「删除」', {
    x: 1.0, y: 2.32, w: 11, h: 1.6, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 40, bold: true, color: 'FFFFFF', valign: 'middle', lineSpacingMultiple: 1.2,
  });
  s.addText('确认后设计方案升 V2.0,「一期补强」的 9 项纳入本期验收范围,「二期」的 7 项进入排期。', {
    x: 1.0, y: 4.16, w: 11, h: 0.44, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 15, color: ICE, valign: 'middle',
  });
  s.addShape(pres.ShapeType.rect, { x: 1.0, y: 5.06, w: 1.2, h: 0.02, fill: { color: '3B4A7A' }, line: { color: '3B4A7A' } });
  s.addText('配套材料:《设计方案》V1.0 · 《操作手册》V0.1(六个业务角色分章,62 张真实界面截图)· 解决方案汇报稿(九张业务示意图)', {
    x: 1.0, y: 5.32, w: 11, h: 0.44, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 12, color: '8095C4', valign: 'middle',
  });
  s.addNotes('收尾时把球踢回去:唯一阻塞项是第二批 18 项的档次确认,确认完就能定本期验收范围。');
}

const out = process.argv[3] || path.join(REPO, 'docs/交付/KPI考核管理系统-解决方案汇报.pptx');
fs.mkdirSync(path.dirname(out), { recursive: true });
await pres.writeFile({ fileName: out });
console.log('写出', out);
