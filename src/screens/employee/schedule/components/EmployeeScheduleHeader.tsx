import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Send, Repeat } from 'lucide-react-native';
import { colors } from '../../../../constants/colors';
import { useEmployeeScheduleStyles } from '../useEmployeeScheduleStyles';

interface EmployeeScheduleHeaderProps {
  pvzName?: string;
  canSwapShifts: boolean;
  canRequestShifts: boolean;
  onBack: () => void;
  onSwapNotifications: () => void;
  onRequests: () => void;
}

export default function EmployeeScheduleHeader({
  pvzName,
  canSwapShifts,
  canRequestShifts,
  onBack,
  onSwapNotifications,
  onRequests,
}: EmployeeScheduleHeaderProps) {
  const { t } = useTranslation();
  const styles = useEmployeeScheduleStyles();

  return (
    <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.headerSide}>
        <ChevronLeft size={24} color="#FFFFFF" />
      </TouchableOpacity>
      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle}>{t('screens.schedule.titleEmployee')}</Text>
        {pvzName ? <Text style={styles.headerSubtitle}>{pvzName}</Text> : null}
      </View>
      {canSwapShifts ? (
        <TouchableOpacity onPress={onSwapNotifications} style={styles.headerSide}>
          <Repeat size={20} color="#FFFFFF" />
        </TouchableOpacity>
      ) : canRequestShifts ? (
        <TouchableOpacity onPress={onRequests} style={styles.headerSide}>
          <Send size={20} color="#FFFFFF" />
        </TouchableOpacity>
      ) : (
        <View style={styles.headerSide} />
      )}
    </LinearGradient>
  );
}
