// src/screens/owner/OwnerAnalyticsScreen.tsx
import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getDateLocale } from '../../i18n';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
} from 'react-native';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import ScreenHeader from '../../components/common/ScreenHeader';
import EmptyState from '../../components/common/EmptyState';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../constants/colors';
import { User } from '../../types/user';
import { calculateEmployeeAccruals } from '../../services/PaymentService';
import DataService from '../../services/DataService';
import { formatHours, toDateKey } from '../../utils/dateHelpers';
import {
  Users,
  Calendar,
  Award,
  Clock,
  ChevronRight,
  ChevronLeft as ChevronLeftIcon,
  X,
  Building2,
  Info,
  Search,
} from 'lucide-react-native';

interface ShiftDetail {
  id: string;
  date: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  totalHours: number;
  earnings: number;
  calculationFormula: string;
  paymentStatus: string;
}

interface EmployeeStats {
  id: string;
  name: string;
  role: string;
  totalHours: number;
  totalShifts: number;
  totalEarned: number;
  totalPaid: number;
  totalPending: number;
  shiftsDetails: ShiftDetail[];
}

function userWorksAtPvz(u: User, pvzId: string): boolean {
  if (!pvzId) return true;
  if (u.pvzId === pvzId) return true;
  return u.pvzIds?.includes(pvzId) ?? false;
}

