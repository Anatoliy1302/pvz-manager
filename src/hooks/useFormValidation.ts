import { useCallback, useState } from 'react';
import { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { colors } from '../constants/colors';

type FieldErrors<T extends string> = Partial<Record<T, string>>;

export interface FieldValidationRule<T extends string> {
  field: T;
  valid: boolean;
  message: string;
}

export function useFormValidation<T extends string>() {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<T>>({});

  const setFieldError = useCallback((field: T, message: string) => {
    setFieldErrors((prev) => ({ ...prev, [field]: message }));
  }, []);

  const clearFieldError = useCallback((field: T) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const clearAllFieldErrors = useCallback(() => {
    setFieldErrors({});
  }, []);

  const getFieldError = useCallback((field: T) => fieldErrors[field], [fieldErrors]);

  const hasFieldError = useCallback((field: T) => Boolean(fieldErrors[field]), [fieldErrors]);

  const validate = useCallback((rules: FieldValidationRule<T>[]): boolean => {
    const next: FieldErrors<T> = {};
    for (const rule of rules) {
      if (!rule.valid) {
        next[rule.field] = rule.message;
      }
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }, []);

  const touchField = useCallback(
    (field: T, message?: string) => {
      if (message) {
        setFieldError(field, message);
        return;
      }
      clearFieldError(field);
    },
    [clearFieldError, setFieldError]
  );

  const inputContainerStyle = useCallback(
    (field: T, base?: StyleProp<ViewStyle>): StyleProp<ViewStyle> => [
      base,
      hasFieldError(field) ? { borderColor: colors.danger, borderWidth: 1 } : null,
    ],
    [hasFieldError]
  );

  const inputTextStyle = useCallback(
    (field: T, base?: StyleProp<TextStyle>): StyleProp<TextStyle> => [
      base,
      hasFieldError(field) ? { color: colors.danger } : null,
    ],
    [hasFieldError]
  );

  return {
    fieldErrors,
    setFieldError,
    clearFieldError,
    clearAllFieldErrors,
    getFieldError,
    hasFieldError,
    validate,
    touchField,
    inputContainerStyle,
    inputTextStyle,
  };
}
