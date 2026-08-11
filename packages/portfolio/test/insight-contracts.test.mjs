import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PortfolioInsightCategory,
  PortfolioInsightSeverity,
  PortfolioPositionKind,
  PortfolioRiskConcentrationLevel,
  PortfolioRiskDataState,
  PortfolioRiskUnavailableReason,
  PortfolioInsightValidationError,
  analyzePortfolioAllocation,
  analyzePortfolioRisk,
  validatePortfolioInsightAnalysis,
  valuePortfolioSnapshot,
} from '../dist/index.js';

const options = {
  thresholds: {
    asset: { moderatePercentage: '50', highPercentage: '80' },
    network: { moderatePercentage: '50', highPercentage: '80' },
    source: { moderatePercentage: '50', highPercentage: '80' },
    account: { moderatePercentage: '50', highPercentage: '80' },
  },
};

function asset(id, networkId) {
  return { id, symbol: 'USDC', networkId, contractAddress: `contract-${id}`, decimals: 0 };
}

function context() {
  const first = asset('asset-a', 'network-a');
  const second = asset('asset-b', 'network-b');
  const source = {
    portfolio: {
      id: 'portfolio-insight',
      label: 'Insights',
      sources: [{ id: 'source-a', label: 'Source A' }],
      accounts: [{ id: 'account-a', sourceId: 'source-a', label: 'Account A' }],
    },
    capturedAt: '2026-08-11T01:00:00.000Z',
    positions: [
      {
        id: 'position-a',
        asset: first,
        quantity: '80',
        sourceId: 'source-a',
        accountId: 'account-a',
        kind: PortfolioPositionKind.AssetBalance,
        observedAt: '2026-08-11T00:00:00.000Z',
      },
      {
        id: 'position-b',
        asset: second,
        quantity: '20',
        sourceId: 'source-a',
        accountId: 'account-a',
        kind: PortfolioPositionKind.AssetBalance,
        observedAt: '2026-08-11T00:00:00.000Z',
      },
      {
        id: 'position-c',
        asset: { ...asset('asset-c', 'network-a'), decimals: undefined },
        quantity: '1',
        sourceId: 'source-a',
        accountId: 'account-a',
        kind: PortfolioPositionKind.AssetBalance,
        observedAt: '2026-08-11T00:00:00.000Z',
      },
    ],
  };
  const prices = [
    { asset: first, price: '1', currency: 'USD', observedAt: '2026-08-11T00:30:00.000Z' },
    { asset: second, price: '1', currency: 'USD', observedAt: '2026-08-11T00:30:00.000Z' },
    {
      asset: source.positions[2].asset,
      price: '1',
      currency: 'USD',
      observedAt: '2026-08-11T00:30:00.000Z',
    },
  ];
  const valuation = valuePortfolioSnapshot(source, prices, { currency: 'USD' });
  const allocation = analyzePortfolioAllocation(source, valuation);
  const risk = analyzePortfolioRisk(
    { analysisId: 'risk-insight', asOf: valuation.asOf, snapshot: source, valuation, allocation },
    options,
  );
  return { snapshot: source, valuation, allocation, risk };
}

function analysis(overrides = {}) {
  const input = context();
  const assetAllocation = input.allocation.assetAllocation.items.find(
    (item) => item.asset.id === 'asset-a',
  );
  return {
    input,
    analysis: {
      portfolioId: input.snapshot.portfolio.id,
      asOf: input.risk.asOf,
      insights: [
        {
          id: 'valuation-a',
          category: PortfolioInsightCategory.Valuation,
          severity: PortfolioInsightSeverity.Info,
          evidence: {
            portfolioId: input.snapshot.portfolio.id,
            asset: assetAllocation.asset,
            measuredValue: assetAllocation.value,
          },
        },
        {
          id: 'allocation-a',
          category: PortfolioInsightCategory.Allocation,
          evidence: {
            portfolioId: input.snapshot.portfolio.id,
            allocation: assetAllocation,
            measuredPercentage: assetAllocation.percentage,
          },
        },
        {
          id: 'concentration-a',
          category: PortfolioInsightCategory.Concentration,
          severity: PortfolioInsightSeverity.Significant,
          evidence: {
            portfolioId: input.snapshot.portfolio.id,
            asset: assetAllocation.asset,
            allocation: assetAllocation,
            measuredPercentage: assetAllocation.percentage,
            thresholdEvidence: {
              ...input.risk.concentrationObservations[0].thresholdEvidence,
            },
            riskLevel: PortfolioRiskConcentrationLevel.High,
          },
        },
        {
          id: 'coverage',
          category: PortfolioInsightCategory.Coverage,
          evidence: {
            portfolioId: input.snapshot.portfolio.id,
            coverageState: PortfolioRiskDataState.Partial,
          },
        },
        {
          id: 'missing-decimals',
          category: PortfolioInsightCategory.DataQuality,
          evidence: {
            portfolioId: input.snapshot.portfolio.id,
            positionIdentity: input.valuation.unvaluedPositions[0].positionIdentity,
            asset: input.valuation.unvaluedPositions[0].asset,
            unavailableReason: PortfolioRiskUnavailableReason.MissingDecimals,
          },
        },
        {
          id: 'exposure',
          category: PortfolioInsightCategory.Exposure,
          evidence: {
            portfolioId: input.snapshot.portfolio.id,
            allocation: input.allocation.exposure.network.items[0],
          },
        },
      ],
      ...overrides,
    },
  };
}

test('validates immutable valuation, allocation, concentration, exposure, coverage, and data-quality insight contracts', () => {
  const { input, analysis: value } = analysis();
  const inputBefore = JSON.stringify(input);
  const analysisBefore = JSON.stringify(value);
  validatePortfolioInsightAnalysis(input, value);
  assert.equal(JSON.stringify(input), inputBefore);
  assert.equal(JSON.stringify(value), analysisBefore);
  assert.notEqual(
    value.insights[0].evidence.asset.networkId,
    input.snapshot.positions[1].asset.networkId,
  );
});

test('rejects duplicate, malformed, contradictory, and unknown evidence deterministically', () => {
  const { input, analysis: value } = analysis();
  assert.throws(
    () =>
      validatePortfolioInsightAnalysis(input, {
        ...value,
        insights: [...value.insights, value.insights[0]],
      }),
    PortfolioInsightValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioInsightAnalysis(input, {
        ...value,
        insights: [{ ...value.insights[0], category: 'invalid' }],
      }),
    PortfolioInsightValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioInsightAnalysis(input, {
        ...value,
        insights: [
          {
            ...value.insights[3],
            evidence: {
              ...value.insights[3].evidence,
              coverageState: PortfolioRiskDataState.Complete,
            },
          },
        ],
      }),
    PortfolioInsightValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioInsightAnalysis(input, {
        ...value,
        insights: [
          {
            ...value.insights[4],
            evidence: { ...value.insights[4].evidence, positionIdentity: 'unknown' },
          },
        ],
      }),
    PortfolioInsightValidationError,
  );
});

test('remains deterministic for equivalent insight ordering and preserves existing Portfolio APIs', () => {
  const { input, analysis: value } = analysis();
  const reordered = { ...value, insights: [...value.insights].reverse() };
  validatePortfolioInsightAnalysis(input, value);
  validatePortfolioInsightAnalysis(input, reordered);
  assert.equal('insights' in input.valuation, false);
  assert.equal('insights' in input.allocation, false);
  assert.equal('insights' in input.risk, false);
});
