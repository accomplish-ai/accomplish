/**
 * Speech-to-Text Settings Component
 *
 * Allows users to:
 * - Enable/disable speech input
 * - Configure ElevenLabs API key
 * - Verify configuration by attempting transcription
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mic, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { getAccomplish } from '../../lib/accomplish';

interface SpeechSettingsFormProps {
  /**
   * Callback when API key is saved
   */
  onSave?: () => void;

  /**
   * Callback when configuration changes
   */
  onChange?: (config: { apiKey: string; enabled: boolean }) => void;
}

export function SpeechSettingsForm({ onSave, onChange }: SpeechSettingsFormProps) {
  const accomplish = getAccomplish();

  const [apiKey, setApiKey] = useState('');
  const [isConfigured, setIsConfigured] = useState(false);

  // Load existing configuration on mount
  useEffect(() => {
    accomplish.speechGetConfig().then((config) => {
      setIsConfigured(config.hasApiKey);
    });
  }, [accomplish]);
  const [isLoading, setIsLoading] = useState(false);
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) {
      setSaveResult({ success: false, message: 'API key is required' });
      return;
    }

    setIsLoading(true);
    setSaveResult(null);

    try {
      // Save the API key
      await accomplish.addApiKey('elevenlabs', apiKey, 'ElevenLabs Speech-to-Text');
      setSaveResult({ success: true, message: 'API key saved successfully' });
      setIsConfigured(true);
      setApiKey(''); // Clear the input after saving
      onChange?.({ apiKey, enabled: true });
      onSave?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save API key';
      setSaveResult({ success: false, message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearApiKey = async () => {
    try {
      await accomplish.removeApiKey('local-elevenlabs');
      setApiKey('');
      setIsConfigured(false);
      setSaveResult(null);
      onChange?.({ apiKey: '', enabled: false });
    } catch (error) {
      console.error('Failed to remove API key:', error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mic className="h-5 w-5 text-blue-500" />
          <div>
            <CardTitle>Speech-to-Text</CardTitle>
            <CardDescription>
              Enable voice input using ElevenLabs Speech-to-Text API
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Info section */}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            To use speech input, you need an ElevenLabs API key. Get one at{' '}
            <a
              href="https://elevenlabs.io/app/settings/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline"
            >
              elevenlabs.io
            </a>
          </AlertDescription>
        </Alert>

        {/* Existing configuration status */}
        {isConfigured && !apiKey && (
          <Alert>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-xs">
              ElevenLabs API key is configured. Enter a new key below to replace it.
            </AlertDescription>
          </Alert>
        )}

        {/* API Key Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium">ElevenLabs API Key</label>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder={isConfigured ? '••••••••••••••••' : 'xi-...'}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setSaveResult(null);
              }}
              disabled={isLoading}
            />
            {(apiKey || isConfigured) && (
              <Button
                type="button"
                onClick={handleClearApiKey}
                variant="ghost"
                size="icon"
                disabled={isLoading}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Your API key is stored securely in your system keychain.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={handleSaveApiKey}
            disabled={isLoading || !apiKey.trim()}
            className="flex-1"
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save API Key
          </Button>
        </div>

        {/* Save Result */}
        {saveResult && (
          <Alert variant={saveResult.success ? 'default' : 'destructive'}>
            {saveResult.success ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <AlertDescription className="text-xs">{saveResult.message}</AlertDescription>
          </Alert>
        )}

        {/* Usage Instructions */}
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-3 text-sm">
          <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">How to use:</p>
          <ul className="text-blue-800 dark:text-blue-200 space-y-1 text-xs">
            <li>• <strong>Click the microphone button</strong> to start recording, click again to stop</li>
            <li>• <strong>Hold Alt key</strong> to record voice input (push-to-talk mode)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
