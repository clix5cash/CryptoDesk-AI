import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PortfolioPositionKind,
  PortfolioRiskDataState,
  PortfolioRiskUnavailableReason,
  PortfolioRiskValidationError,
  analyzePortfolioAllocation,
  validatePortfolioRiskAnalysis,
  validatePortfolioRiskAnalysisInput,
  valuePortfolioSnapshot,
} from '../dist/index.js';

function asset(overrides = {}) {
  return {
    id: 'asset-a',
    symbol: 'TOKEN',
    networkId: 'network-a',
    contractAddress: 'contract-a',
    decimals: 0,
    ...overrides,
  };
}

function position(overrides = {}) {
  return {
    id: 'position-a',
    sourceId: 'source-a',
    accountId: 'account-a',
    kind: PortfolioPositionKind.AssetBalance,
    asset: asset(),
    quantity: '1',
    observedAt: '2026-08-11T00:00:00.000Z',
    ...overrides,
  };
}

function snapshot(positions = [position()]) {
  return {
    portfolio: {
      id: 'portfolio-a',
      label: 'Primary',
      sources: [{ id: 'source-a', label: 'Source A' }],
      accounts: [{ id: 'account-a', sourceId: 'source-a', label: 'Account A' }],
    },
    capturedAt: '2026-08-11T01:00:00.000Z',
    positions,
  };
}

function price(assetValue) {
  return {
    asset: assetValue,
    price: '2',
    currency: 'USD',
    observedAt: '2026-08-11T00:30:00.000Z',
    sourceId: 'price-source-a',
    sourceRecordId: `price-${assetValue.id}`,
  };
}

function riskFixture(source, prices) {
  const valuation = valuePortfolioSnapshot(source, prices, { currency: 'USD' });
  const allocation = analyzePortfolioAllocation(source, valuation);
  const input = {
    analysisId: 'risk-analysis-a',
    asOf: valuation.asOf,
    snapshot: source,
    valuation,
    allocation,
  };
  const analysis = {
    analysisId: input.analysisId,
    portfolioId: source.portfolio.id,
    asOf: input.asOf,
    coverage: {
      state:
        valuation.unvaluedPositions.length === 0
          ? PortfolioRiskDataState.Complete
          : valuation.positions.length === 0
            ? PortfolioRiskDataState.Unavailable
            : PortfolioRiskDataState.Partial,
      coverage: allocation.coverage,
      valuedPositionIdentities: valuation.positions.map((item) => item.positionIdentity),
      unvaluedPositions: valuation.unvaluedPositions,
    },
    concentrationObservations: allocation.assetAllocation.items.map((allocation) => ({
      allocation,
    })),
    exposureObservations: [
      ...allocation.exposure.network.items,
      ...allocation.exposure.source.items,
      ...allocation.exposure.account.items,
    ].map((allocation) => ({ allocation })),
    unavailableObservations: valuation.unvaluedPositions.map((position) => ({
      reason:
        position.reason === 'missing_price'
          ? PortfolioRiskUnavailableReason.MissingPrice
          : PortfolioRiskUnavailableReason.MissingDecimals,
      positionIdentity: position.positionIdentity,
      asset: position.asset,
    })),
  };
  return { input, analysis };
}

test('accepts complete immutable provider-neutral risk inputs and descriptive observations', () => {
  const source = snapshot();
  const { input, analysis } = riskFixture(source, [price(source.positions[0].asset)]);
  const inputBefore = JSON.stringify(input);
  const analysisBefore = JSON.stringify(analysis);

  validatePortfolioRiskAnalysisInput(input);
  validatePortfolioRiskAnalysis(input, analysis);
  assert.equal(JSON.stringify(input), inputBefore);
  assert.equal(JSON.stringify(analysis), analysisBefore);
  assert.equal(analysis.coverage.state, PortfolioRiskDataState.Complete);
  assert.equal(analysis.concentrationObservations[0].allocation.asset.id, 'asset-a');
  assert.ok(
    analysis.exposureObservations.some(
      (observation) => observation.allocation.sourceId === 'source-a',
    ),
  );
});

test('preserves explicit partial coverage and same-symbol cross-network identity without interpretation', () => {
  const first = position({ id: 'position-a', asset: asset() });
  const second = position({
    id: 'position-b',
    asset: asset({ id: 'asset-b', networkId: 'network-b', contractAddress: 'contract-b' }),
  });
  const source = snapshot([first, second]);
  const { input, analysis } = riskFixture(source, [price(first.asset)]);

  validatePortfolioRiskAnalysis(input, analysis);
  assert.equal(analysis.coverage.state, PortfolioRiskDataState.Partial);
  assert.equal(analysis.coverage.unvaluedPositions.length, 1);
  assert.equal(analysis.coverage.unvaluedPositions[0].reason, 'missing_price');
  assert.notEqual(
    analysis.concentrationObservations[0].allocation.asset.networkId,
    analysis.coverage.unvaluedPositions[0].asset.networkId,
  );
});

test('rejects contradictory risk identity, coverage, and observation records deterministically', () => {
  const source = snapshot();
  const { input, analysis } = riskFixture(source, [price(source.positions[0].asset)]);

  assert.throws(
    () => validatePortfolioRiskAnalysisInput({ ...input, asOf: '2026-08-11T02:00:00.000Z' }),
    PortfolioRiskValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioRiskAnalysis(input, {
        ...analysis,
        coverage: { ...analysis.coverage, valuedPositionIdentities: [] },
      }),
    PortfolioRiskValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioRiskAnalysis(input, {
        ...analysis,
        concentrationObservations: [{ allocation: analysis.exposureObservations[0].allocation }],
      }),
    PortfolioRiskValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioRiskAnalysis(input, {
        ...analysis,
        unavailableObservations: [
          {
            reason: PortfolioRiskUnavailableReason.MissingPrice,
            positionIdentity: 'unknown-position',
          },
        ],
      }),
    PortfolioRiskValidationError,
  );
});
