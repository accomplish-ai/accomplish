import type { ConnectedProvider } from '@accomplish_ai/agent-core';

export interface UseVertexProviderConnectReturn {
  authTab: 'serviceAccount' | 'adc';
  setAuthTab: (tab: 'serviceAccount' | 'adc') => void;
  serviceAccountJson: string;
  setServiceAccountJson: (v: string) => void;
  projectId: string;
  setProjectId: (v: string) => void;
  location: string;
  setLocation: (v: string) => void;
  connecting: boolean;
  error: string | null;
  availableModels: Array<{ id: string; name: string }>;
  customModelInput: string;
  setCustomModelInput: (v: string) => void;
  customModelError: string | null;
  setCustomModelError: (v: string | null) => void;
  handleConnect: () => Promise<void>;
  handleAddCustomModel: () => void;
  handleRemoveCustomModel: (modelId: string) => void;
}

export interface UseVertexProviderConnectParams {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onModelChange: (modelId: string) => void;
}
