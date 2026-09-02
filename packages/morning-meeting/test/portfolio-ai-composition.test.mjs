import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  AiExecutionStatus,
  PortfolioAiRawExecutionAuthority,
  PortfolioAiTask,
  buildPortfolioAiContext,
  createPortfolioAiMessagePlan,
  createPortfolioAiModelInput,
  createPortfolioAiPromptDocument,
  createPortfolioAiProviderExchange,
  createPortfolioAiProviderRequest,
  createPortfolioAiProviderResponse,
  groundPortfolioAiParsedCandidates,
  mapPortfolioAiProviderRequest,
  normalizePortfolioAiProviderResponse,
  parsePortfolioAiStructuredOutput,
  validatePortfolioAiParsedCandidates,
} from '@cryptodesk-ai/ai';
import {
  DefaultMorningMeetingMvpApplicationApi,
  MorningMeetingBias,
  MorningMeetingPortfolioAiApplicationError,
  MorningMeetingPortfolioAiFailurePolicy,
  MorningMeetingPortfolioAiLifecycleOutcome,
  MorningMeetingReportError,
  MorningMeetingReportValidator,
  MorningMeetingRiskLevel,
  composeMorningMeetingPortfolioAi,
  composeMorningMeetingPortfolioAiApplicationOutput,
  composeMorningMeetingPortfolioAiLifecycle,
  validateMorningMeetingMvpApplicationApiInput,
  validateMorningMeetingPortfolioAiComposition,
} from '../dist/index.js';

function meetingCanonical() {
  const request = { timeframe: '1h', asOf: '2026-08-23T01:00:00.000Z' };
  const report = {
    id: 'meeting-composition',
    generatedAt: '2026-08-23T01:00:00.000Z',
    asOf: '2026-08-23T01:00:00.000Z',
    timeframe: '1h',
    marketViews: [
      {
        assetId: 'asset-market',
        marketId: 'market-usd',
        timeframe: '1h',
        latestSnapshot: {
          marketId: 'market-usd',
          baseAssetId: 'asset-market',
          quoteAssetId: 'usd',
          timeframe: '1h',
          capturedAt: '2026-08-23T00:00:00.000Z',
          lastPrice: 1,
          high: 1,
          low: 1,
          volume: 1,
        },
        indicators: [],
        signals: [],
        bias: MorningMeetingBias.Neutral,
        riskLevel: MorningMeetingRiskLevel.Low,
        evidence: [],
      },
    ],
    sections: [],
  };
  new MorningMeetingReportValidator().validate(report, request);
  return { request, report };
}

function sectionId(section) {
  return JSON.stringify(['composition-portfolio', section]);
}

function portfolioFixture(suffix = 'one', contents = []) {
  const items = [
    {
      id: 'network-a',
      category: 'concentration',
      priority: 'high',
      priorityReasons: ['canonical_identity'],
      targetIdentity: 'asset-a',
      evidence: {
        insight: {
          portfolioId: 'composition-portfolio',
          asset: { id: 'asset-a', symbol: 'USDC', networkId: 'network-a', decimals: 6 },
          measuredValue: '900719925474099312345678.123456',
          measuredPercentage: '66.6667',
          coverageState: 'partial',
        },
        valuationPositions: [],
      },
    },
    {
      id: 'network-b',
      category: 'concentration',
      priority: 'normal',
      priorityReasons: ['canonical_identity'],
      targetIdentity: 'asset-b',
      evidence: {
        insight: {
          portfolioId: 'composition-portfolio',
          asset: { id: 'asset-b', symbol: 'USDC', networkId: 'network-b', decimals: 6 },
          measuredPercentage: '33.3333',
          coverageState: 'partial',
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
          portfolioId: 'composition-portfolio',
          unavailableReason: 'missing_price',
          coverageState: 'partial',
        },
        valuationPositions: [],
      },
    },
  ];
  const context = buildPortfolioAiContext({
    analysisId: 'composition-analysis',
    task: PortfolioAiTask.Interpret,
    payload: {
      schemaVersion: '1',
      portfolioId: 'composition-portfolio',
      capturedAt: '2026-08-23T00:00:00.000Z',
      asOf: '2026-08-23T00:00:00.000Z',
      currency: 'USD',
      totalValuedValue: '900719925474099312345678.123456',
      coverage: {
        state: 'partial',
        valuation: {
          totalPositionCount: 3,
          valuedPositionCount: 2,
          unvaluedPositionCount: 1,
          valuedPositionCoveragePercentage: '66.6667',
          unvaluedReasons: [{ reason: 'missing_price', positionCount: 1 }],
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
          itemIds: ['missing-price'],
        },
        {
          id: sectionId('prioritized_insights'),
          section: 'prioritized_insights',
          itemIds: items.map((item) => item.id),
        },
      ],
    },
  });
  const executionId = `composition-execution-${suffix}`;
  const model = { providerId: 'composition-provider', modelId: 'composition-model' };
  const modelInput = createPortfolioAiModelInput({
    task: PortfolioAiTask.Interpret,
    context,
    factIds: context.facts.map((fact) => fact.id),
    sectionIds: [sectionId('concentration'), sectionId('data_quality')],
  });
  const promptDocument = createPortfolioAiPromptDocument(createPortfolioAiMessagePlan(modelInput));
  const descriptor = mapPortfolioAiProviderRequest(
    createPortfolioAiProviderRequest({ executionId, model, promptDocument }),
  );
  const references = context.facts.map((fact) => ({
    factId: fact.id,
    presentationItemId: fact.presentationItemId,
    sectionIds: fact.grounding.map((reference) => reference.sectionIds[0]),
  }));
  const output = JSON.stringify({
    executionId,
    providerId: model.providerId,
    modelId: model.modelId,
    candidates: [
      {
        id: `candidate-${suffix}-network-a`,
        kind: 'descriptive',
        content: contents[0] ?? 'Non-authoritative description for exact network A evidence.',
        factReferences: [references[0]],
      },
      {
        id: `candidate-${suffix}-network-b`,
        kind: 'descriptive',
        content: contents[1] ?? 'Non-authoritative description for exact network B evidence.',
        factReferences: [references[1]],
      },
      {
        id: `candidate-${suffix}-missing`,
        kind: 'descriptive',
        content: contents[2] ?? 'Missing data remains missing; prose does not fill it.',
        factReferences: [references[2]],
      },
    ],
  });
  const raw = {
    executionId,
    status: AiExecutionStatus.Completed,
    authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
    output,
    model,
  };
  const response = createPortfolioAiProviderResponse(descriptor, raw);
  const normalized = normalizePortfolioAiProviderResponse(descriptor, response);
  const exchange = createPortfolioAiProviderExchange(descriptor, normalized);
  const parsed = parsePortfolioAiStructuredOutput(exchange);
  const candidateValidation = validatePortfolioAiParsedCandidates(parsed);
  const grounded = groundPortfolioAiParsedCandidates({ parsed, candidateValidation });
  return { context, parsed, grounded };
}

