import { createGmailClient, parseFlags, handleGmailError } from './gmail-client.js';
import type { AccountEntry } from './accounts.js';
import { execList } from './list.js';
import { execRead } from './read.js';
import { execSend } from './send.js';
import { execReply } from './reply.js';
import { execDraft } from './draft.js';
import { execModify } from './modify.js';

export async function runCommand(
  accounts: AccountEntry[],
  subcommand: string,
  args: string,
): Promise<unknown> {
  const flags = parseFlags(args);
  const positionalMatch = args.match(/^([^\s-]\S*)/);
  const positional = positionalMatch ? positionalMatch[1] : '';

  const results = await Promise.allSettled(
    accounts.map(async (acct) => {
      const gmail = createGmailClient(acct.tokenFilePath);
      const email = acct.email;
      if (subcommand === 'list') {
        return execList(gmail, email, flags, positional);
      }
      if (subcommand === 'read') {
        return execRead(gmail, email, positional || flags['messageId'] || '');
      }
      if (subcommand === 'send') {
        return execSend(gmail, email, flags);
      }
      if (subcommand === 'reply') {
        return execReply(gmail, email, flags);
      }
      if (subcommand === 'draft') {
        return execDraft(gmail, email, flags);
      }
      if (subcommand === 'archive') {
        const id = positional || flags['messageId'] || '';
        if (!id) {
          throw new Error('Missing required message ID (positional or --messageId)');
        }
        await execModify(gmail, email, id, [], ['INBOX']);
        return { account: email, messageId: id, status: 'archived' };
      }
      if (subcommand === 'mark-read' || subcommand === 'mark-unread') {
        const id = positional || flags['messageId'] || '';
        if (!id) {
          throw new Error('Missing required message ID (positional or --messageId)');
        }
        const unread = subcommand === 'mark-unread' || flags['unread'] !== undefined;
        await execModify(gmail, email, id, unread ? ['UNREAD'] : [], unread ? [] : ['UNREAD']);
        return { account: email, messageId: id, status: 'updated' };
      }
      if (subcommand === 'label') {
        const id = flags['messageId'] || '';
        if (!id) {
          throw new Error('Missing required --messageId flag');
        }
        const addLabel = flags['add'] ? [flags['add']] : [];
        const removeLabel = flags['remove'] ? [flags['remove']] : [];
        await execModify(gmail, email, id, addLabel, removeLabel);
        return { account: email, messageId: id, status: 'labels_updated' };
      }
      return { error: `Unknown subcommand: ${subcommand}` };
    }),
  );

  const output: unknown[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      const val = r.value;
      if (Array.isArray(val)) {
        output.push(...val);
      } else {
        output.push(val);
      }
    } else {
      output.push(handleGmailError(accounts[i].email, r.reason));
    }
  }
  return accounts.length === 1 && output.length === 1 ? output[0] : output;
}
