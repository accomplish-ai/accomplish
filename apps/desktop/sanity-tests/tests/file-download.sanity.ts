// apps/desktop/sanity-tests/tests/file-download.sanity.ts
import { test, expect } from '../fixtures';
import { getModelsToTest } from '../utils/models';
import { fileExists, getFileSize, SANITY_OUTPUT_DIR } from '../utils/validators';
import { SanityExecutionPage } from '../page-objects';

const models = getModelsToTest();

for (const model of models) {
  test.describe(`File Download [${model.displayName}]`, () => {
    test.use({ currentModel: model });

    test('should download PDF from web and save locally', async ({ window }) => {
      const homePage = window;
      const executionPage = new SanityExecutionPage(window);

      // Enter the task prompt
      const taskInput = homePage.getByTestId('task-input-textarea');
      await taskInput.fill(
        `Download the PDF from https://www.w3.org/WAI/WCAG21/Techniques/pdf/img/table-word.pdf and save it to ${SANITY_OUTPUT_DIR}/downloaded.pdf`
      );

      // Submit the task
      const submitButton = homePage.getByTestId('task-input-submit');
      await submitButton.click();

      // Wait for navigation to execution page
      await homePage.waitForURL(/\/execution\//);

      // Auto-allow permissions
      await executionPage.autoAllowPermissions();

      // Wait for task to complete
      const status = await executionPage.waitForComplete();
      executionPage.stopAutoAllow();

      // Validate completion
      expect(status).toBe('completed');

      // Validate output file
      expect(fileExists('downloaded.pdf')).toBe(true);
      expect(getFileSize('downloaded.pdf')).toBeGreaterThan(1024); // > 1KB
    });
  });
}
