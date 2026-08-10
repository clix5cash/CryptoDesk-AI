/** Explicit domain validation failure for immutable portfolio contract data. */
export class PortfolioValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortfolioValidationError';
  }
}
