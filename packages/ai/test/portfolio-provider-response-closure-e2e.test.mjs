import assert from 'node:assert/strict';
import test from 'node:test';
import { PortfolioPresentationSection } from '@cryptodesk-ai/portfolio';
import {
  AiBoundaryValidationError,
  AiExecutionStatus,
  PortfolioAiModelProviderRegistry,
  PortfolioAiRawExecutionAuthority,
  PortfolioAiTask,
  buildPortfolioAiContext,
  createPortfolioAiMessagePlan,
  createPortfolioAiModelInput,
  createPortfolioAiPromptDocument,
  createPortfolioAiProviderExchange,
  createPortfolioAiProviderRequest,
  createPortfolioAiProviderResponse,
  invokePortfolioAiProviderAdapterBridge,
  mapPortfolioAiProviderRequest,
  normalizePortfolioAiProviderResponse,
  validatePortfolioAiNormalizedProviderResponse,
  validatePortfolioAiProviderResponse,
  validatePortfolioAiProviderExchange,
} from '../dist/index.js';

function sectionId(section) {
  return JSON.stringify(['portfolio-response-closure', section]);
}

function item(id, category, evidence) {
  return {
    id,
    category,
    priority: 'high',
    priorityReasons: ['canonical_identity'],
    targetIdentity: id,
    evidence: {
      insight: { portfolioId: 'portfolio-response-closure', ...evidence },
      valuationPositions: [],
    },
  };
}

function payload() {
  const items = [
    item('network-a', 'concentration', {
      asset: { id: 'asset-a', symbol: 'USDC', networkId: 'network-a', decimals: 6 },
      measuredValue: '900719925474099312345678.1234',
      measuredPercentage: '66.6667',
      coverageState: 'partial',
    }),
    item('network-b', 'concentration', {
      asset: { id: 'asset-b', symbol: 'USDC', networkId: 'network-b', decimals: 6 },
      measuredPercentage: '33.3333',
      coverageState: 'partial',
    }),
    item('missing-price', 'data_quality', {
      unavailableReason: 'missing_price',
      coverageState: 'partial',
    }),
    item('missing-decimals', 'data_quality', {
      unavailableReason: 'missing_decimals',
      coverageState: 'partial',
    }),
    item('missing-network', 'data_quality', {
      unavailableReason: 'missing_network_provenance',
      coverageState: 'partial',
    }),
    item('missing-source', 'data_quality', {
      unavailableReason: 'missing_source_provenance',
      coverageState: 'partial',
    }),
    item('missing-account', 'data_quality', {
      unavailableReason: 'missing_account_provenance',
      coverageState: 'partial',
    }),
  ];
  return {
    schemaVersion: '1',
    portfolioId: 'portfolio-response-closure',
    capturedAt: '2026-08-15T01:00:00.000Z',
    asOf: '2026-08-15T01:00:00.000Z',
    currency: 'USD',
    totalValuedValue: '900719925474099312345678.1234',
    coverage: {
      state: 'partial',
      valuation: {
        totalPositionCount: 4,
        valuedPositionCount: 2,
        unvaluedPositionCount: 2,
        valuedPositionCoveragePercentage: '50',
        unvaluedReasons: [
          { reason: 'missing_price', positionCount: 1 },
          { reason: 'missing_decimals', positionCount: 1 },
        ],
      },
    },
    items,
    sections: [
      { id: sectionId('overview'), section: 'overview', itemIds: [] },
      { id: sectionId('valuation'), section: 'valuation', itemIds: [] },
      { id: sectionId('coverage'), section: 'coverage', itemIds: [] },
      {
        id: sectionId('concentration'),
        section: 'concentration',
        itemIds: ['network-a', 'network-b'],
      },
      {
        id: sectionId('data_quality'),
        section: 'data_quality',
        itemIds: items.slice(2).map((entry) => entry.id),
      },
      {
        id: sectionId('prioritized_insights'),
        section: 'prioritized_insights',
        itemIds: items.map((entry) => entry.id),
      },
    ],
  };
}

