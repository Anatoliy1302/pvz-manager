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
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../constants/colors';
import StorageService from '../../services/StorageService';
import DataService from '../../services/DataService';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import ScreenHeader from '../../components/common/ScreenHeader';
import EmptyState from '../../components/common/EmptyState';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { syncShiftStatusesInStorage } from '../../services/PaymentService';
import { isSamePvz } from '../../utils/supabaseHelpers';
import {
  calcShiftHours,
  getShiftDisplayStatus,
  getShiftStatusLabel,
  ShiftDisplayStatus,
} from '../../utils/employeeStatsHelpers';
import { calculateShiftEarningsForEmployee } from '../../utils/salaryRateHelpers';
import { getMonthRange } from '../../utils/dateHelpers';
import { getDateLocale } from '../../i18n';
import { Calendar, Clock, MapPin, ChevronLeft, ChevronRight } from 'lucide-react-native';
import MoneyIcon from '../../components/icons/MoneyIcon';

interface HistoryShift {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  hours: number;
  earnings: number;
  status: ShiftDisplayStatus;
  pvzName?: string;
  corrected?: boolean;
}

const STATUS_COLORS: Record<ShiftDisplayStatus, string> = {
  completed: colors.success,
  paid: '#2196F3',
  planned: colors.warning,
  active: colors.primary,
};

