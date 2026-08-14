import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AiBoundaryValidationError,
  AiExecutionStatus,
  PortfolioAiCandidateInterpretationAuthority,
  PortfolioAiCandidateInterpretationKind,
  PortfolioAiRawExecutionAuthority,
  PortfolioAiResultAuthority,
  PortfolioAiTask,
  buildPortfolioAiContext,
  validatePortfolioAiBuiltContext,
  validatePortfolioAiCandidateInterpretationResult,
  validatePortfolioAiGroundedInterpretationResult,
  validatePortfolioAiModelExecutionResult,
} from '../dist/index.js';

function sectionId(section) {
  return JSON.stringify(['portfolio-ai-e2e', section]);
}

function item(id, category, targetIdentity, evidence, overrides = {}) {
  return {
    id,
    category,
    priority: category === 'data_quality' ? 'high' : 'normal',
    priorityReasons: [
      category === 'data_quality' ? 'data_quality_limitation' : 'measured_magnitude',
      'canonical_identity',
    ],
    targetIdentity,
    evidence: {
      insight: { portfolioId: 'portfolio-ai-e2e', ...evidence },
      valuationPositions: [],
    },
    ...overrides,
  };
}

function payload(coverageState = 'partial') {
  const items = [
    item(
      'usdc-network-a',
      'concentration',
      'asset-network-a',
      {
        asset: {
          id: 'asset-network-a',
          symbol: 'USDC',
          networkId: 'network-a',
          contractAddress: 'contract-a',
          decimals: 6,
        },
        positionIdentity: 'position-network-a',
        sourceId: 'source-a',
        accountId: 'account-a',
        measuredValue: '900719925474099312345678.1234',
        measuredPercentage: '66.6667',
        thresholdEvidence: { moderate: '40', high: '60' },
        riskLevel: 'high',
        coverageState,
      },
      {
        severity: 'significant',
        priority: 'high',
        priorityReasons: ['significant_severity', 'measured_magnitude', 'canonical_identity'],
      },
    ),
    item('usdc-network-b', 'concentration', 'asset-network-b', {
      asset: {
        id: 'asset-network-b',
        symbol: 'USDC',
        networkId: 'network-b',
        contractAddress: 'contract-b',
        decimals: 6,
      },
      positionIdentity: 'position-network-b',
      measuredPercentage: '33.3333',
      coverageState,
    }),
    item('missing-price', 'data_quality', 'missing_price', {
      unavailableReason: 'missing_price',
      coverageState,
    }),
    item('missing-decimals', 'data_quality', 'missing_decimals', {
      unavailableReason: 'missing_decimals',
      coverageState,
    }),
    item('unclassified-network', 'exposure', 'unclassified-network', {
      unavailableReason: 'missing_network_provenance',
      coverageState,
    }),
    item('missing-source', 'data_quality', 'missing_source', {
      unavailableReason: 'missing_source_provenance',
      coverageState,
    }),
    item('missing-account', 'data_quality', 'missing_account', {
      unavailableReason: 'missing_account_provenance',
      coverageState,
    }),
  ];
  const unavailable = coverageState === 'unavailable';
  return {
    schemaVersion: '1',
    portfolioId: 'portfolio-ai-e2e',
    capturedAt: '2026-08-12T03:00:00.000Z',
    asOf: '2026-08-12T03:00:00.000Z',
    currency: 'USD',
    totalValuedValue: unavailable ? '0' : '900719925474099312345678.1234',
    coverage: {
      state: coverageState,
      valuation: {
        totalPositionCount: unavailable ? 2 : 4,
        valuedPositionCount: unavailable ? 0 : 2,
        unvaluedPositionCount: unavailable ? 2 : 2,
        valuedPositionCoveragePercentage: unavailable ? '0' : '50',
        unvaluedReasons: unavailable
          ? [{ reason: 'missing_price', positionCount: 2 }]
          : [
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
        itemIds: ['usdc-network-a', 'usdc-network-b'],
      },
      { id: sectionId('exposure'), section: 'exposure', itemIds: ['unclassified-network'] },
      {
        id: sectionId('data_quality'),
        section: 'data_quality',
        itemIds: ['missing-price', 'missing-decimals', 'missing-source', 'missing-account'],
      },
      {
        id: sectionId('prioritized_insights'),
        section: 'prioritized_insights',
        itemIds: items.map((entry) => entry.id),
      },
    ],
  };
}

function build(source = payload()) {
  return buildPortfolioAiContext({
    analysisId: 'ai-e2e-analysis',
    task: PortfolioAiTask.Interpret,
    payload: source,
  });
}

function reference(fact) {
  return {
    factId: fact.id,
    presentationItemId: fact.presentationItemId,
    sectionIds: fact.grounding.map((grounding) => grounding.sectionIds[0]),
  };
}

function result(context, overrides = {}) {
  return {
    analysisId: context.analysisId,
    task: context.task,
    authority: PortfolioAiResultAuthority.NonAuthoritativeInterpretation,
    coverageState: context.summary.coverage.state,
    interpretations: [
      {
        id: 'interpretation-e2e-1',
        authority: PortfolioAiResultAuthority.NonAuthoritativeInterpretation,
        content: 'Grounded non-authoritative interpretation.',
        coverageState: context.summary.coverage.state,
        factReferences: [
          reference(context.facts[0]),
          reference(context.facts[2]),
          reference(context.facts[4]),
        ],
      },
    ],
    ...overrides,
  };
}

test('validates the canonical payload to context to grounded non-authoritative interpretation path', () => {
  const source = payload();
  const before = JSON.stringify(source);
  const context = build(source);
  const output = result(context);
  const contextBefore = JSON.stringify(context);
  const outputBefore = JSON.stringify(output);

  validatePortfolioAiBuiltContext(context);
  validatePortfolioAiGroundedInterpretationResult(context, output);

  assert.equal(context.source.portfolioId, source.portfolioId);
  assert.equal(context.summary.coverage.state, 'partial');
  assert.equal(context.summary.totalValuedValue, '900719925474099312345678.1234');
  assert.equal(
    context.facts[0].id,
    JSON.stringify([source.portfolioId, source.capturedAt, source.asOf, 'usdc-network-a']),
  );
  assert.equal(context.facts[0].evidence.insight.asset.networkId, 'network-a');
  assert.equal(context.facts[1].evidence.insight.asset.networkId, 'network-b');
  assert.notEqual(context.facts[0].id, context.facts[1].id);
  assert.equal(context.facts[0].evidence.insight.sourceId, 'source-a');
  assert.equal(context.facts[0].evidence.insight.accountId, 'account-a');
  assert.equal(context.facts[2].evidence.insight.unavailableReason, 'missing_price');
  assert.equal(context.facts[3].evidence.insight.unavailableReason, 'missing_decimals');
  assert.equal(context.facts[4].evidence.insight.unavailableReason, 'missing_network_provenance');
  assert.equal(output.authority, 'non_authoritative_interpretation');
  assert.deepEqual(output.interpretations[0].factReferences, [
    reference(context.facts[0]),
    reference(context.facts[2]),
    reference(context.facts[4]),
  ]);
  assert.equal(JSON.stringify(source), before);
  assert.equal(JSON.stringify(context), contextBefore);
  assert.equal(JSON.stringify(output), outputBefore);
  assert.deepEqual(build(source), context);
  validatePortfolioAiGroundedInterpretationResult(context, output);
});

test('enforces trust markers and canonical authority without lower-trust promotion or mutation', () => {
  const source = payload();
  const context = build(source);
  const request = {
    executionId: 'authority-execution',
    context,
    model: { providerId: 'opaque-provider', modelId: 'opaque-model' },
  };
  const execution = {
    executionId: request.executionId,
    status: AiExecutionStatus.Completed,
    authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
    output: 'Opaque raw output.',
    model: request.model,
  };
  const candidate = {
    executionId: request.executionId,
    model: request.model,
    authority: PortfolioAiCandidateInterpretationAuthority.UntrustedCandidateInterpretation,
    candidates: [
      {
        id: 'authority-candidate',
        authority: PortfolioAiCandidateInterpretationAuthority.UntrustedCandidateInterpretation,
        kind: PortfolioAiCandidateInterpretationKind.Descriptive,
        content: 'Opaque candidate content.',
        factReferences: [reference(context.facts[0])],
      },
    ],
  };
  const grounded = result(context);
  const before = JSON.stringify({ source, context, request, execution, candidate, grounded });

  validatePortfolioAiModelExecutionResult(request, execution);
  validatePortfolioAiCandidateInterpretationResult(context, request, execution, candidate);
  validatePortfolioAiGroundedInterpretationResult(context, grounded);
  assert.throws(
    () => validatePortfolioAiCandidateInterpretationResult(context, request, execution, execution),
    AiBoundaryValidationError,
  );
  assert.throws(
    () => validatePortfolioAiGroundedInterpretationResult(context, candidate),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiModelExecutionResult(request, {
        ...execution,
        authority: PortfolioAiResultAuthority.NonAuthoritativeInterpretation,
      }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiCandidateInterpretationResult(context, request, execution, {
        ...candidate,
        authority: PortfolioAiResultAuthority.NonAuthoritativeInterpretation,
      }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiGroundedInterpretationResult(context, {
        ...grounded,
        authority: PortfolioAiCandidateInterpretationAuthority.UntrustedCandidateInterpretation,
      }),
    AiBoundaryValidationError,
  );
  for (const field of [
    'portfolioId',
    'assetId',
    'positionId',
    'networkId',
    'sourceId',
    'accountId',
    'price',
    'measuredValue',
    'measuredPercentage',
    'allocation',
    'threshold',
    'riskLevel',
    'coverageState',
    'capturedAt',
    'provenance',
  ]) {
    assert.throws(
      () =>
        validatePortfolioAiCandidateInterpretationResult(context, request, execution, {
          ...candidate,
          candidates: [{ ...candidate.candidates[0], [field]: 'fabricated' }],
        }),
      AiBoundaryValidationError,
    );
  }
  assert.throws(
    () =>
      validatePortfolioAiGroundedInterpretationResult(context, {
        ...grounded,
        coverageState: 'complete',
      }),
    AiBoundaryValidationError,
  );
  const unavailableContext = build(payload('unavailable'));
  assert.throws(
    () =>
      validatePortfolioAiGroundedInterpretationResult(unavailableContext, {
        ...result(unavailableContext),
        coverageState: 'partial',
      }),
    AiBoundaryValidationError,
  );
  assert.equal(context.facts[0].evidence.insight.asset.networkId, 'network-a');
  assert.equal(context.facts[1].evidence.insight.asset.networkId, 'network-b');
  assert.notEqual(context.facts[0].id, context.facts[1].id);
  assert.equal(context.facts[0].evidence.insight.measuredValue, '900719925474099312345678.1234');
  assert.equal(
    JSON.stringify({ source, context, request, execution, candidate, grounded }),
    before,
  );
  validatePortfolioAiCandidateInterpretationResult(context, request, execution, candidate);
  validatePortfolioAiGroundedInterpretationResult(context, grounded);
});

test('keeps unavailable coverage explicit and rejects fabricated canonical fields without contaminating later validation', () => {
  const unavailableContext = build(payload('unavailable'));
  const unavailableResult = result(unavailableContext);
  validatePortfolioAiGroundedInterpretationResult(unavailableContext, unavailableResult);
  assert.equal(unavailableContext.summary.coverage.state, 'unavailable');
  assert.equal(unavailableResult.coverageState, 'unavailable');

  const context = build();
  const valid = result(context);
  const canonicalFields = [
    'portfolioId',
    'assetId',
    'positionId',
    'networkId',
    'sourceId',
    'accountId',
    'value',
    'percentage',
    'price',
    'threshold',
    'riskLevel',
    'capturedAt',
    'asOf',
    'provenance',
  ];
  for (const field of canonicalFields) {
    assert.throws(
      () =>
        validatePortfolioAiGroundedInterpretationResult(context, {
          ...valid,
          interpretations: [{ ...valid.interpretations[0], [field]: 'fabricated' }],
        }),
      AiBoundaryValidationError,
    );
  }
  assert.throws(
    () =>
      validatePortfolioAiGroundedInterpretationResult(context, {
        ...valid,
        coverageState: 'complete',
      }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiGroundedInterpretationResult(context, {
        ...valid,
        interpretations: [
          {
            ...valid.interpretations[0],
            factReferences: [{ ...reference(context.facts[0]), factId: 'unknown-fact' }],
          },
        ],
      }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiGroundedInterpretationResult(context, {
        ...valid,
        interpretations: [valid.interpretations[0], { ...valid.interpretations[0] }],
      }),
    AiBoundaryValidationError,
  );
  validatePortfolioAiGroundedInterpretationResult(context, valid);
});