function descriptor(executionId = 'response-closure-execution') {
  const context = buildPortfolioAiContext({
    analysisId: `analysis-${executionId}`,
    task: PortfolioAiTask.Interpret,
    payload: payload(),
  });
  const input = createPortfolioAiModelInput({
    task: PortfolioAiTask.Interpret,
    context,
    factIds: context.facts.map((fact) => fact.id),
    sectionIds: [
      sectionId(PortfolioPresentationSection.Concentration),
      sectionId(PortfolioPresentationSection.DataQuality),
      sectionId(PortfolioPresentationSection.PrioritizedInsights),
    ],
  });
  return mapPortfolioAiProviderRequest(
    createPortfolioAiProviderRequest({
      executionId,
      model: { providerId: 'provider-closure', modelId: 'model-closure' },
      promptDocument: createPortfolioAiPromptDocument(createPortfolioAiMessagePlan(input)),
    }),
  );
}

function registryFor(resultFactory) {
  const registry = new PortfolioAiModelProviderRegistry();
  registry.register({
    providerId: 'provider-closure',
    supportedModels: ['model-closure'],
    async execute(input) {
      return resultFactory(input);
    },
  });
  return registry;
}

function completed(input) {
  return {
    executionId: input.executionId,
    status: AiExecutionStatus.Completed,
    authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
    output:
      '```json\n{"recommendation":"BUY USDC","networkId":"network-a","value":"900719925474099312345678.1234"}\n```',
    model: input.model,
  };
}

test('closes completed and failed provider-response paths with exact traceability and opacity', async () => {
  const sourceDescriptor = descriptor();
  const descriptorBefore = JSON.stringify(sourceDescriptor);
  const raw = await invokePortfolioAiProviderAdapterBridge(
    registryFor((input) => completed(input)),
    sourceDescriptor,
  );
  const rawBefore = JSON.stringify(raw);
  const response = createPortfolioAiProviderResponse(sourceDescriptor, raw);
  const responseBefore = JSON.stringify(response);
  const normalized = normalizePortfolioAiProviderResponse(sourceDescriptor, response);

  validatePortfolioAiProviderResponse(sourceDescriptor, response);
  validatePortfolioAiNormalizedProviderResponse(sourceDescriptor, normalized);
  assert.equal(normalized.executionId, sourceDescriptor.executionId);
  assert.deepEqual(normalized.model, sourceDescriptor.model);
  assert.equal(normalized.status, AiExecutionStatus.Completed);
  assert.equal(normalized.authority, 'untrusted_model_execution');
  assert.equal(normalized.output, raw.output);
  assert.equal(normalized.source.result.output, raw.output);
  const context = sourceDescriptor.request.promptDocument.plan.input.context;
  assert.equal(context.summary.totalValuedValue, '900719925474099312345678.1234');
  assert.equal(context.summary.coverage.state, 'partial');
  assert.deepEqual(
    context.facts
      .filter((fact) => fact.evidence.insight.asset?.symbol === 'USDC')
      .map((fact) => [fact.evidence.insight.asset.id, fact.evidence.insight.asset.networkId]),
    [
      ['asset-a', 'network-a'],
      ['asset-b', 'network-b'],
    ],
  );
  assert.deepEqual(
    context.facts
      .map((fact) => fact.evidence.insight.unavailableReason)
      .filter((reason) => reason !== undefined),
    [
      'missing_price',
      'missing_decimals',
      'missing_network_provenance',
      'missing_source_provenance',
      'missing_account_provenance',
    ],
  );
  assert.equal(JSON.stringify(sourceDescriptor), descriptorBefore);
  assert.equal(JSON.stringify(raw), rawBefore);
  assert.equal(JSON.stringify(response), responseBefore);
  normalized.source.result.output = 'detached';
  assert.equal(response.result.output, raw.output);

  const failedRaw = await invokePortfolioAiProviderAdapterBridge(
    registryFor((input) => ({
      executionId: input.executionId,
      status: AiExecutionStatus.Failed,
      authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
      failure: { code: 'opaque_failure', message: 'Provider-neutral failure.' },
      model: input.model,
    })),
    sourceDescriptor,
  );
  const failedResponse = createPortfolioAiProviderResponse(sourceDescriptor, failedRaw);
  const failedNormalized = normalizePortfolioAiProviderResponse(sourceDescriptor, failedResponse);
  assert.equal(failedNormalized.status, AiExecutionStatus.Failed);
  assert.deepEqual(failedNormalized.failure, failedRaw.failure);
  assert.equal(failedNormalized.output, undefined);
  assert.equal(failedNormalized.authority, 'untrusted_model_execution');

  assert.deepEqual(
    await invokePortfolioAiProviderAdapterBridge(
      registryFor((input) => completed(input)),
      sourceDescriptor,
    ),
    raw,
  );
  assert.deepEqual(createPortfolioAiProviderResponse(sourceDescriptor, raw), response);
  assert.deepEqual(
    normalizePortfolioAiProviderResponse(sourceDescriptor, response).output,
    raw.output,
  );
});

