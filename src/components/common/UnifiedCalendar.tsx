// src/components/common/UnifiedCalendar.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { ChevronLeft, ChevronRight, X, Clock } from 'lucide-react-native';
import { colors } from '../../constants/colors';
import { toDateKey } from '../../utils/dateHelpers';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useTranslation } from 'react-i18next';

export interface ShiftInfo {
  id: string;
  employeeId: string;
  employeeName: string;
  startTime: string;
  endTime: string;
  date: string;
}

interface UnifiedCalendarProps {
  visible: boolean;
  onClose: () => void;
  onSelectDate?: (date: string) => void;
  selectedDate?: string;
  shiftsByDate?: { [key: string]: ShiftInfo[] };
  disablePastDates?: boolean;
  title?: string;
}

export default function UnifiedCalendar({
  visible,
  onClose,
  onSelectDate,
  selectedDate: externalSelectedDate,
  shiftsByDate = {},
  disablePastDates = true,
  title,
}: UnifiedCalendarProps) {
  const { t } = useTranslation();
  const { screen, ui } = useThemedScreen();
  const weekdays = [
    t('common.weekdays.mon'),
    t('common.weekdays.tue'),
    t('common.weekdays.wed'),
    t('common.weekdays.thu'),
    t('common.weekdays.fri'),
    t('common.weekdays.sat'),
    t('common.weekdays.sun'),
  ];
  const calendarTitle = title ?? t('common.calendar.selectDate');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(
    externalSelectedDate || toDateKey(new Date())
  );

  useEffect(() => {
    if (visible && externalSelectedDate) {
      setSelectedDate(externalSelectedDate);
      setCurrentDate(new Date(externalSelectedDate + 'T12:00:00'));
    }
  }, [visible, externalSelectedDate]);

  const monthGrid = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const gridStart = new Date(firstDay);
    gridStart.setDate(firstDay.getDate() - startPad);
    const totalCells = Math.ceil((startPad + lastDay.getDate()) / 7) * 7;
    const days: Date[] = [];
    for (let i = 0; i < totalCells; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      days.push(d);
    }
    return { days, month, year };
  }, [currentDate]);

  const todayKey = toDateKey(new Date());

  const isPast = (date: Date) => {
    if (!disablePastDates) return false;
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
  };

  const handleSelect = (date: Date) => {
    if (isPast(date)) return;
    const key = toDateKey(date);
    setSelectedDate(key);
    onSelectDate?.(key);
  };

  const selectedShifts = shiftsByDate[selectedDate] || [];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: screen.card }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: screen.text }]}>{calendarTitle}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={22} color={colors.gray} />
            </TouchableOpacity>
          </View>

          <View style={styles.monthNav}>
            <TouchableOpacity
              onPress={() => {
                const d = new Date(currentDate);
                d.setMonth(d.getMonth() - 1);
                setCurrentDate(d);
              }}
              style={styles.navBtn}
            >
              <ChevronLeft size={20} color={colors.primary} />
            </TouchableOpacity>
            <Text style={[styles.monthTitle, { color: screen.text }]}>
              {currentDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
            </Text>
            <TouchableOpacity
              onPress={() => {
                const d = new Date(currentDate);
                d.setMonth(d.getMonth() + 1);
                setCurrentDate(d);
              }}
              style={styles.navBtn}
            >
              <ChevronRight size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekdays}>
            {weekdays.map((d) => (
              <Text key={d} style={[styles.weekday, { color: screen.textSecondary }]}>
                {d}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {monthGrid.days.map((day) => {
              const key = toDateKey(day);
              const inMonth =
                day.getMonth() === monthGrid.month && day.getFullYear() === monthGrid.year;
              const isSelected = key === selectedDate;
              const isToday = key === todayKey;
              const past = isPast(day);
              const dayShifts = shiftsByDate[key] || [];

              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.cell,
                    !inMonth && styles.cellOutside,
                    isToday && styles.cellToday,
                    isSelected && styles.cellSelected,
                    past && styles.cellPast,
                    dayShifts.length > 0 && !isSelected && styles.cellWithShifts,
                  ]}
                  onPress={() => handleSelect(day)}
                  disabled={past}
                >
                  <Text
                    style={[
                      styles.cellDate,
                      { color: screen.text },
                      !inMonth && { color: screen.textSecondary, opacity: 0.6 },
                      (isSelected || isToday) && !past && styles.cellDateActive,
                      past && { color: screen.textSecondary, opacity: 0.4 },
                    ]}
                  >
                    {day.getDate()}
                  </Text>
                  {dayShifts.length > 0 && (
                    <View style={styles.dots}>
                      {dayShifts.slice(0, 3).map((s, i) => (
                        <View key={s.id + i} style={styles.dot} />
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedDate ? (
            <View style={[styles.preview, { backgroundColor: ui.input.backgroundColor }]}>
              <Text style={[styles.previewTitle, { color: screen.text }]}>
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                  weekday: 'long',
                })}
              </Text>
              {selectedShifts.length === 0 ? (
                <Text style={[styles.previewEmpty, { color: screen.textSecondary }]}>
                  {t('common.calendar.noShiftsOnDate')}
                </Text>
              ) : (
                <ScrollView style={styles.previewList} nestedScrollEnabled>
                  {selectedShifts.map((shift) => (
                    <View key={shift.id} style={styles.previewShift}>
                      <Clock size={12} color={colors.gray} />
                      <Text style={[styles.previewShiftText, { color: screen.textSecondary }]}>
                        {shift.startTime}–{shift.endTime} · {shift.employeeName}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          ) : null}

          <TouchableOpacity style={styles.confirmBtn} onPress={onClose}>
            <Text style={styles.confirmText}>{t('common.actions.done')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: '700' },
  closeBtn: { padding: 4 },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 10,
  },
  navBtn: { padding: 8 },
  monthTitle: {
    fontSize: 16,
    fontWeight: '600',
    minWidth: 160,
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  weekdays: { flexDirection: 'row', marginBottom: 4 },
  weekday: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  cellOutside: { opacity: 0.35 },
  cellToday: { borderWidth: 1.5, borderColor: colors.primary },
  cellSelected: { backgroundColor: colors.primary },
  cellPast: { opacity: 0.3 },
  cellWithShifts: { backgroundColor: colors.primaryLight },
  cellDate: { fontSize: 14, fontWeight: '600' },
  cellDateActive: { color: '#FFFFFF' },
  dots: { flexDirection: 'row', gap: 2, marginTop: 2 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary },
  preview: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
  },
  previewTitle: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  previewEmpty: { fontSize: 13 },
  previewList: { maxHeight: 80 },
  previewShift: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  previewShiftText: { fontSize: 12 },
  confirmBtn: {
    marginTop: 14,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});