function input(
  interpretations = [portfolioFixture().grounded],
  context = portfolioFixture().context,
) {
  return {
    canonical: { ...meetingCanonical(), portfolioContext: context },
    interpretations,
  };
}

test('composes canonical application state with one non-authoritative interpretation', () => {
  const fixture = portfolioFixture();
  const source = input([fixture.grounded], fixture.context);
  const result = composeMorningMeetingPortfolioAi(source);

  validateMorningMeetingPortfolioAiComposition(result);
  assert.deepEqual(result.canonical, source.canonical);
  assert.equal(result.interpretations[0].authority, 'non_authoritative_interpretation');
  assert.equal(result.canonical.portfolioContext.summary.coverage.state, 'partial');
  assert.equal(
    result.canonical.portfolioContext.summary.totalValuedValue,
    '900719925474099312345678.123456',
  );
  assert.equal('authority' in result.canonical, false);
  assert.notEqual(result, source);
});

test('accepts zero or multiple interpretations and preserves explicit order', () => {
  const first = portfolioFixture('first');
  const second = portfolioFixture('second');
  assert.deepEqual(composeMorningMeetingPortfolioAi(input([], first.context)).interpretations, []);

  const result = composeMorningMeetingPortfolioAi(
    input([second.grounded, first.grounded], first.context),
  );
  assert.deepEqual(
    result.interpretations.map((interpretation) => interpretation.executionId),
    ['composition-execution-second', 'composition-execution-first'],
  );
});

test('rejects raw, candidate, trust-mutated, and mismatched-context AI material', () => {
  const first = portfolioFixture('first');
  const mismatchedContext = { ...first.context, analysisId: 'different-analysis' };
  const invalid = [
    input([first.parsed], first.context),
    input([first.grounded.sourceCandidateValidation], first.context),
    input([{ ...first.grounded, authority: 'untrusted_candidate_interpretation' }], first.context),
    input([first.grounded], mismatchedContext),
  ];
  for (const value of invalid) {
    assert.throws(() => composeMorningMeetingPortfolioAi(value), MorningMeetingReportError);
  }
});

test('rejects unknown references, canonical injection, and duplicate interpretation identity', () => {
  const fixture = portfolioFixture();
  const interpretation = fixture.grounded.grounded.interpretations[0];
  const invalid = [
    input(
      [
        {
          ...fixture.grounded,
          grounded: {
            ...fixture.grounded.grounded,
            interpretations: [
              {
                ...interpretation,
                factReferences: [{ ...interpretation.factReferences[0], factId: 'unknown-fact' }],
              },
            ],
          },
        },
      ],
      fixture.context,
    ),
    input([{ ...fixture.grounded, portfolioId: 'injected' }], fixture.context),
    input([fixture.grounded, fixture.grounded], fixture.context),
  ];
  for (const value of invalid) {
    assert.throws(() => composeMorningMeetingPortfolioAi(value), MorningMeetingReportError);
  }
});

test('preserves same-symbol cross-network identity and missing data without inference', () => {
  const fixture = portfolioFixture();
  const result = composeMorningMeetingPortfolioAi(input([fixture.grounded], fixture.context));
  const facts = result.canonical.portfolioContext.facts;

  assert.deepEqual(
    facts
      .slice(0, 2)
      .map((fact) => [fact.evidence.insight.asset.symbol, fact.evidence.insight.asset.networkId]),
    [
      ['USDC', 'network-a'],
      ['USDC', 'network-b'],
    ],
  );
  assert.equal(facts[2].evidence.insight.unavailableReason, 'missing_price');
  assert.equal(result.interpretations[0].grounded.coverageState, 'partial');
  assert.equal('price' in result.interpretations[0].grounded, false);
});

