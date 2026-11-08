import type { PortfolioAiModelProviderAdapter } from '../../../packages/ai/src/portfolio-model-adapters.js';
import type { PortfolioAiProviderRequestDescriptor } from '../../../packages/ai/src/portfolio-provider-request-descriptor.js';
export type { PortfolioAiProviderRequestDescriptor };

export interface Limits {
  readonly maxRequestBytes: number;
  readonly maxResponseBytes: number;
  readonly maxOutputBytes: number;
  readonly maxOutputTokens: number;
  readonly maxJsonDepth: number;
  readonly maxHeaderBytes: number;
  readonly totalDeadlineMs: number;
}
export const verificationProperties = [
  'providerIdentity',
  'modelIdentity',
  'signatureValidity',
  'receivedContentBinding',
  'requestBinding',
  'freshness',
  'replayProtection',
  'attestationCompleteness',
] as const;
export type VerificationProperty = (typeof verificationProperties)[number];
export interface VerificationPolicy {
  readonly policyId: string;
  readonly version: string;
  readonly required: readonly VerificationProperty[];
  readonly verifierRevision: string;
  readonly maxEvidenceAgeMs: number;
  readonly acceptedMeasurementPolicyDigest: string;
}
interface CommonConfig {
  readonly schemaVersion: 'zg-design-1';
  readonly configId: string;
  readonly adapterProviderId: string;
  readonly providerAddress: string;
  readonly modelId: string;
  readonly network: {
    readonly environment: 'mainnet' | 'testnet';
    readonly chainId: 16661 | 16602;
    readonly approvedNetworkRevision: string;
  };
  readonly endpoint: string;
  readonly credential: {
    readonly credentialRef: string;
    readonly generation: string;
    readonly kind: 'router_inference' | 'direct_provider_inference';
    readonly audienceConfigId: string;
    readonly expiresAt: number;
  };
  readonly limits: Limits;
  readonly verificationPolicy: VerificationPolicy;
  readonly sourceRevision: string;
  readonly streaming: false;
  readonly clientRetries: 0;
  readonly redirects: 'reject';
  readonly automaticFunding: false;
}
export type ComputeConfig = CommonConfig &
  (
    | { readonly mode: 'router'; readonly allowCrossProviderFallback: false }
    | {
        readonly mode: 'direct';
        readonly sdkPackage: '@0gfoundation/0g-compute-ts-sdk';
        readonly sdkVersion: '0.9.0';
        readonly sdkCommit: 'bff29131f953d5b08ad0c40eb805d8e00408df77';
        readonly contractSetDigest: string;
      }
  );
export interface RequestManifest {
  readonly schemaVersion: 'zg-design-1';
  readonly requestId: string;
  readonly executionId: string;
  readonly attemptId: string;
  readonly configDigest: string;
  readonly descriptorDigest: string;
  readonly wireBodyDigest: string;
  readonly logicalOperationDigest: string;
  readonly providerAddress: string;
  readonly modelId: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly limitsDigest: string;
  readonly verificationPolicyDigest: string;
}
export interface FinancialPermit {
  readonly permitId: string;
  readonly manifestDigest: string;
  readonly fundingApprovalRef: string;
  readonly accountScopeRef: string;
  readonly currency: '0g' | 'usd';
  readonly maxTotalExposureAtomic: string;
  readonly enforcementEvidenceRef: string;
  readonly expiresAt: number;
  readonly replenishmentAllowed: false;
  readonly inferenceCanManageAccount: false;
  readonly provenance: 'synthetic';
}
export interface InferenceGrant {
  readonly authorizationId: string;
  readonly ownerApprovalRef: string;
  readonly manifestDigest: string;
  readonly financialPermitDigest: string;
  readonly credentialGeneration: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly maximumDispatches: 1;
}
export interface ConsumptionReceipt {
  readonly authorizationId: string;
  readonly attemptId: string;
  readonly manifestDigest: string;
  readonly receiptId: string;
  readonly dispatchState: 'consumed_before_dispatch';
  readonly durability: 'synthetic_memory_only';
}
export type FailureCode =
  | 'configuration_invalid'
  | 'network_mismatch'
  | 'provider_mismatch'
  | 'model_mismatch'
  | 'unsupported_model'
  | 'request_invalid'
  | 'input_limit_exceeded'
  | 'authorization_invalid'
  | 'authorization_expired'
  | 'authorization_reused'
  | 'duplicate_attempt'
  | 'identity_collision'
  | 'consumption_unavailable'
  | 'credential_invalid'
  | 'forbidden_capability'
  | 'financial_policy_unsatisfied'
  | 'remote_attempts_unestablished'
  | 'deadline_exceeded'
  | 'transport_failed'
  | 'rate_limited'
  | 'remote_auth_failed'
  | 'remote_payment_failed'
  | 'remote_rejected'
  | 'remote_error_unknown'
  | 'response_malformed'
  | 'response_limit_exceeded'
  | 'verification_missing'
  | 'verification_invalid'
  | 'verification_mismatch'
  | 'verification_stale'
  | 'verification_replayed'
  | 'verification_unsupported';
export interface VerificationEvidence {
  readonly policyDigest: string;
  readonly checks: Readonly<
    Record<VerificationProperty, 'passed' | 'failed' | 'missing' | 'unsupported' | 'not_checked'>
  >;
  readonly provenance: 'synthetic';
  readonly verifierRevision: string;
  readonly artifactDigest: string;
  readonly signerRef: string;
  readonly issuedAt: number;
  readonly challengeDigest: string;
  readonly receivedContentDigest: string;
  readonly requestDigest: string;
  readonly modelId: string;
  readonly providerAddress: string;
  readonly measurementPolicyDigest: string;
}
export interface ExecutionEvidence {
  readonly evidenceId: string;
  readonly manifestDigest: string;
  readonly authorizationId: string;
  readonly attemptId: string;
  readonly configDigest: string;
  readonly dispatchCount: 0 | 1;
  readonly remoteAttemptGuarantee: 'not_established';
  readonly financialEnforcement: 'not_established';
  readonly provenance: 'synthetic';
  readonly remoteOutcome:
    'not_dispatched' | 'unknown' | 'response_received' | 'completion_evidenced';
  readonly terminalAt: number;
  readonly receivedBodyDigest?: string;
  readonly normalizedOutputDigest?: string;
  readonly retryAfterMs?: number;
  readonly httpStatus?: number;
  readonly consumption?: ConsumptionReceipt;
  readonly verification?: VerificationEvidence;
}
export type TerminalResult =
  | {
      readonly status: 'completed';
      readonly authority: 'untrusted_model_execution';
      readonly output: string;
      readonly evidence: ExecutionEvidence;
    }
  | { readonly status: 'failed'; readonly code: FailureCode; readonly evidence: ExecutionEvidence };
export interface PreparedAttempt {
  readonly manifest: RequestManifest;
  readonly manifestDigest: string;
}
export interface SyntheticComputeAdapter {
  prepare(
    descriptor: PortfolioAiProviderRequestDescriptor,
    identity: {
      readonly requestId: string;
      readonly attemptId: string;
      readonly logicalOperationDigest: string;
      readonly expiresAt: number;
    },
  ): Promise<PreparedAttempt>;
  run(
    prepared: PreparedAttempt,
    grant: InferenceGrant,
    financial: FinancialPermit,
  ): Promise<TerminalResult>;
  evidence(prepared: PreparedAttempt): ExecutionEvidence | undefined;
  bind(
    prepared: PreparedAttempt,
    grant: InferenceGrant,
    financial: FinancialPermit,
  ): PortfolioAiModelProviderAdapter;
}
