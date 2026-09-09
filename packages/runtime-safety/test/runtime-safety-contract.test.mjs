import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  AutonomousActionAuthorizationState,
  AutonomousActionCandidateAuthority,
  AutonomousActionKind,
  createAutonomousRuntimeSafetyContract,
} from '../dist/index.js';

function configuration(overrides = {}) {
  return {
    policy: { policyId: 'policy-1', authorityId: 'operator-1' },
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    executionId: 'execution-1',
    actionId: 'action-1',
    actionKind: AutonomousActionKind.PrepareOperatorReview,
    targetId: 'review-target-1',
    policy: { policyId: 'policy-1', authorityId: 'operator-1' },
    origin: { interpretationId: 'interpretation-1', candidateId: 'candidate-1' },
    ...overrides,
  };
}

test('constructs a deterministic detached and explicitly non-authorized candidate', () => {
  const contract = createAutonomousRuntimeSafetyContract(configuration());
  const source = input();
  const before = structuredClone(source);
  const first = contract.createCandidate(source);
  const second = contract.createCandidate(input());

  assert.deepEqual(first, second);
  assert.deepEqual(source, before);
  assert.equal(first.candidateAuthority, AutonomousActionCandidateAuthority.CandidateOnly);
  assert.equal(first.authorizationState, AutonomousActionAuthorizationState.NotAuthorized);
  assert.equal(first.executable, false);
});

test('fails closed for unknown, missing, empty, unsupported, and conflicting input', () => {
  const contract = createAutonomousRuntimeSafetyContract(configuration());
  for (const invalid of [
    { ...input(), extra: true },
    { ...input(), executionId: '' },
    { ...input(), actionId: '' },
    { ...input(), targetId: '' },
    { ...input(), actionKind: 'broadcast_transaction' },
    { ...input(), policy: { policyId: 'other', authorityId: 'operator-1' } },
    { ...input(), origin: { interpretationId: '', candidateId: 'candidate-1' } },
  ]) {
    assert.throws(() => contract.createCandidate(invalid), {
      name: 'TypeError',
      message: 'Autonomous runtime safety contract input is invalid.',
    });
  }
});

test('rejects prototype-shaped and inherited configuration, policy, origin, and input', () => {
  assert.throws(
    () => createAutonomousRuntimeSafetyContract(Object.assign(Object.create({}), configuration())),
    /invalid/,
  );
  const contract = createAutonomousRuntimeSafetyContract(configuration());
  for (const invalid of [
    Object.assign(Object.create({ inherited: true }), input()),
    { ...input(), policy: Object.assign(Object.create({}), input().policy) },
    { ...input(), origin: Object.assign(Object.create({}), input().origin) },
  ]) {
    assert.throws(() => contract.createCandidate(invalid), /invalid/);
  }
});

test('snapshots configuration and isolates mutation, repeated calls, and instances', () => {
  const config = configuration();
  const firstContract = createAutonomousRuntimeSafetyContract(config);
  config.policy.policyId = 'mutated';
  const first = firstContract.createCandidate(input());
  first.policy.policyId = 'local-only';
  first.origin.candidateId = 'local-only';

  assert.equal(firstContract.createCandidate(input()).policy.policyId, 'policy-1');
  const secondContract = createAutonomousRuntimeSafetyContract({
    policy: { policyId: 'policy-2', authorityId: 'operator-2' },
  });
  assert.equal(
    secondContract.createCandidate(
      input({ policy: { policyId: 'policy-2', authorityId: 'operator-2' } }),
    ).policy.policyId,
    'policy-2',
  );
});

test('keeps concurrent-style calls independent and recovers after invalid input', async () => {
  const contract = createAutonomousRuntimeSafetyContract(configuration());
  assert.throws(() => contract.createCandidate(input({ actionId: '' })), /invalid/);
  const [first, second] = await Promise.all([
    Promise.resolve(contract.createCandidate(input())),
    Promise.resolve(contract.createCandidate(input({ actionId: 'action-2' }))),
  ]);
  first.actionId = 'local-only';
  assert.equal(second.actionId, 'action-2');
  assert.equal(contract.createCandidate(input()).actionId, 'action-1');
});

test('keeps the public surface root-only and free of executable or secret capability', async () => {
  const declaration = await readFile(new URL('../dist/index.d.ts', import.meta.url), 'utf8');
  const implementation = await readFile(
    new URL('../dist/runtime-safety-contract.js', import.meta.url),
    'utf8',
  );
  assert.equal(
    /privateKey|mnemonic|wallet|credential|signedTransaction|callback|shell|process\.env/iu.test(
      declaration,
    ),
    false,
  );
  assert.equal(
    /execute\s*\(|authorize\s*\(|process\.env|setTimeout|fetch\s*\(/u.test(implementation),
    false,
  );
  await assert.rejects(
    import('@cryptodesk-ai/runtime-safety/runtime-safety-contract'),
    /not defined|not exported/,
  );
  assert.equal(typeof createAutonomousRuntimeSafetyContract, 'function');
});
