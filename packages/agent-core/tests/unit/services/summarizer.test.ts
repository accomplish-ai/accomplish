import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateTaskSummary } from '../../../src/services/summarizer.js';

describe('generateTaskSummary', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns a single-line title when the LLM response contains multiple lines', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Check calendar\nDownload invoice\nSearch flights' }],
      }),
    } as Response);

    const result = await generateTaskSummary('Book a flight to Paris', (p) =>
      p === 'anthropic' ? 'sk-ant-test' : null,
    );

    expect(result).toBe('Check calendar');
  });

  it('strips surrounding quotes from the title', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: '"Check calendar"' }],
      }),
    } as Response);

    const result = await generateTaskSummary('What is on my calendar?', (p) =>
      p === 'anthropic' ? 'sk-ant-test' : null,
    );

    expect(result).toBe('Check calendar');
  });

  it('strips trailing punctuation from the title', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Check calendar.' }],
      }),
    } as Response);

    const result = await generateTaskSummary('What is on my calendar?', (p) =>
      p === 'anthropic' ? 'sk-ant-test' : null,
    );

    expect(result).toBe('Check calendar');
  });

  it('falls back to the next provider when the first fails', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Search flights' } }],
        }),
      } as Response);

    const result = await generateTaskSummary('Book a flight', (p) => {
      if (p === 'anthropic') return 'sk-ant-test';
      if (p === 'openai') return 'sk-openai-test';
      return null;
    });

    expect(result).toBe('Search flights');
  });

  it('falls back to truncated prompt when all providers fail', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('All failed'));

    const result = await generateTaskSummary(
      'Book a flight to Paris for the entire team next week',
      (p) => (p === 'anthropic' ? 'sk-ant-test' : null),
    );

    expect(result).toBe('Book a flight to Paris for ...');
  });

  it('uses truncated prompt when no API keys are configured', async () => {
    const result = await generateTaskSummary(
      'Schedule a meeting with the whole team for tomorrow morning',
      () => null,
    );

    expect(result).toBe('Schedule a meeting with the...');
  });

  it('handles blank lines before the title', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: '\n\nDownload invoice' }],
      }),
    } as Response);

    const result = await generateTaskSummary('Download my invoice', (p) =>
      p === 'anthropic' ? 'sk-ant-test' : null,
    );

    expect(result).toBe('Download invoice');
  });
});
