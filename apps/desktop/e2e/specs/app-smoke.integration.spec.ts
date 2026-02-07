/**
 * App Smoke Test — Real E2E pipeline verification.
 *
 * Prerequisites:
 *   - App must be built (`pnpm -F @accomplish/desktop build`)
 *   - A provider must be configured with real API keys in the app's storage
 *
 * This test does NOT mock task execution. It verifies the full pipeline:
 *   Electron → IPC → TaskManager → OpenCode CLI → LLM → MCP browser → result
 */
import { test, expect } from '../fixtures/electron-smoke';
import { HomePage } from '../pages/home.page';
import { ExecutionPage } from '../pages/execution.page';
import { TEST_TIMEOUTS } from '../config';

function createPermissionPoller(execution: ExecutionPage) {
  let running = true;

  const promise = (async () => {
    while (running) {
      try {
        const modal = execution.permissionModal;
        if (await modal.isVisible({ timeout: 100 }).catch(() => false)) {
          const allow = execution.allowButton;
          if (await allow.isEnabled({ timeout: 100 }).catch(() => false)) {
            await allow.click();
          }
        }
      } catch {
        // Element disappeared between check and click — ignore
      }
      await new Promise(r => setTimeout(r, 500));
    }
  })();

  return {
    stop: async () => {
      running = false;
      await promise;
    },
  };
}

test.describe('AppSmokeTest', () => {
  test('full pipeline: submit prompt, auto-allow permissions, verify completion', async ({ window }) => {
    const home = new HomePage(window);
    const execution = new ExecutionPage(window);

    // 1. Submit a real prompt
    await home.enterTask('search google for animals');
    await home.submitTask();

    // 2. Start permission auto-allow poller
    const poller = createPermissionPoller(execution);

    try {
      // 3. Wait for task to complete (up to 4 min)
      await execution.waitForComplete(TEST_TIMEOUTS.SMOKE_TASK_COMPLETE);

      // 4. Assert status badge shows "completed"
      await expect(execution.statusBadge).toContainText(/completed/i);

      // 5. Assert messages contain relevant output
      const messagesText = await execution.messagesScrollContainer.textContent();
      expect(messagesText).toMatch(/animal/i);
    } finally {
      // Always stop the poller
      await poller.stop();
    }
  });
});
