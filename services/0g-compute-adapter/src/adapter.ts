import type { PortfolioAiModelExecutionResult } from '../../../packages/ai/src/portfolio-model-execution.js';
import type {
  ComputeConfig,
  ExecutionEvidence,
  FinancialPermit,
  InferenceGrant,
  PreparedAttempt,
  RequestManifest,
  SyntheticComputeAdapter,
  TerminalResult,
  VerificationEvidence,
  PortfolioAiProviderRequestDescriptor,
} from './contracts.js';
import { verificationProperties } from './contracts.js';
import { parseBoundedJson } from './bounded-json.js';
import {
  BoundaryError,
  canonical,
  config,
  copy,
  digestValue,
  exact,
  freeze,
  hash,
  id,
  integer,
  record,
  reject,
  sha256,
} from './validation.js';
import {
  consumeArtifact,
  consumeSynthetic,
  consumptionCheckpoint,
  dispatchSynthetic,
  requireClock,
  requireStore,
  requireTransport,
  type SyntheticClock,
  type SyntheticConsumptionStore,
  type SyntheticTransport,
} from './synthetic.js';

interface PreparedPrivate {
  manifestDigest: string;
  descriptor: PortfolioAiProviderRequestDescriptor;
  body: Uint8Array;
}

export function createSyntheticComputeAdapter(input: {
  readonly configuration: ComputeConfig;
  readonly clock: SyntheticClock;
  readonly transport: SyntheticTransport;
  readonly consumption: SyntheticConsumptionStore;
}): SyntheticComputeAdapter {
  try {
    exact(input, ['configuration', 'clock', 'transport', 'consumption']);
  } catch {
    reject('forbidden_capability');
  }
  const runtime = config(input.configuration);
  const { clock, transport, consumption } = input;
  requireClock(clock);
  requireStore(consumption, clock);
  requireTransport(transport, clock);
  const privateAttempts = new WeakMap<PreparedAttempt, PreparedPrivate>();
  const terminalEvidence = new WeakMap<PreparedAttempt, ExecutionEvidence>();
  const configurationDigest = hash(runtime);
  const adapter: SyntheticComputeAdapter = {
    async prepare(descriptor, identity) {
      requireClock(clock);
      identity = copy(identity);
      exact(identity, ['requestId', 'attemptId', 'logicalOperationDigest', 'expiresAt']);
      id(identity.requestId);
      id(identity.attemptId);
      digestValue(identity.logicalOperationDigest);
      integer(identity.expiresAt);
      const text = canonical(
        descriptor,
        runtime.limits.maxRequestBytes,
        runtime.limits.maxJsonDepth,
      );
      const detached = JSON.parse(text) as PortfolioAiProviderRequestDescriptor;
      exact(detached, ['executionId', 'model', 'promptDocumentVersion', 'request', 'blocks']);
      exact(detached.model, ['providerId', 'modelId']);
      exact(detached.request, ['executionId', 'model', 'promptDocument']);
      id(detached.executionId);
      if (detached.model.providerId !== runtime.adapterProviderId) reject('provider_mismatch');
      if (detached.model.modelId !== runtime.modelId) reject('unsupported_model');
      if (
        canonical(detached.request.model) !== canonical(detached.model) ||
        detached.request.executionId !== detached.executionId ||
        detached.promptDocumentVersion !== '1'
      )
        reject('request_invalid');
      record(detached.request.promptDocument);
      if (!Array.isArray(detached.blocks)) reject('request_invalid');
      const now = clock.now();
      if (identity.expiresAt <= now || identity.expiresAt > now + runtime.limits.totalDeadlineMs)
        reject('authorization_expired');
      const wire = canonical(
        {
          model: runtime.modelId,
          messages: [{ role: 'user', content: canonical(detached.request.promptDocument) }],
          max_tokens: runtime.limits.maxOutputTokens,
          stream: false,
          synthetic_binding: {
            provider: runtime.providerAddress,
            mode: runtime.mode,
            endpoint: runtime.endpoint,
            crossProviderFallback: false,
          },
        },
        runtime.limits.maxRequestBytes,
        runtime.limits.maxJsonDepth,
      );
      const body = new TextEncoder().encode(wire);
      const manifest: RequestManifest = freeze({
        schemaVersion: 'zg-design-1',
        requestId: identity.requestId,
        executionId: detached.executionId,
        attemptId: identity.attemptId,
        configDigest: await configurationDigest,
        descriptorDigest: await sha256(text),
        wireBodyDigest: await sha256(body),
        logicalOperationDigest: identity.logicalOperationDigest,
        providerAddress: runtime.providerAddress,
        modelId: runtime.modelId,
        createdAt: now,
        expiresAt: identity.expiresAt,
        limitsDigest: await hash(runtime.limits),
        verificationPolicyDigest: await hash(runtime.verificationPolicy),
      });
      const prepared = freeze({ manifest, manifestDigest: await hash(manifest) });
      privateAttempts.set(prepared, {
        manifestDigest: prepared.manifestDigest,
        descriptor: freeze(detached),
        body: new Uint8Array(body),
      });
      return prepared;
    },
    async run(prepared, grantInput, financialInput) {
      const known = privateAttempts.get(prepared);
      let grant: InferenceGrant | undefined;
      let financial: FinancialPermit | undefined;
      try {
        grant = copy(grantInput);
        financial = copy(financialInput);
      } catch {
        /* Sanitized below. */
      }
      // No caller strings appear in evidence before their identity is validated.
      const evidence: { -readonly [K in keyof ExecutionEvidence]: ExecutionEvidence[K] } = {
        evidenceId: 'synthetic:rejected',
        manifestDigest: known?.manifestDigest ?? '0'.repeat(64),
        authorizationId: 'rejected',
        attemptId: known ? prepared.manifest.attemptId : 'rejected',
        configDigest: await configurationDigest,
        dispatchCount: 0,
        remoteAttemptGuarantee: 'not_established',
        financialEnforcement: 'not_established',
        provenance: 'synthetic',
        remoteOutcome: 'not_dispatched',
        terminalAt: clock.now(),
      };
      let unwatch = () => {};
      let terminal = false;
      const deadline = known ? prepared.manifest.expiresAt : clock.now();
      const controller = new AbortController();
      const fail = (code: import('./contracts.js').FailureCode): TerminalResult =>
        freeze({
          status: 'failed',
          code,
          evidence: freeze({ ...evidence, terminalAt: clock.now() }),
        });
      try {
        requireClock(clock);
        if (!known) reject('request_invalid');
        const manifest = prepared.manifest;
        if ((await sha256(known.body)) !== manifest.wireBodyDigest) reject('request_invalid');
        if (!grant || !financial) reject('request_invalid');
        exact(grant, [
          'authorizationId',
          'ownerApprovalRef',
          'manifestDigest',
          'financialPermitDigest',
          'credentialGeneration',
          'issuedAt',
          'expiresAt',
          'maximumDispatches',
        ]);
        id(grant.authorizationId);
        id(grant.ownerApprovalRef);
        digestValue(grant.financialPermitDigest);
        integer(grant.issuedAt);
        integer(grant.expiresAt);
        if (
          grant.manifestDigest !== known.manifestDigest ||
          grant.maximumDispatches !== 1 ||
          grant.issuedAt > clock.now() ||
          grant.issuedAt < manifest.createdAt ||
          grant.expiresAt > manifest.expiresAt
        )
          reject('authorization_invalid');
        if (grant.expiresAt <= clock.now() || deadline <= clock.now())
          reject('authorization_expired');
        if (
          grant.credentialGeneration !== runtime.credential.generation ||
          runtime.credential.expiresAt <= clock.now()
        )
          reject('credential_invalid');
        evidence.authorizationId = grant.authorizationId;
        try {
          exact(financial, [
            'permitId',
            'manifestDigest',
            'fundingApprovalRef',
            'accountScopeRef',
            'currency',
            'maxTotalExposureAtomic',
            'enforcementEvidenceRef',
            'expiresAt',
            'replenishmentAllowed',
            'inferenceCanManageAccount',
            'provenance',
          ]);
          for (const k of [
            'permitId',
            'fundingApprovalRef',
            'accountScopeRef',
            'enforcementEvidenceRef',
          ] as const)
            id(financial[k]);
          integer(financial.expiresAt);
          if (
            financial.provenance !== 'synthetic' ||
            financial.manifestDigest !== known.manifestDigest ||
            !['0g', 'usd'].includes(financial.currency) ||
            typeof financial.maxTotalExposureAtomic !== 'string' ||
            !/^[1-9][0-9]{0,77}$/.test(financial.maxTotalExposureAtomic) ||
            !financial.enforcementEvidenceRef.startsWith('synthetic:') ||
            financial.expiresAt <= clock.now() ||
            financial.replenishmentAllowed !== false ||
            financial.inferenceCanManageAccount !== false ||
            (await hash(financial)) !== grant.financialPermitDigest
          )
            reject('financial_policy_unsatisfied');
        } catch {
          reject('financial_policy_unsatisfied');
        }
        // Async digest work can span a synthetic clock advance. Recheck before consuming.
        if (
          clock.now() >=
          Math.min(deadline, grant.expiresAt, financial.expiresAt, runtime.credential.expiresAt)
        )
          reject('authorization_expired');
        evidence.consumption = consumeSynthetic(
          consumption,
          manifest,
          known.manifestDigest,
          grant.authorizationId,
        );
        consumptionCheckpoint(consumption);
        evidence.evidenceId = `synthetic:${manifest.attemptId}`;
        const effectiveDeadline = Math.min(
          deadline,
          grant.expiresAt,
          financial.expiresAt,
          runtime.credential.expiresAt,
        );
        const operation = async (): Promise<TerminalResult> => {
          evidence.dispatchCount = 1;
          evidence.remoteOutcome = 'unknown';
          const response = await dispatchSynthetic(transport);
          if (terminal || clock.now() >= effectiveDeadline) reject('deadline_exceeded');
          exact(response, ['status', 'headers', 'body']);
          integer(response.status, 100, 599);
          record(response.headers);
          if (
            new TextEncoder().encode(canonical(response.headers)).length >
            runtime.limits.maxHeaderBytes
          )
            reject('response_limit_exceeded');
          evidence.httpStatus = response.status;
          if (!(response.body instanceof Uint8Array)) reject('response_malformed');
          const bytes = new Uint8Array(response.body);
          if (bytes.byteLength > runtime.limits.maxResponseBytes) reject('response_limit_exceeded');
          evidence.receivedBodyDigest = await sha256(bytes);
          if (terminal || clock.now() >= effectiveDeadline) reject('deadline_exceeded');
          evidence.remoteOutcome = 'response_received';
          if (response.status === 429) {
            const retry = response.headers['retry-after'];
            if (typeof retry === 'string' && /^\d{1,6}$/.test(retry))
              evidence.retryAfterMs = Number(retry) * 1000;
            reject('rate_limited');
          }
          if (response.status === 401 || response.status === 403) reject('remote_auth_failed');
          if (response.status === 402) reject('remote_payment_failed');
          if (response.status >= 300 && response.status < 500) reject('remote_rejected');
          if (response.status !== 200) reject('remote_error_unknown');
          let data: Record<string, unknown>;
          try {
            const parsed = parseBoundedJson(
              bytes,
              runtime.limits.maxResponseBytes,
              runtime.limits.maxJsonDepth,
            );
            record(parsed);
            data = parsed;
            const expected = [
              'providerAddress',
              'modelId',
              'output',
              'outputTokens',
              'completed',
              ...(Object.hasOwn(data, 'verification') ? ['verification'] : []),
            ];
            exact(data, expected);
            if (typeof data.output !== 'string' || !data.output.trim() || data.completed !== true)
              reject('response_malformed');
            integer(data.outputTokens, 0);
          } catch (e) {
            if (e instanceof BoundaryError && e.code === 'response_limit_exceeded') throw e;
            reject('response_malformed');
          }
          if (data.providerAddress !== runtime.providerAddress) reject('provider_mismatch');
          if (data.modelId !== runtime.modelId) reject('model_mismatch');
          const output = data.output as string;
          if (
            new TextEncoder().encode(output).length > runtime.limits.maxOutputBytes ||
            (data.outputTokens as number) > runtime.limits.maxOutputTokens
          )
            reject('response_limit_exceeded');
          const outputDigest = await sha256(output);
          if (terminal || clock.now() >= effectiveDeadline) reject('deadline_exceeded');
          await verify(
            data.verification,
            runtime,
            manifest,
            known.manifestDigest,
            outputDigest,
            clock,
            consumption,
          );
          if (terminal || clock.now() >= effectiveDeadline) reject('deadline_exceeded');
          if (data.verification !== undefined)
            evidence.verification = freeze(copy(data.verification as VerificationEvidence));
          evidence.normalizedOutputDigest = outputDigest;
          evidence.remoteOutcome = 'completion_evidenced';
          return freeze({
            status: 'completed',
            authority: 'untrusted_model_execution',
            output,
            evidence: freeze({ ...evidence, terminalAt: clock.now() }),
          });
        };
        const timeout = new Promise<TerminalResult>((resolve) => {
          unwatch = clock.at(effectiveDeadline, () => {
            terminal = true;
            controller.abort();
            resolve(fail('deadline_exceeded'));
          });
        });
        const result = await Promise.race([
          operation().catch((e) => fail(e instanceof BoundaryError ? e.code : 'transport_failed')),
          timeout,
        ]);
        terminal = true;
        if (!terminalEvidence.has(prepared)) terminalEvidence.set(prepared, result.evidence);
        return result;
      } catch (e) {
        terminal = true;
        const result = fail(e instanceof BoundaryError ? e.code : 'request_invalid');
        if (known && evidence.consumption && !terminalEvidence.has(prepared))
          terminalEvidence.set(prepared, result.evidence);
        return result;
      } finally {
        unwatch();
        controller.abort();
      }
    },
    evidence(prepared) {
      return terminalEvidence.get(prepared);
    },
    bind(prepared, grant, financial) {
      const known = privateAttempts.get(prepared);
      if (!known) reject('request_invalid');
      const detachedGrant = freeze(copy(grant));
      const detachedFinancial = freeze(copy(financial));
      return Object.freeze({
        providerId: runtime.adapterProviderId,
        supportedModels: Object.freeze([runtime.modelId]),
        async execute(): Promise<PortfolioAiModelExecutionResult> {
          reject('request_invalid');
        },
        async executeProviderRequest(
          descriptor: PortfolioAiProviderRequestDescriptor,
        ): Promise<PortfolioAiModelExecutionResult> {
          if (
            canonical(descriptor, runtime.limits.maxRequestBytes, runtime.limits.maxJsonDepth) !==
            canonical(known.descriptor)
          )
            reject('request_invalid');
          const result = await adapter.run(prepared, detachedGrant, detachedFinancial);
          return freeze({
            executionId: prepared.manifest.executionId,
            model: { providerId: runtime.adapterProviderId, modelId: runtime.modelId },
            authority: 'untrusted_model_execution',
            status: result.status,
            ...(result.status === 'completed'
              ? { output: result.output }
              : { failure: { code: result.code, message: 'Synthetic compute execution failed.' } }),
          }) as PortfolioAiModelExecutionResult;
        },
      });
    },
  };
  return Object.freeze(adapter);
}

