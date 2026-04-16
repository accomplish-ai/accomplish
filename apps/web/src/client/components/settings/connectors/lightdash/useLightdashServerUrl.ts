import { useState, useCallback, useEffect } from 'react';
import { normalizeLightdashUrl } from './normalize-url';
import { getAccomplish } from '@/lib/accomplish';

interface UseLightdashServerUrl {
  serverUrl: string | null;
  urlInput: string;
  setUrlInput: (v: string) => void;
  saving: boolean;
  editing: boolean;
  setEditing: (v: boolean) => void;
  urlError: string | null;
  setUrlError: (v: string | null) => void;
  urlLoading: boolean;
  handleSaveUrl: (opts: {
    t: (key: string) => string;
    prefix: string;
    refetch: () => Promise<void>;
  }) => Promise<void>;
}

export function useLightdashServerUrl(): UseLightdashServerUrl {
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlLoading, setUrlLoading] = useState(true);

  useEffect(() => {
    getAccomplish()
      .lightdashGetServerUrl()
      .then((url) => {
        setServerUrl(url);
        if (url) {
          setUrlInput(url);
        }
      })
      .catch(() => {
        // Failed to load server URL — leave as null
      })
      .finally(() => setUrlLoading(false));
  }, []);

  const handleSaveUrl = useCallback(
    async ({
      t,
      prefix,
      refetch,
    }: {
      t: (key: string) => string;
      prefix: string;
      refetch: () => Promise<void>;
    }) => {
      const normalized = normalizeLightdashUrl(urlInput);
      if (!normalized) {
        setUrlError(t(`${prefix}.instanceUrlRequired`));
        return;
      }
      try {
        new URL(normalized);
      } catch {
        setUrlError(t(`${prefix}.instanceUrlRequired`));
        return;
      }

      setSaving(true);
      setUrlError(null);
      try {
        await getAccomplish().lightdashSetServerUrl(normalized);
        setServerUrl(normalized);
        setUrlInput(normalized);
        setEditing(false);
        await refetch();
      } catch (err) {
        setUrlError(err instanceof Error ? err.message : t(`${prefix}.saveFailed`));
      } finally {
        setSaving(false);
      }
    },
    [urlInput],
  );

  return {
    serverUrl,
    urlInput,
    setUrlInput,
    saving,
    editing,
    setEditing,
    urlError,
    setUrlError,
    urlLoading,
    handleSaveUrl,
  };
}
