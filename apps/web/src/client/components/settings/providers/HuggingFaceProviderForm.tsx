import { AnimatePresence, motion } from 'framer-motion';
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
import { useHuggingFaceProviderConnect } from './useHuggingFaceProviderConnect';

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
  const {
    selectedModelId,
    setSelectedModelId,
    connecting,
    error,
    downloadProgress,
    isDownloading,
    allModels,
    handleConnect,
    handleDisconnect,
  } = useHuggingFaceProviderConnect({ onConnect, onDisconnect });

  const isConnected = connectedProvider?.connectionStatus === 'connected';

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
