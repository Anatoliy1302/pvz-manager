// src/screens/profile/EmployeeTimesheetScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../constants/colors';
import DataService from '../../services/DataService';
import { formatHours } from '../../utils/dateHelpers';
import {
  loadEmployeeTimesheet,
  formatMoney,
  getShiftStatusLabel,
  EmployeeTimesheetData,
  ShiftDisplayStatus,
} from '../../utils/employeeStatsHelpers';
import {
  ChevronLeft,
  Calendar,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Award,
  Ban,
  ClipboardList,
} from 'lucide-react-native';
import MoneyIcon from '../../components/icons/MoneyIcon';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getDateLocale } from '../../i18n';

const STATUS_COLORS: Record<ShiftDisplayStatus, string> = {
  completed: colors.success,
  paid: '#2196F3',
  planned: colors.warning,
  active: colors.primary,
};

const EMPTY_TIMESHEET: EmployeeTimesheetData = {
  periodStart: '',
  periodEnd: '',
  plannedHours: 0,
  actualHours: 0,
  plannedSalary: 0,
  actualSalary: 0,
  fines: 0,
  bonuses: 0,
  netEarned: 0,
  fullShiftRate: 0,
  halfShiftRate: 0,
  hourlyRate: 0,
  completedShifts: [],
  plannedShifts: [],
};

