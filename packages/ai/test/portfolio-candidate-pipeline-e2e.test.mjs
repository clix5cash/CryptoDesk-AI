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
  assemblePortfolioAiCandidateInterpretation,
  buildPortfolioAiContext,
  groundPortfolioAiCandidateInterpretation,
  validatePortfolioAiCandidateInterpretationResult,
  validatePortfolioAiGroundedInterpretationResult,
} from '../dist/index.js';

function sectionId(section) {
  return JSON.stringify(['candidate-pipeline', section]);
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
          portfolioId: 'candidate-pipeline',
          asset: {
            id: 'asset-network-a',
            symbol: 'USDC',
            networkId: 'network-a',
            contractAddress: 'contract-a',
            decimals: 6,
          },
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
          portfolioId: 'candidate-pipeline',
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
          portfolioId: 'candidate-pipeline',
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
          portfolioId: 'candidate-pipeline',
          unavailableReason: 'missing_decimals',
          coverageState: state,
        },
        valuationPositions: [],
      },
    },
  ];
  return {
    schemaVersion: '1',
    portfolioId: 'candidate-pipeline',
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
    ],
  };
}

function boundary(state = 'partial') {
  const context = buildPortfolioAiContext({
    analysisId: 'candidate-pipeline-analysis',
    task: PortfolioAiTask.Interpret,
    payload: payload(state),
  });
  const request = {
    executionId: 'candidate-pipeline-execution',
    context,
    model: { providerId: 'opaque-provider', modelId: 'opaque-model' },
  };
  const execution = {
    executionId: request.executionId,
    status: AiExecutionStatus.Completed,
    authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
    output: 'Opaque output is never parsed.',
    model: request.model,
  };
  const reference = (fact) => ({
    factId: fact.id,
    presentationItemId: fact.presentationItemId,
    sectionIds: fact.grounding.map((grounding) => grounding.sectionIds[0]),
  });
  const facts = [reference(context.facts[0]), reference(context.facts[2])];
  const sectionIds = context.sections
    .filter((section) => facts.flatMap((fact) => fact.sectionIds).includes(section.id))
    .map((section) => section.id);
  return {
    context,
    request,
    execution,
    assembly: {
      context,
      request,
      execution,
      candidates: [
        {
          id: 'candidate-fact-and-section',
          kind: PortfolioAiCandidateInterpretationKind.Descriptive,
          content: 'Opaque structured candidate.',
          factReferences: facts,
          sectionIds,
        },
        {
          id: 'candidate-section-only',
          kind: PortfolioAiCandidateInterpretationKind.Descriptive,
          content: 'Opaque section candidate.',
          sectionIds: [context.sections[2].id],
        },
      ],
    },
  };
}

test('preserves trust, canonical traceability, precision, ordering, and partial coverage end to end', () => {
  const source = boundary();
  const before = JSON.stringify(source);
  assert.throws(
    () =>
      validatePortfolioAiCandidateInterpretationResult(
        source.context,
        source.request,
        source.execution,
        source.execution,
      ),
    AiBoundaryValidationError,
  );

  const candidate = assemblePortfolioAiCandidateInterpretation(source.assembly);
  validatePortfolioAiCandidateInterpretationResult(
    source.context,
    source.request,
    source.execution,
    candidate,
  );
  assert.throws(
    () => validatePortfolioAiGroundedInterpretationResult(source.context, candidate),
    AiBoundaryValidationError,
  );
  const grounded = groundPortfolioAiCandidateInterpretation({
    context: source.context,
    request: source.request,
    execution: source.execution,
    candidate,
  });

  assert.equal(
    candidate.authority,
    PortfolioAiCandidateInterpretationAuthority.UntrustedCandidateInterpretation,
  );
  assert.equal(grounded.authority, PortfolioAiResultAuthority.NonAuthoritativeInterpretation);
  assert.equal(grounded.analysisId, source.context.analysisId);
  assert.deepEqual(
    grounded.interpretations.map((item) => item.id),
    ['candidate-fact-and-section', 'candidate-section-only'],
  );
  assert.equal(candidate.executionId, source.execution.executionId);
  assert.deepEqual(candidate.model, source.execution.model);
  assert.deepEqual(
    grounded.interpretations[0].factReferences,
    candidate.candidates[0].factReferences,
  );
  assert.equal(grounded.coverageState, 'partial');
  assert.equal(
    source.context.facts[0].evidence.insight.measuredValue,
    '900719925474099312345678.1234',
  );
  assert.equal(source.context.facts[0].evidence.insight.asset.networkId, 'network-a');
  assert.equal(source.context.facts[1].evidence.insight.asset.networkId, 'network-b');
  assert.notEqual(source.context.facts[0].id, source.context.facts[1].id);
  assert.equal(source.context.facts[2].evidence.insight.unavailableReason, 'missing_price');
  assert.equal(source.context.facts[3].evidence.insight.unavailableReason, 'missing_decimals');
  assert.equal(JSON.stringify(source), before);
  grounded.interpretations[0].factReferences[0].sectionIds[0] = 'detached-change';
  assert.notEqual(candidate.candidates[0].factReferences[0].sectionIds[0], 'detached-change');
  assert.deepEqual(
    groundPortfolioAiCandidateInterpretation({
      context: source.context,
      request: source.request,
      execution: source.execution,
      candidate,
    }),
    {
      ...grounded,
      interpretations: grounded.interpretations.map((item, index) =>
        index === 0 ? { ...item, factReferences: candidate.candidates[0].factReferences } : item,
      ),
    },
  );
});

test('keeps unavailable coverage explicit and isolates malformed candidate pipeline calls', () => {
  const source = boundary('unavailable');
  const candidate = assemblePortfolioAiCandidateInterpretation(source.assembly);
  assert.equal(
    groundPortfolioAiCandidateInterpretation({
      context: source.context,
      request: source.request,
      execution: source.execution,
      candidate,
    }).coverageState,
    'unavailable',
  );
  assert.throws(
    () =>
      assemblePortfolioAiCandidateInterpretation({
        ...source.assembly,
        candidates: [{ ...source.assembly.candidates[0], portfolioId: 'fabricated' }],
      }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      groundPortfolioAiCandidateInterpretation({
        context: source.context,
        request: source.request,
        execution: { ...source.execution, executionId: 'other-execution' },
        candidate,
      }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      groundPortfolioAiCandidateInterpretation({
        context: source.context,
        request: source.request,
        execution: source.execution,
        candidate: {
          ...candidate,
          candidates: [{ ...candidate.candidates[0], factReferences: [], sectionIds: [] }],
        },
      }),
    AiBoundaryValidationError,
  );
  assert.equal(
    groundPortfolioAiCandidateInterpretation({
      context: source.context,
      request: source.request,
      execution: source.execution,
      candidate,
    }).authority,
    PortfolioAiResultAuthority.NonAuthoritativeInterpretation,
  );
});