test('is deterministic, detached, immutable, and isolated after failed calls', () => {
  const fixture = portfolioFixture();
  const source = input([fixture.grounded], fixture.context);
  const before = JSON.stringify(source);
  const expected = composeMorningMeetingPortfolioAi(source);
  const mutated = composeMorningMeetingPortfolioAi(source);
  mutated.canonical.portfolioContext.facts[0].evidence.insight.asset.networkId = 'local-only';
  mutated.interpretations[0].grounded.interpretations[0].content = 'local-only';

  assert.equal(JSON.stringify(source), before);
  assert.deepEqual(composeMorningMeetingPortfolioAi(source), expected);
  assert.throws(
    () => composeMorningMeetingPortfolioAi({ ...source, extra: true }),
    MorningMeetingReportError,
  );
  assert.deepEqual(composeMorningMeetingPortfolioAi(source), expected);
});

test('keeps dependency direction and existing Morning Meeting report validation compatible', async () => {
  const morningPackage = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const aiPackage = JSON.parse(
    await readFile(new URL('../../ai/package.json', import.meta.url), 'utf8'),
  );
  const portfolioPackage = JSON.parse(
    await readFile(new URL('../../portfolio/package.json', import.meta.url), 'utf8'),
  );
  const runtimePackage = JSON.parse(
    await readFile(new URL('../../openai-runtime/package.json', import.meta.url), 'utf8'),
  );
  assert.equal(morningPackage.dependencies['@cryptodesk-ai/ai'], 'workspace:*');
  assert.equal(aiPackage.dependencies?.['@cryptodesk-ai/morning-meeting'], undefined);
  assert.equal(portfolioPackage.dependencies?.['@cryptodesk-ai/ai'], undefined);
  assert.equal(runtimePackage.dependencies?.['@cryptodesk-ai/morning-meeting'], undefined);

  const canonical = meetingCanonical();
  assert.doesNotThrow(() =>
    new MorningMeetingReportValidator().validate(canonical.report, canonical.request),
  );
});

test('orchestrates the canonical report unchanged when optional AI is absent', () => {
  const canonical = meetingCanonical();
  const result = composeMorningMeetingPortfolioAiApplicationOutput(canonical);

  assert.deepEqual(result, { canonicalReport: canonical.report });
  assert.notEqual(result.canonicalReport, canonical.report);
  assert.equal('aiNarrative' in result, false);
});

test('includes validated AI prose separately with exact traceability and canonical authority', () => {
  const fixture = portfolioFixture();
  const composition = composeMorningMeetingPortfolioAi(input([fixture.grounded], fixture.context));
  const result = composeMorningMeetingPortfolioAiApplicationOutput({
    request: composition.canonical.request,
    report: composition.canonical.report,
    composition,
  });

  assert.deepEqual(result.canonicalReport, composition.canonical.report);
  assert.equal(result.canonicalReport.marketViews[0].riskLevel, MorningMeetingRiskLevel.Low);
  assert.equal(result.aiNarrative.authority, 'non_authoritative_interpretation');
  assert.equal(result.aiNarrative.items[0].authority, 'non_authoritative_interpretation');
  assert.deepEqual(result.aiNarrative.items[0].trace, {
    executionId: 'composition-execution-one',
    providerId: 'composition-provider',
    modelId: 'composition-model',
    candidateId: 'candidate-one-network-a',
    factReferences: fixture.grounded.grounded.interpretations[0].factReferences,
    sectionIds: fixture.grounded.grounded.interpretations[0].sectionIds ?? [],
  });
  assert.equal('riskLevel' in result.aiNarrative.items[0], false);
  assert.equal('rawOutput' in result.aiNarrative.items[0].trace, false);
});

test('preserves interpretation and candidate order through application presentation', () => {
  const first = portfolioFixture('first');
  const second = portfolioFixture('second');
  const composition = composeMorningMeetingPortfolioAi(
    input([second.grounded, first.grounded], first.context),
  );
  const result = composeMorningMeetingPortfolioAiApplicationOutput({
    request: composition.canonical.request,
    report: composition.canonical.report,
    composition,
  });

  assert.deepEqual(
    result.aiNarrative.items.map((item) => item.id),
    [
      'candidate-second-network-a',
      'candidate-second-network-b',
      'candidate-second-missing',
      'candidate-first-network-a',
      'candidate-first-network-b',
      'candidate-first-missing',
    ],
  );
});

test('rejects invalid AI by default or explicitly omits it without affecting canonical output', () => {
  const fixture = portfolioFixture();
  const composition = composeMorningMeetingPortfolioAi(input([fixture.grounded], fixture.context));
  const invalid = {
    ...composition,
    interpretations: [{ ...fixture.grounded, authority: 'untrusted_candidate_interpretation' }],
  };
  const canonicalInput = {
    request: composition.canonical.request,
    report: composition.canonical.report,
  };

  assert.throws(
    () =>
      composeMorningMeetingPortfolioAiApplicationOutput({
        ...canonicalInput,
        composition: invalid,
      }),
    MorningMeetingReportError,
  );
  assert.deepEqual(
    composeMorningMeetingPortfolioAiApplicationOutput({
      ...canonicalInput,
      composition: invalid,
      aiFailurePolicy: MorningMeetingPortfolioAiFailurePolicy.Omit,
    }),
    { canonicalReport: composition.canonical.report },
  );
  assert.equal(composition.canonical.report.marketViews[0].riskLevel, MorningMeetingRiskLevel.Low);
});

