import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { toDateKey } from '../../../../utils/dateHelpers';
import { getWeekdays } from '../employeeScheduleHelpers';
import { EmployeeShift } from '../employeeScheduleTypes';
import { useEmployeeScheduleStyles } from '../useEmployeeScheduleStyles';

interface EmployeeMonthGridProps {
  monthDays: Date[];
  userId?: string;
  selectedDayKey: string;
  getShiftsForDate: (date: Date) => EmployeeShift[];
  onSelectDay: (dateKey: string) => void;
  isTodayDate: (date: Date) => boolean;
  isCurrentMonth: (date: Date) => boolean;
}

export default function EmployeeMonthGrid({
  monthDays,
  userId,
  selectedDayKey,
  getShiftsForDate,
  onSelectDay,
  isTodayDate,
  isCurrentMonth,
}: EmployeeMonthGridProps) {
  const weekdays = getWeekdays();
  const styles = useEmployeeScheduleStyles();

  return (
    <View style={styles.monthSection}>
      <View style={styles.monthWeekdays}>
        {weekdays.map((d) => (
          <Text key={d} style={styles.monthWeekday}>
            {d}
          </Text>
        ))}
      </View>
      <View style={styles.monthGrid}>
        {monthDays.map((day) => {
          const key = toDateKey(day);
          const dayShifts = getShiftsForDate(day);
          const isSelected = selectedDayKey === key;
          const today = isTodayDate(day);
          const inMonth = isCurrentMonth(day);
          const myCount = dayShifts.filter((s) => s.employeeId === userId).length;

          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.monthCell,
                !inMonth && styles.monthCellOutside,
                today && styles.monthCellToday,
                isSelected && styles.monthCellSelected,
                myCount > 0 && !isSelected && styles.monthCellWithShift,
              ]}
              onPress={() => onSelectDay(key)}
            >
              <Text
                style={[
                  styles.monthCellDate,
                  !inMonth && styles.monthCellDateOutside,
                  (today || isSelected) && styles.monthCellDateActive,
                ]}
              >
                {day.getDate()}
              </Text>
              {dayShifts.length > 0 && (
                <View style={styles.monthDots}>
                  {dayShifts.slice(0, 3).map((shift, i) => (
                    <View
                      key={shift.id + i}
                      style={[
                        styles.monthDot,
                        shift.employeeId === userId ? styles.monthDotMine : styles.monthDotOther,
                      ]}
                    />
                  ))}
                  {dayShifts.length > 3 && (
                    <Text style={styles.monthDotMore}>+{dayShifts.length - 3}</Text>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