test('isolates bridge and response-boundary failures before later valid closure calls', async () => {
  const sourceDescriptor = descriptor('response-closure-isolation');
  const validRegistry = registryFor((input) => completed(input));
  const runValid = async () => {
    const raw = await invokePortfolioAiProviderAdapterBridge(validRegistry, sourceDescriptor);
    const response = createPortfolioAiProviderResponse(sourceDescriptor, raw);
    return normalizePortfolioAiProviderResponse(sourceDescriptor, response);
  };
  const expected = await runValid();

  await assert.rejects(
    () =>
      invokePortfolioAiProviderAdapterBridge(
        new PortfolioAiModelProviderRegistry(),
        sourceDescriptor,
      ),
    AiBoundaryValidationError,
  );
  assert.deepEqual(await runValid(), expected);

  for (const malformed of [
    { executionId: 'wrong-execution' },
    { model: { providerId: 'other', modelId: 'model-closure' } },
    { failure: { message: 'contradictory' } },
    { authority: 'authoritative' },
    { portfolioId: 'fabricated' },
  ]) {
    const malformedRegistry = registryFor((input) => ({ ...completed(input), ...malformed }));
    await assert.rejects(
      () => invokePortfolioAiProviderAdapterBridge(malformedRegistry, sourceDescriptor),
      AiBoundaryValidationError,
    );
    assert.deepEqual(await runValid(), expected);
  }

  const runningRaw = await invokePortfolioAiProviderAdapterBridge(
    registryFor((input) => ({
      executionId: input.executionId,
      status: AiExecutionStatus.Running,
      authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
      model: input.model,
    })),
    sourceDescriptor,
  );
  assert.throws(
    () => createPortfolioAiProviderResponse(sourceDescriptor, runningRaw),
    AiBoundaryValidationError,
  );
  assert.deepEqual(await runValid(), expected);

  assert.throws(
    () =>
      validatePortfolioAiProviderResponse(sourceDescriptor, {
        ...expected.source,
        assetId: 'fabricated',
      }),
    AiBoundaryValidationError,
  );
  assert.deepEqual(await runValid(), expected);
  assert.throws(
    () =>
      validatePortfolioAiNormalizedProviderResponse(sourceDescriptor, {
        ...expected,
        authority: 'non_authoritative_interpretation',
      }),
    AiBoundaryValidationError,
  );
  assert.deepEqual(await runValid(), expected);
});

async function exchangeFixture(executionId = 'provider-exchange') {
  const sourceDescriptor = descriptor(executionId);
  const raw = await invokePortfolioAiProviderAdapterBridge(
    registryFor((input) => completed(input)),
    sourceDescriptor,
  );
  const providerResponse = createPortfolioAiProviderResponse(sourceDescriptor, raw);
  const normalized = normalizePortfolioAiProviderResponse(sourceDescriptor, providerResponse);
  return {
    sourceDescriptor,
    raw,
    providerResponse,
    normalized,
    exchange: createPortfolioAiProviderExchange(sourceDescriptor, normalized),
  };
}

