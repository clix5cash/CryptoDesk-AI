/** Explicit application error raised when Morning Meeting assembly is invalid. */
export class MorningMeetingReportError extends Error {}

/** Provider-neutral failure while resolving or invoking a narration adapter. */
export class MorningMeetingNarratorProviderError extends MorningMeetingReportError {
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'MorningMeetingNarratorProviderError';
    this.cause = cause;
  }
}
