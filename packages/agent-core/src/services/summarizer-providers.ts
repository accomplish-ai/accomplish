/**
 * Provider-specific API call implementations for the task summarizer.
 * Each function sends a minimal request to generate a short task title.
 */

export const SUMMARY_PROMPT = `Generate a very short title (3-5 words max) that summarizes this task request.
The title should be in sentence case, no quotes, no punctuation at end.
Output ONLY the title on a single line, nothing else.
Examples: Check calendar, Download invoice, Search flights to Paris

Task: `;

/**
 * Clean up the generated summary.
 * Extracts only the first non-empty line to handle cases where the LLM
 * returns multiple titles or additional explanation text.
 */
export function cleanSummary(text: string): string {
  // Take only the first non-empty line — LLMs sometimes return multiple titles
  const firstLine =
    text
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? text.trim();

  return (
    firstLine
      // Remove surrounding quotes
      .replace(/^["']|["']$/g, '')
      // Remove trailing punctuation
      .replace(/[.!?]+$/, '')
      // Trim whitespace
      .trim()
  );
}

/**
 * Fallback: truncate prompt to a reasonable length
 */
export function truncatePrompt(prompt: string, maxLength = 30): string {
  const cleaned = prompt.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return cleaned.slice(0, maxLength - 3) + '...';
}

export async function callAnthropic(apiKey: string, prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 50,
        messages: [
          {
            role: 'user',
            content: SUMMARY_PROMPT + prompt,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text?: string }>;
    };
    const text = data.content?.[0]?.text;
    return cleanSummary(text || '');
  } finally {
    clearTimeout(timeout);
  }
}

export async function callOpenAI(apiKey: string, prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 50,
        messages: [
          {
            role: 'user',
            content: SUMMARY_PROMPT + prompt,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const text = data.choices?.[0]?.message?.content;
    return cleanSummary(text || '');
  } finally {
    clearTimeout(timeout);
  }
}

export async function callGoogle(apiKey: string, prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: SUMMARY_PROMPT + prompt }],
            },
          ],
          generationConfig: {
            maxOutputTokens: 50,
          },
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new Error(`Google API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return cleanSummary(text || '');
  } finally {
    clearTimeout(timeout);
  }
}

export async function callXAI(apiKey: string, prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-3',
        max_tokens: 50,
        messages: [
          {
            role: 'user',
            content: SUMMARY_PROMPT + prompt,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`xAI API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const text = data.choices?.[0]?.message?.content;
    return cleanSummary(text || '');
  } finally {
    clearTimeout(timeout);
  }
}
