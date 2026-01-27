import { AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './ui/button';

interface AuthErrorToastProps {
  error: { providerId: string; message: string } | null;
  onReLogin: () => void;
  onDismiss: () => void;
}

const PROVIDER_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  bedrock: 'AWS Bedrock',
  openrouter: 'OpenRouter',
  xai: 'xAI',
  deepseek: 'DeepSeek',
  moonshot: 'Moonshot AI',
  ollama: 'Ollama',
  litellm: 'LiteLLM',
};

export function AuthErrorToast({ error, onReLogin, onDismiss }: AuthErrorToastProps) {
  if (!error) return null;

  const providerName = PROVIDER_NAMES[error.providerId] || error.providerId;

  return (
    <AnimatePresence>
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="fixed bottom-4 right-4 z-50 max-w-md"
          data-testid="auth-error-toast"
        >
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 shadow-lg backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/20 flex-shrink-0">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-medium text-foreground">
                    {providerName} Session Expired
                  </h4>
                  <button
                    onClick={onDismiss}
                    className="flex-shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    data-testid="auth-error-toast-dismiss"
                    aria-label="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {error.message}
                </p>
                <div className="mt-3">
                  <Button
                    size="sm"
                    onClick={onReLogin}
                    data-testid="auth-error-toast-relogin"
                  >
                    Re-login to {providerName}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
