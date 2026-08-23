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
  MorningMeetingBias,
  MorningMeetingReportError,
  MorningMeetingReportValidator,
  MorningMeetingRiskLevel,
  composeMorningMeetingPortfolioAi,
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

function portfolioFixture(suffix = 'one') {
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
        content: 'Non-authoritative description for exact network A evidence.',
        factReferences: [references[0]],
      },
      {
        id: `candidate-${suffix}-network-b`,
        kind: 'descriptive',
        content: 'Non-authoritative description for exact network B evidence.',
        factReferences: [references[1]],
      },
      {
        id: `candidate-${suffix}-missing`,
        kind: 'descriptive',
        content: 'Missing data remains missing; prose does not fill it.',
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
