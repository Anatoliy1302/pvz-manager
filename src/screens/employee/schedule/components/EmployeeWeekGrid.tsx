import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { toDateKey } from '../../../../utils/dateHelpers';
import { getWeekdays, WEEK_COL_WIDTH } from '../employeeScheduleHelpers';
import { EmployeeShift, ViewMode } from '../employeeScheduleTypes';
import { useEmployeeScheduleStyles } from '../useEmployeeScheduleStyles';
import ShiftPill from './ShiftPill';

interface EmployeeWeekGridProps {
  weekDays: Date[];
  userId?: string;
  viewMode: ViewMode;
  selectedDayKey: string;
  canSwapShifts: boolean;
  getShiftsForDate: (date: Date) => EmployeeShift[];
  onSelectDay: (dateKey: string) => void;
  onSwapRequest: (shift: EmployeeShift) => void;
  isTodayDate: (date: Date) => boolean;
}

export default function EmployeeWeekGrid({
  weekDays,
  userId,
  viewMode,
  selectedDayKey,
  canSwapShifts,
  getShiftsForDate,
  onSelectDay,
  onSwapRequest,
  isTodayDate,
}: EmployeeWeekGridProps) {
  const weekdays = getWeekdays();
  const styles = useEmployeeScheduleStyles();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekGridScroll}>
      <View style={styles.weekGrid}>
        {weekDays.map((day, index) => {
          const key = toDateKey(day);
          const dayShifts = getShiftsForDate(day);
          const isSelected = selectedDayKey === key;
          const today = isTodayDate(day);
          const myCount = dayShifts.filter((s) => s.employeeId === userId).length;

          return (
            <TouchableOpacity
              key={key}
              style={[styles.weekColumn, { width: WEEK_COL_WIDTH }]}
              onPress={() => onSelectDay(key)}
              activeOpacity={0.85}
            >
              <View
                style={[
                  styles.weekColumnHeader,
                  today && styles.weekColumnHeaderToday,
                  isSelected && styles.weekColumnHeaderSelected,
                ]}
              >
                <Text
                  style={[
                    styles.weekColumnWeekday,
                    (today || isSelected) && styles.weekColumnHeaderTextActive,
                  ]}
                >
                  {weekdays[index]}
                </Text>
                <Text
                  style={[
                    styles.weekColumnDate,
                    (today || isSelected) && styles.weekColumnHeaderTextActive,
                  ]}
                >
                  {day.getDate()}
                </Text>
                {myCount > 0 && (
                  <View style={[styles.weekBadge, isSelected && styles.weekBadgeSelected]}>
                    <Text style={[styles.weekBadgeText, isSelected && styles.weekBadgeTextSelected]}>
                      {myCount}
                    </Text>
                  </View>
                )}
              </View>

              <View style={[styles.weekColumnBody, isSelected && styles.weekColumnBodySelected]}>
                {dayShifts.length === 0 ? (
                  <Text style={styles.weekEmpty}>—</Text>
                ) : (
                  dayShifts.map((shift) => (
                    <ShiftPill
                      key={shift.id}
                      shift={shift}
                      userId={userId}
                      viewMode={viewMode}
                      compact
                      canSwapShifts={canSwapShifts}
                      onSelectDay={onSelectDay}
                      onSwapRequest={onSwapRequest}
                    />
                  ))
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}
