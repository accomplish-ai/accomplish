import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getAccomplish } from '@/lib/accomplish';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import type { ConnectedProvider } from '@accomplish_ai/agent-core/common';
import type { HuggingFaceLocalCredentials } from '@accomplish_ai/agent-core/common';
import {
  ConnectButton,
  ConnectedControls,
  ProviderFormHeader,
  FormError,
  ModelSelector,
} from '../shared';
import huggingfaceLogo from '/assets/ai-logos/huggingface.svg';

interface SuggestedModel {
  id: string;
  displayName: string;
  downloaded: boolean;
  sizeBytes?: number;
}

interface HuggingFaceProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

/** Download progress bar */
function DownloadProgressBar({ progress, modelId }: { progress: number; modelId: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="truncate max-w-[220px]">{modelId}</span>
        <span>{progress}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full rounded-full bg-[#FF9D00]"
          initial={{ width: '0%' }}
          animate={{ width: `${progress}%` }}
          transition={{ ease: 'easeOut', duration: 0.3 }}
        />
      </div>
    </div>
  );
}

export function HuggingFaceProviderForm({
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: HuggingFaceProviderFormProps) {
  const [selectedModelId, setSelectedModelId] = useState(
    'onnx-community/Llama-3.2-1B-Instruct-ONNX',
  );
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [suggestedModels, setSuggestedModels] = useState<SuggestedModel[]>([]);
  const [cachedModels, setCachedModels] = useState<SuggestedModel[]>([]);
  const isConnected = connectedProvider?.connectionStatus === 'connected';

  // Populate model selector on mount so users can pick a model before connecting
  useEffect(() => {
    const accomplish = getAccomplish();
    accomplish
      .listHuggingFaceModels()
      .then(({ cached, suggested }) => {
        setCachedModels(cached);
        setSuggestedModels(suggested);
        // Only pre-select when no explicit choice has been made
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

  // Keep download progress state in sync via IPC events pushed from the main process
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

      // Download model (streams progress via IPC events)
      const downloadResult = await accomplish.downloadHuggingFaceModel(selectedModelId);
      if (!downloadResult.success) {
        setError(downloadResult.error ?? 'Download failed');
        setIsDownloading(false);
        setConnecting(false);
        return;
      }

      setIsDownloading(false);

      // Start the inference server
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

  // Build model selector options: cached first (raw ID), then suggested not yet downloaded
  const allModels = [
    ...cachedModels.map((m) => ({ id: m.id, name: `${m.displayName} ✓` })),
    ...suggestedModels
      .filter((s) => !cachedModels.some((c) => c.id === s.id))
      .map((m) => ({ id: m.id, name: m.displayName })),
  ];

  const connectedModelId = (
    connectedProvider?.credentials as HuggingFaceLocalCredentials | undefined
  )?.modelId;

  return (
    <div
      className="rounded-xl border border-border bg-card p-5"
      data-testid="provider-settings-panel"
    >
      <ProviderFormHeader logoSrc={huggingfaceLogo} providerName="HuggingFace Local" />

      <div className="space-y-3">
        <AnimatePresence mode="wait">
          {!isConnected ? (
            <motion.div
              key="disconnected"
              variants={settingsVariants.fadeSlide}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={settingsTransitions.enter}
              className="space-y-3"
            >
              {/* Info banner */}
              <div className="flex items-start gap-2 rounded-md border border-blue-500/20 bg-blue-500/8 p-3 text-xs text-blue-400">
                <svg
                  className="mt-0.5 h-4 w-4 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>
                  Runs ONNX models locally via Transformers.js — no cloud API required. First run
                  downloads the model (~0.5–4 GB).
                </span>
              </div>

              {/* Model picker */}
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  Select Model
                </label>
                {allModels.length > 0 ? (
                  <ModelSelector
                    models={allModels}
                    value={selectedModelId}
                    onChange={setSelectedModelId}
                    error={false}
                  />
                ) : (
                  <select
                    value={selectedModelId}
                    onChange={(e) => setSelectedModelId(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                  >
                    <option value="onnx-community/Llama-3.2-1B-Instruct-ONNX">
                      Llama 3.2 1B Instruct (ONNX)
                    </option>
                    <option value="onnx-community/Phi-3.5-mini-instruct-onnx">
                      Phi-3.5 Mini Instruct (ONNX)
                    </option>
                    <option value="onnx-community/Qwen2.5-0.5B-Instruct">
                      Qwen2.5 0.5B Instruct (ONNX)
                    </option>
                    <option value="Xenova/distilgpt2">DistilGPT-2 (tiny, for testing)</option>
                  </select>
                )}
              </div>

              {/* Download progress */}
              {isDownloading && (
                <DownloadProgressBar progress={downloadProgress} modelId={selectedModelId} />
              )}

              <FormError error={error} />
              <ConnectButton onClick={handleConnect} connecting={connecting} />
            </motion.div>
          ) : (
            <motion.div
              key="connected"
              variants={settingsVariants.fadeSlide}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={settingsTransitions.enter}
              className="space-y-3"
            >
              {/* Current model display */}
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  Active Model
                </label>
                <input
                  type="text"
                  value={connectedModelId ?? ''}
                  disabled
                  className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                />
              </div>

              <ConnectedControls onDisconnect={handleDisconnect} />

              {/* Model selector for switching */}
              {allModels.length > 1 && (
                <ModelSelector
                  models={allModels}
                  value={connectedModelId ?? null}
                  onChange={onModelChange}
                  error={showModelError && !connectedModelId}
                />
              )}

              {/* Status footer */}
              <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                <span className="flex h-2 w-2 rounded-full bg-green-500" />
                <span>Inference server running locally</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
