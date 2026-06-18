// src/screens/employee/EmployeeScheduleScreen.tsx
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import { useScreenRefresh, useScopedInitialLoading } from '../../hooks/useScreenRefresh';
import { useAuth } from '../../context/AuthContext';
import DataService from '../../services/DataService';
import notificationService from '../../services/NotificationService';
import { toDateKey } from '../../utils/dateHelpers';
import { isSamePvz } from '../../utils/supabaseHelpers';
import PermissionGate from '../../components/common/PermissionGate';
import { CalendarView, EmployeeShift, ViewMode } from './schedule/employeeScheduleTypes';
import { useEmployeeScheduleStyles } from './schedule/useEmployeeScheduleStyles';
import EmployeeScheduleHeader from './schedule/components/EmployeeScheduleHeader';
import EmployeeScheduleControls from './schedule/components/EmployeeScheduleControls';
import EmployeeWeekGrid from './schedule/components/EmployeeWeekGrid';
import EmployeeMonthGrid from './schedule/components/EmployeeMonthGrid';
import DayDetailSection from './schedule/components/DayDetailSection';
import SwapRequestModal from './schedule/components/SwapRequestModal';
import { useScreenToast } from '../../hooks/useScreenToast';
import { ScheduleSkeleton } from '../../components/common/Skeleton';

