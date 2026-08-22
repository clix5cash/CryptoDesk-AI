import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AiBoundaryValidationError,
  AiExecutionStatus,
  PortfolioAiCandidateInterpretationAuthority,
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
  validatePortfolioAiParsedCandidateValidationResult,
  validatePortfolioAiParsedCandidateGroundingResult,
  validatePortfolioAiParsedCandidates,
  validatePortfolioAiParsedStructuredOutput,
} from '../dist/index.js';

const executionId = 'structured-output-execution';
const model = { providerId: 'structured-provider', modelId: 'structured-model' };

function sectionId(section) {
  return JSON.stringify(['structured-output-portfolio', section]);
}

function descriptor() {
  const items = [
    {
      id: 'item-a',
      category: 'concentration',
      priority: 'high',
      priorityReasons: ['canonical_identity'],
      targetIdentity: 'asset-a',
      evidence: {
        insight: {
          portfolioId: 'structured-output-portfolio',
          asset: { id: 'asset-a', symbol: 'AAA', networkId: 'network-a', decimals: 6 },
          measuredValue: '900719925474099312345678.123456',
          measuredPercentage: '66.6667',
          coverageState: 'partial',
        },
        valuationPositions: [],
      },
    },
    {
      id: 'item-b',
      category: 'concentration',
      priority: 'normal',
      priorityReasons: ['canonical_identity'],
      targetIdentity: 'asset-b',
      evidence: {
        insight: {
          portfolioId: 'structured-output-portfolio',
          asset: { id: 'asset-b', symbol: 'AAA', networkId: 'network-b', decimals: 6 },
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
          portfolioId: 'structured-output-portfolio',
          unavailableReason: 'missing_price',
          coverageState: 'partial',
        },
        valuationPositions: [],
      },
    },
  ];
  const context = buildPortfolioAiContext({
    analysisId: 'structured-output-analysis',
    task: PortfolioAiTask.Interpret,
    payload: {
      schemaVersion: '1',
      portfolioId: 'structured-output-portfolio',
      capturedAt: '2026-08-22T00:00:00.000Z',
      asOf: '2026-08-22T00:00:00.000Z',
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
          itemIds: ['item-a', 'item-b'],
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

function structuredDocument(overrides = {}) {
  return {
    executionId,
    providerId: model.providerId,
    modelId: model.modelId,
    candidates: [
      {
        id: 'candidate-a',
        kind: 'descriptive',
        content: 'Descriptive model text, not a canonical fact.',
        factReferences: [
          {
            factId: 'opaque-fact-reference',
            presentationItemId: 'opaque-presentation-reference',
            sectionIds: ['opaque-section-reference'],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function exchangeFor(output, status = AiExecutionStatus.Completed) {
  const sourceDescriptor = descriptor();
  const result =
    status === AiExecutionStatus.Completed
      ? { executionId, status, authority: 'untrusted_model_execution', output, model }
      : {
          executionId,
          status,
          authority: 'untrusted_model_execution',
          failure: { message: 'isolated failure' },
          model,
        };
  const response = createPortfolioAiProviderResponse(sourceDescriptor, result);
  const normalized = normalizePortfolioAiProviderResponse(sourceDescriptor, response);
  return createPortfolioAiProviderExchange(sourceDescriptor, normalized);
}

test('parses the closed structured schema with exact identity and source traceability', () => {
  const exchange = exchangeFor(JSON.stringify(structuredDocument()));
  const parsed = parsePortfolioAiStructuredOutput(exchange);

  assert.equal(parsed.executionId, executionId);
  assert.deepEqual(parsed.model, model);
  assert.equal(
    parsed.authority,
    PortfolioAiCandidateInterpretationAuthority.UntrustedCandidateInterpretation,
  );
  assert.deepEqual(parsed.sourceExchange, exchange);
  assert.notEqual(parsed.sourceExchange, exchange);
  assert.equal(parsed.candidates[0].content, 'Descriptive model text, not a canonical fact.');
  assert.equal(parsed.sourceExchange.response.output, exchange.response.output);
});

test('parses multiple detached candidate items without grounding them', () => {
  const document = structuredDocument({
    candidates: [
      structuredDocument().candidates[0],
      {
        id: 'candidate-b',
        kind: 'descriptive',
        content: 'Second descriptive candidate.',
        sectionIds: ['still-opaque-section'],
      },
    ],
  });
  const parsed = parsePortfolioAiStructuredOutput(exchangeFor(JSON.stringify(document)));

  assert.deepEqual(
    parsed.candidates.map((candidate) => candidate.id),
    ['candidate-a', 'candidate-b'],
  );
  assert.equal('interpretations' in parsed, false);
  assert.equal('coverageState' in parsed, false);
  assert.equal(parsed.authority, 'untrusted_candidate_interpretation');
});

test('rejects malformed JSON, missing fields, unknown fields, and unsupported nesting', () => {
  const invalid = [
    '{',
    JSON.stringify({ providerId: model.providerId, modelId: model.modelId, candidates: [] }),
    JSON.stringify(structuredDocument({ extra: true })),
    JSON.stringify(
      structuredDocument({ candidates: [{ ...structuredDocument().candidates[0], metadata: {} }] }),
    ),
  ];
  for (const output of invalid) {
    assert.throws(
      () => parsePortfolioAiStructuredOutput(exchangeFor(output)),
      AiBoundaryValidationError,
    );
  }
});

test('rejects duplicate candidate IDs and malformed references', () => {
  const candidate = structuredDocument().candidates[0];
  const invalid = [
    structuredDocument({ candidates: [candidate, candidate] }),
    structuredDocument({
      candidates: [{ ...candidate, factReferences: [{ factId: 'fact-only' }] }],
    }),
    structuredDocument({ candidates: [{ ...candidate, sectionIds: [''] }] }),
  ];
  for (const document of invalid) {
    assert.throws(
      () => parsePortfolioAiStructuredOutput(exchangeFor(JSON.stringify(document))),
      AiBoundaryValidationError,
    );
  }
});

test('rejects canonical-field injection at document, candidate, and reference levels', () => {
  const candidate = structuredDocument().candidates[0];
  const invalid = [
    structuredDocument({ portfolioId: 'injected' }),
    structuredDocument({ candidates: [{ ...candidate, allocation: '50' }] }),
    structuredDocument({
      candidates: [
        {
          ...candidate,
          factReferences: [{ ...candidate.factReferences[0], canonicalPrice: '1' }],
        },
      ],
    }),
  ];
  for (const document of invalid) {
    assert.throws(
      () => parsePortfolioAiStructuredOutput(exchangeFor(JSON.stringify(document))),
      AiBoundaryValidationError,
    );
  }
});

test('rejects prototype-shaped input and inherited parsed-result properties', () => {
  assert.throws(
    () =>
      parsePortfolioAiStructuredOutput(
        exchangeFor(
          JSON.stringify(structuredDocument()).replace(
            /}$/,
            ',"__proto__":{"portfolioId":"injected"}}',
          ),
        ),
      ),
    AiBoundaryValidationError,
  );

  const parsed = parsePortfolioAiStructuredOutput(
    exchangeFor(JSON.stringify(structuredDocument())),
  );
  const inherited = Object.create(parsed);
  assert.throws(
    () => validatePortfolioAiParsedStructuredOutput(inherited),
    AiBoundaryValidationError,
  );
});

test('requires exact execution, provider, and optional model identity without repair', () => {
  for (const document of [
    structuredDocument({ executionId: 'other' }),
    structuredDocument({ providerId: 'other' }),
    structuredDocument({ modelId: 'other' }),
  ]) {
    assert.throws(
      () => parsePortfolioAiStructuredOutput(exchangeFor(JSON.stringify(document))),
      AiBoundaryValidationError,
    );
  }
  const { modelId: _omitted, ...withoutModelId } = structuredDocument();
  assert.throws(
    () => parsePortfolioAiStructuredOutput(exchangeFor(JSON.stringify(withoutModelId))),
    AiBoundaryValidationError,
  );
});

test('is deterministic, detached, and leaves exchange and raw output unchanged', () => {
  const exchange = exchangeFor(JSON.stringify(structuredDocument()));
  const before = JSON.stringify(exchange);
  const first = parsePortfolioAiStructuredOutput(exchange);
  first.candidates[0].factReferences[0].sectionIds.push('local-mutation');
  first.sourceExchange.response.source.result.output = 'local-mutation';
  const second = parsePortfolioAiStructuredOutput(exchange);

  assert.equal(JSON.stringify(exchange), before);
  assert.deepEqual(second, parsePortfolioAiStructuredOutput(exchange));
  assert.equal(second.candidates[0].factReferences[0].sectionIds.length, 1);
  assert.equal(second.sourceExchange.response.output, exchange.response.output);
});

test('isolates failed calls and rejects failed exchanges without parsing failure text', () => {
  const validExchange = exchangeFor(JSON.stringify(structuredDocument()));
  assert.throws(
    () => parsePortfolioAiStructuredOutput(exchangeFor('{')),
    AiBoundaryValidationError,
  );
  assert.throws(
    () => parsePortfolioAiStructuredOutput(exchangeFor(undefined, AiExecutionStatus.Failed)),
    AiBoundaryValidationError,
  );
  assert.deepEqual(
    parsePortfolioAiStructuredOutput(validExchange),
    parsePortfolioAiStructuredOutput(validExchange),
  );
});

function factReference(fact) {
  return {
    factId: fact.id,
    presentationItemId: fact.presentationItemId,
    sectionIds: fact.grounding.map((reference) => reference.sectionIds[0]),
  };
}

function parsedCandidates(candidateFactory) {
  const sourceDescriptor = descriptor();
  const context = sourceDescriptor.request.promptDocument.plan.input.context;
  const candidates = candidateFactory(context);
  const output = JSON.stringify(structuredDocument({ candidates }));
  return { context, parsed: parsePortfolioAiStructuredOutput(exchangeFor(output)) };
}

function validCandidateItems(context) {
  const networkA = context.facts.find((fact) => fact.presentationItemId === 'item-a');
  const missingPrice = context.facts.find((fact) => fact.presentationItemId === 'missing-price');
  return [
    {
      id: 'candidate-network-a',
      kind: 'descriptive',
      content: 'Describes the explicitly referenced network A evidence.',
      factReferences: [factReference(networkA)],
    },
    {
      id: 'candidate-missing-price',
      kind: 'descriptive',
      content: 'Describes the explicit missing-price evidence.',
      factReferences: [factReference(missingPrice)],
    },
    {
      id: 'candidate-section',
      kind: 'descriptive',
      content: 'Describes only the explicitly referenced concentration section.',
      sectionIds: [sectionId('concentration')],
    },
  ];
}

test('maps parsed output through existing candidate and reference validation without grounding', () => {
  const { parsed } = parsedCandidates(validCandidateItems);
  const result = validatePortfolioAiParsedCandidates(parsed);

  validatePortfolioAiParsedCandidateValidationResult(result);
  assert.equal(result.executionId, executionId);
  assert.deepEqual(result.model, model);
  assert.equal(result.authority, 'untrusted_candidate_interpretation');
  assert.equal(result.candidate.authority, 'untrusted_candidate_interpretation');
  assert.deepEqual(result.sourceExchange, parsed.sourceExchange);
  assert.notEqual(result.sourceExchange, parsed.sourceExchange);
  assert.deepEqual(
    result.candidate.candidates.map((candidate) => candidate.id),
    ['candidate-network-a', 'candidate-missing-price', 'candidate-section'],
  );
  assert.equal('interpretations' in result, false);
  assert.equal('grounded' in result, false);
});

test('preserves exact candidate order, IDs, references, and same-symbol cross-network identity', () => {
  const { context, parsed } = parsedCandidates((sourceContext) => {
    const networkB = sourceContext.facts.find((fact) => fact.presentationItemId === 'item-b');
    const networkA = sourceContext.facts.find((fact) => fact.presentationItemId === 'item-a');
    return [
      {
        id: 'candidate-b-first',
        kind: 'descriptive',
        content: 'Network B remains first.',
        factReferences: [factReference(networkB)],
      },
      {
        id: 'candidate-a-second',
        kind: 'descriptive',
        content: 'Network A remains second.',
        factReferences: [factReference(networkA)],
      },
    ];
  });
  const result = validatePortfolioAiParsedCandidates(parsed);

  assert.deepEqual(
    result.candidate.candidates.map((candidate) => candidate.id),
    ['candidate-b-first', 'candidate-a-second'],
  );
  const referencedFacts = result.candidate.candidates.map((candidate) =>
    context.facts.find((fact) => fact.id === candidate.factReferences[0].factId),
  );
  assert.deepEqual(
    referencedFacts.map((fact) => [
      fact.evidence.insight.asset.symbol,
      fact.evidence.insight.asset.networkId,
    ]),
    [
      ['AAA', 'network-b'],
      ['AAA', 'network-a'],
    ],
  );
});

test('preserves partial missing-data state and exact large decimals only in canonical context', () => {
  const { parsed } = parsedCandidates(validCandidateItems);
  const result = validatePortfolioAiParsedCandidates(parsed);
  const context = result.sourceExchange.descriptor.request.promptDocument.plan.input.context;

  assert.equal(context.summary.coverage.state, 'partial');
  assert.equal(context.summary.totalValuedValue, '900719925474099312345678.123456');
  assert.equal(
    context.facts.find((fact) => fact.presentationItemId === 'item-a').evidence.insight
      .measuredValue,
    '900719925474099312345678.123456',
  );
  assert.equal(
    context.facts.find((fact) => fact.presentationItemId === 'missing-price').evidence.insight
      .unavailableReason,
    'missing_price',
  );
  assert.equal('coverageState' in result.candidate.candidates[0], false);
  assert.equal('measuredValue' in result.candidate.candidates[0], false);
});

test('rejects unknown, contradictory, and malformed explicit references', () => {
  const sourceContext = descriptor().request.promptDocument.plan.input.context;
  const networkA = sourceContext.facts.find((fact) => fact.presentationItemId === 'item-a');
  const invalidCandidates = [
    [
      {
        id: 'unknown-reference',
        kind: 'descriptive',
        content: 'Unknown reference.',
        factReferences: [{ ...factReference(networkA), factId: 'unknown-fact' }],
      },
    ],
    [
      {
        id: 'contradictory-reference',
        kind: 'descriptive',
        content: 'Contradictory reference.',
        factReferences: [{ ...factReference(networkA), presentationItemId: 'item-b' }],
      },
    ],
    [
      {
        id: 'contradictory-sections',
        kind: 'descriptive',
        content: 'Contradictory sections.',
        factReferences: [factReference(networkA)],
        sectionIds: [sectionId('data_quality')],
      },
    ],
  ];
  for (const candidates of invalidCandidates) {
    const { parsed } = parsedCandidates(() => candidates);
    assert.throws(() => validatePortfolioAiParsedCandidates(parsed), AiBoundaryValidationError);
  }
});

test('rejects malformed, duplicate, identity-mutated, and canonical-injected parsed candidates', () => {
  const { parsed } = parsedCandidates(validCandidateItems);
  const first = parsed.candidates[0];
  const invalid = [
    { ...parsed, candidates: [{ ...first, content: '' }] },
    { ...parsed, candidates: [first, first] },
    { ...parsed, executionId: 'mismatched-execution' },
    { ...parsed, candidates: [{ ...first, canonicalPrice: '1' }] },
  ];
  for (const candidate of invalid) {
    assert.throws(() => validatePortfolioAiParsedCandidates(candidate), AiBoundaryValidationError);
  }
});

test('is deterministic and detached without mutating parsed output or canonical references', () => {
  const { parsed } = parsedCandidates(validCandidateItems);
  const before = JSON.stringify(parsed);
  const expected = validatePortfolioAiParsedCandidates(parsed);
  const mutated = validatePortfolioAiParsedCandidates(parsed);
  mutated.candidate.candidates[0].factReferences[0].sectionIds.push('local-only');
  mutated.sourceExchange.response.source.result.output = 'local-only';

  assert.equal(JSON.stringify(parsed), before);
  assert.deepEqual(validatePortfolioAiParsedCandidates(parsed), expected);
});

test('isolates each failed integration before an equivalent valid candidate call', () => {
  const { parsed } = parsedCandidates(validCandidateItems);
  const expected = validatePortfolioAiParsedCandidates(parsed);
  const first = parsed.candidates[0];
  const failures = [
    {
      ...parsed,
      candidates: [
        {
          ...first,
          factReferences: [{ ...first.factReferences[0], factId: 'unknown' }],
        },
      ],
    },
    { ...parsed, candidates: [first, first] },
    { ...parsed, model: { ...parsed.model, providerId: 'mismatch' } },
    { ...parsed, candidates: [{ ...first, portfolioId: 'injected' }] },
  ];
  for (const failure of failures) {
    assert.throws(() => validatePortfolioAiParsedCandidates(failure), AiBoundaryValidationError);
    assert.deepEqual(validatePortfolioAiParsedCandidates(parsed), expected);
  }
});

function groundingFixture(candidateFactory = validCandidateItems) {
  const { parsed } = parsedCandidates(candidateFactory);
  return {
    parsed,
    candidateValidation: validatePortfolioAiParsedCandidates(parsed),
  };
}

function groundingContext(fixture) {
  return fixture.parsed.sourceExchange.descriptor.request.promptDocument.plan.input.context;
}

test('explicitly grounds validated parsed candidates with complete traceability and trust progression', () => {
  const fixture = groundingFixture();
  const result = groundPortfolioAiParsedCandidates(fixture);

  validatePortfolioAiParsedCandidateGroundingResult(result);
  assert.equal(result.executionId, executionId);
  assert.equal(result.providerId, model.providerId);
  assert.equal(result.modelId, model.modelId);
  assert.equal(result.authority, 'non_authoritative_interpretation');
  assert.equal(result.grounded.authority, 'non_authoritative_interpretation');
  assert.deepEqual(result.sourceParsedOutput, fixture.parsed);
  assert.deepEqual(result.sourceCandidateValidation, fixture.candidateValidation);
  assert.deepEqual(result.sourceCandidateValidation.sourceExchange, fixture.parsed.sourceExchange);
  assert.equal(fixture.candidateValidation.authority, 'untrusted_candidate_interpretation');
});

test('preserves multiple candidate IDs and exact validated ordering through grounding', () => {
  const fixture = groundingFixture();
  const result = groundPortfolioAiParsedCandidates(fixture);

  assert.deepEqual(
    result.grounded.interpretations.map((interpretation) => interpretation.id),
    fixture.candidateValidation.candidate.candidates.map((candidate) => candidate.id),
  );
  assert.deepEqual(
    result.grounded.interpretations.map((interpretation) => interpretation.content),
    fixture.candidateValidation.candidate.candidates.map((candidate) => candidate.content),
  );
});

test('grounds exact fact, section, and combined fact-section references without inference', () => {
  const fixture = groundingFixture((context) => {
    const fact = context.facts.find((candidate) => candidate.presentationItemId === 'item-a');
    const reference = factReference(fact);
    return [
      {
        id: 'fact-only',
        kind: 'descriptive',
        content: 'Fact-only reference.',
        factReferences: [reference],
      },
      {
        id: 'section-only',
        kind: 'descriptive',
        content: 'Section-only reference.',
        sectionIds: [sectionId('concentration')],
      },
      {
        id: 'fact-and-section',
        kind: 'descriptive',
        content: 'Matching fact and section references.',
        factReferences: [reference],
        sectionIds: [...reference.sectionIds],
      },
    ];
  });
  const result = groundPortfolioAiParsedCandidates(fixture);

  assert.deepEqual(result.grounded.interpretations[0].factReferences, [
    factReference(
      groundingContext(fixture).facts.find(
        (candidate) => candidate.presentationItemId === 'item-a',
      ),
    ),
  ]);
  assert.deepEqual(result.grounded.interpretations[1].sectionIds, [sectionId('concentration')]);
  assert.deepEqual(
    result.grounded.interpretations[2].sectionIds,
    result.grounded.interpretations[2].factReferences[0].sectionIds,
  );
});

test('keeps same-symbol cross-network facts distinct after grounding by canonical identity', () => {
  const fixture = groundingFixture((context) => {
    const networkB = context.facts.find((fact) => fact.presentationItemId === 'item-b');
    const networkA = context.facts.find((fact) => fact.presentationItemId === 'item-a');
    return [
      {
        id: 'network-b-first',
        kind: 'descriptive',
        content: 'Explicit network B evidence.',
        factReferences: [factReference(networkB)],
      },
      {
        id: 'network-a-second',
        kind: 'descriptive',
        content: 'Explicit network A evidence.',
        factReferences: [factReference(networkA)],
      },
    ];
  });
  const result = groundPortfolioAiParsedCandidates(fixture);
  const context = groundingContext(fixture);
  const referencedFacts = result.grounded.interpretations.map((interpretation) =>
    context.facts.find((fact) => fact.id === interpretation.factReferences[0].factId),
  );

  assert.deepEqual(
    referencedFacts.map((fact) => [
      fact.evidence.insight.asset.symbol,
      fact.evidence.insight.asset.networkId,
    ]),
    [
      ['AAA', 'network-b'],
      ['AAA', 'network-a'],
    ],
  );
});

test('preserves partial missing-data coverage and exact canonical decimal evidence', () => {
  const fixture = groundingFixture();
  const result = groundPortfolioAiParsedCandidates(fixture);
  const context =
    result.sourceCandidateValidation.sourceExchange.descriptor.request.promptDocument.plan.input
      .context;

  assert.equal(result.grounded.coverageState, 'partial');
  assert.equal(
    result.grounded.interpretations.find((item) => item.id === 'candidate-missing-price')
      .coverageState,
    'partial',
  );
  assert.equal(context.summary.totalValuedValue, '900719925474099312345678.123456');
  assert.equal(
    context.facts.find((fact) => fact.presentationItemId === 'missing-price').evidence.insight
      .unavailableReason,
    'missing_price',
  );
  assert.equal('totalValuedValue' in result.grounded, false);
  assert.equal('portfolioId' in result.grounded, false);
});

test('returns deterministic detached grounding without mutating any source artifact', () => {
  const fixture = groundingFixture();
  const before = JSON.stringify(fixture);
  const expected = groundPortfolioAiParsedCandidates(fixture);
  const mutated = groundPortfolioAiParsedCandidates(fixture);
  mutated.grounded.interpretations[0].factReferences[0].sectionIds.push('local-only');
  mutated.sourceParsedOutput.sourceExchange.response.source.result.output = 'local-only';
  mutated.sourceCandidateValidation.candidate.candidates[0].content = 'local-only';

  assert.equal(JSON.stringify(fixture), before);
  assert.deepEqual(groundPortfolioAiParsedCandidates(fixture), expected);
});

test('fails closed and isolates invalid grounding sources before the next valid call', () => {
  const fixture = groundingFixture();
  const expected = groundPortfolioAiParsedCandidates(fixture);
  const first = fixture.candidateValidation.candidate.candidates[0];
  const failures = [
    {
      ...fixture,
      candidateValidation: {
        ...fixture.candidateValidation,
        candidate: {
          ...fixture.candidateValidation.candidate,
          candidates: [
            {
              ...first,
              factReferences: [{ ...first.factReferences[0], factId: 'unknown-fact' }],
            },
          ],
        },
      },
    },
    {
      ...fixture,
      candidateValidation: {
        ...fixture.candidateValidation,
        candidate: {
          ...fixture.candidateValidation.candidate,
          candidates: [
            {
              ...first,
              sectionIds: [sectionId('data_quality')],
            },
          ],
        },
      },
    },
    {
      ...fixture,
      candidateValidation: {
        ...fixture.candidateValidation,
        executionId: 'mismatched-execution',
      },
    },
    {
      ...fixture,
      candidateValidation: {
        ...fixture.candidateValidation,
        authority: 'non_authoritative_interpretation',
      },
    },
    { parsed: fixture.parsed, candidateValidation: fixture.candidateValidation, extra: true },
  ];

  for (const failure of failures) {
    assert.throws(() => groundPortfolioAiParsedCandidates(failure), AiBoundaryValidationError);
    assert.deepEqual(groundPortfolioAiParsedCandidates(fixture), expected);
  }
});
