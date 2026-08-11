import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PortfolioPositionKind,
  PortfolioRiskConcentrationLevel,
  PortfolioRiskDataState,
  PortfolioRiskUnavailableReason,
  PortfolioRiskValidationError,
  analyzePortfolioAllocation,
  analyzePortfolioRisk,
  valuePortfolioSnapshot,
} from '../dist/index.js';

const options = Object.freeze({
  thresholds: {
    asset: { moderatePercentage: '50', highPercentage: '80' },
    network: { moderatePercentage: '50', highPercentage: '80' },
    source: { moderatePercentage: '50', highPercentage: '80' },
    account: { moderatePercentage: '50', highPercentage: '80' },
  },
});

function asset(id, networkId) {
  return { id, symbol: 'USDC', networkId, contractAddress: `contract-${id}`, decimals: 0 };
}

function position(id, quantity, assetValue, sourceId = 'source-a', accountId = 'account-a') {
  return {
    id,
    sourceId,
    accountId,
    kind: PortfolioPositionKind.AssetBalance,
    asset: assetValue,
    quantity,
    observedAt: '2026-08-11T00:00:00.000Z',
  };
}

function snapshot(positions) {
  return {
    portfolio: {
      id: 'portfolio-risk',
      label: 'Risk portfolio',
      sources: [
        { id: 'source-a', label: 'Source A' },
        { id: 'source-b', label: 'Source B' },
      ],
      accounts: [
        { id: 'account-a', sourceId: 'source-a', label: 'Account A' },
        { id: 'account-b', sourceId: 'source-b', label: 'Account B' },
      ],
    },
    capturedAt: '2026-08-11T01:00:00.000Z',
    positions,
  };
}

function price(assetValue, value = '1') {
  return {
    asset: assetValue,
    price: value,
    currency: 'USD',
    observedAt: '2026-08-11T00:30:00.000Z',
    sourceId: 'price-source',
  };
}

function inputFor(source, prices) {
  const valuation = valuePortfolioSnapshot(source, prices, { currency: 'USD' });
  return {
    analysisId: 'risk-analysis',
    asOf: valuation.asOf,
    snapshot: source,
    valuation,
    allocation: analyzePortfolioAllocation(source, valuation),
  };
}

function levelFor(analysis, assetId) {
  return analysis.concentrationObservations.find(
    (observation) => observation.allocation.asset.id === assetId,
  ).level;
}

test('classifies asset, network, source, and account exposure from explicit inclusive thresholds', () => {
  const first = asset('asset-a', 'network-a');
  const second = asset('asset-b', 'network-b');
  const source = snapshot([
    position('position-a', '80', first),
    position('position-b', '20', second, 'source-b', 'account-b'),
  ]);
  const analysis = analyzePortfolioRisk(inputFor(source, [price(first), price(second)]), options);

  assert.equal(levelFor(analysis, 'asset-a'), PortfolioRiskConcentrationLevel.High);
  assert.equal(levelFor(analysis, 'asset-b'), PortfolioRiskConcentrationLevel.None);
  assert.equal(
    analysis.exposureObservations.find(
      (observation) => observation.allocation.identity === 'network-a',
    ).level,
    PortfolioRiskConcentrationLevel.High,
  );
  assert.equal(
    analysis.exposureObservations.find(
      (observation) => observation.allocation.identity === 'source-b',
    ).level,
    PortfolioRiskConcentrationLevel.None,
  );
  assert.equal(
    analysis.exposureObservations.find(
      (observation) => observation.allocation.identity === 'account-a',
    ).level,
    PortfolioRiskConcentrationLevel.High,
  );
  assert.equal(analysis.coverage.state, PortfolioRiskDataState.Complete);
  assert.equal(analysis.concentrationObservations[0].thresholdEvidence.highPercentage, '80');
  assert.ok(!JSON.stringify(analysis).match(/recommend|buy|sell|rebalance/i));
});

