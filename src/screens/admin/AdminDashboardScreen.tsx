// src/screens/admin/AdminDashboardScreen.tsx
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import AnimatedBanner from '../../components/common/AnimatedBanner';
import DashboardActionTiles, { DashboardActionTile } from '../../components/common/DashboardActionTiles';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../constants/colors';
import DataService from '../../services/DataService';
import notificationService from '../../services/NotificationService';
import { formatPhoneForDisplay } from '../../utils/phoneHelpers';
import { toDateKey } from '../../utils/dateHelpers';
import { countPendingSwapsForPvz } from '../../utils/swapRequestHelpers';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { Shift, User } from '../../types/user';
import {
  Building2,
  ChevronDown,
  UserPlus,
  Bell,
  AlertCircle,
  ListChecks,
  Phone,
  CalendarDays,
  Shield,
  Repeat,
} from 'lucide-react-native';

function userWorksAtPvz(u: User, pvzId: string): boolean {
  if (u.pvzId === pvzId) return true;
  return u.pvzIds?.includes(pvzId) ?? false;
}

export default function AdminDashboardScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { user, pvz, userPvzs, switchPvz, hasPermission } = useAuth();
  const { colors: themeColors, screen } = useThemedScreen();
  const styles = createStyles(screen);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingSwapCount, setPendingSwapCount] = useState(0);
  const [stats, setStats] = useState({
    shiftsToday: 0,
    activeEmployees: 0,
    pendingRequests: 0,
  });
  const [selectedPvzId, setSelectedPvzId] = useState(pvz?.id || '');
  const [showPvzDropdown, setShowPvzDropdown] = useState(false);
  const [todayShifts, setTodayShifts] = useState<Shift[]>([]);

  const canManageEmployees = hasPermission('canManageEmployees');
  const canViewRequests = hasPermission('canViewRequests');
  const canManageSchedule =
    hasPermission('canManageSchedule') || hasPermission('canManageShifts');
  const canModerateSwaps = canManageSchedule;
  const canViewShifts = hasPermission('canViewShifts');
  const canOpenSchedule = canManageSchedule || canViewShifts;
  useFocusEffect(
    useCallback(() => {
      if (pvz?.id) setSelectedPvzId(pvz.id);
    }, [pvz?.id])
  );

  const loadDashboardData = async () => {
    try {
      const currentPvzId = selectedPvzId || pvz?.id;
      if (!currentPvzId) return;

      const allShifts = await DataService.getShifts();
      const today = toDateKey(new Date());

      const todayPvzShifts = allShifts.filter(
        (s) => s.pvzId === currentPvzId && s.date === today
      );
      setTodayShifts(todayPvzShifts);

      const users = await DataService.getUsers();
      const activeEmployees = users.filter(
        (u) =>
          u.status === 'active' &&
          u.role !== 'owner' &&
          userWorksAtPvz(u, currentPvzId)
      );

      const allRequests = await DataService.getAllShiftRequests();
      const pendingRequests = allRequests.filter((r: any) => {
        if (r.status !== 'pending') return false;
        if (r.pvzId) return r.pvzId === currentPvzId;
        const employee = users.find((u) => u.id === r.employeeId);
        if (!employee) return false;
        return employee.pvzId === currentPvzId || employee.pvzIds?.includes(currentPvzId);
      });

      if (user?.id) {
        const notifications = await notificationService.getNotifications(user.id);
        setUnreadCount(notifications.filter((n) => !n.isRead).length);
      }

      if (canModerateSwaps && currentPvzId) {
        const pendingSwaps = await countPendingSwapsForPvz(currentPvzId);
        setPendingSwapCount(pendingSwaps);
      } else {
        setPendingSwapCount(0);
      }

      setStats({
        shiftsToday: todayPvzShifts.length,
        activeEmployees: activeEmployees.length,
        pendingRequests: pendingRequests.length,
      });
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        notificationService.deliverPendingStaffAlerts(user.id);
      }
      loadDashboardData();
      const unsubUsers = DataService.subscribe('pvz_users', loadDashboardData);
      const unsubShifts = DataService.subscribe('shifts', loadDashboardData);
      const unsubRequests = DataService.subscribe('all_shift_requests', loadDashboardData);
      const unsubSwaps = pvz?.id
        ? DataService.subscribe(`swap_requests_${pvz.id}`, loadDashboardData)
        : () => {};
      const unsubNotifications = DataService.subscribe('notifications', loadDashboardData);
      const unsubUserNotifications = user?.id
        ? DataService.subscribe(`notifications_${user.id}`, loadDashboardData)
        : () => {};
      return () => {
        unsubUsers();
        unsubShifts();
        unsubRequests();
        unsubSwaps();
        unsubNotifications();
        unsubUserNotifications();
      };
    }, [selectedPvzId, pvz?.id, user?.id])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const openSchedule = () => {
    if (canOpenSchedule) navigation.navigate('Schedule');
  };

  const quickActions = [
    canManageSchedule && {
      icon: CalendarDays,
      label: t('screens.dashboard.admin.schedule'),
      onPress: () => navigation.navigate('Schedule'),
      gradient: ['#4CAF50', '#388E3C'] as [string, string],
    },
    canViewShifts &&
      !canManageSchedule && {
        icon: CalendarDays,
        label: t('screens.dashboard.admin.shifts'),
        onPress: () => navigation.navigate('Schedule'),
        gradient: ['#4CAF50', '#388E3C'] as [string, string],
      },
    canManageEmployees && {
      icon: UserPlus,
      label: t('screens.dashboard.admin.employee'),
      onPress: () => navigation.navigate('AdminEmployeeAddForm'),
      gradient: ['#2196F3', '#1565C0'] as [string, string],
    },
    canViewRequests && {
      icon: ListChecks,
      label: t('screens.dashboard.admin.requests'),
      onPress: () => navigation.navigate('ShiftRequests'),
      gradient: ['#FF9800', '#E65100'] as [string, string],
      badge: stats.pendingRequests,
    },
    canModerateSwaps && {
      icon: Repeat,
      label: t('screens.dashboard.admin.swaps'),
      onPress: () => navigation.navigate('SwapRequests'),
      gradient: ['#2196F3', '#1565C0'] as [string, string],
      badge: pendingSwapCount,
    },
    {
      icon: Bell,
      label: t('screens.dashboard.admin.notifications'),
      onPress: () => navigation.navigate('Notifications'),
      gradient: ['#00BCD4', '#00838F'] as [string, string],
      badge: unreadCount,
    },
  ].filter(Boolean) as DashboardActionTile[];

  const bannerStatItems = [
    {
      key: 'shifts',
      value: stats.shiftsToday,
      label: t('common.stats.shifts'),
      visible: canOpenSchedule,
    },
    {
      key: 'employees',
      value: stats.activeEmployees,
      label: t('common.stats.employeesAlt'),
      visible: canManageEmployees,
      onPress: () => navigation.navigate('Employees'),
    },
    {
      key: 'requests',
      value: stats.pendingRequests,
      label: t('screens.dashboard.admin.requestsStat'),
      visible: canViewRequests,
      onPress: () => navigation.navigate('ShiftRequests'),
    },
  ].filter((item) => item.visible);

  const displayPvzName = pvz?.name || userPvzs?.[0]?.name;
  const hasMultiplePvzs = (userPvzs?.length ?? 0) > 1;
  const bannerHeight = bannerStatItems.length > 0 ? 240 : 200;

  return (
    <ThemedSafeAreaView>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={themeColors.primary}
            colors={[themeColors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <AnimatedBanner height={bannerHeight} delay={0}>
          <View style={styles.bannerContent}>
            <View style={styles.bannerAvatar}>
              <Shield size={32} color="#FFFFFF" />
            </View>
            <Text style={styles.bannerName}>{user?.name || t('common.roles.admin')}</Text>
            <View style={styles.bannerPhoneRow}>
              <Phone size={12} color="rgba(255,255,255,0.8)" />
              <Text style={styles.bannerPhone}>
                {formatPhoneForDisplay(user?.phone || '')}
              </Text>
            </View>
            {displayPvzName && (
              <View style={styles.pvzBlock}>
                {hasMultiplePvzs ? (
                  <>
                    <TouchableOpacity
                      style={styles.bannerPvzRow}
                      onPress={() => setShowPvzDropdown(!showPvzDropdown)}
                      activeOpacity={0.8}
                    >
                      <Building2 size={14} color="rgba(255,255,255,0.8)" />
                      <Text style={styles.bannerPvzName}>{displayPvzName}</Text>
                      <ChevronDown
                        size={16}
                        color="rgba(255,255,255,0.8)"
                        style={showPvzDropdown ? styles.chevronOpen : undefined}
                      />
                    </TouchableOpacity>
                    <Text style={styles.pvzHint}>
                      {t('common.pvz.countSwitchHint', { count: userPvzs.length })}
                    </Text>
                    {showPvzDropdown && (
                      <View style={styles.pvzDropdown}>
                        {userPvzs.map((item) => (
                          <TouchableOpacity
                            key={item.id}
                            style={styles.pvzDropdownItem}
                            onPress={async () => {
                              setShowPvzDropdown(false);
                              setSelectedPvzId(item.id);
                              await switchPvz(item.id);
                            }}
                          >
                            <Text
                              style={[
                                styles.pvzDropdownText,
                                item.id === pvz?.id && styles.pvzDropdownTextActive,
                              ]}
                            >
                              {item.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </>
                ) : (
                  <View style={styles.bannerPvzRow}>
                    <Building2 size={14} color="rgba(255,255,255,0.8)" />
                    <Text style={styles.bannerPvzName}>{displayPvzName}</Text>
                  </View>
                )}
              </View>
            )}
            {bannerStatItems.length > 0 && (
              <View style={styles.bannerStats}>
                {bannerStatItems.map((item, index) => {
                  const StatWrapper = item.onPress ? TouchableOpacity : View;
                  return (
                    <React.Fragment key={item.key}>
                      {index > 0 && <View style={styles.bannerStatDivider} />}
                      <StatWrapper
                        style={styles.bannerStatItem}
                        onPress={item.onPress}
                        activeOpacity={item.onPress ? 0.7 : 1}
                      >
                        <Text style={styles.bannerStatValue}>{item.value}</Text>
                        <Text style={styles.bannerStatLabel}>{item.label}</Text>
                      </StatWrapper>
                    </React.Fragment>
                  );
                })}
              </View>
            )}
          </View>
        </AnimatedBanner>

        {quickActions.length > 0 ? (
          <DashboardActionTiles actions={quickActions} />
        ) : (
          <View style={styles.emptyQuickActions}>
            <Text style={styles.emptyQuickActionsText}>
              {t('common.access.noActions')}
            </Text>
          </View>
        )}

        {canOpenSchedule && (
          <TouchableOpacity
            style={styles.sectionCard}
            onPress={openSchedule}
            activeOpacity={0.7}
          >
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('screens.dashboard.admin.todayShifts')}</Text>
              <Text style={styles.sectionLink}>{t('screens.dashboard.admin.scheduleLink')}</Text>
            </View>
            {todayShifts.length === 0 ? (
              <View style={styles.emptySection}>
                <AlertCircle size={24} color={screen.textSecondary} />
                <Text style={styles.emptySectionText}>{t('screens.dashboard.admin.noShiftsToday')}</Text>
              </View>
            ) : (
              todayShifts.map((shift, index) => (
                <View
                  key={shift.id}
                  style={[
                    styles.todayShiftItem,
                    index === todayShifts.length - 1 && styles.todayShiftItemLast,
                  ]}
                >
                  <Text style={styles.todayShiftName}>{shift.employeeName}</Text>
                  <Text style={styles.todayShiftTime}>
                    {shift.startTime} — {shift.endTime}
                  </Text>
                </View>
              ))
            )}
          </TouchableOpacity>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </ThemedSafeAreaView>
  );
}

const createStyles = (screen: ReturnType<typeof useThemedScreen>['screen']) =>
  StyleSheet.create({
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
    pvzBlock: { width: '100%', alignItems: 'center', marginBottom: 16 },
    bannerPvzRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    bannerPvzName: { fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
    pvzHint: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 4 },
    chevronOpen: { transform: [{ rotate: '180deg' }] },
    pvzDropdown: {
      marginTop: 10,
      marginBottom: 4,
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderRadius: 12,
      overflow: 'hidden',
      minWidth: 200,
    },
    pvzDropdownItem: { paddingVertical: 10, paddingHorizontal: 14 },
    pvzDropdownText: { fontSize: 14, color: '#333' },
    pvzDropdownTextActive: { color: colors.primary, fontWeight: '600' },
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

    emptyQuickActions: {
      marginHorizontal: 16,
      marginTop: 20,
      padding: 16,
      backgroundColor: screen.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: screen.border,
    },
    emptyQuickActionsText: {
      fontSize: 13,
      color: screen.textSecondary,
      textAlign: 'center',
    },

    sectionCard: {
      backgroundColor: screen.card,
      marginHorizontal: 16,
      marginTop: 20,
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: screen.border,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    sectionTitle: { fontSize: 15, fontWeight: '600', color: screen.text },
    sectionLink: { fontSize: 12, color: colors.primary, fontWeight: '500' },
    emptySection: { alignItems: 'center', paddingVertical: 20, gap: 8 },
    emptySectionText: { fontSize: 14, color: screen.textSecondary },

    todayShiftItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: screen.border,
    },
    todayShiftItemLast: {
      borderBottomWidth: 0,
    },
    todayShiftName: { fontSize: 14, color: screen.text },
    todayShiftTime: { fontSize: 13, color: screen.textSecondary },

    bottomSpacer: { height: 30 },
  });
