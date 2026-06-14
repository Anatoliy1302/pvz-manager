// src/screens/employee/EmployeeHomeScreen.tsx
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import AnimatedBanner from '../../components/common/AnimatedBanner';
import DashboardActionTiles, { DashboardActionTile } from '../../components/common/DashboardActionTiles';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../../context/AuthContext';
import DataService from '../../services/DataService';
import { loadEmployeeMonthStats } from '../../utils/employeeStatsHelpers';
import { formatPhoneForDisplay } from '../../utils/phoneHelpers';
import { colors } from '../../constants/colors';
import { safeParseJson } from '../../utils/safeJson';
import type { NotificationRecord } from '../../services/NotificationService';
import {
  CalendarDays,
  Repeat,
  Bell,
  User,
  Phone,
  ClipboardList,
  FileText,
  Building2,
  Users,
  ListChecks,
  Wallet,
  History,
} from 'lucide-react-native';

export default function EmployeeHomeScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { user, pvz, hasPermission } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    totalHours: 0,
    totalShifts: 0,
    totalEarned: 0,
  });
  const [unreadCount, setUnreadCount] = useState(0);

  const loadStats = async () => {
    if (!user?.id) return;

    try {
      const monthStats = await loadEmployeeMonthStats(
        user.id,
        pvz?.id || user.pvzId || '',
        new Date()
      );

      setStats({
        totalHours: monthStats.totalHours,
        totalShifts: monthStats.totalShifts,
        totalEarned: monthStats.totalEarned,
      });

      const notifRaw = await SecureStore.getItemAsync('notifications');
      const notifications = safeParseJson<NotificationRecord[]>(notifRaw ?? '[]', []);
      setUnreadCount(notifications.filter((n: any) => !n.isRead).length);
    } catch (error) {
      console.error('Ошибка загрузки статистики:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadStats();
      const unsubBalance = DataService.subscribe('employee_balance', loadStats);
      const unsubShifts = DataService.subscribe('shifts', loadStats);
      return () => {
        unsubBalance();
        unsubShifts();
      };
    }, [user?.id, pvz?.id])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  const quickActions = [
    hasPermission('canManageSchedule') && {
      icon: CalendarDays,
      label: t('screens.dashboard.employee.schedule'),
      onPress: () => navigation.navigate('Schedule'),
      gradient: ['#4CAF50', '#388E3C'] as [string, string],
    },
    hasPermission('canViewShifts') &&
      !hasPermission('canManageSchedule') && {
        icon: CalendarDays,
        label: t('screens.dashboard.employee.schedule'),
        onPress: () => navigation.navigate('EmployeeSchedule'),
        gradient: ['#4CAF50', '#388E3C'] as [string, string],
      },
    hasPermission('canSwapShifts') && {
      icon: Repeat,
      label: t('screens.dashboard.employee.mySwaps'),
      onPress: () => navigation.navigate('SwapNotifications'),
      gradient: ['#2196F3', '#1565C0'] as [string, string],
    },
    hasPermission('canRequestShifts') && {
      icon: ClipboardList,
      label: t('screens.dashboard.employee.requests'),
      onPress: () => navigation.navigate('Requests'),
      gradient: ['#00BCD4', '#00838F'] as [string, string],
    },
    {
      icon: FileText,
      label: t('screens.dashboard.employee.timesheet'),
      onPress: () => navigation.navigate('Timesheet'),
      gradient: ['#5C6BC0', '#3949AB'] as [string, string],
    },
    {
      icon: Wallet,
      label: t('screens.dashboard.employee.finance'),
      onPress: () => navigation.navigate('EmployeeFinance'),
      gradient: ['#26A69A', '#00796B'] as [string, string],
    },
    {
      icon: History,
      label: t('screens.dashboard.employee.shiftHistory'),
      onPress: () => navigation.navigate('ShiftHistory'),
      gradient: ['#7E57C2', '#5E35B1'] as [string, string],
    },
    {
      icon: Bell,
      label: t('screens.dashboard.employee.notifications'),
      onPress: () => navigation.navigate('Notifications'),
      gradient: ['#FF9800', '#E65100'] as [string, string],
      badge: unreadCount,
    },
    hasPermission('canManageEmployees') && {
      icon: Users,
      label: t('screens.dashboard.employee.employees'),
      onPress: () => navigation.navigate('Employees'),
      gradient: [colors.primary, colors.primaryDark] as [string, string],
    },
    hasPermission('canViewRequests') && {
      icon: ListChecks,
      label: t('screens.dashboard.employee.pvzRequests'),
      onPress: () => navigation.navigate('ShiftRequests'),
      gradient: ['#FFA726', '#EF6C00'] as [string, string],
    },
  ].filter(Boolean) as DashboardActionTile[];

  const showBannerStats = hasPermission('canViewStats');

  return (
    <ThemedSafeAreaView>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <AnimatedBanner
          height={showBannerStats ? 240 : 200}
          delay={0}
        >
          <View style={styles.bannerContent}>
            <View style={styles.bannerAvatar}>
              <User size={32} color="#FFFFFF" />
            </View>
            <Text style={styles.bannerName}>{user?.name || t('common.roles.employeeShort')}</Text>
            <View style={styles.bannerPhoneRow}>
              <Phone size={12} color="rgba(255,255,255,0.8)" />
              <Text style={styles.bannerPhone}>
                {formatPhoneForDisplay(user?.phone || '')}
              </Text>
            </View>
            {pvz?.name && (
              <View style={styles.bannerPvzRow}>
                <Building2 size={14} color="rgba(255,255,255,0.8)" />
                <Text style={styles.bannerPvzName}>{pvz.name}</Text>
              </View>
            )}
            {showBannerStats && (
              <View style={styles.bannerStats}>
                <View style={styles.bannerStatItem}>
                  <Text style={styles.bannerStatValue}>{stats.totalHours}</Text>
                  <Text style={styles.bannerStatLabel}>{t('common.stats.hours')}</Text>
                </View>
                <View style={styles.bannerStatDivider} />
                <View style={styles.bannerStatItem}>
                  <Text style={styles.bannerStatValue}>{stats.totalShifts}</Text>
                  <Text style={styles.bannerStatLabel}>{t('common.stats.shifts')}</Text>
                </View>
                <View style={styles.bannerStatDivider} />
                <View style={styles.bannerStatItem}>
                  <Text style={styles.bannerStatValue}>
                    {stats.totalEarned >= 1000
                      ? `${Math.round(stats.totalEarned / 1000)}к`
                      : stats.totalEarned}
                  </Text>
                  <Text style={styles.bannerStatLabel}>{t('common.stats.earned')}</Text>
                </View>
              </View>
            )}
          </View>
        </AnimatedBanner>

        <DashboardActionTiles actions={quickActions} />

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </ThemedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  bannerContent: { alignItems: 'center', paddingTop: 8 },
  bannerAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  bannerName: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  bannerPhoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  bannerPhone: { fontSize: 13, color: 'rgba(255,255,255,0.85)' },
  bannerPvzRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  bannerPvzName: { fontSize: 14, color: 'rgba(255,255,255,0.9)' },
  bannerStats: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 8,
    width: '100%',
  },
  bannerStatItem: { flex: 1, alignItems: 'center', gap: 2 },
  bannerStatValue: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF' },
  bannerStatLabel: { fontSize: 10, color: 'rgba(255,255,255,0.8)' },
  bannerStatDivider: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.2)' },
  bottomSpacer: { height: 30 },
});
