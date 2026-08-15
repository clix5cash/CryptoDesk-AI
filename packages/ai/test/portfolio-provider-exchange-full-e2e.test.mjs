import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PortfolioPositionKind,
  analyzePortfolioAllocation,
  analyzePortfolioRisk,
  composePortfolioPresentationSections,
  createPortfolioPresentation,
  generatePortfolioInsights,
  normalizePortfolioSnapshot,
  prioritizePortfolioInsights,
  serializePortfolioPresentation,
  valuePortfolioSnapshot,
} from '@cryptodesk-ai/portfolio';
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
  validatePortfolioAiProviderExchange,
  validatePortfolioAiProviderResponse,
} from '../dist/index.js';

const thresholds = {
  thresholds: {
    asset: { moderatePercentage: '20', highPercentage: '50' },
    network: { moderatePercentage: '20', highPercentage: '50' },
    source: { moderatePercentage: '20', highPercentage: '50' },
    account: { moderatePercentage: '20', highPercentage: '50' },
  },
};

function asset(id, networkId, decimals) {
  return {
    id,
    symbol: 'USDC',
    ...(networkId === undefined ? {} : { networkId }),
    contractAddress: `contract-${id}`,
    ...(decimals === undefined ? {} : { decimals }),
  };
}

function position(id, quantity, assetValue, sourceId, accountId) {
  return {
    id,
    quantity,
    asset: assetValue,
    ...(sourceId === undefined ? {} : { sourceId }),
    ...(accountId === undefined ? {} : { accountId }),
    kind: PortfolioPositionKind.AssetBalance,
    observedAt: '2026-08-15T00:00:00.000Z',
  };
}

function snapshot(positions, portfolioId) {
  return {
    portfolio: {
      id: portfolioId,
      label: 'Full Provider Exchange E2E',
      sources: [
        { id: 'source-a', label: 'Source A' },
        { id: 'source-b', label: 'Source B' },
      ],
      accounts: [
        { id: 'account-a', sourceId: 'source-a', label: 'Account A' },
        { id: 'account-b', sourceId: 'source-b', label: 'Account B' },
      ],
    },
    capturedAt: '2026-08-15T01:00:00.000Z',
    positions,
  };
}

function price(assetValue, value) {
  return {
    asset: assetValue,
    price: value,
    currency: 'USD',
    observedAt: '2026-08-15T00:30:00.000Z',
    sourceId: 'price-source',
    sourceRecordId: `price-${assetValue.id}`,
  };
}

function portfolioArtifacts(source, prices, analysisId) {
  const canonical = normalizePortfolioSnapshot(source);
  const valuation = valuePortfolioSnapshot(canonical, prices, { currency: 'USD' });
  const allocation = analyzePortfolioAllocation(canonical, valuation);
  const risk = analyzePortfolioRisk(
    { analysisId, asOf: valuation.asOf, snapshot: canonical, valuation, allocation },
    thresholds,
  );
  const insights = generatePortfolioInsights({ snapshot: canonical, valuation, allocation, risk });
  const prioritized = prioritizePortfolioInsights(insights);
  const presentation = createPortfolioPresentation({
    snapshot: canonical,
    valuation,
    allocation,
    risk,
    insights,
    prioritizedInsights: prioritized,
  });
  const payload = serializePortfolioPresentation(
    presentation,
    composePortfolioPresentationSections(presentation),
  );
  return { canonical, valuation, allocation, risk, presentation, payload };
}

function prepare(payload, executionId) {
  const context = buildPortfolioAiContext({
    analysisId: `ai-${executionId}`,
    task: PortfolioAiTask.Interpret,
    payload,
  });
  const input = createPortfolioAiModelInput({
    task: PortfolioAiTask.Interpret,
    context,
    factIds: context.facts.map((fact) => fact.id),
    sectionIds: context.sections.map((section) => section.id),
  });
  const plan = createPortfolioAiMessagePlan(input);
  const document = createPortfolioAiPromptDocument(plan);
  const request = createPortfolioAiProviderRequest({
    executionId,
    model: { providerId: 'provider-full-e2e', modelId: 'model-full-e2e' },
    promptDocument: document,
  });
  const descriptor = mapPortfolioAiProviderRequest(request);
  return { context, input, plan, document, request, descriptor };
}

