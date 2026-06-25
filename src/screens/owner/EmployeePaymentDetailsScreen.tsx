// src/screens/owner/EmployeePaymentDetailsScreen.tsx
import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getDateLocale } from '../../i18n';
import { toDateKey } from '../../utils/dateHelpers';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import ScreenHeader from '../../components/common/ScreenHeader';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useModalStyles } from '../../hooks/useModalStyles';
import { useScreenToast } from '../../hooks/useScreenToast';
import { useErrorHandler } from '../../context/ErrorHandlerContext';
import { useMountedRef } from '../../hooks/useMountedRef';
import { useFocusEffect } from '@react-navigation/native';
import StorageService from '../../services/StorageService';
import { SecureStoreKeys } from '../../constants/secureStoreKeys';
import { useAuth } from '../../context/AuthContext';
import DataService from '../../services/DataService';
import { safeParseJson } from '../../utils/safeJson';
import { colors } from '../../constants/colors';
import { Payment, PaymentType } from '../../types/payment';
import { Shift, User as PvzUser } from '../../types/user';
import {
  addPayment,
  calculateEmployeeAccruals,
  reconcileShiftPaymentsForPvz,
} from '../../services/PaymentService';
import { 
  ChevronLeft, 
  Calendar, 
  TrendingUp,
  TrendingDown,
  X,
  Check,
  User,
  Phone,
  Filter,
} from 'lucide-react-native';
import MoneyIcon from '../../components/icons/MoneyIcon';
import { FLAT_LIST_PERF } from '../../constants/flatListPerf';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';

interface ShiftData {
  id: string;
  date: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  totalHours: number;
  earnings: number;
  paymentStatus: string;
}

import type { RootStackScreenProps } from '../../navigation/types';

type Props = RootStackScreenProps<'EmployeePaymentDetails'>;

export default function EmployeePaymentDetailsScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { user, pvz } = useAuth();
  const { ui } = useThemedScreen();
  const modal = useModalStyles();
  const { showError, showSuccess } = useScreenToast();
  const { handleError } = useErrorHandler();
  const mountedRef = useMountedRef();
  const { employeeId, employeeName: initialEmployeeName } = route.params;
  
  const [refreshing, setRefreshing] = useState(false);
  const [employee, setEmployee] = useState<PvzUser | null>(null);
  const [shifts, setShifts] = useState<ShiftData[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [totalEarned, setTotalEarned] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);
  const [balance, setBalance] = useState(0);
  
  // Фильтр периода
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  
  // Период для выплаты
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType>('salary');
  const [paymentPeriodStart, setPaymentPeriodStart] = useState('');
  const [paymentPeriodEnd, setPaymentPeriodEnd] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [showPayStartPicker, setShowPayStartPicker] = useState(false);
  const [showPayEndPicker, setShowPayEndPicker] = useState(false);

  // Инициализация периодов (текущий месяц по умолчанию)
  React.useEffect(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    const startStr = toDateKey(start);
    const endStr = toDateKey(end);
    
    setFilterStartDate(startStr);
    setFilterEndDate(endStr);
    setPaymentPeriodStart(startStr);
    setPaymentPeriodEnd(endStr);
  }, []);

  // Загрузка данных ЗА ВЫБРАННЫЙ ПЕРИОД
  const loadData = useCallback(async () => {
    if (!pvz?.id || !employeeId) return;

    try {
      await reconcileShiftPaymentsForPvz(pvz.id);

      const usersRaw = await StorageService.getItem(SecureStoreKeys.pvzUsers);
      const users = safeParseJson<PvzUser[]>(usersRaw ?? '[]', []);
      const emp = users.find((u) => u.id === employeeId);

      const shiftsRaw = await StorageService.getItem(SecureStoreKeys.shifts);
      const allShiftsRaw = safeParseJson<Shift[]>(shiftsRaw ?? '[]', []);
      const { coalesceShiftsPreferPaid } = await import('../../utils/scheduleHelpers');
      const allShifts = coalesceShiftsPreferPaid(allShiftsRaw);

      const periodShifts = allShifts.filter(
        (s) =>
          s.employeeId === employeeId &&
          s.date >= filterStartDate &&
          s.date <= filterEndDate
      );

      const formattedShifts: ShiftData[] = periodShifts.map((shift) => ({
        id: shift.id,
        date: shift.date,
        shiftType: shift.shiftType || (shift.customStart ? 'hourly' : 'full'),
        startTime: shift.startTime,
        endTime: shift.endTime,
        totalHours: shift.totalHours || shift.actualHours || 0,
        earnings: shift.earnings || 0,
        paymentStatus: shift.paymentStatus || 'pending',
      }));

      const accruals = await calculateEmployeeAccruals(employeeId, pvz.id, {
        periodStart: filterStartDate,
        periodEnd: filterEndDate,
      });

      const allPaymentsRaw = await StorageService.getItem(`payments_${pvz.id}`);
      const allPayments = safeParseJson<Payment[]>(allPaymentsRaw ?? '[]', []);
      const periodPayments = allPayments.filter(
        (p) =>
          p.employeeId === employeeId &&
          p.paidAt >= filterStartDate &&
          p.paidAt <= filterEndDate
      );

      if (!mountedRef.current) return;
      setEmployee(emp ?? null);
      setShifts(formattedShifts);
      setTotalEarned(accruals.netEarned);
      setTotalPaid(accruals.totalPaid);
      setBalance(accruals.balance);
      setPayments(periodPayments);
    } catch (error) {
      if (!mountedRef.current) return;
      handleError(error, { fallbackKey: 'alerts.network.loadFailed' });
    }
  }, [pvz?.id, employeeId, filterStartDate, filterEndDate, handleError, mountedRef]);

  // Выплата зарплаты
  const handleAddPayment = async () => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      showError(t('alerts.validation.invalidAmount'));
      return;
    }
    
    const amount = parseFloat(paymentAmount);
    if (amount > balance) {
      showError(t('alerts.validation.paymentExceeds', { amount, balance }));
      return;
    }
    
    await performPayment();
  };

  const performPayment = async () => {
    if (!pvz?.id || !employeeId) return;
    
    try {
      await addPayment(pvz.id, {
        employeeId,
        employeeName: employee?.name || initialEmployeeName,
        amount: parseFloat(paymentAmount),
        type: paymentType,
        periodStart: paymentPeriodStart,
        periodEnd: paymentPeriodEnd,
        note: paymentNote || undefined,
        createdBy: user?.id || '',
        createdByName: user?.name || '',
        pvzId: pvz.id,
      });
      
      setShowPaymentModal(false);
      setPaymentAmount('');
      setPaymentNote('');
      await loadData();
      
      showSuccess(
        t('screens.paymentDetails.paymentSuccess', {
          type:
            paymentType === 'advance'
              ? t('screens.paymentDetails.paymentTypeAdvance')
              : t('screens.paymentDetails.paymentTypeSalary'),
          amount: parseFloat(paymentAmount).toLocaleString(getDateLocale()),
        })
      );
    } catch (error) {
      showError(t('alerts.network.addPaymentFailed'));
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString(getDateLocale(), { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const formatShortDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString(getDateLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatPeriodDisplay = () => {
    if (!filterStartDate || !filterEndDate) return t('common.period.select');
    if (filterStartDate === filterEndDate) return formatDate(filterStartDate);
    return `${formatShortDate(filterStartDate)} — ${formatShortDate(filterEndDate)}`;
  };

  const getProgressPercent = () => {
    if (totalEarned === 0) return 0;
    return (totalPaid / totalEarned) * 100;
  };

  const openPeriodSelection = () => {
    setShowFilterModal(true);
  };

  const applyFilter = () => {
    setShowFilterModal(false);
    loadData();
  };

  const onFilterStartChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowStartPicker(false);
    if (selectedDate) {
      setFilterStartDate(toDateKey(selectedDate));
    }
  };

  const onFilterEndChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowEndPicker(false);
    if (selectedDate) {
      setFilterEndDate(toDateKey(selectedDate));
    }
  };

  const onPayStartChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowPayStartPicker(false);
    if (selectedDate) {
      setPaymentPeriodStart(toDateKey(selectedDate));
    }
  };

  const onPayEndChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowPayEndPicker(false);
    if (selectedDate) {
      setPaymentPeriodEnd(toDateKey(selectedDate));
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [loadData, mountedRef]);

  useFocusEffect(
    useCallback(() => {
      loadData();
      const unsubscribe = DataService.subscribe('employee_balance', loadData);
      return () => unsubscribe();
    }, [loadData])
  );

  const getShiftTypeName = (shiftType: string) => {
    switch (shiftType) {
      case 'full': return t('screens.paymentDetails.shiftFull');
      case 'half_morning': return t('screens.paymentDetails.shiftHalfMorning');
      case 'half_evening': return t('screens.paymentDetails.shiftHalfEvening');
      default: return t('screens.paymentDetails.shiftHourly');
    }
  };

  const formatMoney = (value: number) => value.toLocaleString(getDateLocale());

  const detailSections = useMemo(
    () => [
      { key: 'shifts' as const, title: t('screens.paymentDetails.shiftsTitle'), data: shifts },
      { key: 'payments' as const, title: t('screens.paymentDetails.paymentHistory'), data: payments },
    ],
    [shifts, payments, t]
  );

  const detailListHeader = useMemo(
    () => (
      <>
        <TouchableOpacity style={[styles.periodCard, ui.card]} onPress={openPeriodSelection}>
          <Calendar size={16} color={colors.primary} />
          <Text style={styles.periodText}>{formatPeriodDisplay()}</Text>
        </TouchableOpacity>

        {employee && (
          <View style={styles.employeeCard}>
            <View style={styles.employeeAvatar}>
              <User size={32} color={colors.primary} />
            </View>
            <View style={styles.employeeInfo}>
              <Text style={styles.employeeName}>{employee.name}</Text>
              <View style={styles.employeeContact}>
                <Phone size={12} color={colors.gray} />
                <Text style={styles.employeePhone}>{employee.phone}</Text>
              </View>
              <View style={styles.employeeRoleBadge}>
                <Text style={styles.employeeRoleText}>
                  {employee.role === 'admin'
                    ? t('common.roles.adminShort')
                    : t('common.roles.employeeShort')}
                </Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{t('screens.paymentDetails.financialSummary')}</Text>
          <Text style={styles.periodSubtitle}>
            {t('screens.paymentDetails.forPeriod', { period: formatPeriodDisplay() })}
          </Text>

          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <TrendingUp size={20} color={colors.primary} />
              <Text style={styles.summaryLabel}>{t('screens.finance.accrued')}</Text>
              <Text style={styles.summaryValue}>
                {formatMoney(totalEarned)} {t('common.money.currency')}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <MoneyIcon size={20} color={colors.success} />
              <Text style={styles.summaryLabel}>{t('screens.paymentDetails.paid')}</Text>
              <Text style={[styles.summaryValue, { color: colors.success }]}>
                {formatMoney(totalPaid)} {t('common.money.currency')}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <TrendingDown size={20} color={balance > 0 ? colors.warning : colors.success} />
              <Text style={styles.summaryLabel}>{t('screens.finance.toPay')}</Text>
              <Text style={[styles.summaryValue, { color: balance > 0 ? colors.warning : colors.success }]}>
                {formatMoney(balance)} {t('common.money.currency')}
              </Text>
            </View>
          </View>

          {totalEarned > 0 && (
            <View style={styles.progressSection}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${getProgressPercent()}%` }]} />
              </View>
              <Text style={styles.progressText}>
                {t('screens.paymentDetails.paidPercent', {
                  percent: Math.round(getProgressPercent()),
                })}
              </Text>
            </View>
          )}
        </View>
      </>
    ),
    [ui, employee, t, totalEarned, totalPaid, balance, openPeriodSelection, formatPeriodDisplay, formatMoney, getProgressPercent]
  );

  const detailListFooter = useMemo(
    () =>
      balance > 0 ? (
        <TouchableOpacity style={styles.payButton} onPress={() => setShowPaymentModal(true)}>
          <LinearGradient colors={[colors.success, colors.success]} style={styles.payButtonGradient}>
            <MoneyIcon size={20} color="#FFFFFF" />
            <Text style={styles.payButtonText}>
              {t('screens.paymentDetails.payButton', { amount: formatMoney(balance) })}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      ) : null,
    [balance, t, formatMoney]
  );

  const renderDetailItem = useCallback(
    ({ item, section }: { item: ShiftData | Payment; section: { key: string } }) => {
      if (section.key === 'shifts') {
        const shift = item as ShiftData;
        return (
          <View style={styles.shiftItem}>
            <View style={styles.shiftHeader}>
              <Text style={styles.shiftDate}>{formatShortDate(shift.date)}</Text>
              <Text style={[styles.shiftEarnings, shift.paymentStatus === 'paid' && styles.paidEarnings]}>
                {shift.paymentStatus === 'paid' ? '✓' : '+'}
                {formatMoney(shift.earnings)} {t('common.money.currency')}
              </Text>
            </View>
            <Text style={styles.shiftType}>{getShiftTypeName(shift.shiftType)}</Text>
            <Text style={styles.shiftTime}>{shift.startTime} — {shift.endTime}</Text>
            <Text style={styles.shiftHours}>
              {t('screens.paymentDetails.shiftHours', {
                hours: shift.totalHours,
                unit: t('common.stats.hoursShort'),
              })}
            </Text>
          </View>
        );
      }

      const payment = item as Payment;
      return (
        <View style={styles.paymentItem}>
          <View style={styles.paymentLeft}>
            <View style={[styles.paymentIcon, payment.type === 'advance' ? styles.advanceIcon : styles.salaryIcon]}>
              <Text style={styles.paymentIconText}>{payment.type === 'advance' ? '💰' : '📅'}</Text>
            </View>
            <View>
              <Text style={styles.paymentType}>
                {payment.type === 'advance'
                  ? t('screens.paymentDetails.paymentTypeAdvance')
                  : t('screens.paymentDetails.paymentTypeSalary')}
              </Text>
              <Text style={styles.paymentPeriod}>
                {formatShortDate(payment.periodStart)} — {formatShortDate(payment.periodEnd)}
              </Text>
              {payment.note && <Text style={styles.paymentNote}>{payment.note}</Text>}
            </View>
          </View>
          <View style={styles.paymentRight}>
            <Text style={[styles.paymentAmount, payment.type === 'advance' ? styles.advanceAmount : styles.salaryAmount]}>
              {formatMoney(payment.amount)} {t('common.money.currency')}
            </Text>
            <Text style={styles.paymentDate}>{formatShortDate(payment.paidAt)}</Text>
          </View>
        </View>
      );
    },
    [t, formatShortDate, formatMoney, getShiftTypeName]
  );

  return (
    <ThemedSafeAreaView style={styles.container}>
      <ScreenHeader
        title={employee?.name || initialEmployeeName}
        onBack={() => navigation.goBack()}
        right={
          <TouchableOpacity onPress={openPeriodSelection}>
            <Filter size={20} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />

      <SectionList
        sections={detailSections}
        keyExtractor={(item) => item.id}
        renderItem={renderDetailItem}
        renderSectionHeader={({ section }) => (
          <View style={section.key === 'shifts' ? styles.shiftsCard : styles.paymentsCard}>
            <Text style={styles.cardTitle}>{section.title}</Text>
            <Text style={styles.cardSubtitle}>
              {t('screens.paymentDetails.forPeriod', { period: formatPeriodDisplay() })}
            </Text>
          </View>
        )}
        renderSectionFooter={({ section }) =>
          section.data.length === 0 ? (
            <View style={section.key === 'shifts' ? styles.shiftsCard : styles.paymentsCard}>
              <Text style={styles.emptyText}>
                {section.key === 'shifts'
                  ? t('screens.paymentDetails.noShifts')
                  : t('screens.paymentDetails.noPayments')}
              </Text>
            </View>
          ) : (
            <View style={styles.sectionSpacer} />
          )
        }
        ListHeaderComponent={detailListHeader}
        ListFooterComponent={detailListFooter}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        stickySectionHeadersEnabled={false}
        {...FLAT_LIST_PERF}
      />

      {/* Модальное окно выбора периода */}
      <Modal visible={showFilterModal} transparent animationType="slide" onRequestClose={() => setShowFilterModal(false)}>
        <View style={modal.overlay}>
          <View style={modal.content}>
            <View style={modal.header}>
              <Text style={modal.title}>{t('common.period.select')}</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <X size={24} color={colors.gray} />
              </TouchableOpacity>
            </View>
            
            <Text style={modal.inputLabel}>{t('common.period.start')}</Text>
            <TouchableOpacity style={styles.dateButton} onPress={() => setShowStartPicker(true)}>
              <Calendar size={18} color={colors.primary} />
              <Text style={styles.dateButtonText}>{formatShortDate(filterStartDate)}</Text>
            </TouchableOpacity>
            
            <Text style={modal.inputLabel}>{t('common.period.end')}</Text>
            <TouchableOpacity style={styles.dateButton} onPress={() => setShowEndPicker(true)}>
              <Calendar size={18} color={colors.primary} />
              <Text style={styles.dateButtonText}>{formatShortDate(filterEndDate)}</Text>
            </TouchableOpacity>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.cancelButton} 
                onPress={() => setShowFilterModal(false)}
              >
                <Text style={styles.cancelButtonText}>{t('common.actions.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.applyButton}
                onPress={applyFilter}
              >
                <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.applyGradient}>
                  <Check size={18} color="#FFFFFF" />
                  <Text style={styles.applyButtonText}>{t('common.actions.apply')}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Модальное окно выплаты */}
      <Modal visible={showPaymentModal} transparent animationType="slide" onRequestClose={() => setShowPaymentModal(false)}>
        <View style={modal.overlay}>
          <View style={modal.contentLarge}>
            <View style={modal.header}>
              <Text style={modal.title}>{t('screens.paymentDetails.paymentModal')}</Text>
              <TouchableOpacity onPress={() => setShowPaymentModal(false)}>
                <X size={24} color={colors.gray} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[styles.typeButton, paymentType === 'salary' && styles.salaryTypeActive]}
                onPress={() => setPaymentType('salary')}
              >
                <Text style={[styles.typeText, paymentType === 'salary' && styles.typeTextActive]}>
                  {t('screens.paymentDetails.salaryBtn')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeButton, paymentType === 'advance' && styles.advanceTypeActive]}
                onPress={() => setPaymentType('advance')}
              >
                <Text style={[styles.typeText, paymentType === 'advance' && styles.typeTextActive]}>
                  {t('screens.paymentDetails.advanceBtn')}
                </Text>
              </TouchableOpacity>
            </View>
            
            <Text style={modal.inputLabel}>{t('screens.paymentDetails.amountLabel')}</Text>
            <TextInput
              style={[modal.input, styles.amountInput]}
              value={paymentAmount}
              onChangeText={setPaymentAmount}
              keyboardType="numeric"
              placeholder={balance.toString()}
              placeholderTextColor={colors.grayLight}
            />
            
            <Text style={modal.inputLabel}>{t('common.period.period')}</Text>
            <View style={styles.periodRow}>
              <TouchableOpacity style={styles.smallDateButton} onPress={() => setShowPayStartPicker(true)}>
                <Calendar size={14} color={colors.primary} />
                <Text style={styles.smallDateText}>{formatShortDate(paymentPeriodStart)}</Text>
              </TouchableOpacity>
              <Text style={styles.periodDash}>—</Text>
              <TouchableOpacity style={styles.smallDateButton} onPress={() => setShowPayEndPicker(true)}>
                <Calendar size={14} color={colors.primary} />
                <Text style={styles.smallDateText}>{formatShortDate(paymentPeriodEnd)}</Text>
              </TouchableOpacity>
            </View>
            
            <Text style={modal.inputLabel}>{t('screens.paymentDetails.commentLabel')}</Text>
            <TextInput
              style={[modal.input, modal.textArea]}
              value={paymentNote}
              onChangeText={setPaymentNote}
              placeholder={t('screens.paymentDetails.commentPlaceholder')}
              placeholderTextColor={colors.grayLight}
              multiline
              numberOfLines={3}
            />
            
            <TouchableOpacity style={styles.submitButton} onPress={handleAddPayment}>
              <LinearGradient colors={[colors.success, colors.success]} style={styles.submitGradient}>
                <MoneyIcon size={20} color="#FFFFFF" />
                <Text style={styles.submitText}>
                  {t('screens.paymentDetails.payAmount', {
                    amount: paymentAmount ? formatMoney(parseFloat(paymentAmount)) : '0',
                  })}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* DatePicker для фильтра */}
      {showStartPicker && (
        <DateTimePicker
          value={new Date(filterStartDate || new Date())}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onFilterStartChange}
        />
      )}
      
      {showEndPicker && (
        <DateTimePicker
          value={new Date(filterEndDate || new Date())}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onFilterEndChange}
        />
      )}
      
      {/* DatePicker для выплаты */}
      {showPayStartPicker && (
        <DateTimePicker
          value={new Date(paymentPeriodStart || new Date())}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onPayStartChange}
        />
      )}
      
      {showPayEndPicker && (
        <DateTimePicker
          value={new Date(paymentPeriodEnd || new Date())}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onPayEndChange}
        />
      )}
    </ThemedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filterButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  
  content: { padding: 16, paddingBottom: 30 },
  
  periodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  periodText: { fontSize: 14, color: colors.primary, fontWeight: '500' },
  periodSubtitle: { fontSize: 11, color: '#999999', textAlign: 'center', marginTop: 4, marginBottom: 12 },
  
  employeeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  employeeAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  employeeInfo: { flex: 1 },
  employeeName: { fontSize: 18, fontWeight: 'bold', color: '#1A1A1A', marginBottom: 4 },
  employeeContact: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  employeePhone: { fontSize: 13, color: '#666666' },
  employeeRoleBadge: { backgroundColor: colors.primaryLight, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 12, alignSelf: 'flex-start' },
  employeeRoleText: { fontSize: 10, color: colors.primary, fontWeight: '500' },
  
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryTitle: { fontSize: 14, fontWeight: '600', color: '#666666', textAlign: 'center' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginBottom: 16 },
  summaryItem: { alignItems: 'center', flex: 1 },
  summaryLabel: { fontSize: 11, color: '#999999', marginTop: 4, marginBottom: 2 },
  summaryValue: { fontSize: 16, fontWeight: 'bold', color: '#1A1A1A' },
  summaryDivider: { width: 1, height: 40, backgroundColor: '#F0F0F0' },
  
  progressSection: { marginTop: 8 },
  progressBar: { height: 6, backgroundColor: '#F0F0F0', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: colors.success, borderRadius: 3 },
  progressText: { fontSize: 11, color: '#666666', marginTop: 6, textAlign: 'center' },

  sectionSpacer: { height: 8 },
  
  shiftsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  paymentsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#1A1A1A', marginBottom: 4 },
  cardSubtitle: { fontSize: 11, color: '#999999', marginBottom: 12 },
  
  emptyText: { textAlign: 'center', fontSize: 14, color: '#999999', paddingVertical: 20 },
  
  shiftItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  shiftHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  shiftDate: { fontSize: 14, fontWeight: '500', color: '#1A1A1A' },
  shiftEarnings: { fontSize: 14, fontWeight: '600', color: colors.success },
  paidEarnings: { color: colors.gray },
  shiftType: { fontSize: 12, color: colors.primary, marginBottom: 2 },
  shiftTime: { fontSize: 13, color: '#666666', marginBottom: 2 },
  shiftHours: { fontSize: 12, color: colors.gray },
  
  paymentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  paymentLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  paymentIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  advanceIcon: { backgroundColor: '#FFF3E0' },
  salaryIcon: { backgroundColor: '#E8F5E9' },
  paymentIconText: { fontSize: 18 },
  paymentType: { fontSize: 14, fontWeight: '500', color: '#1A1A1A' },
  paymentPeriod: { fontSize: 11, color: '#999999', marginTop: 2 },
  paymentNote: { fontSize: 11, color: colors.primary, marginTop: 2 },
  paymentRight: { alignItems: 'flex-end' },
  paymentAmount: { fontSize: 14, fontWeight: '600' },
  advanceAmount: { color: colors.warning },
  salaryAmount: { color: colors.success },
  paymentDate: { fontSize: 11, color: '#999999', marginTop: 2 },
  
  payButton: { borderRadius: 30, overflow: 'hidden', marginTop: 8, marginBottom: 16 },
  payButtonGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  payButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  
  typeSelector: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  typeButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: '#F5F5F5' },
  salaryTypeActive: { backgroundColor: colors.success },
  advanceTypeActive: { backgroundColor: colors.warning },
  typeText: { fontSize: 14, color: '#666666' },
  typeTextActive: { color: '#FFFFFF' },
  
  amountInput: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  
  periodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  smallDateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  smallDateText: { fontSize: 13, color: '#1A1A1A' },
  periodDash: { fontSize: 16, color: colors.gray },
  
  submitButton: { marginTop: 24, borderRadius: 30, overflow: 'hidden' },
  submitGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  submitText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  dateButtonText: { fontSize: 15, color: '#1A1A1A' },
  
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: '#F5F5F5' },
  cancelButtonText: { fontSize: 14, color: '#666666' },
  applyButton: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  applyGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  applyButtonText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
});