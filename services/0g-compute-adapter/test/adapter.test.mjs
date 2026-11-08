import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import {
  BoundaryError,
  SyntheticClock,
  createSyntheticComputeAdapter,
  createSyntheticConsumptionStore,
  createSyntheticTransport,
  syntheticDispatchCount,
  simulateStateLoss,
  hash,
  sha256,
  verificationProperties,
  parseBoundedJson,
  syntheticLimitations,
} from '../dist/index.js';
import {
  PortfolioAiTask,
  buildPortfolioAiContext,
  createPortfolioAiMessagePlan,
  createPortfolioAiModelInput,
  createPortfolioAiPromptDocument,
  createPortfolioAiProviderRequest,
  mapPortfolioAiProviderRequest,
  PortfolioAiModelProviderRegistry,
  invokePortfolioAiProviderAdapterBridge,
  validatePortfolioAiModelExecutionResult,
} from '../../../packages/ai/dist/index.js';

const D = 'a'.repeat(64);
const provider = `0x${'1'.repeat(40)}`;
const encoder = new TextEncoder();
function configuration(mode = 'router') {
  return {
    schemaVersion: 'zg-design-1',
    configId: 'synthetic-config',
    adapterProviderId: '0g-synthetic',
    providerAddress: provider,
    modelId: 'synthetic-model',
    network: { environment: 'testnet', chainId: 16602, approvedNetworkRevision: D },
    endpoint: 'https://compute.invalid/v1/chat/completions',
    credential: {
      credentialRef: 'synthetic:credential',
      generation: 'generation-1',
      kind: mode === 'router' ? 'router_inference' : 'direct_provider_inference',
      audienceConfigId: 'synthetic-config',
      expiresAt: 2000,
    },
    limits: {
      maxRequestBytes: 64000,
      maxResponseBytes: 16000,
      maxOutputBytes: 1000,
      maxOutputTokens: 100,
      maxJsonDepth: 32,
      maxHeaderBytes: 1000,
      totalDeadlineMs: 100,
    },
    verificationPolicy: {
      policyId: 'synthetic-policy',
      version: '1',
      required: [...verificationProperties],
      verifierRevision: 'synthetic-verifier-1',
      maxEvidenceAgeMs: 50,
      acceptedMeasurementPolicyDigest: D,
    },
    sourceRevision: 'zg-01-pinned-source',
    streaming: false,
    clientRetries: 0,
    redirects: 'reject',
    automaticFunding: false,
    mode,
    ...(mode === 'router'
      ? { allowCrossProviderFallback: false }
      : {
          sdkPackage: '@0gfoundation/0g-compute-ts-sdk',
          sdkVersion: '0.9.0',
          sdkCommit: 'bff29131f953d5b08ad0c40eb805d8e00408df77',
          contractSetDigest: D,
        }),
  };
}
function descriptor(executionId = 'synthetic-execution') {
  const context = buildPortfolioAiContext({
    analysisId: 'synthetic-analysis',
    task: PortfolioAiTask.Interpret,
    payload: {
      schemaVersion: '1',
      portfolioId: 'synthetic-portfolio',
      capturedAt: '2026-11-08T00:00:00.000Z',
      asOf: '2026-11-08T00:00:00.000Z',
      currency: 'USD',
      totalValuedValue: '0',
      coverage: {
        state: 'complete',
        valuation: {
          totalPositionCount: 0,
          valuedPositionCount: 0,
          unvaluedPositionCount: 0,
          valuedPositionCoveragePercentage: '100',
          unvaluedReasons: [],
        },
      },
      items: [],
      sections: [
        {
          id: JSON.stringify(['synthetic-portfolio', 'overview']),
          section: 'overview',
          itemIds: [],
        },
      ],
    },
  });
  return mapPortfolioAiProviderRequest(
    createPortfolioAiProviderRequest({
      executionId,
      model: { providerId: '0g-synthetic', modelId: 'synthetic-model' },
      promptDocument: createPortfolioAiPromptDocument(
        createPortfolioAiMessagePlan(
          createPortfolioAiModelInput({
            task: PortfolioAiTask.Interpret,
            context,
            factIds: [],
            sectionIds: context.sections.map((s) => s.id),
          }),
        ),
      ),
    }),
  );
}
function dependencies(
  config = configuration(),
  steps = [],
  clock = new SyntheticClock(1000),
  store,
) {
  const consumption = store ?? createSyntheticConsumptionStore(clock, 'fresh_test_scope');
  const transport = createSyntheticTransport(clock, steps);
  return { configuration: config, clock, transport, consumption };
}
async function prepare(adapter, suffix = '1') {
  return adapter.prepare(descriptor(`execution-${suffix}`), {
    requestId: `request-${suffix}`,
    attemptId: `attempt-${suffix}`,
    logicalOperationDigest: await sha256(`operation-${suffix}`),
    expiresAt: 1100,
  });
}
async function approvals(prepared, suffix = '1') {
  const financial = {
    permitId: `permit-${suffix}`,
    manifestDigest: prepared.manifestDigest,
    fundingApprovalRef: 'synthetic:funding-approval',
    accountScopeRef: 'synthetic:account',
    currency: '0g',
    maxTotalExposureAtomic: '1',
    enforcementEvidenceRef: 'synthetic:enforcement',
    expiresAt: 1100,
    replenishmentAllowed: false,
    inferenceCanManageAccount: false,
    provenance: 'synthetic',
  };
  const grant = {
    authorizationId: `authorization-${suffix}`,
    ownerApprovalRef: 'synthetic:owner-approval',
    manifestDigest: prepared.manifestDigest,
    financialPermitDigest: await hash(financial),
    credentialGeneration: 'generation-1',
    issuedAt: 1000,
    expiresAt: 1100,
    maximumDispatches: 1,
  };
  return { financial, grant };
}
async function response(prepared, overrides = {}) {
  const output = 'Synthetic output remains untrusted.';
  return {
    providerAddress: provider,
    modelId: 'synthetic-model',
    output,
    outputTokens: 6,
    completed: true,
    verification: {
      policyDigest: prepared.manifest.verificationPolicyDigest,
      checks: Object.fromEntries(verificationProperties.map((k) => [k, 'passed'])),
      provenance: 'synthetic',
      verifierRevision: 'synthetic-verifier-1',
      artifactDigest: await sha256(`artifact-${prepared.manifest.attemptId}`),
      signerRef: 'synthetic:signer',
      issuedAt: 1000,
      challengeDigest: prepared.manifestDigest,
      receivedContentDigest: await sha256(output),
      requestDigest: prepared.manifest.wireBodyDigest,
      modelId: 'synthetic-model',
      providerAddress: provider,
      measurementPolicyDigest: D,
    },
    ...overrides,
  };
}
function step(body, options = {}) {
  return {
    kind: 'response',
    status: 200,
    headers: {},
    body:
      typeof body === 'string'
        ? encoder.encode(body)
        : body instanceof Uint8Array
          ? body
          : encoder.encode(JSON.stringify(body)),
    delayMs: 0,
    ...options,
  };
}
// Prepare using one factory, then recreate deterministic response script and prepare identical bytes.
async function fixture({
  config = configuration(),
  mutate,
  raw,
  stepOptions,
  suffix = '1',
  clock = new SyntheticClock(1000),
  store,
} = {}) {
  const preview = createSyntheticComputeAdapter(dependencies(config, [], clock));
  const prior = await prepare(preview, suffix);
  const body = await response(prior);
  mutate?.(body);
  const deps = dependencies(config, [step(raw ?? body, stepOptions)], clock, store);
  const adapter = createSyntheticComputeAdapter(deps);
  const prepared = await prepare(adapter, suffix);
  assert.equal(prepared.manifestDigest, prior.manifestDigest);
  return { adapter, prepared, deps, body, ...(await approvals(prepared, suffix)) };
}
async function execute(f) {
  return f.adapter.run(f.prepared, f.grant, f.financial);
}
async function untilDispatch(deps, count = 1) {
  for (let i = 0; i < 100 && syntheticDispatchCount(deps.transport) < count; i++)
    await new Promise(setImmediate);
  assert.equal(syntheticDispatchCount(deps.transport), count);
}
function failed(result, code) {
  assert.equal(result.status, 'failed');
  assert.equal(result.code, code);
  assert.equal(Object.hasOwn(result, 'output'), false);
  assert.equal(result.evidence.remoteAttemptGuarantee, 'not_established');
  assert.equal(result.evidence.financialEnforcement, 'not_established');
}

