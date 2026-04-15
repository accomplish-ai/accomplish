import type { gmail_v1 } from 'googleapis';

type Gmail = gmail_v1.Gmail;

export async function execModify(
  gmail: Gmail,
  email: string,
  messageId: string,
  addLabelIds: string[],
  removeLabelIds: string[],
) {
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { addLabelIds, removeLabelIds },
  });
  return messageId;
}
