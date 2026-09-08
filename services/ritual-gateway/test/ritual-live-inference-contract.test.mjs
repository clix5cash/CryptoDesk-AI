import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  AiExecutionStatus,
  PortfolioAiRawExecutionAuthority,
  PortfolioAiTask,
  buildPortfolioAiContext,
  createPortfolioAiMessagePlan,
  createPortfolioAiModelInput,
  createPortfolioAiPromptDocument,
  createPortfolioAiProviderRequest,
  mapPortfolioAiProviderRequest,
  validatePortfolioAiModelExecutionResult,
} from '@cryptodesk-ai/ai';
import { createRitualLiveInferenceContract } from '../dist/index.js';

function descriptor(model = { providerId: 'ritual', modelId: 'explicit-model' }) {
  const sectionId = JSON.stringify(['portfolio', 'overview']);
  const context = buildPortfolioAiContext({
    analysisId: 'analysis',
    task: PortfolioAiTask.Interpret,
    payload: {
      schemaVersion: '1',
      portfolioId: 'portfolio',
      capturedAt: '2026-09-08T00:00:00.000Z',
      asOf: '2026-09-08T00:00:00.000Z',
      currency: 'USD',
      totalValuedValue: '900719925474099312345678.123456789',
      coverage: {
        state: 'complete',
        valuation: {
          totalPositionCount: 0,
          valuedPositionCount: 0,
          unvaluedPositionCount: 0,
          valuedPositionCoveragePercentage: '100',
          unvaluedReasons: [],
        },
      },
      items: [],
      sections: [{ id: sectionId, section: 'overview', itemIds: [] }],
    },
  });
  const input = createPortfolioAiModelInput({
    task: PortfolioAiTask.Interpret,
    context,
    factIds: [],
    sectionIds: [sectionId],
  });
  return mapPortfolioAiProviderRequest(
    createPortfolioAiProviderRequest({
      executionId: 'execution-1',
      model,
      promptDocument: createPortfolioAiPromptDocument(createPortfolioAiMessagePlan(input)),
    }),
  );
}

function mappingRequest(overrides = {}) {
  return {
    inferenceRequestId: 'inference-request-1',
    targetId: 'explicit-target',
    descriptor: descriptor(),
    ...overrides,
  };
}

function completed(operation, overrides = {}) {
  return {
    status: 'completed',
    inferenceRequestId: operation.inferenceRequestId,
    executionId: operation.executionId,
    providerId: operation.providerId,
    ...(operation.modelId === undefined ? {} : { modelId: operation.modelId }),
    targetId: operation.targetId,
    output: 'opaque-untrusted-output',
    ...overrides,
  };
}

test('maps exact provider-neutral identity into a detached gateway operation without execution', () => {
  const source = mappingRequest();
  const before = structuredClone(source);
  const contract = createRitualLiveInferenceContract({
    providerId: 'ritual',
    targetId: 'explicit-target',
  });
  const operation = contract.mapRequest(source);
  source.inferenceRequestId = 'mutated';
  source.descriptor.executionId = 'mutated';

  assert.deepEqual(operation, {
    inferenceRequestId: 'inference-request-1',
    executionId: 'execution-1',
    providerId: 'ritual',
    modelId: 'explicit-model',
    targetId: 'explicit-target',
    payload: JSON.stringify(before.descriptor.request.promptDocument),
  });
  assert.deepEqual(before, mappingRequest());
});

test('maps only a closed matching completed result to untrusted provider-neutral output', () => {
  const source = mappingRequest();
  const contract = createRitualLiveInferenceContract({
    providerId: 'ritual',
    targetId: 'explicit-target',
  });
  const operation = contract.mapRequest(source);
  const result = contract.mapCompletedResult(operation, completed(operation));
  assert.deepEqual(result, {
    executionId: 'execution-1',
    status: AiExecutionStatus.Completed,
    authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
    output: 'opaque-untrusted-output',
    model: { providerId: 'ritual', modelId: 'explicit-model' },
  });
  validatePortfolioAiModelExecutionResult(
    {
      executionId: source.descriptor.executionId,
      context: source.descriptor.request.promptDocument.plan.input.context,
      model: source.descriptor.model,
    },
    result,
  );
});