for (const mode of ['router', 'direct'])
  test(`${mode}: valid immutable synthetic completion and exact manifest digests`, async () => {
    const f = await fixture({ config: configuration(mode) });
    const result = await execute(f);
    assert.equal(result.status, 'completed');
    assert.equal(result.authority, 'untrusted_model_execution');
    assert.equal(result.evidence.provenance, 'synthetic');
    assert.equal(result.evidence.dispatchCount, 1);
    assert.equal(result.evidence.consumption.durability, 'synthetic_memory_only');
    assert.equal(f.prepared.manifestDigest, await hash(f.prepared.manifest));
    assert.equal(result.evidence.verification.checks.signatureValidity, 'passed');
    assert.equal(Object.isFrozen(result.evidence.verification.checks), true);
    assert.equal(f.adapter.evidence(f.prepared), result.evidence);
    assert.equal(f.deps.clock.pending(), 0);
  });

for (const [label, mutate, code] of [
  ['network', (c) => (c.network.chainId = 1979), 'network_mismatch'],
  ['environment', (c) => (c.network.environment = 'mainnet'), 'network_mismatch'],
  [
    'live endpoint',
    (c) => (c.endpoint = 'https://router-api.0g.ai/v1/chat/completions'),
    'configuration_invalid',
  ],
  ['endpoint path', (c) => (c.endpoint += '/other'), 'configuration_invalid'],
  ['endpoint query', (c) => (c.endpoint += '?secret=sentinel'), 'configuration_invalid'],
  [
    'credential kind',
    (c) => (c.credential.kind = 'direct_provider_inference'),
    'credential_invalid',
  ],
  ['credential audience', (c) => (c.credential.audienceConfigId = 'other'), 'credential_invalid'],
  [
    'real credential reference',
    (c) => (c.credential.credentialRef = 'real:secret'),
    'credential_invalid',
  ],
  ['missing model', (c) => delete c.modelId, 'configuration_invalid'],
  ['unknown field', (c) => (c.unknown = true), 'configuration_invalid'],
  ['funding capability', (c) => (c.wallet = { sign: () => {} }), 'configuration_invalid'],
  ['fallback enabled', (c) => (c.allowCrossProviderFallback = true), 'configuration_invalid'],
  ['retry enabled', (c) => (c.clientRetries = 1), 'configuration_invalid'],
  ['invalid limit', (c) => (c.limits.maxJsonDepth = 1000), 'configuration_invalid'],
])
  test(`reject config: ${label}`, () => {
    const c = configuration();
    mutate(c);
    assert.throws(
      () => createSyntheticComputeAdapter(dependencies(c)),
      (e) => e instanceof BoundaryError && e.code === code,
    );
  });

