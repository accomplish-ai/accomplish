/**
 * Speech-to-Text Settings Component
 *
 * Allows users to:
 * - Enable/disable speech input
 * - Configure ElevenLabs API key
 * - Test the configuration
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
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
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
      onChange?.({ apiKey, enabled: true });
      onSave?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save API key';
      setSaveResult({ success: false, message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConfiguration = async () => {
    if (!apiKey.trim()) {
      setTestResult({ success: false, message: 'Please enter an API key first' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      // Test the configuration by making a simple API call
      const response = await fetch('https://api.elevenlabs.io/v1/models', {
        method: 'GET',
        headers: {
          'xi-api-key': apiKey.trim(),
        },
      });

      if (response.ok) {
        setTestResult({ success: true, message: 'Configuration is valid. Speech input is ready!' });
      } else if (response.status === 401 || response.status === 403) {
        setTestResult({ success: false, message: 'Invalid API key. Please check your ElevenLabs API key.' });
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = (errorData as { error?: { message?: string } })?.error?.message || `API returned status ${response.status}`;
        setTestResult({ success: false, message: `API error: ${errorMessage}` });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to test configuration';
      setTestResult({ success: false, message: `Network error: ${message}` });
    } finally {
      setIsTesting(false);
    }
  };

  const handleClearApiKey = async () => {
    try {
      await accomplish.removeApiKey('local-elevenlabs');
      setApiKey('');
      setSaveResult(null);
      setTestResult(null);
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
              href="https://elevenlabs.io/app/speech-to-speech"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline"
            >
              elevenlabs.io
            </a>
          </AlertDescription>
        </Alert>

        {/* API Key Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium">ElevenLabs API Key</label>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="xi-..."
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setSaveResult(null);
              }}
              disabled={isLoading}
            />
            {apiKey && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearApiKey}
                disabled={isLoading}
              >
                Clear
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
          <Button
            onClick={handleTestConfiguration}
            disabled={isTesting || !apiKey.trim()}
            variant="outline"
            className="flex-1"
          >
            {isTesting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Test Configuration
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

        {/* Test Result */}
        {testResult && (
          <Alert variant={testResult.success ? 'default' : 'destructive'}>
            {testResult.success ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <AlertDescription className="text-xs">{testResult.message}</AlertDescription>
          </Alert>
        )}

        {/* Usage Instructions */}
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-3 text-sm">
          <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">How to use:</p>
          <ul className="text-blue-800 dark:text-blue-200 space-y-1 text-xs">
            <li>• <strong>Click the microphone button</strong> to start recording, click again to stop</li>
            <li>• <strong>Hold Alt key</strong> to record voice input (push-to-talk mode)</li>
            <li>• Your speech will be transcribed and appended to the input field</li>
            <li>• Maximum recording duration: 2 minutes per message</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
