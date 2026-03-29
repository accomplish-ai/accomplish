import { useState, useEffect } from 'react';
import { getAccomplish } from '@/lib/accomplish';
import type { ConnectedProvider } from '@accomplish_ai/agent-core/common';
import type { HuggingFaceLocalCredentials } from '@accomplish_ai/agent-core/common';

export interface SuggestedModel {
  id: string;
  displayName: string;
  downloaded: boolean;
  sizeBytes?: number;
}

export interface UseHuggingFaceProviderConnectReturn {
  selectedModelId: string;
  setSelectedModelId: (id: string) => void;
  connecting: boolean;
  error: string | null;
  downloadProgress: number;
  isDownloading: boolean;
  suggestedModels: SuggestedModel[];
  cachedModels: SuggestedModel[];
  allModels: Array<{ id: string; name: string }>;
  handleConnect: () => Promise<void>;
  handleDisconnect: () => Promise<void>;
}

interface UseHuggingFaceProviderConnectParams {
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
}

export function useHuggingFaceProviderConnect({
  onConnect,
  onDisconnect,
}: UseHuggingFaceProviderConnectParams): UseHuggingFaceProviderConnectReturn {
  const [selectedModelId, setSelectedModelId] = useState(
    'onnx-community/Llama-3.2-1B-Instruct-ONNX',
  );
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [suggestedModels, setSuggestedModels] = useState<SuggestedModel[]>([]);
  const [cachedModels, setCachedModels] = useState<SuggestedModel[]>([]);

  useEffect(() => {
    const accomplish = getAccomplish();
    accomplish
      .listHuggingFaceModels()
      .then(({ cached, suggested }) => {
        setCachedModels(cached);
        setSuggestedModels(suggested);
        if (cached.length > 0 && cached[0]?.id) {
          setSelectedModelId((prev) =>
            prev === 'onnx-community/Llama-3.2-1B-Instruct-ONNX' ? cached[0].id : prev,
          );
        }
      })
      .catch(() => {
        // Non-fatal: suggested models will still be shown
      });
  }, []);

  useEffect(() => {
    const accomplish = getAccomplish();
    const unsub = accomplish.onHuggingFaceDownloadProgress((progress) => {
      if (progress.status === 'downloading') {
        setDownloadProgress(progress.progress);
      } else if (progress.status === 'complete') {
        setDownloadProgress(100);
        setIsDownloading(false);
      } else if (progress.status === 'error') {
        setIsDownloading(false);
        setError(progress.error ?? 'Download failed');
      }
    });
    return () => {
      unsub();
    };
  }, []);

  const handleConnect = async () => {
    if (!selectedModelId) {
      setError('Please select a model first');
      return;
    }

    setConnecting(true);
    setIsDownloading(true);
    setDownloadProgress(0);
    setError(null);

    try {
      const accomplish = getAccomplish();

      const downloadResult = await accomplish.downloadHuggingFaceModel(selectedModelId);
      if (!downloadResult.success) {
        setError(downloadResult.error ?? 'Download failed');
        setIsDownloading(false);
        setConnecting(false);
        return;
      }

      setIsDownloading(false);

      const serverResult = await accomplish.startHuggingFaceServer(selectedModelId);
      if (!serverResult.success) {
        setError(serverResult.error ?? 'Failed to start inference server');
        setConnecting(false);
        return;
      }

      const modelDisplayId = `huggingface-local/${selectedModelId}`;

      const provider: ConnectedProvider = {
        providerId: 'huggingface-local',
        connectionStatus: 'connected',
        selectedModelId: modelDisplayId,
        credentials: {
          type: 'huggingface-local',
          modelId: selectedModelId,
        } as HuggingFaceLocalCredentials,
        lastConnectedAt: new Date().toISOString(),
        availableModels: [
          {
            id: modelDisplayId,
            name: selectedModelId.split('/').pop() ?? selectedModelId,
          },
        ],
      };

      onConnect(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      setIsDownloading(false);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      const accomplish = getAccomplish();
      await accomplish.stopHuggingFaceServer();
    } catch {
      // Ignore errors during disconnect
    }
    onDisconnect();
  };

  const allModels = [
    ...cachedModels.map((m) => ({ id: m.id, name: `${m.displayName} ✓` })),
    ...suggestedModels
      .filter((s) => !cachedModels.some((c) => c.id === s.id))
      .map((m) => ({ id: m.id, name: m.displayName })),
  ];

  return {
    selectedModelId,
    setSelectedModelId,
    connecting,
    error,
    downloadProgress,
    isDownloading,
    suggestedModels,
    cachedModels,
    allModels,
    handleConnect,
    handleDisconnect,
  };
}
