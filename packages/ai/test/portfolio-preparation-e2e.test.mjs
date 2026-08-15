import assert from 'node:assert/strict';
import test from 'node:test';
import { PortfolioPresentationSection } from '@cryptodesk-ai/portfolio';
import {
  AiBoundaryValidationError,
  AiExecutionStatus,
  PortfolioAiModelProviderRegistry,
  PortfolioAiPromptDocumentVersion,
  PortfolioAiRawExecutionAuthority,
  PortfolioAiTask,
  buildPortfolioAiContext,
  createPortfolioAiMessagePlan,
  createPortfolioAiModelInput,
  createPortfolioAiPromptDocument,
  createPortfolioAiProviderRequest,
  createPortfolioAiProviderResponse,
  invokePortfolioAiProviderAdapterBridge,
  mapPortfolioAiProviderRequest,
  normalizePortfolioAiProviderResponse,
  validatePortfolioAiMessagePlan,
  validatePortfolioAiModelInput,
  validatePortfolioAiPromptDocument,
  validatePortfolioAiProviderRequest,
  validatePortfolioAiProviderRequestDescriptor,
  validatePortfolioAiProviderResponse,
  validatePortfolioAiNormalizedProviderResponse,
} from '../dist/index.js';

function sectionId(section) {
  return JSON.stringify(['portfolio-preparation-e2e', section]);
}

function item(id, category, evidence) {
  return {
    id,
    category,
    priority: 'high',
    priorityReasons: ['canonical_identity'],
    targetIdentity: id,
    evidence: {
      insight: { portfolioId: 'portfolio-preparation-e2e', ...evidence },
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
    portfolioId: 'portfolio-preparation-e2e',
    capturedAt: '2026-08-14T03:00:00.000Z',
    asOf: '2026-08-14T03:00:00.000Z',
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
        itemIds: items.slice(2).map((itemValue) => itemValue.id),
      },
      {
        id: sectionId('prioritized_insights'),
        section: 'prioritized_insights',
        itemIds: items.map((itemValue) => itemValue.id),
      },
    ],
  };
}

function preparation() {
  const context = buildPortfolioAiContext({
    analysisId: 'preparation-e2e-analysis',
    task: PortfolioAiTask.Interpret,
    payload: payload(),
  });
  const modelInput = createPortfolioAiModelInput({
    task: PortfolioAiTask.Interpret,
    context,
    factIds: context.facts.map((fact) => fact.id),
    sectionIds: [
      sectionId(PortfolioPresentationSection.Concentration),
      sectionId(PortfolioPresentationSection.DataQuality),
      sectionId(PortfolioPresentationSection.PrioritizedInsights),
    ],
  });
  const plan = createPortfolioAiMessagePlan(modelInput);
  return { context, modelInput, plan, document: createPortfolioAiPromptDocument(plan) };
}

test('hardens the full deterministic provider-neutral preparation path', () => {
  const result = preparation();
  const before = JSON.stringify(result);

  validatePortfolioAiModelInput(result.modelInput);
  validatePortfolioAiMessagePlan(result.plan);
  validatePortfolioAiPromptDocument(result.document);
  assert.equal(result.context.source.portfolioId, 'portfolio-preparation-e2e');
  assert.equal(result.context.summary.totalValuedValue, '900719925474099312345678.1234');
  assert.equal(result.context.summary.coverage.state, 'partial');
  assert.equal(result.document.version, PortfolioAiPromptDocumentVersion);
  assert.deepEqual(result.plan.items[1].sectionIds, result.modelInput.sectionIds);
  assert.deepEqual(result.plan.items[2].factIds, result.modelInput.factIds);
  assert.deepEqual(result.document.blocks[2].sectionIds, result.modelInput.sectionIds);
  assert.deepEqual(result.document.blocks[3].factIds, result.modelInput.factIds);
  assert.deepEqual(
    result.document.blocks.map((block) => block.kind),
    ['instruction', 'task', 'context', 'evidence', 'constraints', 'output_contract'],
  );
  const networkFacts = result.context.facts.filter(
    (fact) => fact.evidence.insight.asset?.symbol === 'USDC',
  );
  assert.deepEqual(
    networkFacts.map((fact) => fact.evidence.insight.asset.networkId),
    ['network-a', 'network-b'],
  );
  assert.notEqual(networkFacts[0].id, networkFacts[1].id);
  assert.deepEqual(
    result.modelInput.factIds.map(
      (id) =>
        result.context.facts.find((fact) => fact.id === id).evidence.insight.unavailableReason,
    ),
    [
      undefined,
      undefined,
      'missing_price',
      'missing_decimals',
      'missing_network_provenance',
      'missing_source_provenance',
      'missing_account_provenance',
    ],
  );
  assert.equal(JSON.stringify(result), before);
  assert.deepEqual(preparation().document, result.document);
  result.document.plan.input.factIds[0] = 'detached-change';
  assert.notEqual(result.modelInput.factIds[0], 'detached-change');
});

