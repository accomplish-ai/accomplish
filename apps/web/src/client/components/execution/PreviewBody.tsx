/**
 * PreviewBody — Main content/frame area for BrowserPreview.
 *
 * Renders the live browser frame image or a placeholder state view
 * depending on the current ViewStatus.
 * Extracted from BrowserPreview as part of ENG-982 refactor.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AlertCircle, Monitor } from 'lucide-react';
import type { ViewStatus } from './StatusBadge';

interface PreviewBodyProps {
  status: ViewStatus;
  frameData: string | null;
  imgRef: React.RefObject<HTMLImageElement | null>;
  error: string | undefined;
  isCollapsed: boolean;
}

function renderStatusContent(
  status: ViewStatus,
  frameData: string | null,
  imgRef: React.RefObject<HTMLImageElement | null>,
  error: string | undefined,
): React.ReactNode {
  if (status === 'streaming' || (status === 'starting' && frameData)) {
    return (
      <motion.div
        key="frame"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="w-full h-full"
      >
        <img
          ref={imgRef}
          alt="Browser preview"
          className="w-full h-full object-contain"
          draggable={false}
          src={frameData ? `data:image/jpeg;base64,${frameData}` : undefined}
        />
        {status === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="flex items-center gap-2 text-white/80">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Connecting…</span>
            </div>
          </div>
        )}
      </motion.div>
    );
  }

  if (status === 'starting') {
    return (
      <motion.div
        key="starting"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 flex items-center justify-center"
      >
        <div className="flex items-center gap-2 text-white/80">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Connecting…</span>
        </div>
      </motion.div>
    );
  }

  if (status === 'stopping') {
    return (
      <motion.div
        key="stopping"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 flex items-center justify-center"
      >
        <div className="flex items-center gap-2 text-muted-foreground/80">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Disconnecting…</span>
        </div>
      </motion.div>
    );
  }

  if (status === 'error') {
    return (
      <motion.div
        key="error"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 flex items-center justify-center"
      >
        <div className="flex flex-col items-center gap-2 text-destructive/80">
          <AlertCircle className="h-8 w-8" />
          <span className="text-sm">{error ?? 'Stream error'}</span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      key="idle"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 flex items-center justify-center"
    >
      <div className="flex flex-col items-center gap-2 text-muted-foreground/50">
        <Monitor className="h-8 w-8" />
        <span className="text-sm">Waiting for browser…</span>
      </div>
    </motion.div>
  );
}

export function PreviewBody({ status, frameData, imgRef, error, isCollapsed }: PreviewBodyProps) {
  return (
    <AnimatePresence>
      {!isCollapsed && (
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: 'auto' }}
          exit={{ height: 0 }}
          className="overflow-hidden"
        >
          <div className="relative aspect-video bg-black">
            <AnimatePresence mode="wait">
              {renderStatusContent(status, frameData, imgRef, error)}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
