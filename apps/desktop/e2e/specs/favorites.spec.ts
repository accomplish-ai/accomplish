import { test, expect } from '../fixtures';
import { HomePage, ExecutionPage } from '../pages';
import { captureForAI } from '../utils';
import { TEST_TIMEOUTS, TEST_SCENARIOS } from '../config';

test.describe('Favorites', () => {
  test('should show favorite toggle on completed task', async ({ window }) => {
    const homePage = new HomePage(window);
    const executionPage = new ExecutionPage(window);

    await window.waitForLoadState('domcontentloaded');

    // Submit a task and wait for completion
    await homePage.enterTask(TEST_SCENARIOS.SUCCESS.keyword);
    await homePage.submitTask();
    await window.waitForURL(/.*#\/execution.*/, { timeout: TEST_TIMEOUTS.NAVIGATION });
    await executionPage.waitForComplete();

    // Capture completed state before favoriting
    await captureForAI(window, 'favorites-toggle', 'before-favorite', [
      'Task is completed',
      'Favorite toggle button is visible',
      'Star icon is not filled (not yet favorited)',
    ]);

    // Assert favorite toggle is visible and not yet pressed
    await expect(executionPage.favoriteToggle.first()).toBeVisible();
    await expect(executionPage.favoriteToggle.first()).toHaveAttribute('aria-pressed', 'false');
  });

  test('should toggle favorite on completed task', async ({ window }) => {
    const homePage = new HomePage(window);
    const executionPage = new ExecutionPage(window);

    await window.waitForLoadState('domcontentloaded');

    // Submit a task and wait for completion
    await homePage.enterTask(TEST_SCENARIOS.SUCCESS.keyword);
    await homePage.submitTask();
    await window.waitForURL(/.*#\/execution.*/, { timeout: TEST_TIMEOUTS.NAVIGATION });
    await executionPage.waitForComplete();

    // Click the favorite toggle
    await executionPage.favoriteToggle.first().click();

    // Capture favorited state — wait via async matchers (no fixed sleep)
    await captureForAI(window, 'favorites-toggle', 'after-favorite', [
      'Star icon is now filled (favorited)',
      'aria-pressed is true',
    ]);

    await expect(executionPage.favoriteToggle.first()).toHaveAttribute('aria-pressed', 'true');
  });

  test('should unfavorite a previously favorited task', async ({ window }) => {
    const homePage = new HomePage(window);
    const executionPage = new ExecutionPage(window);

    await window.waitForLoadState('domcontentloaded');

    // Submit a task and wait for completion
    await homePage.enterTask(TEST_SCENARIOS.SUCCESS.keyword);
    await homePage.submitTask();
    await window.waitForURL(/.*#\/execution.*/, { timeout: TEST_TIMEOUTS.NAVIGATION });
    await executionPage.waitForComplete();

    // Favorite the task
    await executionPage.favoriteToggle.first().click();
    await expect(executionPage.favoriteToggle.first()).toHaveAttribute('aria-pressed', 'true');

    // Unfavorite the task
    await executionPage.favoriteToggle.first().click();

    // Capture unfavorited state — wait via async matchers
    await captureForAI(window, 'favorites-toggle', 'after-unfavorite', [
      'Star icon is no longer filled',
      'aria-pressed is false',
    ]);

    await expect(executionPage.favoriteToggle.first()).toHaveAttribute('aria-pressed', 'false');

    // Verify button label reverted to unfavorited state
    const buttonText = await executionPage.favoriteToggle.first().textContent();
    expect(buttonText).toContain('Add to favorites');
  });

  test('should display favorites section on Home after favoriting', async ({ window }) => {
    const homePage = new HomePage(window);
    const executionPage = new ExecutionPage(window);

    await window.waitForLoadState('domcontentloaded');

    // Submit a task, complete it, and favorite it
    await homePage.enterTask(TEST_SCENARIOS.SUCCESS.keyword);
    await homePage.submitTask();
    await window.waitForURL(/.*#\/execution.*/, { timeout: TEST_TIMEOUTS.NAVIGATION });
    await executionPage.waitForComplete();

    await executionPage.favoriteToggle.first().click();
    await expect(executionPage.favoriteToggle.first()).toHaveAttribute('aria-pressed', 'true');

    // Navigate back to Home
    await executionPage.startNewTaskButton.click();
    await window.waitForURL(/.*#\/$/, { timeout: TEST_TIMEOUTS.NAVIGATION });

    // Capture favorites section on Home
    await captureForAI(window, 'favorites-home', 'favorites-visible', [
      'Favorites section is visible on Home page',
      'At least one favorite item is displayed',
    ]);

    // Assert favorites section and at least one item
    await expect(homePage.favoritesSection).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
    const itemCount = await homePage.favoriteItems.count();
    expect(itemCount).toBeGreaterThan(0);
  });

  test('should pre-fill prompt when clicking a favorite on Home', async ({ window }) => {
    const homePage = new HomePage(window);
    const executionPage = new ExecutionPage(window);

    await window.waitForLoadState('domcontentloaded');

    const expectedPrompt = TEST_SCENARIOS.SUCCESS.keyword;

    // Submit a task, complete it, and favorite it
    await homePage.enterTask(expectedPrompt);
    await homePage.submitTask();
    await window.waitForURL(/.*#\/execution.*/, { timeout: TEST_TIMEOUTS.NAVIGATION });
    await executionPage.waitForComplete();

    await executionPage.favoriteToggle.first().click();
    await expect(executionPage.favoriteToggle.first()).toHaveAttribute('aria-pressed', 'true');

    // Navigate back to Home
    await executionPage.startNewTaskButton.click();
    await window.waitForURL(/.*#\/$/, { timeout: TEST_TIMEOUTS.NAVIGATION });

    // Wait for favorites section
    await expect(homePage.favoritesSection).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Click the first favorite item
    await homePage.favoriteItems.first().click();

    // Assert input is pre-filled with the exact favorited prompt
    await expect(homePage.taskInput).toHaveValue(expectedPrompt, {
      timeout: TEST_TIMEOUTS.NAVIGATION,
    });

    // Capture pre-filled state
    await captureForAI(window, 'favorites-home', 'prompt-prefilled', [
      'Task input is pre-filled with favorite prompt',
      'Submit button is enabled',
    ]);

    await expect(homePage.submitButton).toBeEnabled();
  });

  test('should favorite an interrupted task', async ({ window }) => {
    const homePage = new HomePage(window);
    const executionPage = new ExecutionPage(window);

    await window.waitForLoadState('domcontentloaded');

    // Use the dedicated interrupted scenario keyword
    await homePage.enterTask(TEST_SCENARIOS.INTERRUPTED.keyword);
    await homePage.submitTask();
    await window.waitForURL(/.*#\/execution.*/, { timeout: TEST_TIMEOUTS.NAVIGATION });
    await executionPage.waitForComplete();

    // Favorite toggle should be visible for interrupted tasks too
    await expect(executionPage.favoriteToggle.first()).toBeVisible();
    await expect(executionPage.favoriteToggle.first()).toHaveAttribute('aria-pressed', 'false');

    // Toggle favorite and assert via async matcher (no fixed sleep)
    await executionPage.favoriteToggle.first().click();
    await expect(executionPage.favoriteToggle.first()).toHaveAttribute('aria-pressed', 'true');

    // Verify it appears on the Home page favorites section
    await executionPage.startNewTaskButton.click();
    await window.waitForURL(/.*#\/$/, { timeout: TEST_TIMEOUTS.NAVIGATION });

    await expect(homePage.favoritesSection).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
    await expect(homePage.favoriteItems.first()).toBeVisible();
  });
});
