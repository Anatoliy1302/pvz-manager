import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';

export const useThemedScreen = () => {
  const { theme, colors, toggleTheme, setTheme } = useTheme();

  const screen = useMemo(
    () => ({
      background: colors.background,
      card: colors.card,
      surface: colors.surface,
      text: colors.text,
      textSecondary: colors.textSecondary,
      border: colors.border,
    }),
    [colors]
  );

  const ui = useMemo(
    () => ({
      container: { backgroundColor: colors.background },
      card: {
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 16,
      },
      title: { color: colors.text },
      subtitle: { color: colors.textSecondary },
      input: {
        backgroundColor: theme === 'dark' ? '#2A2A2A' : '#F5F5F5',
        color: colors.text,
        borderColor: colors.border,
      },
      modal: { backgroundColor: colors.card },
      sectionTitle: { color: colors.text, fontWeight: '600' as const },
    }),
    [colors, theme]
  );

  return { theme, colors, screen, ui, toggleTheme, setTheme };
};
