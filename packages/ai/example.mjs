import {
  PortfolioAiCandidateInterpretationAuthority,
  PortfolioAiRawExecutionAuthority,
  PortfolioAiResultAuthority,
  validatePortfolioAiModelExecutionResult,
} from '@cryptodesk-ai/ai';
try {
  validatePortfolioAiModelExecutionResult({}, {});
} catch (error) {
  console.log('AI boundary rejected an incomplete execution:', error.name);
}
console.log('AI Interpretation example (local contract demonstration)');
console.log('1. model execution:', PortfolioAiRawExecutionAuthority.UntrustedModelExecution);
console.log(
  '2. candidate interpretation:',
  PortfolioAiCandidateInterpretationAuthority.UntrustedCandidateInterpretation,
);
console.log(
  '3. accepted interpretation:',
  PortfolioAiResultAuthority.NonAuthoritativeInterpretation,
);
console.log('No model, credentials, recommendations, or canonical state are used.');
