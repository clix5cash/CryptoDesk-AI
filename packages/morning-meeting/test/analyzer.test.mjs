import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MarketSignalType,
  SignalDirection,
  SignalStrength,
  Timeframe,
} from '@cryptodesk-ai/market-intelligence';
import {
  MorningMeetingAnalyzer,
  MorningMeetingBias,
  MorningMeetingRiskLevel,
} from '../dist/index.js';

const latestSnapshot = {
  marketId: 'bitcoin-usd',
  baseAssetId: 'bitcoin',
  quoteAssetId: 'usd',
  timeframe: Timeframe.OneHour,
  capturedAt: '2026-08-03T02:00:00.000Z',
  lastPrice: 120,
  high: 124,
  low: 116,
  volume: 300,
};

function indicator(indicatorId, values) {
  return {
    indicator: indicatorId,
    marketId: 'bitcoin-usd',
    assetId: 'bitcoin',
    timeframe: Timeframe.OneHour,
    observedAt: '2026-08-03T02:00:00.000Z',
    values,
  };
}

function signal({ id, type, direction, strength = SignalStrength.Moderate }) {
  return {
    id,
    type,
    direction,
    strength,
    assetId: 'bitcoin',
    marketId: 'bitcoin-usd',
    timeframe: Timeframe.OneHour,
    detectedAt: '2026-08-03T02:00:00.000Z',
    summary: 'Deterministic fixture signal.',
    evidence: [],
  };
}

test('derives a bullish bias from multiple aligned directional signals', () => {
  const analysis = new MorningMeetingAnalyzer().analyze({
    latestSnapshot,
    indicators: [],
    signals: [
      signal({
        id: 'bullish-cross',
        type: MarketSignalType.BullishCross,
        direction: SignalDirection.Bullish,
      }),
      signal({
        id: 'bullish-vwap',
        type: MarketSignalType.BullishVwapReclaim,
        direction: SignalDirection.Bullish,
      }),
    ],
  });

  assert.equal(analysis.bias, MorningMeetingBias.Bullish);
  assert.equal(analysis.evidence.length, 2);
});

test('derives a bearish bias from multiple aligned directional signals', () => {
  const analysis = new MorningMeetingAnalyzer().analyze({
    latestSnapshot,
    indicators: [],
    signals: [
      signal({
        id: 'bearish-cross',
        type: MarketSignalType.BearishCross,
        direction: SignalDirection.Bearish,
      }),
      signal({
        id: 'bearish-vwap',
        type: MarketSignalType.BearishVwapReclaim,
        direction: SignalDirection.Bearish,
      }),
    ],
  });

  assert.equal(analysis.bias, MorningMeetingBias.Bearish);
});

test('derives a neutral bias from conflicting directional evidence', () => {
  const analysis = new MorningMeetingAnalyzer().analyze({
    latestSnapshot,
    indicators: [],
    signals: [
      signal({
        id: 'bullish-cross',
        type: MarketSignalType.BullishCross,
        direction: SignalDirection.Bullish,
      }),
      signal({
        id: 'bearish-cross',
        type: MarketSignalType.BearishCross,
        direction: SignalDirection.Bearish,
      }),
    ],
  });

  assert.equal(analysis.bias, MorningMeetingBias.Neutral);
});

test('derives a neutral bias from insufficient directional evidence', () => {
  const analysis = new MorningMeetingAnalyzer().analyze({
    latestSnapshot,
    indicators: [],
    signals: [
      signal({
        id: 'bullish-cross',
        type: MarketSignalType.BullishCross,
        direction: SignalDirection.Bullish,
      }),
    ],
  });

  assert.equal(analysis.bias, MorningMeetingBias.Neutral);
});

test('does not inflate bias or risk from duplicate signal source records', () => {
  const duplicateSignal = signal({
    id: 'bullish-cross',
    type: MarketSignalType.BullishCross,
    direction: SignalDirection.Bullish,
  });
  const analysis = new MorningMeetingAnalyzer().analyze({
    latestSnapshot,
    indicators: [],
    signals: [duplicateSignal, { ...duplicateSignal }],
  });

  assert.equal(analysis.bias, MorningMeetingBias.Neutral);
  assert.equal(analysis.riskLevel, MorningMeetingRiskLevel.Moderate);
  assert.equal(analysis.evidence.length, 1);
  assert.equal(analysis.evidence[0]?.sourceRecordId, 'bullish-cross');
});

test('derives low risk from stable available ATR and volume evidence', () => {
  const analysis = new MorningMeetingAnalyzer().analyze({
    latestSnapshot,
    indicators: [
      indicator('atr', { value: 11, previousValue: 10 }),
      indicator('volume', { relative: 1.1 }),
    ],
    signals: [],
  });

  assert.equal(analysis.riskLevel, MorningMeetingRiskLevel.Low);
});

test('derives high risk from ATR expansion and a strong breakout', () => {
  const analysis = new MorningMeetingAnalyzer().analyze({
    latestSnapshot,
    indicators: [indicator('atr', { value: 16, previousValue: 10 })],
    signals: [
      signal({
        id: 'atr-breakout',
        type: MarketSignalType.BullishAtrBreakout,
        direction: SignalDirection.Bullish,
        strength: SignalStrength.Strong,
      }),
    ],
  });

  assert.equal(analysis.riskLevel, MorningMeetingRiskLevel.High);
});