async function exchange(prepared, resultFactory) {
  let calls = 0;
  const registry = new PortfolioAiModelProviderRegistry();
  registry.register({
    providerId: 'provider-full-e2e',
    supportedModels: ['model-full-e2e'],
    async execute(input) {
      calls += 1;
      return resultFactory(input);
    },
  });
  const raw = await invokePortfolioAiProviderAdapterBridge(registry, prepared.descriptor);
  const response = createPortfolioAiProviderResponse(prepared.descriptor, raw);
  const normalized = normalizePortfolioAiProviderResponse(prepared.descriptor, response);
  const providerExchange = createPortfolioAiProviderExchange(prepared.descriptor, normalized);
  return { calls, raw, response, normalized, providerExchange };
}

function completed(input) {
  return {
    executionId: input.executionId,
    status: AiExecutionStatus.Completed,
    authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
    output:
      '# Recommendation-like text\n{"asset":"USDC","networkId":"network-a","portfolioId":"canonical-looking","value":"1125899906842624190.4320975"}',
    model: input.model,
  };
}

test('completes the full canonical Portfolio to provider exchange path once and opaquely', async () => {
  const networkA = asset('asset-usdc-network-a', 'network-a', 6);
  const networkB = asset('asset-usdc-network-b', 'network-b', 0);
  const unclassified = asset('asset-usdc-unclassified', undefined, 0);
  const missingDecimals = asset('asset-missing-decimals', 'network-a', undefined);
  const missingPrice = asset('asset-missing-price', 'network-b', 0);
  const source = snapshot(
    [
      position('position-large', '900719925474099312345678', networkA, 'source-a', 'account-a'),
      position('position-network-b', '20', networkB, 'source-b', 'account-b'),
      position('position-unclassified', '10', unclassified),
      position('position-missing-decimals', '1', missingDecimals, 'source-a', 'account-a'),
      position('position-missing-price', '1', missingPrice, 'source-b', 'account-b'),
    ],
    'portfolio-full-exchange-completed',
  );
  const prices = [
    price(networkA, '1.25'),
    price(networkB, '2'),
    price(unclassified, '1'),
    price(missingDecimals, '1'),
  ];
  const sourceBefore = JSON.stringify(source);
  const pricesBefore = JSON.stringify(prices);
  const portfolio = portfolioArtifacts(source, prices, 'risk-full-exchange-completed');
  const prepared = prepare(portfolio.payload, 'execution-full-exchange-completed');
  const preparedBefore = JSON.stringify(prepared);
  const result = await exchange(prepared, completed);

  validatePortfolioAiProviderResponse(prepared.descriptor, result.response);
  validatePortfolioAiNormalizedProviderResponse(prepared.descriptor, result.normalized);
  validatePortfolioAiProviderExchange(result.providerExchange);
  assert.equal(result.calls, 1);
  assert.equal(prepared.context.source.portfolioId, source.portfolio.id);
  assert.equal(result.providerExchange.executionId, prepared.descriptor.executionId);
  assert.deepEqual(result.providerExchange.model, prepared.descriptor.model);
  assert.equal(result.providerExchange.status, AiExecutionStatus.Completed);
  assert.equal(result.providerExchange.authority, 'untrusted_model_execution');
  assert.equal(result.raw.output, completed(result.raw).output);
  assert.equal(result.response.result.output, result.raw.output);
  assert.equal(result.normalized.output, result.raw.output);
  assert.equal(result.providerExchange.response.output, result.raw.output);
  const retained = result.providerExchange.descriptor.request.promptDocument.plan.input.context;
  assert.equal(retained.summary.totalValuedValue, '1125899906842624190.4320975');
  assert.equal(retained.summary.coverage.state, 'partial');
  const networkAFact = retained.facts.find(
    (fact) => fact.evidence.insight.asset?.id === 'asset-usdc-network-a',
  );
  const networkBFact = retained.facts.find(
    (fact) => fact.evidence.insight.asset?.id === 'asset-usdc-network-b',
  );
  assert.ok(networkAFact);
  assert.ok(networkBFact);
  assert.equal(networkAFact.evidence.insight.asset.networkId, 'network-a');
  assert.equal(networkBFact.evidence.insight.asset.networkId, 'network-b');
  assert.notEqual(networkAFact.id, networkBFact.id);
  for (const reason of [
    'missing_price',
    'missing_decimals',
    'missing_network_provenance',
    'missing_source_provenance',
    'missing_account_provenance',
  ]) {
    assert.ok(retained.facts.some((fact) => fact.evidence.insight.unavailableReason === reason));
  }
  assert.equal(JSON.stringify(source), sourceBefore);
  assert.equal(JSON.stringify(prices), pricesBefore);
  assert.equal(JSON.stringify(prepared), preparedBefore);
  result.providerExchange.response.source.result.output = 'detached';
  assert.equal(result.normalized.output, result.raw.output);

  const repeatedPortfolio = portfolioArtifacts(source, prices, 'risk-full-exchange-completed');
  const repeatedPrepared = prepare(repeatedPortfolio.payload, 'execution-full-exchange-completed');
  const repeated = await exchange(repeatedPrepared, completed);
  assert.deepEqual(repeatedPrepared, prepared);
  assert.deepEqual(
    repeated.providerExchange,
    createPortfolioAiProviderExchange(prepared.descriptor, result.normalized),
  );
});

