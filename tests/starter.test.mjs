import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { mkdtemp, readFile, readdir, mkdir, writeFile, symlink, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const copier = fileURLToPath(new URL('../scripts/create-wiki.mjs', import.meta.url));
const bin = fileURLToPath(new URL('../bin/commune.mjs', import.meta.url));
const source = fileURLToPath(new URL('../examples/starter/', import.meta.url));
const root = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
// A stand-in `npm` first on PATH, so no test here asks the real registry.
// FAKE_NPM picks the answer: "exists" serves any version, "missing" answers
// E404 for a pinned version and 0.0.9 as latest, "fail" cannot be reached.
const fakeBin = mkdtempSync(path.join(tmpdir(), 'commune-fake-npm-'));
process.on('exit', () => rmSync(fakeBin, { recursive: true, force: true }));
writeFileSync(path.join(fakeBin, 'npm'), `#!${process.execPath}
const [, , command, spec, field] = process.argv;
const mode = process.env.FAKE_NPM;
if (command !== 'view' || mode === 'fail') { console.error('npm error network'); process.exit(1); }
if (field === 'dist-tags.latest') { console.log(JSON.stringify('0.0.9')); process.exit(0); }
if (mode === 'missing') { console.log(JSON.stringify({ error: { code: 'E404' } })); process.exit(1); }
console.log(JSON.stringify(spec.split('@').pop()));
`, { mode: 0o755 });
function npmEnv(mode) {
  return { ...process.env, PATH: fakeBin + path.delimiter + process.env.PATH, FAKE_NPM: mode };
}
async function sandbox(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'commune-starter-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('starter copies from an unrelated cwd, including dotfiles and only published dependencies', async t => {
  const cwd = await sandbox(t);
  const { stdout } = await exec(process.execPath, [copier, 'a wiki'], { cwd, env: npmEnv("fail") });
  assert.match(stdout, /No dependencies were installed/);
  const destination = path.join(cwd, 'a wiki');
  const manifest = JSON.parse(await readFile(path.join(destination, 'package.json'), 'utf8'));
  // Pinned to this release. release-please rewrites it in the release PR
  // (release-please-config.json, extra-files), so a starter copied from any
  // tag installs the engine that tag describes.
  assert.equal(manifest.dependencies['@dmthepm/commune'], root.version);
  assert.match(manifest.dependencies.astro, /^\^?7\./);
  assert.equal(manifest.license, 'MIT');
  for (const dependency of Object.values(manifest.dependencies)) assert.doesNotMatch(dependency, /file:|link:|workspace:|\.\.\//);
  assert.match(await readFile(path.join(destination, '.gitignore'), 'utf8'), /node_modules/);
  assert.match(await readFile(path.join(destination, 'LICENSE'), 'utf8'), /MIT License/);
  assert.deepEqual((await readdir(destination)).filter(name => ['node_modules', 'dist', '.astro'].includes(name)), []);
  assert.equal(await readFile(path.join(destination, 'src/layouts/WikiLayout.astro'), 'utf8'), await readFile(path.join(source, 'src/layouts/WikiLayout.astro'), 'utf8'));
});

test('copier names the wiki the way it was asked for', async t => {
  const cwd = await sandbox(t);
  const { stdout: plain } = await exec(process.execPath, [copier, 'my-wiki'], { cwd, env: npmEnv("fail") });
  assert.match(plain, /^Created my-wiki\n/);
  assert.match(plain, /\n  cd my-wiki\n/);
  const { stdout: spaced } = await exec(process.execPath, [copier, 'a wiki'], { cwd, env: npmEnv("fail") });
  assert.match(spaced, /\n  cd 'a wiki'\n/);
  const outside = await sandbox(t);
  const elsewhere = path.join(outside, 'far');
  const { stdout: absolute } = await exec(process.execPath, [copier, elsewhere], { cwd, env: npmEnv("fail") });
  assert.ok(absolute.startsWith(`Created ${elsewhere}\n`), 'a destination outside the cwd stays absolute');
  const { stdout: dashed } = await exec(process.execPath, [copier, './-wiki'], { cwd, env: npmEnv("fail") });
  assert.match(dashed, /\n  cd \.\/-wiki\n/, 'a name starting with a dash is not read as an option');
  const { stdout: dotted } = await exec(process.execPath, [copier, '..wiki'], { cwd, env: npmEnv("fail") });
  assert.match(dotted, /\n  cd \.\.wiki\n/, 'a name starting with two dots is still inside the cwd');
});

test('copier keeps the pin when the registry has it', async t => {
  const cwd = await sandbox(t);
  const { stdout } = await exec(process.execPath, [copier, 'wiki'], { cwd, env: npmEnv('exists') });
  assert.doesNotMatch(stdout, /not on npm yet/);
  const manifest = JSON.parse(await readFile(path.join(cwd, 'wiki/package.json'), 'utf8'));
  assert.equal(manifest.dependencies['@dmthepm/commune'], root.version);
});

test('copier writes the registry latest when the pinned version is not published yet', async t => {
  const cwd = await sandbox(t);
  const { stdout } = await exec(process.execPath, [copier, 'wiki'], { cwd, env: npmEnv('missing') });
  assert.ok(stdout.startsWith(`@dmthepm/commune ${root.version} is not on npm yet, using 0.0.9\n`));
  const manifest = JSON.parse(await readFile(path.join(cwd, 'wiki/package.json'), 'utf8'));
  assert.equal(manifest.dependencies['@dmthepm/commune'], '0.0.9');
  assert.equal(manifest.dependencies.astro, JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8')).dependencies.astro);
});

test('copier keeps the pin and says nothing when the registry cannot be asked', async t => {
  const cwd = await sandbox(t);
  const { stdout, stderr } = await exec(process.execPath, [copier, 'wiki'], { cwd, env: npmEnv('fail') });
  assert.doesNotMatch(stdout + stderr, /not on npm yet/);
  const manifest = JSON.parse(await readFile(path.join(cwd, 'wiki/package.json'), 'utf8'));
  assert.equal(manifest.dependencies['@dmthepm/commune'], root.version);
});

test('copier refuses existing directories, files, and symlinks without overwriting', async t => {
  const cwd = await sandbox(t);
  await mkdir(path.join(cwd, 'empty'));
  await writeFile(path.join(cwd, 'existing'), 'keep me');
  await symlink(path.join(cwd, 'empty'), path.join(cwd, 'alias'));
  for (const target of ['empty', 'existing', 'alias']) {
    await assert.rejects(exec(process.execPath, [copier, target], { cwd, env: npmEnv("fail") }), /Could not create wiki/);
  }
  assert.equal(await readFile(path.join(cwd, 'existing'), 'utf8'), 'keep me');
  assert.deepEqual(await readdir(path.join(cwd, 'empty')), []);
});

test('copier requires exactly one destination and rejects copying inside its source', async t => {
  const cwd = await sandbox(t);
  for (const args of [[], ['--help'], ['one', 'two'], [path.join(source, 'nested-copy')]]) {
    await assert.rejects(exec(process.execPath, [copier, ...args], { cwd, env: npmEnv("fail") }));
  }
  await assert.rejects(lstat(path.join(source, 'nested-copy')), { code: 'ENOENT' });
  assert.deepEqual(await readdir(cwd), []);
  await symlink(source, path.join(cwd, 'source-alias'));
  await assert.rejects(exec(process.execPath, [copier, 'source-alias/another-copy'], { cwd, env: npmEnv("fail") }), /outside examples\/starter/);
  await assert.rejects(lstat(path.join(source, 'another-copy')), { code: 'ENOENT' });
});

test('published starter installs, builds, and passes semantic link/privacy checks in isolation', {
  skip: process.env.COMMUNE_STARTER_INSTALL !== '1' && 'Set COMMUNE_STARTER_INSTALL=1 to exercise the npm registry',
  timeout: 240_000,
}, async t => {
  // In a release pull request the starter already pins the version that
  // merging will publish, so the registry cannot serve it yet. The release
  // workflow's own test run covers that tag after it is published.
  const { stdout: published } = await exec('npm', ['view', `@dmthepm/commune@${root.version}`, 'version']).catch(() => ({ stdout: '' }));
  if (!published.trim()) return t.skip(`@dmthepm/commune@${root.version} is not on npm yet`);
  const cwd = await sandbox(t);
  await exec(process.execPath, [copier, 'wiki'], { cwd });
  const options = { cwd: path.join(cwd, 'wiki'), timeout: 180_000, maxBuffer: 8 * 1024 * 1024 };
  for (const args of [['install'], ['run', 'build'], ['run', 'verify']]) {
    try { await exec('npm', args, options); }
    catch (error) { assert.fail(`npm ${args.join(' ')} failed:\n${error.stdout}\n${error.stderr}`); }
  }
});

test('commune create is the same copier, reachable without a clone or a shell', async t => {
  const cwd = await sandbox(t);
  const { stdout } = await exec(process.execPath, [bin, 'create', 'a wiki'], { cwd, env: npmEnv('missing') });
  assert.ok(stdout.startsWith(`@dmthepm/commune ${root.version} is not on npm yet, using 0.0.9\n`));
  assert.match(stdout, /Created a wiki\n\nNext:\n  cd 'a wiki'\n  npm install\n/);
  assert.match(stdout, /No dependencies were installed/);
  const destination = path.join(cwd, 'a wiki');
  const manifest = JSON.parse(await readFile(path.join(destination, 'package.json'), 'utf8'));
  assert.equal(manifest.dependencies['@dmthepm/commune'], '0.0.9');
  assert.match(await readFile(path.join(destination, '.gitignore'), 'utf8'), /node_modules/);
  assert.deepEqual((await readdir(destination)).filter(name => ['node_modules', 'dist', '.astro'].includes(name)), []);
});

test('commune create refuses what the script refuses', async t => {
  const cwd = await sandbox(t);
  await mkdir(path.join(cwd, 'empty'));
  await assert.rejects(exec(process.execPath, [bin, 'create', 'empty'], { cwd, env: npmEnv('fail') }), /Could not create wiki/);
  for (const args of [[], ['one', 'two'], ['--bogus']]) {
    await assert.rejects(exec(process.execPath, [bin, 'create', ...args], { cwd, env: npmEnv('fail') }), /Usage/);
  }
  await assert.rejects(exec(process.execPath, [bin, 'create', path.join(source, 'nested-copy')], { cwd, env: npmEnv('fail') }), /outside examples\/starter/);
  assert.deepEqual(await readdir(cwd), ['empty']);
});

test('commune create is listed in the usage text', async () => {
  const { stdout } = await exec(process.execPath, [bin, '--help']);
  assert.match(stdout, /commune create\s+<dir>/);
});

test('the package ships the starter and none of its build output', async t => {
  const cwd = await sandbox(t);
  // Marker files only, so a working examples/starter/node_modules or dist survives this test.
  const probes = [path.join(source, 'dist/.pack-probe.html'), path.join(source, 'node_modules/.pack-probe.js')];
  for (const probe of probes) {
    await mkdir(path.dirname(probe), { recursive: true });
    await writeFile(probe, 'junk');
  }
  t.after(() => Promise.all(probes.map(probe => rm(probe, { force: true }))));
  const { stdout } = await exec('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: fileURLToPath(new URL('..', import.meta.url)), maxBuffer: 8 * 1024 * 1024 });
  const files = JSON.parse(stdout.slice(stdout.search(/^\[/m)))[0].files.map(file => file.path);
  for (const wanted of ['examples/starter/package.json', 'examples/starter/src/pages/index.astro', 'examples/starter/scripts/verify-build.mjs', 'examples/starter/LICENSE', 'bin/create.mjs']) {
    assert.ok(files.includes(wanted), `${wanted} is packed`);
  }
  assert.deepEqual(files.filter(file => /(^|\/)(node_modules|dist|\.astro)\//.test(file) || /backlinks\.json|site\.json/.test(file)), []);
});

test('the README install has no && and no line that PowerShell 5.1 would refuse', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const starter = await readFile(new URL('../examples/starter/README.md', import.meta.url), 'utf8');
  for (const [name, text] of [['README.md', readme], ['starter README', starter]]) {
    const blocks = [...text.matchAll(/```(?:bash|sh|powershell|cmd)?\n([\s\S]*?)```/g)].map(match => match[1]);
    for (const line of blocks.join('\n').split('\n')) assert.doesNotMatch(line, /&&|\|\|/, `${name}: ${line}`);
  }
  assert.match(readme, /npx -y @dmthepm\/commune create my-wiki/);
  assert.doesNotMatch(readme + starter, /npx @dmthepm\/commune create/, 'a paste needs -y, or npx reads the next pasted line as its answer');
});

test('the ignore file an installed package writes matches the starter\'s own', async () => {
  const { GITIGNORE } = await import(new URL('../bin/create.mjs', import.meta.url));
  assert.equal(GITIGNORE, await readFile(path.join(source, '.gitignore'), 'utf8'));
});