test('uses exact deterministic threshold boundaries without symbol aggregation', () => {
  const first = asset('asset-a', 'network-a');
  const second = asset('asset-b', 'network-b');
  const atModerate = snapshot([
    position('position-a', '50', first),
    position('position-b', '50', second, 'source-b', 'account-b'),
  ]);
  const atHigh = snapshot([
    position('position-a', '80', first),
    position('position-b', '20', second, 'source-b', 'account-b'),
  ]);
  const aboveHigh = snapshot([
    position('position-a', '81', first),
    position('position-b', '19', second, 'source-b', 'account-b'),
  ]);

  assert.equal(
    levelFor(
      analyzePortfolioRisk(inputFor(atModerate, [price(first), price(second)]), options),
      'asset-a',
    ),
    PortfolioRiskConcentrationLevel.Moderate,
  );
  assert.equal(
    levelFor(
      analyzePortfolioRisk(inputFor(atHigh, [price(first), price(second)]), options),
      'asset-a',
    ),
    PortfolioRiskConcentrationLevel.High,
  );
  assert.equal(
    levelFor(
      analyzePortfolioRisk(inputFor(aboveHigh, [price(first), price(second)]), options),
      'asset-a',
    ),
    PortfolioRiskConcentrationLevel.High,
  );
  const below = analyzePortfolioRisk(
    inputFor(
      snapshot([
        position('position-a', '49', first),
        position('position-b', '51', second, 'source-b', 'account-b'),
      ]),
      [price(first), price(second)],
    ),
    options,
  );
  assert.equal(levelFor(below, 'asset-a'), PortfolioRiskConcentrationLevel.None);
  assert.equal(below.concentrationObservations.length, 2);
  assert.notEqual(
    below.concentrationObservations[0].allocation.asset.networkId,
    below.concentrationObservations[1].allocation.asset.networkId,
  );
});

test('keeps partial, unavailable, and zero-total coverage explicit without concentration claims', () => {
  const valued = asset('asset-a', 'network-a');
  const unvalued = asset('asset-b', 'network-b');
  const partial = analyzePortfolioRisk(
    inputFor(
      snapshot([
        position('position-a', '1', valued),
        position('position-b', '1', unvalued, 'source-b', 'account-b'),
      ]),
      [price(valued)],
    ),
    options,
  );
  assert.equal(partial.coverage.state, PortfolioRiskDataState.Partial);
  assert.equal(partial.coverage.unvaluedPositions.length, 1);
  assert.ok(
    partial.unavailableObservations.some(
      (item) => item.reason === PortfolioRiskUnavailableReason.MissingPrice,
    ),
  );

  const allUnvalued = analyzePortfolioRisk(
    inputFor(snapshot([position('position-a', '1', valued)]), []),
    options,
  );
  assert.equal(allUnvalued.coverage.state, PortfolioRiskDataState.Unavailable);
  assert.equal(allUnvalued.concentrationObservations.length, 0);
  assert.ok(
    allUnvalued.unavailableObservations.some(
      (item) => item.reason === PortfolioRiskUnavailableReason.NoValuedPositions,
    ),
  );

  const zero = analyzePortfolioRisk(
    inputFor(snapshot([position('position-a', '1', valued)]), [price(valued, '0')]),
    options,
  );
  assert.equal(zero.coverage.state, PortfolioRiskDataState.InsufficientData);
  assert.equal(zero.concentrationObservations.length, 0);
  assert.ok(
    zero.unavailableObservations.some(
      (item) => item.reason === PortfolioRiskUnavailableReason.ZeroTotalValue,
    ),
  );

  const empty = analyzePortfolioRisk(inputFor(snapshot([]), []), options);
  assert.equal(empty.coverage.state, PortfolioRiskDataState.InsufficientData);
  assert.equal(empty.concentrationObservations.length, 0);
  assert.ok(
    empty.unavailableObservations.some(
      (item) => item.reason === PortfolioRiskUnavailableReason.NoValuedPositions,
    ),
  );
});

test('is deterministic, detached, order-invariant, and isolates invalid configurations', () => {
  const first = asset('asset-a', 'network-a');
  const second = asset('asset-b', 'network-b');
  const source = snapshot([
    position('position-a', '60', first),
    position('position-b', '40', second, 'source-b', 'account-b'),
  ]);
  const input = inputFor(source, [price(first), price(second)]);
  const inputBefore = JSON.stringify(input);
  const optionsBefore = JSON.stringify(options);
  const firstResult = analyzePortfolioRisk(input, options);
  const reordered = inputFor(snapshot([...source.positions].reverse()), [
    price(second),
    price(first),
  ]);
  const secondResult = analyzePortfolioRisk(reordered, options);

  assert.deepEqual(firstResult, secondResult);
  assert.equal(JSON.stringify(input), inputBefore);
  assert.equal(JSON.stringify(options), optionsBefore);
  assert.notEqual(
    firstResult.concentrationObservations[0].allocation,
    input.allocation.assetAllocation.items[0],
  );
  assert.throws(
    () =>
      analyzePortfolioRisk(input, {
        thresholds: {
          ...options.thresholds,
          asset: { moderatePercentage: '80', highPercentage: '80' },
        },
      }),
    PortfolioRiskValidationError,
  );
  assert.throws(
    () =>
      analyzePortfolioRisk(input, {
        thresholds: {
          ...options.thresholds,
          asset: { moderatePercentage: '-1', highPercentage: '80' },
        },
      }),
    PortfolioRiskValidationError,
  );
  assert.deepEqual(analyzePortfolioRisk(input, options), firstResult);
});
