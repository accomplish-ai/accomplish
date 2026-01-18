/**
 * Wake Word Detection Service
 * Detects "Hi Openwork" and similar activation phrases
 * Uses lightweight pattern matching + optional ML model
 */

import { EventEmitter } from 'events';
import VoiceActivityDetection from 'node-vad';

interface WakeWordConfig {
  enabled?: boolean;
  keywords?: string[];
  confidence?: number; // 0-1, higher = stricter
  sampleRate?: number;
}

export class WakeWordDetector extends EventEmitter {
  private keywords: string[];
  private confidence: number;
  private vad: any;
  private recentTranscriptions: string[] = [];
  private maxHistory = 5;
  private sampleRate: number;

  constructor(config: WakeWordConfig = {}) {
    super();
    this.keywords = config.keywords || [
      'hi openwork',
      'hey openwork',
      'openwork',
      'wake up',
    ];
    this.confidence = config.confidence || 0.7;
    this.sampleRate = config.sampleRate || 16000;
  }

  async initialize(): Promise<void> {
    try {
      this.vad = new VoiceActivityDetection({
        frameSizeMs: 30,
        sampleRate: this.sampleRate,
        mode: VoiceActivityDetection.Mode.AGGRESSIVE, // More sensitive for wake word
      });
      console.log('[WakeWordDetector] Initialized');
    } catch (error) {
      console.error('[WakeWordDetector] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Check if transcription contains wake word
   * Returns confidence score 0-1
   */
  detectWakeWord(transcription: string): {
    detected: boolean;
    keyword: string | null;
    confidence: number;
  } {
    const normalized = transcription.toLowerCase().trim();

    // Add to history for context
    this.recentTranscriptions.push(normalized);
    if (this.recentTranscriptions.length > this.maxHistory) {
      this.recentTranscriptions.shift();
    }

    for (const keyword of this.keywords) {
      const score = this.calculateSimilarity(normalized, keyword);

      if (score >= this.confidence) {
        console.log(
          `[WakeWordDetector] Wake word detected: "${keyword}" (score: ${score.toFixed(2)})`
        );

        this.emit('wake-word-detected', {
          keyword,
          confidence: score,
          timestamp: Date.now(),
        });

        return {
          detected: true,
          keyword,
          confidence: score,
        };
      }
    }

    return {
      detected: false,
      keyword: null,
      confidence: 0,
    };
  }

  /**
   * Calculate string similarity using Levenshtein distance
   * Returns value 0-1 where 1 is exact match
   */
  private calculateSimilarity(str1: string, str2: string): number {
    // Exact match
    if (str1 === str2) return 1.0;

    // Contains match (more lenient)
    if (str1.includes(str2) || str2.includes(str1)) {
      return 0.9;
    }

    // Levenshtein distance
    const distance = this.levenshteinDistance(str1, str2);
    const maxLen = Math.max(str1.length, str2.length);
    const similarity = 1 - distance / maxLen;

    return Math.max(0, similarity);
  }

  /**
   * Levenshtein distance algorithm
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Get recent transcriptions
   */
  getRecentTranscriptions(): string[] {
    return [...this.recentTranscriptions];
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.recentTranscriptions = [];
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.vad) {
      this.vad.destroy();
    }
  }
}

export default WakeWordDetector;