test('reject arbitrary transport, store, clock and funding injection', () => {
  const deps = dependencies();
  for (const changes of [
    { transport: { executeOnce: () => {} } },
    { consumption: { consume: () => {} } },
    { clock: { now: () => 1000 } },
    { deposit: () => {} },
  ]) {
    assert.throws(
      () => createSyntheticComputeAdapter({ ...deps, ...changes }),
      (e) => e.code === 'forbidden_capability',
    );
  }
});

test('config and scripted bytes are detached from caller mutation', async () => {
  const f = await fixture();
  f.deps.configuration.modelId = 'changed';
  const pending = execute(f);
  f.grant.maximumDispatches = 99;
  f.financial.replenishmentAllowed = true;
  assert.equal((await pending).status, 'completed');
  const bytes = encoder.encode('{"original":true}');
  const transport = createSyntheticTransport(new SyntheticClock(1000), [step(bytes)]);
  bytes.fill(0);
  assert.equal(syntheticDispatchCount(transport), 0);
});

for (const [label, mutate, code] of [
  ['provider', (d) => (d.model.providerId = 'other'), 'provider_mismatch'],
  ['unsupported model', (d) => (d.model.modelId = 'other'), 'unsupported_model'],
  ['missing field', (d) => delete d.executionId, 'request_invalid'],
  ['unknown field', (d) => (d.extra = true), 'request_invalid'],
  ['nested identity', (d) => (d.request.executionId = 'other'), 'request_invalid'],
])
  test(`prepare rejects ${label}`, async () => {
    const adapter = createSyntheticComputeAdapter(dependencies());
    const d = descriptor();
    mutate(d);
    await assert.rejects(
      () =>
        adapter.prepare(d, {
          requestId: 'request',
          attemptId: 'attempt',
          logicalOperationDigest: D,
          expiresAt: 1100,
        }),
      (e) => e.code === code,
    );
  });

