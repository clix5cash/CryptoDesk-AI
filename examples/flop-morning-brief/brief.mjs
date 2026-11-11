import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const gateway = 'https://api.flop.network/v1';
const symbols = ['BTC', 'ETH', 'SOL'];
const metrics = ['priceUsd', 'openInterestUsd', 'fundingRate'];
const views = ['positive funding', 'negative funding', 'flat funding', 'funding unavailable'];

function fundingView(rate) {
  if (rate === null) return views[3];
  if (rate > 0) return views[0];
  if (rate < 0) return views[1];
  return views[2];
}

export function validateSnapshot(snapshot) {
  if (!Number.isFinite(Date.parse(snapshot?.asOf)) || !Array.isArray(snapshot?.assets)) {
    throw new Error('Expected a dated snapshot with an assets array.');
  }
  if (snapshot.assets.length !== symbols.length) {
    throw new Error('Expected one row each for BTC, ETH and SOL.');
  }
  return {
    asOf: new Date(snapshot.asOf).toISOString(),
    assets: symbols.map((symbol) => {
      const rows = snapshot.assets.filter((row) => row?.symbol === symbol);
      if (rows.length !== 1) throw new Error(`Expected exactly one row for ${symbol}.`);
      const row = { symbol };
      for (const metric of metrics) {
        const value = rows[0][metric] ?? null;
        if (value !== null && (!Number.isFinite(value) || (metric !== 'fundingRate' && value < 0))) {
          throw new Error(`Invalid ${metric} for ${symbol}.`);
        }
        row[metric] = value;
      }
      return row;
    }),
  };
}

export async function runBrief(snapshot, { apiKey, model, fetchImpl = fetch }) {
  const input = validateSnapshot(snapshot);
  if (!apiKey || !model) throw new Error('Set FLOP_API_KEY and FLOP_MODEL before running.');
  const start = performance.now();
  const response = await fetchImpl(`${gateway}/chat/completions`, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: [
            'Return only JSON with an assets array. Each row must have symbol and fundingView.',
            'Return BTC, ETH and SOL in that order, once each.',
            `Classify fundingRate by sign (or null) using these exact labels: ${views.join(', ')}.`,
          ].join(' '),
        },
        { role: 'user', content: JSON.stringify(input) },
      ],
    }),
  });
  if (!response.ok) throw new Error(`FLOP gateway returned HTTP ${response.status}.`);
  const completion = await response.json();
  const content = completion?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('FLOP response has no message content.');
  const result = JSON.parse(content);
  if (!Array.isArray(result?.assets) || result.assets.length !== symbols.length) {
    throw new Error('FLOP returned an invalid assets array.');
  }
  const assets = input.assets.map((asset, index) => {
    const finding = result.assets[index];
    if (finding?.symbol !== asset.symbol || finding.fundingView !== fundingView(asset.fundingRate)) {
      throw new Error(`FLOP finding does not match source funding data for ${asset.symbol}.`);
    }
    return {
      ...asset,
      fundingView: finding.fundingView,
      missing: metrics.filter((metric) => asset[metric] === null),
    };
  });
  return {
    asOf: input.asOf,
    assets,
    gateway: {
      model,
      completionId: typeof completion.id === 'string' ? completion.id : null,
      latencyMs: Math.round(performance.now() - start),
      settlement: 'unverified',
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const file = process.argv[2];
    if (!file) throw new Error('Usage: node brief.mjs <snapshot.json>');
    const snapshot = JSON.parse(await readFile(file, 'utf8'));
    const result = await runBrief(snapshot, {
      apiKey: process.env.FLOP_API_KEY,
      model: process.env.FLOP_MODEL,
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof SyntaxError ? 'Invalid JSON in snapshot or gateway response.' : error.message);
    process.exitCode = 1;
  }
}
