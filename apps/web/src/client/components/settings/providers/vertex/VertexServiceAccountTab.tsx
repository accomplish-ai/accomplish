import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { VERTEX_LOCATIONS } from './locations';

interface VertexServiceAccountTabProps {
  serviceAccountJson: string;
  projectId: string;
  location: string;
  onJsonChange: (json: string) => void;
  onProjectIdChange: (projectId: string) => void;
  onLocationChange: (location: string) => void;
}

export function VertexServiceAccountTab({
  serviceAccountJson,
  projectId,
  location,
  onJsonChange,
  onProjectIdChange,
  onLocationChange,
}: VertexServiceAccountTabProps) {
  const { t } = useTranslation('settings');
  const [pasteMode, setPasteMode] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [clientEmail, setClientEmail] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processJson = useCallback(
    (json: string, name?: string) => {
      setJsonError(null);
      setClientEmail(null);

      if (!json.trim()) {
        onJsonChange('');
        setFileName(null);
        return;
      }

      try {
        const parsed = JSON.parse(json);
        if (!parsed.type || !parsed.project_id || !parsed.private_key || !parsed.client_email) {
          setJsonError(t('vertex.missingFields'));
          return;
        }
        onJsonChange(json);
        setClientEmail(parsed.client_email);
        if (name) setFileName(name);
        // Auto-fill project ID from the key
        if (parsed.project_id && !projectId) {
          onProjectIdChange(parsed.project_id);
        }
      } catch {
        setJsonError(t('vertex.invalidJson'));
      }
    },
    [onJsonChange, onProjectIdChange, projectId, t],
  );

  const handleFileRead = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        processJson(content, file.name);
      };
      reader.readAsText(file);
    },
    [processJson],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file?.name.endsWith('.json')) {
        handleFileRead(file);
      } else {
        setJsonError(t('vertex.dropJsonFile'));
      }
    },
    [handleFileRead, t],
  );

  const handleBrowse = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileRead(file);
    },
    [handleFileRead],
  );

  return (
    <div className="space-y-3">
      {/* JSON input toggle */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">
          {t('vertex.serviceAccountKey')}
        </label>
        <button
          type="button"
          onClick={() => setPasteMode(!pasteMode)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {pasteMode ? t('vertex.uploadFile') : t('vertex.pasteJson')}
        </button>
      </div>

      {pasteMode ? (
        <textarea
          value={serviceAccountJson}
          onChange={(e) => processJson(e.target.value)}
          placeholder={t('vertex.pasteJsonPlaceholder')}
          data-testid="vertex-sa-json-textarea"
          rows={6}
          className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm font-mono resize-none"
        />
      ) : (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
              isDragOver
                ? 'border-provider-accent bg-provider-accent/5'
                : serviceAccountJson
                  ? 'border-provider-accent/50 bg-provider-accent/5'
                  : 'border-muted-foreground/30 hover:border-muted-foreground/50'
            }`}
          >
            {serviceAccountJson && fileName ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">{fileName}</p>
                {clientEmail && <p className="text-xs text-muted-foreground">{clientEmail}</p>}
                <button
                  type="button"
                  onClick={() => {
                    onJsonChange('');
                    setFileName(null);
                    setClientEmail(null);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {t('vertex.remove')}
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-2">{t('vertex.dropJsonHere')}</p>
                <button
                  type="button"
                  onClick={handleBrowse}
                  className="text-sm font-medium text-provider-accent hover:text-provider-accent-text"
                >
                  {t('vertex.browseFiles')}
                </button>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileInput}
            className="hidden"
          />
        </>
      )}

      {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}

      {/* Project ID */}
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">
          {t('vertex.projectId')}
        </label>
        <input
          type="text"
          value={projectId}
          onChange={(e) => onProjectIdChange(e.target.value)}
          placeholder={t('vertex.projectIdPlaceholder')}
          data-testid="vertex-project-id"
          className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
        />
      </div>

      {/* Location */}
      <SearchableSelect
        items={VERTEX_LOCATIONS}
        value={location}
        onChange={onLocationChange}
        label={t('vertex.location')}
        placeholder={t('vertex.selectLocation')}
        searchPlaceholder={t('vertex.searchLocations')}
        emptyMessage={t('vertex.noLocationsFound')}
        testId="vertex-location-select"
      />
    </div>
  );
}
