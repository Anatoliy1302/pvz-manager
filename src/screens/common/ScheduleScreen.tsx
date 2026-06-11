// src/screens/common/ScheduleScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Alert, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import ScreenHeader from '../../components/common/ScreenHeader';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useFocusEffect } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../../context/AuthContext';
import DataService from '../../services/DataService';
import { colors } from '../../constants/colors';
import notificationService from '../../services/NotificationService';
import {
  getPvzWorkHours,
  getEmployeeShiftRates,
  calculateEarningsByShiftType,
} from '../../utils/salaryRateHelpers';
import { Copy } from 'lucide-react-native';
import PermissionGate from '../../components/common/PermissionGate';
import { ShiftAssignment, ShiftStatus, ShiftType } from './scheduleTypes';
import {
  getDatesForView,
  getDefaultHourlyTimes,
  getShiftTypes,
  getWeekRange,
  validateTime,
  PvzWorkHours,
} from './schedule/scheduleHelpers';
import { scheduleStyles } from './schedule/scheduleStyles';
import SchedulePvzSelector from './schedule/components/SchedulePvzSelector';
import ScheduleControlPanel from './schedule/components/ScheduleControlPanel';
import ScheduleGrid from './schedule/components/ScheduleGrid';
import ScheduleShiftModal from './schedule/components/ScheduleShiftModal';
import ScheduleCopyModal from './schedule/components/ScheduleCopyModal';
import ScheduleQuickActionsBar from './schedule/components/ScheduleQuickActionsBar';

interface Employee {
  id: string;
  name: string;
  role: string;
  phone?: string;
  employeeType?: 'full_shift' | 'half_shift' | 'hourly';
  fixedShiftRate?: number;
  hourlyRate?: number;
}

