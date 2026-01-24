// apps/desktop/src/renderer/components/settings/shared/FormError.tsx

import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';

interface FormErrorProps {
  error: string | null;
}

export function FormError({ error }: FormErrorProps) {
  return (
    <AnimatePresence>
      {error && (
        <motion.p
          className="text-sm text-destructive"
          variants={settingsVariants.fadeSlide}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={settingsTransitions.enter}
        >
          {error}
        </motion.p>
      )}
    </AnimatePresence>
  );
}
