import assert from 'node:assert/strict';
import test from 'node:test';
import { PortfolioPresentationSection } from '@cryptodesk-ai/portfolio';
import {
  AiBoundaryValidationError,
  PortfolioAiPromptDocumentVersion,
  PortfolioAiTask,
  buildPortfolioAiContext,
  createPortfolioAiMessagePlan,
  createPortfolioAiModelInput,
  createPortfolioAiPromptDocument,
  createPortfolioAiProviderRequest,
  validatePortfolioAiMessagePlan,
  validatePortfolioAiModelInput,
  validatePortfolioAiPromptDocument,
  validatePortfolioAiProviderRequest,
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
