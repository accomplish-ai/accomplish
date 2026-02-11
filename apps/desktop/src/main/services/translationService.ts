/**
 * Translation Service for Multi-Language Support
 *
 * Enables users to interact with Openwork in any language while keeping
 * the agentic pipeline 100% in English. Translation happens transparently
 * at the boundaries.
 *
 * - User input is translated TO English before reaching the agent
 * - Agent output is translated FROM English before reaching the user
 */

import { getApiKey, type ApiKeyProvider } from '../store/secureStorage';

// Cache for translations to avoid repeated API calls
const translationCache = new Map<string, string>();
const MAX_CACHE_SIZE = 500;

// Language codes we support detecting/translating
type LanguageCode = 'en' | 'zh' | 'he' | 'ar' | 'ru' | 'ja' | 'ko' | string;

/**
 * Track detected language per task
 */
const taskLanguageMap = new Map<string, LanguageCode>();

/**
 * Get the detected language for a task
 */
export function getTaskLanguage(taskId: string): LanguageCode | undefined {
  return taskLanguageMap.get(taskId);
}

/**
 * Set the detected language for a task
 */
export function setTaskLanguage(taskId: string, language: LanguageCode): void {
  taskLanguageMap.set(taskId, language);
}

/**
 * Clear the language tracking for a task (call on task complete/error)
 */
export function clearTaskLanguage(taskId: string): void {
  taskLanguageMap.delete(taskId);
}

/**
 * Detect the language of input text using character range analysis.
 * Fast and doesn't require API calls.
 *
 * @param text The text to analyze
 * @returns Language code (e.g., 'en', 'zh', 'he', 'ar', 'ru', 'ja', 'ko')
 */
