/**
 * Audio Recording Module
 * Uses system audio capture to get microphone input
 */

import { execSync } from 'child_process';
import { Readable } from 'stream';
import SpeechRecognitionService from '../services/speech-recognition';

let recordingProcess: any = null;
let audioStream: Readable | null = null;

/**
 * Start recording audio from microphone
 * Supports macOS and Windows
 */
export function recordAudio(speechService: SpeechRecognitionService): void {
  const platform = process.platform;

  try {
    if (platform === 'darwin') {
      // macOS: use 'SoX' or 'afrecord'
      recordAudioMacOS(speechService);
    } else if (platform === 'win32') {
      // Windows: use 'ffmpeg' or 'PowerShell'
      recordAudioWindows(speechService);
    } else {
      // Linux
      recordAudioLinux(speechService);
    }
  } catch (error) {
    console.error('[AudioRecorder] Error starting recording:', error);
    speechService.emit('error', 'Failed to start audio recording');
  }
}

/**
 * macOS audio recording using afrecord
 */
function recordAudioMacOS(speechService: SpeechRecognitionService): void {
  const { spawn } = require('child_process');

  try {
    // afrecord: Apple's built-in audio recording tool
    // -c 1: mono (1 channel)
    // -b 16: 16-bit audio
    // -q: quiet
    // -f LPCM: Linear PCM format
    // -s sr 16000: sample rate 16000 Hz
    const afrecord = spawn('afrecord', [
      '-c', '1',      // mono
      '-b', '16',     // 16-bit
      '-q',           // quiet
      '-f', 'LPCM',   // format
      '-s', 'sr', '16000', // sample rate
      '-',            // output to stdout
    ]);

    recordingProcess = afrecord;
    audioStream = afrecord.stdout;

    afrecord.stderr.on('data', (data: Buffer) => {
      console.warn('[AudioRecorder] afrecord stderr:', data.toString());
    });

    afrecord.on('error', (error: any) => {
      console.error('[AudioRecorder] afrecord error:', error);
      speechService.emit('error', 'Audio recording error');
    });

    // Process audio chunks
    if (audioStream) {
      audioStream.on('data', (chunk: Buffer) => {
        speechService.processAudioChunk(chunk);
      });

      audioStream.on('end', () => {
        console.log('[AudioRecorder] Audio stream ended');
      });

      audioStream.on('error', (error: any) => {
        console.error('[AudioRecorder] Stream error:', error);
      });
    }

    console.log('[AudioRecorder] macOS recording started');
  } catch (error) {
    console.error('[AudioRecorder] Failed to start macOS recording:', error);
    throw error;
  }
}

/**
 * Windows audio recording using FFmpeg
 */
function recordAudioWindows(speechService: SpeechRecognitionService): void {
  const { spawn } = require('child_process');

  try {
    // Using FFmpeg for Windows (if available)
    // This requires ffmpeg to be installed
    const ffmpeg = spawn('ffmpeg', [
      '-f', 'dshow',          // DirectShow format (Windows)
      '-i', 'audio="Microphone"', // default microphone
      '-acodec', 'pcm_s16le', // PCM 16-bit
      '-ar', '16000',         // 16kHz sample rate
      '-ac', '1',             // mono
      '-',                    // output to stdout
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    recordingProcess = ffmpeg;
    audioStream = ffmpeg.stdout;

    ffmpeg.stderr.on('data', (data: Buffer) => {
      // FFmpeg outputs progress info on stderr
      const line = data.toString().trim();
      if (line && !line.includes('deprecated')) {
        console.warn('[AudioRecorder] FFmpeg:', line);
      }
    });

    ffmpeg.on('error', (error: any) => {
      console.error('[AudioRecorder] FFmpeg error:', error);
      speechService.emit('error', 'Audio recording error');
    });

    if (audioStream) {
      audioStream.on('data', (chunk: Buffer) => {
        speechService.processAudioChunk(chunk);
      });

      audioStream.on('end', () => {
        console.log('[AudioRecorder] Audio stream ended');
      });
    }

    console.log('[AudioRecorder] Windows recording started');
  } catch (error) {
    console.error('[AudioRecorder] Failed to start Windows recording:', error);
    throw error;
  }
}

/**
 * Linux audio recording using arecord (ALSA)
 */
function recordAudioLinux(speechService: SpeechRecognitionService): void {
  const { spawn } = require('child_process');

  try {
    const arecord = spawn('arecord', [
      '-c', '1',              // mono
      '-f', 'S16_LE',         // 16-bit signed
      '-r', '16000',          // 16kHz sample rate
      '-',                    // output to stdout
    ]);

    recordingProcess = arecord;
    audioStream = arecord.stdout;

    arecord.stderr.on('data', (data: Buffer) => {
      console.warn('[AudioRecorder] arecord stderr:', data.toString());
    });

    arecord.on('error', (error: any) => {
      console.error('[AudioRecorder] arecord error:', error);
      speechService.emit('error', 'Audio recording error');
    });

    if (audioStream) {
      audioStream.on('data', (chunk: Buffer) => {
        speechService.processAudioChunk(chunk);
      });
    }

    console.log('[AudioRecorder] Linux recording started');
  } catch (error) {
    console.error('[AudioRecorder] Failed to start Linux recording:', error);
    throw error;
  }
}

/**
 * Stop audio recording
 */
export function stopAudioRecording(): void {
  if (recordingProcess) {
    recordingProcess.kill();
    recordingProcess = null;
  }

  if (audioStream) {
    audioStream.destroy();
    audioStream = null;
  }

  console.log('[AudioRecorder] Recording stopped');
}