export default function EmployeeScheduleScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { user, pvz, hasPermission } = useAuth();
  const { showError, showSuccess } = useScreenToast();
  const [refreshing, setRefreshing] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [shifts, setShifts] = useState<EmployeeShift[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('mine');
  const [calendarView, setCalendarView] = useState<CalendarView>('week');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedDayKey, setSelectedDayKey] = useState<string>(toDateKey(new Date()));
  const [swapModalVisible, setSwapModalVisible] = useState(false);
  const [selectedShift, setSelectedShift] = useState<EmployeeShift | null>(null);
  const [swapTargetEmployeeId, setSwapTargetEmployeeId] = useState('');
  const [swapTargetShiftId, setSwapTargetShiftId] = useState('');
  const [swapReason, setSwapReason] = useState('');
  const [loading, markLoaded] = useScopedInitialLoading(pvz?.id);

  const weekDays = useMemo(() => {
    const days: Date[] = [];
    const startOfWeek = new Date(currentDate);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      days.push(date);
    }
    return days;
  }, [currentDate]);

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
    return { days, month, year, firstDay, lastDay };
  }, [currentDate]);

  const dateRange = useMemo(() => {
    if (calendarView === 'week') {
      return { start: toDateKey(weekDays[0]), end: toDateKey(weekDays[6]) };
    }
    return {
      start: toDateKey(monthGrid.days[0]),
      end: toDateKey(monthGrid.days[monthGrid.days.length - 1]),
    };
  }, [calendarView, weekDays, monthGrid.days]);

  const loadData = useCallback(async () => {
    if (!user?.id) return;

    try {
      const allShifts = await DataService.getShiftsLocal();
      const rangeShifts: EmployeeShift[] = [];

      for (const shift of allShifts) {
        if (shift.date < dateRange.start || shift.date > dateRange.end) continue;
        if (pvz?.id && !(await isSamePvz(shift.pvzId, pvz.id))) continue;
        rangeShifts.push(shift as EmployeeShift);
      }

      setShifts(rangeShifts);

      const users = await DataService.getUsers();
      const pvzEmployees = users
        .filter(
          (u) =>
            u.status === 'active' &&
            u.id !== user.id &&
            (u.pvzId === pvz?.id || (u.role === 'admin' && u.pvzIds?.includes(pvz?.id || '')))
        )
        .map((u) => ({ id: u.id, name: u.name }));
      setEmployees(pvzEmployees);
    } catch (error) {
      console.error('Ошибка загрузки расписания:', error);
    } finally {
      markLoaded();
    }
  }, [user?.id, dateRange, pvz?.id, markLoaded]);

  useScreenRefresh(loadData, [loadData], {
    subscribeKeys: ['shifts'],
  });

  useEffect(() => {
    if (!loading) {
      void loadData();
    }
  }, [dateRange.start, dateRange.end]);

  const changeWeek = (delta: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + delta * 7);
    setCurrentDate(newDate);
    setSelectedDayKey(toDateKey(newDate));
  };

  const changeMonth = (delta: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + delta);
    setCurrentDate(newDate);
    setSelectedDayKey(toDateKey(new Date(newDate.getFullYear(), newDate.getMonth(), 1)));
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDayKey(toDateKey(today));
  };

  const myWeekShifts = useMemo(
    () => shifts.filter((s) => s.employeeId === user?.id && weekDays.some((d) => toDateKey(d) === s.date)),
    [shifts, user?.id, weekDays]
  );

  const getShiftsForDate = useCallback(
    (date: Date) => {
      const dateStr = toDateKey(date);
      let dayShifts = shifts.filter((s) => s.date === dateStr);
      if (viewMode === 'mine') {
        dayShifts = dayShifts.filter((s) => s.employeeId === user?.id);
      } else if (selectedEmployeeId) {
        dayShifts = dayShifts.filter((s) => s.employeeId === selectedEmployeeId);
      }
      return dayShifts;
    },
    [shifts, viewMode, selectedEmployeeId, user?.id]
  );

  const selectedDayShifts = useMemo(() => {
    const day = new Date(selectedDayKey + 'T12:00:00');
    return getShiftsForDate(day);
  }, [selectedDayKey, getShiftsForDate]);

  const handleSwapRequest = (shift: EmployeeShift) => {
    setSelectedShift(shift);
    setSwapTargetEmployeeId('');
    setSwapTargetShiftId('');
    setSwapReason('');
    setSwapModalVisible(true);
  };

  const targetEmployeeShifts = useMemo(() => {
    if (!swapTargetEmployeeId) return [];
    return shifts.filter((s) => s.employeeId === swapTargetEmployeeId);
  }, [shifts, swapTargetEmployeeId]);

  const submitSwapRequest = async () => {
    if (!selectedShift || !swapTargetEmployeeId) {
      showError(t('alerts.validation.selectSwapEmployee'));
      return;
    }
    if (!swapTargetShiftId) {
      showError(t('alerts.validation.selectSwapShift'));
      return;
    }

    const targetShift = shifts.find((s) => s.id === swapTargetShiftId);
    if (!targetShift) {
      showError(t('alerts.validation.colleagueShiftNotFound'));
      return;
    }

    try {
      const toEmployeeName = employees.find((e) => e.id === swapTargetEmployeeId)?.name || '';
      const created = await DataService.addSwapRequest(pvz?.id || '', {
        fromEmployeeId: user?.id || '',
        fromEmployeeName: user?.name || '',
        toEmployeeId: swapTargetEmployeeId,
        toEmployeeName,
        fromShiftId: selectedShift.id,
        fromDate: selectedShift.date,
        toDate: targetShift.date,
        toShiftId: targetShift.id,
        reason: swapReason,
      });

      if (pvz?.id && user?.id) {
        await notificationService.notifyStaffNewSwapRequest({
          pvzId: pvz.id,
          pvzName: pvz.name,
          fromEmployeeId: user.id,
          fromEmployeeName: user.name || '',
          toEmployeeName,
          fromDate: selectedShift.date,
          toDate: targetShift.date,
          requestId: created.id,
        });
        await notificationService.notifySwapSubmittedToEmployee({
          recipientUserId: user.id,
          toEmployeeName,
          fromDate: selectedShift.date,
          toDate: targetShift.date,
        });
      }

      setSwapModalVisible(false);
      setSwapReason('');
      showSuccess(t('alerts.success.swapSubmitted'));
    } catch {
      showError(t('alerts.network.submitSwapFailed'));
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await DataService.refreshShiftsCache();
    await loadData();
    setRefreshing(false);
  };

  const isTodayDate = (date: Date) => date.toDateString() === new Date().toDateString();
  const isCurrentMonth = (date: Date) =>
    date.getMonth() === monthGrid.month && date.getFullYear() === monthGrid.year;

  const periodTitle =
    calendarView === 'week'
      ? `${weekDays[0].toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} — ${weekDays[6].toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`
      : currentDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

  const canSwapShifts = hasPermission('canSwapShifts');
  const canRequestShifts = hasPermission('canRequestShifts');
  const styles = useEmployeeScheduleStyles();

  return (
    <PermissionGate permission="canViewShifts" navigation={navigation} fallbackScreen="Home">
      <ThemedSafeAreaView>
        <EmployeeScheduleHeader
          pvzName={pvz?.name}
          canSwapShifts={canSwapShifts}
          canRequestShifts={canRequestShifts}
          onBack={() => navigation.goBack()}
          onSwapNotifications={() => navigation.navigate('SwapNotifications')}
          onRequests={() => navigation.navigate('Requests')}
        />

        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          <EmployeeScheduleControls
            myWeekShiftCount={myWeekShifts.length}
            calendarView={calendarView}
            viewMode={viewMode}
            periodTitle={periodTitle}
            employees={employees}
            selectedEmployeeId={selectedEmployeeId}
            onCalendarViewChange={setCalendarView}
            onViewModeChange={(mode) => {
              setViewMode(mode);
              if (mode === 'mine') setSelectedEmployeeId('');
            }}
            onPeriodBack={() => (calendarView === 'week' ? changeWeek(-1) : changeMonth(-1))}
            onPeriodForward={() => (calendarView === 'week' ? changeWeek(1) : changeMonth(1))}
            onGoToToday={goToToday}
            onSelectEmployee={setSelectedEmployeeId}
          />

          <View style={styles.gridCard}>
            {loading ? (
              <ScheduleSkeleton />
            ) : calendarView === 'week' ? (
              <EmployeeWeekGrid
                weekDays={weekDays}
                userId={user?.id}
                viewMode={viewMode}
                selectedDayKey={selectedDayKey}
                canSwapShifts={canSwapShifts}
                getShiftsForDate={getShiftsForDate}
                onSelectDay={setSelectedDayKey}
                onSwapRequest={handleSwapRequest}
                isTodayDate={isTodayDate}
              />
            ) : (
              <EmployeeMonthGrid
                monthDays={monthGrid.days}
                userId={user?.id}
                selectedDayKey={selectedDayKey}
                getShiftsForDate={getShiftsForDate}
                onSelectDay={setSelectedDayKey}
                isTodayDate={isTodayDate}
                isCurrentMonth={isCurrentMonth}
              />
            )}
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.legendDotMine]} />
                <Text style={styles.legendText}>{t('screens.schedule.myShifts')}</Text>
              </View>
              {viewMode === 'team' && (
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, styles.legendDotOther]} />
                  <Text style={styles.legendText}>{t('screens.schedule.colleagues')}</Text>
                </View>
              )}
            </View>
          </View>

          <DayDetailSection
            selectedDayKey={selectedDayKey}
            shifts={selectedDayShifts}
            userId={user?.id}
            canSwapShifts={canSwapShifts}
            canRequestShifts={canRequestShifts}
            onSwapRequest={handleSwapRequest}
            onNavigateRequests={() => navigation.navigate('Requests')}
          />

          {canRequestShifts && (
            <TouchableOpacity
              style={styles.requestsLink}
              onPress={() => navigation.navigate('Requests')}
            >
              <Text style={styles.requestsLinkText}>{t('screens.schedule.requestShift')}</Text>
            </TouchableOpacity>
          )}

          <View style={styles.bottomSpacer} />
        </ScrollView>

        <SwapRequestModal
          visible={swapModalVisible}
          selectedShift={selectedShift}
          employees={employees}
          targetEmployeeShifts={targetEmployeeShifts}
          swapTargetEmployeeId={swapTargetEmployeeId}
          swapTargetShiftId={swapTargetShiftId}
          swapReason={swapReason}
          onClose={() => setSwapModalVisible(false)}
          onSelectEmployee={(employeeId) => {
            setSwapTargetEmployeeId(employeeId);
            setSwapTargetShiftId('');
          }}
          onSelectShift={setSwapTargetShiftId}
          onReasonChange={setSwapReason}
          onSubmit={submitSwapRequest}
        />
      </ThemedSafeAreaView>
    </PermissionGate>
  );
}
