import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  AiBoundaryValidationError,
  AiExecutionStatus,
  PortfolioAiRawExecutionAuthority,
  PortfolioAiTask,
  assemblePortfolioAiCandidateInterpretation,
  buildPortfolioAiContext,
  createPortfolioAiMessagePlan,
  createPortfolioAiModelInput,
  createPortfolioAiPromptDocument,
  createPortfolioAiProviderExchange,
  createPortfolioAiProviderRequest,
  createPortfolioAiProviderResponse,
  groundPortfolioAiCandidateInterpretation,
  groundPortfolioAiParsedCandidates,
  mapPortfolioAiProviderRequest,
  normalizePortfolioAiProviderResponse,
  parsePortfolioAiStructuredOutput,
  validatePortfolioAiCandidateInterpretationResult,
  validatePortfolioAiParsedCandidates,
} from '../dist/index.js';

const executionId = 'gap-b-closure-execution';
const model = { providerId: 'gap-b-provider', modelId: 'gap-b-model' };

function sectionId(section) {
  return JSON.stringify(['gap-b-closure-portfolio', section]);
}

function item(id, category, targetIdentity, insight) {
  return {
    id,
    category,
    priority: 'high',
    priorityReasons: ['canonical_identity'],
    targetIdentity,
    evidence: {
      insight: { portfolioId: 'gap-b-closure-portfolio', ...insight },
      valuationPositions: [],
    },
  };
}

function descriptor() {
  const items = [
    item('same-symbol-network-a', 'concentration', 'asset-a', {
      asset: { id: 'asset-a', symbol: 'USDC', networkId: 'network-a', decimals: 6 },
      measuredValue: '900719925474099312345678.123456',
      measuredPercentage: '66.6667',
      coverageState: 'partial',
    }),
    item('same-symbol-network-b', 'concentration', 'asset-b', {
      asset: { id: 'asset-b', symbol: 'USDC', networkId: 'network-b', decimals: 6 },
      measuredPercentage: '33.3333',
      coverageState: 'partial',
    }),
    item('missing-price', 'data_quality', 'missing_price', {
      unavailableReason: 'missing_price',
      coverageState: 'partial',
    }),
    item('missing-decimals', 'data_quality', 'missing_decimals', {
      unavailableReason: 'missing_decimals',
      coverageState: 'partial',
    }),
    item('missing-provenance', 'data_quality', 'missing_network_provenance', {
      unavailableReason: 'missing_network_provenance',
      coverageState: 'partial',
    }),
  ];
  const context = buildPortfolioAiContext({
    analysisId: 'gap-b-closure-analysis',
    task: PortfolioAiTask.Interpret,
    payload: {
      schemaVersion: '1',
      portfolioId: 'gap-b-closure-portfolio',
      capturedAt: '2026-08-22T00:00:00.000Z',
      asOf: '2026-08-22T00:00:00.000Z',
      currency: 'USD',
      totalValuedValue: '900719925474099312345678.123456',
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
          itemIds: ['same-symbol-network-a', 'same-symbol-network-b'],
        },
        {
          id: sectionId('data_quality'),
          section: 'data_quality',
          itemIds: ['missing-price', 'missing-decimals', 'missing-provenance'],
        },
        {
          id: sectionId('prioritized_insights'),
          section: 'prioritized_insights',
          itemIds: items.map((entry) => entry.id),
        },
      ],
    },
  });
  const input = createPortfolioAiModelInput({
    task: PortfolioAiTask.Interpret,
    context,
    factIds: context.facts.map((fact) => fact.id),
    sectionIds: [sectionId('concentration'), sectionId('data_quality')],
  });
  const document = createPortfolioAiPromptDocument(createPortfolioAiMessagePlan(input));
  return mapPortfolioAiProviderRequest(
    createPortfolioAiProviderRequest({ executionId, model, promptDocument: document }),
  );
}

function factReference(fact) {
  return {
    factId: fact.id,
    presentationItemId: fact.presentationItemId,
    sectionIds: fact.grounding.map((reference) => reference.sectionIds[0]),
  };
}

