/**
 * Microphone Button Component
 * Provides UI for voice input with visual feedback
 */

import React, { useEffect, useState } from 'react';
import { Mic, MicOff, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MicrophoneButtonProps {
  isListening?: boolean;
  isProcessing?: boolean;
  wakeWordDetected?: boolean;
  error?: string | null;
  onStartListening?: () => void;
  onStopListening?: () => void;
  disabled?: boolean;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const MicrophoneButton = React.forwardRef<HTMLButtonElement, MicrophoneButtonProps>(
  (
    {
      isListening = false,
      isProcessing = false,
      wakeWordDetected = false,
      error = null,
      onStartListening,
      onStopListening,
      disabled = false,
      showLabel = false,
      size = 'md',
      className,
    },
    ref
  ) => {
    const [showError, setShowError] = useState(false);

    useEffect(() => {
      if (error) {
        setShowError(true);
        const timeout = setTimeout(() => setShowError(false), 5000);
        return () => clearTimeout(timeout);
      }
    }, [error]);

    const handleClick = () => {
      if (isListening && onStopListening) {
        onStopListening();
      } else if (!isListening && onStartListening) {
        onStartListening();
      }
    };

    const sizeClasses = {
      sm: 'h-8 w-8',
      md: 'h-10 w-10',
      lg: 'h-12 w-12',
    };

    const iconSizes = {
      sm: 'h-4 w-4',
      md: 'h-5 w-5',
      lg: 'h-6 w-6',
    };

    return (
      <div className="relative">
        {/* Microphone Button */}
        <button
          ref={ref}
          onClick={handleClick}
          disabled={disabled || isProcessing}
          data-testid="microphone-button"
          className={cn(
            'relative rounded-lg transition-all duration-200 ease-accomplish',
            'flex items-center justify-center',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            sizeClasses[size],
            {
              // Listening state
              'bg-red-500 hover:bg-red-600 text-white shadow-lg': isListening,
              // Pulse animation when listening
              'animate-pulse': isListening && !isProcessing,
              // Processing state
              'bg-yellow-500 hover:bg-yellow-600 text-white': isProcessing,
              // Wake word detected state
              'bg-blue-500 hover:bg-blue-600 text-white ring-2 ring-blue-300': 
                wakeWordDetected && !isListening,
              // Normal state
              'bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed':
                !isListening && !isProcessing && !wakeWordDetected && !error,
              // Error state
              'bg-destructive hover:bg-destructive/90 text-destructive-foreground':
                error && showError,
            },
            className
          )}
          title={
            isListening
              ? 'Stop listening (click or stay silent)'
              : isProcessing
              ? 'Processing audio...'
              : wakeWordDetected
              ? 'Wake word detected - click to continue'
              : 'Start listening'
          }
        >
          {isProcessing ? (
            <Loader2 className={cn('animate-spin', iconSizes[size])} />
          ) : isListening ? (
            <Mic className={iconSizes[size]} />
          ) : (
            <MicOff className={iconSizes[size]} />
          )}
        </button>

        {/* Wake Word Indicator */}
        {wakeWordDetected && !isListening && (
          <div
            className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-blue-400 animate-pulse"
            title="Wake word detected"
            data-testid="wake-word-indicator"
          />
        )}

        {/* Listening Indicator Ring */}
        {isListening && (
          <div
            className="absolute inset-0 rounded-lg border-2 border-red-500 animate-pulse"
            style={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}
            aria-hidden="true"
          />
        )}

        {/* Error Indicator */}
        {error && showError && (
          <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-600 animate-pulse" />
        )}

        {/* Label */}
        {showLabel && (
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
            <span className="text-xs font-medium text-muted-foreground">
              {isListening ? 'Listening...' : isProcessing ? 'Processing...' : 'Voice Input'}
            </span>
          </div>
        )}

        {/* Error Tooltip */}
        {error && showError && (
          <div
            className="absolute top-full left-1/2 -translate-x-1/2 mt-2 p-2 bg-destructive text-destructive-foreground text-xs rounded-md whitespace-nowrap shadow-lg z-50 flex items-center gap-1"
            role="alert"
            data-testid="microphone-error"
          >
            <AlertCircle className="h-3 w-3" />
            {error}
          </div>
        )}
      </div>
    );
  }
);

MicrophoneButton.displayName = 'MicrophoneButton';

export { MicrophoneButton };
