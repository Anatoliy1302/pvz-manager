// src/screens/owner/OwnerDashboardScreen.tsx
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
import DashboardActionTiles, { DashboardActionTile } from '../../components/common/DashboardActionTiles';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { StorageService } from '../../services/StorageService';
import { useAuth } from '../../context/AuthContext';
import { ShiftRequest } from '../../services/data/dataTypes';
import { formatPhoneForDisplay } from '../../utils/phoneHelpers';
import { colors } from '../../constants/colors';
import { safeParseJson } from '../../utils/safeJson';
import notificationService from '../../services/NotificationService';
import { loadPvzPayrollBundle } from '../../services/PaymentService';
import { markScreenLoadStart, markScreenLoadEnd } from '../../utils/perfMonitor';
import AnimatedBanner from '../../components/common/AnimatedBanner';
import {
  Crown,
  Building2,
  ChevronDown,
  UserPlus,
  Bell,
  ClipboardList,
  Wallet,
  CalendarDays,
  Phone,
  Repeat,
} from 'lucide-react-native';
import { countPendingSwapsForPvz } from '../../utils/swapRequestHelpers';
import MoneyIcon from '../../components/icons/MoneyIcon';
import { DashboardSkeleton } from '../../components/common/Skeleton';
import { useScreenRefresh, useScopedInitialLoading } from '../../hooks/useScreenRefresh';
import { useShiftsQuery, useEmployeesQuery } from '../../hooks/queries';

