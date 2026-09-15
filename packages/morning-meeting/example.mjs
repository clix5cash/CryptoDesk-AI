import { IndicatorEngine, SignalEngine, Timeframe } from '@cryptodesk-ai/market-intelligence';
import {
  DefaultMorningMeetingService,
  MorningMeetingAnalyzer,
  MorningMeetingReportValidator,
} from '@cryptodesk-ai/morning-meeting';
const snapshot = {
  marketId: 'synthetic-market',
  baseAssetId: 'synthetic-asset',
  quoteAssetId: 'synthetic-quote',
  timeframe: Timeframe.OneHour,
  capturedAt: '2026-01-01T00:00:00.000Z',
  lastPrice: 100,
  high: 101,
  low: 99,
  volume: 10,
};
const service = new DefaultMorningMeetingService({
  snapshotProvider: {
    async getSnapshots() {
      return [snapshot];
    },
  },
  indicatorEngine: new IndicatorEngine(),
  signalEngine: new SignalEngine(),
  analyzer: new MorningMeetingAnalyzer(),
  reportValidator: new MorningMeetingReportValidator(),
  idGenerator: { generate: () => 'synthetic-morning-meeting' },
  clock: { now: () => '2026-01-01T01:00:00.000Z' },
});
const report = await service.generate({ timeframe: Timeframe.OneHour });
console.log('Morning Meeting example (synthetic input)');
console.log('Canonical report:', report.id);
console.log('Market contributors:', report.marketViews.length);
console.log('Generated at:', report.generatedAt);
console.log('AI narration is optional and not invoked.');