export function detectLanguage(text: string): LanguageCode {
  // Remove whitespace and punctuation for analysis
  const cleanText = text.replace(/[\s\p{P}\p{S}\d]/gu, '');

  if (cleanText.length === 0) {
    return 'en'; // Default to English for empty/punctuation-only text
  }

  // Count characters in each script
  let cjkCount = 0;
  let hebrewCount = 0;
  let arabicCount = 0;
  let cyrillicCount = 0;
  let japaneseKana = 0;
  let koreanCount = 0;
  let latinCount = 0;

  for (const char of cleanText) {
    const code = char.codePointAt(0)!;

    // CJK Unified Ideographs (Chinese, Japanese Kanji, Korean Hanja)
    if (
      (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
      (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
      (code >= 0x20000 && code <= 0x2a6df) // CJK Extension B
    ) {
      cjkCount++;
    }
    // Hebrew
    else if (code >= 0x0590 && code <= 0x05ff) {
      hebrewCount++;
    }
    // Arabic
    else if (
      (code >= 0x0600 && code <= 0x06ff) || // Arabic
      (code >= 0x0750 && code <= 0x077f) // Arabic Supplement
    ) {
      arabicCount++;
    }
    // Cyrillic (Russian, Ukrainian, etc.)
    else if (
      (code >= 0x0400 && code <= 0x04ff) || // Cyrillic
      (code >= 0x0500 && code <= 0x052f) // Cyrillic Supplement
    ) {
      cyrillicCount++;
    }
    // Japanese Hiragana and Katakana
    else if (
      (code >= 0x3040 && code <= 0x309f) || // Hiragana
      (code >= 0x30a0 && code <= 0x30ff) // Katakana
    ) {
      japaneseKana++;
    }
    // Korean Hangul
    else if (
      (code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables
      (code >= 0x1100 && code <= 0x11ff) || // Hangul Jamo
      (code >= 0x3130 && code <= 0x318f) // Hangul Compatibility Jamo
    ) {
      koreanCount++;
    }
    // Latin (includes extended Latin for European languages)
    else if (
      (code >= 0x0041 && code <= 0x007a) || // Basic Latin
      (code >= 0x00c0 && code <= 0x024f) // Latin Extended
    ) {
      latinCount++;
    }
  }

  const total = cleanText.length;
  const threshold = 0.3; // At least 30% of characters should be in a script

  // Check scripts in order of specificity
  if (japaneseKana / total >= threshold || (japaneseKana > 0 && cjkCount / total >= threshold)) {
    return 'ja'; // Japanese (has kana, possibly mixed with kanji)
  }
  if (koreanCount / total >= threshold) {
    return 'ko'; // Korean
  }
  if (hebrewCount / total >= threshold) {
    return 'he'; // Hebrew
  }
  if (arabicCount / total >= threshold) {
    return 'ar'; // Arabic
  }
  if (cyrillicCount / total >= threshold) {
    return 'ru'; // Russian/Cyrillic
  }
  if (cjkCount / total >= threshold) {
    return 'zh'; // Chinese (CJK without kana)
  }

  // Default to English (Latin script or mixed)
  return 'en';
}

/**
 * Check if a language is English
 */
export function isEnglish(language: LanguageCode): boolean {
  return language === 'en';
}

/**
 * Get cache key for translation
 */
function getCacheKey(text: string, direction: 'to-en' | 'from-en', targetLang?: string): string {
  return `${direction}:${targetLang || ''}:${text}`;
}

/**
 * Add to cache with size limit
 */
function addToCache(key: string, value: string): void {
  // Evict oldest entries if cache is full
  if (translationCache.size >= MAX_CACHE_SIZE) {
    const firstKey = translationCache.keys().next().value;
    if (firstKey) {
      translationCache.delete(firstKey);
    }
  }
  translationCache.set(key, value);
}

/**
 * Translate text to English
 *
 * @param text The text to translate
 * @param sourceLanguage Optional source language (auto-detected if not provided)
 * @returns Translated English text, or original text if translation fails
 */
export async function translateToEnglish(
  text: string,
  sourceLanguage?: LanguageCode
): Promise<string> {
  const lang = sourceLanguage || detectLanguage(text);

  // Skip if already English
  if (isEnglish(lang)) {
    return text;
  }

  // Check cache
  const cacheKey = getCacheKey(text, 'to-en');
  const cached = translationCache.get(cacheKey);
  if (cached) {
    console.log('[Translation] Cache hit for to-English translation');
    return cached;
  }

  // Try translation via available providers
  const translation = await translateViaProvider(text, lang, 'en');

  if (translation) {
    addToCache(cacheKey, translation);
    return translation;
  }

  // Fallback: return original text
  console.warn('[Translation] Failed to translate to English, using original text');
  return text;
}

/**
 * Translate text from English to target language
 *
 * @param text The English text to translate
 * @param targetLanguage The target language code
 * @returns Translated text, or original text if translation fails
 */
export async function translateFromEnglish(
  text: string,
  targetLanguage: LanguageCode
): Promise<string> {
  // Skip if target is English
  if (isEnglish(targetLanguage)) {
    return text;
  }

  // Check cache
  const cacheKey = getCacheKey(text, 'from-en', targetLanguage);
  const cached = translationCache.get(cacheKey);
  if (cached) {
    console.log('[Translation] Cache hit for from-English translation');
    return cached;
  }

  // Try translation via available providers
  const translation = await translateViaProvider(text, 'en', targetLanguage);

  if (translation) {
    addToCache(cacheKey, translation);
    return translation;
  }

  // Fallback: return original text
  console.warn('[Translation] Failed to translate from English, using original text');
  return text;
}

/**
 * Get language name for prompts
 */
export function getLanguageName(code: LanguageCode): string {
  const names: Record<string, string> = {
    en: 'English',
    zh: 'Chinese',
    he: 'Hebrew',
    ar: 'Arabic',
    ru: 'Russian',
    ja: 'Japanese',
    ko: 'Korean',
  };
  return names[code] || code;
}

/**
 * Build translation prompt
 */
function buildTranslationPrompt(text: string, fromLang: LanguageCode, toLang: LanguageCode): string {
  const fromName = getLanguageName(fromLang);
  const toName = getLanguageName(toLang);

  return `Translate the following text from ${fromName} to ${toName}.
Preserve the meaning, tone, and any technical terms.
Do not add explanations or notes - output ONLY the translation.

Text to translate:
${text}`;
}

/**
 * Try to translate using available API providers
 */
async function translateViaProvider(
  text: string,
  fromLang: LanguageCode,
  toLang: LanguageCode
): Promise<string | null> {
  // Try providers in order of preference (similar to summarizer)
  const providers: ApiKeyProvider[] = ['anthropic', 'openai', 'google', 'xai', 'deepseek'];

  for (const provider of providers) {
    const apiKey = getApiKey(provider);
    if (!apiKey) continue;

    try {
      const translation = await callProviderForTranslation(
        provider,
        apiKey,
        text,
        fromLang,
        toLang
      );
      if (translation) {
        console.log(`[Translation] Translated via ${provider}`);
        return translation;
      }
    } catch (error) {
      console.warn(`[Translation] ${provider} failed:`, error);
      // Continue to next provider
    }
  }

  return null;
}

/**
 * Call a specific provider for translation
 */
async function callProviderForTranslation(
  provider: ApiKeyProvider,
  apiKey: string,
  text: string,
  fromLang: LanguageCode,
  toLang: LanguageCode
): Promise<string | null> {
  const prompt = buildTranslationPrompt(text, fromLang, toLang);

  switch (provider) {
    case 'anthropic':
      return callAnthropic(apiKey, prompt);
    case 'openai':
      return callOpenAI(apiKey, prompt);
    case 'google':
      return callGoogle(apiKey, prompt);
    case 'xai':
      return callXAI(apiKey, prompt);
    case 'deepseek':
      return callDeepSeek(apiKey, prompt);
    default:
      return null;
  }
}

const TRANSLATION_TIMEOUT_MS = 10_000;

/** Create an AbortController that auto-aborts after the given timeout. */
function createTimeoutController(ms: number): { controller: AbortController; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, clear: () => clearTimeout(timer) };
}

/** Send a translation prompt to the Anthropic API using Haiku. */
async function callAnthropic(apiKey: string, prompt: string): Promise<string> {
  const { controller, clear } = createTimeoutController(TRANSLATION_TIMEOUT_MS);
  try {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
  };
  return data.content?.[0]?.text?.trim() || '';
  } finally { clear(); }
}

/** Send a translation prompt to the OpenAI API using GPT-4o-mini. */
async function callOpenAI(apiKey: string, prompt: string): Promise<string> {
  const { controller, clear } = createTimeoutController(TRANSLATION_TIMEOUT_MS);
  try {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() || '';
  } finally { clear(); }
}

/** Send a translation prompt to the Google Gemini API using Gemini Flash. */
async function callGoogle(apiKey: string, prompt: string): Promise<string> {
  const { controller, clear } = createTimeoutController(TRANSLATION_TIMEOUT_MS);
  try {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 4096,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Google API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  } finally { clear(); }
}

/** Send a translation prompt to the xAI API using Grok. */
async function callXAI(apiKey: string, prompt: string): Promise<string> {
  const { controller, clear } = createTimeoutController(TRANSLATION_TIMEOUT_MS);
  try {
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'grok-3',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`xAI API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() || '';
  } finally { clear(); }
}

/** Send a translation prompt to the DeepSeek API. */
async function callDeepSeek(apiKey: string, prompt: string): Promise<string> {
  const { controller, clear } = createTimeoutController(TRANSLATION_TIMEOUT_MS);
  try {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() || '';
  } finally { clear(); }
}

/**
 * Clear the translation cache (useful for testing or memory management)
 */
export function clearTranslationCache(): void {
  translationCache.clear();
}