export default function EmployeeTimesheetScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { user, pvz } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(1);
    return date;
  });
  const [endDate, setEndDate] = useState(new Date());
  const [pickerField, setPickerField] = useState<'start' | 'end' | null>(null);
  const [pickerDraft, setPickerDraft] = useState(new Date());
  const [timesheet, setTimesheet] = useState<EmployeeTimesheetData>(EMPTY_TIMESHEET);

  const pvzId = pvz?.id || user?.pvzId || '';
  const dateLocale = getDateLocale();

  const formatSignedHours = (diff: number): string => {
    if (diff === 0) return formatHours(0);
    const prefix = diff > 0 ? '+' : '−';
    return `${prefix}${formatHours(Math.abs(diff))}`;
  };

  const formatSignedMoney = (diff: number): string => {
    if (diff === 0) return `0 ${t('common.money.currency')}`;
    const prefix = diff > 0 ? '+' : '−';
    return `${prefix}${Math.abs(Math.round(diff)).toLocaleString(dateLocale)} ${t('common.money.currency')}`;
  };

  const loadTimesheetData = async () => {
    if (!user?.id || !pvzId) return;

    try {
      const data = await loadEmployeeTimesheet(user.id, pvzId, startDate, endDate);
      setTimesheet(data);
    } catch (error) {
      console.error('Ошибка загрузки табеля:', error);
    }
  };

  useEffect(() => {
    const unsubscribeShifts = DataService.subscribe('shifts', loadTimesheetData);
    const unsubscribeBalance = DataService.subscribe('employee_balance', loadTimesheetData);
    loadTimesheetData();
    return () => {
      unsubscribeShifts();
      unsubscribeBalance();
    };
  }, [startDate, endDate, user?.id, pvzId]);

  useFocusEffect(
    useCallback(() => {
      loadTimesheetData();
    }, [startDate, endDate, user?.id, pvzId])
  );

  const formatDateDisplay = (date: Date) =>
    date.toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric' });

  const openDatePicker = (field: 'start' | 'end') => {
    setPickerDraft(field === 'start' ? startDate : endDate);
    setPickerField(field);
  };

  const closeDatePicker = () => {
    setPickerField(null);
  };

  const confirmDatePicker = () => {
    if (pickerField === 'start') {
      setStartDate(pickerDraft);
      if (pickerDraft > endDate) setEndDate(pickerDraft);
    } else if (pickerField === 'end') {
      setEndDate(pickerDraft);
      if (pickerDraft < startDate) setStartDate(pickerDraft);
    }
    closeDatePicker();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTimesheetData();
    setRefreshing(false);
  };

  const hoursDiff = timesheet.actualHours - timesheet.plannedHours;
  const salaryDiff = timesheet.actualSalary - timesheet.plannedSalary;
  const hasAnyData =
    timesheet.completedShifts.length > 0 || timesheet.plannedShifts.length > 0;

  const renderShiftRow = (shift: EmployeeTimesheetData['completedShifts'][0]) => (
    <View key={shift.id} style={styles.shiftRow}>
      <View style={styles.shiftLeft}>
        <Text style={styles.shiftDate}>
          {new Date(shift.date).toLocaleDateString(dateLocale, {
            day: 'numeric',
            month: 'short',
          })}
        </Text>
        <Text style={styles.shiftMeta}>
          {shift.startTime && shift.endTime
            ? `${shift.startTime}–${shift.endTime}`
            : formatHours(shift.hours)}
        </Text>
      </View>
      {shift.earnings > 0 ? (
        <Text style={styles.shiftEarnings}>+{formatMoney(shift.earnings)}</Text>
      ) : (
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: `${STATUS_COLORS[shift.status]}20` },
          ]}
        >
          <Text style={[styles.statusBadgeText, { color: STATUS_COLORS[shift.status] }]}>
            {getShiftStatusLabel(shift.status)}
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <ThemedSafeAreaView>
      <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ChevronLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('screens.profile.timesheet')}</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.periodCard}>
          <Text style={styles.periodLabel}>{t('common.period.period')}</Text>
          <View style={styles.dateRow}>
            <TouchableOpacity style={styles.dateButton} onPress={() => openDatePicker('start')}>
              <Calendar size={18} color={colors.primary} />
              <Text style={styles.dateText}>{formatDateDisplay(startDate)}</Text>
            </TouchableOpacity>
            <Text style={styles.dateSeparator}>—</Text>
            <TouchableOpacity style={styles.dateButton} onPress={() => openDatePicker('end')}>
              <Calendar size={18} color={colors.primary} />
              <Text style={styles.dateText}>{formatDateDisplay(endDate)}</Text>
            </TouchableOpacity>
          </View>
          {pvz?.name && (
            <Text style={styles.pvzHint}>
              {t('common.pvz.label')} {pvz.name}
            </Text>
          )}
        </View>

        <View style={styles.rateCard}>
          <MoneyIcon size={18} color={colors.primary} />
          <Text style={styles.rateText}>
            {t('screens.timesheet.ratesHint', {
              full: formatMoney(timesheet.fullShiftRate),
              half: formatMoney(timesheet.halfShiftRate),
              hourly: `${timesheet.hourlyRate} ${t('common.money.currency')}/${t('common.stats.hoursShort')}`,
            })}
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{t('screens.timesheet.hoursSection')}</Text>
          <Text style={styles.sectionHint}>{t('screens.timesheet.hoursHint')}</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>{t('screens.timesheet.planned')}</Text>
              <Text style={styles.statValue}>{formatHours(timesheet.plannedHours)}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>{t('screens.timesheet.actual')}</Text>
              <Text style={[styles.statValue, { color: colors.primary }]}>
                {formatHours(timesheet.actualHours)}
              </Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>{t('screens.timesheet.deviation')}</Text>
              <View style={styles.statDiff}>
                {hoursDiff >= 0 ? (
                  <TrendingUp size={14} color={colors.success} />
                ) : (
                  <TrendingDown size={14} color={colors.danger} />
                )}
                <Text
                  style={[
                    styles.statValue,
                    {
                      color: hoursDiff >= 0 ? colors.success : colors.danger,
                      fontSize: 14,
                    },
                  ]}
                >
                  {formatSignedHours(hoursDiff)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{t('screens.timesheet.accrualsSection')}</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>{t('screens.timesheet.planned')}</Text>
              <Text style={styles.statValue}>{formatMoney(timesheet.plannedSalary)}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>{t('screens.timesheet.forShifts')}</Text>
              <Text style={[styles.statValue, { color: colors.primary }]}>
                {formatMoney(timesheet.actualSalary)}
              </Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>{t('screens.timesheet.deviation')}</Text>
              <View style={styles.statDiff}>
                {salaryDiff >= 0 ? (
                  <TrendingUp size={14} color={colors.success} />
                ) : (
                  <TrendingDown size={14} color={colors.danger} />
                )}
                <Text
                  style={[
                    styles.statValue,
                    {
                      color: salaryDiff >= 0 ? colors.success : colors.danger,
                      fontSize: 13,
                    },
                  ]}
                >
                  {formatSignedMoney(salaryDiff)}
                </Text>
              </View>
            </View>
          </View>

          {(timesheet.fines > 0 || timesheet.bonuses > 0) && (
            <View style={styles.penaltiesSection}>
              {timesheet.fines > 0 && (
                <View style={styles.penaltyRow}>
                  <Ban size={14} color={colors.danger} />
                  <Text style={styles.penaltyLabel}>{t('screens.timesheet.penalties')}</Text>
                  <Text style={styles.penaltyFineValue}>−{formatMoney(timesheet.fines)}</Text>
                </View>
              )}
              {timesheet.bonuses > 0 && (
                <View style={styles.penaltyRow}>
                  <Award size={14} color={colors.success} />
                  <Text style={styles.penaltyLabel}>{t('screens.timesheet.bonuses')}</Text>
                  <Text style={styles.penaltyBonusValue}>+{formatMoney(timesheet.bonuses)}</Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t('screens.timesheet.totalToPay')}</Text>
            <Text style={styles.totalValue}>{formatMoney(timesheet.netEarned)}</Text>
          </View>
        </View>

        {timesheet.completedShifts.length > 0 && (
          <View style={styles.listCard}>
            <Text style={styles.listTitle}>{t('screens.timesheet.completedShifts')}</Text>
            {timesheet.completedShifts.map(renderShiftRow)}
          </View>
        )}

        {timesheet.plannedShifts.length > 0 && (
          <View style={styles.listCard}>
            <Text style={styles.listTitle}>{t('screens.timesheet.plannedShifts')}</Text>
            {timesheet.plannedShifts.map(renderShiftRow)}
          </View>
        )}

        {!hasAnyData && (
          <View style={styles.emptyContainer}>
            <ClipboardList size={48} color={colors.grayLighter} />
            <Text style={styles.emptyText}>{t('screens.timesheet.emptyTitle')}</Text>
            <Text style={styles.emptySubtext}>{t('screens.timesheet.emptyDesc')}</Text>
          </View>
        )}

        <View style={styles.infoCard}>
          <AlertCircle size={16} color={colors.primary} />
          <Text style={styles.infoText}>{t('screens.timesheet.footerNote')}</Text>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {pickerField && Platform.OS === 'android' && (
        <DateTimePicker
          value={pickerDraft}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            closeDatePicker();
            if (event.type === 'dismissed' || !selectedDate) return;
            if (pickerField === 'start') {
              setStartDate(selectedDate);
              if (selectedDate > endDate) setEndDate(selectedDate);
            } else {
              setEndDate(selectedDate);
              if (selectedDate < startDate) setStartDate(selectedDate);
            }
          }}
        />
      )}

      <Modal
        visible={pickerField !== null && Platform.OS === 'ios'}
        transparent
        animationType="slide"
        onRequestClose={closeDatePicker}
      >
        <View style={styles.pickerOverlay}>
          <TouchableOpacity
            style={styles.pickerBackdrop}
            activeOpacity={1}
            onPress={closeDatePicker}
          />
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>
              {pickerField === 'start' ? t('common.period.start') : t('common.period.end')}
            </Text>
            <View style={styles.pickerSpinnerContainer}>
              <DateTimePicker
                value={pickerDraft}
                mode="date"
                display="spinner"
                themeVariant="light"
                textColor="#1A1A1A"
                locale={dateLocale}
                style={styles.pickerSpinner}
                onChange={(_event, selectedDate) => {
                  if (selectedDate) setPickerDraft(selectedDate);
                }}
              />
            </View>
            <View style={styles.pickerActions}>
              <TouchableOpacity style={styles.pickerCancelButton} onPress={closeDatePicker}>
                <Text style={styles.pickerCancelText}>{t('common.actions.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pickerDoneButton} onPress={confirmDatePicker}>
                <Text style={styles.pickerDoneText}>{t('common.actions.done')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' },
  periodCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 20,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  periodLabel: { fontSize: 14, color: '#666', marginBottom: 12 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
  },
  dateText: { fontSize: 15, color: '#1A1A1A', fontWeight: '500' },
  dateSeparator: { fontSize: 16, color: '#999' },
  pvzHint: { fontSize: 12, color: '#888', marginTop: 10 },
  rateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E8F0FE',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
  },
  rateText: { flex: 1, fontSize: 12, color: colors.primary, lineHeight: 18 },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 4 },
  sectionHint: { fontSize: 11, color: '#999', marginBottom: 12 },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  statBox: { alignItems: 'center', flex: 1 },
  statLabel: { fontSize: 12, color: '#999', marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: 'bold', color: '#1A1A1A', textAlign: 'center' },
  statDiff: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  penaltiesSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    gap: 8,
  },
  penaltyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  penaltyLabel: { fontSize: 14, color: '#666', flex: 1 },
  penaltyFineValue: { fontSize: 14, fontWeight: '600', color: colors.danger },
  penaltyBonusValue: { fontSize: 14, fontWeight: '600', color: colors.success },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  totalLabel: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
  totalValue: { fontSize: 20, fontWeight: 'bold', color: colors.primary },
  listCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  listTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A1A', marginBottom: 8 },
  shiftRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  shiftLeft: { flexDirection: 'row', gap: 12, alignItems: 'center', flex: 1 },
  shiftDate: { fontSize: 14, color: '#1A1A1A', width: 60 },
  shiftMeta: { fontSize: 13, color: '#666', flex: 1 },
  shiftEarnings: { fontSize: 13, fontWeight: '600', color: colors.success },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
    paddingHorizontal: 32,
  },
  emptyText: { fontSize: 16, color: '#999', marginTop: 16 },
  emptySubtext: { fontSize: 12, color: '#CCC', marginTop: 4, textAlign: 'center' },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#E8F0FE',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 30,
    padding: 12,
    borderRadius: 16,
  },
  infoText: { flex: 1, fontSize: 12, color: colors.primary, lineHeight: 18 },
  bottomSpacer: { height: 20 },

  pickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  pickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  pickerSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingBottom: 28,
    paddingHorizontal: 20,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 8,
  },
  pickerSpinnerContainer: {
    width: '100%',
    height: 216,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerSpinner: {
    width: '100%',
    height: 216,
  },
  pickerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 12,
  },
  pickerCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
  },
  pickerCancelText: { fontSize: 16, color: '#666', fontWeight: '500' },
  pickerDoneButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  pickerDoneText: { fontSize: 16, color: '#FFFFFF', fontWeight: '600' },
});
