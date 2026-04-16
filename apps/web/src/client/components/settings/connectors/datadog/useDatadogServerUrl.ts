import { useState, useCallback, useEffect } from 'react';
import { DATADOG_REGIONS, findDatadogRegionByMcpUrl } from './regions';
import { getAccomplish } from '@/lib/accomplish';

interface UseDatadogServerUrl {
  serverUrl: string | null;
  selectedRegionId: string;
  setSelectedRegionId: (id: string) => void;
  saving: boolean;
  editing: boolean;
  setEditing: (v: boolean) => void;
  saveError: string | null;
  setSaveError: (v: string | null) => void;
  urlLoading: boolean;
  handleSaveRegion: (opts: {
    t: (key: string) => string;
    prefix: string;
    refetch: () => Promise<void>;
  }) => Promise<void>;
}

export function useDatadogServerUrl(): UseDatadogServerUrl {
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [urlLoading, setUrlLoading] = useState(true);

  useEffect(() => {
    getAccomplish()
      .datadogGetServerUrl()
      .then((url) => {
        setServerUrl(url);
        const region = findDatadogRegionByMcpUrl(url);
        if (region) {
          setSelectedRegionId(region.id);
        }
      })
      .catch(() => {})
      .finally(() => setUrlLoading(false));
  }, []);

  const handleSaveRegion = useCallback(
    async ({
      t,
      prefix,
      refetch,
    }: {
      t: (key: string) => string;
      prefix: string;
      refetch: () => Promise<void>;
    }) => {
      const region = DATADOG_REGIONS.find((r) => r.id === selectedRegionId);
      if (!region) {
        setSaveError(t(`${prefix}.regionRequired`));
        return;
      }

      setSaving(true);
      setSaveError(null);
      try {
        await getAccomplish().datadogSetServerUrl(region.mcpUrl);
        setServerUrl(region.mcpUrl);
        setEditing(false);
        await refetch();
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : t(`${prefix}.saveFailed`));
      } finally {
        setSaving(false);
      }
    },
    [selectedRegionId],
  );

  return {
    serverUrl,
    selectedRegionId,
    setSelectedRegionId,
    saving,
    editing,
    setEditing,
    saveError,
    setSaveError,
    urlLoading,
    handleSaveRegion,
  };
}
