/** Explicit domain validation failure for immutable portfolio contract data. */
export class PortfolioValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortfolioValidationError';
  }
}

/** Explicit validation failure for provider-neutral Portfolio risk contract data. */
export class PortfolioRiskValidationError extends PortfolioValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'PortfolioRiskValidationError';
  }
}

/** Explicit validation failure for provider-neutral Portfolio insight contract data. */
export class PortfolioInsightValidationError extends PortfolioValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'PortfolioInsightValidationError';
  }
}
