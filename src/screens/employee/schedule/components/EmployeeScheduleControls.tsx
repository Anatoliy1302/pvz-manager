import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { colors } from '../../../../constants/colors';
import { CalendarView, ViewMode } from '../employeeScheduleTypes';
import { useEmployeeScheduleStyles } from '../useEmployeeScheduleStyles';

interface EmployeeScheduleControlsProps {
  myWeekShiftCount: number;
  calendarView: CalendarView;
  viewMode: ViewMode;
  periodTitle: string;
  employees: { id: string; name: string }[];
  selectedEmployeeId: string;
  onCalendarViewChange: (view: CalendarView) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onPeriodBack: () => void;
  onPeriodForward: () => void;
  onGoToToday: () => void;
  onSelectEmployee: (employeeId: string) => void;
}

export default function EmployeeScheduleControls({
  myWeekShiftCount,
  calendarView,
  viewMode,
  periodTitle,
  employees,
  selectedEmployeeId,
  onCalendarViewChange,
  onViewModeChange,
  onPeriodBack,
  onPeriodForward,
  onGoToToday,
  onSelectEmployee,
}: EmployeeScheduleControlsProps) {
  const { t } = useTranslation();
  const styles = useEmployeeScheduleStyles();

  return (
    <>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryText}>
          {t('screens.schedule.weekSummary', { count: myWeekShiftCount })}
        </Text>
      </View>

      <View style={styles.calendarToggle}>
        <TouchableOpacity
          style={[styles.calToggleBtn, calendarView === 'week' && styles.calToggleBtnActive]}
          onPress={() => onCalendarViewChange('week')}
        >
          <Text style={[styles.calToggleText, calendarView === 'week' && styles.calToggleTextActive]}>
            {t('screens.schedule.week')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.calToggleBtn, calendarView === 'month' && styles.calToggleBtnActive]}
          onPress={() => onCalendarViewChange('month')}
        >
          <Text style={[styles.calToggleText, calendarView === 'month' && styles.calToggleTextActive]}>
            {t('screens.schedule.month')}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.periodNavigation}>
        <TouchableOpacity onPress={onPeriodBack} style={styles.navButton}>
          <ChevronLeft size={20} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onGoToToday} style={styles.periodTitleWrap}>
          <Text style={styles.periodTitle}>{periodTitle}</Text>
          <Text style={styles.todayHint}>{t('screens.schedule.today')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onPeriodForward} style={styles.navButton}>
          <ChevronRight size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.viewToggle}>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'mine' && styles.toggleBtnActive]}
          onPress={() => onViewModeChange('mine')}
        >
          <Text style={[styles.toggleText, viewMode === 'mine' && styles.toggleTextActive]}>
            {t('screens.schedule.myShifts')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'team' && styles.toggleBtnActive]}
          onPress={() => onViewModeChange('team')}
        >
          <Text style={[styles.toggleText, viewMode === 'team' && styles.toggleTextActive]}>
            {t('screens.schedule.team')}
          </Text>
        </TouchableOpacity>
      </View>

      {viewMode === 'team' && employees.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.teamFilter}>
          <TouchableOpacity
            style={[styles.filterChip, !selectedEmployeeId && styles.filterChipActive]}
            onPress={() => onSelectEmployee('')}
          >
            <Text style={[styles.filterChipText, !selectedEmployeeId && styles.filterChipTextActive]}>
              {t('common.filters.all')}
            </Text>
          </TouchableOpacity>
          {employees.map((emp) => (
            <TouchableOpacity
              key={emp.id}
              style={[styles.filterChip, selectedEmployeeId === emp.id && styles.filterChipActive]}
              onPress={() => onSelectEmployee(emp.id)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedEmployeeId === emp.id && styles.filterChipTextActive,
                ]}
              >
                {emp.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </>
  );
}