test('prepare enforces byte/depth limits and refuses accessors and cycles', async () => {
  for (const variant of ['bytes', 'depth', 'accessor', 'cycle']) {
    const d = descriptor();
    const c = configuration();
    if (variant === 'bytes') c.limits.maxRequestBytes = 10;
    if (variant === 'depth') c.limits.maxJsonDepth = 2;
    if (variant === 'accessor')
      Object.defineProperty(d, 'executionId', {
        get() {
          throw new Error('SECRET');
        },
        enumerable: true,
      });
    if (variant === 'cycle') d.blocks.push(d);
    const adapter = createSyntheticComputeAdapter(dependencies(c));
    await assert.rejects(
      () =>
        adapter.prepare(d, {
          requestId: 'request',
          attemptId: 'attempt',
          logicalOperationDigest: D,
          expiresAt: 1100,
        }),
      (e) =>
        ['request_invalid', 'input_limit_exceeded'].includes(e.code) &&
        !e.message.includes('SECRET'),
    );
  }
});

for (const [label, raw, code] of [
  ['malformed', '{', 'response_malformed'],
  ['duplicate key', '{"output":"a","output":"b"}', 'response_malformed'],
  ['escaped duplicate', '{"output":"a","out\\u0070ut":"b"}', 'response_malformed'],
  ['UTF-8', new Uint8Array([0xc3, 0x28]), 'response_malformed'],
  ['depth', '['.repeat(40) + '0' + ']'.repeat(40), 'response_limit_exceeded'],
  ['oversized', 'x'.repeat(16001), 'response_limit_exceeded'],
  ['prototype key', '{"__proto__":{}}', 'response_malformed'],
  ['trailing content', '{}{}', 'response_malformed'],
])
  test(`response rejects ${label}`, async () =>
    failed(await execute(await fixture({ raw })), code));

for (const [label, mutate, code] of [
  ['provider mismatch', (b) => (b.providerAddress = `0x${'2'.repeat(40)}`), 'provider_mismatch'],
  ['model mismatch', (b) => (b.modelId = 'other'), 'model_mismatch'],
  ['missing output', (b) => delete b.output, 'response_malformed'],
  ['unknown field', (b) => (b.secret = 'SECRET'), 'response_malformed'],
  ['excess output bytes', (b) => (b.output = 'x'.repeat(1001)), 'response_limit_exceeded'],
  ['excess output tokens', (b) => (b.outputTokens = 101), 'response_limit_exceeded'],
  ['incomplete inference', (b) => (b.completed = false), 'response_malformed'],
  [
    'invalid signature',
    (b) => (b.verification.checks.signatureValidity = 'failed'),
    'verification_invalid',
  ],
  ['missing verification', (b) => delete b.verification, 'verification_missing'],
  [
    'missing attestation',
    (b) => (b.verification.checks.attestationCompleteness = 'missing'),
    'verification_missing',
  ],
  [
    'unsupported verifier',
    (b) => (b.verification.checks.signatureValidity = 'unsupported'),
    'verification_unsupported',
  ],
  ['content binding', (b) => (b.verification.receivedContentDigest = D), 'verification_mismatch'],
  ['request binding', (b) => (b.verification.requestDigest = D), 'verification_mismatch'],
  ['stale evidence', (b) => (b.verification.issuedAt = 900), 'verification_stale'],
  ['future evidence', (b) => (b.verification.issuedAt = 1001), 'verification_stale'],
  [
    'real verification provenance',
    (b) => (b.verification.provenance = 'independently_checked'),
    'verification_invalid',
  ],
  ['malformed verification', (b) => delete b.verification.checks, 'verification_invalid'],
])
  test(`terminal failure: ${label}`, async () =>
    failed(await execute(await fixture({ mutate })), code));

test('duplicate attempts and concurrent submissions dispatch at most once', async () => {
  const f = await fixture();
  const results = await Promise.all([execute(f), execute(f)]);
  assert.equal(results.filter((r) => r.status === 'completed').length, 1);
  failed(
    results.find((r) => r.status === 'failed'),
    'duplicate_attempt',
  );
  failed(await execute(f), 'duplicate_attempt');
  assert.equal(syntheticDispatchCount(f.deps.transport), 1);
});

