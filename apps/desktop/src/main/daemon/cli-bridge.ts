/**
 * CLI Bridge
 *
 * Provides a simple CLI interface for sending commands to the daemon.
 * This script can be invoked directly from the command line:
 *
 *   accomplish-cli schedule "0 9 * * 1-5" "Check email and summarize"
 *   accomplish-cli list-scheduled
 *   accomplish-cli cancel-scheduled sched-abc123
 *   accomplish-cli run "Research open source AI models"
 *
 * It communicates with the daemon via the DaemonClient.
 * When run from within the Electron app, it uses the in-process getDaemonClient().
 */

import { getDaemonClient } from '../daemon-bootstrap';

/**
 * Parse CLI arguments and execute the corresponding daemon RPC call.
 */
export async function handleCliCommand(args: string[]): Promise<void> {
  const [command, ...rest] = args;

  if (!command) {
    printUsage();
    return;
  }

  const client = getDaemonClient();

  switch (command) {
    case 'schedule': {
      const [cron, prompt] = rest;
      if (!cron || !prompt) {
        console.error('Usage: schedule "<cron>" "<prompt>"');
        process.exit(1);
      }
      const scheduled = await client.call('task.schedule', { cron, prompt });
      console.log('Scheduled task:', JSON.stringify(scheduled, null, 2));
      break;
    }

    case 'list-scheduled': {
      const schedules = await client.call('task.listScheduled');
      if (schedules.length === 0) {
        console.log('No scheduled tasks.');
      } else {
        console.log('Scheduled tasks:');
        for (const s of schedules) {
          const status = s.enabled ? '✅' : '⏸️';
          console.log(`  ${status} [${s.id}] "${s.prompt}" @ ${s.cron}`);
          if (s.nextRunAt) {
            console.log(`     Next run: ${s.nextRunAt}`);
          }
          if (s.lastRunAt) {
            console.log(`     Last run: ${s.lastRunAt}`);
          }
        }
      }
      break;
    }

    case 'cancel-scheduled': {
      const [scheduleId] = rest;
      if (!scheduleId) {
        console.error('Usage: cancel-scheduled <scheduleId>');
        process.exit(1);
      }
      await client.call('task.cancelScheduled', { scheduleId });
      console.log('Cancelled schedule:', scheduleId);
      break;
    }

    case 'run': {
      const prompt = rest.join(' ');
      if (!prompt) {
        console.error('Usage: run "<prompt>"');
        process.exit(1);
      }
      const taskId = `cli-${Date.now().toString(36)}`;
      const task = await client.call('task.start', {
        taskId,
        config: { prompt, sessionId: undefined },
      });
      console.log('Task started:', task.id);
      break;
    }

    case 'list': {
      const tasks = await client.call('task.list');
      if (tasks.length === 0) {
        console.log('No tasks.');
      } else {
        console.log('Tasks:');
        for (const t of tasks) {
          console.log(`  [${t.status}] ${t.id} — ${t.prompt?.slice(0, 60) ?? '(no prompt)'}`);
        }
      }
      break;
    }

    case 'ping': {
      const result = await client.call('daemon.ping');
      console.log('Daemon status:', result.status, '| Uptime:', result.uptime, 'ms');
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

function printUsage(): void {
  console.log(
    `
Accomplish CLI Bridge

Usage:
  schedule "<cron>" "<prompt>"   Schedule a recurring task
  list-scheduled                 List all scheduled tasks
  cancel-scheduled <id>          Cancel a scheduled task
  run "<prompt>"                 Run a task immediately
  list                           List all tasks
  ping                           Check daemon health
`.trim(),
  );
}