export default function ScheduleScreen({ navigation }: { navigation: { goBack: () => void; navigate: (screen: string) => void } }) {
  const { t } = useTranslation();
  const { pvz, userPvzs, updateCurrentPvz, hasRole, hasPermission } = useAuth();
  const { ui, screen, theme } = useThemedScreen();
  const isEmployee = hasRole(['employee']);
  const canManage =
    hasRole(['owner']) ||
    hasPermission('canManageSchedule') ||
    hasPermission('canManageShifts');
  const canEdit = canManage;

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [selectedCell, setSelectedCell] = useState<{
    date: string;
    employeeId: string;
    employeeName: string;
  } | null>(null);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [selectedShiftType, setSelectedShiftType] = useState<ShiftType>('full');
  const [customStart, setCustomStart] = useState('10:00');
  const [customEnd, setCustomEnd] = useState('14:00');
  const [calculatedEarnings, setCalculatedEarnings] = useState(0);
  const [startError, setStartError] = useState('');
  const [endError, setEndError] = useState('');
  const [hourlyPickerField, setHourlyPickerField] = useState<'start' | 'end' | null>(null);
  const [pickerDraftTime, setPickerDraftTime] = useState('10:00');
  const [copyModalVisible, setCopyModalVisible] = useState(false);
  const [copyFromDate, setCopyFromDate] = useState('');
  const [copyToDate, setCopyToDate] = useState('');
  const [showPvzSelector, setShowPvzSelector] = useState(false);
  const [pvzWorkHours, setPvzWorkHours] = useState<PvzWorkHours>({
    workStart: '09:00',
    workEnd: '21:00',
    totalHours: 12,
  });

  const shiftTypes = getShiftTypes(pvzWorkHours);
  const dates = getDatesForView(currentDate, viewMode);

  const loadPvzWorkHours = async () => {
    if (!pvz?.id) return;
    try {
      const hours = await getPvzWorkHours(pvz.id);
      setPvzWorkHours(hours);
    } catch (error) {
      console.error('Ошибка загрузки часов работы:', error);
    }
  };

  const openHourlyPicker = (field: 'start' | 'end') => {
    const defaults = getDefaultHourlyTimes(pvzWorkHours);
    const raw = field === 'start' ? customStart : customEnd;
    const fallback = field === 'start' ? defaults.start : defaults.end;
    setPickerDraftTime(validateTime(raw) ? raw : fallback);
    setHourlyPickerField(field);
  };

  const confirmHourlyPicker = () => {
    if (hourlyPickerField === 'start') {
      setCustomStart(pickerDraftTime);
      setStartError('');
    } else if (hourlyPickerField === 'end') {
      setCustomEnd(pickerDraftTime);
      setEndError('');
    }
    setHourlyPickerField(null);
  };

  const recalculateEarnings = async () => {
    if (!selectedCell || !pvz?.id) return;

    try {
      const rates = await getEmployeeShiftRates(selectedCell.employeeId, pvz.id);
      let start = customStart;
      let end = customEnd;

      if (selectedShiftType === 'hourly' && (!validateTime(start) || !validateTime(end))) {
        const defaults = getDefaultHourlyTimes(pvzWorkHours);
        start = defaults.start;
        end = defaults.end;
      }

      const earnings = calculateEarningsByShiftType(selectedShiftType, rates, {
        customStart: start,
        customEnd: end,
      });

      setCalculatedEarnings(earnings);
    } catch (error) {
      console.error('Ошибка расчёта:', error);
    }
  };

  useEffect(() => {
    recalculateEarnings();
  }, [selectedShiftType, customStart, customEnd, pvzWorkHours, selectedCell?.employeeId, pvz?.id]);

  const loadEmployees = async () => {
    if (!pvz?.id) return;
    try {
      const stored = await SecureStore.getItemAsync('pvz_users');
      if (stored) {
        const all = JSON.parse(stored);
        const filtered = all.filter(
          (u: Employee & { status: string; pvzId: string }) =>
            u.role !== 'owner' && u.status === 'active' && u.pvzId === pvz.id
        );
        setEmployees(filtered);
      }
    } catch (error) {
      console.error('Ошибка загрузки сотрудников:', error);
    }
  };

  const loadAssignments = async () => {
    if (!pvz?.id) return;
    try {
      const allAssignments = await DataService.syncScheduleFromShifts(pvz.id);
      const allShifts = await DataService.getShifts();

      const withStatus: ShiftAssignment[] = allAssignments.map((a) => {
        const shiftStatus = allShifts.find((s) => s.id === a.id);
        const status = (shiftStatus?.status || a.status || 'planned') as ShiftStatus;
        const paymentStatus = (shiftStatus?.paymentStatus ||
          a.paymentStatus ||
          'pending') as 'pending' | 'paid';
        return {
          ...a,
          shiftType: a.shiftType,
          status,
          paymentStatus,
          earnings: shiftStatus?.earnings ?? a.earnings,
          pvzName: a.pvzName || pvz.name,
          pvzId: a.pvzId || pvz.id,
        };
      });
      setAssignments(withStatus);
    } catch (error) {
      console.error('Ошибка загрузки расписания:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadPvzWorkHours();
      loadEmployees();
      loadAssignments();

      const unsubShifts = DataService.subscribe('shifts', loadAssignments);
      const unsubSchedule = pvz?.id
        ? DataService.subscribe(`schedule_assignments_${pvz.id}`, loadAssignments)
        : () => {};

      return () => {
        unsubShifts();
        unsubSchedule();
      };
    }, [pvz?.id])
  );

  const getAssignment = (employeeId: string, dateStr: string): ShiftAssignment | undefined =>
    assignments.find((a) => a.employeeId === employeeId && a.date === dateStr);

  const addAssignment = async () => {
    if (!selectedCell) return;

    if (selectedShiftType === 'hourly') {
      if (!validateTime(customStart)) {
        setStartError(t('alerts.validation.startTimeRequired'));
        return;
      }
      if (!validateTime(customEnd)) {
        setEndError(t('alerts.validation.endTimeRequired'));
        return;
      }

      const [startH, startM] = customStart.split(':').map(Number);
      const [endH, endM] = customEnd.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      if (startMinutes >= endMinutes) {
        setEndError(t('alerts.validation.endAfterStartSchedule'));
        return;
      }
    }

    const existing = getAssignment(selectedCell.employeeId, selectedCell.date);
    const shiftTypeInfo = shiftTypes.find((t) => t.id === selectedShiftType);

    const newAssignment: ShiftAssignment = {
      id: existing?.id || Date.now().toString(),
      employeeId: selectedCell.employeeId,
      employeeName: selectedCell.employeeName,
      date: selectedCell.date,
      shiftType: selectedShiftType,
      status: 'planned',
      paymentStatus: 'pending',
      pvzId: pvz?.id,
      pvzName: pvz?.name,
      earnings: calculatedEarnings,
      ...(selectedShiftType === 'hourly' && { customStart, customEnd }),
    };

    const newAssignments = [...assignments];

    if (existing) {
      const index = newAssignments.findIndex((a) => a.id === existing.id);
      newAssignments[index] = newAssignment;
    } else {
      newAssignments.push(newAssignment);
    }

    const allAssignments = await SecureStore.getItemAsync(`schedule_assignments_${pvz?.id}`);
    let all = allAssignments ? JSON.parse(allAssignments) : [];

    if (existing) {
      const idx = all.findIndex((a: ShiftAssignment) => a.id === existing.id);
      if (idx !== -1) all[idx] = newAssignment;
    } else {
      all.push(newAssignment);
    }

    await SecureStore.setItemAsync(`schedule_assignments_${pvz?.id}`, JSON.stringify(all));

    const shiftForDashboard = {
      id: newAssignment.id,
      employeeId: newAssignment.employeeId,
      employeeName: newAssignment.employeeName,
      date: newAssignment.date,
      startTime: selectedShiftType === 'hourly' ? customStart : shiftTypeInfo?.startTime || '10:00',
      endTime: selectedShiftType === 'hourly' ? customEnd : shiftTypeInfo?.endTime || '22:00',
      shiftType: selectedShiftType,
      customStart: selectedShiftType === 'hourly' ? customStart : undefined,
      customEnd: selectedShiftType === 'hourly' ? customEnd : undefined,
      status: 'planned' as const,
      paymentStatus: 'pending' as const,
      pvzId: pvz?.id,
      pvzName: pvz?.name,
      earnings: calculatedEarnings,
    };

    if (existing) {
      await DataService.updateShift(existing.id, shiftForDashboard);
    } else {
      await DataService.addShift(shiftForDashboard);
    }
    setAssignments(newAssignments);

    await notificationService.notifyShiftAdded(
      selectedCell.employeeName,
      selectedCell.date,
      `${shiftTypeInfo?.name || t('common.shiftTypes.shift')} (${calculatedEarnings} ₽)`,
      pvz?.name
    );

    setShowShiftModal(false);
    setSelectedCell(null);
    setStartError('');
    setEndError('');
  };

  const deleteAssignment = async () => {
    if (!selectedCell) return;

    const deletedShift = assignments.find(
      (a) => a.employeeId === selectedCell.employeeId && a.date === selectedCell.date
    );

    if (!deletedShift) return;

    const allAssignments = await SecureStore.getItemAsync(`schedule_assignments_${pvz?.id}`);
    const all = allAssignments ? JSON.parse(allAssignments) : [];
    const newAll = all.filter(
      (a: ShiftAssignment) =>
        !(a.employeeId === selectedCell.employeeId && a.date === selectedCell.date)
    );
    await SecureStore.setItemAsync(`schedule_assignments_${pvz?.id}`, JSON.stringify(newAll));

    await DataService.deleteShift(deletedShift.id);

    setAssignments(newAll);

    await notificationService.notifyShiftDeleted(
      selectedCell.employeeName,
      selectedCell.date,
      t('common.shiftTypes.shift'),
      pvz?.name
    );

    setShowShiftModal(false);
    setSelectedCell(null);
  };

  const copySchedule = async () => {
    if (!copyFromDate || !copyToDate) return;

    const allAssignments = await SecureStore.getItemAsync(`schedule_assignments_${pvz?.id}`);
    const all = allAssignments ? JSON.parse(allAssignments) : [];

    const sourceAssignments = all.filter((a: ShiftAssignment) => a.date === copyFromDate);
    const withoutTarget = all.filter((a: ShiftAssignment) => a.date !== copyToDate);
    const copied = sourceAssignments.map((a: ShiftAssignment) => ({
      ...a,
      id: Date.now().toString() + Math.random(),
      date: copyToDate,
      status: 'planned',
      paymentStatus: 'pending',
    }));

    const newAssignments = [...withoutTarget, ...copied];
    await SecureStore.setItemAsync(`schedule_assignments_${pvz?.id}`, JSON.stringify(newAssignments));

    const existingShifts = await DataService.getShifts();
    const keptShifts = existingShifts.filter((s) => s.date !== copyToDate);
    const copiedShifts = copied.map((shift: ShiftAssignment) => {
      const shiftTypeInfo = shiftTypes.find((t) => t.id === shift.shiftType);
      return {
        id: shift.id,
        employeeId: shift.employeeId,
        employeeName: shift.employeeName,
        date: shift.date,
        startTime: shift.shiftType === 'hourly' ? shift.customStart : shiftTypeInfo?.startTime || '10:00',
        endTime: shift.shiftType === 'hourly' ? shift.customEnd : shiftTypeInfo?.endTime || '22:00',
        shiftType: shift.shiftType,
        customStart: shift.customStart,
        customEnd: shift.customEnd,
        status: 'planned' as const,
        paymentStatus: 'pending' as const,
        pvzId: shift.pvzId || pvz?.id,
        pvzName: shift.pvzName || pvz?.name,
        earnings: shift.earnings,
      };
    });

    await DataService.saveShifts([...keptShifts, ...copiedShifts]);
    await loadAssignments();

    await notificationService.notifyScheduleCopied(pvz?.name || t('common.pvz.default'), copyFromDate, copyToDate);

    setCopyModalVisible(false);
    setCopyFromDate('');
    setCopyToDate('');
    Alert.alert(t('common.success.title'), t('alerts.success.scheduleCopied'));
  };

  const changeWeek = (delta: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + delta * 7);
    setCurrentDate(newDate);
  };

  const changeMonth = (delta: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(currentDate.getMonth() + delta);
    setCurrentDate(newDate);
  };

  const handleCellPress = (
    dateStr: string,
    employeeId: string,
    employeeName: string,
    assignment?: ShiftAssignment
  ) => {
    if (!canEdit) return;

    if (assignment && assignment.paymentStatus === 'paid') {
      Alert.alert(t('common.notice.title'), t('common.shiftStatus.paidLocked'));
      return;
    }

    if (assignment && assignment.status === 'completed') {
      Alert.alert(t('common.notice.title'), t('common.shiftStatus.finishedAwaiting'));
      return;
    }

    if (assignment) {
      Alert.alert(
        t('screens.schedule.shiftActionTitle'),
        t('screens.schedule.shiftActionMessage', { employee: employeeName, date: dateStr }),
        [
          { text: t('common.actions.cancel'), style: 'cancel' },
          {
            text: t('common.actions.edit'),
            onPress: () => {
              setSelectedCell({ date: dateStr, employeeId, employeeName });
              setSelectedShiftType(assignment.shiftType);
              if (assignment.shiftType === 'hourly' && assignment.customStart && assignment.customEnd) {
                setCustomStart(assignment.customStart);
                setCustomEnd(assignment.customEnd);
              } else {
                const defaults = getDefaultHourlyTimes(pvzWorkHours);
                setCustomStart(defaults.start);
                setCustomEnd(defaults.end);
              }
              setShowShiftModal(true);
            },
          },
          {
            text: t('common.actions.delete'),
            onPress: () => {
              setSelectedCell({ date: dateStr, employeeId, employeeName });
              deleteAssignment();
            },
            style: 'destructive',
          },
        ]
      );
    } else {
      setSelectedCell({ date: dateStr, employeeId, employeeName });
      setSelectedShiftType('full');
      const defaults = getDefaultHourlyTimes(pvzWorkHours);
      setCustomStart(defaults.start);
      setCustomEnd(defaults.end);
      setShowShiftModal(true);
    }
  };

  const handleSelectShiftType = (type: ShiftType) => {
    setSelectedShiftType(type);
    setStartError('');
    setEndError('');
    if (type === 'hourly' && selectedShiftType !== 'hourly') {
      const defaults = getDefaultHourlyTimes(pvzWorkHours);
      setCustomStart(defaults.start);
      setCustomEnd(defaults.end);
    }
  };

  const handleAndroidHourlySelect = (field: 'start' | 'end', time: string) => {
    if (field === 'start') {
      setCustomStart(time);
      setStartError('');
    } else {
      setCustomEnd(time);
      setEndError('');
    }
  };

  const currentPvz = userPvzs?.find((p) => p.id === pvz?.id) || pvz;
  const hasMultiplePvzs = userPvzs && userPvzs.length > 1;

  return (
    <PermissionGate
      anyOf={['canManageSchedule', 'canManageShifts', 'canViewShifts']}
      navigation={navigation}
      title={t('screens.schedule.accessDenied')}
      description={t('screens.schedule.accessDeniedDesc')}
    >
      <ThemedSafeAreaView style={scheduleStyles.container}>
        <ScreenHeader
          title={t('screens.schedule.title')}
          onBack={() => navigation.goBack()}
          right={
            canEdit ? (
              <TouchableOpacity onPress={() => setCopyModalVisible(true)}>
                <Copy size={20} color="#FFFFFF" />
              </TouchableOpacity>
            ) : undefined
          }
        />

        {!isEmployee && hasMultiplePvzs && (
          <SchedulePvzSelector
            currentPvzName={currentPvz?.name}
            userPvzs={userPvzs || []}
            selectedPvzId={pvz?.id}
            showDropdown={showPvzSelector}
            cardStyle={ui.card}
            textSecondary={screen.textSecondary}
            borderColor={screen.border}
            onToggle={() => setShowPvzSelector(!showPvzSelector)}
            onSelectPvz={async (pvzId) => {
              await updateCurrentPvz(pvzId);
              setShowPvzSelector(false);
            }}
          />
        )}

        <ScheduleControlPanel
          viewMode={viewMode}
          currentDate={currentDate}
          weekRange={getWeekRange(dates)}
          cardBackground={screen.card}
          borderColor={screen.border}
          inputBackground={ui.input.backgroundColor}
          textColor={screen.text}
          textSecondary={screen.textSecondary}
          onViewModeChange={setViewMode}
          onNavigateBack={() => (viewMode === 'week' ? changeWeek(-1) : changeMonth(-1))}
          onNavigateForward={() => (viewMode === 'week' ? changeWeek(1) : changeMonth(1))}
          formatDate={(date) => date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
        />

        <ScheduleGrid
          dates={dates}
          employees={employees}
          canEdit={canEdit}
          textColor={screen.text}
          textSecondary={screen.textSecondary}
          borderColor={screen.border}
          emptyCellBackground={ui.input.backgroundColor}
          shiftTypes={shiftTypes}
          getAssignment={getAssignment}
          onCellPress={handleCellPress}
        />

        <ScheduleShiftModal
          visible={showShiftModal && canEdit}
          selectedCell={selectedCell}
          selectedShiftType={selectedShiftType}
          shiftTypes={shiftTypes}
          customStart={customStart}
          customEnd={customEnd}
          startError={startError}
          endError={endError}
          calculatedEarnings={calculatedEarnings}
          hasExistingAssignment={
            !!selectedCell && !!getAssignment(selectedCell.employeeId, selectedCell.date)
          }
          hourlyPickerField={hourlyPickerField}
          pickerDraftTime={pickerDraftTime}
          theme={theme}
          textColor={screen.text}
          textSecondary={screen.textSecondary}
          modalStyle={ui.modal}
          titleStyle={ui.title}
          onClose={() => setShowShiftModal(false)}
          onSelectShiftType={handleSelectShiftType}
          onOpenHourlyPicker={openHourlyPicker}
          onHourlyPickerDismiss={() => setHourlyPickerField(null)}
          onHourlyPickerDraftChange={setPickerDraftTime}
          onHourlyPickerConfirm={confirmHourlyPicker}
          onAndroidHourlySelect={handleAndroidHourlySelect}
          onSave={addAssignment}
          onDelete={deleteAssignment}
        />

        <ScheduleCopyModal
          visible={copyModalVisible && canEdit}
          copyFromDate={copyFromDate}
          copyToDate={copyToDate}
          modalStyle={ui.modal}
          titleStyle={ui.title}
          inputStyle={ui.input}
          sectionTitleStyle={ui.sectionTitle}
          onChangeFromDate={setCopyFromDate}
          onChangeToDate={setCopyToDate}
          onClose={() => setCopyModalVisible(false)}
          onCopy={copySchedule}
        />

        <ScheduleQuickActionsBar
          canEdit={canEdit}
          cardBackground={screen.card}
          borderColor={screen.border}
          inputBackground={ui.input.backgroundColor}
          onGoToday={() => setCurrentDate(new Date())}
          onCopy={() => setCopyModalVisible(true)}
        />
      </ThemedSafeAreaView>
    </PermissionGate>
  );
}