test('ID collision and reused authorization cannot create a fresh dispatch', async () => {
  const f = await fixture();
  await execute(f);
  const p = await f.adapter.prepare(descriptor('other-execution'), {
    requestId: 'request-1',
    attemptId: 'new-attempt',
    logicalOperationDigest: D,
    expiresAt: 1100,
  });
  const a = await approvals(p, 'other');
  failed(await f.adapter.run(p, a.grant, a.financial), 'identity_collision');
  const p2 = await prepare(f.adapter, 'new');
  const a2 = await approvals(p2, 'new');
  a2.grant.authorizationId = f.grant.authorizationId;
  failed(await f.adapter.run(p2, a2.grant, a2.financial), 'authorization_reused');
  assert.equal(syntheticDispatchCount(f.deps.transport), 1);
});

test('consumed authorization survives simulated transport crash without redispatch', async () => {
  const deps = dependencies(configuration(), [{ kind: 'crash' }]);
  const adapter = createSyntheticComputeAdapter(deps);
  const p = await prepare(adapter);
  const a = await approvals(p);
  failed(await adapter.run(p, a.grant, a.financial), 'transport_failed');
  failed(await adapter.run(p, a.grant, a.financial), 'duplicate_attempt');
  assert.equal(syntheticDispatchCount(deps.transport), 1);
});

test('lost state and explicit restart state block all dispatch', async () => {
  const f = await fixture();
  simulateStateLoss(f.deps.consumption);
  failed(await execute(f), 'consumption_unavailable');
  assert.equal(syntheticDispatchCount(f.deps.transport), 0);
  const clock = new SyntheticClock(1000);
  const restarted = await fixture({ clock, store: createSyntheticConsumptionStore(clock, 'lost') });
  failed(await execute(restarted), 'consumption_unavailable');
  assert.equal(syntheticDispatchCount(restarted.deps.transport), 0);
});

for (const [label, mutate, code] of [
  ['expired grant', (f) => (f.grant.expiresAt = 999), 'authorization_expired'],
  ['wrong credential', (f) => (f.grant.credentialGeneration = 'other'), 'credential_invalid'],
  ['wrong manifest', (f) => (f.grant.manifestDigest = D), 'authorization_invalid'],
  ['multiple attempts', (f) => (f.grant.maximumDispatches = 2), 'authorization_invalid'],
  ['unknown grant field', (f) => (f.grant.wallet = 'SECRET'), 'request_invalid'],
  [
    'missing financial enforcement',
    (f) => (f.financial.enforcementEvidenceRef = ''),
    'financial_policy_unsatisfied',
  ],
  ['wallet capability', (f) => (f.financial.wallet = { sign() {} }), 'request_invalid'],
  [
    'replenishment',
    (f) => (f.financial.replenishmentAllowed = true),
    'financial_policy_unsatisfied',
  ],
  [
    'live financial provenance',
    (f) => (f.financial.provenance = 'observed'),
    'financial_policy_unsatisfied',
  ],
])
  test(`pre-dispatch rejection: ${label}`, async () => {
    const f = await fixture();
    mutate(f);
    failed(await execute(f), code);
    assert.equal(syntheticDispatchCount(f.deps.transport), 0);
  });

test('deadline before dispatch and credential expiry dispatch zero times', async () => {
  const f = await fixture();
  f.deps.clock.advance(100);
  failed(await execute(f), 'authorization_expired');
  assert.equal(syntheticDispatchCount(f.deps.transport), 0);
  const c = configuration();
  c.credential.expiresAt = 999;
  const expired = await fixture({ config: c });
  failed(await execute(expired), 'credential_invalid');
});

test('timeout after dispatch is terminal, ignores late completion and never retries', async () => {
  const f = await fixture({ stepOptions: { delayMs: 200 } });
  const pending = execute(f);
  await untilDispatch(f.deps);
  f.deps.clock.advance(100);
  const result = await pending;
  failed(result, 'deadline_exceeded');
  assert.equal(result.evidence.remoteOutcome, 'unknown');
  const before = JSON.stringify(result);
  f.deps.clock.advance(100);
  await new Promise(setImmediate);
  assert.equal(JSON.stringify(result), before);
  assert.equal(syntheticDispatchCount(f.deps.transport), 1);
  assert.equal(f.deps.clock.pending(), 0);
  failed(await execute(f), 'authorization_expired');
});

