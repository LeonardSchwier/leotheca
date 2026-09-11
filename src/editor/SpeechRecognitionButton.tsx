/**
 * Speech recognition button component
 * 
 * Provides a UI button for starting/stopping speech-to-text dictation.
 * Shows visual feedback for recording, transcribing, and error states.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { SpeechController, getGlobalSpeechController } from '../speech/speechController';
import type { SpeechRecognitionState, SpeechRecognitionResult, SpeechRecognitionError } from '../speech/types';

// Icon components for different states
const MicrophoneIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
  </svg>
);

const RecordingIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
    <circle cx="12" cy="12" r="3" fill="#f44336" />
  </svg>
);



const ErrorIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
  </svg>
);

const LoadingIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
  </svg>
);

interface SpeechRecognitionButtonProps {
  /** Whether the editor is read-only (speech should be disabled) */
  readOnly?: boolean;
  /** Callback when speech result is available */
  onResult?: (text: string) => void;
  /** Callback when speech error occurs */
  onError?: (error: SpeechRecognitionError) => void;
  /** Callback when speech state changes */
  onStateChange?: (state: SpeechRecognitionState) => void;
  /** Language to use for speech recognition */
  language?: string;
}

export function SpeechRecognitionButton({
  readOnly = false,
  onResult,
  onError,
  onStateChange,
  language,
}: SpeechRecognitionButtonProps) {
  const [state, setState] = useState<SpeechRecognitionState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState<boolean>(false);
  const controllerRef = useRef<SpeechController | null>(null);

  // Initialize controller on mount
  useEffect(() => {
    const controller = getGlobalSpeechController();
    controllerRef.current = controller;

    // Check if speech recognition is available
    controller.isSpeechRecognitionAvailable().then(setIsAvailable).catch(() => setIsAvailable(false));

    // Set up event listeners
    const handleResult = (result: SpeechRecognitionResult) => {
      if (result.isFinal && result.text) {
        onResult?.(result.text);
      }
    };

    const handleError = (error: SpeechRecognitionError) => {
      setErrorMessage(error.message);
      onError?.(error);
      if (error.isFatal) {
        setState('error');
      }
    };

    const handleStateChange = (newState: SpeechRecognitionState) => {
      setState(newState);
      onStateChange?.(newState);
    };

    const unsubscribeResult = controller.onResult(handleResult);
    const unsubscribeError = controller.onError(handleError);
    const unsubscribeState = controller.onStateChange(handleStateChange);

    // Initialize controller
    controller.initialize().catch(console.error);

    return () => {
      unsubscribeResult();
      unsubscribeError();
      unsubscribeState();
    };
  }, [onResult, onError, onStateChange]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      const controller = controllerRef.current;
      if (controller && state !== 'idle') {
        controller.stop().catch(console.error);
      }
    };
  }, [state]);

  const handleClick = async () => {
    const controller = controllerRef.current;
    if (!controller || readOnly) return;

    if (state === 'idle' || state === 'error') {
      try {
        setErrorMessage(null);
        await controller.start({ language });
      } catch (error) {
        console.error('Failed to start speech recognition:', error);
      }
    } else if (state === 'recording' || state === 'transcribing') {
      try {
        await controller.stop();
      } catch (error) {
        console.error('Failed to stop speech recognition:', error);
      }
    }
  };

  const getButtonClass = () => {
    const baseClass = 'icon-button';
    
    if (readOnly || !isAvailable) {
      return `${baseClass} speech-button disabled`;
    }
    
    switch (state) {
      case 'recording':
        return `${baseClass} speech-button recording`;
      case 'transcribing':
        return `${baseClass} speech-button transcribing`;
      case 'error':
        return `${baseClass} speech-button error`;
      case 'starting':
        return `${baseClass} speech-button starting`;
      default:
        return `${baseClass} speech-button`;
    }
  };

  const getIcon = () => {
    if (!isAvailable) return <ErrorIcon />;
    if (readOnly) return <MicrophoneIcon />;
    
    switch (state) {
      case 'recording':
        return <RecordingIcon />;
      case 'transcribing':
        return <LoadingIcon />;
      case 'error':
        return <ErrorIcon />;
      case 'starting':
        return <LoadingIcon />;
      default:
        return <MicrophoneIcon />;
    }
  };

  const getLabel = () => {
    if (!isAvailable) return 'Speech recognition not available';
    if (readOnly) return 'Speech recognition (read-only mode)';
    
    switch (state) {
      case 'recording':
        return 'Stop recording';
      case 'transcribing':
        return 'Transcribing...';
      case 'error':
        return 'Error - Click to retry';
      case 'starting':
        return 'Starting...';
      default:
        return 'Start voice dictation';
    }
  };

  return (
    <div class="speech-recognition-wrapper">
      <button
        class={getButtonClass()}
        aria-label={getLabel()}
        title={getLabel()}
        onClick={handleClick}
        disabled={readOnly || !isAvailable}
      >
        {getIcon()}
      </button>
      {errorMessage && state === 'error' && (
        <span class="speech-error-message">{errorMessage}</span>
      )}
    </div>
  );
}