export default function OwnerAnalyticsScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { pvz, userPvzs } = useAuth();
  const { ui, screen, theme } = useThemedScreen();
  const styles = createStyles(screen);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [selectedPvzId, setSelectedPvzId] = useState(pvz?.id || '');
  const [topEmployees, setTopEmployees] = useState<EmployeeStats[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeStats | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hideInactive, setHideInactive] = useState(false);
  const [summary, setSummary] = useState({
    totalHours: 0,
    totalShifts: 0,
    employeesWithShifts: 0,
    totalEarned: 0,
    totalPaid: 0,
    totalPending: 0,
  });

  const loadAnalyticsData = useCallback(async () => {
    const pvzId = selectedPvzId || pvz?.id || '';
    if (!pvzId) return;

    try {
      const users = await DataService.getUsers();
      const shifts = await DataService.getShifts();

      const filteredShifts = shifts.filter((s) => s.pvzId === pvzId);
      const filteredUsers = users.filter(
        (u) => u.role !== 'owner' && u.status === 'active' && userWorksAtPvz(u, pvzId)
      );

      const monthStart = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
      const monthEnd = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);
      const startStr = toDateKey(monthStart);
      const endStr = toDateKey(monthEnd);

      const monthShifts = filteredShifts.filter((s) => s.date >= startStr && s.date <= endStr);
      const completedShifts = monthShifts.filter(
        (s) => s.status === 'completed' || s.status === 'paid'
      );

      const employeeStatsMap: Record<string, EmployeeStats> = {};

      completedShifts.forEach((shift) => {
        if (!employeeStatsMap[shift.employeeId]) {
          employeeStatsMap[shift.employeeId] = {
            id: shift.employeeId,
            name: shift.employeeName || t('common.roles.employee'),
            role: 'employee',
            totalHours: 0,
            totalShifts: 0,
            totalEarned: 0,
            totalPaid: 0,
            totalPending: 0,
            shiftsDetails: [],
          };
        }
        const hours = shift.totalHours || 0;
        const earnings = shift.earnings || 0;
        const isPaid = shift.paymentStatus === 'paid';

        employeeStatsMap[shift.employeeId].totalHours += hours;
        employeeStatsMap[shift.employeeId].totalShifts += 1;
        employeeStatsMap[shift.employeeId].totalEarned += earnings;
        if (isPaid) {
          employeeStatsMap[shift.employeeId].totalPaid += earnings;
        }

        employeeStatsMap[shift.employeeId].shiftsDetails.push({
          id: shift.id,
          date: shift.date,
          shiftType: shift.shiftType || (shift.customStart ? 'hourly' : 'full'),
          startTime: shift.startTime,
          endTime: shift.endTime,
          totalHours: hours,
          earnings,
          calculationFormula: shift.calculationFormula || '',
          paymentStatus: shift.paymentStatus || 'pending',
        });
      });

      filteredUsers.forEach((u) => {
        if (!employeeStatsMap[u.id]) {
          employeeStatsMap[u.id] = {
            id: u.id,
            name: u.name,
            role: u.role,
            totalHours: 0,
            totalShifts: 0,
            totalEarned: 0,
            totalPaid: 0,
            totalPending: 0,
            shiftsDetails: [],
          };
        } else {
          employeeStatsMap[u.id].name = u.name;
          employeeStatsMap[u.id].role = u.role;
        }
      });

      await Promise.all(
        filteredUsers.map(async (u) => {
          const accruals = await calculateEmployeeAccruals(u.id, pvzId, {
            periodStart: startStr,
            periodEnd: endStr,
          });
          const stats = employeeStatsMap[u.id];
          if (!stats) return;
          stats.totalEarned = accruals.netEarned;
          stats.totalPending = Math.max(0, accruals.netEarned - stats.totalPaid);
        })
      );

      const sorted = Object.values(employeeStatsMap).sort((a, b) => b.totalHours - a.totalHours);
      setTopEmployees(sorted);

      const totalHours = completedShifts.reduce((sum, s) => sum + (s.totalHours || 0), 0);
      const employeesWithShifts = new Set(completedShifts.map((s) => s.employeeId)).size;
      const totalEarned = sorted.reduce((sum, e) => sum + e.totalEarned, 0);
      const totalPaid = sorted.reduce((sum, e) => sum + e.totalPaid, 0);

      setSummary({
        totalHours: Math.round(totalHours * 10) / 10,
        totalShifts: completedShifts.length,
        employeesWithShifts,
        totalEarned: Math.round(totalEarned),
        totalPaid: Math.round(totalPaid),
        totalPending: Math.round(Math.max(0, totalEarned - totalPaid)),
      });
    } catch (error) {
      console.error('Ошибка загрузки аналитики:', error);
    }
  }, [selectedMonth, selectedPvzId, pvz?.id, t]);

  useFocusEffect(
    useCallback(() => {
      if (pvz?.id) setSelectedPvzId(pvz.id);
    }, [pvz?.id])
  );

  useFocusEffect(
    useCallback(() => {
      loadAnalyticsData();
      const unsubBalance = DataService.subscribe('employee_balance', loadAnalyticsData);
      const unsubShifts = DataService.subscribe('shifts', loadAnalyticsData);
      const unsubUsers = DataService.subscribe('pvz_users', loadAnalyticsData);
      return () => {
        unsubBalance();
        unsubShifts();
        unsubUsers();
      };
    }, [loadAnalyticsData])
  );

  const filteredEmployees = useMemo(() => {
    let list = topEmployees;
    if (hideInactive) {
      list = list.filter((e) => e.totalShifts > 0);
    }
    const query = searchQuery.trim().toLowerCase();
    if (!query) return list;
    return list.filter((e) => e.name.toLowerCase().includes(query));
  }, [topEmployees, hideInactive, searchQuery]);

  const selectedPvzName =
    userPvzs.find((p) => p.id === selectedPvzId)?.name || pvz?.name || t('common.pvz.default');

  const changeMonth = (delta: number) => {
    const newDate = new Date(selectedMonth);
    newDate.setMonth(newDate.getMonth() + delta);
    setSelectedMonth(newDate);
  };

  const formatMonth = () =>
    selectedMonth.toLocaleDateString(getDateLocale(), { month: 'long', year: 'numeric' });

  const formatMoney = (value: number) =>
    `${value.toLocaleString(getDateLocale())} ${t('common.money.currency')}`;

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAnalyticsData();
    setRefreshing(false);
  };

  const formatDate = (dateString: string) => {
    const [y, m, d] = dateString.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(getDateLocale(), { day: 'numeric', month: 'short' });
  };

  const getShiftTypeName = (shiftType: string) => {
    switch (shiftType) {
      case 'full':
        return t('common.shiftTypes.full');
      case 'half_morning':
        return t('screens.schedule.halfMorning');
      case 'half_evening':
        return t('screens.schedule.halfEvening');
      default:
        return t('common.shiftTypes.hourly');
    }
  };

  const getMedalColor = (index: number) => {
    switch (index) {
      case 0:
        return '#FFD700';
      case 1:
        return '#C0C0C0';
      case 2:
        return '#CD7F32';
      default:
        return colors.primary;
    }
  };

  const openEmployeeDetails = (employee: EmployeeStats) => {
    setSelectedEmployee(employee);
    setShowDetailsModal(true);
  };

  return (
    <ThemedSafeAreaView style={styles.container}>
      <ScreenHeader title={t('screens.owner.analytics')} onBack={() => navigation.goBack()} />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {userPvzs.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pvzRow}
          >
            {userPvzs.map((item) => {
              const active = selectedPvzId === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.pvzChip,
                    { borderColor: screen.border, backgroundColor: ui.input.backgroundColor },
                    active && styles.pvzChipActive,
                  ]}
                  onPress={() => setSelectedPvzId(item.id)}
                >
                  <Building2 size={14} color={active ? colors.primary : screen.textSecondary} />
                  <Text
                    style={[
                      styles.pvzChipText,
                      { color: screen.textSecondary },
                      active && styles.pvzChipTextActive,
                    ]}
                  >
                    {item.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {userPvzs.length <= 1 && selectedPvzName && (
          <View style={[styles.pvzBadge, ui.card]}>
            <Building2 size={16} color={colors.primary} />
            <Text style={[styles.pvzBadgeText, { color: screen.text }]}>
              {t('common.pvz.label')} {selectedPvzName}
            </Text>
          </View>
        )}

        <View style={[styles.monthSelector, ui.card]}>
          <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthArrow}>
            <ChevronLeftIcon size={20} color={colors.primary} />
          </TouchableOpacity>
          <Text style={[styles.monthText, { color: screen.text }]}>{formatMonth()}</Text>
          <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthArrow}>
            <ChevronRight size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.statsGrid}>
          <View style={[styles.statCard, ui.card]}>
            <View style={[styles.statIcon, { backgroundColor: colors.primaryLight }]}>
              <Clock size={22} color={colors.primary} />
            </View>
            <Text style={[styles.statValue, { color: screen.text }]}>{formatHours(summary.totalHours)}</Text>
            <Text style={[styles.statLabel, { color: screen.textSecondary }]}>
              {t('screens.analytics.totalHours')}
            </Text>
          </View>
          <View style={[styles.statCard, ui.card]}>
            <View style={[styles.statIcon, { backgroundColor: theme === 'dark' ? 'rgba(76,175,80,0.2)' : '#E8F5E9' }]}>
              <Calendar size={22} color={colors.success} />
            </View>
            <Text style={[styles.statValue, { color: screen.text }]}>{summary.totalShifts}</Text>
            <Text style={[styles.statLabel, { color: screen.textSecondary }]}>
              {t('screens.analytics.shiftsCount')}
            </Text>
          </View>
          <View style={[styles.statCard, ui.card]}>
            <View style={[styles.statIcon, { backgroundColor: theme === 'dark' ? 'rgba(255,152,0,0.2)' : '#FFF3E0' }]}>
              <Users size={22} color={colors.warning} />
            </View>
            <Text style={[styles.statValue, { color: screen.text }]}>{summary.employeesWithShifts}</Text>
            <Text style={[styles.statLabel, { color: screen.textSecondary }]}>
              {t('screens.analytics.withShifts')}
            </Text>
          </View>
        </View>

        <View style={[styles.financeCard, ui.card]}>
          <Text style={[styles.financeTitle, ui.title]}>{t('screens.analytics.financeTitle')}</Text>
          <View style={styles.financeRow}>
            <View style={styles.financeItem}>
              <Text style={[styles.financeLabel, { color: screen.textSecondary }]}>
                {t('screens.finance.accrued')}
              </Text>
              <Text style={[styles.financeValue, { color: screen.text }]}>
                {summary.totalEarned.toLocaleString(getDateLocale())} {t('common.money.currency')}
              </Text>
            </View>
            <View style={[styles.financeDivider, { backgroundColor: screen.border }]} />
            <View style={styles.financeItem}>
              <Text style={[styles.financeLabel, { color: screen.textSecondary }]}>
                {t('screens.analytics.paidLabel')}
              </Text>
              <Text style={[styles.financeValue, { color: colors.success }]}>
                {summary.totalPaid.toLocaleString(getDateLocale())} {t('common.money.currency')}
              </Text>
            </View>
            <View style={[styles.financeDivider, { backgroundColor: screen.border }]} />
            <View style={styles.financeItem}>
              <Text style={[styles.financeLabel, { color: screen.textSecondary }]}>
                {t('screens.analytics.awaiting')}
              </Text>
              <Text style={[styles.financeValue, { color: colors.warning }]}>
                {summary.totalPending.toLocaleString(getDateLocale())} {t('common.money.currency')}
              </Text>
            </View>
          </View>
          {summary.totalEarned > 0 && (
            <View style={[styles.progressSection, { borderTopColor: screen.border }]}>
              <View style={[styles.progressBar, { backgroundColor: screen.border }]}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.min(100, (summary.totalPaid / summary.totalEarned) * 100)}%` },
                  ]}
                />
              </View>
              <Text style={[styles.progressText, { color: screen.textSecondary }]}>
                {t('screens.analytics.paidPercent', {
                  percent: Math.round((summary.totalPaid / summary.totalEarned) * 100),
                })}
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.topCard, ui.card]}>
          <Text style={[styles.cardTitle, ui.title]}>{t('screens.analytics.employeesByHours')}</Text>

          <View style={[styles.searchRow, { backgroundColor: ui.input.backgroundColor, borderColor: screen.border }]}>
            <Search size={16} color={screen.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: screen.text }]}
              placeholder={t('screens.analytics.searchPlaceholder')}
              placeholderTextColor={colors.grayLighter}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          <TouchableOpacity
            style={styles.filterToggle}
            onPress={() => setHideInactive((v) => !v)}
          >
            <Text style={[styles.filterToggleText, { color: screen.textSecondary }]}>
              {hideInactive ? t('screens.analytics.showAll') : t('screens.analytics.hideInactive')}
            </Text>
          </TouchableOpacity>

          {filteredEmployees.length === 0 ? (
            <EmptyState
              icon={Users}
              title={t('screens.analytics.noData')}
              description={
                searchQuery
                  ? t('screens.analytics.notFoundDesc', { query: searchQuery.trim() })
                  : t('screens.analytics.noShiftsMonth')
              }
            />
          ) : (
            filteredEmployees.map((employee, index) => (
              <TouchableOpacity
                key={employee.id}
                style={[styles.topItem, { borderBottomColor: screen.border }]}
                onPress={() => openEmployeeDetails(employee)}
              >
                <View style={styles.topItemLeft}>
                  <View style={[styles.topMedal, { backgroundColor: getMedalColor(index) }]}>
                    <Text style={styles.topMedalText}>{index + 1}</Text>
                  </View>
                  <View style={styles.topItemInfo}>
                    <Text style={[styles.topName, { color: screen.text }]}>{employee.name}</Text>
                    <Text style={[styles.topRole, { color: screen.textSecondary }]}>
                      {employee.role === 'admin'
                        ? t('common.roles.adminShort')
                        : t('common.roles.employeeShort')}
                      {employee.totalShifts === 0 ? t('screens.analytics.noShiftsSuffix') : ''}
                    </Text>
                  </View>
                </View>
                <View style={styles.topItemRight}>
                  <Text style={styles.topHours}>{formatHours(employee.totalHours)}</Text>
                  <Text style={styles.topEarned}>
                    {employee.totalEarned.toLocaleString(getDateLocale())} {t('common.money.currency')}
                  </Text>
                  {employee.totalPending > 0 && (
                    <Text style={styles.topPending}>
                      {t('screens.analytics.toPay', {
                        amount: employee.totalPending.toLocaleString(getDateLocale()),
                      })}
                    </Text>
                  )}
                </View>
                <ChevronRight size={16} color={screen.textSecondary} />
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={[styles.infoCard, ui.card]}>
          <Info size={18} color={colors.primary} />
          <Text style={[styles.infoText, { color: screen.textSecondary }]}>
            {t('screens.analytics.footerNote')}
          </Text>
        </View>
      </ScrollView>

      <Modal
        visible={showDetailsModal && selectedEmployee !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDetailsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowDetailsModal(false)}
          />
          <View style={[styles.modalContent, ui.modal]}>
            <View style={[styles.modalHeader, { borderBottomColor: screen.border }]}>
              <Text style={[styles.modalTitle, ui.title]}>{selectedEmployee?.name}</Text>
              <TouchableOpacity onPress={() => setShowDetailsModal(false)}>
                <X size={24} color={screen.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalInfoText, { color: screen.textSecondary }]}>
              {selectedEmployee?.role === 'admin'
                ? t('common.roles.admin')
                : t('common.roles.employee')}{' '}
              · {formatMonth()}
            </Text>

            <View style={[styles.modalStats, { backgroundColor: ui.input.backgroundColor }]}>
              <View style={styles.modalStat}>
                <Text style={[styles.modalStatValue, { color: screen.text }]}>
                  {selectedEmployee?.totalShifts}
                </Text>
                <Text style={[styles.modalStatLabel, { color: screen.textSecondary }]}>
                  {t('screens.analytics.shiftsCount')}
                </Text>
              </View>
              <View style={[styles.modalStatDivider, { backgroundColor: screen.border }]} />
              <View style={styles.modalStat}>
                <Text style={[styles.modalStatValue, { color: screen.text }]}>
                  {formatHours(selectedEmployee?.totalHours || 0)}
                </Text>
                <Text style={[styles.modalStatLabel, { color: screen.textSecondary }]}>
                  {t('screens.analytics.hoursLabel')}
                </Text>
              </View>
              <View style={[styles.modalStatDivider, { backgroundColor: screen.border }]} />
              <View style={styles.modalStat}>
                <Text style={[styles.modalStatValue, { color: screen.text }]}>
                  {selectedEmployee?.totalEarned.toLocaleString(getDateLocale())}{' '}
                  {t('common.money.currency')}
                </Text>
                <Text style={[styles.modalStatLabel, { color: screen.textSecondary }]}>
                  {t('screens.finance.accrued')}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.paymentSummary,
                { backgroundColor: theme === 'dark' ? 'rgba(255,152,0,0.12)' : '#FFF8E1' },
              ]}
            >
              <View style={styles.paymentSummaryRow}>
                <Text style={[styles.paymentSummaryLabel, { color: screen.textSecondary }]}>
                  {t('screens.analytics.paidLabel')}:
                </Text>
                <Text style={[styles.paymentSummaryValue, { color: colors.success }]}>
                  {selectedEmployee?.totalPaid.toLocaleString(getDateLocale())}{' '}
                  {t('common.money.currency')}
                </Text>
              </View>
              <View style={styles.paymentSummaryRow}>
                <Text style={[styles.paymentSummaryLabel, { color: screen.textSecondary }]}>
                  {t('screens.analytics.awaitingLabel')}:
                </Text>
                <Text style={[styles.paymentSummaryValue, { color: colors.warning }]}>
                  {selectedEmployee?.totalPending.toLocaleString(getDateLocale())}{' '}
                  {t('common.money.currency')}
                </Text>
              </View>
            </View>

            <Text style={[styles.modalSubtitle, ui.title]}>{t('screens.analytics.shiftsMonth')}</Text>

            <ScrollView style={styles.shiftsList} showsVerticalScrollIndicator={false}>
              {selectedEmployee?.shiftsDetails.length === 0 ? (
                <Text style={[styles.noShiftsText, { color: screen.textSecondary }]}>
                  {t('screens.analytics.noCompletedShifts')}
                </Text>
              ) : (
                selectedEmployee?.shiftsDetails.map((shift) => (
                  <View
                    key={shift.id}
                    style={[styles.shiftItem, { borderBottomColor: screen.border }]}
                  >
                    <View style={styles.shiftHeader}>
                      <Text style={[styles.shiftDate, { color: screen.text }]}>
                        {formatDate(shift.date)}
                      </Text>
                      <View
                        style={[
                          styles.paymentBadge,
                          shift.paymentStatus === 'paid' ? styles.paidBadge : styles.pendingBadge,
                        ]}
                      >
                        <Text
                          style={[
                            styles.paymentBadgeText,
                            shift.paymentStatus === 'paid'
                              ? styles.paidBadgeText
                              : styles.pendingBadgeText,
                          ]}
                        >
                          {shift.paymentStatus === 'paid'
                            ? t('screens.analytics.paidStatus')
                            : t('screens.analytics.awaitingStatus')}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.shiftType}>{getShiftTypeName(shift.shiftType)}</Text>
                    <Text style={[styles.shiftTime, { color: screen.textSecondary }]}>
                      {shift.startTime} — {shift.endTime}
                    </Text>
                    <Text style={[styles.shiftHours, { color: screen.textSecondary }]}>
                      {formatHours(shift.totalHours)}
                    </Text>
                    <Text style={styles.shiftEarnings}>
                      +{formatMoney(shift.earnings)}
                    </Text>
                    {shift.calculationFormula ? (
                      <Text style={[styles.shiftFormula, { color: screen.textSecondary }]}>
                        {shift.calculationFormula}
                      </Text>
                    ) : null}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ThemedSafeAreaView>
  );
}

const createStyles = (screen: ReturnType<typeof useThemedScreen>['screen']) =>
  StyleSheet.create({
    container: { flex: 1 },
    content: { padding: 16, paddingBottom: 30 },
    pvzRow: { gap: 8, marginBottom: 12, paddingRight: 8 },
    pvzChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
    },
    pvzChipActive: {
      backgroundColor: colors.primaryLight,
      borderColor: colors.primary,
    },
    pvzChipText: { fontSize: 13, fontWeight: '500' },
    pvzChipTextActive: { color: colors.primary, fontWeight: '600' },
    pvzBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 12,
      borderRadius: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: screen.border,
    },
    pvzBadgeText: { fontSize: 14, fontWeight: '600' },
    monthSelector: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
      gap: 20,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: screen.border,
      borderRadius: 16,
    },
    monthArrow: { padding: 8 },
    monthText: { fontSize: 16, fontWeight: '600', textTransform: 'capitalize' },
    statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    statCard: {
      flex: 1,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: screen.border,
    },
    statIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    statValue: { fontSize: 16, fontWeight: 'bold', marginBottom: 2 },
    statLabel: { fontSize: 11, textAlign: 'center' },
    financeCard: {
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: screen.border,
    },
    financeTitle: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
    financeRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
    financeItem: { alignItems: 'center', flex: 1 },
    financeLabel: { fontSize: 11, marginBottom: 4 },
    financeValue: { fontSize: 15, fontWeight: 'bold' },
    financeDivider: { width: 1, height: 28 },
    progressSection: { marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
    progressBar: { height: 6, borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: 6, backgroundColor: colors.success, borderRadius: 3 },
    progressText: { fontSize: 11, marginTop: 6, textAlign: 'center' },
    topCard: {
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: screen.border,
    },
    cardTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginBottom: 8,
      borderWidth: 1,
    },
    searchInput: { flex: 1, fontSize: 14, paddingVertical: 2 },
    filterToggle: { marginBottom: 12 },
    filterToggleText: { fontSize: 12, fontWeight: '500' },
    topItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      gap: 8,
    },
    topItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    topItemInfo: { flex: 1 },
    topMedal: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    topMedalText: { fontSize: 13, fontWeight: 'bold', color: '#FFFFFF' },
    topName: { fontSize: 14, fontWeight: '500' },
    topRole: { fontSize: 11, marginTop: 2 },
    topItemRight: { alignItems: 'flex-end' },
    topHours: { fontSize: 14, fontWeight: '600', color: colors.primary },
    topEarned: { fontSize: 12, color: colors.success },
    topPending: { fontSize: 10, color: colors.warning },
    infoCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: screen.border,
    },
    infoText: { flex: 1, fontSize: 12, lineHeight: 17 },
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContent: {
      borderRadius: 24,
      width: '92%',
      maxHeight: '85%',
      overflow: 'hidden',
      zIndex: 1,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 20,
      borderBottomWidth: 1,
    },
    modalTitle: { fontSize: 20, fontWeight: 'bold', flex: 1, marginRight: 8 },
    modalInfoText: { fontSize: 13, textAlign: 'center', paddingVertical: 10 },
    modalStats: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      paddingVertical: 14,
      marginHorizontal: 16,
      borderRadius: 12,
    },
    modalStat: { alignItems: 'center', flex: 1 },
    modalStatValue: { fontSize: 18, fontWeight: 'bold' },
    modalStatLabel: { fontSize: 11, marginTop: 4 },
    modalStatDivider: { width: 1, height: 36 },
    paymentSummary: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      padding: 14,
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 12,
    },
    paymentSummaryRow: { alignItems: 'center' },
    paymentSummaryLabel: { fontSize: 12 },
    paymentSummaryValue: { fontSize: 15, fontWeight: 'bold', marginTop: 4 },
    modalSubtitle: {
      fontSize: 15,
      fontWeight: '600',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 8,
    },
    shiftsList: { paddingHorizontal: 16, paddingBottom: 20, maxHeight: 320 },
    noShiftsText: { textAlign: 'center', paddingVertical: 24, fontSize: 14 },
    shiftItem: { paddingVertical: 12, borderBottomWidth: 1 },
    shiftHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    shiftDate: { fontSize: 14, fontWeight: '500' },
    paymentBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
    paidBadge: { backgroundColor: 'rgba(76,175,80,0.15)' },
    pendingBadge: { backgroundColor: 'rgba(255,152,0,0.15)' },
    paymentBadgeText: { fontSize: 10, fontWeight: '500' },
    paidBadgeText: { color: colors.success },
    pendingBadgeText: { color: colors.warning },
    shiftType: { fontSize: 12, color: colors.primary, marginBottom: 2 },
    shiftTime: { fontSize: 13, marginBottom: 2 },
    shiftHours: { fontSize: 12, marginBottom: 2 },
    shiftEarnings: { fontSize: 14, fontWeight: '600', color: colors.success, marginTop: 2 },
    shiftFormula: { fontSize: 11, marginTop: 4, fontStyle: 'italic' },
  });
