import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
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

test('contains the built release artifacts and emits the required public declarations', async () => {
  const morningDeclaration = await readFile(new URL('../dist/index.d.ts', import.meta.url), 'utf8');
  const mvpDeclaration = await readFile(
    new URL('../dist/mvp-application-api.d.ts', import.meta.url),
    'utf8',
  );
  const aiDeclaration = await readFile(
    new URL('../../ai/dist/index.d.ts', import.meta.url),
    'utf8',
  );
  const runtimeDeclaration = await readFile(
    new URL('../../openai-runtime/dist/index.d.ts', import.meta.url),
    'utf8',
  );
  const runtimeFiles = await readdir(new URL('../../openai-runtime/dist/', import.meta.url));
  const morningFiles = await readdir(new URL('../dist/', import.meta.url));
  const builtText = [morningDeclaration, mvpDeclaration, aiDeclaration, runtimeDeclaration].join(
    '\n',
  );

  assert.match(morningDeclaration, /mvp-application-api/u);
  assert.match(mvpDeclaration, /DefaultMorningMeetingMvpApplicationApi/u);
  assert.match(mvpDeclaration, /MorningMeetingMvpApplicationApiInput/u);
  assert.match(aiDeclaration, /portfolio-model-execution/u);
  assert.match(runtimeDeclaration, /createOpenAiPortfolioModelProviderAdapter/u);
  assert.deepEqual(runtimeFiles.sort(), [
    'index.d.ts',
    'index.d.ts.map',
    'index.js',
    'openai-portfolio-adapter.d.ts',
    'openai-portfolio-adapter.d.ts.map',
    'openai-portfolio-adapter.js',
  ]);
  assert.equal(
    morningFiles.some((file) => /\.test\.|fixture|secret/iu.test(file)),
    false,
  );
  assert.equal(
    runtimeFiles.some((file) => /\.test\.|fixture|secret/iu.test(file)),
    false,
  );
  assert.equal(
    /secret-never-exposed|prototype-secret|authorization:\s*Bearer/iu.test(builtText),
    false,
  );
  assert.equal(/@cryptodesk-ai\/openai-runtime/u.test(aiDeclaration), false);
  assert.equal(/@cryptodesk-ai\/morning-meeting/u.test(aiDeclaration), false);
});

test('closes the Sprint 9F release boundary without runtime, state, or publishing expansion', async () => {
  const [mvpSource, lifecycleSource, compositionSource, runtimeSource] = await Promise.all([
    readFile(new URL('../src/mvp-application-api.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/portfolio-ai-application-flow.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/portfolio-ai-composition.ts', import.meta.url), 'utf8'),
    readFile(
      new URL('../../openai-runtime/src/openai-portfolio-adapter.ts', import.meta.url),
      'utf8',
    ),
  ]);
  const applicationSources = [mvpSource, lifecycleSource, compositionSource].join('\n');
  const manifests = await Promise.all(
    packageNames.map((name) => readJson(`../../${name}/package.json`)),
  );

  assert.equal(mvpSource.match(/class DefaultMorningMeetingMvpApplicationApi/g)?.length, 1);
  assert.equal(mvpSource.match(/morningMeetingService\.generate\(/g)?.length, 1);
  assert.equal(mvpSource.match(/composeMorningMeetingPortfolioAiLifecycle\(\{/g)?.length, 1);
  assert.equal(
    /apiKey|authorization|Bearer|process\.env|fetch\(|openai-runtime|providerRequest/iu.test(
      applicationSources,
    ),
    false,
  );
  assert.match(runtimeSource, /authorization: `Bearer \$\{runtime\.apiKey\}`/u);
  assert.equal(/process\.env|console\.(?:log|error|warn)/u.test(runtimeSource), false);
  assert.equal(
    /while\s*\(|retry|fallback|scheduler|cron|database|websocket|express|fastify|graphql/iu.test(
      mvpSource,
    ),
    false,
  );

  for (const manifest of manifests) {
    assert.equal(manifest.private, true);
    assert.equal(manifest.version, '0.0.0');
    assert.deepEqual(Object.keys(manifest.exports), ['.']);
    assert.equal(
      Object.keys(manifest.scripts ?? {}).some((script) =>
        /publish|deploy|serve|start|release/iu.test(script),
      ),
      false,
    );
  }
});