test('hung transport times out under controlled clock without real timers', async () => {
  const deps = dependencies(configuration(), [{ kind: 'hang' }]);
  const adapter = createSyntheticComputeAdapter(deps);
  const p = await prepare(adapter);
  const a = await approvals(p);
  const pending = adapter.run(p, a.grant, a.financial);
  await untilDispatch(deps);
  deps.clock.advance(100);
  failed(await pending, 'deadline_exceeded');
  assert.equal(deps.clock.pending(), 0);
});

for (const [status, code] of [
  [429, 'rate_limited'],
  [401, 'remote_auth_failed'],
  [402, 'remote_payment_failed'],
  [403, 'remote_auth_failed'],
  [302, 'remote_rejected'],
  [500, 'remote_error_unknown'],
])
  test(`HTTP-shaped ${status}: sanitized terminal without retry`, async () => {
    const f = await fixture({
      raw: 'SECRET REMOTE BODY',
      stepOptions: { status, headers: { 'retry-after': '15' } },
    });
    const result = await execute(f);
    failed(result, code);
    if (status === 429) assert.equal(result.evidence.retryAfterMs, 15000);
    assert.equal(JSON.stringify(result).includes('SECRET'), false);
    assert.equal(syntheticDispatchCount(f.deps.transport), 1);
  });

test('headers have a separate byte ceiling', async () => {
  failed(
    await execute(await fixture({ stepOptions: { headers: { secret: 's'.repeat(1100) } } })),
    'response_limit_exceeded',
  );
});

test('replayed synthetic attestation artifact is rejected across independent attempts', async () => {
  const clock = new SyntheticClock(1000);
  const store = createSyntheticConsumptionStore(clock, 'fresh_test_scope');
  const artifact = await sha256('shared-artifact');
  const a = await fixture({
    clock,
    store,
    mutate: (b) => (b.verification.artifactDigest = artifact),
  });
  assert.equal((await execute(a)).status, 'completed');
  const b = await fixture({
    clock,
    store,
    suffix: '2',
    mutate: (b) => (b.verification.artifactDigest = artifact),
  });
  failed(await execute(b), 'verification_replayed');
});

test('unverified policy is explicit and cannot assert independent verification', async () => {
  const c = configuration();
  c.verificationPolicy.required = [];
  const f = await fixture({ config: c, mutate: (b) => delete b.verification });
  const result = await execute(f);
  assert.equal(result.status, 'completed');
  assert.equal(result.evidence.verification, undefined);
  assert.equal(result.evidence.remoteAttemptGuarantee, 'not_established');
});

test('existing AI bridge and validator accept only unchanged untrusted results', async () => {
  const f = await fixture();
  const d = descriptor('execution-1');
  const registry = new PortfolioAiModelProviderRegistry();
  registry.register(f.adapter.bind(f.prepared, f.grant, f.financial));
  const result = await invokePortfolioAiProviderAdapterBridge(registry, d);
  validatePortfolioAiModelExecutionResult(
    {
      executionId: d.executionId,
      context: d.request.promptDocument.plan.input.context,
      model: d.model,
    },
    result,
  );
  assert.equal(result.authority, 'untrusted_model_execution');
  assert.equal(result.status, 'completed');
  assert.equal('evidence' in result, false);
  assert.equal('verification' in result, false);
  assert.equal(f.adapter.evidence(f.prepared).provenance, 'synthetic');
  const rejected = await invokePortfolioAiProviderAdapterBridge(registry, d);
  assert.equal(rejected.status, 'failed');
  assert.equal(rejected.authority, 'untrusted_model_execution');
});

test('forged prepared records and legacy invocation cannot bypass manifest binding', async () => {
  const f = await fixture();
  failed(await f.adapter.run(structuredClone(f.prepared), f.grant, f.financial), 'request_invalid');
  const bound = f.adapter.bind(f.prepared, f.grant, f.financial);
  await assert.rejects(
    () => bound.execute({}),
    (e) => e.code === 'request_invalid',
  );
  await assert.rejects(
    () => bound.executeProviderRequest(descriptor('other-execution')),
    (e) => e.code === 'request_invalid',
  );
  assert.equal(syntheticDispatchCount(f.deps.transport), 0);
});

test('bounded JSON accepts string escapes and nested legitimate values', () => {
  const value = {
    nested: [{ text: 'a\\b\n"z"', number: -0.01e2 }],
    empty: [],
    ok: true,
    absent: null,
  };
  assert.deepEqual(parseBoundedJson(encoder.encode(JSON.stringify(value)), 1000, 10), value);
});

