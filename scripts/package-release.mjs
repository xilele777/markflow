#!/usr/bin/env node
// 仅在本地组装产物，不连接服务器。先分别构建两个仓库。
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const server = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const web = realpathSync(resolve(process.argv[2] ?? '../lingshu-web'));
const output = resolve(process.argv[3] ?? './artifacts');
const release = process.argv[4] ?? new Date().toISOString().replace(/[-:.]/g, '');
if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/.test(release)) throw new Error('Invalid release name');
const target = resolve(output, release);
for (const source of [resolve(server, 'dist'), resolve(web, 'dist')]) {
  const rel = relative(source, target);
  if (!isAbsolute(rel) && !rel.startsWith('..')) throw new Error('Output must be outside source dist');
}
for (const file of [resolve(server, 'dist/main.js'), resolve(web, 'dist/index.html')]) {
  if (!existsSync(file)) throw new Error(`Build first: missing ${file}`);
}
if (existsSync(target)) throw new Error('Release already exists; choose a new name');
const revision = (dir) => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
const dirty = (dir) => execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' }).trim() !== '';
mkdirSync(resolve(target, 'server'), { recursive: true });
for (const name of ['dist', 'package.json', 'package-lock.json']) cpSync(resolve(server, name), resolve(target, 'server', name), { recursive: true });
cpSync(resolve(web, 'dist'), resolve(target, 'web'), { recursive: true });
cpSync(resolve(server, 'deploy/ecosystem.config.cjs'), resolve(target, 'ecosystem.config.cjs'));
mkdirSync(resolve(target, 'scripts'));
for (const name of ['activate.sh', 'smoke.sh', 'smoke.mjs']) cpSync(resolve(server, 'scripts', name), resolve(target, 'scripts', name));
const manifest = { release, createdAt: new Date().toISOString(), server: revision(server), web: revision(web), serverDirty: dirty(server), webDirty: dirty(web), node: process.version };
writeFileSync(resolve(target, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(resolve(target, 'web/release.json'), JSON.stringify({ release, server: manifest.server, web: manifest.web }) + '\n');
// 检查入口而非复制整个仓库，避免 .env / git / 测试数据被打包。
JSON.parse(readFileSync(resolve(target, 'server/package.json'), 'utf8'));
console.log(`Prepared ${target}\n${JSON.stringify(manifest)}`);
