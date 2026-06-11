import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TouchableOpacity } from 'react-native';
import { Repeat } from 'lucide-react-native';
import { formatDate, getRelativeDateString } from '../../../../utils/dateHelpers';
import { shiftTypeLabel } from '../employeeScheduleHelpers';
import { EmployeeShift } from '../employeeScheduleTypes';
import { useEmployeeScheduleStyles } from '../useEmployeeScheduleStyles';

interface DayDetailSectionProps {
  selectedDayKey: string;
  shifts: EmployeeShift[];
  userId?: string;
  canSwapShifts: boolean;
  canRequestShifts: boolean;
  onSwapRequest: (shift: EmployeeShift) => void;
  onNavigateRequests: () => void;
}

export default function DayDetailSection({
  selectedDayKey,
  shifts,
  userId,
  canSwapShifts,
  canRequestShifts,
  onSwapRequest,
  onNavigateRequests,
}: DayDetailSectionProps) {
  const { t } = useTranslation();
  const styles = useEmployeeScheduleStyles();

  return (
    <View style={styles.dayDetailSection}>
      <View style={styles.dayDetailHeader}>
        <Text style={styles.dayDetailTitle}>{getRelativeDateString(selectedDayKey)}</Text>
        <Text style={styles.dayDetailSub}>{formatDate(selectedDayKey, 'short')}</Text>
      </View>

      {shifts.length === 0 ? (
        <View style={styles.emptyDay}>
          <Text style={styles.emptyDayText}>{t('screens.schedule.noShifts')}</Text>
          {canRequestShifts && (
            <TouchableOpacity style={styles.emptyDayBtn} onPress={onNavigateRequests}>
              <Text style={styles.emptyDayBtnText}>{t('screens.schedule.requestBtn')}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.dayDetailGrid}>
          {shifts.map((shift) => {
            const isMine = userId === shift.employeeId;
            const canSwap = isMine && canSwapShifts;
            const typeLabel = shiftTypeLabel(shift.shiftType);

            return (
              <TouchableOpacity
                key={shift.id}
                style={[styles.detailCard, isMine && styles.detailCardMine]}
                onPress={() => canSwap && onSwapRequest(shift)}
                disabled={!canSwap}
                activeOpacity={canSwap ? 0.7 : 1}
              >
                <Text style={[styles.detailTime, isMine && styles.detailTextLight]}>
                  {shift.startTime} — {shift.endTime}
                </Text>
                <Text
                  style={[styles.detailName, isMine && styles.detailTextLight]}
                  numberOfLines={1}
                >
                  {isMine ? t('screens.schedule.myShift') : shift.employeeName}
                </Text>
                {typeLabel && (
                  <Text style={[styles.detailType, isMine && styles.detailTextMuted]}>
                    {typeLabel}
                  </Text>
                )}
                {canSwap && (
                  <View style={styles.detailSwapRow}>
                    <Repeat size={12} color="#FFFFFF" />
                    <Text style={styles.detailSwapText}>{t('screens.schedule.swap')}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}
