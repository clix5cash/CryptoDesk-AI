import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCommunityFeedback,
  FeedbackCategory,
  FeedbackReviewState,
  FeedbackSourceKind,
  feedbackCategories,
} from '@cryptodesk-ai/community-feedback';

const base = {
  id: 'feedback-1',
  title: 'Example',
  summary: 'Synthetic advisory input',
  sourceKind: FeedbackSourceKind.GithubIssue,
  sourceReference: 'https://github.com/clix5cash/CryptoDesk-AI/issues/1',
  observedAt: '2026-01-01T00:00:00.000Z',
};
for (const category of feedbackCategories()) {
  test(`accepts explicit ${category} feedback`, () => {
    const result = createCommunityFeedback({ ...base, category });
    assert.equal(result.category, category);
    assert.equal(result.reviewState, FeedbackReviewState.Unreviewed);
  });
}
test('preserves bounded evidence and returns an immutable detached record', () => {
  const result = createCommunityFeedback({
    ...base,
    category: FeedbackCategory.Bug,
    expectedBehavior: 'A stable result',
    observedBehavior: 'A different result',
    reproduction: 'Use synthetic input',
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(result.expectedBehavior, 'A stable result');
  assert.throws(() => {
    result.title = 'mutated';
  });
});
test('fails closed for unsupported categories, unsafe references, sensitive text, and malformed input', () => {
  assert.throws(() => createCommunityFeedback({ ...base, category: 'priority' }));
  assert.throws(() =>
    createCommunityFeedback({
      ...base,
      category: FeedbackCategory.Ux,
      sourceReference: 'https://example.com/issue/1',
    }),
  );
  assert.throws(() =>
    createCommunityFeedback({
      ...base,
      category: FeedbackCategory.Bug,
      title: 'sk-1234567890123456',
    }),
  );
  assert.throws(() =>
    createCommunityFeedback({ ...base, category: FeedbackCategory.Bug, observedAt: 'now' }),
  );
  assert.throws(() =>
    createCommunityFeedback({ ...base, category: FeedbackCategory.Bug, unknown: 'field' }),
  );
});
