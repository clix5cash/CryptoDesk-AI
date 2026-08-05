import type { MorningMeetingNewsBrief } from './news-brief.js';
import { MorningMeetingNewsNarrationInputAssembler } from './news-narration-assembler.js';
import type { MorningMeetingNewsNarration, MorningMeetingNewsNarrator } from './news-narration.js';
import { MorningMeetingNewsNarrationValidator } from './news-narration-validator.js';

/** Explicit dependencies for provider-neutral narration presentation orchestration. */
export interface MorningMeetingNewsNarrationServiceDependencies {
  readonly inputAssembler: MorningMeetingNewsNarrationInputAssembler;
  readonly narrator: MorningMeetingNewsNarrator;
  readonly validator: MorningMeetingNewsNarrationValidator;
}

/**
 * Orchestrates a selected brief through an untrusted presentation adapter.
 * It intentionally does not participate in report generation or analysis.
 */
export class DefaultMorningMeetingNewsNarrationService {
  constructor(private readonly dependencies: MorningMeetingNewsNarrationServiceDependencies) {}

  async narrate(brief: MorningMeetingNewsBrief): Promise<MorningMeetingNewsNarration> {
    const input = this.dependencies.inputAssembler.assemble(brief);
    this.dependencies.validator.validateInput(input);

    if (input.items.length === 0) {
      return { items: [] };
    }

    const untrustedOutput = await this.dependencies.narrator.narrate(input);
    return this.dependencies.validator.normalizeOutput(input, untrustedOutput);
  }
}