test('isolates invalid preparation artifacts before later valid calls', () => {
  const valid = preparation();
  assert.throws(
    () => createPortfolioAiModelInput({ ...valid.modelInput, factIds: ['unknown-fact'] }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiMessagePlan({
        ...valid.plan,
        items: valid.plan.items.filter((itemValue) => itemValue.kind !== 'task'),
      }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () => validatePortfolioAiPromptDocument({ ...valid.document, system: 'caller prompt' }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () => validatePortfolioAiPromptDocument({ ...valid.document, messages: [] }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () => validatePortfolioAiPromptDocument({ ...valid.document, authority: 'authoritative' }),
    AiBoundaryValidationError,
  );
  assert.deepEqual(preparation(), valid);
});

test('creates a detached provider-neutral request envelope from the exact prompt document', () => {
  const prepared = preparation();
  const source = {
    executionId: 'provider-request-e2e',
    model: { providerId: 'provider-a', modelId: 'model-a' },
    promptDocument: prepared.document,
  };
  const before = JSON.stringify(source);
  const request = createPortfolioAiProviderRequest(source);

  validatePortfolioAiProviderRequest(request);
  assert.equal(request.executionId, source.executionId);
  assert.deepEqual(request.model, source.model);
  assert.deepEqual(request.promptDocument, prepared.document);
  assert.deepEqual(request.promptDocument.blocks[2].sectionIds, prepared.modelInput.sectionIds);
  assert.deepEqual(request.promptDocument.blocks[3].factIds, prepared.modelInput.factIds);
  assert.equal(
    request.promptDocument.plan.input.context.summary.totalValuedValue,
    '900719925474099312345678.1234',
  );
  assert.equal(request.promptDocument.plan.input.context.summary.coverage.state, 'partial');
  const networkFacts = request.promptDocument.plan.input.context.facts.filter(
    (fact) => fact.evidence.insight.asset?.symbol === 'USDC',
  );
  assert.deepEqual(
    networkFacts.map((fact) => fact.evidence.insight.asset.networkId),
    ['network-a', 'network-b'],
  );
  assert.equal(JSON.stringify(source), before);
  assert.deepEqual(createPortfolioAiProviderRequest(source), request);
  request.promptDocument.plan.input.factIds[0] = 'detached-change';
  assert.notEqual(source.promptDocument.plan.input.factIds[0], 'detached-change');

  const withoutModelId = createPortfolioAiProviderRequest({
    ...source,
    executionId: 'provider-request-no-model',
    model: { providerId: 'provider-a' },
  });
  assert.equal(withoutModelId.model.modelId, undefined);
  assert.throws(
    () => createPortfolioAiProviderRequest({ ...source, model: { providerId: '' } }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiProviderRequest({
        ...source,
        promptDocument: { ...source.promptDocument, system: 'caller prompt' },
      }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () => validatePortfolioAiProviderRequest({ ...source, messages: [] }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () => validatePortfolioAiProviderRequest({ ...source, temperature: 1 }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () => validatePortfolioAiProviderRequest({ ...source, measuredValue: '1' }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () => validatePortfolioAiProviderRequest({ ...source, authority: 'authoritative' }),
    AiBoundaryValidationError,
  );
  assert.deepEqual(
    createPortfolioAiProviderRequest(source),
    createPortfolioAiProviderRequest(source),
  );
});

test('maps a provider request to detached ordered logical descriptor blocks without execution', () => {
  const prepared = preparation();
  const request = createPortfolioAiProviderRequest({
    executionId: 'provider-descriptor-e2e',
    model: { providerId: 'provider-a', modelId: 'model-a' },
    promptDocument: prepared.document,
  });
  const before = JSON.stringify(request);
  const descriptor = mapPortfolioAiProviderRequest(request);

  validatePortfolioAiProviderRequestDescriptor(descriptor);
  assert.equal(descriptor.executionId, request.executionId);
  assert.deepEqual(descriptor.model, request.model);
  assert.equal(descriptor.promptDocumentVersion, PortfolioAiPromptDocumentVersion);
  assert.deepEqual(
    descriptor.blocks.map((block) => block.kind),
    ['instruction', 'task', 'context', 'evidence', 'constraints', 'output_contract'],
  );
  assert.deepEqual(descriptor.blocks[2].sectionIds, prepared.modelInput.sectionIds);
  assert.deepEqual(descriptor.blocks[3].factIds, prepared.modelInput.factIds);
  assert.equal(descriptor.blocks[5].outputContract, 'portfolio_ai_candidate_interpretation');
  assert.equal(
    descriptor.request.promptDocument.plan.input.context.summary.totalValuedValue,
    '900719925474099312345678.1234',
  );
  assert.equal(
    descriptor.request.promptDocument.plan.input.context.summary.coverage.state,
    'partial',
  );
  const networkFacts = descriptor.request.promptDocument.plan.input.context.facts.filter(
    (fact) => fact.evidence.insight.asset?.symbol === 'USDC',
  );
  assert.deepEqual(
    networkFacts.map((fact) => fact.evidence.insight.asset.networkId),
    ['network-a', 'network-b'],
  );
  assert.equal(JSON.stringify(request), before);
  assert.deepEqual(mapPortfolioAiProviderRequest(request), descriptor);
  descriptor.blocks[2].sectionIds[0] = 'detached-change';
  assert.notEqual(request.promptDocument.blocks[2].sectionIds[0], 'detached-change');

  assert.throws(
    () =>
      validatePortfolioAiProviderRequestDescriptor({
        ...descriptor,
        executionId: 'different-execution',
      }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiProviderRequestDescriptor({
        ...mapPortfolioAiProviderRequest(request),
        model: { providerId: 'provider-b', modelId: 'model-a' },
      }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiProviderRequestDescriptor({
        ...mapPortfolioAiProviderRequest(request),
        model: null,
      }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiProviderRequestDescriptor({
        ...mapPortfolioAiProviderRequest(request),
        blocks: mapPortfolioAiProviderRequest(request).blocks.slice(1),
      }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiProviderRequestDescriptor({
        ...mapPortfolioAiProviderRequest(request),
        blocks: [
          ...mapPortfolioAiProviderRequest(request).blocks.slice(0, -1),
          { kind: 'invalid_descriptor_block' },
        ],
      }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiProviderRequestDescriptor({
        ...mapPortfolioAiProviderRequest(request),
        blocks: mapPortfolioAiProviderRequest(request).blocks.map((block) =>
          block.kind === 'context' ? { ...block, sectionIds: ['unknown-section'] } : block,
        ),
      }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiProviderRequestDescriptor({
        ...mapPortfolioAiProviderRequest(request),
        messages: [],
      }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiProviderRequestDescriptor({
        ...mapPortfolioAiProviderRequest(request),
        measuredValue: '1',
      }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiProviderRequestDescriptor({
        ...mapPortfolioAiProviderRequest(request),
        authority: 'authoritative',
      }),
    AiBoundaryValidationError,
  );
  assert.deepEqual(mapPortfolioAiProviderRequest(request), mapPortfolioAiProviderRequest(request));
});

test('bridges one exact descriptor through an explicit in-memory adapter without changing authority', async () => {
  const prepared = preparation();
  const descriptor = mapPortfolioAiProviderRequest(
    createPortfolioAiProviderRequest({
      executionId: 'provider-bridge-e2e',
      model: { providerId: 'provider-a', modelId: 'model-a' },
      promptDocument: prepared.document,
    }),
  );
  const before = JSON.stringify(descriptor);
  const registry = new PortfolioAiModelProviderRegistry();
  let calls = 0;
  registry.register({
    providerId: 'provider-a',
    supportedModels: ['model-a'],
    async execute(input) {
      calls += 1;
      input.context.summary.coverage.state = 'complete';
      return {
        executionId: input.executionId,
        status: AiExecutionStatus.Completed,
        authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
        output: 'Opaque raw adapter output.',
        model: input.model,
      };
    },
  });

  const result = await invokePortfolioAiProviderAdapterBridge(registry, descriptor);
  assert.equal(calls, 1);
  assert.equal(result.executionId, descriptor.executionId);
  assert.deepEqual(result.model, descriptor.model);
  assert.equal(result.authority, 'untrusted_model_execution');
  assert.equal(
    descriptor.request.promptDocument.plan.input.context.summary.coverage.state,
    'partial',
  );
  assert.equal(JSON.stringify(descriptor), before);
  const networkFacts = descriptor.request.promptDocument.plan.input.context.facts.filter(
    (fact) => fact.evidence.insight.asset?.symbol === 'USDC',
  );
  assert.deepEqual(
    networkFacts.map((fact) => fact.evidence.insight.asset.networkId),
    ['network-a', 'network-b'],
  );
  assert.equal(
    descriptor.request.promptDocument.plan.input.context.summary.totalValuedValue,
    '900719925474099312345678.1234',
  );
  assert.deepEqual(await invokePortfolioAiProviderAdapterBridge(registry, descriptor), result);
  assert.equal(calls, 2);

  await assert.rejects(
    () =>
      invokePortfolioAiProviderAdapterBridge(new PortfolioAiModelProviderRegistry(), descriptor),
    AiBoundaryValidationError,
  );
  const unsupported = new PortfolioAiModelProviderRegistry();
  unsupported.register({
    providerId: 'provider-a',
    supportedModels: ['other-model'],
    async execute() {
      throw new Error('must not execute');
    },
  });
  await assert.rejects(
    () => invokePortfolioAiProviderAdapterBridge(unsupported, descriptor),
    AiBoundaryValidationError,
  );
  const malformed = new PortfolioAiModelProviderRegistry();
  malformed.register({
    providerId: 'provider-a',
    supportedModels: ['model-a'],
    async execute(input) {
      return {
        executionId: 'wrong-execution',
        status: AiExecutionStatus.Completed,
        authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
        output: 'Malformed.',
        model: input.model,
      };
    },
  });
  await assert.rejects(
    () => invokePortfolioAiProviderAdapterBridge(malformed, descriptor),
    AiBoundaryValidationError,
  );
  const throwing = new PortfolioAiModelProviderRegistry();
  let throwingCalls = 0;
  throwing.register({
    providerId: 'provider-a',
    supportedModels: ['model-a'],
    async execute() {
      throwingCalls += 1;
      throw new Error('opaque failure');
    },
  });
  await assert.rejects(
    () => invokePortfolioAiProviderAdapterBridge(throwing, descriptor),
    AiBoundaryValidationError,
  );
  assert.equal(throwingCalls, 1);
  assert.equal(
    (await invokePortfolioAiProviderAdapterBridge(registry, descriptor)).authority,
    'untrusted_model_execution',
  );
});

test('closes the provider-request preparation and bridge path without provider runtime behavior', async () => {
  const prepared = preparation();
  const request = createPortfolioAiProviderRequest({
    executionId: 'provider-bridge-closure',
    model: { providerId: 'provider-a', modelId: 'model-a' },
    promptDocument: prepared.document,
  });
  const descriptor = mapPortfolioAiProviderRequest(request);
  const before = JSON.stringify({ prepared, request, descriptor });
  let calls = 0;
  const registry = new PortfolioAiModelProviderRegistry();
  registry.register({
    providerId: 'provider-a',
    supportedModels: ['model-a'],
    async execute(input) {
      calls += 1;
      input.context.summary.totalValuedValue = '0';
      return {
        executionId: input.executionId,
        status: AiExecutionStatus.Completed,
        authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
        output: 'Opaque deterministic result.',
        model: input.model,
      };
    },
  });

  const result = await invokePortfolioAiProviderAdapterBridge(registry, descriptor);
  assert.equal(calls, 1);
  assert.equal(result.executionId, 'provider-bridge-closure');
  assert.deepEqual(result.model, { providerId: 'provider-a', modelId: 'model-a' });
  assert.equal(result.authority, 'untrusted_model_execution');
  assert.deepEqual(
    descriptor.blocks.map((block) => block.kind),
    ['instruction', 'task', 'context', 'evidence', 'constraints', 'output_contract'],
  );
  assert.equal(descriptor.promptDocumentVersion, PortfolioAiPromptDocumentVersion);
  assert.deepEqual(descriptor.blocks[2].sectionIds, prepared.modelInput.sectionIds);
  assert.deepEqual(descriptor.blocks[3].factIds, prepared.modelInput.factIds);
  assert.equal(descriptor.blocks[5].outputContract, 'portfolio_ai_candidate_interpretation');
  assert.equal(
    descriptor.request.promptDocument.plan.input.context.summary.totalValuedValue,
    '900719925474099312345678.1234',
  );
  assert.equal(
    descriptor.request.promptDocument.plan.input.context.summary.coverage.state,
    'partial',
  );
  assert.deepEqual(
    descriptor.request.promptDocument.plan.input.context.facts
      .filter((fact) => fact.evidence.insight.asset?.symbol === 'USDC')
      .map((fact) => fact.evidence.insight.asset.networkId),
    ['network-a', 'network-b'],
  );
  assert.equal(JSON.stringify({ prepared, request, descriptor }), before);
  assert.deepEqual(registry.list(), [{ providerId: 'provider-a', supportedModels: ['model-a'] }]);

  assert.throws(
    () => invokePortfolioAiProviderAdapterBridge(registry, { ...descriptor, messages: [] }),
    AiBoundaryValidationError,
  );
  await assert.rejects(
    () =>
      invokePortfolioAiProviderAdapterBridge(new PortfolioAiModelProviderRegistry(), descriptor),
    AiBoundaryValidationError,
  );
  assert.equal(calls, 1);
  assert.equal(
    (await invokePortfolioAiProviderAdapterBridge(registry, descriptor)).authority,
    'untrusted_model_execution',
  );
  assert.equal(calls, 2);
});

function responseFixture(executionId = 'provider-response-1') {
  const prepared = preparation();
  const descriptor = mapPortfolioAiProviderRequest(
    createPortfolioAiProviderRequest({
      executionId,
      model: { providerId: 'provider-a', modelId: 'model-a' },
      promptDocument: prepared.document,
    }),
  );
  const result = {
    executionId,
    status: AiExecutionStatus.Completed,
    authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
    output: 'Opaque raw output: 900719925474099312345678.1234; missing_price.',
    model: { providerId: 'provider-a', modelId: 'model-a' },
    usage: { inputUnits: 9007199254740991, outputUnits: 0 },
  };
  return { prepared, descriptor, result };
}

test('creates a detached provider response with exact execution/provider/model identity and untrusted state', () => {
  const { prepared, descriptor, result } = responseFixture();
  const before = JSON.stringify({ descriptor, result });
  const response = createPortfolioAiProviderResponse(descriptor, result);

  validatePortfolioAiProviderResponse(descriptor, response);
  assert.equal(response.executionId, descriptor.executionId);
  assert.deepEqual(response.model, descriptor.model);
  assert.equal(response.authority, 'untrusted_model_execution');
  assert.deepEqual(response.result, result);
  assert.equal(response.result.output, result.output);
  assert.equal(response.result.usage.inputUnits, 9007199254740991);
  assert.equal(prepared.context.summary.totalValuedValue, '900719925474099312345678.1234');
  assert.equal(prepared.context.summary.coverage.state, 'partial');
  assert.deepEqual(
    prepared.context.facts
      .filter((fact) => fact.evidence.insight.asset?.symbol === 'USDC')
      .map((fact) => [fact.evidence.insight.asset.id, fact.evidence.insight.asset.networkId]),
    [
      ['asset-a', 'network-a'],
      ['asset-b', 'network-b'],
    ],
  );
  assert.ok(
    prepared.context.facts.some(
      (fact) => fact.evidence.insight.unavailableReason === 'missing_price',
    ),
  );
  response.result.output = 'detached mutation';
  response.model.providerId = 'detached mutation';
  assert.equal(result.output, 'Opaque raw output: 900719925474099312345678.1234; missing_price.');
  assert.equal(descriptor.model.providerId, 'provider-a');
  assert.equal(JSON.stringify({ descriptor, result }), before);
});

test('rejects malformed, mismatched, injected, non-completed, and promoted provider responses', () => {
  const { descriptor, result } = responseFixture('provider-response-invalid');
  const valid = createPortfolioAiProviderResponse(descriptor, result);
  const invalid = [
    null,
    { ...valid, executionId: 'wrong-execution' },
    { ...valid, model: { providerId: 'provider-b', modelId: 'model-a' } },
    { ...valid, model: { providerId: 'provider-a', modelId: 'model-b' } },
    { ...valid, authority: 'untrusted_candidate_interpretation' },
    { ...valid, authority: 'non_authoritative_interpretation' },
    { ...valid, portfolioId: 'fabricated' },
    { ...valid, price: '1.00' },
    { ...valid, coverageState: 'complete' },
    { ...valid, provenance: {} },
    { ...valid, result: { ...result, executionId: 'wrong-execution' } },
    { ...valid, result: { ...result, portfolioId: 'fabricated' } },
    { ...valid, result: { ...result, authority: 'non_authoritative_interpretation' } },
    {
      ...valid,
      result: { ...result, status: AiExecutionStatus.Running, output: undefined },
    },
  ];
  for (const value of invalid) {
    assert.throws(
      () => validatePortfolioAiProviderResponse(descriptor, value),
      AiBoundaryValidationError,
    );
  }
  assert.throws(
    () => createPortfolioAiProviderResponse(descriptor, { ...result, model: undefined }),
    AiBoundaryValidationError,
  );
  assert.deepEqual(createPortfolioAiProviderResponse(descriptor, result), valid);
});

test('is repeatable and isolates failed provider response calls from later valid calls', () => {
  const first = responseFixture('provider-response-repeatable');
  const second = responseFixture('provider-response-repeatable');
  const expected = createPortfolioAiProviderResponse(first.descriptor, first.result);

  assert.deepEqual(createPortfolioAiProviderResponse(second.descriptor, second.result), expected);
  assert.throws(
    () =>
      createPortfolioAiProviderResponse(first.descriptor, {
        ...first.result,
        result: 'unsupported',
      }),
    AiBoundaryValidationError,
  );
  assert.deepEqual(createPortfolioAiProviderResponse(first.descriptor, first.result), expected);
});

test('hardens terminal status and provider-neutral failure metadata without inventing response statuses', () => {
  const { descriptor, result } = responseFixture('provider-response-status');
  const valid = createPortfolioAiProviderResponse(descriptor, result);
  const failedExecution = {
    executionId: result.executionId,
    status: AiExecutionStatus.Failed,
    authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
    failure: { code: 'opaque_failure', message: 'Provider-neutral execution failure.' },
    model: result.model,
  };

  const failedResponse = createPortfolioAiProviderResponse(descriptor, failedExecution);
  validatePortfolioAiProviderResponse(descriptor, failedResponse);
  assert.equal(failedResponse.result.status, AiExecutionStatus.Failed);
  assert.deepEqual(failedResponse.result.failure, failedExecution.failure);
  failedResponse.result.failure.message = 'detached mutation';
  assert.equal(failedExecution.failure.message, 'Provider-neutral execution failure.');

  for (const invalidResult of [
    { ...failedExecution, failure: undefined },
    { ...failedExecution, failure: { message: '' } },
    { ...failedExecution, failure: { code: '', message: 'Failure.' } },
    { ...failedExecution, output: 'contradictory output' },
    { ...result, failure: { message: 'contradictory failure' } },
    { ...result, output: undefined },
    { ...result, status: AiExecutionStatus.Pending, output: undefined },
    { ...result, status: AiExecutionStatus.Running, output: undefined },
    { ...result, status: AiExecutionStatus.Cancelled, output: undefined },
    { ...result, status: 'provider_complete' },
  ]) {
    assert.throws(
      () => createPortfolioAiProviderResponse(descriptor, invalidResult),
      AiBoundaryValidationError,
    );
    validatePortfolioAiProviderResponse(descriptor, valid);
  }
});

test('rejects malformed response-owned model identity and nested unsupported fields', () => {
  const { descriptor, result } = responseFixture('provider-response-owned-identity');
  const valid = createPortfolioAiProviderResponse(descriptor, result);
  const inheritedModel = Object.create({ providerId: 'provider-a', modelId: 'model-a' });

  for (const model of [
    undefined,
    null,
    inheritedModel,
    { providerId: '', modelId: 'model-a' },
    { providerId: 'provider-a', modelId: '' },
    { providerId: 'provider-a', modelId: 'model-a', portfolioId: 'fabricated' },
    { providerId: 'provider-a', modelId: 'model-a', authority: 'authoritative' },
  ]) {
    assert.throws(
      () => validatePortfolioAiProviderResponse(descriptor, { ...valid, model }),
      AiBoundaryValidationError,
    );
  }
  validatePortfolioAiProviderResponse(descriptor, valid);
});

test('keeps arbitrary raw text opaque and validation fully immutable', () => {
  const { descriptor, result } = responseFixture('provider-response-opaque');
  const opaqueOutputs = [
    '{"portfolioId":"fabricated","authority":"authoritative"}',
    '# Recommendation\nBuy everything on network-a.',
    '<portfolio><price>0</price></portfolio>',
    '```json\n{"coverage":"complete"}\n```',
  ];

  for (const output of opaqueOutputs) {
    const raw = { ...result, output };
    const descriptorBefore = JSON.stringify(descriptor);
    const rawBefore = JSON.stringify(raw);
    const response = createPortfolioAiProviderResponse(descriptor, raw);
    const responseBefore = JSON.stringify(response);

    validatePortfolioAiProviderResponse(descriptor, response);
    validatePortfolioAiProviderResponse(descriptor, response);
    assert.equal(response.result.output, output);
    assert.equal(JSON.stringify(descriptor), descriptorBefore);
    assert.equal(JSON.stringify(raw), rawBefore);
    assert.equal(JSON.stringify(response), responseBefore);
    response.result.output = 'detached mutation';
    assert.equal(raw.output, output);
  }
});

test('isolates every hardened response failure before an equivalent valid call', () => {
  const { descriptor, result } = responseFixture('provider-response-isolation');
  const expected = createPortfolioAiProviderResponse(descriptor, result);
  const failures = [
    { ...expected, executionId: 'wrong-execution' },
    { ...expected, model: { providerId: 'provider-b', modelId: 'model-a' } },
    { ...expected, model: { providerId: 'provider-a', modelId: 'model-b' } },
    { ...expected, authority: 'authoritative' },
    { ...expected, assetId: 'fabricated' },
    { ...expected, result: { ...result, failure: { message: 'contradiction' } } },
  ];

  for (const failure of failures) {
    assert.throws(
      () => validatePortfolioAiProviderResponse(descriptor, failure),
      AiBoundaryValidationError,
    );
    assert.deepEqual(createPortfolioAiProviderResponse(descriptor, result), expected);
  }
});

test('normalizes completed provider responses without changing opaque output or traceability', () => {
  const { prepared, descriptor, result } = responseFixture('normalized-response-completed');
  const response = createPortfolioAiProviderResponse(descriptor, {
    ...result,
    output: '```json\n{"recommendation":"buy","price":"1.234500"}\n```',
  });
  const before = JSON.stringify({ descriptor, response });
  const normalized = normalizePortfolioAiProviderResponse(descriptor, response);

  validatePortfolioAiNormalizedProviderResponse(descriptor, normalized);
  assert.equal(normalized.executionId, response.executionId);
  assert.deepEqual(normalized.model, response.model);
  assert.equal(normalized.status, AiExecutionStatus.Completed);
  assert.equal(normalized.authority, 'untrusted_model_execution');
  assert.equal(normalized.output, response.result.output);
  assert.equal(normalized.failure, undefined);
  assert.deepEqual(normalized.source, response);
  assert.equal(
    descriptor.request.promptDocument.plan.input.context.summary.totalValuedValue,
    '900719925474099312345678.1234',
  );
  assert.equal(prepared.context.summary.coverage.state, 'partial');
  assert.deepEqual(
    prepared.context.facts
      .filter((fact) => fact.evidence.insight.asset?.symbol === 'USDC')
      .map((fact) => [fact.evidence.insight.asset.id, fact.evidence.insight.asset.networkId]),
    [
      ['asset-a', 'network-a'],
      ['asset-b', 'network-b'],
    ],
  );
  assert.deepEqual(
    prepared.context.facts
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
  assert.equal(JSON.stringify({ descriptor, response }), before);
  normalized.model.providerId = 'detached';
  normalized.source.result.output = 'detached';
  assert.equal(response.model.providerId, 'provider-a');
  assert.notEqual(response.result.output, 'detached');
});

test('normalizes failed provider responses with detached provider-neutral failure data', () => {
  const { descriptor, result } = responseFixture('normalized-response-failed');
  const response = createPortfolioAiProviderResponse(descriptor, {
    executionId: result.executionId,
    status: AiExecutionStatus.Failed,
    authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
    failure: { code: 'opaque_failure', message: '{"vendorCause":"unknown"}' },
    model: result.model,
  });
  const responseBefore = JSON.stringify(response);
  const normalized = normalizePortfolioAiProviderResponse(descriptor, response);

  validatePortfolioAiNormalizedProviderResponse(descriptor, normalized);
  assert.equal(normalized.status, AiExecutionStatus.Failed);
  assert.equal(normalized.output, undefined);
  assert.deepEqual(normalized.failure, response.result.failure);
  assert.equal(normalized.authority, 'untrusted_model_execution');
  assert.equal(JSON.stringify(response), responseBefore);
  normalized.failure.message = 'detached';
  normalized.source.result.failure.code = 'detached';
  assert.equal(response.result.failure.message, '{"vendorCause":"unknown"}');
  assert.equal(response.result.failure.code, 'opaque_failure');
});

test('rejects malformed, mismatched, injected, and unsupported normalized responses', () => {
  const { descriptor, result } = responseFixture('normalized-response-invalid');
  const response = createPortfolioAiProviderResponse(descriptor, result);
  const valid = normalizePortfolioAiProviderResponse(descriptor, response);
  const invalid = [
    null,
    { ...valid, status: AiExecutionStatus.Running, output: undefined },
    { ...valid, status: AiExecutionStatus.Failed, output: undefined, failure: undefined },
    { ...valid, executionId: 'wrong-execution' },
    { ...valid, model: { providerId: 'provider-b', modelId: 'model-a' } },
    { ...valid, model: { providerId: 'provider-a', modelId: 'model-b' } },
    { ...valid, authority: 'untrusted_candidate_interpretation' },
    { ...valid, portfolioId: 'fabricated' },
    { ...valid, price: '1' },
    { ...valid, provenance: {} },
    { ...valid, semanticContent: {} },
    { ...valid, failure: { portfolioId: 'fabricated' } },
    { ...valid, source: null },
    { ...valid, source: { ...response, executionId: 'wrong-execution' } },
    { ...valid, source: { ...response, assetId: 'fabricated' } },
    { ...valid, output: `${valid.output} altered` },
  ];

  for (const value of invalid) {
    assert.throws(
      () => validatePortfolioAiNormalizedProviderResponse(descriptor, value),
      AiBoundaryValidationError,
    );
  }
  const failed = createPortfolioAiProviderResponse(descriptor, {
    executionId: result.executionId,
    status: AiExecutionStatus.Failed,
    authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
    failure: { message: 'Failure.' },
    model: result.model,
  });
  const normalizedFailed = normalizePortfolioAiProviderResponse(descriptor, failed);
  assert.throws(
    () =>
      validatePortfolioAiNormalizedProviderResponse(descriptor, {
        ...normalizedFailed,
        failure: { message: '', canonicalTimestamp: '2026-08-15T00:00:00.000Z' },
      }),
    AiBoundaryValidationError,
  );
  validatePortfolioAiNormalizedProviderResponse(descriptor, valid);
});

test('normalization is repeatable and isolates failed calls from later valid calls', () => {
  const first = responseFixture('normalized-response-repeatable');
  const second = responseFixture('normalized-response-repeatable');
  const firstResponse = createPortfolioAiProviderResponse(first.descriptor, first.result);
  const secondResponse = createPortfolioAiProviderResponse(second.descriptor, second.result);
  const expected = normalizePortfolioAiProviderResponse(first.descriptor, firstResponse);
  const failures = [
    { ...firstResponse, result: { ...firstResponse.result, status: AiExecutionStatus.Running } },
    { ...firstResponse, result: { ...firstResponse.result, failure: { message: '' } } },
    { ...firstResponse, executionId: 'wrong-execution' },
    { ...firstResponse, authority: 'authoritative' },
    { ...firstResponse, coverage: 'complete' },
  ];

  assert.deepEqual(
    normalizePortfolioAiProviderResponse(second.descriptor, secondResponse),
    expected,
  );
  for (const failure of failures) {
    assert.throws(
      () => normalizePortfolioAiProviderResponse(first.descriptor, failure),
      AiBoundaryValidationError,
    );
    assert.deepEqual(
      normalizePortfolioAiProviderResponse(first.descriptor, firstResponse),
      expected,
    );
  }
});