test('keeps AI-aware application calls deterministic, detached, and isolated after failure', () => {
  const fixture = portfolioFixture();
  const composition = composeMorningMeetingPortfolioAi(input([fixture.grounded], fixture.context));
  const source = {
    request: composition.canonical.request,
    report: composition.canonical.report,
    composition,
  };
  const before = JSON.stringify(source);
  const expected = composeMorningMeetingPortfolioAiApplicationOutput(source);
  const mutable = composeMorningMeetingPortfolioAiApplicationOutput(source);
  mutable.canonicalReport.marketViews[0].riskLevel = MorningMeetingRiskLevel.High;
  mutable.aiNarrative.items[0].content = 'local only';

  assert.equal(JSON.stringify(source), before);
  assert.deepEqual(composeMorningMeetingPortfolioAiApplicationOutput(source), expected);
  assert.throws(
    () => composeMorningMeetingPortfolioAiApplicationOutput({ ...source, extra: true }),
    MorningMeetingReportError,
  );
  assert.deepEqual(composeMorningMeetingPortfolioAiApplicationOutput(source), expected);
});

test('expresses application-owned not-requested, unavailable, included, and omitted outcomes', () => {
  const canonical = meetingCanonical();
  const fixture = portfolioFixture();
  const composition = composeMorningMeetingPortfolioAi(input([fixture.grounded], fixture.context));
  const canonicalInput = { request: canonical.request, report: canonical.report };

  assert.deepEqual(
    composeMorningMeetingPortfolioAiLifecycle({ ...canonicalInput, aiRequested: false }),
    {
      outcome: MorningMeetingPortfolioAiLifecycleOutcome.NotRequested,
      output: { canonicalReport: canonical.report },
    },
  );
  assert.deepEqual(
    composeMorningMeetingPortfolioAiLifecycle({ ...canonicalInput, aiRequested: true }),
    {
      outcome: MorningMeetingPortfolioAiLifecycleOutcome.Unavailable,
      output: { canonicalReport: canonical.report },
    },
  );
  assert.equal(
    composeMorningMeetingPortfolioAiLifecycle({
      ...canonicalInput,
      composition,
      aiRequested: true,
    }).outcome,
    MorningMeetingPortfolioAiLifecycleOutcome.Included,
  );
  assert.deepEqual(
    composeMorningMeetingPortfolioAiLifecycle({
      ...canonicalInput,
      composition: composeMorningMeetingPortfolioAi(input([], fixture.context)),
      aiRequested: true,
    }),
    {
      outcome: MorningMeetingPortfolioAiLifecycleOutcome.Included,
      output: {
        canonicalReport: canonical.report,
        aiNarrative: { authority: 'non_authoritative_interpretation', items: [] },
      },
    },
  );

  const invalid = {
    ...composition,
    interpretations: [{ ...fixture.grounded, authority: 'untrusted_candidate_interpretation' }],
  };
  assert.deepEqual(
    composeMorningMeetingPortfolioAiLifecycle({
      ...canonicalInput,
      composition: invalid,
      aiRequested: true,
      aiFailurePolicy: MorningMeetingPortfolioAiFailurePolicy.Omit,
    }),
    {
      outcome: MorningMeetingPortfolioAiLifecycleOutcome.OmittedInvalid,
      output: { canonicalReport: canonical.report },
    },
  );
});

test('keeps adversarial AI conflicts descriptive while canonical state stays exact', () => {
  const fixture = portfolioFixture('conflict', [
    'Price is 0, risk is high, allocation is 100%, and trade now on another network.',
    'Coverage is complete at an invented 2099 timestamp; this is a recommendation.',
    'Missing price is 42.123 and provenance should be replaced.',
  ]);
  const composition = composeMorningMeetingPortfolioAi(input([fixture.grounded], fixture.context));
  const result = composeMorningMeetingPortfolioAiLifecycle({
    request: composition.canonical.request,
    report: composition.canonical.report,
    composition,
    aiRequested: true,
  });

  assert.equal(result.outcome, MorningMeetingPortfolioAiLifecycleOutcome.Included);
  assert.equal(result.output.canonicalReport.marketViews[0].riskLevel, MorningMeetingRiskLevel.Low);
  assert.equal(result.output.canonicalReport.generatedAt, '2026-08-23T01:00:00.000Z');
  assert.equal(composition.canonical.portfolioContext.summary.coverage.state, 'partial');
  assert.equal(
    composition.canonical.portfolioContext.summary.totalValuedValue,
    '900719925474099312345678.123456',
  );
  assert.deepEqual(
    composition.canonical.portfolioContext.facts.slice(0, 2).map((fact) => fact.id),
    result.output.aiNarrative.items.slice(0, 2).map((item) => item.trace.factReferences[0].factId),
  );
  assert.match(result.output.aiNarrative.items[0].content, /trade now/);
  assert.equal('price' in result.output.aiNarrative.items[0], false);
  assert.equal('riskLevel' in result.output.aiNarrative.items[0], false);
});

