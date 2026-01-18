/**
 * Speech Recognition Service
 * Handles audio capture, voice activity detection, and Whisper transcription
 */

import { EventEmitter } from 'events';
import wav from 'wav';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import VoiceActivityDetection from 'node-vad';
import initWasm, { convert_pcm16_to_f32, run_whisper } from 'whisper.js';

interface SpeechConfig {
  sampleRate?: number;
  channels?: number;
  modelPath?: string;
  silenceDuration?: number; // ms of silence to end recording
  minAudioDuration?: number; // minimum audio length to process
}

export class SpeechRecognitionService extends EventEmitter {
  private vad: any;
  private isListening = false;
  private audioBuffer: Buffer[] = [];
  private silenceCounter = 0;
  private silenceDuration: number;
  private minAudioDuration: number;
  private modelPath: string;
  private sampleRate: number;

  constructor(config: SpeechConfig = {}) {
    super();
    this.sampleRate = config.sampleRate || 16000;
    this.silenceDuration = config.silenceDuration || 800; // 800ms of silence
    this.minAudioDuration = config.minAudioDuration || 800; // minimum 800ms
    this.modelPath =
      config.modelPath ||
      path.join(app.getPath('userData'), 'whisper-models', 'ggml-small.bin');
  }

  /**
   * Initialize Voice Activity Detection
   */
  async initialize(): Promise<void> {
    try {
      this.vad = new VoiceActivityDetection({
        frameSizeMs: 30,
        sampleRate: this.sampleRate,
        mode: VoiceActivityDetection.Mode.NORMAL,
      });
      console.log('[SpeechRecognition] VAD initialized');
    } catch (error) {
      console.error('[SpeechRecognition] Failed to initialize VAD:', error);
      throw error;
    }
  }

  /**
   * Start listening for audio input
   * This should be called when the user clicks the microphone button
   */
  async startListening(): Promise<void> {
    if (this.isListening) {
      console.warn('[SpeechRecognition] Already listening');
      return;
    }

    this.isListening = true;
    this.audioBuffer = [];
    this.silenceCounter = 0;

    this.emit('listening-started');
    console.log('[SpeechRecognition] Started listening');
  }

  /**
   * Stop listening and process audio
   */
  async stopListening(): Promise<string | null> {
    if (!this.isListening) {
      return null;
    }

    this.isListening = false;
    const audioData = Buffer.concat(this.audioBuffer);

    // Check if audio is long enough
    const duration = (audioData.length / 2) / this.sampleRate * 1000; // 16-bit audio
    if (duration < this.minAudioDuration) {
      console.warn('[SpeechRecognition] Audio too short:', duration, 'ms');
      this.emit('error', `Audio too short (${Math.round(duration)}ms). Please speak longer.`);
      return null;
    }

    this.emit('processing');
    console.log('[SpeechRecognition] Processing audio:', duration, 'ms');

    try {
      const text = await this.transcribeAudio(audioData);
      this.emit('transcription', text);
      return text;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[SpeechRecognition] Transcription failed:', errorMessage);
      this.emit('error', `Transcription failed: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Process audio chunk from microphone
   * Called periodically during listening
   */
  processAudioChunk(chunk: Buffer): void {
    if (!this.isListening) return;

    this.audioBuffer.push(chunk);

    // Voice activity detection
    if (this.vad) {
      try {
        const audio = new Float32Array(chunk.length / 2);
        for (let i = 0; i < chunk.length; i += 2) {
          const pcm = chunk.readInt16LE(i);
          audio[i / 2] = pcm / 32768;
        }

        const result = this.vad.process(Buffer.from(audio.buffer));

        if (result === VoiceActivityDetection.Voice.SPEECH) {
          this.silenceCounter = 0;
          this.emit('speech-detected');
        } else if (result === VoiceActivityDetection.Voice.SILENCE) {
          this.silenceCounter += 30; // 30ms chunks

          // Auto-stop after prolonged silence
          if (this.silenceCounter >= this.silenceDuration) {
            console.log('[SpeechRecognition] Silence detected, stopping...');
            this.stopListening();
          }
        }
      } catch (error) {
        console.error('[SpeechRecognition] VAD processing error:', error);
      }
    }
  }

  /**
   * Transcribe audio buffer using Whisper.js
   */
  private async transcribeAudio(audioData: Buffer): Promise<string> {
    try {
      // Initialize Whisper WASM
      await initWasm();

      // Convert PCM16 to F32
      const f32Audio = new Float32Array(audioData.length / 2);
      for (let i = 0; i < audioData.length; i += 2) {
        const pcm = audioData.readInt16LE(i);
        f32Audio[i / 2] = pcm / 32768;
      }

      // Run Whisper inference
      const result = await run_whisper({
        audio: f32Audio,
        language: 'auto', // Auto-detect language
      });

      return result.text?.trim() || '';
    } catch (error) {
      throw new Error(`Whisper transcription failed: ${error}`);
    }
  }

  /**
   * Check if listening
   */
  isCurrentlyListening(): boolean {
    return this.isListening;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.isListening = false;
    this.audioBuffer = [];
    if (this.vad) {
      this.vad.destroy();
    }
  }
}

export default SpeechRecognitionService;
