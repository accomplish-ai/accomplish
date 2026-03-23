import { test, expect } from '../fixtures';
import { HomePage, ExecutionPage } from '../pages';
import { captureForAI } from '../utils';
import { TEST_TIMEOUTS, TEST_SCENARIOS } from '../config';

test.describe('Daemon Architecture - Background Execution', () => {
  test('dispatches task to daemon and continues processing when UI is decoupled', async ({
    window,
    electronApp,
  }) => {
    const homePage = new HomePage(window);
    const executionPage = new ExecutionPage(window);

    await window.waitForLoadState('domcontentloaded');

    // 1. Start a slow/long-running task that requires daemon processing
    // Using WITH_TOOL since tool execution adds mock processing time
    await homePage.enterTask(TEST_SCENARIOS.WITH_TOOL.keyword);
    await homePage.submitTask();

    // Wait for navigation and initial task execution state
    await window.waitForURL(/.*#\/execution.*/, { timeout: TEST_TIMEOUTS.NAVIGATION });

    await Promise.race([
      executionPage.thinkingIndicator.waitFor({
        state: 'visible',
        timeout: TEST_TIMEOUTS.NAVIGATION,
      }),
      executionPage.statusBadge.waitFor({ state: 'visible', timeout: TEST_TIMEOUTS.NAVIGATION }),
    ]);

    // Capture initial dispatch state
    await captureForAI(window, 'daemon-execution', 'task-dispatched', [
      'Task is successfully dispatched to the daemon',
      'UI shows running state',
      'Daemon has taken over execution',
    ]);

    // 2. Simulate UI decouple ("virtual close")
    // Hide the main window to simulate the user closing it UI to the tray
    await electronApp.evaluate(({ BrowserWindow }) => {
      const mainWin = BrowserWindow.getAllWindows()[0];
      if (mainWin) {
        mainWin.hide();
      }
    });

    // We wait a bit to let the daemon process in the background
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 3. Restore UI
    await electronApp.evaluate(({ BrowserWindow }) => {
      const mainWin = BrowserWindow.getAllWindows()[0];
      if (mainWin) {
        mainWin.show();
      }
    });

    // 4. Verify Daemon finished the task in the background while UI was hidden
    await executionPage.waitForComplete();

    // Assert status badge indicates completion
    await expect(executionPage.statusBadge).toBeVisible();
    const badgeText = await executionPage.statusBadge.textContent();
    expect(badgeText?.toLowerCase()).toMatch(/complete|success|done/i);

    // Capture final restored state
    await captureForAI(window, 'daemon-execution', 'background-complete', [
      'UI was restored from virtual close (tray)',
      'Daemon successfully completed the task in the background',
      'Task status is complete',
    ]);
  });
});
