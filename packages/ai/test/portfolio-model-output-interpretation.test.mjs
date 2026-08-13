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
  groundPortfolioAiCandidateInterpretation,
  validatePortfolioAiCandidateInterpretationResult,
  validatePortfolioAiGroundedInterpretationResult,
} from '../dist/index.js';

function sectionId(section) {
  return JSON.stringify(['portfolio-candidate', section]);
}

function payload(state = 'partial') {
  const unavailable = state === 'unavailable';
  const items = [
    {
      id: 'usdc-network-a',
      category: 'concentration',
      severity: 'significant',
      priority: 'high',
      priorityReasons: ['significant_severity', 'canonical_identity'],
      targetIdentity: 'asset-network-a',
      evidence: {
        insight: {
          portfolioId: 'portfolio-candidate',
          asset: {
            id: 'asset-network-a',
            symbol: 'USDC',
            networkId: 'network-a',
            contractAddress: 'contract-a',
            decimals: 6,
          },
          sourceId: 'source-a',
          accountId: 'account-a',
          measuredValue: '900719925474099312345678.1234',
          measuredPercentage: '66.6667',
          coverageState: state,
        },
        valuationPositions: [],
      },
    },
    {
      id: 'usdc-network-b',
      category: 'concentration',
      priority: 'normal',
      priorityReasons: ['canonical_identity'],
      targetIdentity: 'asset-network-b',
      evidence: {
        insight: {
          portfolioId: 'portfolio-candidate',
          asset: {
            id: 'asset-network-b',
            symbol: 'USDC',
            networkId: 'network-b',
            contractAddress: 'contract-b',
            decimals: 6,
          },
          measuredPercentage: '33.3333',
          coverageState: state,
        },
        valuationPositions: [],
      },
    },
    {
      id: 'missing-price',
      category: 'data_quality',
      priority: 'high',
      priorityReasons: ['data_quality_limitation', 'canonical_identity'],
      targetIdentity: 'missing_price',
      evidence: {
        insight: {
          portfolioId: 'portfolio-candidate',
          unavailableReason: 'missing_price',
          coverageState: state,
        },
        valuationPositions: [],
      },
    },
    {
      id: 'missing-decimals',
      category: 'data_quality',
      priority: 'high',
      priorityReasons: ['data_quality_limitation', 'canonical_identity'],
      targetIdentity: 'missing_decimals',
      evidence: {
        insight: {
          portfolioId: 'portfolio-candidate',
          unavailableReason: 'missing_decimals',
          coverageState: state,
        },
        valuationPositions: [],
      },
    },
  ];
  return {
    schemaVersion: '1',
    portfolioId: 'portfolio-candidate',
    capturedAt: '2026-08-13T04:00:00.000Z',
    asOf: '2026-08-13T04:00:00.000Z',
    currency: 'USD',
    totalValuedValue: unavailable ? '0' : '900719925474099312345678.1234',
    coverage: {
      state,
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
      {
        id: sectionId('data_quality'),
        section: 'data_quality',
        itemIds: ['missing-price', 'missing-decimals'],
      },
      {
        id: sectionId('prioritized_insights'),
        section: 'prioritized_insights',
        itemIds: items.map((item) => item.id),
      },
    ],
  };
}

function boundary(state = 'partial') {
  const context = buildPortfolioAiContext({
    analysisId: 'candidate-analysis',
    task: PortfolioAiTask.Interpret,
    payload: payload(state),
  });
  const request = {
    executionId: 'candidate-execution',
    context,
    model: { providerId: 'opaque-provider', modelId: 'opaque-model' },
  };
  const execution = {
    executionId: request.executionId,
    status: AiExecutionStatus.Completed,
    authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
    output: 'Opaque raw model output.',
    model: request.model,
  };
  return { context, request, execution };
}

function factReference(fact) {
  return {
    factId: fact.id,
    presentationItemId: fact.presentationItemId,
    sectionIds: fact.grounding.map((grounding) => grounding.sectionIds[0]),
  };
}

