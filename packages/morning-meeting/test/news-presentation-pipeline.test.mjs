import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NewsImpactDirection,
  NewsImpactTargetKind,
  NewsImpactType,
} from '@cryptodesk-ai/news-intelligence';
import {
  MorningMeetingEvidenceKind,
  MorningMeetingNewsBriefAssembler,
  MorningMeetingNewsBriefSelector,
  MorningMeetingNewsNarrationInputAssembler,
  MorningMeetingNewsNarrationValidator,
  MorningMeetingNewsPriority,
} from '../dist/index.js';

const asOf = '2026-08-04T00:00:00.000Z';

function newsEvidence({
  targetId,
  direction,
  impactType,
  eventGroupId,
  sourceRecordIds = [`record-${eventGroupId}`],
  publishedAt,
} = {}) {
  return {
    kind: MorningMeetingEvidenceKind.NewsMarketIntelligence,
    assetId: 'bitcoin',
    marketId: 'bitcoin-usd',
    observedAt: publishedAt,
    newsTargetKind: NewsImpactTargetKind.Asset,
    newsTargetId: targetId,
    newsDirection: direction,
    newsImpactTypes: [impactType],
    newsFirstPublishedAt: publishedAt,
    newsLastPublishedAt: publishedAt,
    newsArticleIds: [`article-${eventGroupId}`],
    newsEventGroupIds: [eventGroupId],
    newsSourceIds: [`source-${eventGroupId}`],
    newsSourceRecordIds: sourceRecordIds,
  };
}

test('hardens the deterministic brief-to-narration presentation pipeline', async () => {
  const sourceEvidence = [
    newsEvidence({
      targetId: 'bitcoin',
      direction: NewsImpactDirection.Positive,
      impactType: NewsImpactType.Listing,
      eventGroupId: 'listing-bitcoin',
      publishedAt: '2026-08-03T01:00:00.000Z',
    }),
    newsEvidence({
      targetId: 'ethereum',
      direction: NewsImpactDirection.Negative,
      impactType: NewsImpactType.Security,
      eventGroupId: 'security-ethereum',
      sourceRecordIds: [],
      publishedAt: '2026-08-03T04:00:00.000Z',
    }),
    newsEvidence({
      targetId: 'solana',
      direction: NewsImpactDirection.Mixed,
      impactType: NewsImpactType.Partnership,
      eventGroupId: 'partnership-solana',
      publishedAt: '2026-08-03T03:00:00.000Z',
    }),
    newsEvidence({
      targetId: 'aave',
      direction: NewsImpactDirection.Neutral,
      impactType: NewsImpactType.Governance,
      eventGroupId: 'governance-aave',
      publishedAt: '2026-08-03T02:00:00.000Z',
    }),
    newsEvidence({
      targetId: 'uniswap',
      direction: NewsImpactDirection.Unknown,
      impactType: NewsImpactType.Liquidity,
      eventGroupId: 'liquidity-uniswap',
      publishedAt: '2026-08-03T05:00:00.000Z',
    }),
  ];
  const briefAssembler = new MorningMeetingNewsBriefAssembler();
  const brief = briefAssembler.assemble([...sourceEvidence, sourceEvidence[0]]);
  const selected = new MorningMeetingNewsBriefSelector().select(brief, {
    asOf,
    policy: {
      maxItems: 3,
      maxItemsPerTarget: 1,
      rules: [
        {
          id: 'security-critical',
          impactTypes: [NewsImpactType.Security],
          priority: MorningMeetingNewsPriority.Critical,
        },
        {
          id: 'listing-high',
          impactTypes: [NewsImpactType.Listing],
          priority: MorningMeetingNewsPriority.High,
        },
      ],
    },
  });
  const input = new MorningMeetingNewsNarrationInputAssembler().assemble(selected);
  const beforeBrief = JSON.stringify(brief);
  const beforeSelected = JSON.stringify(selected);
  const analyticalState = {
    bias: 'neutral',
    riskLevel: 'moderate',
    snapshot: { marketId: 'bitcoin-usd', lastPrice: 100 },
    indicators: [{ indicator: 'ema' }],
    signals: [{ id: 'signal-1' }],
  };
  const beforeAnalyticalState = JSON.stringify(analyticalState);
  const narrator = {
    narrate: async (narrationInput) => ({
      items: [...narrationInput.items].reverse().map((item) => ({
        briefItemId: item.briefItemId,
        targetKind: item.targetKind,
        targetId: item.targetId,
        text: `Presentation for ${item.briefItemId}`,
        evidence: item.evidence,
      })),
    }),
  };
  const output = await narrator.narrate(input);
  const normalizedOutput = new MorningMeetingNewsNarrationValidator().normalizeOutput(
    input,
    output,
  );

  assert.equal(brief.items.length, 5);
  assert.deepEqual(
    [...new Set(brief.items.map((item) => item.direction))].sort(),
    [
      NewsImpactDirection.Mixed,
      NewsImpactDirection.Negative,
      NewsImpactDirection.Neutral,
      NewsImpactDirection.Positive,
      NewsImpactDirection.Unknown,
    ].sort(),
  );
  assert.equal(selected.items.length, 3);
  assert.equal(
    new Set(selected.items.map((item) => `${item.targetKind}:${item.targetId}`)).size,
    3,
  );
  assert.equal(
    selected.items.filter((item) => item.eventGroupIds.includes('listing-bitcoin')).length,
    1,
  );
  assert.deepEqual(
    normalizedOutput.items.map((item) => item.briefItemId),
    input.items.map((item) => item.briefItemId),
  );
  assert.equal(JSON.stringify(brief), beforeBrief);
  assert.equal(JSON.stringify(selected), beforeSelected);
  assert.equal(JSON.stringify(analyticalState), beforeAnalyticalState);
});

test('keeps empty selected output distinct from absent narration and accepts an empty narrator result', async () => {
  const brief = new MorningMeetingNewsBriefAssembler().assemble([]);
  const selected = new MorningMeetingNewsBriefSelector().select(brief, {
    asOf,
    policy: { maxItems: 0 },
  });
  const input = new MorningMeetingNewsNarrationInputAssembler().assemble(selected);
  const narrator = { narrate: async () => ({ items: [] }) };
  const output = await narrator.narrate(input);

  assert.deepEqual(input, { items: [] });
  assert.deepEqual(new MorningMeetingNewsNarrationValidator().normalizeOutput(input, output), {
    items: [],
  });
});
