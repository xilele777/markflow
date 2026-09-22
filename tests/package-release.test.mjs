import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '../apps/server/scripts/package-release.mjs');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'lingshu-monorepo-package-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, content) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  write('.gitignore', 'artifacts/\n.env\nnode_modules/\n');
  write('apps/server/package.json', '{"name":"release-fixture","private":true}\n');
  write('apps/server/package-lock.json', '{}\n');
  write('apps/server/dist/main.js', '// fixture backend\n');
  write('apps/web/dist/index.html', '<html>fixture frontend</html>\n');
  write('apps/server/deploy/ecosystem.config.cjs', 'module.exports = {};\n');
  for (const name of ['activate.sh', 'smoke.sh', 'smoke.mjs']) write(`apps/server/scripts/${name}`, '// fixture\n');
  cpSync(source, join(root, 'apps/server/scripts/package-release.mjs'));
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Release Fixture');
  git(root, 'config', 'user.email', 'release-fixture@example.invalid');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'fixture');
  write('apps/server/.env', 'FAKE_SECRET=not-for-release\n');
  write('apps/server/node_modules/private.txt', 'must not be copied\n');
  const run = (cwd = root, args = []) => spawnSync(process.execPath, [join(root, 'apps/server/scripts/package-release.mjs'), ...args], { cwd, encoding: 'utf8' });
  return { root, write, run, revision: git(root, 'rev-parse', 'HEAD') };
}

test('default paths work from the frontend directory and release contains one clean revision without secrets', (t) => {
  const f = fixture(t);
  const result = f.run(join(f.root, 'apps/web'));
  assert.equal(result.status, 0, result.stderr);
  const [name] = readdirSync(join(f.root, 'artifacts'));
  const target = join(f.root, 'artifacts', name);
  const manifest = JSON.parse(readFileSync(join(target, 'release.json'), 'utf8'));
  for (const key of ['repository', 'server', 'web']) assert.equal(manifest[key], f.revision);
  for (const key of ['repositoryDirty', 'serverDirty', 'webDirty']) assert.equal(manifest[key], false);
  assert.equal(JSON.parse(readFileSync(join(target, 'web/release.json'), 'utf8')).repository, f.revision);
  assert(existsSync(join(target, 'server/dist/main.js')));
  assert(existsSync(join(target, 'web/index.html')));
  for (const path of ['server/.env', 'server/.git', 'server/node_modules', 'server/src', '.git']) assert(!existsSync(join(target, path)), path);
});

test('shared untracked changes mark both applications dirty and an existing release cannot be overwritten', (t) => {
  const f = fixture(t);
  f.write('docs/change.md', 'shared change\n');
  const args = ['apps/web', 'artifacts', 'candidate'];
  const result = f.run(f.root, args);
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(readFileSync(join(f.root, 'artifacts/candidate/release.json'), 'utf8'));
  for (const key of ['repositoryDirty', 'serverDirty', 'webDirty']) assert.equal(manifest[key], true);
  const repeat = f.run(f.root, args);
  assert.notEqual(repeat.status, 0);
  assert.match(repeat.stderr, /Release already exists/);
});

test('packaging rejects a different checkout and release path traversal', (t) => {
  const f = fixture(t);
  const other = fixture(t);
  const mixed = f.run(f.root, [join(other.root, 'apps/web'), 'artifacts', 'mixed']);
  assert.notEqual(mixed.status, 0);
  assert.match(mixed.stderr, /Both applications must belong to this monorepo/);
  const invalid = f.run(f.root, ['apps/web', 'artifacts', '../escape']);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /Invalid release name/);
  assert(!existsSync(join(f.root, 'escape')));
});