function structuredOutput(sourceDescriptor) {
  const context = sourceDescriptor.request.promptDocument.plan.input.context;
  const networkB = context.facts.find(
    (fact) => fact.presentationItemId === 'same-symbol-network-b',
  );
  const networkA = context.facts.find(
    (fact) => fact.presentationItemId === 'same-symbol-network-a',
  );
  const missingPrice = context.facts.find((fact) => fact.presentationItemId === 'missing-price');
  return {
    executionId,
    providerId: model.providerId,
    modelId: model.modelId,
    candidates: [
      {
        id: 'candidate-network-b-first',
        kind: 'descriptive',
        content:
          '## Recommendation-like prose: BUY USDC? {"price":"900719925474099312345678.123456","assetId":"identifier-looking"}',
        factReferences: [factReference(networkB)],
      },
      {
        id: 'candidate-network-a-second',
        kind: 'descriptive',
        content: 'Symbol USDC and trading-like SELL text remain descriptive only.',
        factReferences: [factReference(networkA)],
        sectionIds: [...factReference(networkA).sectionIds],
      },
      {
        id: 'candidate-missing-price-third',
        kind: 'descriptive',
        content: 'Missing-price text does not imply zero or availability.',
        factReferences: [factReference(missingPrice)],
      },
      {
        id: 'candidate-section-fourth',
        kind: 'descriptive',
        content: 'Section-level descriptive text.',
        sectionIds: [sectionId('data_quality')],
      },
    ],
  };
}

function exchange(output) {
  const sourceDescriptor = descriptor();
  const raw = {
    executionId,
    status: AiExecutionStatus.Completed,
    authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
    output,
    model,
  };
  const response = createPortfolioAiProviderResponse(sourceDescriptor, raw);
  const normalized = normalizePortfolioAiProviderResponse(sourceDescriptor, response);
  return createPortfolioAiProviderExchange(sourceDescriptor, normalized);
}

function validFlow() {
  const sourceDescriptor = descriptor();
  const rawOutput = JSON.stringify(structuredOutput(sourceDescriptor));
  const sourceExchange = exchange(rawOutput);
  const parsed = parsePortfolioAiStructuredOutput(sourceExchange);
  const candidateValidation = validatePortfolioAiParsedCandidates(parsed);
  const final = groundPortfolioAiParsedCandidates({ parsed, candidateValidation });
  return { rawOutput, sourceExchange, parsed, candidateValidation, final };
}

test('closes the complete legal Gap B success path with exact trust, ordering, and traceability', () => {
  const flow = validFlow();
  const context =
    flow.final.sourceCandidateValidation.sourceExchange.descriptor.request.promptDocument.plan.input
      .context;

  assert.equal(flow.sourceExchange.authority, 'untrusted_model_execution');
  assert.equal(flow.parsed.authority, 'untrusted_candidate_interpretation');
  assert.equal(flow.candidateValidation.authority, 'untrusted_candidate_interpretation');
  assert.equal(flow.final.authority, 'non_authoritative_interpretation');
  assert.equal(flow.final.grounded.authority, 'non_authoritative_interpretation');
  assert.equal(flow.final.executionId, executionId);
  assert.equal(flow.final.providerId, model.providerId);
  assert.equal(flow.final.modelId, model.modelId);
  assert.deepEqual(flow.final.sourceParsedOutput, flow.parsed);
  assert.deepEqual(flow.final.sourceCandidateValidation, flow.candidateValidation);
  assert.deepEqual(flow.final.sourceParsedOutput.sourceExchange, flow.sourceExchange);
  assert.equal(flow.sourceExchange.response.output, flow.rawOutput);
  assert.deepEqual(
    flow.final.grounded.interpretations.map((entry) => entry.id),
    structuredOutput(descriptor()).candidates.map((entry) => entry.id),
  );
  assert.equal(context.summary.coverage.state, 'partial');
  assert.equal(context.summary.totalValuedValue, '900719925474099312345678.123456');
  assert.equal(
    context.facts.find((fact) => fact.presentationItemId === 'missing-price').evidence.insight
      .unavailableReason,
    'missing_price',
  );
  assert.equal('portfolioId' in flow.final.grounded, false);
  assert.equal('price' in flow.final.grounded, false);
  assert.equal('recommendation' in flow.final.grounded, false);
});

test('keeps adversarial descriptive content opaque and same-symbol networks distinct', () => {
  const flow = validFlow();
  const context =
    flow.final.sourceCandidateValidation.sourceExchange.descriptor.request.promptDocument.plan.input
      .context;
  const firstTwo = flow.final.grounded.interpretations.slice(0, 2);
  const facts = firstTwo.map((interpretation) =>
    context.facts.find((fact) => fact.id === interpretation.factReferences[0].factId),
  );

  assert.match(firstTwo[0].content, /Recommendation-like prose/u);
  assert.match(firstTwo[0].content, /900719925474099312345678\.123456/u);
  assert.deepEqual(
    facts.map((fact) => [
      fact.evidence.insight.asset.symbol,
      fact.evidence.insight.asset.networkId,
    ]),
    [
      ['USDC', 'network-b'],
      ['USDC', 'network-a'],
    ],
  );
  assert.equal(firstTwo[0].factReferences[0].presentationItemId, 'same-symbol-network-b');
  assert.equal(firstTwo[1].factReferences[0].presentationItemId, 'same-symbol-network-a');
});