function formatShiftDate(dateString: string): string {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(getDateLocale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatMonthLabel(year: number, month: number): string {
  const label = new Date(year, month, 1).toLocaleDateString(getDateLocale(), {
    month: 'long',
    year: 'numeric',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function ShiftHistoryScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { user, pvz } = useAuth();
  const { screen, ui } = useThemedScreen();
  const [shifts, setShifts] = useState<HistoryShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [periodYear, setPeriodYear] = useState(() => new Date().getFullYear());
  const [periodMonth, setPeriodMonth] = useState(() => new Date().getMonth());
  const [showAllTime, setShowAllTime] = useState(false);

  const pvzId = pvz?.id || user?.pvzId || '';
  const periodRange = getMonthRange(periodYear, periodMonth);
  const hoursShort = t('common.stats.hoursShort');
  const currency = t('common.money.currency');

  const loadShifts = async () => {
    if (!user?.id || !pvzId) return;

    try {
      await syncShiftStatusesInStorage();
      const allShifts = await DataService.getShifts();
      const historyRaw = await StorageService.getItem('shifts_history');
      const historyRecords: Array<{
        id: string;
        employeeId: string;
        date: string;
        startTime: string;
        endTime: string;
        duration?: number;
        earnings?: number;
        pvzId?: string;
        pvzName?: string;
        corrected?: boolean;
      }> = historyRaw ? JSON.parse(historyRaw) : [];

      const rows: HistoryShift[] = [];
      const seen = new Set<string>();

      for (const shift of allShifts) {
        if (shift.employeeId !== user.id) continue;
        if (!(await isSamePvz(shift.pvzId, pvzId))) continue;
        if (!showAllTime && (shift.date < periodRange.start || shift.date > periodRange.end)) continue;

        const status = getShiftDisplayStatus(shift);
        if (status === 'planned' || status === 'active') continue;

        let earnings = shift.earnings || 0;
        if (!earnings) {
          earnings = await calculateShiftEarningsForEmployee(user.id, pvzId, shift);
        }

        const key = `${shift.employeeId}_${shift.date}_${shift.id}`;
        seen.add(key);
        rows.push({
          id: shift.id,
          date: shift.date,
          startTime: shift.startTime,
          endTime: shift.endTime,
          hours: calcShiftHours(shift),
          earnings,
          status,
          pvzName: shift.pvzName || pvz?.name,
          corrected: false,
        });
      }

      for (const record of historyRecords) {
        if (record.employeeId !== user.id) continue;
        if (record.pvzId && !(await isSamePvz(record.pvzId, pvzId))) continue;
        if (!showAllTime && (record.date < periodRange.start || record.date > periodRange.end)) continue;

        const key = `${record.employeeId}_${record.date}_${record.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        rows.push({
          id: record.id,
          date: record.date,
          startTime: record.startTime,
          endTime: record.endTime,
          hours: record.duration ? record.duration / 3600 : calcShiftHours(record),
          earnings: record.earnings || 0,
          status: 'completed',
          pvzName: record.pvzName || pvz?.name,
          corrected: record.corrected,
        });
      }

      rows.sort((a, b) => b.date.localeCompare(a.date));
      setShifts(rows);
    } catch (error) {
      console.error('Ошибка загрузки истории смен:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadShifts();
      const unsubHistory = DataService.subscribe('shifts_history', loadShifts);
      const unsubShifts = DataService.subscribe('shifts', loadShifts);
      return () => {
        unsubHistory();
        unsubShifts();
      };
    }, [user?.id, pvzId, periodYear, periodMonth, showAllTime])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadShifts();
    setRefreshing(false);
  };

  const shiftMonth = (delta: number) => {
    const next = new Date(periodYear, periodMonth + delta, 1);
    setPeriodYear(next.getFullYear());
    setPeriodMonth(next.getMonth());
    setShowAllTime(false);
  };

  const summary = useMemo(() => {
    const totalHours = shifts.reduce((sum, s) => sum + s.hours, 0);
    const totalEarnings = shifts.reduce((sum, s) => sum + s.earnings, 0);
    return {
      count: shifts.length,
      hours: Math.round(totalHours * 10) / 10,
      earnings: Math.round(totalEarnings),
    };
  }, [shifts]);

  const renderShift = ({ item }: { item: HistoryShift }) => (
    <View style={[styles.shiftCard, ui.card]}>
      <View style={styles.shiftHeader}>
        <Text style={[styles.shiftDate, { color: screen.text }]}>{formatShiftDate(item.date)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] + '20' }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] }]}>
            {getShiftStatusLabel(item.status)}
          </Text>
        </View>
      </View>

      <View style={styles.shiftRow}>
        <Clock size={16} color={screen.textSecondary} />
        <Text style={[styles.shiftDetail, { color: screen.textSecondary }]}>
          {item.startTime} — {item.endTime} ·{' '}
          {item.hours.toLocaleString(getDateLocale(), { maximumFractionDigits: 1 })} {hoursShort}
        </Text>
      </View>

      {(item.pvzName || pvz?.name) && (
        <View style={styles.shiftRow}>
          <MapPin size={16} color={screen.textSecondary} />
          <Text style={[styles.shiftDetail, { color: screen.textSecondary }]}>
            {item.pvzName || pvz?.name}
          </Text>
        </View>
      )}

      <View style={styles.shiftFooter}>
        {item.earnings > 0 && (
          <View style={styles.earningsBadge}>
            <MoneyIcon size={14} color={colors.success} />
            <Text style={styles.earningsText}>
              {item.earnings.toLocaleString(getDateLocale())} {currency}
            </Text>
          </View>
        )}
        {item.corrected && (
          <Text style={[styles.correctedLabel, { color: screen.textSecondary }]}>
            {t('screens.shiftHistory.corrected')}
          </Text>
        )}
      </View>
    </View>
  );

  return (
    <ThemedSafeAreaView style={styles.container}>
      <LoadingSpinner visible={loading && shifts.length === 0} text={t('common.loading.default')} />
      <ScreenHeader title={t('screens.profile.shiftHistory')} onBack={() => navigation.goBack()} />

      <View style={[styles.filterRow, ui.card]}>
        <TouchableOpacity
          style={[styles.filterChip, showAllTime && styles.filterChipActive]}
          onPress={() => setShowAllTime(true)}
        >
          <Text style={[styles.filterChipText, showAllTime && styles.filterChipTextActive]}>
            {t('common.filters.all')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, !showAllTime && styles.filterChipActive]}
          onPress={() => setShowAllTime(false)}
        >
          <Text style={[styles.filterChipText, !showAllTime && styles.filterChipTextActive]}>
            {t('common.period.month')}
          </Text>
        </TouchableOpacity>
      </View>

      {!showAllTime && (
        <View style={[styles.monthRow, ui.card]}>
          <TouchableOpacity style={styles.monthNav} onPress={() => shiftMonth(-1)}>
            <ChevronLeft size={22} color={colors.primary} />
          </TouchableOpacity>
          <Text style={[styles.monthLabel, { color: screen.text }]}>
            {formatMonthLabel(periodYear, periodMonth)}
          </Text>
          <TouchableOpacity style={styles.monthNav} onPress={() => shiftMonth(1)}>
            <ChevronRight size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>
      )}

      {shifts.length > 0 && (
        <View style={[styles.summaryCard, ui.card]}>
          <Text style={[styles.summaryText, { color: screen.textSecondary }]}>
            {t('screens.shiftHistory.summary', {
              count: summary.count,
              hours: summary.hours,
              earnings: `${summary.earnings.toLocaleString(getDateLocale())} ${currency}`,
            })}
          </Text>
          <Text style={[styles.summaryHint, { color: screen.textSecondary }]}>
            {t('screens.shiftHistory.summaryHint')}
          </Text>
        </View>
      )}

      {!loading && shifts.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title={t('screens.shiftHistory.emptyTitle')}
          description={
            showAllTime
              ? t('screens.shiftHistory.emptyAll')
              : t('screens.shiftHistory.emptyMonth')
          }
        />
      ) : (
        <FlatList
          data={shifts}
          keyExtractor={(item) => item.id}
          renderItem={renderShift}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        />
      )}
    </ThemedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 6,
    borderRadius: 14,
  },
  filterChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  filterChipActive: { backgroundColor: colors.primary },
  filterChipText: { fontSize: 13, fontWeight: '500', color: colors.gray },
  filterChipTextActive: { color: '#FFFFFF' },

  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 14,
  },
  monthNav: { padding: 8 },
  monthLabel: { fontSize: 15, fontWeight: '600' },

  summaryCard: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 14,
    gap: 4,
  },
  summaryText: { fontSize: 13 },
  summaryHint: { fontSize: 11, lineHeight: 16 },

  listContent: { padding: 16, gap: 12, paddingBottom: 32 },
  shiftCard: { borderRadius: 16, padding: 16, gap: 8 },
  shiftHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  shiftDate: { fontSize: 15, fontWeight: '600', flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '600' },
  shiftRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shiftDetail: { fontSize: 14, flex: 1 },
  shiftFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  earningsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  earningsText: { fontSize: 13, fontWeight: '600', color: colors.success },
  correctedLabel: { fontSize: 11, fontStyle: 'italic' },
});