function candidateResult(source, overrides = {}) {
  const facts = [factReference(source.context.facts[0]), factReference(source.context.facts[2])];
  const sectionIds = source.context.sections
    .filter((section) => facts.flatMap((fact) => fact.sectionIds).includes(section.id))
    .map((section) => section.id);
  return {
    executionId: source.execution.executionId,
    model: source.execution.model,
    authority: PortfolioAiCandidateInterpretationAuthority.UntrustedCandidateInterpretation,
    candidates: [
      {
        id: 'candidate-1',
        authority: PortfolioAiCandidateInterpretationAuthority.UntrustedCandidateInterpretation,
        kind: PortfolioAiCandidateInterpretationKind.Descriptive,
        content: 'Opaque descriptive candidate content.',
        factReferences: facts,
        sectionIds,
      },
      {
        id: 'candidate-2',
        authority: PortfolioAiCandidateInterpretationAuthority.UntrustedCandidateInterpretation,
        kind: PortfolioAiCandidateInterpretationKind.Descriptive,
        content: 'Section-only candidate content.',
        sectionIds: [source.context.sections[2].id],
      },
    ],
    ...overrides,
  };
}

test('validates multiple detached ungrounded candidates against completed execution and canonical context references', () => {
  const source = boundary();
  const result = candidateResult(source);
  const before = JSON.stringify({ source, result });

  validatePortfolioAiCandidateInterpretationResult(
    source.context,
    source.request,
    source.execution,
    result,
  );

  assert.equal(result.authority, 'untrusted_candidate_interpretation');
  assert.equal(
    source.context.facts[0].evidence.insight.measuredValue,
    '900719925474099312345678.1234',
  );
  assert.equal(source.context.facts[0].evidence.insight.asset.networkId, 'network-a');
  assert.equal(source.context.facts[1].evidence.insight.asset.networkId, 'network-b');
  assert.notEqual(source.context.facts[0].id, source.context.facts[1].id);
  assert.equal(source.context.facts[2].evidence.insight.unavailableReason, 'missing_price');
  assert.equal(source.context.facts[3].evidence.insight.unavailableReason, 'missing_decimals');
  assert.equal(JSON.stringify({ source, result }), before);
  assert.throws(
    () => validatePortfolioAiGroundedInterpretationResult(source.context, result),
    AiBoundaryValidationError,
  );
  validatePortfolioAiCandidateInterpretationResult(
    source.context,
    source.request,
    source.execution,
    result,
  );
});

test('preserves unavailable context and rejects malformed, unknown, contradictory, and fabricated candidate claims without state', () => {
  const source = boundary('unavailable');
  const valid = candidateResult(source);
  assert.equal(source.context.summary.coverage.state, 'unavailable');
  validatePortfolioAiCandidateInterpretationResult(
    source.context,
    source.request,
    source.execution,
    valid,
  );
  assert.throws(
    () =>
      validatePortfolioAiCandidateInterpretationResult(
        source.context,
        source.request,
        source.execution,
        {
          ...valid,
          candidates: [{ ...valid.candidates[0], id: ' ' }],
        },
      ),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiCandidateInterpretationResult(
        source.context,
        source.request,
        source.execution,
        {
          ...valid,
          candidates: [valid.candidates[0], { ...valid.candidates[0] }],
        },
      ),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiCandidateInterpretationResult(
        source.context,
        source.request,
        source.execution,
        {
          ...valid,
          candidates: [
            {
              ...valid.candidates[0],
              factReferences: [
                { ...valid.candidates[0].factReferences[0], factId: 'unknown-fact' },
              ],
            },
          ],
        },
      ),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiCandidateInterpretationResult(
        source.context,
        source.request,
        source.execution,
        {
          ...valid,
          candidates: [{ ...valid.candidates[0], sectionIds: [source.context.sections[0].id] }],
        },
      ),
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
    'measuredPercentage',
    'riskLevel',
    'coverageState',
    'provenance',
  ]) {
    assert.throws(
      () =>
        validatePortfolioAiCandidateInterpretationResult(
          source.context,
          source.request,
          source.execution,
          {
            ...valid,
            candidates: [{ ...valid.candidates[0], [field]: 'fabricated' }],
          },
        ),
      AiBoundaryValidationError,
    );
  }
  assert.throws(
    () =>
      validatePortfolioAiCandidateInterpretationResult(
        source.context,
        source.request,
        source.execution,
        {
          ...valid,
          executionId: 'other-execution',
        },
      ),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiCandidateInterpretationResult(
        source.context,
        source.request,
        source.execution,
        {
          ...valid,
          model: { providerId: 'other-provider' },
        },
      ),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiCandidateInterpretationResult(
        source.context,
        source.request,
        source.execution,
        {
          ...valid,
          authority: 'non_authoritative_interpretation',
        },
      ),
    AiBoundaryValidationError,
  );
  validatePortfolioAiCandidateInterpretationResult(
    source.context,
    source.request,
    source.execution,
    valid,
  );
});

