import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { springs } from '../lib/animations';
import { useTaskStore } from '../stores/taskStore';

interface BrowserPreviewProps {
  taskId: string;
}

export function BrowserPreview({ taskId }: BrowserPreviewProps) {
  const [expanded, setExpanded] = useState(true);
  const frame = useTaskStore(state => state.browserFrames.get(taskId));
  const containerRef = useRef<HTMLDivElement>(null);

  if (!frame) return null;

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.gentle}
      className="bg-card border border-border rounded-2xl overflow-hidden max-w-[85%] mt-2"
    >
      {/* Header with controls */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/50">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-primary">Browser Preview</span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Frame display - collapsible */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="relative bg-black">
              <img
                src={`data:image/jpeg;base64,${frame.data}`}
                alt="Browser preview"
                className="w-full h-auto"
                style={{ maxHeight: '400px' }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