test('binds one detached provider-neutral request and completed response exchange', async () => {
  const fixture = await exchangeFixture('provider-exchange-completed');
  const before = JSON.stringify({
    descriptor: fixture.sourceDescriptor,
    normalized: fixture.normalized,
  });

  validatePortfolioAiProviderExchange(fixture.exchange);
  assert.equal(fixture.exchange.executionId, fixture.sourceDescriptor.executionId);
  assert.deepEqual(fixture.exchange.model, fixture.sourceDescriptor.model);
  assert.equal(fixture.exchange.status, AiExecutionStatus.Completed);
  assert.equal(fixture.exchange.authority, 'untrusted_model_execution');
  assert.deepEqual(fixture.exchange.descriptor, fixture.sourceDescriptor);
  assert.deepEqual(fixture.exchange.descriptor.request, fixture.sourceDescriptor.request);
  assert.deepEqual(fixture.exchange.response, fixture.normalized);
  assert.equal(fixture.exchange.response.output, fixture.raw.output);
  const context = fixture.exchange.descriptor.request.promptDocument.plan.input.context;
  assert.equal(context.summary.totalValuedValue, '900719925474099312345678.1234');
  assert.equal(context.summary.coverage.state, 'partial');
  assert.deepEqual(
    context.facts
      .filter((fact) => fact.evidence.insight.asset?.symbol === 'USDC')
      .map((fact) => [fact.evidence.insight.asset.id, fact.evidence.insight.asset.networkId]),
    [
      ['asset-a', 'network-a'],
      ['asset-b', 'network-b'],
    ],
  );
  assert.ok(
    context.facts.some((fact) => fact.evidence.insight.unavailableReason === 'missing_price'),
  );
  assert.ok(
    context.facts.some((fact) => fact.evidence.insight.unavailableReason === 'missing_decimals'),
  );
  assert.equal(
    JSON.stringify({ descriptor: fixture.sourceDescriptor, normalized: fixture.normalized }),
    before,
  );
  fixture.exchange.model.providerId = 'detached';
  fixture.exchange.descriptor.request.promptDocument.plan.input.factIds[0] = 'detached';
  fixture.exchange.response.source.result.output = 'detached';
  assert.equal(fixture.sourceDescriptor.model.providerId, 'provider-closure');
  assert.notEqual(
    fixture.sourceDescriptor.request.promptDocument.plan.input.factIds[0],
    'detached',
  );
  assert.equal(fixture.normalized.output, fixture.raw.output);
});

test('binds failed exchanges and rejects identity, trust, canonical, and reference injection', async () => {
  const sourceDescriptor = descriptor('provider-exchange-failed');
  const raw = await invokePortfolioAiProviderAdapterBridge(
    registryFor((input) => ({
      executionId: input.executionId,
      status: AiExecutionStatus.Failed,
      authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
      failure: { code: 'opaque_failure', message: 'Provider-neutral failure.' },
      model: input.model,
    })),
    sourceDescriptor,
  );
  const normalized = normalizePortfolioAiProviderResponse(
    sourceDescriptor,
    createPortfolioAiProviderResponse(sourceDescriptor, raw),
  );
  const exchange = createPortfolioAiProviderExchange(sourceDescriptor, normalized);

  validatePortfolioAiProviderExchange(exchange);
  assert.equal(exchange.status, AiExecutionStatus.Failed);
  assert.deepEqual(exchange.response.failure, raw.failure);
  assert.equal(exchange.response.output, undefined);
  for (const invalid of [
    null,
    { ...exchange, executionId: 'wrong-execution' },
    { ...exchange, model: { providerId: 'other', modelId: 'model-closure' } },
    { ...exchange, model: { providerId: 'provider-closure', modelId: 'other' } },
    { ...exchange, status: AiExecutionStatus.Completed },
    { ...exchange, authority: 'non_authoritative_interpretation' },
    { ...exchange, portfolioId: 'fabricated' },
    { ...exchange, price: '1' },
    { ...exchange, coverage: 'complete' },
    { ...exchange, provenance: {} },
    { ...exchange, descriptor: { ...exchange.descriptor, executionId: 'wrong-execution' } },
    { ...exchange, response: { ...exchange.response, executionId: 'wrong-execution' } },
    { ...exchange, response: { ...exchange.response, authority: 'authoritative' } },
  ]) {
    assert.throws(() => validatePortfolioAiProviderExchange(invalid), AiBoundaryValidationError);
  }
  validatePortfolioAiProviderExchange(exchange);
});

test('keeps provider exchanges repeatable and isolates failed calls', async () => {
  const first = await exchangeFixture('provider-exchange-repeatable');
  const second = await exchangeFixture('provider-exchange-repeatable');
  const expected = first.exchange;
  assert.deepEqual(second.exchange, expected);

  const failures = [
    { ...expected, executionId: 'wrong-execution' },
    { ...expected, authority: 'untrusted_candidate_interpretation' },
    { ...expected, assetId: 'fabricated' },
    { ...expected, response: null },
    { ...expected, descriptor: { ...expected.descriptor, messages: [] } },
  ];
  for (const failure of failures) {
    assert.throws(() => validatePortfolioAiProviderExchange(failure), AiBoundaryValidationError);
    assert.deepEqual(
      createPortfolioAiProviderExchange(first.sourceDescriptor, first.normalized),
      expected,
    );
  }
});
