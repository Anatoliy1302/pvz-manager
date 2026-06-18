// src/screens/owner/SalaryScreen.tsx
// Экран расчёта зарплаты — доступен только для Pro и Enterprise

import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import ScreenHeader from '../../components/common/ScreenHeader';
import PremiumGate from '../../components/common/PremiumGate';
import EmptyState from '../../components/common/EmptyState';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../constants/colors';
import { calculatePvzSalaryOverview } from '../../services/PaymentService';
import DataService from '../../services/DataService';
import { getMonthRange, toDateKey } from '../../utils/dateHelpers';
import {
  Wallet,
  ChevronLeft,
  ChevronRight,
  Users,
  Clock,
  TrendingUp,
  Award,
} from 'lucide-react-native';
import { FLAT_LIST_PERF } from '../../constants/flatListPerf';

interface EmployeeSalary {
  id: string;
  name: string;
  role: string;
  hours: number;
  shiftsCount: number;
  earned: number;
  paid: number;
  balance: number;
}

export default function SalaryScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { pvz, subscription } = useAuth();
  const { ui, screen } = useThemedScreen();
  const styles = useMemo(() => createStyles(screen), [screen]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [employees, setEmployees] = useState<EmployeeSalary[]>([]);
  const [summary, setSummary] = useState({
    totalEarned: 0,
    totalPaid: 0,
    totalBalance: 0,
    totalShifts: 0,
    totalHours: 0,
  });
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!pvz?.id) return;
    setLoading(true);
    try {
      const { start, end } = getMonthRange(selectedMonth.getFullYear(), selectedMonth.getMonth());
      const startStr = toDateKey(start);
      const endStr = toDateKey(end);

      const users = await DataService.getUsers();
      const employeesList = users.filter(
        (u) => u.role !== 'owner' && u.status === 'active'
      );
      const overview = await calculatePvzSalaryOverview(pvz.id, startStr, endStr);
      const overviewById = new Map(overview.map((row) => [row.employeeId, row]));

      const result: EmployeeSalary[] = [];
      let totalEarned = 0;
      let totalPaid = 0;
      let totalBalance = 0;
      let totalShifts = 0;
      let totalHours = 0;

      for (const emp of employeesList) {
        const row = overviewById.get(emp.id);
        if (!row) continue;

        const { accruals, shiftsCount, hours } = row;
        totalEarned += accruals.netEarned;
        totalPaid += accruals.totalPaid;
        totalBalance += accruals.balance;
        totalShifts += shiftsCount;
        totalHours += hours;

        result.push({
          id: emp.id,
          name: emp.name,
          role: emp.role,
          hours,
          shiftsCount,
          earned: accruals.netEarned,
          paid: accruals.totalPaid,
          balance: accruals.balance,
        });
      }

      result.sort((a, b) => b.earned - a.earned);
      setEmployees(result);
      setSummary({
        totalEarned: Math.round(totalEarned),
        totalPaid: Math.round(totalPaid),
        totalBalance: Math.round(totalBalance),
        totalShifts,
        totalHours: Math.round(totalHours * 10) / 10,
      });
    } catch (error) {
      console.error('Ошибка загрузки зарплаты:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, pvz?.id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const changeMonth = (delta: number) => {
    const newDate = new Date(selectedMonth);
    newDate.setMonth(newDate.getMonth() + delta);
    setSelectedMonth(newDate);
  };

  const formatMonth = () =>
    selectedMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

  const formatMoney = (value: number) =>
    `${value.toLocaleString('ru-RU')} ${t('common.money.currency')}`;

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const renderContent = () => {
    const listHeader = (
      <>
        <View style={[styles.monthSelector, ui.card]}>
          <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthArrow}>
            <ChevronLeft size={20} color={colors.primary} />
          </TouchableOpacity>
          <Text style={[styles.monthText, { color: screen.text }]}>{formatMonth()}</Text>
          <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthArrow}>
            <ChevronRight size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.summaryGrid}>
          <View style={[styles.summaryCard, ui.card]}>
            <TrendingUp size={20} color={colors.primary} />
            <Text style={[styles.summaryValue, { color: screen.text }]}>
              {formatMoney(summary.totalEarned)}
            </Text>
            <Text style={[styles.summaryLabel, { color: screen.textSecondary }]}>
              {t('screens.finance.accrued')}
            </Text>
          </View>
          <View style={[styles.summaryCard, ui.card]}>
            <Wallet size={20} color={colors.success} />
            <Text style={[styles.summaryValue, { color: screen.text }]}>
              {formatMoney(summary.totalPaid)}
            </Text>
            <Text style={[styles.summaryLabel, { color: screen.textSecondary }]}>
              {t('screens.analytics.paidLabel')}
            </Text>
          </View>
          <View style={[styles.summaryCard, ui.card]}>
            <Award size={20} color={colors.warning} />
            <Text style={[styles.summaryValue, { color: screen.text }]}>
              {formatMoney(summary.totalBalance)}
            </Text>
            <Text style={[styles.summaryLabel, { color: screen.textSecondary }]}>
              {t('screens.analytics.awaiting')}
            </Text>
          </View>
        </View>

        <View style={[styles.listCard, ui.card]}>
          <Text style={[styles.listTitle, ui.title]}>
            {t('screens.salary.employees')}
          </Text>
        </View>
      </>
    );

    const renderEmployeeItem = ({ item: emp }: { item: EmployeeSalary }) => (
      <TouchableOpacity
        style={[styles.employeeRow, styles.employeeRowInList, { borderBottomColor: screen.border }]}
        onPress={() =>
          navigation.navigate('EmployeePaymentDetails', {
            employeeId: emp.id,
            employeeName: emp.name,
          })
        }
        activeOpacity={0.7}
      >
        <View style={styles.employeeInfo}>
          <Text style={[styles.employeeName, { color: screen.text }]}>{emp.name}</Text>
          <View style={styles.employeeMeta}>
            <View style={styles.metaItem}>
              <Clock size={12} color={screen.textSecondary} />
              <Text style={[styles.metaText, { color: screen.textSecondary }]}>
                {emp.shiftsCount} смен / {emp.hours} ч
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.employeeFinance}>
          <Text style={[styles.earnedText, { color: screen.text }]}>{formatMoney(emp.earned)}</Text>
          <Text style={[styles.balanceText, { color: colors.success }]}>
            {t('screens.analytics.paidLabel')}: {formatMoney(emp.paid)}
          </Text>
          {emp.balance > 0 && (
            <Text style={[styles.pendingText, { color: colors.warning }]}>
              {t('screens.analytics.awaiting')}: {formatMoney(emp.balance)}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );

    return (
      <FlatList
        data={employees}
        keyExtractor={(item) => item.id}
        renderItem={renderEmployeeItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <EmptyState
            icon={Users}
            title={t('screens.analytics.noData')}
            description={t('screens.salary.noEmployees')}
          />
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        {...FLAT_LIST_PERF}
      />
    );
  };

  return (
    <ThemedSafeAreaView style={styles.container}>
      <ScreenHeader
        title={t('screens.salary.title')}
        onBack={() => navigation.goBack()}
      />

      <PremiumGate
        requiredTier="pro"
        feature="salary_calculation"
        onUpgrade={() => navigation.navigate('Subscription')}
      >
        {renderContent()}
      </PremiumGate>
    </ThemedSafeAreaView>
  );
}

const createStyles = (screen: any) =>
  StyleSheet.create({
    container: { flex: 1 },
    content: { padding: 16, paddingBottom: 30 },

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

    summaryGrid: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 16,
    },
    summaryCard: {
      flex: 1,
      borderRadius: 16,
      padding: 12,
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: screen.border,
    },
    summaryValue: { fontSize: 14, fontWeight: 'bold' },
    summaryLabel: { fontSize: 11, textAlign: 'center' },

    listCard: {
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: screen.border,
    },
    listTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },

    employeeRowInList: { marginHorizontal: 16, paddingHorizontal: 16, backgroundColor: screen.card, borderWidth: 1, borderColor: screen.border },
    employeeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
    },
    employeeInfo: { flex: 1, marginRight: 12 },
    employeeName: { fontSize: 14, fontWeight: '500', marginBottom: 4 },
    employeeMeta: { flexDirection: 'row', gap: 8 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { fontSize: 11 },
    employeeFinance: { alignItems: 'flex-end' },
    earnedText: { fontSize: 14, fontWeight: '600' },
    balanceText: { fontSize: 11, marginTop: 2 },
    pendingText: { fontSize: 11, marginTop: 1 },
  });