test('fails closed for invalid, substituted, unknown-field, and prototype-shaped mapping data', () => {
  for (const configuration of [
    {},
    { providerId: 'other', targetId: 'explicit-target' },
    { providerId: 'ritual', targetId: '' },
    { providerId: 'ritual', targetId: 'explicit-target', extra: true },
    Object.assign(Object.create({ providerId: 'ritual' }), { targetId: 'explicit-target' }),
  ]) {
    assert.throws(
      () => createRitualLiveInferenceContract(configuration),
      /configuration is invalid/u,
    );
  }
  const contract = createRitualLiveInferenceContract({
    providerId: 'ritual',
    targetId: 'explicit-target',
  });
  for (const value of [
    {},
    mappingRequest({ inferenceRequestId: '' }),
    mappingRequest({ targetId: 'substituted' }),
    mappingRequest({ descriptor: descriptor({ providerId: 'other' }) }),
    { ...mappingRequest(), extra: true },
    Object.assign(Object.create({ inferenceRequestId: 'inherited' }), mappingRequest()),
  ]) {
    assert.throws(() => contract.mapRequest(value), /mapping/u);
  }

  const operation = contract.mapRequest(mappingRequest());
  for (const value of [
    {},
    completed(operation, { executionId: 'substituted' }),
    completed(operation, { providerId: 'other' }),
    completed(operation, { modelId: 'other' }),
    completed(operation, { targetId: 'other' }),
    completed(operation, { inferenceRequestId: 'other' }),
    completed(operation, { output: '' }),
    { ...completed(operation), extra: 'provider-secret' },
    Object.assign(Object.create({ status: 'completed' }), completed(operation)),
  ]) {
    assert.throws(() => contract.mapCompletedResult(operation, value), /result/u);
  }
});

test('keeps calls and instances isolated and returned mappings detached', async () => {
  const first = createRitualLiveInferenceContract({
    providerId: 'ritual',
    targetId: 'explicit-target',
  });
  const second = createRitualLiveInferenceContract({
    providerId: 'ritual',
    targetId: 'second-target',
  });
  const [firstA, firstB, secondOperation] = await Promise.all([
    Promise.resolve(first.mapRequest(mappingRequest({ inferenceRequestId: 'first-a' }))),
    Promise.resolve(first.mapRequest(mappingRequest({ inferenceRequestId: 'first-b' }))),
    Promise.resolve(
      second.mapRequest(
        mappingRequest({ inferenceRequestId: 'second', targetId: 'second-target' }),
      ),
    ),
  ]);
  const mappedA = first.mapCompletedResult(firstA, completed(firstA));
  mappedA.output = 'mutated';
  assert.equal(
    first.mapCompletedResult(firstB, completed(firstB)).output,
    'opaque-untrusted-output',
  );
  assert.equal(secondOperation.targetId, 'second-target');
});

test('keeps the contract root-contained and free of live protocol and credential machinery', async () => {
  const root = await import('../dist/index.js');
  assert.equal(typeof root.createRitualLiveInferenceContract, 'function');
  await assert.rejects(
    () => import('@cryptodesk-ai/ritual-gateway/ritual-live-inference-contract'),
  );
  const declaration = await readFile(
    new URL('../dist/ritual-live-inference-contract.d.ts', import.meta.url),
    'utf8',
  );
  const contractText = declaration.replace(/\/\*[\s\S]*?\*\//gu, '');
  assert.equal(
    /privateKey|mnemonic|credential|wallet|endpoint|header|receipt|transactionHash/u.test(
      contractText,
    ),
    false,
  );
  assert.equal(
    /precompile|abi|selector|sendRawTransaction|poll|retry|fallback|routing/u.test(contractText),
    false,
  );
});
