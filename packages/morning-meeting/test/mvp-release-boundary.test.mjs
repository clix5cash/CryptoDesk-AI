import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as publicApi from '../dist/index.js';

const packageNames = [
  'ai',
  'data',
  'integrations',
  'market-intelligence',
  'morning-meeting',
  'news-intelligence',
  'openai-runtime',
  'portfolio',
];

async function readJson(relativeUrl) {
  return JSON.parse(await readFile(new URL(relativeUrl, import.meta.url), 'utf8'));
}

test('exposes one contained transport-neutral MVP release surface', async () => {
  const source = await readFile(new URL('../src/mvp-application-api.ts', import.meta.url), 'utf8');
  const morningPackage = await readJson('../package.json');

  assert.equal(typeof publicApi.DefaultMorningMeetingMvpApplicationApi, 'function');
  assert.equal(typeof publicApi.validateMorningMeetingMvpApplicationApiInput, 'function');
  assert.equal(typeof publicApi.composeMorningMeetingPortfolioAi, 'function');
  assert.equal(typeof publicApi.composeMorningMeetingPortfolioAiLifecycle, 'function');
  assert.equal(typeof publicApi.MorningMeetingPortfolioAiApplicationError, 'function');
  assert.equal(source.match(/class DefaultMorningMeetingMvpApplicationApi/g)?.length, 1);
  assert.deepEqual(Object.keys(morningPackage.exports), ['.']);
  assert.equal(morningPackage.exports['.'].default, './dist/index.js');
  assert.equal(morningPackage.exports['.'].types, './dist/index.d.ts');
  assert.deepEqual(morningPackage.files, ['dist']);
  await assert.rejects(
    () => import('@cryptodesk-ai/morning-meeting/mvp-application-api'),
    (error) => error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
  );
  assert.equal(
    /fetch\(|process\.env|apiKey|authorization|credential|rawOutput|retry|fallback|scheduler|cron|database|providerRequest|openai-runtime/.test(
      source,
    ),
    false,
  );
});

test('keeps the workspace release dependency graph acyclic and one-way', async () => {
  const manifests = new Map(
    await Promise.all(
      packageNames.map(async (name) => {
        const manifest = await readJson(`../../${name}/package.json`);
        return [manifest.name, manifest];
      }),
    ),
  );
  const dependencies = new Map(
    [...manifests].map(([name, manifest]) => [
      name,
      Object.keys(manifest.dependencies ?? {}).filter((dependency) => manifests.has(dependency)),
    ]),
  );

  assert.equal(
    manifests.get('@cryptodesk-ai/morning-meeting').dependencies['@cryptodesk-ai/ai'],
    'workspace:*',
  );
  assert.equal(
    manifests.get('@cryptodesk-ai/portfolio').dependencies?.['@cryptodesk-ai/ai'],
    undefined,
  );
  assert.equal(
    manifests.get('@cryptodesk-ai/ai').dependencies?.['@cryptodesk-ai/morning-meeting'],
    undefined,
  );
  assert.equal(
    manifests.get('@cryptodesk-ai/openai-runtime').dependencies?.['@cryptodesk-ai/morning-meeting'],
    undefined,
  );

  const visiting = new Set();
  const visited = new Set();
  const visit = (name) => {
    assert.equal(visiting.has(name), false, `Circular workspace dependency at ${name}`);
    if (visited.has(name)) return;
    visiting.add(name);
    for (const dependency of dependencies.get(name) ?? []) visit(dependency);
    visiting.delete(name);
    visited.add(name);
  };
  for (const name of manifests.keys()) visit(name);

  assert.equal(visited.size, manifests.size);
});
