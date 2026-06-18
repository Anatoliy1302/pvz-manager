// src/screens/owner/PaymentsScreen.tsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { FLAT_LIST_PERF } from '../../constants/flatListPerf';
import { LinearGradient } from 'expo-linear-gradient';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import { useScreenRefresh, useScopedInitialLoading } from '../../hooks/useScreenRefresh';
import StorageService from '../../services/StorageService';
import DataService from '../../services/DataService';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../constants/colors';
import { Payment, PaymentType } from '../../types/payment';
import { addPayment, loadPvzPayrollBundle } from '../../services/PaymentService';
import { isShiftCountableForAccruals } from '../../utils/shiftStatusHelper';
import { getMonthRange, toDateKey } from '../../utils/dateHelpers';
import { Shift } from '../../types/user';
import exportService from '../../services/ExportService';
import { markScreenLoadStart, markScreenLoadEnd } from '../../utils/perfMonitor';
import {
  ChevronLeft,
  Users,
  Calendar,
  X,
  Check,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  User,
  Filter,
  Download,
  Info,
} from 'lucide-react-native';
import MoneyIcon from '../../components/icons/MoneyIcon';
import DateTimePicker from '@react-native-community/datetimepicker';
import EmptyState from '../../components/common/EmptyState';
import { PayrollSkeleton } from '../../components/common/Skeleton';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useScreenToast } from '../../hooks/useScreenToast';
import { safeParseJson } from '../../utils/safeJson';

interface EmployeeWithPeriodData {
  id: string;
  name: string;
  phone: string;
  role: string;
  periodEarned: number;
  periodPaid: number;
  balance: number;
  shiftsCount: number;
}

interface SummaryData {
  totalEarned: number;
  totalPaid: number;
  totalBalance: number;
}

