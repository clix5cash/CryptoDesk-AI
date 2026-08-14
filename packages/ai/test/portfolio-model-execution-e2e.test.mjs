import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PortfolioInsightCategory,
  PortfolioPositionKind,
  PortfolioRiskDataState,
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
  PortfolioAiModelExecutionService,
  PortfolioAiModelProviderRegistry,
  PortfolioAiInterpretationPipeline,
  PortfolioAiCandidateInterpretationKind,
  PortfolioAiRawExecutionAuthority,
  PortfolioAiTask,
  buildPortfolioAiContext,
  validatePortfolioAiGroundedInterpretationResult,
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
    observedAt: '2026-08-13T00:00:00.000Z',
  };
}

function snapshot(positions) {
  return {
    portfolio: {
      id: 'portfolio-model-execution-e2e',
      label: 'Model Execution E2E',
      sources: [
        { id: 'source-a', label: 'Source A' },
        { id: 'source-b', label: 'Source B' },
      ],
      accounts: [
        { id: 'account-a', sourceId: 'source-a', label: 'Account A' },
        { id: 'account-b', sourceId: 'source-b', label: 'Account B' },
      ],
    },
    capturedAt: '2026-08-13T01:00:00.000Z',
    positions,
  };
}

function price(assetValue, priceValue) {
  return {
    asset: assetValue,
    price: priceValue,
    currency: 'USD',
    observedAt: '2026-08-13T00:30:00.000Z',
    sourceId: 'price-source',
    sourceRecordId: `price-record-${assetValue.id}`,
  };
}

