import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TouchableOpacity, View } from 'react-native';
import { Calendar, Repeat } from 'lucide-react-native';
import { colors } from '../../../../constants/colors';
import { scheduleStyles } from '../scheduleStyles';

interface ScheduleQuickActionsBarProps {
  canEdit: boolean;
  cardBackground: string;
  borderColor: string;
  inputBackground: string;
  onGoToday: () => void;
  onCopy: () => void;
}

export default function ScheduleQuickActionsBar({
  canEdit,
  cardBackground,
  borderColor,
  inputBackground,
  onGoToday,
  onCopy,
}: ScheduleQuickActionsBarProps) {
  const { t } = useTranslation();

  return (
    <View
      style={[
        scheduleStyles.quickActionsBar,
        { backgroundColor: cardBackground, borderTopColor: borderColor },
      ]}
    >
      <TouchableOpacity
        style={[scheduleStyles.quickAction, { backgroundColor: inputBackground }]}
        onPress={onGoToday}
      >
        <Calendar size={20} color={colors.primary} />
        <Text style={scheduleStyles.quickActionText}>{t('screens.schedule.today')}</Text>
      </TouchableOpacity>
      {canEdit && (
        <TouchableOpacity
          style={[scheduleStyles.quickAction, { backgroundColor: inputBackground }]}
          onPress={onCopy}
        >
          <Repeat size={20} color={colors.primary} />
          <Text style={scheduleStyles.quickActionText}>{t('screens.schedule.copy')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
