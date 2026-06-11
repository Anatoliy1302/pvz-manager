// src/screens/employee/EmployeeFinanceScreen.tsx
import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import ScreenHeader from '../../components/common/ScreenHeader';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../constants/colors';
import { Payment, AdvanceRequest } from '../../types/payment';
import DataService from '../../services/DataService';
import notificationService from '../../services/NotificationService';
import { getMonthRange, formatDate as formatDateLabel } from '../../utils/dateHelpers';
import {
  getEmployeePayments,
  getEmployeeBalance,
  getEmployeeAdvanceRequests,
  createAdvanceRequest,
} from '../../services/PaymentService';
import MoneyIcon from '../../components/icons/MoneyIcon';
import { 
  ChevronLeft,  
  Calendar, 
  Clock,
  TrendingUp,
  TrendingDown,
  X,
  Check,
  Send,
  History,
  Wallet,
} from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

const formatMonthPeriod = (start: string, end: string) => {
  if (!start) return '';
  const startDate = new Date(start);
  const endDate = new Date(end);
  const sameMonth =
    startDate.getFullYear() === endDate.getFullYear() &&
    startDate.getMonth() === endDate.getMonth() &&
    startDate.getDate() === 1;
  if (sameMonth) {
    const label = startDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  return `${formatDateLabel(start, 'dayMonth')} — ${formatDateLabel(end, 'dayMonth')}`;
};

export default function EmployeeFinanceScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { user, pvz } = useAuth();
  const { ui, screen } = useThemedScreen();
  const route = useRoute<any>();
  const [refreshing, setRefreshing] = useState(false);
  const [balance, setBalance] = useState({ totalEarned: 0, totalPaid: 0, balance: 0 });
  const [payments, setPayments] = useState<Payment[]>([]);
  const [advanceRequests, setAdvanceRequests] = useState<AdvanceRequest[]>([]);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestAmount, setRequestAmount] = useState('');
  const [requestPeriodStart, setRequestPeriodStart] = useState('');
  const [requestPeriodEnd, setRequestPeriodEnd] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showCustomPeriod, setShowCustomPeriod] = useState(false);

  React.useEffect(() => {
    const now = new Date();
    const range = getMonthRange(now.getFullYear(), now.getMonth());
    setRequestPeriodStart(range.start);
    setRequestPeriodEnd(range.end);
  }, []);

  React.useEffect(() => {
    if (route.params?.openAdvanceModal && balance.balance > 0) {
      setShowRequestModal(true);
      navigation.setParams?.({ openAdvanceModal: undefined });
    }
  }, [route.params?.openAdvanceModal, balance.balance, navigation]);

  const hasPendingRequest = advanceRequests.some((r) => r.status === 'pending');

  const loadData = async () => {
    if (!user?.id || !pvz?.id) return;
    
    try {
      // Загружаем баланс
      const empBalance = await getEmployeeBalance(user.id);
      if (empBalance) {
        setBalance(empBalance);
      }
      
      // Загружаем выплаты
      const allPayments = await getEmployeePayments(user.id);
      // Сортируем по дате (новые сверху)
      allPayments.sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
      setPayments(allPayments);
      
      // Загружаем запросы на аванс
      const requests = await getEmployeeAdvanceRequests(user.id);
      requests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setAdvanceRequests(requests);
      
    } catch (error) {
      console.error('Ошибка загрузки финансов:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
      const unsubBalance = DataService.subscribe('employee_balance', loadData);
      const unsubAdvances = user?.id
        ? DataService.subscribe(`advance_requests_employee_${user.id}`, loadData)
        : () => {};
      const unsubPvzAdvances = pvz?.id
        ? DataService.subscribe(`advance_requests_${pvz.id}`, loadData)
        : () => {};
      const unsubPayments = user?.id
        ? DataService.subscribe(`payments_employee_${user.id}`, loadData)
        : () => {};
      const unsubPvzPayments = pvz?.id
        ? DataService.subscribe(`payments_${pvz.id}`, loadData)
        : () => {};
      const unsubPenalties = user?.id
        ? DataService.subscribe(`penalties_${user.id}`, loadData)
        : () => {};
      return () => {
        unsubBalance();
        unsubAdvances();
        unsubPvzAdvances();
        unsubPayments();
        unsubPvzPayments();
        unsubPenalties();
      };
    }, [user?.id, pvz?.id])
  );

  const openAdvanceModal = () => {
    if (balance.balance <= 0) {
      Alert.alert(
        t('screens.finance.advanceUnavailable'),
        t('screens.finance.advanceUnavailableHint')
      );
      return;
    }
    if (hasPendingRequest) {
      Alert.alert(
        t('screens.finance.advanceRequestSentTitle'),
        t('alerts.validation.advancePending')
      );
      return;
    }
    setShowRequestModal(true);
  };

  const handleSendRequest = async () => {
    if (!user?.id || !pvz?.id) return;
    if (!requestAmount || parseFloat(requestAmount) <= 0) {
      Alert.alert(t('common.error.title'), t('alerts.validation.invalidAmount'));
      return;
    }
    if (!requestPeriodStart || !requestPeriodEnd) {
      Alert.alert(t('common.error.title'), t('alerts.validation.periodRequired'));
      return;
    }
    if (requestPeriodStart > requestPeriodEnd) {
      Alert.alert(t('common.error.title'), t('alerts.validation.periodOrder'));
      return;
    }
    if (hasPendingRequest) {
      Alert.alert(t('screens.finance.advanceRequestSentTitle'), t('alerts.validation.advanceDuplicate'));
      return;
    }

    const amount = parseFloat(requestAmount);
    if (amount > balance.balance) {
      Alert.alert(
        t('screens.finance.advanceExceedsTitle'),
        t('alerts.validation.advanceExceeds', { amount, balance: balance.balance })
      );
      return;
    }
    
    try {
      const created = await createAdvanceRequest(
        pvz.id,
        user.id,
        user.name || t('common.roles.employeeShort'),
        amount,
        requestPeriodStart,
        requestPeriodEnd,
        requestReason || undefined
      );

      await notificationService.notifyStaffNewAdvanceRequest({
        pvzId: pvz.id,
        pvzName: pvz.name,
        employeeId: user.id,
        employeeName: user.name || t('common.roles.employeeShort'),
        amount,
        requestId: created.id,
        periodStart: requestPeriodStart,
        periodEnd: requestPeriodEnd,
      });

      setShowRequestModal(false);
      setRequestAmount('');
      setRequestReason('');
      setShowCustomPeriod(false);
      await loadData();
      
      Alert.alert(
        t('common.success.title'),
        t('alerts.success.advanceSent', { amount: amount.toLocaleString() })
      );
    } catch (error) {
      Alert.alert(t('common.error.title'), t('alerts.network.submitAdvanceFailed'));
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString() + ' ₽';
  };

  const getProgressPercent = () => {
    if (balance.totalEarned === 0) return 0;
    return (balance.totalPaid / balance.totalEarned) * 100;
  };

  const getRequestStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <Check size={14} color={colors.success} />;
      case 'rejected': return <X size={14} color={colors.danger} />;
      default: return <Clock size={14} color={colors.warning} />;
    }
  };

  const getRequestStatusText = (status: string) => {
    switch (status) {
      case 'approved': return t('screens.finance.statusApprovedShort');
      case 'rejected': return t('screens.finance.statusRejectedShort');
      default: return t('common.status.pending');
    }
  };

  const getRequestStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return colors.success;
      case 'rejected': return colors.danger;
      default: return colors.warning;
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  return (
    <ThemedSafeAreaView style={styles.container}>
      <ScreenHeader
        title={t('screens.finance.myFinance')}
        onBack={() => navigation.goBack()}
        right={
          <TouchableOpacity onPress={openAdvanceModal}>
            <Send size={20} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Баланс и статистика */}
        <View style={[styles.balanceCard, ui.card]}>
          <Text style={styles.balanceTitle}>{t('screens.finance.currentBalance')}</Text>
          <Text style={styles.balanceValue}>{formatCurrency(balance.balance)}</Text>
          
          <View style={styles.balanceDetails}>
            <View style={styles.balanceDetail}>
              <Text style={styles.balanceDetailLabel}>{t('screens.finance.earnedTotal')}</Text>
              <Text style={styles.balanceDetailValue}>{formatCurrency(balance.totalEarned)}</Text>
            </View>
            <View style={styles.balanceDetail}>
              <Text style={styles.balanceDetailLabel}>{t('screens.finance.paidTotal')}</Text>
              <Text style={[styles.balanceDetailValue, { color: colors.success }]}>
                {formatCurrency(balance.totalPaid)}
              </Text>
            </View>
          </View>
          
          <View style={styles.progressSection}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${getProgressPercent()}%` }]} />
            </View>
            <Text style={styles.progressText}>
              {t('screens.finance.progressReceived', { percent: Math.round(getProgressPercent()) })}
            </Text>
          </View>
        </View>

        {balance.balance > 0 ? (
          <TouchableOpacity style={styles.advanceButton} onPress={openAdvanceModal}>
            <LinearGradient colors={[colors.warning, colors.warning]} style={styles.advanceButtonGradient}>
              <Send size={18} color="#FFFFFF" />
              <Text style={styles.advanceButtonText}>
                {hasPendingRequest ? t('screens.finance.advancePending') : t('screens.finance.requestAdvance')}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <View style={[styles.noAdvanceCard, ui.card]}>
            <Text style={[styles.noAdvanceTitle, ui.title]}>{t('screens.finance.advanceUnavailable')}</Text>
            <Text style={[styles.noAdvanceText, ui.subtitle]}>
              {t('screens.finance.advanceUnavailableHint')}
            </Text>
          </View>
        )}

        {/* История запросов на аванс */}
        {advanceRequests.length > 0 && (
          <View style={[styles.requestsCard, ui.card]}>
            <Text style={[styles.cardTitle, ui.title]}>{t('screens.finance.myAdvanceRequests')}</Text>
            {advanceRequests.map((request) => (
              <View key={request.id} style={styles.requestItem}>
                <View style={styles.requestHeader}>
                  <View style={styles.requestAmount}>
                    <MoneyIcon size={14} color={getRequestStatusColor(request.status)} />
                    <Text style={[styles.requestAmountText, { color: getRequestStatusColor(request.status) }]}>
                      {request.amount.toLocaleString()} ₽
                    </Text>
                  </View>
                  <View style={[styles.requestStatus, { backgroundColor: getRequestStatusColor(request.status) + '20' }]}>
                    {getRequestStatusIcon(request.status)}
                    <Text style={[styles.requestStatusText, { color: getRequestStatusColor(request.status) }]}>
                      {getRequestStatusText(request.status)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.requestPeriod}>
                  {formatDate(request.periodStart)} — {formatDate(request.periodEnd)}
                </Text>
                {request.reason && (
                  <Text style={styles.requestReason}>📝 {request.reason}</Text>
                )}
                <Text style={styles.requestDate}>
                  {t('screens.finance.sentAt', { date: formatDate(request.createdAt) })}
                </Text>
                {request.reviewedAt && (
                  <Text style={styles.requestReviewed}>
                    {t('screens.finance.reviewedAt', {
                      date: formatDate(request.reviewedAt),
                      reviewer: request.reviewedByName ? `(${request.reviewedByName})` : '',
                    })}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* История выплат */}
        <View style={[styles.paymentsCard, ui.card]}>
          <Text style={styles.cardTitle}>{t('screens.finance.paymentHistory')}</Text>
          
          {payments.length === 0 ? (
            <Text style={styles.emptyText}>{t('screens.finance.noPayments')}</Text>
          ) : (
            payments.map((payment) => (
              <View key={payment.id} style={styles.paymentItem}>
                <View style={styles.paymentLeft}>
                  <View style={[styles.paymentIcon, payment.type === 'advance' ? styles.advanceIcon : styles.salaryIcon]}>
                    <Text style={styles.paymentIconText}>
                      {payment.type === 'advance' ? '💰' : '📅'}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.paymentType}>
                      {payment.type === 'advance' ? t('screens.finance.advance') : t('screens.finance.salary')}
                    </Text>
                    <Text style={styles.paymentPeriod}>
                      {formatDate(payment.periodStart)} — {formatDate(payment.periodEnd)}
                    </Text>
                    {payment.note && (
                      <Text style={styles.paymentNote}>{payment.note}</Text>
                    )}
                  </View>
                </View>
                <View style={styles.paymentRight}>
                  <Text style={[styles.paymentAmount, payment.type === 'advance' ? styles.advanceAmount : styles.salaryAmount]}>
                    +{payment.amount.toLocaleString()} ₽
                  </Text>
                  <Text style={styles.paymentDate}>{formatDate(payment.paidAt)}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Модальное окно запроса аванса */}
      <Modal visible={showRequestModal} transparent animationType="slide" onRequestClose={() => setShowRequestModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, ui.modal]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, ui.title]}>{t('screens.finance.advanceModalTitle')}</Text>
              <TouchableOpacity onPress={() => setShowRequestModal(false)}>
                <X size={24} color={colors.gray} />
              </TouchableOpacity>
            </View>

            <View style={[styles.balanceInfo, { backgroundColor: screen.surface }]}>
              <Wallet size={18} color={colors.primary} />
              <Text style={styles.balanceInfoText}>
                {t('screens.finance.availableToRequest', { amount: formatCurrency(balance.balance) })}
              </Text>
            </View>

            <Text style={[styles.inputLabel, ui.title]}>{t('screens.finance.amount')}</Text>
            <TextInput
              style={[styles.amountInput, ui.input]}
              value={requestAmount}
              onChangeText={setRequestAmount}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.grayLight}
            />
            <TouchableOpacity
              style={styles.maxAmountButton}
              onPress={() => setRequestAmount(String(Math.floor(balance.balance)))}
            >
              <Text style={styles.maxAmountText}>{t('screens.finance.requestFullAmount')}</Text>
            </TouchableOpacity>

            <Text style={[styles.inputLabel, ui.title]}>{t('screens.finance.periodLabel')}</Text>
            <Text style={[styles.periodHint, ui.subtitle]}>
              {t('screens.finance.periodAdvanceHint', {
                period: formatMonthPeriod(requestPeriodStart, requestPeriodEnd),
              })}
            </Text>
            <TouchableOpacity onPress={() => setShowCustomPeriod((v) => !v)}>
              <Text style={styles.changePeriodLink}>
                {showCustomPeriod ? t('screens.finance.hidePeriod') : t('screens.finance.showPeriod')}
              </Text>
            </TouchableOpacity>
            {showCustomPeriod && (
              <View style={styles.periodRow}>
                <TouchableOpacity style={[styles.smallDateButton, ui.input]} onPress={() => setShowStartPicker(true)}>
                  <Calendar size={14} color={colors.primary} />
                  <Text style={[styles.smallDateText, { color: screen.text }]}>{formatDate(requestPeriodStart)}</Text>
                </TouchableOpacity>
                <Text style={[styles.periodDash, { color: screen.textSecondary }]}>—</Text>
                <TouchableOpacity style={[styles.smallDateButton, ui.input]} onPress={() => setShowEndPicker(true)}>
                  <Calendar size={14} color={colors.primary} />
                  <Text style={[styles.smallDateText, { color: screen.text }]}>{formatDate(requestPeriodEnd)}</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={[styles.inputLabel, ui.title]}>{t('common.form.reasonOptional')}</Text>
            <TextInput
              style={[styles.reasonInput, ui.input]}
              value={requestReason}
              onChangeText={setRequestReason}
              placeholder={t('screens.finance.advanceReasonPlaceholder')}
              placeholderTextColor={colors.grayLight}
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity style={styles.submitButton} onPress={handleSendRequest}>
              <LinearGradient colors={[colors.warning, colors.warning]} style={styles.submitGradient}>
                <Send size={18} color="#FFFFFF" />
                <Text style={styles.submitText}>{t('screens.finance.submitAdvanceRequest')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {showStartPicker && (
        <DateTimePicker
          value={new Date(requestPeriodStart)}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowStartPicker(false);
            if (selectedDate) {
              setRequestPeriodStart(selectedDate.toISOString().split('T')[0]);
            }
          }}
        />
      )}

      {showEndPicker && (
        <DateTimePicker
          value={new Date(requestPeriodEnd)}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowEndPicker(false);
            if (selectedDate) {
              setRequestPeriodEnd(selectedDate.toISOString().split('T')[0]);
            }
          }}
        />
      )}
    </ThemedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' },
  requestButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  
  content: { padding: 16, paddingBottom: 30 },
  
  balanceCard: {
    backgroundColor: colors.primary,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
  },
  balanceTitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: 8 },
  balanceValue: { fontSize: 34, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 16 },
  balanceDetails: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  balanceDetail: { flex: 1 },
  balanceDetailLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  balanceDetailValue: { fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', marginTop: 4 },
  
  progressSection: { marginTop: 8 },
  progressBar: { height: 6, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: '#FFFFFF', borderRadius: 3 },
  progressText: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 6, textAlign: 'center' },
  
  advanceButton: { borderRadius: 30, overflow: 'hidden', marginBottom: 16 },
  advanceButtonGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  advanceButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },

  noAdvanceCard: { borderRadius: 16, padding: 16, marginBottom: 16 },
  noAdvanceTitle: { fontSize: 15, fontWeight: '600', marginBottom: 6 },
  noAdvanceText: { fontSize: 13, lineHeight: 18 },

  requestsCard: {
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
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#1A1A1A', marginBottom: 16 },
  
  emptyText: { textAlign: 'center', fontSize: 14, color: '#999999', paddingVertical: 20 },
  
  requestItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  requestHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  requestAmount: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  requestAmountText: { fontSize: 16, fontWeight: 'bold' },
  requestStatus: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  requestStatusText: { fontSize: 11, fontWeight: '500' },
  requestPeriod: { fontSize: 13, color: '#666666', marginBottom: 6 },
  requestReason: { fontSize: 12, color: '#666666', marginBottom: 6, fontStyle: 'italic' },
  requestDate: { fontSize: 11, color: '#999999', marginTop: 4 },
  requestReviewed: { fontSize: 10, color: colors.primary, marginTop: 2 },
  
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
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { borderRadius: 24, padding: 20, width: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },

  balanceInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, marginBottom: 12 },
  balanceInfoText: { fontSize: 14, color: colors.primary, fontWeight: '500', flex: 1 },

  inputLabel: { fontSize: 14, fontWeight: '500', marginBottom: 8, marginTop: 16 },
  amountInput: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  maxAmountButton: { alignItems: 'center', marginTop: 8 },
  maxAmountText: { fontSize: 13, color: colors.primary, fontWeight: '500' },
  periodHint: { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  changePeriodLink: { fontSize: 13, color: colors.primary, fontWeight: '500', marginBottom: 8 },
  
  periodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  smallDateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  smallDateText: { fontSize: 13 },
  periodDash: { fontSize: 16 },

  reasonInput: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  
  submitButton: { marginTop: 24, borderRadius: 30, overflow: 'hidden' },
  submitGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  submitText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});