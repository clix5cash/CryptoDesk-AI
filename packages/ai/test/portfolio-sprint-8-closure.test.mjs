import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildPortfolioAiContext,
  createPortfolioAiMessagePlan,
  createPortfolioAiModelInput,
  createPortfolioAiPromptDocument,
  createPortfolioAiProviderExchange,
  createPortfolioAiProviderRequest,
  createPortfolioAiProviderResponse,
  invokePortfolioAiProviderAdapterBridge,
  mapPortfolioAiProviderRequest,
  normalizePortfolioAiProviderResponse,
  validatePortfolioAiNormalizedProviderResponse,
  validatePortfolioAiProviderExchange,
  validatePortfolioAiProviderRequest,
  validatePortfolioAiProviderRequestDescriptor,
  validatePortfolioAiProviderResponse,
} from '../dist/index.js';

const sprint8PublicApis = [
  buildPortfolioAiContext,
  createPortfolioAiModelInput,
  createPortfolioAiMessagePlan,
  createPortfolioAiPromptDocument,
  createPortfolioAiProviderRequest,
  validatePortfolioAiProviderRequest,
  mapPortfolioAiProviderRequest,
  validatePortfolioAiProviderRequestDescriptor,
  invokePortfolioAiProviderAdapterBridge,
  createPortfolioAiProviderResponse,
  validatePortfolioAiProviderResponse,
  normalizePortfolioAiProviderResponse,
  validatePortfolioAiNormalizedProviderResponse,
  createPortfolioAiProviderExchange,
  validatePortfolioAiProviderExchange,
];

const providerBoundaryModules = [
  'portfolio-model-execution.ts',
  'portfolio-model-adapters.ts',
  'portfolio-provider-request.ts',
  'portfolio-provider-request-descriptor.ts',
  'portfolio-provider-adapter-bridge.ts',
  'portfolio-provider-response.ts',
  'portfolio-normalized-provider-response.ts',
  'portfolio-provider-exchange.ts',
];

test('keeps the complete Sprint 8 public boundary additive and available', () => {
  assert.equal(sprint8PublicApis.length, 15);
  for (const api of sprint8PublicApis) {
    assert.equal(typeof api, 'function');
  }
});

test('keeps the Sprint 8 provider boundary provider-neutral, deterministic, and one-way', async () => {
  const aiPackage = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const portfolioPackage = JSON.parse(
    await readFile(new URL('../../portfolio/package.json', import.meta.url), 'utf8'),
  );
  assert.equal(aiPackage.dependencies['@cryptodesk-ai/portfolio'], 'workspace:*');
  assert.equal(portfolioPackage.dependencies?.['@cryptodesk-ai/ai'], undefined);

  const forbiddenRuntime = [
    /from\s+['"]openai['"]/u,
    /from\s+['"]@anthropic-ai\//u,
    /from\s+['"]@google\/generative-ai['"]/u,
    /\bfetch\s*\(/u,
    /\bXMLHttpRequest\b/u,
    /\bprocess\.env\b/u,
    /\bDate\.now\s*\(/u,
    /\bMath\.random\s*\(/u,
    /\brandomUUID\s*\(/u,
  ];
  for (const moduleName of providerBoundaryModules) {
    const source = await readFile(new URL(`../src/${moduleName}`, import.meta.url), 'utf8');
    for (const pattern of forbiddenRuntime) {
      assert.doesNotMatch(source, pattern, `${moduleName} must not introduce ${pattern}`);
    }
  }
});
