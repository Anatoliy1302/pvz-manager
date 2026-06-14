import { useCallback } from 'react';
import { useToast, ToastType } from '../components/common/Toast';

/** Toast-хелпер для экранов: ошибки/успех без модальных Alert. */
export function useScreenToast() {
  const { showToast } = useToast();

  const showError = useCallback((message: string) => showToast(message, 'error'), [showToast]);
  const showSuccess = useCallback((message: string) => showToast(message, 'success'), [showToast]);
  const showInfo = useCallback(
    (message: string, type: ToastType = 'info') => showToast(message, type),
    [showToast]
  );

  return { showToast, showError, showSuccess, showInfo };
}
