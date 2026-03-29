import { useState, useCallback } from 'react';
import { getAccomplish } from '@/lib/accomplish';
import { hasAnyReadyProvider } from '@accomplish_ai/agent-core/common';
import { createLogger } from '@/lib/logger';

const logger = createLogger('HomePageSettings');

type SettingsTab = 'providers' | 'voice' | 'skills' | 'connectors';

interface UseHomePageSettingsParams {
  onResume: () => Promise<void>;
}

export interface UseHomePageSettingsReturn {
  showSettingsDialog: boolean;
  settingsInitialTab: SettingsTab;
  resumeAfterSettingsSave: boolean;
  setResumeAfterSettingsSave: (v: boolean) => void;
  setShowSettingsDialog: (v: boolean) => void;
  setSettingsInitialTab: (tab: SettingsTab) => void;
  handleSettingsDialogChange: (open: boolean) => void;
  handleOpenSpeechSettings: () => void;
  handleOpenModelSettings: () => void;
  handleOpenSettings: (tab: SettingsTab) => void;
  handleApiKeySaved: () => Promise<void>;
}

export function useHomePageSettings({
  onResume,
}: UseHomePageSettingsParams): UseHomePageSettingsReturn {
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>('providers');
  const [resumeAfterSettingsSave, setResumeAfterSettingsSave] = useState(false);

  const accomplish = getAccomplish();

  const handleSettingsDialogChange = useCallback((open: boolean) => {
    setShowSettingsDialog(open);
    if (!open) {
      setResumeAfterSettingsSave(false);
      setSettingsInitialTab('providers');
    }
  }, []);

  const handleOpenSpeechSettings = useCallback(() => {
    setSettingsInitialTab('voice');
    setShowSettingsDialog(true);
  }, []);

  const handleOpenModelSettings = useCallback(() => {
    setSettingsInitialTab('providers');
    setShowSettingsDialog(true);
  }, []);

  const handleOpenSettings = useCallback((tab: SettingsTab) => {
    setSettingsInitialTab(tab);
    setShowSettingsDialog(true);
  }, []);

  const handleApiKeySaved = useCallback(async () => {
    if (!resumeAfterSettingsSave) {
      setShowSettingsDialog(false);
      return;
    }
    try {
      const settings = await accomplish.getProviderSettings();
      if (!hasAnyReadyProvider(settings)) {
        setSettingsInitialTab('providers');
        setShowSettingsDialog(true);
        return;
      }
      setShowSettingsDialog(false);
      await onResume();
      setResumeAfterSettingsSave(false);
    } catch (err) {
      logger.error('Failed to resume task after settings save:', err);
    }
  }, [resumeAfterSettingsSave, accomplish, onResume]);

  return {
    showSettingsDialog,
    settingsInitialTab,
    resumeAfterSettingsSave,
    setResumeAfterSettingsSave,
    setShowSettingsDialog,
    setSettingsInitialTab,
    handleSettingsDialogChange,
    handleOpenSpeechSettings,
    handleOpenModelSettings,
    handleOpenSettings,
    handleApiKeySaved,
  };
}
