// src/screens/statistics/StatisticsScreen.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../constants/colors';
import DataService from '../../services/DataService';
import { formatHours } from '../../utils/dateHelpers';
import {
  loadEmployeeMonthStats,
  getShiftStatusLabel,
  EmployeeMonthStats,
  ShiftDisplayStatus,
} from '../../utils/employeeStatsHelpers';
import PermissionGate from '../../components/common/PermissionGate';
import ScreenHeader from '../../components/common/ScreenHeader';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import {
  ChevronLeft,
  Clock,
  Briefcase,
  Calendar,
  Award,
  Zap,
  MinusCircle,
  PlusCircle,
} from 'lucide-react-native';
import { FLAT_LIST_PERF } from '../../constants/flatListPerf';

const STATUS_COLORS: Record<ShiftDisplayStatus, string> = {
  completed: colors.success,
  paid: '#2196F3',
  planned: colors.warning,
  active: colors.primary,
};

export default function StatisticsScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { user, pvz } = useAuth();
  const { screen, ui } = useThemedScreen();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [stats, setStats] = useState<EmployeeMonthStats>({
    totalEarned: 0,
    shiftsEarned: 0,
    totalFines: 0,
    totalBonuses: 0,
    totalShifts: 0,
    totalHours: 0,
    daysWorked: 0,
    avgHoursPerShift: 0,
    bestDayEarned: 0,
    bestDayDate: '—',
    completedDays: [],
    plannedShifts: [],
  });

  const loadStatistics = async () => {
    if (!user?.id) return;

    try {
      const data = await loadEmployeeMonthStats(
        user.id,
        pvz?.id || user.pvzId || '',
        selectedMonth
      );
      setStats(data);
    } catch (error) {
      console.error('Ошибка загрузки статистики:', error);
    }
  };

  useEffect(() => {
    const unsubscribeShifts = DataService.subscribe('shifts', loadStatistics);
    const unsubscribeBalance = DataService.subscribe('employee_balance', loadStatistics);
    loadStatistics();
    return () => {
      unsubscribeShifts();
      unsubscribeBalance();
    };
  }, [selectedMonth, user?.id, pvz?.id]);

  useFocusEffect(
    useCallback(() => {
      loadStatistics();
    }, [selectedMonth, user?.id, pvz?.id])
  );

  const changeMonth = (delta: number) => {
    const newDate = new Date(selectedMonth);
    newDate.setMonth(newDate.getMonth() + delta);
    setSelectedMonth(newDate);
  };

  const formatMonth = () =>
    selectedMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStatistics();
    setRefreshing(false);
  };

  const hasCompletedData = stats.completedDays.length > 0;
  const hasAnyData = hasCompletedData || stats.plannedShifts.length > 0;

  const statsSections = useMemo(
    () => [
      ...(hasCompletedData
        ? [{ key: 'completed' as const, title: t('screens.statistics.completedShifts'), data: stats.completedDays }]
        : []),
      ...(stats.plannedShifts.length > 0
        ? [{ key: 'planned' as const, title: t('screens.statistics.plannedShifts'), data: stats.plannedShifts }]
        : []),
    ],
    [hasCompletedData, stats.completedDays, stats.plannedShifts, t]
  );

  const statsListHeader = useMemo(
    () => (
      <>
        <View style={styles.monthSelector}>
          <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthArrow}>
            <Text style={styles.monthArrowText}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.monthText, { color: screen.text }]}>{formatMonth()}</Text>
          <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthArrow}>
            <Text style={styles.monthArrowText}>→</Text>
          </TouchableOpacity>
        </View>

        {pvz?.name && (
          <Text style={[styles.pvzHint, { color: screen.textSecondary }]}>{t('common.pvz.label')} {pvz.name}</Text>
        )}

        <View style={styles.mainCard}>
          <Text style={styles.mainCardLabel}>{t('screens.statistics.monthTotal')}</Text>
          <Text style={styles.mainCardValue}>{stats.totalEarned.toLocaleString()} ₽</Text>
          <Text style={styles.mainCardHint}>{t('screens.statistics.includingPenalties')}</Text>
        </View>

        {(stats.shiftsEarned > 0 || stats.totalFines > 0 || stats.totalBonuses > 0) && (
          <View style={[styles.breakdownCard, ui.card]}>
            <Text style={[styles.breakdownTitle, ui.sectionTitle]}>{t('screens.statistics.breakdown')}</Text>
            <View style={styles.breakdownRow}>
              <View style={styles.breakdownLeft}>
                <Briefcase size={16} color={colors.primary} />
                <Text style={[styles.breakdownLabel, { color: screen.textSecondary }]}>{t('screens.statistics.forShifts')}</Text>
              </View>
              <Text style={[styles.breakdownValue, { color: screen.text }]}>+{stats.shiftsEarned.toLocaleString()} ₽</Text>
            </View>
            {stats.totalFines > 0 && (
              <View style={styles.breakdownRow}>
                <View style={styles.breakdownLeft}>
                  <MinusCircle size={16} color={colors.danger} />
                  <Text style={[styles.breakdownLabel, { color: screen.textSecondary }]}>{t('screens.statistics.penalties')}</Text>
                </View>
                <Text style={[styles.breakdownValue, styles.breakdownNegative]}>
                  −{stats.totalFines.toLocaleString()} ₽
                </Text>
              </View>
            )}
            {stats.totalBonuses > 0 && (
              <View style={styles.breakdownRow}>
                <View style={styles.breakdownLeft}>
                  <PlusCircle size={16} color={colors.success} />
                  <Text style={[styles.breakdownLabel, { color: screen.textSecondary }]}>{t('screens.statistics.bonuses')}</Text>
                </View>
                <Text style={[styles.breakdownValue, styles.breakdownPositive]}>
                  +{stats.totalBonuses.toLocaleString()} ₽
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={[styles.simpleStats, ui.card]}>
          <View style={styles.simpleStatItem}>
            <Clock size={22} color={colors.primary} />
            <Text style={[styles.simpleStatValue, { color: screen.text }]}>{formatHours(stats.totalHours)}</Text>
            <Text style={[styles.simpleStatLabel, { color: screen.textSecondary }]}>{t('common.stats.hours')}</Text>
          </View>
          <View style={[styles.simpleDivider, { backgroundColor: screen.border }]} />
          <View style={styles.simpleStatItem}>
            <Briefcase size={22} color={colors.primary} />
            <Text style={[styles.simpleStatValue, { color: screen.text }]}>{stats.totalShifts}</Text>
            <Text style={[styles.simpleStatLabel, { color: screen.textSecondary }]}>{t('common.stats.shifts')}</Text>
          </View>
          <View style={[styles.simpleDivider, { backgroundColor: screen.border }]} />
          <View style={styles.simpleStatItem}>
            <Calendar size={22} color={colors.primary} />
            <Text style={[styles.simpleStatValue, { color: screen.text }]}>{stats.daysWorked}</Text>
            <Text style={[styles.simpleStatLabel, { color: screen.textSecondary }]}>{t('common.stats.days')}</Text>
          </View>
        </View>

        <Text style={[styles.statsNote, { color: screen.textSecondary }]}>{t('screens.statistics.completedOnlyNote')}</Text>

        <View style={[styles.avgCard, ui.card]}>
          <Text style={[styles.avgLabel, { color: screen.textSecondary }]}>{t('screens.statistics.avgShift')}</Text>
          <Text style={[styles.avgValue, { color: screen.text }]}>{formatHours(stats.avgHoursPerShift)}</Text>
        </View>

        {stats.bestDayDate !== '—' && stats.bestDayEarned > 0 && (
          <View style={[styles.bestDayCard, ui.card]}>
            <View style={styles.bestDayIcon}>
              <Award size={28} color="#FFD700" />
            </View>
            <View style={styles.bestDayInfo}>
              <Text style={[styles.bestDayLabel, { color: screen.textSecondary }]}>{t('screens.statistics.bestDay')}</Text>
              <Text style={[styles.bestDayDate, { color: screen.text }]}>{stats.bestDayDate}</Text>
            </View>
            <Text style={styles.bestDayAmount}>+{stats.bestDayEarned.toLocaleString()} ₽</Text>
          </View>
        )}
      </>
    ),
    [stats, screen, ui, pvz?.name, t, formatMonth, changeMonth]
  );

  const renderStatsItem = useCallback(
    ({ item, section }: { item: any; section: { key: string } }) => {
      if (section.key === 'completed') {
        const day = item;
        return (
          <View style={[styles.shiftItem, { borderBottomColor: screen.border }]}>
            <View style={styles.shiftLeft}>
              <Text style={[styles.shiftDate, { color: screen.text }]}>
                {new Date(day.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
              </Text>
              <Text style={[styles.shiftHours, { color: screen.textSecondary }]}>
                {formatHours(day.hours)}
                {day.shiftCount > 1 ? t('screens.statistics.shiftCountMultiple', { count: day.shiftCount }) : ''}
              </Text>
            </View>
            <Text style={styles.shiftEarnings}>+{day.earnings.toLocaleString()} ₽</Text>
          </View>
        );
      }

      const shift = item;
      return (
        <View style={[styles.shiftItem, { borderBottomColor: screen.border }]}>
          <View style={styles.shiftLeft}>
            <Text style={[styles.shiftDate, { color: screen.text }]}>
              {new Date(shift.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
            </Text>
            <Text style={[styles.shiftHours, { color: screen.textSecondary }]}>
              {shift.startTime && shift.endTime
                ? `${shift.startTime}–${shift.endTime}`
                : formatHours(shift.hours)}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLORS[shift.status as ShiftDisplayStatus]}20` }]}>
            <Text style={[styles.statusBadgeText, { color: STATUS_COLORS[shift.status as ShiftDisplayStatus] }]}>
              {getShiftStatusLabel(shift.status)}
            </Text>
          </View>
        </View>
      );
    },
    [screen, t]
  );

  return (
    <PermissionGate
      permission="canViewStats"
      navigation={navigation}
      fallbackScreen={user?.role === 'admin' ? 'Dashboard' : 'Home'}
    >
      <ThemedSafeAreaView>
        <ScreenHeader title={t('screens.statistics.title')} onBack={() => navigation.goBack()} />

        <SectionList
          sections={statsSections}
          keyExtractor={(item, index) => ('date' in item ? item.date : item.id) || String(index)}
          renderItem={renderStatsItem}
          renderSectionHeader={({ section }) => (
            <View style={[section.key === 'completed' ? styles.shiftsList : styles.plannedList, ui.card]}>
              <Text style={[styles.shiftsListTitle, ui.sectionTitle]}>{section.title}</Text>
            </View>
          )}
          ListHeaderComponent={statsListHeader}
          ListEmptyComponent={
            !hasAnyData ? (
              <View style={styles.emptyContainer}>
                <Zap size={48} color={colors.grayLighter} />
                <Text style={[styles.emptyText, { color: screen.textSecondary }]}>{t('screens.statistics.empty')}</Text>
                <Text style={[styles.emptySubtext, { color: screen.textSecondary }]}>
                  {t('screens.statistics.emptyHint')}
                </Text>
              </View>
            ) : null
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          {...FLAT_LIST_PERF}
        />
      </ThemedSafeAreaView>
    </PermissionGate>
  );
}

const styles = StyleSheet.create({
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 8,
    gap: 20,
  },
  monthArrow: { padding: 8 },
  monthArrowText: { fontSize: 20, color: colors.primary },
  monthText: { fontSize: 18, fontWeight: 'bold' },
  pvzHint: {
    textAlign: 'center',
    fontSize: 13,
    marginBottom: 12,
  },
  mainCard: {
    backgroundColor: colors.primary,
    marginHorizontal: 16,
    borderRadius: 24,
    padding: 20,
    marginBottom: 12,
  },
  mainCardLabel: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: 4 },
  mainCardValue: { fontSize: 34, fontWeight: 'bold', color: '#FFFFFF' },
  mainCardHint: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 6 },
  breakdownCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  breakdownTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  breakdownLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  breakdownLabel: { fontSize: 14 },
  breakdownValue: { fontSize: 14, fontWeight: '600' },
  breakdownNegative: { color: colors.danger },
  breakdownPositive: { color: colors.success },
  simpleStats: {
    flexDirection: 'row',
    marginHorizontal: 16,
    borderRadius: 20,
    paddingVertical: 16,
    marginBottom: 6,
  },
  simpleStatItem: { flex: 1, alignItems: 'center', gap: 6 },
  simpleStatValue: { fontSize: 18, fontWeight: 'bold' },
  simpleStatLabel: { fontSize: 12 },
  simpleDivider: { width: 1, height: 40 },
  statsNote: {
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 12,
    marginHorizontal: 16,
  },
  avgCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  avgLabel: { fontSize: 14 },
  avgValue: { fontSize: 18, fontWeight: 'bold' },
  bestDayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
  },
  bestDayIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF8E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  bestDayInfo: { flex: 1 },
  bestDayLabel: { fontSize: 12, marginBottom: 2 },
  bestDayDate: { fontSize: 14, fontWeight: '500' },
  bestDayAmount: { fontSize: 16, fontWeight: 'bold', color: colors.success },
  shiftsList: {
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  },
  plannedList: {
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 16,
    marginBottom: 30,
  },
  shiftsListTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  shiftItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  shiftLeft: { flexDirection: 'row', gap: 16, alignItems: 'center', flex: 1 },
  shiftDate: { fontSize: 14, width: 65 },
  shiftHours: { fontSize: 13, flex: 1 },
  shiftEarnings: { fontSize: 14, fontWeight: '600', color: colors.success },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingBottom: 40 },
  emptyText: { fontSize: 16, marginTop: 16 },
  emptySubtext: { fontSize: 12, marginTop: 4, textAlign: 'center', paddingHorizontal: 32 },
});
