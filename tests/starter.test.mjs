import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, mkdir, writeFile, symlink, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const copier = fileURLToPath(new URL('../scripts/create-wiki.mjs', import.meta.url));
const source = fileURLToPath(new URL('../examples/starter/', import.meta.url));
async function sandbox(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'commune-starter-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('starter copies from an unrelated cwd, including dotfiles and only published dependencies', async t => {
  const cwd = await sandbox(t);
  const { stdout } = await exec(process.execPath, [copier, 'a wiki'], { cwd });
  assert.match(stdout, /No dependencies were installed/);
  const destination = path.join(cwd, 'a wiki');
  const manifest = JSON.parse(await readFile(path.join(destination, 'package.json'), 'utf8'));
  assert.match(manifest.dependencies['@dmthepm/commune'], /^\^\d+\.\d+\.\d+$/);
  assert.match(manifest.dependencies.astro, /^\^?7\./);
  assert.equal(manifest.license, 'MIT');
  for (const dependency of Object.values(manifest.dependencies)) assert.doesNotMatch(dependency, /file:|link:|workspace:|\.\.\//);
  assert.match(await readFile(path.join(destination, '.gitignore'), 'utf8'), /node_modules/);
  assert.match(await readFile(path.join(destination, 'LICENSE'), 'utf8'), /MIT License/);
  assert.deepEqual((await readdir(destination)).filter(name => ['node_modules', 'dist', '.astro'].includes(name)), []);
  assert.equal(await readFile(path.join(destination, 'src/layouts/WikiLayout.astro'), 'utf8'), await readFile(path.join(source, 'src/layouts/WikiLayout.astro'), 'utf8'));
});

test('copier refuses existing directories, files, and symlinks without overwriting', async t => {
  const cwd = await sandbox(t);
  await mkdir(path.join(cwd, 'empty'));
  await writeFile(path.join(cwd, 'existing'), 'keep me');
  await symlink(path.join(cwd, 'empty'), path.join(cwd, 'alias'));
  for (const target of ['empty', 'existing', 'alias']) {
    await assert.rejects(exec(process.execPath, [copier, target], { cwd }), /Could not create wiki/);
  }
  assert.equal(await readFile(path.join(cwd, 'existing'), 'utf8'), 'keep me');
  assert.deepEqual(await readdir(path.join(cwd, 'empty')), []);
});

test('copier requires exactly one destination and rejects copying inside its source', async t => {
  const cwd = await sandbox(t);
  for (const args of [[], ['--help'], ['one', 'two'], [path.join(source, 'nested-copy')]]) {
    await assert.rejects(exec(process.execPath, [copier, ...args], { cwd }));
  }
  await assert.rejects(lstat(path.join(source, 'nested-copy')), { code: 'ENOENT' });
  assert.deepEqual(await readdir(cwd), []);
  await symlink(source, path.join(cwd, 'source-alias'));
  await assert.rejects(exec(process.execPath, [copier, 'source-alias/another-copy'], { cwd }), /outside examples\/starter/);
  await assert.rejects(lstat(path.join(source, 'another-copy')), { code: 'ENOENT' });
});

test('published starter installs, builds, and passes semantic link/privacy checks in isolation', {
  skip: process.env.COMMUNE_STARTER_INSTALL !== '1' && 'Set COMMUNE_STARTER_INSTALL=1 to exercise the npm registry',
  timeout: 240_000,
}, async t => {
  const cwd = await sandbox(t);
  await exec(process.execPath, [copier, 'wiki'], { cwd });
  const options = { cwd: path.join(cwd, 'wiki'), timeout: 180_000, maxBuffer: 8 * 1024 * 1024 };
  for (const args of [['install'], ['run', 'build'], ['run', 'verify']]) {
    try { await exec('npm', args, options); }
    catch (error) { assert.fail(`npm ${args.join(' ')} failed:\n${error.stdout}\n${error.stderr}`); }
  }
});
