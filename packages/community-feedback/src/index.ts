const MAX_TEXT = 1_000;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const SAFE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SAFE_SOURCE =
  /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(issues|discussions)\/[1-9][0-9]*$/;
const SENSITIVE_VALUE =
  /(sk-[A-Za-z0-9]{16,}|bearer\s+[A-Za-z0-9._-]+|-----BEGIN|mnemonic|seed phrase|private key)/i;
const ABSOLUTE_PATH = /(?:^|\s)(?:\/(?:Users|home|private|var|tmp)|[A-Za-z]:\\)/i;

function invalid(message: string): never {
  throw new TypeError(`Community feedback is invalid: ${message}`);
}

function identifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value))
    invalid(`${field} must be a bounded identifier`);
  return value;
}

function text(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_TEXT ||
    ABSOLUTE_PATH.test(value) ||
    SENSITIVE_VALUE.test(value)
  ) {
    invalid(`${field} must be bounded and safe`);
  }
  return value;
}

function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !SAFE_TIME.test(value) || Number.isNaN(Date.parse(value))) {
    invalid('observedAt must be an explicit UTC timestamp');
  }
  return value;
}

export enum FeedbackCategory {
  Bug = 'bug',
  Ux = 'ux',
  Architecture = 'architecture',
  FeatureRequest = 'feature_request',
}

export enum FeedbackSourceKind {
  GithubIssue = 'github_issue',
  GithubDiscussion = 'github_discussion',
  Other = 'other',
}

export enum FeedbackReviewState {
  Unreviewed = 'unreviewed',
  InReview = 'in_review',
  Reviewed = 'reviewed',
}

export interface CommunityFeedbackInput {
  readonly id: string;
  readonly category: FeedbackCategory;
  readonly title: string;
  readonly summary: string;
  readonly sourceKind: FeedbackSourceKind;
  readonly sourceReference?: string;
  readonly observedAt: string;
  readonly affectedArea?: string;
  readonly expectedBehavior?: string;
  readonly observedBehavior?: string;
  readonly reproduction?: string;
  readonly evidenceReference?: string;
  readonly reviewState?: FeedbackReviewState;
}

export interface CommunityFeedbackRecord extends CommunityFeedbackInput {
  readonly reviewState: FeedbackReviewState;
}

const ALLOWED_KEYS = [
  'id',
  'category',
  'title',
  'summary',
  'sourceKind',
  'sourceReference',
  'observedAt',
  'affectedArea',
  'expectedBehavior',
  'observedBehavior',
  'reproduction',
  'evidenceReference',
  'reviewState',
];

/** Creates a bounded advisory record; classification is caller-supplied, never inferred. */
export function createCommunityFeedback(input: CommunityFeedbackInput): CommunityFeedbackRecord {
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    invalid('record must be an object');
  if (Object.keys(input).some((key) => !ALLOWED_KEYS.includes(key)))
    invalid('record contains unsupported fields');
  if (!Object.values(FeedbackCategory).includes(input.category)) invalid('category is unsupported');
  if (!Object.values(FeedbackSourceKind).includes(input.sourceKind))
    invalid('source kind is unsupported');
  if (
    input.reviewState !== undefined &&
    !Object.values(FeedbackReviewState).includes(input.reviewState)
  )
    invalid('review state is unsupported');
  if (input.sourceReference !== undefined) {
    if (input.sourceKind === FeedbackSourceKind.Other)
      invalid('other sources cannot expose a GitHub reference');
    if (typeof input.sourceReference !== 'string' || !SAFE_SOURCE.test(input.sourceReference))
      invalid('source reference must be a safe GitHub reference');
  }
  return Object.freeze({
    id: identifier(input.id, 'id'),
    category: input.category,
    title: text(input.title, 'title'),
    summary: text(input.summary, 'summary'),
    sourceKind: input.sourceKind,
    ...(input.sourceReference === undefined ? {} : { sourceReference: input.sourceReference }),
    observedAt: timestamp(input.observedAt),
    ...(input.affectedArea === undefined
      ? {}
      : { affectedArea: text(input.affectedArea, 'affectedArea') }),
    ...(input.expectedBehavior === undefined
      ? {}
      : { expectedBehavior: text(input.expectedBehavior, 'expectedBehavior') }),
    ...(input.observedBehavior === undefined
      ? {}
      : { observedBehavior: text(input.observedBehavior, 'observedBehavior') }),
    ...(input.reproduction === undefined
      ? {}
      : { reproduction: text(input.reproduction, 'reproduction') }),
    ...(input.evidenceReference === undefined
      ? {}
      : { evidenceReference: text(input.evidenceReference, 'evidenceReference') }),
    reviewState: input.reviewState ?? FeedbackReviewState.Unreviewed,
  });
}

export function feedbackCategories(): ReadonlyArray<FeedbackCategory> {
  return Object.freeze(Object.values(FeedbackCategory));
}