test('preserves unavailable and insufficient canonical evidence through one failed exchange', async () => {
  const missingPrice = asset('asset-unavailable-price', 'network-a', 0);
  const missingDecimals = asset('asset-unavailable-decimals', 'network-b', undefined);
  const source = snapshot(
    [
      position('position-unavailable-price', '1', missingPrice),
      position('position-unavailable-decimals', '1', missingDecimals),
    ],
    'portfolio-full-exchange-failed',
  );
  const portfolio = portfolioArtifacts(
    source,
    [price(missingDecimals, '1')],
    'risk-full-exchange-failed',
  );
  const prepared = prepare(portfolio.payload, 'execution-full-exchange-failed');
  const result = await exchange(prepared, (input) => ({
    executionId: input.executionId,
    status: AiExecutionStatus.Failed,
    authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
    failure: { code: 'opaque_failure', message: 'Provider-neutral failure.' },
    model: input.model,
  }));

  assert.equal(result.calls, 1);
  assert.equal(portfolio.payload.coverage.state, 'unavailable');
  assert.equal(portfolio.risk.coverage.state, 'unavailable');
  assert.equal(prepared.context.summary.coverage.state, 'unavailable');
  assert.equal(result.providerExchange.status, AiExecutionStatus.Failed);
  assert.equal(result.providerExchange.authority, 'untrusted_model_execution');
  assert.deepEqual(result.providerExchange.response.failure, result.raw.failure);
  assert.equal(result.providerExchange.response.output, undefined);
  assert.deepEqual(result.providerExchange.model, prepared.descriptor.model);
  assert.ok(
    prepared.context.facts.some(
      (fact) => fact.evidence.insight.unavailableReason === 'missing_price',
    ),
  );
  assert.ok(
    prepared.context.facts.some(
      (fact) => fact.evidence.insight.unavailableReason === 'missing_decimals',
    ),
  );

  const insufficientSource = snapshot([], 'portfolio-full-exchange-insufficient');
  const insufficientPortfolio = portfolioArtifacts(
    insufficientSource,
    [],
    'risk-full-exchange-insufficient',
  );
  const insufficientPrepared = prepare(
    insufficientPortfolio.payload,
    'execution-full-exchange-insufficient',
  );
  const insufficientResult = await exchange(insufficientPrepared, (input) => ({
    executionId: input.executionId,
    status: AiExecutionStatus.Failed,
    authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
    failure: { message: 'Provider-neutral insufficient-data failure.' },
    model: input.model,
  }));
  assert.equal(insufficientPortfolio.risk.coverage.state, 'insufficient_data');
  assert.equal(insufficientResult.calls, 1);
  assert.equal(insufficientResult.providerExchange.status, AiExecutionStatus.Failed);
  assert.equal(
    insufficientResult.providerExchange.descriptor.request.promptDocument.plan.input.context.source
      .portfolioId,
    insufficientSource.portfolio.id,
  );
});

