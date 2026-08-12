/** Explicit validation failure at the non-authoritative AI interpretation boundary. */
export class AiBoundaryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiBoundaryValidationError';
  }
}