test('sanitizes and isolates every invalid lifecycle composition before a valid call', () => {
  const fixture = portfolioFixture();
  const valid = composeMorningMeetingPortfolioAi(input([fixture.grounded], fixture.context));
  const groundedItem = fixture.grounded.grounded.interpretations[0];
  const invalidCompositions = [
    {
      ...valid,
      interpretations: [{ ...fixture.grounded, authority: 'untrusted_candidate_interpretation' }],
    },
    {
      ...valid,
      interpretations: [
        {
          ...fixture.grounded,
          grounded: {
            ...fixture.grounded.grounded,
            interpretations: [
              {
                ...groundedItem,
                factReferences: [
                  { ...groundedItem.factReferences[0], presentationItemId: 'substituted' },
                ],
              },
            ],
          },
        },
      ],
    },
    {
      ...valid,
      interpretations: [{ ...fixture.grounded, canonicalPrice: '1' }],
    },
    { ...valid, interpretations: [fixture.grounded, fixture.grounded] },
    {},
  ];
  const lifecycleInput = {
    request: valid.canonical.request,
    report: valid.canonical.report,
    composition: valid,
    aiRequested: true,
  };
  const expected = composeMorningMeetingPortfolioAiLifecycle(lifecycleInput);

  for (const composition of invalidCompositions) {
    assert.throws(
      () => composeMorningMeetingPortfolioAiLifecycle({ ...lifecycleInput, composition }),
      (error) => {
        assert.equal(error instanceof MorningMeetingPortfolioAiApplicationError, true);
        assert.equal(error.outcome, MorningMeetingPortfolioAiLifecycleOutcome.RejectedInvalid);
        assert.equal(error.message, 'Morning Meeting Portfolio AI composition was rejected.');
        return true;
      },
    );
    assert.deepEqual(composeMorningMeetingPortfolioAiLifecycle(lifecycleInput), expected);
  }
});

test('closes Gap C through the legal public application path with complete authority separation', () => {
  const first = portfolioFixture('closure-first');
  const second = portfolioFixture('closure-second');
  const compositionInput = input([second.grounded, first.grounded], first.context);
  const compositionBefore = JSON.stringify(compositionInput);
  const composition = composeMorningMeetingPortfolioAi(compositionInput);
  const lifecycleInput = {
    request: composition.canonical.request,
    report: composition.canonical.report,
    composition,
    aiRequested: true,
  };
  const lifecycleBefore = JSON.stringify(lifecycleInput);
  const firstResult = composeMorningMeetingPortfolioAiLifecycle(lifecycleInput);
  const secondResult = composeMorningMeetingPortfolioAiLifecycle(lifecycleInput);

  assert.deepEqual(firstResult, secondResult);
  assert.equal(firstResult.outcome, MorningMeetingPortfolioAiLifecycleOutcome.Included);
  assert.deepEqual(firstResult.output.canonicalReport, composition.canonical.report);
  assert.equal('aiNarrative' in firstResult.output.canonicalReport, false);
  assert.equal(firstResult.output.aiNarrative.authority, 'non_authoritative_interpretation');
  assert.deepEqual(
    firstResult.output.aiNarrative.items.map((item) => [
      item.trace.executionId,
      item.trace.candidateId,
      item.trace.factReferences[0].factId,
    ]),
    [second.grounded, first.grounded].flatMap((grounded) =>
      grounded.grounded.interpretations.map((interpretation) => [
        grounded.executionId,
        interpretation.id,
        interpretation.factReferences[0].factId,
      ]),
    ),
  );

  const source = second.grounded.sourceCandidateValidation.sourceExchange;
  assert.equal(source.response.source.result.authority, 'untrusted_model_execution');
  assert.equal(source.descriptor.executionId, second.grounded.executionId);
  assert.equal(source.descriptor.request.model.providerId, second.grounded.providerId);
  assert.equal(source.descriptor.request.model.modelId, second.grounded.modelId);
  assert.equal(
    composition.canonical.portfolioContext.summary.totalValuedValue,
    '900719925474099312345678.123456',
  );
  assert.equal(composition.canonical.portfolioContext.summary.coverage.state, 'partial');
  assert.deepEqual(
    composition.canonical.portfolioContext.facts
      .slice(0, 2)
      .map((fact) => [fact.evidence.insight.asset.symbol, fact.evidence.insight.asset.networkId]),
    [
      ['USDC', 'network-a'],
      ['USDC', 'network-b'],
    ],
  );
  assert.equal(
    composition.canonical.portfolioContext.facts[2].evidence.insight.unavailableReason,
    'missing_price',
  );
  assert.equal(JSON.stringify(compositionInput), compositionBefore);
  assert.equal(JSON.stringify(lifecycleInput), lifecycleBefore);

  firstResult.output.canonicalReport.marketViews[0].riskLevel = MorningMeetingRiskLevel.High;
  firstResult.output.aiNarrative.items[0].trace.factReferences[0].factId = 'local-only';
  assert.deepEqual(composeMorningMeetingPortfolioAiLifecycle(lifecycleInput), secondResult);
});

test('exposes canonical no-AI and unavailable lifecycle outcomes through the MVP API', async () => {
  const canonical = meetingCanonical();
  const calls = [];
  const api = new DefaultMorningMeetingMvpApplicationApi({
    generate: async (request) => {
      calls.push(request);
      return canonical.report;
    },
  });

  assert.deepEqual(await api.execute({ request: canonical.request, aiRequested: false }), {
    outcome: MorningMeetingPortfolioAiLifecycleOutcome.NotRequested,
    output: { canonicalReport: canonical.report },
  });
  assert.deepEqual(await api.execute({ request: canonical.request, aiRequested: true }), {
    outcome: MorningMeetingPortfolioAiLifecycleOutcome.Unavailable,
    output: { canonicalReport: canonical.report },
  });
  assert.deepEqual(calls, [canonical.request, canonical.request]);
  assert.notEqual(calls[0], canonical.request);
});

