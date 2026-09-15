import {
  AutonomousActionKind,
  createControlledAutonomousRuntime,
} from '@cryptodesk-ai/runtime-safety';
const runtime = createControlledAutonomousRuntime(
  { policy: { policyId: 'synthetic-policy', authorityId: 'synthetic-operator' } },
  async (identity) => ({ status: 'authorized', ...identity }),
  async (permission) => {
    const { permissionState: _, maximumAttempts: __, ...identity } = permission;
    return { status: 'completed', ...identity, output: 'synthetic operator review prepared' };
  },
);
const result = await runtime.run({
  runtimeOperationId: 'synthetic-runtime-operation',
  candidate: {
    executionId: 'synthetic-execution',
    actionId: 'synthetic-action',
    actionKind: AutonomousActionKind.PrepareOperatorReview,
    targetId: 'synthetic-target',
    policy: { policyId: 'synthetic-policy', authorityId: 'synthetic-operator' },
    origin: { interpretationId: 'synthetic-interpretation', candidateId: 'synthetic-candidate' },
  },
});
console.log('Runtime Safety example (single explicit request)');
console.log(
  'Lifecycle: explicit request → candidate → authorization → one attempt → terminal result',
);
console.log('Result:', result.status, '-', result.output);
console.log('No discovery, retry, loop, scheduler, wallet, trade, or transfer occurred.');
