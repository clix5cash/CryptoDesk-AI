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
  mapPortfolioAiProviderRequest,
  normalizePortfolioAiProviderResponse,
  parsePortfolioAiStructuredOutput,
  validatePortfolioAiParsedStructuredOutput,
} from '../dist/index.js';

const executionId = 'structured-output-execution';
const model = { providerId: 'structured-provider', modelId: 'structured-model' };

function sectionId(section) {
  return JSON.stringify(['structured-output-portfolio', section]);
}

function descriptor() {
  const item = {
    id: 'item-a',
    category: 'concentration',
    priority: 'high',
    priorityReasons: ['canonical_identity'],
    targetIdentity: 'asset-a',
    evidence: {
      insight: {
        portfolioId: 'structured-output-portfolio',
        asset: { id: 'asset-a', symbol: 'AAA', networkId: 'network-a', decimals: 6 },
        measuredValue: '10',
        measuredPercentage: '100',
        coverageState: 'complete',
      },
      valuationPositions: [],
    },
  };
  const context = buildPortfolioAiContext({
    analysisId: 'structured-output-analysis',
    task: PortfolioAiTask.Interpret,
    payload: {
      schemaVersion: '1',
      portfolioId: 'structured-output-portfolio',
      capturedAt: '2026-08-22T00:00:00.000Z',
      asOf: '2026-08-22T00:00:00.000Z',
      currency: 'USD',
      totalValuedValue: '10',
      coverage: {
        state: 'complete',
        valuation: {
          totalPositionCount: 1,
          valuedPositionCount: 1,
          unvaluedPositionCount: 0,
          valuedPositionCoveragePercentage: '100',
          unvaluedReasons: [],
        },
      },
      items: [item],
      sections: [
        { id: sectionId('overview'), section: 'overview', itemIds: [] },
        { id: sectionId('valuation'), section: 'valuation', itemIds: [] },
        { id: sectionId('coverage'), section: 'coverage', itemIds: [] },
        { id: sectionId('concentration'), section: 'concentration', itemIds: ['item-a'] },
        { id: sectionId('data_quality'), section: 'data_quality', itemIds: [] },
        {
          id: sectionId('prioritized_insights'),
          section: 'prioritized_insights',
          itemIds: ['item-a'],
        },
      ],
    },
  });
  const input = createPortfolioAiModelInput({
    task: PortfolioAiTask.Interpret,
    context,
    factIds: context.facts.map((fact) => fact.id),
    sectionIds: [sectionId('concentration')],
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
