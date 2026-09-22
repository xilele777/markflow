#!/usr/bin/env node
// 仅在本地组装产物，不连接服务器。先构建 apps/server 与 apps/web。
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const server = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (args, cwd = server) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const repository = realpathSync(git(['rev-parse', '--show-toplevel']));
const web = realpathSync(process.argv[2] ? resolve(process.argv[2]) : resolve(repository, 'apps/web'));
if (realpathSync(server) !== realpathSync(resolve(repository, 'apps/server')) ||
    web !== realpathSync(resolve(repository, 'apps/web')) ||
    realpathSync(git(['rev-parse', '--show-toplevel'], web)) !== repository) {
  throw new Error('Both applications must belong to this monorepo (apps/server and apps/web)');
}
const output = process.argv[3] ? resolve(process.argv[3]) : resolve(repository, 'artifacts');
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
// 在写产物前读取整个仓库状态；文档、CI 或任一应用未提交都会标记 dirty。
const revision = git(['rev-parse', 'HEAD']);
const dirty = git(['status', '--porcelain', '--untracked-files=all'], repository) !== '';
// filter 保持 JS 目录遍历，避免部分 Windows / Node 版本在非 ASCII 路径上原生 cp 报 EIO。
const copyTree = (source, destination) => cpSync(source, destination, { recursive: true, filter: () => true });
mkdirSync(resolve(target, 'server'), { recursive: true });
for (const name of ['dist', 'package.json', 'package-lock.json']) copyTree(resolve(server, name), resolve(target, 'server', name));
copyTree(resolve(web, 'dist'), resolve(target, 'web'));
cpSync(resolve(server, 'deploy/ecosystem.config.cjs'), resolve(target, 'ecosystem.config.cjs'));
mkdirSync(resolve(target, 'scripts'));
for (const name of ['activate.sh', 'smoke.sh', 'smoke.mjs']) cpSync(resolve(server, 'scripts', name), resolve(target, 'scripts', name));
// 保留 server/web 字段兼容现有工具；合仓后它们与 repository 是同一个提交。
const manifest = { release, createdAt: new Date().toISOString(), repository: revision, repositoryDirty: dirty, server: revision, web: revision, serverDirty: dirty, webDirty: dirty, node: process.version };
writeFileSync(resolve(target, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(resolve(target, 'web/release.json'), JSON.stringify({ release, repository: revision, server: revision, web: revision }) + '\n');
// 检查入口而非复制整个仓库，避免 .env / git / 测试数据被打包。
JSON.parse(readFileSync(resolve(target, 'server/package.json'), 'utf8'));
console.log(`Prepared ${target}\n${JSON.stringify(manifest)}`);
