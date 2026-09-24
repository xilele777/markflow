/**
 * Bundle Size 预算检查 —— CI 门禁。
 *
 * 度量口径：解析 dist/index.html 的入口 <script type="module"> 与 <link rel="modulepreload">，
 * 把这组「首屏必须下载的 JS」的 gzip 总量与预算比较；另检查最大单 chunk 的 gzip。
 *
 * 基线（2026-09-22，M4 拆包后实测，见 docs/handoff/0008）：
 * - 拆包前：单文件 1820 kB raw / 571 kB gzip。
 * - 拆包后入口预加载：entry(含首屏用到的 antd 部分) + react + state 共 3 chunk，
 *   raw 832 kB / gzip 270 kB；Puck 88.5 kB gzip、DataTable 55 kB gzip 等随页面按需加载。
 *   antd 不强制合包（合包后 302 kB gzip 会整体进入口），交给 Rollup 按引用拆。
 *
 * 阈值（gzip）：入口预加载总量 < ENTRY_PRELOAD_GZIP_MAX；单 chunk < SINGLE_CHUNK_GZIP_MAX。
 * 调整预算须在 handoff 快照里记录原因。
 */
const { readdirSync, readFileSync, existsSync } = require('fs');
const { join, resolve } = require('path');
const { gzipSync } = require('zlib');

const DIST_DIR = resolve(process.cwd(), 'dist');
const JS_DIR = join(DIST_DIR, 'assets');

const BUDGET = {
  entryPreloadGzipMax: 300 * 1024,
  singleChunkGzipMax: 200 * 1024,
};

if (!existsSync(join(DIST_DIR, 'index.html'))) {
  console.error('dist/index.html 不存在，请先执行 npm run build');
  process.exit(1);
}

const html = readFileSync(join(DIST_DIR, 'index.html'), 'utf8');
const entryFiles = [];
for (const match of html.matchAll(
  /<(?:script[^>]+type="module"[^>]+src|link[^>]+rel="modulepreload"[^>]+href)="([^"]+\.js)"/g,
)) {
  entryFiles.push(match[1].replace(/^\//, ''));
}

if (entryFiles.length === 0) {
  console.error('未从 dist/index.html 解析到任何入口 JS，检查构建产物');
  process.exit(1);
}

function measure(filePath) {
  const buf = readFileSync(filePath);
  return { raw: buf.length, gzip: gzipSync(buf).length };
}

const kb = (bytes) => (bytes / 1024).toFixed(1);

let entryRaw = 0;
let entryGzip = 0;
console.log('Bundle Size Report (markflow-web)');
console.log('─'.repeat(60));
console.log(`Entry preload JS (${entryFiles.length} files, entry + modulepreload):`);
for (const file of entryFiles) {
  const { raw, gzip } = measure(join(DIST_DIR, file));
  entryRaw += raw;
  entryGzip += gzip;
  console.log(`  ${file}: ${kb(raw)} kB (gzip ${kb(gzip)} kB)`);
}
console.log(
  `  -> Total: ${kb(entryRaw)} kB raw / ${kb(entryGzip)} kB gzip` +
    ` (budget: ${kb(BUDGET.entryPreloadGzipMax)} kB gzip)`,
);

const chunks = readdirSync(JS_DIR)
  .filter((f) => f.endsWith('.js'))
  .map((file) => ({ file, ...measure(join(JS_DIR, file)) }))
  .sort((a, b) => b.gzip - a.gzip);
const maxChunk = chunks[0];
console.log('');
console.log('Top chunks by gzip:');
for (const c of chunks.slice(0, 8)) {
  console.log(`  ${c.file}: ${kb(c.raw)} kB (gzip ${kb(c.gzip)} kB)`);
}
console.log(
  `Largest chunk: ${maxChunk.file} — ${kb(maxChunk.gzip)} kB gzip` +
    ` (budget: ${kb(BUDGET.singleChunkGzipMax)} kB)`,
);

let failed = false;
if (entryGzip > BUDGET.entryPreloadGzipMax) {
  console.error(
    `\nENTRY PRELOAD BUDGET EXCEEDED: ${kb(entryGzip)} kB > ${kb(BUDGET.entryPreloadGzipMax)} kB`,
  );
  failed = true;
}
if (maxChunk.gzip > BUDGET.singleChunkGzipMax) {
  console.error(
    `\nSINGLE CHUNK BUDGET EXCEEDED: ${maxChunk.file} ${kb(maxChunk.gzip)} kB > ${kb(BUDGET.singleChunkGzipMax)} kB`,
  );
  failed = true;
}

if (!failed) {
  console.log('\nBundle size within budget');
} else {
  process.exit(1);
}