function portfolioPayload(source, prices) {
  const canonical = normalizePortfolioSnapshot(source);
  const valuation = value(canonical, prices);
  const allocation = analyzePortfolioAllocation(canonical, valuation);
  const risk = analyzePortfolioRisk(
    {
      analysisId: 'risk-model-execution-e2e',
      asOf: valuation.asOf,
      snapshot: canonical,
      valuation,
      allocation,
    },
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
  return serializePortfolioPresentation(
    presentation,
    composePortfolioPresentationSections(presentation),
  );
}

function value(snapshotValue, prices) {
  return valuePortfolioSnapshot(snapshotValue, prices, { currency: 'USD' });
}

function request(payload, executionId = 'execution-e2e-1', modelId = 'model-a') {
  return {
    executionId,
    model: { providerId: 'provider-a', modelId },
    context: buildPortfolioAiContext({
      analysisId: `analysis-${executionId}`,
      task: PortfolioAiTask.Interpret,
      payload,
    }),
  };
}

function rawResult(input, overrides = {}) {
  return {
    executionId: input.executionId,
    status: AiExecutionStatus.Completed,
    authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
    output: 'Opaque untrusted raw execution output.',
    model: input.model,
    ...overrides,
  };
}

function structuredCandidates(context, networkAId) {
  const networkFact = context.facts.find((fact) => fact.evidence.insight.asset?.id === networkAId);
  const missingPriceFact = context.facts.find(
    (fact) => fact.evidence.insight.unavailableReason === 'missing_price',
  );
  assert.ok(networkFact);
  assert.ok(missingPriceFact);
  const references = [networkFact, missingPriceFact].map((fact) => ({
    factId: fact.id,
    presentationItemId: fact.presentationItemId,
    sectionIds: fact.grounding.map((grounding) => grounding.sectionIds[0]),
  }));
  const sectionIds = context.sections
    .filter((section) =>
      references.flatMap((reference) => reference.sectionIds).includes(section.id),
    )
    .map((section) => section.id);
  const coverage = context.sections.find((section) => section.section === 'coverage');
  assert.ok(coverage);
  return [
    {
      id: 'pipeline-fact-and-section',
      kind: PortfolioAiCandidateInterpretationKind.Descriptive,
      content: 'Opaque pre-structured candidate.',
      factReferences: references,
      sectionIds,
    },
    {
      id: 'pipeline-section-only',
      kind: PortfolioAiCandidateInterpretationKind.Descriptive,
      content: 'Opaque coverage candidate.',
      sectionIds: [coverage.id],
    },
  ];
}

test('preserves canonical Portfolio evidence through the full explicit provider-neutral execution path', async () => {
  const networkA = asset('asset-usdc-network-a', 'network-a', 6);
  const networkB = asset('asset-usdc-network-b', 'network-b', 0);
  const unclassified = asset('asset-usdc-unclassified', undefined, 0);
  const missingDecimals = asset('asset-missing-decimals', 'network-a', undefined);
  const missingPrice = asset('asset-missing-price', 'network-b', 0);
  const source = snapshot([
    position('position-large', '900719925474099312345678', networkA, 'source-a', 'account-a'),
    position('position-network-b', '20', networkB, 'source-b', 'account-b'),
    position('position-unclassified', '10', unclassified),
    position('position-missing-decimals', '1', missingDecimals, 'source-a', 'account-a'),
    position('position-missing-price', '1', missingPrice, 'source-b', 'account-b'),
  ]);
  const prices = [
    price(networkA, '1.25'),
    price(networkB, '2'),
    price(unclassified, '1'),
    price(missingDecimals, '1'),
  ];
  const sourceBefore = JSON.stringify(source);
  const pricesBefore = JSON.stringify(prices);
  const payload = portfolioPayload(source, prices);
  const execution = request(payload);
  const requestBefore = JSON.stringify(execution);
  const registry = new PortfolioAiModelProviderRegistry();
  let calls = 0;
  let adapterResult;
  registry.register({
    providerId: 'provider-a',
    supportedModels: ['model-a'],
    async execute(input) {
      calls += 1;
      assert.equal(input.context.summary.totalValuedValue, '1125899906842624190.4320975');
      assert.equal(input.context.summary.coverage.state, 'partial');
      adapterResult = rawResult(input);
      return adapterResult;
    },
  });
  const service = new PortfolioAiModelExecutionService(registry);
  const output = await service.execute(execution);

  assert.equal(calls, 1);
  assert.equal(payload.portfolioId, source.portfolio.id);
  assert.equal(execution.context.source.portfolioId, payload.portfolioId);
  assert.equal(output.executionId, execution.executionId);
  assert.deepEqual(output.model, execution.model);
  assert.equal(output.authority, 'untrusted_model_execution');
  assert.equal(execution.context.summary.totalValuedValue, '1125899906842624190.4320975');
  assert.equal(execution.context.summary.coverage.state, 'partial');
  const crossNetwork = execution.context.facts
    .map((fact) => fact.evidence.insight.asset)
    .filter((entry) => entry?.symbol === 'USDC' && entry.networkId !== undefined);
  assert.ok(
    crossNetwork.some((entry) => entry.id === networkA.id && entry.networkId === 'network-a'),
  );
  assert.ok(
    crossNetwork.some((entry) => entry.id === networkB.id && entry.networkId === 'network-b'),
  );
  assert.notEqual(
    execution.context.facts.find((fact) => fact.evidence.insight.asset?.id === networkA.id).id,
    execution.context.facts.find((fact) => fact.evidence.insight.asset?.id === networkB.id).id,
  );
  assert.ok(
    execution.context.facts.some(
      (fact) => fact.evidence.insight.unavailableReason === 'missing_price',
    ),
  );
  assert.ok(
    execution.context.facts.some(
      (fact) => fact.evidence.insight.unavailableReason === 'missing_decimals',
    ),
  );
  assert.ok(
    execution.context.facts.some(
      (fact) => fact.evidence.insight.unavailableReason === 'missing_network_provenance',
    ),
  );
  assert.ok(
    execution.context.facts.some(
      (fact) => fact.evidence.insight.unavailableReason === 'missing_source_provenance',
    ),
  );
  assert.ok(
    execution.context.facts.some(
      (fact) => fact.evidence.insight.unavailableReason === 'missing_account_provenance',
    ),
  );
  assert.throws(
    () => validatePortfolioAiGroundedInterpretationResult(execution.context, output),
    AiBoundaryValidationError,
  );
  output.output = 'mutated detached result';
  assert.equal(adapterResult.output, 'Opaque untrusted raw execution output.');
  assert.equal(JSON.stringify(source), sourceBefore);
  assert.equal(JSON.stringify(prices), pricesBefore);
  assert.equal(JSON.stringify(execution), requestBefore);
  assert.deepEqual(registry.list(), [{ providerId: 'provider-a', supportedModels: ['model-a'] }]);
});

test('keeps unavailable coverage explicit and validates provider/model and malicious raw-output failures without state leakage', async () => {
  const unavailableAsset = asset('asset-unavailable', 'network-a', 0);
  const unavailablePayload = portfolioPayload(
    snapshot([position('position-unavailable', '1', unavailableAsset)]),
    [],
  );
  assert.equal(unavailablePayload.coverage.state, PortfolioRiskDataState.Unavailable);
  const unavailableRequest = request(unavailablePayload, 'execution-unavailable');
  const registry = new PortfolioAiModelProviderRegistry();
  let primaryCalls = 0;
  let fallbackCalls = 0;
  registry.register({
    providerId: 'provider-a',
    supportedModels: ['model-a'],
    async execute(input) {
      primaryCalls += 1;
      return rawResult(input, { executionId: 'wrong-execution' });
    },
  });
  registry.register({
    providerId: 'provider-b',
    supportedModels: ['model-a'],
    async execute() {
      fallbackCalls += 1;
      throw new Error('must not run');
    },
  });
  const service = new PortfolioAiModelExecutionService(registry);
  await assert.rejects(() => service.execute(unavailableRequest), AiBoundaryValidationError);
  assert.equal(primaryCalls, 1);
  assert.equal(fallbackCalls, 0);
  await assert.rejects(
    () =>
      service.execute({
        ...unavailableRequest,
        model: { providerId: 'unknown', modelId: 'model-a' },
      }),
    AiBoundaryValidationError,
  );
  await assert.rejects(
    () =>
      service.execute({
        ...unavailableRequest,
        model: { providerId: 'provider-a', modelId: 'other' },
      }),
    AiBoundaryValidationError,
  );
  assert.equal(primaryCalls, 1);

  const maliciousRegistry = new PortfolioAiModelProviderRegistry();
  maliciousRegistry.register({
    providerId: 'provider-a',
    supportedModels: ['model-a'],
    async execute(input) {
      return rawResult(input, { portfolioId: 'fabricated', coverageState: 'complete' });
    },
  });
  await assert.rejects(
    () => new PortfolioAiModelExecutionService(maliciousRegistry).execute(unavailableRequest),
    AiBoundaryValidationError,
  );

  for (const model of [
    { providerId: 'provider-b', modelId: 'model-a' },
    { providerId: 'provider-a', modelId: 'other-model' },
  ]) {
    const mismatchRegistry = new PortfolioAiModelProviderRegistry();
    mismatchRegistry.register({
      providerId: 'provider-a',
      supportedModels: ['model-a'],
      async execute(input) {
        return rawResult(input, { model });
      },
    });
    await assert.rejects(
      () => new PortfolioAiModelExecutionService(mismatchRegistry).execute(unavailableRequest),
      AiBoundaryValidationError,
    );
  }

  const validRegistry = new PortfolioAiModelProviderRegistry();
  validRegistry.register({
    providerId: 'provider-a',
    supportedModels: ['model-a'],
    async execute(input) {
      return rawResult(input);
    },
  });
  const validOutput = await new PortfolioAiModelExecutionService(validRegistry).execute(
    unavailableRequest,
  );
  assert.equal(validOutput.authority, 'untrusted_model_execution');
  assert.equal(unavailableRequest.context.summary.coverage.state, 'unavailable');
  assert.equal(fallbackCalls, 0);
});

test('orchestrates the explicit Portfolio AI path without adding authority, parsing, or provider selection', async () => {
  const networkA = asset('pipeline-usdc-network-a', 'network-a', 6);
  const networkB = asset('pipeline-usdc-network-b', 'network-b', 0);
  const missingDecimals = asset('pipeline-missing-decimals', 'network-a', undefined);
  const missingPrice = asset('pipeline-missing-price', 'network-b', 0);
  const source = snapshot([
    position('pipeline-large', '900719925474099312345678', networkA, 'source-a', 'account-a'),
    position('pipeline-network-b', '20', networkB, 'source-b', 'account-b'),
    position('pipeline-missing-decimals', '1', missingDecimals, 'source-a', 'account-a'),
    position('pipeline-missing-price', '1', missingPrice, 'source-b', 'account-b'),
  ]);
  const prices = [price(networkA, '1.25'), price(networkB, '2'), price(missingDecimals, '1')];
  const payload = portfolioPayload(source, prices);
  const context = buildPortfolioAiContext({
    analysisId: 'pipeline-analysis',
    task: PortfolioAiTask.Interpret,
    payload,
  });
  const candidates = structuredCandidates(context, networkA.id);
  const input = {
    context: { analysisId: 'pipeline-analysis', task: PortfolioAiTask.Interpret, payload },
    execution: {
      executionId: 'pipeline-execution',
      model: { providerId: 'provider-a', modelId: 'model-a' },
    },
    candidates,
  };
  const before = JSON.stringify({ source, prices, input });
  const registry = new PortfolioAiModelProviderRegistry();
  let calls = 0;
  registry.register({
    providerId: 'provider-a',
    supportedModels: ['model-a'],
    async execute(requestValue) {
      calls += 1;
      return rawResult(requestValue);
    },
  });
  const pipeline = new PortfolioAiInterpretationPipeline(
    new PortfolioAiModelExecutionService(registry),
  );
  const result = await pipeline.execute(input);

  assert.equal(calls, 1);
  assert.equal(result.context.source.portfolioId, payload.portfolioId);
  assert.equal(result.execution.authority, 'untrusted_model_execution');
  assert.equal(result.candidate.authority, 'untrusted_candidate_interpretation');
  assert.equal(result.grounded.authority, 'non_authoritative_interpretation');
  assert.equal(result.execution.executionId, input.execution.executionId);
  assert.deepEqual(result.execution.model, input.execution.model);
  assert.deepEqual(result.candidate.model, input.execution.model);
  assert.deepEqual(
    result.grounded.interpretations.map((item) => item.id),
    ['pipeline-fact-and-section', 'pipeline-section-only'],
  );
  assert.equal(result.context.summary.coverage.state, 'partial');
  assert.equal(result.grounded.coverageState, 'partial');
  assert.equal(result.context.summary.totalValuedValue, '1125899906842624180.4320975');
  const facts = result.context.facts.filter(
    (fact) => fact.evidence.insight.asset?.symbol === 'USDC',
  );
  assert.ok(facts.some((fact) => fact.evidence.insight.asset.networkId === 'network-a'));
  assert.ok(facts.some((fact) => fact.evidence.insight.asset.networkId === 'network-b'));
  assert.ok(
    result.context.facts.some(
      (fact) => fact.evidence.insight.unavailableReason === 'missing_price',
    ),
  );
  assert.ok(
    result.context.facts.some(
      (fact) => fact.evidence.insight.unavailableReason === 'missing_decimals',
    ),
  );
  assert.equal(JSON.stringify({ source, prices, input }), before);
  result.grounded.interpretations[0].factReferences[0].sectionIds[0] = 'detached-change';
  assert.notEqual(input.candidates[0].factReferences[0].sectionIds[0], 'detached-change');
  assert.deepEqual(registry.list(), [{ providerId: 'provider-a', supportedModels: ['model-a'] }]);

  await assert.rejects(
    () =>
      pipeline.execute({
        ...input,
        candidates: [
          {
            ...candidates[0],
            factReferences: [{ ...candidates[0].factReferences[0], factId: 'unknown-fact' }],
          },
        ],
      }),
    AiBoundaryValidationError,
  );
  assert.equal(
    (await pipeline.execute(input)).grounded.authority,
    'non_authoritative_interpretation',
  );
});