test('architecture: zero runtime imports, no live capability, protected trust markers', async () => {
  const base = new URL('../src/', import.meta.url);
  const files = await readdir(base);
  const source = (await Promise.all(files.map((p) => readFile(new URL(p, base), 'utf8')))).join(
    '\n',
  );
  assert.equal(
    /\bfetch\s*\(|XMLHttpRequest|WebSocket|process\.env|setTimeout|setInterval|node:(?:http|https|net|tls)|eth_send|ethers|from\s+['"]@0g/iu.test(
      source,
    ),
    false,
  );
  for (const line of source.split('\n'))
    if (/^import.*packages\//.test(line)) assert.match(line, /^import type /);
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.devDependencies, undefined);
  const runtime = await readFile(
    new URL('../../../packages/runtime-safety/src/runtime-safety-contract.ts', import.meta.url),
    'utf8',
  );
  assert.match(runtime, /PrepareOperatorReview = 'prepare_operator_review'/);
  assert.equal(/0g-compute|@0gfoundation/.test(runtime), false);
  for (const [path, marker] of [
    ['portfolio-model-execution.ts', 'untrusted_model_execution'],
    ['portfolio-model-output-interpretation.ts', 'untrusted_candidate_interpretation'],
    ['portfolio-intelligence.ts', 'non_authoritative_interpretation'],
  ]) {
    assert.ok(
      (
        await readFile(new URL(`../../../packages/ai/src/${path}`, import.meta.url), 'utf8')
      ).includes(marker),
    );
  }
});

test('crash after consumption before dispatch leaves a permanent tombstone', async () => {
  const clock = new SyntheticClock(1000);
  const store = createSyntheticConsumptionStore(clock, 'crash_after_consumption');
  const f = await fixture({ clock, store });
  const result = await execute(f);
  failed(result, 'transport_failed');
  assert.equal(result.evidence.dispatchCount, 0);
  assert.equal(result.evidence.consumption.dispatchState, 'consumed_before_dispatch');
  failed(await execute(f), 'duplicate_attempt');
  assert.equal(syntheticDispatchCount(f.deps.transport), 0);
  assert.equal(f.adapter.evidence(f.prepared), result.evidence);
});

test('restart with retained fake state does not replay a consumed authorization', async () => {
  const clock = new SyntheticClock(1000);
  const store = createSyntheticConsumptionStore(clock, 'fresh_test_scope');
  const first = await fixture({ clock, store });
  assert.equal((await execute(first)).status, 'completed');
  const restarted = await fixture({ clock, store });
  failed(await execute(restarted), 'duplicate_attempt');
  assert.equal(syntheticDispatchCount(restarted.deps.transport), 0);
});

test('independent concurrent attempts retain isolated identities and terminal evidence', async () => {
  const clock = new SyntheticClock(1000);
  const store = createSyntheticConsumptionStore(clock, 'fresh_test_scope');
  const first = await fixture({ clock, store });
  const second = await fixture({ clock, store, suffix: '2' });
  const results = await Promise.all([execute(first), execute(second)]);
  assert.ok(results.every((r) => r.status === 'completed'));
  assert.notEqual(results[0].evidence.attemptId, results[1].evidence.attemptId);
  assert.equal(syntheticDispatchCount(first.deps.transport), 1);
  assert.equal(syntheticDispatchCount(second.deps.transport), 1);
});

test('synthetic success never establishes remote guarantees, durable authorization or financial enforcement', async () => {
  const f = await fixture();
  const result = await execute(f);
  assert.equal(syntheticLimitations.liveExecution, 'blocked');
  assert.equal(syntheticLimitations.remoteAttemptGuarantee, 'not_established');
  assert.equal(syntheticLimitations.financialEnforcement, 'not_established');
  assert.equal(syntheticLimitations.authorizationDurability, 'synthetic_memory_only');
  assert.equal(syntheticLimitations.attestation, 'synthetic_only');
  assert.equal(Object.isFrozen(syntheticLimitations), true);
  assert.equal(result.evidence.remoteAttemptGuarantee, syntheticLimitations.remoteAttemptGuarantee);
});

test('script bodies are defensively copied before dispatch', async () => {
  const config = configuration();
  const clock = new SyntheticClock(1000);
  const preview = createSyntheticComputeAdapter(dependencies(config, [], clock));
  const preparedPreview = await prepare(preview);
  const raw = encoder.encode(JSON.stringify(await response(preparedPreview)));
  const deps = dependencies(config, [step(raw)], clock);
  raw.fill(0);
  const adapter = createSyntheticComputeAdapter(deps);
  const prepared = await prepare(adapter);
  const a = await approvals(prepared);
  assert.equal((await adapter.run(prepared, a.grant, a.financial)).status, 'completed');
});

test('manifest wire digest binds exact bounded synthetic request bytes', async () => {
  const f = await fixture();
  const d = descriptor('execution-1');
  function canonical(v) {
    if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
    if (v && typeof v === 'object')
      return `{${Object.keys(v)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
        .join(',')}}`;
    return JSON.stringify(v);
  }
  const wire = canonical({
    model: 'synthetic-model',
    messages: [{ role: 'user', content: canonical(d.request.promptDocument) }],
    max_tokens: 100,
    stream: false,
    synthetic_binding: {
      provider,
      mode: 'router',
      endpoint: f.deps.configuration.endpoint,
      crossProviderFallback: false,
    },
  });
  assert.equal(f.prepared.manifest.wireBodyDigest, await sha256(encoder.encode(wire)));
});

test('prepare snapshots attempt identity before digest awaits', async () => {
  const adapter = createSyntheticComputeAdapter(dependencies());
  const identity = {
    requestId: 'original-request',
    attemptId: 'original-attempt',
    logicalOperationDigest: D,
    expiresAt: 1100,
  };
  const pending = adapter.prepare(descriptor(), identity);
  identity.requestId = 'changed-request';
  identity.attemptId = 'changed-attempt';
  identity.logicalOperationDigest = 'b'.repeat(64);
  identity.expiresAt = 999999;
  const prepared = await pending;
  assert.equal(prepared.manifest.requestId, 'original-request');
  assert.equal(prepared.manifest.attemptId, 'original-attempt');
  assert.equal(prepared.manifest.logicalOperationDigest, D);
  assert.equal(prepared.manifest.expiresAt, 1100);
});

test('hostile array methods/accessors cannot execute through serialization or script injection', async () => {
  let invoked = false;
  const hostile = [];
  Object.defineProperty(hostile, 'map', {
    value() {
      invoked = true;
      throw new Error('SECRET');
    },
    enumerable: true,
  });
  assert.throws(
    () => createSyntheticTransport(new SyntheticClock(1000), hostile),
    (e) => e.code === 'request_invalid',
  );
  const d = descriptor();
  d.blocks = hostile;
  const adapter = createSyntheticComputeAdapter(dependencies());
  await assert.rejects(
    () =>
      adapter.prepare(d, {
        requestId: 'r',
        attemptId: 'a',
        logicalOperationDigest: D,
        expiresAt: 1100,
      }),
    (e) => e.code === 'request_invalid',
  );
  const c = configuration();
  c.verificationPolicy.required = hostile;
  assert.throws(
    () => createSyntheticComputeAdapter(dependencies(c)),
    (e) => e.code === 'configuration_invalid',
  );
  assert.equal(invoked, false);
});

test('clock state is private and cannot be replaced by an instance override', () => {
  const clock = new SyntheticClock(1000);
  assert.equal(Object.isFrozen(clock), true);
  assert.deepEqual(Reflect.ownKeys(clock), []);
  assert.throws(() => {
    clock.now = () => 0;
  }, TypeError);
  assert.throws(() => {
    clock.time = 0;
  }, TypeError);
  clock.advance(1);
  assert.equal(clock.now(), 1001);
});

for (const field of ['sdkPackage', 'sdkVersion', 'sdkCommit', 'contractSetDigest'])
  test(`Direct pin mismatch: ${field}`, () => {
    const c = configuration('direct');
    c[field] = 'unapproved';
    assert.throws(
      () => createSyntheticComputeAdapter(dependencies(c)),
      (e) => e.code === 'configuration_invalid',
    );
  });

test('closed contract rejects secret-bearing accessors without invoking them', async () => {
  let invoked = false;
  const f = await fixture();
  Object.defineProperty(f.grant, 'ownerApprovalRef', {
    enumerable: true,
    get() {
      invoked = true;
      throw new Error('SECRET_SENTINEL');
    },
  });
  const result = await execute(f);
  failed(result, 'request_invalid');
  assert.equal(invoked, false);
  assert.equal(JSON.stringify(result).includes('SECRET_SENTINEL'), false);
  assert.equal(syntheticDispatchCount(f.deps.transport), 0);
});