test('fails closed at parser, candidate, and grounding stages without contaminating a valid flow', () => {
  const expected = validFlow().final;
  const sourceDescriptor = descriptor();
  const validDocument = structuredOutput(sourceDescriptor);
  const parserFailures = [
    '{',
    JSON.stringify({ ...validDocument, portfolioId: 'canonical-injection' }),
    JSON.stringify({ ...validDocument, extra: true }),
  ];
  for (const output of parserFailures) {
    assert.throws(
      () => parsePortfolioAiStructuredOutput(exchange(output)),
      AiBoundaryValidationError,
    );
    assert.deepEqual(validFlow().final, expected);
  }

  const parsed = parsePortfolioAiStructuredOutput(exchange(JSON.stringify(validDocument)));
  const unknownReference = {
    ...parsed,
    candidates: [
      {
        ...parsed.candidates[0],
        factReferences: [{ ...parsed.candidates[0].factReferences[0], factId: 'unknown-fact' }],
      },
    ],
  };
  assert.throws(
    () => validatePortfolioAiParsedCandidates(unknownReference),
    AiBoundaryValidationError,
  );
  assert.deepEqual(validFlow().final, expected);

  const candidateValidation = validatePortfolioAiParsedCandidates(parsed);
  assert.throws(
    () =>
      groundPortfolioAiParsedCandidates({
        parsed,
        candidateValidation: { ...candidateValidation, authority: 'grounded' },
      }),
    AiBoundaryValidationError,
  );
  assert.throws(() => groundPortfolioAiParsedCandidates(parsed), AiBoundaryValidationError);
  assert.deepEqual(validFlow().final, expected);
});

test('keeps the complete Gap B path deterministic and detached from every source stage', () => {
  const flow = validFlow();
  const before = JSON.stringify(flow);
  flow.final.grounded.interpretations[0].factReferences[0].sectionIds.push('local-only');
  flow.final.sourceParsedOutput.candidates[0].content = 'local-only';
  flow.final.sourceCandidateValidation.sourceExchange.response.source.result.output = 'local-only';

  const repeated = validFlow();
  assert.equal(repeated.sourceExchange.response.output, repeated.rawOutput);
  assert.deepEqual(repeated.final, validFlow().final);
  assert.notEqual(JSON.stringify(flow), before);
  assert.equal(JSON.stringify(repeated).includes('local-only'), false);
});

test('passes the Gap B architecture, dependency, and backward-compatibility closure audit', async () => {
  const aiPackage = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const portfolioPackage = JSON.parse(
    await readFile(new URL('../../portfolio/package.json', import.meta.url), 'utf8'),
  );
  const morningMeetingPackage = JSON.parse(
    await readFile(new URL('../../morning-meeting/package.json', import.meta.url), 'utf8'),
  );
  assert.equal(aiPackage.dependencies['@cryptodesk-ai/portfolio'], 'workspace:*');
  assert.equal(portfolioPackage.dependencies?.['@cryptodesk-ai/ai'], undefined);
  assert.equal(morningMeetingPackage.dependencies?.['@cryptodesk-ai/ai'], undefined);

  for (const api of [
    parsePortfolioAiStructuredOutput,
    validatePortfolioAiParsedCandidates,
    groundPortfolioAiParsedCandidates,
    assemblePortfolioAiCandidateInterpretation,
    validatePortfolioAiCandidateInterpretationResult,
    groundPortfolioAiCandidateInterpretation,
  ]) {
    assert.equal(typeof api, 'function');
  }

  const parserSource = await readFile(
    new URL('../src/portfolio-structured-output-parser.ts', import.meta.url),
    'utf8',
  );
  const candidateSource = await readFile(
    new URL('../src/portfolio-parsed-candidate-integration.ts', import.meta.url),
    'utf8',
  );
  const groundingSource = await readFile(
    new URL('../src/portfolio-parsed-candidate-grounding.ts', import.meta.url),
    'utf8',
  );
  assert.match(parserSource, /validatePortfolioAiProviderExchange/u);
  assert.match(candidateSource, /validatePortfolioAiParsedStructuredOutput/u);
  assert.match(groundingSource, /validatePortfolioAiParsedCandidateValidationResult/u);
  assert.match(groundingSource, /groundPortfolioAiCandidateInterpretation/u);

  for (const source of [parserSource, candidateSource, groundingSource]) {
    for (const forbidden of [
      /from\s+['"]openai['"]/u,
      /@cryptodesk-ai\/openai-runtime/u,
      /@cryptodesk-ai\/morning-meeting/u,
      /\bfetch\s*\(/u,
      /\bprocess\.env\b/u,
      /\bDate\.now\s*\(/u,
      /\bMath\.random\s*\(/u,
      /\brandomUUID\s*\(/u,
      /\.sort\s*\(/u,
    ]) {
      assert.doesNotMatch(source, forbidden);
    }
  }
});