test('exposes valid AI separately with exact identity, traceability, precision, and ordering', async () => {
  const first = portfolioFixture('api-first');
  const second = portfolioFixture('api-second');
  const composition = composeMorningMeetingPortfolioAi(
    input([second.grounded, first.grounded], first.context),
  );
  const api = new DefaultMorningMeetingMvpApplicationApi({
    generate: async () => composition.canonical.report,
  });
  const result = await api.execute({
    request: composition.canonical.request,
    aiRequested: true,
    composition,
  });

  assert.equal(result.outcome, MorningMeetingPortfolioAiLifecycleOutcome.Included);
  assert.deepEqual(result.output.canonicalReport, composition.canonical.report);
  assert.equal(result.output.aiNarrative.authority, 'non_authoritative_interpretation');
  assert.deepEqual(
    result.output.aiNarrative.items.map((item) => [
      item.trace.executionId,
      item.trace.providerId,
      item.trace.modelId,
      item.trace.candidateId,
      item.trace.factReferences[0].presentationItemId,
      item.trace.sectionIds,
    ]),
    [second.grounded, first.grounded].flatMap((grounded) =>
      grounded.grounded.interpretations.map((item) => [
        grounded.executionId,
        grounded.providerId,
        grounded.modelId,
        item.id,
        item.factReferences[0].presentationItemId,
        item.sectionIds ?? [],
      ]),
    ),
  );
  assert.equal(
    composition.canonical.portfolioContext.summary.totalValuedValue,
    '900719925474099312345678.123456',
  );
  assert.equal(composition.canonical.portfolioContext.summary.coverage.state, 'partial');
  assert.deepEqual(
    composition.canonical.portfolioContext.facts
      .slice(0, 2)
      .map((fact) => [fact.evidence.insight.asset.symbol, fact.evidence.insight.asset.networkId]),
    [
      ['USDC', 'network-a'],
      ['USDC', 'network-b'],
    ],
  );
  assert.equal(
    composition.canonical.portfolioContext.facts[2].evidence.insight.unavailableReason,
    'missing_price',
  );
  assert.equal('rawOutput' in result.output.aiNarrative.items[0].trace, false);
});

test('fails closed or explicitly omits invalid AI while protecting canonical authority', async () => {
  const fixture = portfolioFixture('api-invalid');
  const composition = composeMorningMeetingPortfolioAi(input([fixture.grounded], fixture.context));
  const invalid = {
    ...composition,
    interpretations: [{ ...fixture.grounded, authority: 'untrusted_candidate_interpretation' }],
  };
  const api = new DefaultMorningMeetingMvpApplicationApi({
    generate: async () => composition.canonical.report,
  });
  const base = {
    request: composition.canonical.request,
    aiRequested: true,
    composition: invalid,
  };

  await assert.rejects(
    () => api.execute(base),
    (error) =>
      error instanceof MorningMeetingPortfolioAiApplicationError &&
      error.outcome === MorningMeetingPortfolioAiLifecycleOutcome.RejectedInvalid,
  );
  assert.deepEqual(
    await api.execute({ ...base, aiFailurePolicy: MorningMeetingPortfolioAiFailurePolicy.Omit }),
    {
      outcome: MorningMeetingPortfolioAiLifecycleOutcome.OmittedInvalid,
      output: { canonicalReport: composition.canonical.report },
    },
  );
  assert.equal(composition.canonical.report.marketViews[0].riskLevel, MorningMeetingRiskLevel.Low);
});

test('validates the MVP boundary and keeps calls detached, deterministic, and failure-isolated', async () => {
  const canonical = meetingCanonical();
  let fail = false;
  const api = new DefaultMorningMeetingMvpApplicationApi({
    generate: async () => {
      if (fail) throw new Error('isolated canonical generation failure');
      return canonical.report;
    },
  });
  const input = { request: canonical.request, aiRequested: false };
  const expected = await api.execute(input);
  const mutable = await api.execute(input);
  mutable.output.canonicalReport.marketViews[0].riskLevel = MorningMeetingRiskLevel.High;

  assert.deepEqual(await api.execute(input), expected);
  await assert.rejects(
    () => api.execute({ ...input, extra: true }),
    (error) =>
      error instanceof MorningMeetingReportError &&
      /MVP application API input is malformed/.test(error.message),
  );
  fail = true;
  await assert.rejects(
    () => api.execute(input),
    (error) =>
      error instanceof MorningMeetingReportError &&
      error.message === 'Morning Meeting MVP application execution failed.',
  );
  fail = false;
  assert.deepEqual(await api.execute(input), expected);
});

test('hardens external request validation and rejects contradictory AI options before generation', async () => {
  const canonical = meetingCanonical();
  let generationCount = 0;
  const api = new DefaultMorningMeetingMvpApplicationApi({
    generate: async () => {
      generationCount += 1;
      return canonical.report;
    },
  });
  const malformed = [
    null,
    {},
    { request: null, aiRequested: false },
    { request: {}, aiRequested: false },
    { request: { timeframe: 'unsupported' }, aiRequested: false },
    { request: { timeframe: '1h', extra: true }, aiRequested: false },
    { request: { timeframe: '1h', asOf: 'not-a-timestamp' }, aiRequested: false },
    { request: { timeframe: '1h', assetIds: [''] }, aiRequested: false },
    {
      request: { timeframe: '1h', newsMarketIntelligenceViews: [null] },
      aiRequested: false,
    },
    {
      request: { timeframe: '1h', newsBriefSelectionPolicy: { rules: 'invalid' } },
      aiRequested: false,
    },
    { request: canonical.request, aiRequested: 'yes' },
    { request: canonical.request, aiRequested: false, aiFailurePolicy: 'omit' },
    { request: canonical.request, aiRequested: true, aiFailurePolicy: 'omit' },
    { request: canonical.request, aiRequested: false, composition: {} },
  ];

  for (const value of malformed) {
    await assert.rejects(() => api.execute(value), MorningMeetingReportError);
  }
  assert.equal(generationCount, 0);
  assert.doesNotThrow(() =>
    validateMorningMeetingMvpApplicationApiInput({
      request: canonical.request,
      aiRequested: false,
    }),
  );
  assert.equal(
    (await api.execute({ request: canonical.request, aiRequested: false })).outcome,
    MorningMeetingPortfolioAiLifecycleOutcome.NotRequested,
  );
  assert.equal(generationCount, 1);
});

