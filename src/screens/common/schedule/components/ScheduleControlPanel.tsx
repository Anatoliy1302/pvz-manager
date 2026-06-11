import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TouchableOpacity, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { colors } from '../../../../constants/colors';
import { scheduleStyles } from '../scheduleStyles';

interface ScheduleControlPanelProps {
  viewMode: 'day' | 'week' | 'month';
  currentDate: Date;
  weekRange: string;
  cardBackground: string;
  borderColor: string;
  inputBackground: string;
  textColor: string;
  textSecondary: string;
  onViewModeChange: (mode: 'day' | 'week' | 'month') => void;
  onNavigateBack: () => void;
  onNavigateForward: () => void;
  formatDate: (date: Date) => string;
}

export default function ScheduleControlPanel({
  viewMode,
  currentDate,
  weekRange,
  cardBackground,
  borderColor,
  inputBackground,
  textColor,
  textSecondary,
  onViewModeChange,
  onNavigateBack,
  onNavigateForward,
  formatDate,
}: ScheduleControlPanelProps) {
  const { t } = useTranslation();
  const modeLabels = {
    day: t('screens.schedule.day'),
    week: t('screens.schedule.week'),
    month: t('screens.schedule.month'),
  };

  return (
    <View
      style={[
        scheduleStyles.controlPanel,
        { backgroundColor: cardBackground, borderBottomColor: borderColor },
      ]}
    >
      <View style={[scheduleStyles.viewModeSelector, { backgroundColor: inputBackground }]}>
        {(['day', 'week', 'month'] as const).map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[scheduleStyles.viewModeButton, viewMode === mode && scheduleStyles.viewModeActive]}
            onPress={() => onViewModeChange(mode)}
          >
            <Text
              style={[
                scheduleStyles.viewModeText,
                { color: textSecondary },
                viewMode === mode && scheduleStyles.viewModeTextActive,
              ]}
            >
              {modeLabels[mode]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={scheduleStyles.navigationRow}>
        <TouchableOpacity onPress={onNavigateBack} style={scheduleStyles.navButton}>
          <ChevronLeft size={20} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[scheduleStyles.dateRangeText, { color: textColor }]}>
          {viewMode === 'day'
            ? formatDate(currentDate)
            : viewMode === 'week'
              ? weekRange
              : currentDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
        </Text>
        <TouchableOpacity onPress={onNavigateForward} style={scheduleStyles.navButton}>
          <ChevronRight size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