test('isolates full-path failures before a later valid provider exchange', async () => {
  const available = asset('asset-isolation', 'network-a', 0);
  const source = snapshot(
    [position('position-isolation', '900719925474099312345678', available)],
    'portfolio-full-exchange-isolation',
  );
  const portfolio = portfolioArtifacts(
    source,
    [price(available, '1.0000000000000001')],
    'risk-full-exchange-isolation',
  );
  const prepared = prepare(portfolio.payload, 'execution-full-exchange-isolation');
  const runValid = () => exchange(prepared, completed);
  const expected = (await runValid()).providerExchange;

  await assert.rejects(
    () =>
      invokePortfolioAiProviderAdapterBridge(
        new PortfolioAiModelProviderRegistry(),
        prepared.descriptor,
      ),
    AiBoundaryValidationError,
  );
  assert.deepEqual((await runValid()).providerExchange, expected);

  const unsupported = new PortfolioAiModelProviderRegistry();
  unsupported.register({
    providerId: 'provider-full-e2e',
    supportedModels: ['other-model'],
    async execute() {
      throw new Error('must not execute');
    },
  });
  await assert.rejects(
    () => invokePortfolioAiProviderAdapterBridge(unsupported, prepared.descriptor),
    AiBoundaryValidationError,
  );
  assert.deepEqual((await runValid()).providerExchange, expected);

  const throwing = new PortfolioAiModelProviderRegistry();
  throwing.register({
    providerId: 'provider-full-e2e',
    supportedModels: ['model-full-e2e'],
    async execute() {
      throw new Error('opaque failure');
    },
  });
  await assert.rejects(
    () => invokePortfolioAiProviderAdapterBridge(throwing, prepared.descriptor),
    AiBoundaryValidationError,
  );
  assert.deepEqual((await runValid()).providerExchange, expected);

  const malformed = new PortfolioAiModelProviderRegistry();
  malformed.register({
    providerId: 'provider-full-e2e',
    supportedModels: ['model-full-e2e'],
    async execute(input) {
      return { ...completed(input), executionId: 'wrong-execution' };
    },
  });
  await assert.rejects(
    () => invokePortfolioAiProviderAdapterBridge(malformed, prepared.descriptor),
    AiBoundaryValidationError,
  );
  assert.deepEqual((await runValid()).providerExchange, expected);

  assert.throws(
    () =>
      validatePortfolioAiProviderResponse(prepared.descriptor, {
        ...expected.response.source,
        portfolioId: 'fabricated',
      }),
    AiBoundaryValidationError,
  );
  assert.deepEqual((await runValid()).providerExchange, expected);
  assert.throws(
    () =>
      validatePortfolioAiNormalizedProviderResponse(prepared.descriptor, {
        ...expected.response,
        authority: 'authoritative',
      }),
    AiBoundaryValidationError,
  );
  assert.deepEqual((await runValid()).providerExchange, expected);
  assert.throws(
    () =>
      validatePortfolioAiProviderExchange({
        ...expected,
        descriptor: { ...expected.descriptor, executionId: 'wrong-execution' },
      }),
    AiBoundaryValidationError,
  );
  assert.deepEqual((await runValid()).providerExchange, expected);
});