export default function PaymentsScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { user, pvz, subscription } = useAuth();
  const { screen, ui, theme } = useThemedScreen();
  const { showError, showSuccess } = useScreenToast();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, markLoaded] = useScopedInitialLoading(pvz?.id);
  const [employees, setEmployees] = useState<EmployeeWithPeriodData[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeWithPeriodData | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType>('salary');
  const [paymentPeriodStart, setPaymentPeriodStart] = useState('');
  const [paymentPeriodEnd, setPaymentPeriodEnd] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [pickerField, setPickerField] = useState<'filterStart' | 'filterEnd' | null>(null);
  const [pickerDraft, setPickerDraft] = useState(new Date());
  const [filterPeriod, setFilterPeriod] = useState({ start: '', end: '' });
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [tempStartDate, setTempStartDate] = useState(new Date());
  const [tempEndDate, setTempEndDate] = useState(new Date());
  const [summary, setSummary] = useState<SummaryData>({ totalEarned: 0, totalPaid: 0, totalBalance: 0 });
  const [unpaidEmployees, setUnpaidEmployees] = useState<{name: string; amount: number}[]>([]);
  const [exporting, setExporting] = useState(false);

  const formatMonthLabel = (start: string) => {
    const date = new Date(start);
    const label = date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const shiftMonth = (delta: number) => {
    const anchor = new Date(filterPeriod.start || new Date());
    const next = new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1);
    const range = getMonthRange(next.getFullYear(), next.getMonth());
    setFilterPeriod(range);
    setTempStartDate(new Date(range.start));
    setTempEndDate(new Date(range.end));
  };

  const markShiftsAsPaid = async (employeeId: string, amount: number) => {
    const shiftsRaw = await StorageService.getItem('shifts');
    const allShifts = safeParseJson<Shift[]>(shiftsRaw ?? '[]', []);
    let remainingAmount = amount;

    const unpaidShiftIds = allShifts
      .filter(
        (shift) =>
          shift.employeeId === employeeId &&
          shift.paymentStatus !== 'paid' &&
          (shift.earnings || 0) > 0 &&
          isShiftCountableForAccruals(shift)
      )
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((s) => s.id);

    const paidIds = new Set<string>();
    for (const shiftId of unpaidShiftIds) {
      if (remainingAmount <= 0) break;
      const shift = allShifts.find((s) => s.id === shiftId);
      if (!shift || (shift.earnings || 0) > remainingAmount) continue;
      remainingAmount -= shift.earnings || 0;
      paidIds.add(shiftId);
    }

    if (paidIds.size === 0) return;

    const updatedShifts = allShifts.map((shift) =>
      paidIds.has(shift.id)
        ? { ...shift, paymentStatus: 'paid' as const, status: 'paid' as const }
        : shift
    );
    await StorageService.setItem('shifts', JSON.stringify(updatedShifts));
  };

  useEffect(() => {
    const now = new Date();
    const range = getMonthRange(now.getFullYear(), now.getMonth());
    setFilterPeriod(range);
    setTempStartDate(new Date(range.start));
    setTempEndDate(new Date(range.end));
  }, []);

  const parseLocalDate = (key: string) => {
    if (!key) return new Date();
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const openFilterModal = () => {
    setTempStartDate(parseLocalDate(filterPeriod.start));
    setTempEndDate(parseLocalDate(filterPeriod.end));
    setPickerField(null);
    setShowFilterModal(true);
  };

  const closeFilterModal = () => {
    setPickerField(null);
    setShowFilterModal(false);
  };

  const handleFilterModalClose = () => {
    if (pickerField) {
      closeDatePicker();
      return;
    }
    closeFilterModal();
  };

  const openFilterDatePicker = (field: 'filterStart' | 'filterEnd') => {
    setPickerDraft(field === 'filterStart' ? tempStartDate : tempEndDate);
    setPickerField(field);
  };

  const closeDatePicker = () => {
    setPickerField(null);
  };

  const confirmDatePicker = () => {
    if (pickerField === 'filterStart') {
      setTempStartDate(pickerDraft);
      if (pickerDraft > tempEndDate) {
        setTempEndDate(pickerDraft);
      }
    } else if (pickerField === 'filterEnd') {
      setTempEndDate(pickerDraft);
      if (pickerDraft < tempStartDate) {
        setTempStartDate(pickerDraft);
      }
    }
    closeDatePicker();
  };

  const loadData = useCallback(async () => {
    if (!pvz?.id) return;
    markScreenLoadStart('PaymentsScreen');
    try {
      const users = await DataService.getUsers();
      const pvzEmployees = users.filter(
        (u: { role: string; status: string; pvzId?: string }) =>
          u.role !== 'owner' && u.status === 'active' && u.pvzId === pvz.id
      );

      const paymentsRaw = await StorageService.getItem(`payments_${pvz.id}`);
      const allPayments = safeParseJson<Payment[]>(paymentsRaw ?? '[]', []);
      const periodPayments = allPayments.filter((p: Payment & { date?: string }) => {
        const paidDate = (p.paidAt || p.date || '').split('T')[0];
        return paidDate >= filterPeriod.start && paidDate <= filterPeriod.end;
      });
      setPayments(periodPayments);

      const payroll = await loadPvzPayrollBundle(
        pvz.id,
        pvzEmployees.map((e) => e.id),
        filterPeriod.start,
        filterPeriod.end
      );

      const employeesWithData: EmployeeWithPeriodData[] = [];
      let totalEarned = 0;
      let totalPaid = 0;
      let totalBalance = 0;
      const unpaidList: { name: string; amount: number }[] = [];

      for (const emp of pvzEmployees) {
        const row = payroll.get(emp.id);
        const accruals = row?.periodAccruals ?? {
          netEarned: 0,
          totalPaid: 0,
          shiftsEarned: 0,
          totalFines: 0,
          totalBonuses: 0,
          balance: 0,
        };
        const balance = row?.lifetimeBalance ?? 0;

        if (balance > 0) {
          unpaidList.push({ name: emp.name, amount: balance });
        }

        employeesWithData.push({
          id: emp.id,
          name: emp.name,
          phone: emp.phone,
          role: emp.role,
          periodEarned: accruals.netEarned,
          periodPaid: accruals.totalPaid,
          balance,
          shiftsCount: row?.shiftsCount ?? 0,
        });

        totalEarned += accruals.netEarned;
        totalPaid += accruals.totalPaid;
        totalBalance += balance;
      }

      unpaidList.sort((a, b) => b.amount - a.amount);
      setUnpaidEmployees(unpaidList);

      employeesWithData.sort((a, b) => b.balance - a.balance);
      setEmployees(employeesWithData);
      setSummary({ totalEarned, totalPaid, totalBalance });
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
    } finally {
      markLoaded();
      markScreenLoadEnd('PaymentsScreen');
    }
  }, [pvz?.id, filterPeriod.start, filterPeriod.end, markLoaded]);

  useScreenRefresh(loadData, [loadData], {
    subscribeKeys: [
      'employee_balance',
      ...(pvz?.id ? [`payments_${pvz.id}`, `penalties_${pvz.id}`] : []),
    ],
  });

  useEffect(() => {
    if (filterPeriod.start && !loading) {
      void loadData();
    }
  }, [filterPeriod.start, filterPeriod.end]);

  const openPaymentModal = (employee: EmployeeWithPeriodData) => {
    setSelectedEmployee(employee);
    setPaymentAmount(employee.balance.toString());
    setPaymentType('salary');
    setPaymentPeriodStart(filterPeriod.start);
    setPaymentPeriodEnd(filterPeriod.end);
    setPaymentNote('');
    setShowPaymentModal(true);
  };

  const makePayment = async () => {
    if (!selectedEmployee || !pvz?.id) return;
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      showError(t('alerts.validation.invalidAmount'));
      return;
    }
    if (amount > selectedEmployee.balance) {
      showError(t('alerts.validation.paymentExceeds', { amount, balance: selectedEmployee.balance }));
      return;
    }
    try {
      await addPayment(pvz.id, {
        pvzId: pvz.id,
        employeeId: selectedEmployee.id,
        employeeName: selectedEmployee.name,
        amount,
        type: paymentType,
        periodStart: paymentPeriodStart,
        periodEnd: paymentPeriodEnd,
        note: paymentNote.trim(),
        createdBy: user?.id || '',
        createdByName: user?.name || '',
      });

      if (paymentType === 'salary') {
        await markShiftsAsPaid(selectedEmployee.id, amount);
      }

      DataService.emitChange('employee_balance');
      DataService.emitChange('payments');
      DataService.emitChange('shifts');
      setShowPaymentModal(false);
      await loadData();
      showSuccess(t('alerts.success.paymentDone', { amount, name: selectedEmployee.name }));
    } catch (error) {
      showError(t('alerts.network.paymentFailed'));
    }
  };

  const formatCurrency = (amount: number) => amount.toLocaleString('ru-RU') + ' ₽';
  const formatDate = (date: Date) => date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const onRefresh = async () => {
    setRefreshing(true);
    if (pvz?.id) {
      await DataService.refreshShiftsCache();
    }
    await loadData();
    setRefreshing(false);
  };

  const applyFilter = () => {
    setFilterPeriod({
      start: toDateKey(tempStartDate),
      end: toDateKey(tempEndDate),
    });
    closeFilterModal();
  };

  const handleExport = async () => {
    if (!pvz?.id || exporting) return;
    setExporting(true);
    try {
      await exportService.exportAccountantReport({
        pvzId: pvz.id,
        pvzName: pvz.name,
        periodStart: filterPeriod.start,
        periodEnd: filterPeriod.end,
      }, subscription ?? undefined);
    } finally {
      setExporting(false);
    }
  };

  const renderEmployeeItem = useCallback(
    ({ item: emp }: { item: EmployeeWithPeriodData }) => (
      <TouchableOpacity
        style={[styles.employeeCard, { backgroundColor: screen.card }]}
        onPress={() => openPaymentModal(emp)}
        activeOpacity={0.7}
      >
        <View style={styles.employeeCardHeader}>
          <View style={styles.employeeAvatar}>
            <User size={18} color={colors.primary} />
          </View>
          <View style={styles.employeeInfo}>
            <Text style={[styles.employeeName, { color: screen.text }]}>{emp.name}</Text>
            <Text style={[styles.employeeShifts, { color: screen.textSecondary }]}>
              {t('screens.finance.shiftsAndEarned', {
                count: emp.shiftsCount,
                amount: formatCurrency(emp.periodEarned),
              })}
            </Text>
          </View>
          <ChevronRight size={18} color={colors.grayLight} />
        </View>
        <View style={[styles.employeeBalanceRow, { borderTopColor: screen.border }]}>
          <View style={styles.balanceItem}>
            <Text style={[styles.balanceLabel, ui.subtitle]}>{t('screens.finance.paidTotal')}</Text>
            <Text style={styles.balancePaid}>{formatCurrency(emp.periodPaid)}</Text>
          </View>
          <View style={styles.balanceItem}>
            <Text style={[styles.balanceLabel, ui.subtitle]}>{t('screens.finance.toPay')}</Text>
            <Text
              style={[
                styles.balanceAmount,
                emp.balance > 0 ? { color: colors.primary } : { color: colors.success },
              ]}
            >
              {emp.balance > 0 ? formatCurrency(emp.balance) : '0 ₽'}
            </Text>
          </View>
        </View>
        {emp.balance > 0 && (
          <View style={styles.payNowRow}>
            <Text style={styles.payNowText}>{t('screens.finance.tapToPay')}</Text>
          </View>
        )}
      </TouchableOpacity>
    ),
    [screen, ui, t, openPaymentModal]
  );

  const listHeader = useMemo(
    () => (
      <>
        <View style={[styles.periodNavCard, ui.card]}>
          <TouchableOpacity style={styles.periodNavButton} onPress={() => shiftMonth(-1)}>
            <ChevronLeft size={22} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.periodNavCenter} onPress={openFilterModal}>
            <Calendar size={16} color={colors.primary} />
            <Text style={[styles.periodNavLabel, { color: screen.text }]}>
              {filterPeriod.start ? formatMonthLabel(filterPeriod.start) : t('common.period.period')}
            </Text>
            <Text style={[styles.periodNavDates, { color: screen.textSecondary }]}>
              {formatDate(new Date(filterPeriod.start))} — {formatDate(new Date(filterPeriod.end))}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.periodNavButton} onPress={() => shiftMonth(1)}>
            <ChevronRight size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={[styles.infoBanner, { backgroundColor: screen.surface, borderColor: screen.border }]}>
          <Info size={16} color={colors.primary} />
          <Text style={[styles.infoText, { color: screen.textSecondary }]}>
            {t('screens.finance.periodSummaryHint')}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.exportCard, ui.card, exporting && styles.exportCardDisabled]}
          onPress={handleExport}
          disabled={exporting}
        >
          <Download size={18} color={colors.primary} />
          <View style={styles.exportCardText}>
            <Text style={styles.exportCardTitle}>
              {exporting ? t('common.loading.exporting') : t('screens.finance.exportForAccountant')}
            </Text>
            <Text style={[styles.exportCardHint, ui.subtitle]}>{t('screens.finance.exportDesc')}</Text>
          </View>
        </TouchableOpacity>

        <View style={[styles.summaryCard, ui.card]}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <TrendingUp size={16} color={colors.success} />
              <Text style={[styles.summaryLabel, ui.subtitle]}>{t('screens.finance.accrued')}</Text>
              <Text style={[styles.summaryValue, { color: colors.success }]}>
                {formatCurrency(summary.totalEarned)}
              </Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: screen.border }]} />
            <View style={styles.summaryItem}>
              <TrendingDown size={16} color={colors.danger} />
              <Text style={[styles.summaryLabel, ui.subtitle]}>{t('screens.finance.paidTotal')}</Text>
              <Text style={[styles.summaryValue, { color: colors.danger }]}>
                {formatCurrency(summary.totalPaid)}
              </Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: screen.border }]} />
            <View style={styles.summaryItem}>
              <MoneyIcon size={16} color={colors.primary} />
              <Text style={[styles.summaryLabel, ui.subtitle]}>{t('screens.finance.toPay')}</Text>
              <Text style={[styles.summaryValue, { color: colors.primary }]}>
                {formatCurrency(summary.totalBalance)}
              </Text>
            </View>
          </View>
        </View>

        {unpaidEmployees.length > 0 && (
          <View style={[styles.unpaidSection, ui.card]}>
            <View style={[styles.unpaidHeader, { borderBottomColor: screen.border }]}>
              <MoneyIcon size={18} color={colors.danger} />
              <Text style={[styles.unpaidTitle, { color: screen.text }]}>
                {t('screens.finance.accruedNotPaid')}
              </Text>
              <Text style={styles.unpaidTotal}>
                {unpaidEmployees.reduce((sum, e) => sum + e.amount, 0).toLocaleString()} ₽
              </Text>
            </View>
            {unpaidEmployees.map((emp, i) => (
              <TouchableOpacity
                key={`unpaid-${i}`}
                style={[styles.unpaidRow, { borderBottomColor: screen.border }]}
                onPress={() => {
                  const employee = employees.find((e) => e.name === emp.name);
                  if (employee) openPaymentModal(employee);
                }}
              >
                <Text style={[styles.unpaidName, { color: screen.text }]}>{emp.name}</Text>
                <Text style={styles.unpaidAmount}>{emp.amount.toLocaleString()} ₽</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: screen.text, marginHorizontal: 16, marginTop: 8 }]}>
          {t('screens.finance.employeesSection', { count: employees.length })}
        </Text>
      </>
    ),
    [ui, screen, filterPeriod, exporting, summary, unpaidEmployees, employees, t, openFilterModal, handleExport, openPaymentModal]
  );

  return (
    <ThemedSafeAreaView style={styles.container}>
      <LoadingSpinner visible={exporting} text={t('common.loading.exporting')} />
      <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ChevronLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('screens.finance.payments')}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.filterHeaderButton}
            onPress={handleExport}
            disabled={exporting}
          >
            <Download size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterHeaderButton} onPress={openFilterModal}>
            <Filter size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {loading ? (
        <PayrollSkeleton />
      ) : (
        <FlatList
          data={employees}
          keyExtractor={(item) => item.id}
          renderItem={renderEmployeeItem}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <EmptyState
              icon={Users}
              title={t('screens.finance.noEmployeesPeriod')}
              description={t('screens.finance.noEmployeesPeriodDesc')}
              buttonText={t('common.period.change')}
              onButtonPress={openFilterModal}
            />
          }
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
          {...FLAT_LIST_PERF}
        />
      )}

      {/* Модальное окно фильтра */}
      <Modal
        visible={showFilterModal}
        animationType="slide"
        transparent
        onRequestClose={handleFilterModalClose}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={handleFilterModalClose}
          />
          <View style={[styles.modalContent, ui.modal]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, ui.title]}>
                {pickerField && Platform.OS === 'ios'
                  ? pickerField === 'filterStart'
                    ? t('common.period.start')
                    : t('common.period.end')
                  : t('common.period.select')}
              </Text>
              <TouchableOpacity onPress={handleFilterModalClose}>
                <X size={24} color={colors.gray} />
              </TouchableOpacity>
            </View>

            {pickerField && Platform.OS === 'ios' ? (
              <>
                <View style={styles.pickerSpinnerContainer}>
                  <DateTimePicker
                    value={pickerDraft}
                    mode="date"
                    display="spinner"
                    locale="ru-RU"
                    themeVariant={theme === 'dark' ? 'dark' : 'light'}
                    textColor={screen.text}
                    style={styles.pickerSpinner}
                    onChange={(_event, selectedDate) => {
                      if (selectedDate) setPickerDraft(selectedDate);
                    }}
                  />
                </View>
                <View style={styles.pickerActions}>
                  <TouchableOpacity style={[styles.pickerCancelButton, ui.input]} onPress={closeDatePicker}>
                    <Text style={[styles.pickerCancelText, { color: screen.textSecondary }]}>{t('common.actions.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.pickerDoneButton} onPress={confirmDatePicker}>
                    <Text style={styles.pickerDoneText}>{t('common.actions.done')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View style={styles.filterDateRow}>
                  <TouchableOpacity
                    style={[styles.filterDateButton, ui.input]}
                    onPress={() => openFilterDatePicker('filterStart')}
                    activeOpacity={0.7}
                  >
                    <Calendar size={18} color={colors.primary} />
                    <Text style={[styles.filterDateText, { color: screen.text }]}>{formatDate(tempStartDate)}</Text>
                  </TouchableOpacity>
                  <Text style={[styles.filterDateSeparator, { color: screen.textSecondary }]}>—</Text>
                  <TouchableOpacity
                    style={[styles.filterDateButton, ui.input]}
                    onPress={() => openFilterDatePicker('filterEnd')}
                    activeOpacity={0.7}
                  >
                    <Calendar size={18} color={colors.primary} />
                    <Text style={[styles.filterDateText, { color: screen.text }]}>{formatDate(tempEndDate)}</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.applyButton} onPress={applyFilter}>
                  <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.applyGradient}>
                    <Check size={20} color="#FFFFFF" />
                    <Text style={styles.applyText}>{t('common.actions.apply')}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Модальное окно выплаты */}
      <Modal visible={showPaymentModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, ui.modal]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, ui.title]}>{t('screens.finance.paymentModalTitle')}</Text>
              <TouchableOpacity onPress={() => setShowPaymentModal(false)}><X size={24} color={colors.gray} /></TouchableOpacity>
            </View>
            {selectedEmployee && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.paymentEmployeeInfo}>
                  <User size={20} color={colors.primary} />
                  <Text style={[styles.paymentEmployeeName, { color: screen.text }]}>{selectedEmployee.name}</Text>
                </View>
                <View style={[styles.paymentBalanceInfo, { backgroundColor: colors.primaryLight }]}>
                  <Text style={styles.paymentBalanceLabel}>{t('screens.finance.balanceToPay')}</Text>
                  <Text style={styles.paymentBalanceValue}>{formatCurrency(selectedEmployee.balance)}</Text>
                </View>
                <Text style={[styles.inputLabel, ui.sectionTitle]}>{t('screens.finance.paymentAmountLabel')}</Text>
                <TextInput style={[styles.paymentInput, ui.input]} value={paymentAmount} onChangeText={setPaymentAmount} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.grayLighter} />
                <Text style={[styles.inputLabel, ui.sectionTitle]}>{t('screens.finance.paymentPurpose')}</Text>
                <View style={styles.paymentTypeRow}>
                  <TouchableOpacity
                    style={[
                      styles.paymentTypeButton,
                      { backgroundColor: ui.input.backgroundColor },
                      paymentType === 'salary' && styles.paymentTypeActive,
                    ]}
                    onPress={() => setPaymentType('salary')}
                  >
                    <Text style={[styles.paymentTypeText, ui.subtitle, paymentType === 'salary' && styles.paymentTypeTextActive]}>{t('screens.finance.salary')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.paymentTypeButton,
                      { backgroundColor: ui.input.backgroundColor },
                      paymentType === 'advance' && styles.paymentTypeActive,
                    ]}
                    onPress={() => setPaymentType('advance')}
                  >
                    <Text style={[styles.paymentTypeText, ui.subtitle, paymentType === 'advance' && styles.paymentTypeTextActive]}>{t('screens.finance.advance')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.paymentTypeButton,
                      { backgroundColor: ui.input.backgroundColor },
                      paymentType === 'bonus' && styles.paymentTypeActive,
                    ]}
                    onPress={() => setPaymentType('bonus')}
                  >
                    <Text style={[styles.paymentTypeText, ui.subtitle, paymentType === 'bonus' && styles.paymentTypeTextActive]}>{t('screens.finance.bonusType')}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.inputLabel, ui.sectionTitle]}>{t('common.form.commentOptional')}</Text>
                <TextInput style={[styles.paymentNoteInput, ui.input]} value={paymentNote} onChangeText={setPaymentNote} placeholder={t('screens.finance.paymentNotePlaceholder')} placeholderTextColor={colors.grayLighter} multiline numberOfLines={2} />
                <TouchableOpacity style={styles.payButton} onPress={makePayment}>
                  <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.payGradient}>
                    <MoneyIcon size={20} color="#FFFFFF" />
                    <Text style={styles.payButtonText}>{t('screens.finance.payButton', { amount: paymentAmount ? formatCurrency(parseFloat(paymentAmount)) : '0 ₽' })}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {showFilterModal && pickerField && Platform.OS === 'android' && (
        <DateTimePicker
          value={pickerDraft}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            closeDatePicker();
            if (event.type === 'dismissed' || !selectedDate) return;
            if (pickerField === 'filterStart') {
              setTempStartDate(selectedDate);
              if (selectedDate > tempEndDate) setTempEndDate(selectedDate);
            } else {
              setTempEndDate(selectedDate);
              if (selectedDate < tempStartDate) setTempStartDate(selectedDate);
            }
          }}
        />
      )}
    </ThemedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingBottom: 30 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 20, paddingBottom: 16, paddingHorizontal: 20 },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  filterHeaderButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  periodNavCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 16,
  },
  periodNavButton: { padding: 8 },
  periodNavCenter: { flex: 1, alignItems: 'center', gap: 2 },
  periodNavLabel: { fontSize: 15, fontWeight: '600' },
  periodNavDates: { fontSize: 11 },

  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoText: { flex: 1, fontSize: 12, lineHeight: 18 },

  exportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
  },
  exportCardDisabled: { opacity: 0.6 },
  exportCardText: { flex: 1 },
  exportCardTitle: { fontSize: 14, fontWeight: '600', color: colors.primary },
  exportCardHint: { fontSize: 11, marginTop: 2 },
  
  summaryCard: { marginHorizontal: 16, marginTop: 12, borderRadius: 20, padding: 16 },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  summaryLabel: { fontSize: 11 },
  summaryValue: { fontSize: 15, fontWeight: 'bold' },
  summaryDivider: { width: 1, height: 40 },
  
  unpaidSection: { marginHorizontal: 16, marginTop: 12, borderRadius: 20, padding: 16 },
  unpaidHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1 },
  unpaidTitle: { fontSize: 15, fontWeight: '600', flex: 1 },
  unpaidTotal: { fontSize: 16, fontWeight: 'bold', color: colors.danger },
  unpaidRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  unpaidName: { fontSize: 14 },
  unpaidAmount: { fontSize: 14, fontWeight: '600', color: colors.danger },
  
  employeeSection: { marginHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  
  emptyContainer: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 16, marginTop: 12 },
  emptySubtext: { fontSize: 12, marginTop: 4 },
  
  employeeCard: { borderRadius: 20, padding: 16, marginBottom: 12 },
  employeeCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  employeeAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  employeeInfo: { flex: 1 },
  employeeName: { fontSize: 15, fontWeight: '600' },
  employeeShifts: { fontSize: 11, marginTop: 2 },
  
  employeeBalanceRow: { flexDirection: 'row', gap: 16, paddingTop: 12, borderTopWidth: 1 },
  balanceItem: { flex: 1 },
  balanceLabel: { fontSize: 11, marginBottom: 2 },
  balancePaid: { fontSize: 14, fontWeight: '600', color: colors.danger },
  balanceAmount: { fontSize: 14, fontWeight: '600' },
  
  payNowRow: { marginTop: 8, alignItems: 'center' },
  payNowText: { fontSize: 12, color: colors.primary },
  
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: {
    borderRadius: 24,
    width: '90%',
    maxHeight: '85%',
    padding: 20,
    zIndex: 1,
    elevation: 5,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  
  filterDateRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  filterDateButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12 },
  filterDateText: { fontSize: 14, fontWeight: '500' },
  filterDateSeparator: { fontSize: 16 },
  
  applyButton: { borderRadius: 30, overflow: 'hidden' },
  applyGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  applyText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  
  paymentEmployeeInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  paymentEmployeeName: { fontSize: 18, fontWeight: '600' },
  
  paymentBalanceInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 12, padding: 14, marginBottom: 20 },
  paymentBalanceLabel: { fontSize: 14, color: colors.primary },
  paymentBalanceValue: { fontSize: 18, fontWeight: 'bold', color: colors.primary },
  
  inputLabel: { fontSize: 14, fontWeight: '500', marginBottom: 8, marginTop: 16 },
  paymentInput: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  
  paymentTypeRow: { flexDirection: 'row', gap: 10 },
  paymentTypeButton: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  paymentTypeActive: { backgroundColor: colors.primary },
  paymentTypeText: { fontSize: 13 },
  paymentTypeTextActive: { color: '#FFFFFF' },
  
  paymentNoteInput: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, minHeight: 60, textAlignVertical: 'top' },
  
  payButton: { marginTop: 24, marginBottom: 20, borderRadius: 30, overflow: 'hidden' },
  payGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  payButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  
  bottomSpacer: { height: 30 },

  pickerSpinnerContainer: {
    width: '100%',
    height: 216,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerSpinner: { width: '100%', height: 216 },
  pickerActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, gap: 12 },
  pickerCancelButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  pickerCancelText: { fontSize: 16, fontWeight: '500' },
  pickerDoneButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  pickerDoneText: { fontSize: 16, color: '#FFFFFF', fontWeight: '600' },
});
