import { useTranslation } from 'react-i18next';

interface VertexJsonUploadZoneProps {
  serviceAccountJson: string;
  fileName: string | null;
  clientEmail: string | null;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onBrowse: () => void;
  onRemove: () => void;
}

export function VertexJsonUploadZone({
  serviceAccountJson,
  fileName,
  clientEmail,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onBrowse,
  onRemove,
}: VertexJsonUploadZoneProps) {
  const { t } = useTranslation('settings');

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
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
            onClick={onRemove}
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
            onClick={onBrowse}
            className="text-sm font-medium text-provider-accent hover:text-provider-accent-text"
          >
            {t('vertex.browseFiles')}
          </button>
        </>
      )}
    </div>
  );
}
