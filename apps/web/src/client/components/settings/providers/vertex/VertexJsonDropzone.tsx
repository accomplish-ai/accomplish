import { useTranslation } from 'react-i18next';

interface VertexJsonDropzoneProps {
  isDragOver: boolean;
  serviceAccountJson: string;
  fileName: string | null;
  clientEmail: string | null;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onBrowse: () => void;
  onClear: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function VertexJsonDropzone({
  isDragOver,
  serviceAccountJson,
  fileName,
  clientEmail,
  onDragOver,
  onDragLeave,
  onDrop,
  onBrowse,
  onClear,
  fileInputRef,
  onFileInput,
}: VertexJsonDropzoneProps) {
  const { t } = useTranslation('settings');

  let variantClass: string;
  if (isDragOver) {
    variantClass = 'border-provider-accent bg-provider-accent/5';
  } else if (serviceAccountJson) {
    variantClass = 'border-provider-accent/50 bg-provider-accent/5';
  } else {
    variantClass = 'border-muted-foreground/30 hover:border-muted-foreground/50';
  }

  return (
    <>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${variantClass}`}
      >
        {serviceAccountJson && fileName ? (
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">{fileName}</p>
            {clientEmail && <p className="text-xs text-muted-foreground">{clientEmail}</p>}
            <button
              type="button"
              onClick={onClear}
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
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={onFileInput}
        className="hidden"
      />
    </>
  );
}