test('deterministically promotes fact and section grounded candidates without changing canonical context', () => {
  const source = boundary();
  const candidate = candidateResult(source);
  const before = JSON.stringify({ source, candidate });
  const grounded = groundPortfolioAiCandidateInterpretation({
    context: source.context,
    request: source.request,
    execution: source.execution,
    candidate,
  });

  assert.equal(grounded.authority, PortfolioAiResultAuthority.NonAuthoritativeInterpretation);
  assert.equal(grounded.coverageState, 'partial');
  assert.deepEqual(
    grounded.interpretations.map((interpretation) => interpretation.id),
    ['candidate-1', 'candidate-2'],
  );
  assert.deepEqual(
    grounded.interpretations[0].factReferences,
    candidate.candidates[0].factReferences,
  );
  assert.deepEqual(grounded.interpretations[1].sectionIds, [source.context.sections[2].id]);
  assert.equal(
    source.context.facts[0].evidence.insight.measuredValue,
    '900719925474099312345678.1234',
  );
  assert.equal(source.context.facts[0].evidence.insight.asset.networkId, 'network-a');
  assert.equal(source.context.facts[1].evidence.insight.asset.networkId, 'network-b');
  assert.equal(JSON.stringify({ source, candidate }), before);
  grounded.interpretations[0].factReferences[0].sectionIds[0] = 'detached-change';
  assert.notEqual(source.context.facts[0].grounding[0].sectionIds[0], 'detached-change');
  assert.deepEqual(
    groundPortfolioAiCandidateInterpretation({
      context: source.context,
      request: source.request,
      execution: source.execution,
      candidate,
    }),
    {
      ...grounded,
      interpretations: grounded.interpretations.map((interpretation, index) =>
        index === 0
          ? {
              ...interpretation,
              factReferences: candidate.candidates[0].factReferences,
            }
          : interpretation,
      ),
    },
  );
});

test('rejects inconsistent promotion inputs without contaminating later valid grounding', () => {
  const source = boundary('unavailable');
  const valid = candidateResult(source);
  const input = {
    context: source.context,
    request: source.request,
    execution: source.execution,
    candidate: valid,
  };

  assert.throws(
    () =>
      groundPortfolioAiCandidateInterpretation({
        ...input,
        candidate: { ...valid, executionId: 'wrong-execution' },
      }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      groundPortfolioAiCandidateInterpretation({
        ...input,
        execution: { ...source.execution, model: { providerId: 'wrong-provider' } },
      }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      groundPortfolioAiCandidateInterpretation({
        ...input,
        execution: {
          ...source.execution,
          model: { providerId: 'opaque-provider', modelId: 'wrong-model' },
        },
      }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      groundPortfolioAiCandidateInterpretation({
        ...input,
        candidate: {
          ...valid,
          candidates: [{ ...valid.candidates[0], factReferences: [], sectionIds: [] }],
        },
      }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      groundPortfolioAiCandidateInterpretation({
        ...input,
        candidate: {
          ...valid,
          candidates: [{ ...valid.candidates[0], sectionIds: ['unknown-section'] }],
        },
      }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      groundPortfolioAiCandidateInterpretation({
        ...input,
        candidate: {
          ...valid,
          authority: PortfolioAiResultAuthority.NonAuthoritativeInterpretation,
        },
      }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      groundPortfolioAiCandidateInterpretation({
        ...input,
        candidate: {
          ...valid,
          candidates: [{ ...valid.candidates[0], measuredPercentage: '0' }],
        },
      }),
    AiBoundaryValidationError,
  );
  assert.equal(groundPortfolioAiCandidateInterpretation(input).coverageState, 'unavailable');
});