export default function OwnerDashboardScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { user, pvz, userPvzs, switchPvz } = useAuth();
  const { ui, screen } = useThemedScreen();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, markLoaded] = useScopedInitialLoading(pvz?.id);
  const [showPvzDropdown, setShowPvzDropdown] = useState(false);
  const [stats, setStats] = useState({
    shiftsToday: 0,
    activeEmployees: 0,
    totalEarnedMonth: 0,
    totalPendingMonth: 0,
    requestsCount: 0,
    swapCount: 0,
  });
  const [unpaidEmployees, setUnpaidEmployees] = useState<{name: string; amount: number}[]>([]);

  const { data: pvzShifts = [], refreshFromSupabase } = useShiftsQuery(pvz?.id, {
    enabled: Boolean(pvz?.id),
  });
  const { data: pvzEmployees = [] } = useEmployeesQuery(pvz?.id, {
    enabled: Boolean(pvz?.id),
  });

  const loadDashboardData = useCallback(async () => {
    markScreenLoadStart('OwnerDashboard');
    try {
      const allShifts = pvzShifts;
      const today = new Date().toISOString().split('T')[0];
      const currentMonth = new Date().getMonth();

      const todayShifts = allShifts.filter((s: { date: string }) => s.date === today);
      const monthShifts = allShifts.filter((s: { date: string }) => {
        const d = new Date(s.date);
        return d.getMonth() === currentMonth;
      });

      const activeEmployees = pvzEmployees.length;

      const now = new Date();
      const periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const periodEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      let totalEarned = 0;
      let totalPending = 0;

      if (pvz?.id && pvzEmployees.length > 0) {
        const payroll = await loadPvzPayrollBundle(
          pvz.id,
          pvzEmployees.map((e) => e.id),
          periodStart,
          periodEnd
        );
        for (const emp of pvzEmployees) {
          const row = payroll.get(emp.id);
          totalEarned += row?.periodAccruals.netEarned ?? 0;
          totalPending += row?.lifetimeBalance ?? 0;
        }
      }

      const requestsRaw = await StorageService.getData('all_shift_requests');
      const allRequests = safeParseJson<ShiftRequest[]>(requestsRaw ?? '[]', []);
      const pendingRequests = allRequests.filter((r: any) => r.status === 'pending').length;
      const pendingSwaps = await countPendingSwapsForPvz(pvz?.id);

      // Группировка невыплаченных сумм по сотрудникам
      const unpaidShifts = monthShifts.filter((s: any) => s.paymentStatus !== 'paid' && s.earnings > 0);
      const groupedByEmployee: {[key: string]: number} = {};
      unpaidShifts.forEach((s: any) => {
        const name = s.employeeName || t('common.roles.employee');
        groupedByEmployee[name] = (groupedByEmployee[name] || 0) + (s.earnings || 0);
      });
      
      const unpaidList = Object.entries(groupedByEmployee)
        .map(([name, amount]) => ({ name, amount: Math.round(amount) }))
        .sort((a, b) => b.amount - a.amount);

      setStats({
        shiftsToday: todayShifts.length,
        activeEmployees,
        totalEarnedMonth: Math.round(totalEarned),
        totalPendingMonth: Math.round(totalPending),
        requestsCount: pendingRequests,
        swapCount: pendingSwaps,
      });
      setUnpaidEmployees(unpaidList);
    } catch (error) {
      console.error('Ошибка загрузки:', error);
    } finally {
      markLoaded();
      markScreenLoadEnd('OwnerDashboard');
    }
  }, [pvz?.id, pvzShifts, pvzEmployees, t, markLoaded]);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        notificationService.deliverPendingStaffAlerts(user.id);
      }
    }, [user?.id])
  );

  useScreenRefresh(loadDashboardData, [pvz?.id, user?.id, loadDashboardData], {
    subscribeKeys: [
      'employee_balance',
      'all_shift_requests',
      ...(pvz?.id ? [`swap_requests_${pvz.id}`] : []),
    ],
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshFromSupabase();
    await loadDashboardData();
    setRefreshing(false);
  };

  const quickActions: DashboardActionTile[] = [
    { icon: CalendarDays, label: t('screens.dashboard.owner.schedule'), onPress: () => navigation.navigate('Schedule'), gradient: ['#4CAF50', '#388E3C'] },
    { icon: UserPlus, label: t('screens.dashboard.owner.add'), onPress: () => navigation.navigate('EmployeeAddForm'), gradient: ['#2196F3', '#1565C0'] },
    { icon: Bell, label: t('screens.dashboard.owner.requests'), onPress: () => navigation.navigate('ShiftRequests'), gradient: ['#FF9800', '#E65100'], badge: stats.requestsCount },
    { icon: Repeat, label: t('screens.dashboard.owner.swaps'), onPress: () => navigation.navigate('SwapRequests'), gradient: ['#2196F3', '#1565C0'], badge: stats.swapCount },
    { icon: ClipboardList, label: t('screens.dashboard.owner.penalties'), onPress: () => navigation.navigate('Penalties'), gradient: ['#E53935', '#B71C1C'] },
    { icon: Wallet, label: t('screens.dashboard.owner.salary'), onPress: () => navigation.navigate('Payments'), gradient: ['#9C27B0', '#6A1B9A'] },
    { icon: MoneyIcon, label: t('screens.dashboard.owner.rates'), onPress: () => navigation.navigate('SalarySettings'), gradient: ['#FF6B6B', '#D32F2F'] },
  ];

  return (
    <ThemedSafeAreaView>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <DashboardSkeleton />
        ) : (
          <>
        <AnimatedBanner height={240} delay={0}>
          <View style={styles.bannerContent}>
            <View style={styles.bannerAvatar}>
              <Crown size={32} color="#FFFFFF" />
            </View>
            <Text style={styles.bannerName}>{user?.name || t('common.roles.ownerShort')}</Text>
            <View style={styles.bannerPhoneRow}>
              <Phone size={12} color="rgba(255,255,255,0.8)" />
              <Text style={styles.bannerPhone}>
                {user?.phone ? formatPhoneForDisplay(user.phone) : ''}
              </Text>
            </View>
            {userPvzs && userPvzs.length > 1 ? (
              <>
                <TouchableOpacity
                  style={styles.bannerPvzRow}
                  onPress={() => setShowPvzDropdown(!showPvzDropdown)}
                  activeOpacity={0.8}
                >
                  <Building2 size={14} color="rgba(255,255,255,0.8)" />
                  <Text style={styles.bannerPvzName}>{pvz?.name || t('common.pvz.default')}</Text>
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
                  <View style={[styles.pvzDropdown, { backgroundColor: screen.card }]}>
                    {userPvzs.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.pvzDropdownItem}
                        onPress={async () => {
                          setShowPvzDropdown(false);
                          await switchPvz(item.id);
                        }}
                      >
                        <Text
                          style={[
                            styles.pvzDropdownText,
                            { color: screen.text },
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
                <Text style={styles.bannerPvzName}>{pvz?.name || t('common.pvz.default')}</Text>
              </View>
            )}
            <View style={styles.bannerStats}>
              <View style={styles.bannerStatItem}>
                <Text style={styles.bannerStatValue}>{stats.shiftsToday}</Text>
                <Text style={styles.bannerStatLabel}>{t('common.stats.shifts')}</Text>
              </View>
              <View style={styles.bannerStatDivider} />
              <View style={styles.bannerStatItem}>
                <Text style={styles.bannerStatValue}>{stats.activeEmployees}</Text>
                <Text style={styles.bannerStatLabel}>{t('common.stats.employees')}</Text>
              </View>
              <View style={styles.bannerStatDivider} />
              <View style={styles.bannerStatItem}>
                <Text style={styles.bannerStatValue}>{Math.round(stats.totalEarnedMonth / 1000)}к</Text>
                <Text style={styles.bannerStatLabel}>{t('common.stats.accrued')}</Text>
              </View>
              <View style={styles.bannerStatDivider} />
              <View style={styles.bannerStatItem}>
                <Text style={styles.bannerStatValue}>{Math.round(stats.totalPendingMonth / 1000)}к</Text>
                <Text style={styles.bannerStatLabel}>{t('common.stats.debt')}</Text>
              </View>
            </View>
          </View>
        </AnimatedBanner>

        <DashboardActionTiles actions={quickActions} />

        {/* Невыплаченные суммы по сотрудникам */}
        {unpaidEmployees.length > 0 && (
          <View style={[styles.unpaidSection, ui.card]}>
            <View style={[styles.unpaidHeader, { borderBottomColor: screen.border }]}>
              <MoneyIcon size={18} color={colors.danger} />
              <Text style={[styles.unpaidTitle, ui.title]}>{t('screens.dashboard.owner.unpaidTitle')}</Text>
              <Text style={styles.unpaidTotal}>{stats.totalPendingMonth.toLocaleString()} ₽</Text>
            </View>
            {unpaidEmployees.map((emp, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.unpaidRow, { borderBottomColor: screen.border }]}
                onPress={() => navigation.navigate('Payments', { employeeName: emp.name })}
              >
                <Text style={[styles.unpaidName, ui.title]}>{emp.name}</Text>
                <Text style={styles.unpaidAmount}>{emp.amount.toLocaleString()} ₽</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.bottomSpacer} />
          </>
        )}
      </ScrollView>
    </ThemedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bannerContent: { alignItems: 'center', paddingTop: 8 },
  bannerAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  bannerName: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  bannerPhoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  bannerPhone: { fontSize: 13, color: 'rgba(255,255,255,0.85)' },
  bannerPvzRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  bannerPvzName: { fontSize: 14, color: 'rgba(255,255,255,0.9)' },
  pvzHint: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 12 },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  pvzDropdown: {
    marginTop: 6,
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    minWidth: 200,
  },
  pvzDropdownItem: { paddingVertical: 10, paddingHorizontal: 14 },
  pvzDropdownText: { fontSize: 14 },
  pvzDropdownTextActive: { color: colors.primary, fontWeight: '600' },
  bannerStats: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 8, width: '100%' },
  bannerStatItem: { flex: 1, alignItems: 'center', gap: 2 },
  bannerStatValue: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF' },
  bannerStatLabel: { fontSize: 10, color: 'rgba(255,255,255,0.8)' },
  bannerStatDivider: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.2)' },

  // Невыплаченные суммы
  unpaidSection: {
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 20,
    padding: 16,
  },
  unpaidHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  unpaidTitle: { fontSize: 15, fontWeight: '600', flex: 1 },
  unpaidTotal: { fontSize: 16, fontWeight: 'bold', color: colors.danger },
  unpaidRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  unpaidName: { fontSize: 14 },
  unpaidAmount: { fontSize: 14, fontWeight: '600', color: colors.danger },

  bottomSpacer: { height: 30 },
});