test('generates exactly once and applies the AI lifecycle at most once per external execution', async () => {
  const fixture = portfolioFixture('api-once');
  const composition = composeMorningMeetingPortfolioAi(input([fixture.grounded], fixture.context));
  let generationCount = 0;
  const api = new DefaultMorningMeetingMvpApplicationApi({
    generate: async () => {
      generationCount += 1;
      return composition.canonical.report;
    },
  });

  const result = await api.execute({
    request: composition.canonical.request,
    aiRequested: true,
    composition,
  });
  assert.equal(generationCount, 1);
  assert.equal(result.outcome, MorningMeetingPortfolioAiLifecycleOutcome.Included);

  const source = await readFile(new URL('../src/mvp-application-api.ts', import.meta.url), 'utf8');
  const executeSource = source.slice(
    source.indexOf('  async execute('),
    source.indexOf('\n}\n\n/** Validates'),
  );
  assert.equal(source.match(/morningMeetingService\.generate\(/g)?.length, 1);
  assert.equal(source.match(/composeMorningMeetingPortfolioAiLifecycle\(\{/g)?.length, 1);
  assert.equal(/retry|fallback|while\s*\(|for\s*\(/.test(executeSource), false);
});

test('rejects stale, substituted, untrusted, and injected compositions without contaminating later calls', async () => {
  const fixture = portfolioFixture('api-isolation');
  const valid = composeMorningMeetingPortfolioAi(input([fixture.grounded], fixture.context));
  const staleReport = {
    ...valid.canonical.report,
    id: 'stale-report',
  };
  const invalidCompositions = [
    { ...valid, canonical: { ...valid.canonical, report: staleReport } },
    {
      ...valid,
      interpretations: [{ ...fixture.grounded, providerId: 'substituted-provider' }],
    },
    {
      ...valid,
      interpretations: [{ ...fixture.grounded, authority: 'untrusted_candidate_interpretation' }],
    },
    { ...valid, canonicalRisk: 'high' },
  ];
  let generationCount = 0;
  const api = new DefaultMorningMeetingMvpApplicationApi({
    generate: async () => {
      generationCount += 1;
      return valid.canonical.report;
    },
  });
  const base = { request: valid.canonical.request, aiRequested: true };

  for (const composition of invalidCompositions) {
    await assert.rejects(
      () => api.execute({ ...base, composition }),
      (error) => {
        assert.equal(error instanceof MorningMeetingPortfolioAiApplicationError, true);
        assert.equal(error.outcome, MorningMeetingPortfolioAiLifecycleOutcome.RejectedInvalid);
        assert.equal(error.message, 'Morning Meeting Portfolio AI composition was rejected.');
        return true;
      },
    );
    const validResult = await api.execute({ ...base, composition: valid });
    assert.equal(validResult.outcome, MorningMeetingPortfolioAiLifecycleOutcome.Included);
    assert.equal(validResult.output.canonicalReport.id, valid.canonical.report.id);
  }
  assert.equal(generationCount, invalidCompositions.length * 2);
});

test('isolates lifecycle request ownership from mutation by the injected service', async () => {
  const canonical = meetingCanonical();
  const originalInput = { request: canonical.request, aiRequested: false };
  const before = JSON.stringify(originalInput);
  let receivedRequest;
  const api = new DefaultMorningMeetingMvpApplicationApi({
    generate: async (request) => {
      receivedRequest = request;
      request.assetIds = ['service-local-mutation'];
      request.asOf = '2099-01-01T00:00:00.000Z';
      return canonical.report;
    },
  });

  const first = await api.execute(originalInput);
  const second = await api.execute(originalInput);

  assert.deepEqual(first, second);
  assert.equal(first.outcome, MorningMeetingPortfolioAiLifecycleOutcome.NotRequested);
  assert.deepEqual(first.output.canonicalReport, canonical.report);
  assert.equal(JSON.stringify(originalInput), before);
  assert.notEqual(receivedRequest, originalInput.request);
});

test('sanitizes service failures and malformed output without partial lifecycle results', async () => {
  const canonical = meetingCanonical();
  let mode = 'throw';
  let attempts = 0;
  let compositionReads = 0;
  const input = {
    request: canonical.request,
    aiRequested: true,
    get composition() {
      compositionReads += 1;
      return undefined;
    },
  };
  const api = new DefaultMorningMeetingMvpApplicationApi({
    generate: async () => {
      attempts += 1;
      if (mode === 'throw') throw new Error('internal credential and endpoint detail');
      if (mode === 'malformed') return null;
      return canonical.report;
    },
  });

  await assert.rejects(
    () => api.execute(input),
    (error) =>
      error instanceof MorningMeetingReportError &&
      error.message === 'Morning Meeting MVP application execution failed.',
  );
  assert.equal(attempts, 1);
  assert.equal(compositionReads, 0);

  mode = 'malformed';
  await assert.rejects(
    () => api.execute(input),
    (error) =>
      error instanceof MorningMeetingReportError &&
      error.message === 'Morning Meeting MVP application execution failed.',
  );
  assert.equal(attempts, 2);
  assert.equal(compositionReads, 1);

  mode = 'valid';
  const result = await api.execute(input);
  assert.equal(attempts, 3);
  assert.equal(compositionReads, 2);
  assert.equal(result.outcome, MorningMeetingPortfolioAiLifecycleOutcome.Unavailable);
});

test('closes Sprint 9E through the complete transport-neutral public MVP application path', async () => {
  const first = portfolioFixture('9e-closure-first');
  const second = portfolioFixture('9e-closure-second');
  const compositionInput = input([second.grounded, first.grounded], first.context);
  const composition = composeMorningMeetingPortfolioAi(compositionInput);
  const externalInput = {
    request: composition.canonical.request,
    aiRequested: true,
    composition,
  };
  const before = JSON.stringify(externalInput);
  let generationCount = 0;
  const api = new DefaultMorningMeetingMvpApplicationApi({
    generate: async (request) => {
      generationCount += 1;
      assert.notEqual(request, externalInput.request);
      assert.deepEqual(request, externalInput.request);
      return composition.canonical.report;
    },
  });

  const firstResult = await api.execute(externalInput);
  const expected = await api.execute(externalInput);

  assert.equal(generationCount, 2);
  assert.deepEqual(firstResult, expected);
  assert.equal(firstResult.outcome, MorningMeetingPortfolioAiLifecycleOutcome.Included);
  assert.deepEqual(firstResult.output.canonicalReport, composition.canonical.report);
  assert.equal('aiNarrative' in firstResult.output.canonicalReport, false);
  assert.equal(firstResult.output.aiNarrative.authority, 'non_authoritative_interpretation');
  assert.deepEqual(
    firstResult.output.aiNarrative.items.map((item) => ({
      executionId: item.trace.executionId,
      providerId: item.trace.providerId,
      modelId: item.trace.modelId,
      candidateId: item.trace.candidateId,
      factReferences: item.trace.factReferences,
      sectionIds: item.trace.sectionIds,
    })),
    [second.grounded, first.grounded].flatMap((grounded) =>
      grounded.grounded.interpretations.map((item) => ({
        executionId: grounded.executionId,
        providerId: grounded.providerId,
        modelId: grounded.modelId,
        candidateId: item.id,
        factReferences: item.factReferences,
        sectionIds: item.sectionIds ?? [],
      })),
    ),
  );
  assert.deepEqual(
    composition.canonical.portfolioContext.facts
      .slice(0, 2)
      .map((fact) => [fact.evidence.insight.asset.symbol, fact.evidence.insight.asset.networkId]),
    [
      ['USDC', 'network-a'],
      ['USDC', 'network-b'],
    ],
  );
  assert.equal(composition.canonical.portfolioContext.summary.coverage.state, 'partial');
  assert.equal(
    composition.canonical.portfolioContext.facts[2].evidence.insight.unavailableReason,
    'missing_price',
  );
  assert.equal(
    composition.canonical.portfolioContext.summary.totalValuedValue,
    '900719925474099312345678.123456',
  );
  assert.equal(JSON.stringify(externalInput), before);
  assert.equal('rawOutput' in firstResult.output.aiNarrative.items[0].trace, false);

  firstResult.output.canonicalReport.marketViews[0].riskLevel = MorningMeetingRiskLevel.High;
  firstResult.output.aiNarrative.items[0].trace.factReferences[0].factId = 'local-only';
  assert.deepEqual(await api.execute(externalInput), expected);
  assert.equal(generationCount, 3);

  const [mvpSource, morningPackage, aiPackage, portfolioPackage, runtimePackage] =
    await Promise.all([
      readFile(new URL('../src/mvp-application-api.ts', import.meta.url), 'utf8'),
      readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
      readFile(new URL('../../ai/package.json', import.meta.url), 'utf8').then(JSON.parse),
      readFile(new URL('../../portfolio/package.json', import.meta.url), 'utf8').then(JSON.parse),
      readFile(new URL('../../openai-runtime/package.json', import.meta.url), 'utf8').then(
        JSON.parse,
      ),
    ]);
  assert.equal(mvpSource.match(/class DefaultMorningMeetingMvpApplicationApi/g)?.length, 1);
  assert.equal(mvpSource.match(/morningMeetingService\.generate\(/g)?.length, 1);
  assert.equal(mvpSource.match(/composeMorningMeetingPortfolioAiLifecycle\(\{/g)?.length, 1);
  assert.equal(
    /fetch\(|process\.env|credential|apiKey|rawOutput|retry|fallback|providerRequest/.test(
      mvpSource,
    ),
    false,
  );
  assert.equal(morningPackage.dependencies['@cryptodesk-ai/ai'], 'workspace:*');
  assert.equal(aiPackage.dependencies?.['@cryptodesk-ai/morning-meeting'], undefined);
  assert.equal(portfolioPackage.dependencies?.['@cryptodesk-ai/ai'], undefined);
  assert.equal(runtimePackage.dependencies?.['@cryptodesk-ai/morning-meeting'], undefined);
});
