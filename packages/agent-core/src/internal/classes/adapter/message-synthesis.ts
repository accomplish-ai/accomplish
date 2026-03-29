import type { OpenCodeMessage } from '../../../common/types/opencode.js';

/** Input shape for the start_task tool — used to build synthetic plan messages. */
export interface StartTaskInput {
  original_request: string;
  needs_planning: boolean;
  goal?: string;
  steps?: string[];
  verification?: string[];
  skills: string[];
}

/**
 * Build a synthetic "plan" message from a start_task tool invocation.
 * The message is formatted as markdown with goal, steps, verification, and skills.
 */
export function buildPlanMessage(
  input: StartTaskInput,
  sessionId: string,
  genMessageId: () => string,
): OpenCodeMessage {
  const verificationSection = input.verification?.length
    ? `\n\n**Verification:**\n${input.verification.map((v, i) => `${i + 1}. ${v}`).join('\n')}`
    : '';
  const skillsSection = input.skills?.length ? `\n\n**Skills:** ${input.skills.join(', ')}` : '';
  const goalSection = input.goal ? `**Goal:** ${input.goal}\n\n` : '';
  const stepsSection = input.steps?.length
    ? `**Steps:**\n${input.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
    : '';
  const planText = `**Plan:**\n\n${goalSection}${stepsSection}${verificationSection}${skillsSection}`;

  return {
    type: 'text',
    timestamp: Date.now(),
    sessionID: sessionId,
    part: {
      id: genMessageId(),
      sessionID: sessionId,
      messageID: genMessageId(),
      type: 'text',
      text: planText,
    },
  } as import('../../../common/types/opencode.js').OpenCodeTextMessage;
}
