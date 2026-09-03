// Minimal Markdown → docx converter for the design proposal (headings, cover div,
// version table, tables with captions, bullets, paragraphs, code block, page breaks).
const fs = require('fs');
const path = require('path');
const D = require('docx');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, AlignmentType, PageBreak, ShadingType, BorderStyle, LevelFormat, TableOfContents, Footer, Header, PageNumber } = D;

const src = fs.readFileSync(process.argv[2], 'utf8').split('\n');
const out = process.argv[3];
let coverChildren = []; let versionText = "";
const FONT_CN = 'SimSun', FONT_HEAD = 'SimHei', FONT_EN = 'Times New Roman', FONT_MONO = 'Consolas';
const runs = (text, extra = {}) => {
  // inline **bold** and `code`
  const parts = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g; let last = 0; let m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(new TextRun({ text: text.slice(last, m.index), font: { eastAsia: FONT_CN, ascii: FONT_EN, hAnsi: FONT_EN }, size: 24, ...extra }));
    const t = m[0];
    if (t.startsWith('**')) parts.push(new TextRun({ text: t.slice(2, -2), bold: true, font: { eastAsia: FONT_CN, ascii: FONT_EN, hAnsi: FONT_EN }, size: 24, ...extra }));
    else parts.push(new TextRun({ text: t.slice(1, -1), font: { eastAsia: FONT_MONO, ascii: FONT_MONO, hAnsi: FONT_MONO }, size: 22, ...extra }));
    last = m.index + t.length;
  }
  if (last < text.length) parts.push(new TextRun({ text: text.slice(last), font: { eastAsia: FONT_CN, ascii: FONT_EN, hAnsi: FONT_EN }, size: 24, ...extra }));
  return parts;
};
const para = (text, opts = {}) => new Paragraph({ children: runs(text, opts.run || {}), spacing: { after: 120, line: 360 }, alignment: opts.align, indent: opts.indent });
const children = [];
let i = 0, inCover = false, inCode = false, codeLines = [], tableRows = [], pendingCaption = null, sawFirstH1 = false;
const flushTable = () => {
  if (!tableRows.length) return;
  const rows = tableRows.map(r => r.split('|').slice(1, -1).map(c => c.trim()));
  const body = rows.filter((r, idx) => !(idx === 1 && r.every(c => /^:?-+:?$/.test(c))));
  const cols = body[0].length; const total = 9000; const w = Math.floor(total / cols);
  const table = new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: Array(cols).fill(w),
    rows: body.map((r, ri) => new TableRow({ tableHeader: ri === 0, cantSplit: true, children: r.map(c => new TableCell({
      width: { size: w, type: WidthType.DXA },
      shading: ri === 0 ? { fill: 'E7EBF0', type: ShadingType.CLEAR, color: 'auto' } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ children: runs(c === '' ? '—' : c, { size: 21, bold: ri === 0 }), spacing: { after: 0, line: 300 } })],
    })) })),
  });
  if (pendingCaption) { children.push(new Paragraph({ children: runs(pendingCaption, { bold: true, size: 22 }), spacing: { before: 160, after: 80 }, keepNext: true })); pendingCaption = null; }
  children.push(table); children.push(new Paragraph({ text: '', spacing: { after: 60 } }));
  tableRows = [];
};
while (i < src.length) {
  const line = src[i]; i++;
  if (line.startsWith('```')) { if (inCode) { children.push(new Paragraph({ children: [new TextRun({ text: codeLines.join('\n').replace(/\n/g, ' ／ '), font: { eastAsia: FONT_MONO, ascii: FONT_MONO, hAnsi: FONT_MONO }, size: 19 })], shading: { fill: 'F2F4F7', type: ShadingType.CLEAR, color: 'auto' }, spacing: { after: 120 } })); codeLines = []; inCode = false; } else inCode = true; continue; }
  if (inCode) { codeLines.push(line); continue; }
  if (line.startsWith('|')) { tableRows.push(line); continue; } else flushTable();
  if (line.startsWith('<div align="center">')) { inCover = true; continue; }
  if (line.startsWith('</div>')) { inCover = false; continue; }
  if (line.trim() === '<br>' || line.trim() === '') { if (inCover) coverChildren.push(new Paragraph({ text: '' })); continue; }
  if (line.trim() === '---') { continue; }
  if (inCover) {
    const t = line.replace(/^#+\s*/, '').replace(/\*\*/g, '');
    const isTitle = line.startsWith('#');
    if (/^版本号/.test(t)) versionText = t.replace(/^版本号[::]\s*/, "").replace(/[((].*$/, "").trim();
    coverChildren.push(new Paragraph({ children: [new TextRun({ text: t, bold: true, size: isTitle ? 48 : 28, font: { eastAsia: isTitle ? FONT_HEAD : FONT_CN, ascii: FONT_EN, hAnsi: FONT_EN } })], alignment: AlignmentType.CENTER, spacing: { before: isTitle ? 360 : 120, after: 120 } }));
    continue;
  }
  if (line.startsWith('## 目录')) { children.push(new Paragraph({ children: [new TextRun({ text: '目录', bold: true, size: 32, font: { eastAsia: FONT_HEAD } })], spacing: { before: 240, after: 120 } })); children.push(new TableOfContents('目录', { hyperlink: true, headingStyleRange: '1-2' })); while (i < src.length && !src[i].startsWith('---')) i++; children.push(new Paragraph({ children: [new PageBreak()] })); continue; }
  let m;
  if ((m = line.match(/^# (.+)/))) { children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: m[1], bold: true, size: 32, font: { eastAsia: FONT_HEAD, ascii: FONT_EN, hAnsi: FONT_EN }, color: '1B2540' })], spacing: { before: 360, after: 160 }, pageBreakBefore: sawFirstH1 && !/^1\./.test(m[1]) ? false : false })); sawFirstH1 = true; continue; }
  if ((m = line.match(/^## (.+)/))) { children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: m[1], bold: true, size: 28, font: { eastAsia: FONT_HEAD, ascii: FONT_EN, hAnsi: FONT_EN }, color: '1B2540' })], spacing: { before: 240, after: 120 } })); continue; }
  if ((m = line.match(/^### (.+)/))) { children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: m[1], bold: true, size: 24, font: { eastAsia: FONT_HEAD, ascii: FONT_EN, hAnsi: FONT_EN }, color: '1B2540' })], spacing: { before: 200, after: 100 } })); continue; }
  if ((m = line.match(/^\*\*(表 \d+ [^*]+)\*\*$/))) { pendingCaption = m[1]; continue; }
  if (line.startsWith(">")) { const qt = line.replace(/^>\s?/, ""); if (qt.trim() === "") continue; children.push(new Paragraph({ children: runs(qt, { size: 21 }), indent: { left: 480, right: 480 }, shading: { fill: "F2F4F7", type: ShadingType.CLEAR, color: "auto" }, spacing: { after: 40, line: 300 } })); continue; }
  if ((m = line.match(/^(图 \d+ .+)$/))) { children.push(new Paragraph({ children: runs(m[1], { bold: true, size: 22 }), alignment: AlignmentType.CENTER, spacing: { after: 160 } })); continue; }
  if ((m = line.match(/^- (.+)/))) { children.push(new Paragraph({ children: runs(m[1]), numbering: { reference: 'bul', level: 0 }, spacing: { after: 80, line: 340 } })); continue; }
  children.push(para(line));
}
flushTable();
const doc = new Document({
  creator: 'KPI 项目组', title: 'KPI 考核管理系统 设计方案 ' + versionText,
  styles: { default: { document: { run: { font: { eastAsia: FONT_CN, ascii: FONT_EN, hAnsi: FONT_EN }, size: 24 } } } },
  numbering: { config: [{ reference: 'bul', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 480, hanging: 240 } } } }] }] },
  features: { updateFields: true },
  sections: [{
    properties: { page: { margin: { top: 1440, bottom: 1440, left: 1500, right: 1500 } } },
    children: coverChildren,
  }, {
    properties: { page: { margin: { top: 1440, bottom: 1440, left: 1500, right: 1500 }, pageNumbers: { start: 1 } } },
    headers: { default: new Header({ children: [new Paragraph({ children: [new TextRun({ text: 'KPI 考核管理系统 · 设计方案 ' + versionText, size: 18, color: '6C7686', font: { eastAsia: FONT_CN } })], alignment: AlignmentType.RIGHT })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ children: [new TextRun({ text: '第 ', size: 18, font: { eastAsia: FONT_CN } }), new TextRun({ children: [PageNumber.CURRENT], size: 18 }), new TextRun({ text: ' 页 共 ', size: 18, font: { eastAsia: FONT_CN } }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18 }), new TextRun({ text: ' 页', size: 18, font: { eastAsia: FONT_CN } })], alignment: AlignmentType.CENTER })] }) },
    children,
  }],
});
Packer.toBuffer(doc).then(b => { fs.writeFileSync(out, b); console.log('wrote', out, b.length); });
