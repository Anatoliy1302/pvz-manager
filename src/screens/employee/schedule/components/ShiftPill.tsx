import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Repeat } from 'lucide-react-native';
import { colors } from '../../../../constants/colors';
import { formatTimeShort, shortName } from '../employeeScheduleHelpers';
import { EmployeeShift, ViewMode } from '../employeeScheduleTypes';
import { useEmployeeScheduleStyles } from '../useEmployeeScheduleStyles';

interface ShiftPillProps {
  shift: EmployeeShift;
  userId?: string;
  viewMode: ViewMode;
  compact?: boolean;
  canSwapShifts: boolean;
  onSelectDay: (dateKey: string) => void;
  onSwapRequest: (shift: EmployeeShift) => void;
}

export default function ShiftPill({
  shift,
  userId,
  viewMode,
  compact = false,
  canSwapShifts,
  onSelectDay,
  onSwapRequest,
}: ShiftPillProps) {
  const styles = useEmployeeScheduleStyles();
  const isMine = userId === shift.employeeId;
  const canSwap = isMine && canSwapShifts;

  return (
    <TouchableOpacity
      style={[
        styles.shiftPill,
        isMine ? styles.shiftPillMine : styles.shiftPillOther,
        compact && styles.shiftPillCompact,
      ]}
      onPress={() => {
        onSelectDay(shift.date);
        if (canSwap) onSwapRequest(shift);
      }}
      activeOpacity={0.75}
    >
      <Text
        style={[styles.shiftPillTime, isMine && styles.shiftPillTextLight]}
        numberOfLines={1}
      >
        {formatTimeShort(shift.startTime, shift.endTime)}
      </Text>
      {viewMode === 'team' && !isMine && (
        <Text style={styles.shiftPillName} numberOfLines={1}>
          {shortName(shift.employeeName)}
        </Text>
      )}
      {canSwap && !compact && (
        <View style={styles.shiftPillSwapIcon}>
          <Repeat size={10} color="rgba(255,255,255,0.9)" />
        </View>
      )}
    </TouchableOpacity>
  );
}
