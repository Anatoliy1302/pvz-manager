import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Languages, ChevronDown, Check } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { LANGUAGE_OPTIONS } from '../../i18n/languageOptions';
import type { AppLanguage } from '../../i18n/types';

type LanguagePickerVariant = 'compact' | 'row';

interface LanguagePickerProps {
  variant?: LanguagePickerVariant;
}

export default function LanguagePicker({ variant = 'compact' }: LanguagePickerProps) {
  const { t } = useTranslation();
  const { colors, theme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);

  const currentLabel = t(
    LANGUAGE_OPTIONS.find((o) => o.code === language)?.labelKey ?? 'common.language.russian'
  );

  const handleSelect = async (code: AppLanguage) => {
    setOpen(false);
    if (code !== language) {
      await setLanguage(code);
    }
  };

  const isCompact = variant === 'compact';

  return (
    <>
      <TouchableOpacity
        style={[
          styles.trigger,
          isCompact ? styles.triggerCompact : styles.triggerRow,
          {
            backgroundColor: isCompact
              ? theme === 'dark'
                ? 'rgba(255,255,255,0.08)'
                : 'rgba(108,92,231,0.08)'
              : colors.card,
            borderColor: isCompact ? colors.primary + '33' : colors.border,
          },
        ]}
        onPress={() => setOpen(true)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={t('common.language.current')}
      >
        <Languages size={isCompact ? 16 : 20} color={colors.primary} />
        <Text
          style={[styles.triggerText, { color: colors.text }, isCompact && styles.triggerTextCompact]}
          numberOfLines={1}
        >
          {currentLabel}
        </Text>
        <ChevronDown size={isCompact ? 16 : 18} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[
              styles.sheet,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.sheetTitle, { color: colors.text }]}>
              {t('common.language.section')}
            </Text>

            {LANGUAGE_OPTIONS.map((option) => {
              const selected = language === option.code;
              return (
                <TouchableOpacity
                  key={option.code}
                  style={[
                    styles.option,
                    selected && {
                      backgroundColor: theme === 'dark' ? '#2A2A3A' : colors.primaryLight,
                    },
                  ]}
                  onPress={() => handleSelect(option.code)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.optionText,
                      { color: colors.text },
                      selected && { color: colors.primary, fontWeight: '600' },
                    ]}
                  >
                    {t(option.labelKey)}
                  </Text>
                  {selected && <Check size={18} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
  },
  triggerCompact: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    maxWidth: 160,
  },
  triggerRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  triggerText: {
    flex: 1,
    fontSize: 15,
  },
  triggerTextCompact: {
    flex: 0,
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 88,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
  },
  sheet: {
    borderRadius: 20,
    borderWidth: 1,
    paddingTop: 16,
    paddingBottom: 8,
    paddingHorizontal: 8,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 12,
  },
  optionText: {
    fontSize: 16,
  },
});
