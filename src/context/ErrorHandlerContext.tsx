import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useToast } from '../components/common/Toast';
import { t } from '../i18n';
import {
  ValidationError,
  isValidationError,
  resolveUserMessage,
} from '../utils/appErrors';
import { setGlobalErrorReporter } from '../utils/globalErrorReporter';

interface HandleErrorOptions {
  fallbackKey?: string;
  silent?: boolean;
}

interface ErrorHandlerContextValue {
  isOffline: boolean;
  handleError: (error: unknown, options?: HandleErrorOptions) => string;
  handleValidation: (fields: Record<string, string>) => ValidationError;
  throwValidation: (fields: Record<string, string>) => never;
}

const ErrorHandlerContext = createContext<ErrorHandlerContextValue | null>(null);

export function ErrorHandlerProvider({ children }: { children: React.ReactNode }) {
  const { showToast } = useToast();
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    void NetInfo.fetch().then((state) => {
      setIsOffline(state.isConnected === false);
    });

    return NetInfo.addEventListener((state) => {
      setIsOffline(state.isConnected === false);
    });
  }, []);

  const handleError = useCallback(
    (error: unknown, options?: HandleErrorOptions): string => {
      if (isValidationError(error)) {
        const first = Object.values(error.fields)[0];
        const message = first ?? t('alerts.validation.fillAll');
        if (!options?.silent) {
          showToast(message, 'error');
        }
        return message;
      }

      const message = resolveUserMessage(error, options?.fallbackKey);
      if (!options?.silent) {
        showToast(message, 'error');
      }
      return message;
    },
    [showToast]
  );

  const handleValidation = useCallback((fields: Record<string, string>) => {
    return new ValidationError(fields);
  }, []);

  const throwValidation = useCallback((fields: Record<string, string>): never => {
    throw new ValidationError(fields);
  }, []);

  useEffect(() => {
    setGlobalErrorReporter((error) => {
      handleError(error);
    });
    return () => setGlobalErrorReporter(null);
  }, [handleError]);

  const value = useMemo(
    () => ({
      isOffline,
      handleError,
      handleValidation,
      throwValidation,
    }),
    [handleError, handleValidation, isOffline, throwValidation]
  );

  return <ErrorHandlerContext.Provider value={value}>{children}</ErrorHandlerContext.Provider>;
}

export function useErrorHandler(): ErrorHandlerContextValue {
  const context = useContext(ErrorHandlerContext);
  if (!context) {
    throw new Error('useErrorHandler must be used within ErrorHandlerProvider');
  }
  return context;
}
