#!/usr/bin/env node
/**
 * 把 HTML 里的本地图片改写成内联 data URI,产出可独立发布的单文件页面。
 *
 * 源稿(docs/汇报/*.html)里的图片走相对路径,指向操作手册已归档的截图 ——
 * 仓库里存的是这一份:图片不重复入库,改图只改一处。发布用的副本需要自包含
 * (Artifact 的内容安全策略只放行 CDN 上的脚本与字体,图片一律拿不到),
 * 所以发布前用本脚本把 <img src="相对路径"> 换成 data URI。
 *
 *   node scripts/inline-assets.cjs <输入.html> <输出.html>
 *
 * 只处理 <img src="…"> 中的相对路径;已经是 data:/http(s): 的原样保留。
 * 找不到的文件直接报错退出 —— 静默漏图比报错难查得多。
 */

const fs = require('node:fs');
const path = require('node:path');

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

function main(argv) {
  const [input, output] = argv;
  if (!input || !output) {
    console.error('用法: node scripts/inline-assets.cjs <输入.html> <输出.html>');
    process.exit(2);
  }

  const baseDir = path.dirname(path.resolve(input));
  const html = fs.readFileSync(input, 'utf8');

  let count = 0;
  let bytes = 0;
  const missing = [];

  const out = html.replace(/(<img\b[^>]*?\bsrc=")([^"]+)(")/g, (whole, head, src, tail) => {
    if (/^(data:|https?:|\/\/)/.test(src)) return whole;

    const file = path.resolve(baseDir, decodeURIComponent(src));
    if (!fs.existsSync(file)) {
      missing.push(src);
      return whole;
    }

    const mime = MIME[path.extname(file).toLowerCase()];
    if (!mime) {
      missing.push(`${src}(不支持的扩展名)`);
      return whole;
    }

    const buf = fs.readFileSync(file);
    count += 1;
    bytes += buf.length;
    return `${head}data:${mime};base64,${buf.toString('base64')}${tail}`;
  });

  if (missing.length > 0) {
    console.error(`找不到 ${missing.length} 个图片文件:\n  ${missing.join('\n  ')}`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(output, out);

  const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
  console.log(`内联 ${count} 张图片(原始 ${mb(bytes)});产出 ${output} ${mb(Buffer.byteLength(out))}`);
}

main(process.argv.slice(2));
