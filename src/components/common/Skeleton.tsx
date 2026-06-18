import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, ViewStyle } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width = '100%', height = 16, borderRadius = 8, style }: SkeletonProps) {
  const { theme } = useTheme();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  const baseColor = theme === 'dark' ? '#3A3A3A' : '#E8E8E8';

  return (
    <Animated.View
      style={[{ width, height, borderRadius, backgroundColor: baseColor, opacity }, style]}
    />
  );
}

interface SkeletonListProps {
  rows?: number;
  gap?: number;
}

/** Универсальный список строк (аватар + 2 строки текста). */
export function SkeletonList({ rows = 4, gap = 12 }: SkeletonListProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.list}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Skeleton width={48} height={48} borderRadius={24} />
          <View style={styles.rowText}>
            <Skeleton width="60%" height={14} />
            <Skeleton width="40%" height={12} style={{ marginTop: gap / 2 }} />
          </View>
          <Skeleton width={64} height={14} />
        </View>
      ))}
    </View>
  );
}

/** Главный экран: баннер + статистика + плитки действий. */
export function DashboardSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={styles.dashboard}>
      <View style={[styles.dashboardBanner, { backgroundColor: colors.card }]}>
        <Skeleton width={56} height={56} borderRadius={28} style={styles.dashboardAvatar} />
        <Skeleton width="50%" height={20} style={styles.dashboardCenter} />
        <Skeleton width="35%" height={14} style={styles.dashboardCenter} />
        <Skeleton width="45%" height={14} style={styles.dashboardCenter} />
        <View style={[styles.dashboardStats, { backgroundColor: colors.surface }]}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.dashboardStatItem}>
              <Skeleton width={32} height={18} />
              <Skeleton width={48} height={10} style={{ marginTop: 6 }} />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.dashboardTiles}>
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i} style={[styles.dashboardTile, { backgroundColor: colors.card }]}>
            <Skeleton width={40} height={40} borderRadius={12} />
            <Skeleton width="70%" height={12} style={{ marginTop: 8 }} />
          </View>
        ))}
      </View>

      <View style={[styles.dashboardSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Skeleton width="60%" height={16} />
        {Array.from({ length: 3 }).map((_, i) => (
          <View key={i} style={styles.dashboardSectionRow}>
            <Skeleton width="45%" height={14} />
            <Skeleton width={72} height={14} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** Расписание / список смен: панель управления + сетка. */
export function ScheduleSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={styles.schedule}>
      <View style={[styles.scheduleControls, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Skeleton width={120} height={36} borderRadius={18} />
        <Skeleton width={80} height={36} borderRadius={18} />
        <Skeleton width={80} height={36} borderRadius={18} />
      </View>

      <View style={[styles.scheduleHeaderRow, { borderColor: colors.border }]}>
        <Skeleton width={80} height={14} />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} width={36} height={14} />
        ))}
      </View>

      {Array.from({ length: 6 }).map((_, row) => (
        <View key={row} style={[styles.scheduleRow, { borderColor: colors.border }]}>
          <Skeleton width={72} height={14} />
          {Array.from({ length: 5 }).map((_, col) => (
            <Skeleton key={col} width={36} height={36} borderRadius={8} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Экран зарплаты: период + сводка + список сотрудников. */
export function PayrollSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={styles.payroll}>
      <View style={[styles.payrollPeriod, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Skeleton width={32} height={32} borderRadius={16} />
        <View style={styles.payrollPeriodCenter}>
          <Skeleton width="55%" height={16} />
          <Skeleton width="75%" height={12} style={{ marginTop: 8 }} />
        </View>
        <Skeleton width={32} height={32} borderRadius={16} />
      </View>

      <View style={[styles.payrollSummary, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.payrollSummaryItem}>
            <Skeleton width={24} height={24} borderRadius={12} />
            <Skeleton width={48} height={10} style={{ marginTop: 6 }} />
            <Skeleton width={64} height={16} style={{ marginTop: 4 }} />
          </View>
        ))}
      </View>

      <Skeleton width="40%" height={16} style={styles.payrollSectionTitle} />
      <SkeletonList rows={5} />
    </View>
  );
}

/** Список сотрудников: поиск + фильтры + строки. */
export function EmployeesListSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={styles.employees}>
      <Skeleton
        width="100%"
        height={44}
        borderRadius={12}
        style={[styles.employeesSearch, { backgroundColor: colors.surface }]}
      />
      <View style={styles.employeesFilters}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} width={72} height={32} borderRadius={16} />
        ))}
      </View>
      <View style={styles.employeesStats}>
        <Skeleton width="45%" height={14} />
        <Skeleton width="30%" height={14} />
      </View>
      <SkeletonList rows={6} />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  rowText: { flex: 1 },

  dashboard: { paddingBottom: 24 },
  dashboardBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
  },
  dashboardAvatar: { marginBottom: 12 },
  dashboardCenter: { marginBottom: 8 },
  dashboardStats: {
    flexDirection: 'row',
    width: '100%',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    marginTop: 12,
    justifyContent: 'space-around',
  },
  dashboardStatItem: { alignItems: 'center', flex: 1 },
  dashboardTiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    marginTop: 16,
    gap: 8,
    justifyContent: 'space-between',
  },
  dashboardTile: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardSection: {
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  dashboardSectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },

  schedule: { padding: 16, gap: 12 },
  scheduleControls: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  scheduleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  payroll: { paddingBottom: 24 },
  payrollPeriod: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  payrollPeriodCenter: { flex: 1, alignItems: 'center' },
  payrollSummary: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'space-around',
  },
  payrollSummaryItem: { alignItems: 'center', flex: 1 },
  payrollSectionTitle: { marginHorizontal: 16, marginTop: 20, marginBottom: 4 },

  employees: { flex: 1 },
  employeesSearch: { marginHorizontal: 16, marginTop: 8 },
  employeesFilters: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
  },
  employeesStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
  },
});