async function verify(
  value: unknown,
  runtime: ComputeConfig,
  manifest: RequestManifest,
  manifestDigest: string,
  outputDigest: string,
  clock: SyntheticClock,
  store: SyntheticConsumptionStore,
): Promise<void> {
  const policy = runtime.verificationPolicy;
  if (value === undefined) {
    if (policy.required.length) reject('verification_missing');
    return;
  }
  try {
    exact(value, [
      'policyDigest',
      'checks',
      'provenance',
      'verifierRevision',
      'artifactDigest',
      'signerRef',
      'issuedAt',
      'challengeDigest',
      'receivedContentDigest',
      'requestDigest',
      'modelId',
      'providerAddress',
      'measurementPolicyDigest',
    ]);
    exact(value.checks, verificationProperties);
    for (const v of Object.values(value.checks))
      if (!['passed', 'failed', 'missing', 'unsupported', 'not_checked'].includes(v as string))
        reject('verification_invalid');
    if (value.provenance !== 'synthetic') reject('verification_invalid');
    for (const k of [
      'policyDigest',
      'artifactDigest',
      'challengeDigest',
      'receivedContentDigest',
      'requestDigest',
      'measurementPolicyDigest',
    ])
      digestValue(value[k]);
    id(value.signerRef);
    integer(value.issuedAt);
    if (
      value.policyDigest !== manifest.verificationPolicyDigest ||
      value.verifierRevision !== policy.verifierRevision ||
      value.receivedContentDigest !== outputDigest ||
      value.requestDigest !== manifest.wireBodyDigest ||
      value.challengeDigest !== manifestDigest ||
      value.modelId !== runtime.modelId ||
      value.providerAddress !== runtime.providerAddress ||
      value.measurementPolicyDigest !== policy.acceptedMeasurementPolicyDigest
    )
      reject('verification_mismatch');
    if (
      value.issuedAt < manifest.createdAt ||
      value.issuedAt > clock.now() ||
      clock.now() - value.issuedAt > policy.maxEvidenceAgeMs
    )
      reject('verification_stale');
    for (const property of policy.required) {
      const state = value.checks[property];
      if (state === 'unsupported') reject('verification_unsupported');
      if (state === 'missing' || state === 'not_checked') reject('verification_missing');
      if (state !== 'passed') reject('verification_invalid');
    }
    consumeArtifact(store, value.artifactDigest as string, value.challengeDigest as string);
  } catch (e) {
    if (e instanceof BoundaryError && e.code.startsWith('verification_')) throw e;
    reject('verification_invalid');
  }
}
