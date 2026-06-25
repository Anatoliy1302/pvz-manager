// src/screens/common/EmployeesListScreen.tsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import ScreenHeader from '../../components/common/ScreenHeader';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useScreenToast } from '../../hooks/useScreenToast';
import { useScreenRefresh, useScopedInitialLoading } from '../../hooks/useScreenRefresh';
import StorageService from '../../services/StorageService';
import { SecureStoreKeys } from '../../constants/secureStoreKeys';
import { formatPhoneForDisplay } from '../../utils/phoneHelpers';
import { loadPvzPayrollBundle } from '../../services/PaymentService';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../constants/colors';
import { User, Shift } from '../../types/user';
import DataService from '../../services/DataService';
import { safeParseJson } from '../../utils/safeJson';
import { formatHours, toDateKey, getMonthRange } from '../../utils/dateHelpers';
import { userWorksAtPvz } from '../../utils/pvzUserHelpers';
import { getShiftStatus } from '../../utils/shiftStatusHelper';
import {
  Users,
  UserPlus,
  Trash2,
  Edit2,
  Search,
  Clock,
} from 'lucide-react-native';
import MoneyIcon from '../../components/icons/MoneyIcon';
import { markScreenLoadStart, markScreenLoadEnd } from '../../utils/perfMonitor';
import { EmployeesListSkeleton } from '../../components/common/Skeleton';
import EmptyState from '../../components/common/EmptyState';
import { FLAT_LIST_PERF } from '../../constants/flatListPerf';
import type { AppNavigationLike, EmployeesListRouteParams } from '../../navigation/types';
import { navigateEmployeeAddForm, navigateEmployeeEditForm } from '../../navigation/types';
import { resolveUserMessage } from '../../utils/appErrors';

interface EmployeesListScreenProps {
  navigation: AppNavigationLike;
  route: {
    params?: EmployeesListRouteParams;
  };
}

interface EmployeeWithStats extends User {
  totalHours?: number;
  totalEarned?: number;
  balance?: number;
}

export default function EmployeesListScreen({ navigation, route }: EmployeesListScreenProps) {
  const { t } = useTranslation();
  const { pvz, user, userPvzs, blockUser, confirmPendingEmployee, hasRole, hasPermission } =
    useAuth();
  const { ui, screen } = useThemedScreen();
  const { showError, showSuccess } = useScreenToast();
  const {
    pvzId: propPvzId,
    role: routeRole,
    showBack = true,
    addScreenName: routeAddScreenName,
    editScreenName: routeEditScreenName,
  } = route.params || {};

  const isOwner = hasRole(['owner']);
  const canManage = isOwner || hasPermission('canManageEmployees');
  const canEdit = canManage;
  const canDelete = canManage;
  const canAdd = canManage;
  const role = routeRole ?? (isOwner ? 'owner' : 'admin');
  const addScreenName =
    routeAddScreenName ?? (isOwner ? 'EmployeeAddForm' : 'AdminEmployeeAddForm');
  const editScreenName =
    routeEditScreenName ?? (isOwner ? 'EmployeeEditForm' : 'AdminEmployeeEditForm');

  const allowedPvzIds = useMemo(() => {
    if (isOwner) {
      return new Set(userPvzs.map((item) => item.id));
    }
    const ids = user?.pvzIds?.length
      ? user.pvzIds
      : user?.pvzId
        ? [user.pvzId]
        : pvz?.id
          ? [pvz.id]
          : [];
    return new Set(ids);
  }, [isOwner, userPvzs, user?.pvzIds, user?.pvzId, pvz?.id]);

  const currentPvzId = useMemo(() => {
    const requested = propPvzId || pvz?.id;
    if (!requested) return undefined;
    if (allowedPvzIds.has(requested)) return requested;
    return allowedPvzIds.values().next().value as string | undefined;
  }, [propPvzId, pvz?.id, allowedPvzIds]);

  const showFinance = isOwner;

  const [employees, setEmployees] = useState<EmployeeWithStats[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<EmployeeWithStats[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'employee' | 'admin'>('all');
  const [stats, setStats] = useState({ total: 0, onShiftToday: 0 });
  const [pendingEmployees, setPendingEmployees] = useState<
    Array<{ id: string; name: string; phone: string }>
  >([]);

  const [loading, markLoaded] = useScopedInitialLoading(currentPvzId);
  const todayKey = useMemo(() => toDateKey(new Date()), []);

  const loadPendingEmployees = async () => {
    if (!canAdd || !currentPvzId) {
      setPendingEmployees([]);
      return;
    }
    try {
      const pendingRaw = await StorageService.getItem(SecureStoreKeys.pendingEmployees);
      const pending = safeParseJson<User[]>(pendingRaw ?? '[]', []);
      setPendingEmployees(
        pending.filter((p: { pvzId?: string }) => p.pvzId === currentPvzId)
      );
    } catch (error) {
      console.error('Ошибка загрузки ожидающих сотрудников:', error);
      showError(resolveUserMessage(error, 'alerts.network.loadEmployeesFailed'));
    }
  };

  const handleConfirmEmployee = (emp: { id: string; name: string }) => {
    Alert.alert(
      t('alerts.confirm.confirmEmployeeTitle'),
      t('alerts.confirm.confirmEmployee', { name: emp.name }),
      [
        { text: t('common.actions.cancel'), style: 'cancel' },
        {
          text: t('common.actions.confirm'),
          onPress: async () => {
            try {
              await confirmPendingEmployee(emp.id);
              await loadPendingEmployees();
              await loadEmployees();
              showSuccess(t('alerts.success.employeeConfirmed', { name: emp.name }));
            } catch (error: unknown) {
              showError(resolveUserMessage(error, 'alerts.network.confirmEmployeeFailed'));
            }
          },
        },
      ]
    );
  };

  const currentMonthPeriod = useMemo(() => {
    const now = new Date();
    return getMonthRange(now.getFullYear(), now.getMonth());
  }, []);

  const loadEmployees = useCallback(async () => {
    if (!currentPvzId) return;
    markScreenLoadStart('EmployeesList');
    try {
      const stored = await StorageService.getItem(SecureStoreKeys.pvzUsers);
      if (!stored) {
        setEmployees([]);
        setFilteredEmployees([]);
        setShifts([]);
        setStats({ total: 0, onShiftToday: 0 });
        return;
      }

      const all = safeParseJson<User[]>(stored, []);
      const filtered = all.filter(
        (u: User) =>
          u.role !== 'owner' &&
          u.status === 'active' &&
          userWorksAtPvz(u, currentPvzId)
      );

      const shiftsRaw = await StorageService.getItem(SecureStoreKeys.shifts);
      const allShifts = safeParseJson<Shift[]>(shiftsRaw ?? '[]', []);
      const pvzShifts = allShifts.filter((s) => s.pvzId === currentPvzId);
      setShifts(pvzShifts);

      let payrollMap: Map<string, { lifetimeBalance: number; periodAccruals: { netEarned: number } }> | null =
        null;
      if (isOwner && filtered.length > 0) {
        payrollMap = await loadPvzPayrollBundle(
          currentPvzId,
          filtered.map((e) => e.id),
          currentMonthPeriod.start,
          currentMonthPeriod.end
        );
      }

      const employeesWithStats = filtered.map((emp: User) => {
        const employeeShifts = pvzShifts.filter(
          (s) =>
            s.employeeId === emp.id &&
            (s.status === 'completed' || s.status === 'paid')
        );
        const totalHours = employeeShifts.reduce(
          (sum, s) => sum + (s.totalHours || s.actualHours || 0),
          0
        );
        const row = payrollMap?.get(emp.id);

        return {
          ...emp,
          totalHours: Math.round(totalHours * 10) / 10,
          totalEarned: row?.periodAccruals.netEarned ?? 0,
          balance: row?.lifetimeBalance ?? 0,
        };
      });

      const onShiftToday = employeesWithStats.filter((emp) =>
        pvzShifts.some(
          (s) =>
            s.employeeId === emp.id &&
            s.date === todayKey
        )
      ).length;

      setEmployees(employeesWithStats);
      applyFilters(employeesWithStats, searchQuery, roleFilter);
      setStats({
        total: employeesWithStats.length,
        onShiftToday,
      });
    } catch (error) {
      console.error('Ошибка загрузки сотрудников:', error);
      showError(resolveUserMessage(error, 'alerts.network.loadEmployeesFailed'));
    } finally {
      markLoaded();
      markScreenLoadEnd('EmployeesList');
    }
  }, [
    currentPvzId,
    isOwner,
    todayKey,
    markLoaded,
    currentMonthPeriod.start,
    currentMonthPeriod.end,
    searchQuery,
    roleFilter,
    showError,
  ]);

  const refreshList = useCallback(async () => {
    await Promise.all([loadEmployees(), loadPendingEmployees()]);
  }, [loadEmployees, canAdd]);

  useScreenRefresh(refreshList, [refreshList], {
    subscribeKeys: [
      'employee_balance',
      SecureStoreKeys.pendingEmployees,
      SecureStoreKeys.pvzUsers,
      SecureStoreKeys.shifts,
    ],
  });

  const applyFilters = (
    empList: EmployeeWithStats[],
    query: string,
    role: 'all' | 'employee' | 'admin'
  ) => {
    let filtered = [...empList];
    if (query.trim()) {
      const lowerQuery = query.toLowerCase();
      filtered = filtered.filter(
        (emp) =>
          emp.name.toLowerCase().includes(lowerQuery) || emp.phone.includes(lowerQuery)
      );
    }
    if (role !== 'all') {
      filtered = filtered.filter((emp) => emp.role === role);
    }
    setFilteredEmployees(filtered);
  };

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    applyFilters(employees, text, roleFilter);
  };

  const handleRoleFilter = (nextRole: 'all' | 'employee' | 'admin') => {
    setRoleFilter(nextRole);
    applyFilters(employees, searchQuery, nextRole);
  };

  const getTodayShiftStatus = (employeeId: string) => {
    const todayShift = shifts.find(
      (s) => s.employeeId === employeeId && s.date === todayKey
    );

    if (!todayShift) {
      return { text: t('common.shiftStatus.noShift'), color: colors.gray, bg: '#F0F0F0' };
    }

    const { status, paymentStatus } = getShiftStatus(todayShift);

    if (status === 'paid' || paymentStatus === 'paid') {
      return { text: t('common.shiftStatus.paid'), color: colors.success, bg: '#E8F5E9' };
    }
    if (status === 'completed') {
      return { text: t('common.shiftStatus.awaitingPayment'), color: colors.warning, bg: '#FFF3E0' };
    }
    return { text: t('common.shiftStatus.scheduled'), color: colors.gray, bg: '#F5F5F5' };
  };

  const deleteEmployee = (id: string, name: string) => {
    Alert.alert(t('alerts.confirm.deleteEmployeeTitle'), t('alerts.confirm.deleteEmployee', { name }), [
      { text: t('common.actions.cancel'), style: 'cancel' },
      {
        text: t('common.actions.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await blockUser(id);
            await loadEmployees();
            showSuccess(t('alerts.success.employeeDeleted'));
          } catch (error) {
            showError(t('alerts.network.deleteEmployeeFailed'));
          }
        },
      },
    ]);
  };

  const openEditModal = (employee: User) => {
    navigateEmployeeEditForm(navigation, editScreenName, { employee, pvzId: currentPvzId });
  };

  const handleEmployeePress = (item: EmployeeWithStats) => {
    if (isOwner) {
      navigation.navigate('EmployeePaymentDetails', {
        employeeId: item.id,
        employeeName: item.name,
      });
      return;
    }
    if (canEdit) {
      openEditModal(item);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await DataService.refreshShiftsCache();
    await loadEmployees();
    await loadPendingEmployees();
    setRefreshing(false);
  };

  const renderEmployee = useCallback(
    ({ item }: { item: EmployeeWithStats }) => {
      const shiftStatus = getTodayShiftStatus(item.id);
      const pressable = isOwner || canEdit;

      return (
        <View style={[styles.employeeCard, ui.card]}>
          <TouchableOpacity
            style={styles.employeeInfo}
            onPress={() => handleEmployeePress(item)}
            activeOpacity={pressable ? 0.7 : 1}
            disabled={!pressable}
          >
            <Text style={[styles.employeeName, ui.title]}>{item.name}</Text>
            <Text style={[styles.employeePhone, ui.subtitle]}>{item.phone}</Text>

            <View style={styles.statsRow}>
              <View style={[styles.statChip, { backgroundColor: ui.input.backgroundColor }]}>
                <Clock size={12} color={colors.primary} />
                <Text style={[styles.statChipText, ui.subtitle]}>
                  {formatHours(item.totalHours || 0)}
                </Text>
              </View>
              {showFinance && (
                <>
                  <View style={[styles.statChip, { backgroundColor: ui.input.backgroundColor }]}>
                    <MoneyIcon size={12} color={colors.success} />
                    <Text style={[styles.statChipText, ui.subtitle]}>
                      {item.totalEarned?.toLocaleString() || 0} ₽
                    </Text>
                  </View>
                  {(item.balance ?? 0) > 0 && (
                    <View style={[styles.statChip, styles.balanceChip]}>
                      <Text style={styles.balanceChipText}>
                        {t('common.money.debtLabel', { amount: (item.balance ?? 0).toLocaleString() })}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>

            <View
              style={[
                styles.roleBadge,
                item.role === 'admin' ? styles.adminBadge : styles.employeeBadge,
              ]}
            >
              <Text style={[styles.roleText, ui.subtitle]}>
                {item.role === 'admin' ? t('common.roles.admin') : t('common.roles.employee')}
              </Text>
            </View>
            <View
              style={[styles.shiftStatusBadge, { backgroundColor: shiftStatus.bg, marginTop: 6 }]}
            >
              <Text style={[styles.shiftStatusText, { color: shiftStatus.color }]}>
                {shiftStatus.text}
              </Text>
            </View>
          </TouchableOpacity>
          {(canEdit || canDelete) && (
            <View style={styles.actions}>
              {canEdit && (
                <TouchableOpacity onPress={() => openEditModal(item)} style={styles.editButton}>
                  <Edit2 size={18} color={colors.primary} />
                </TouchableOpacity>
              )}
              {canDelete && (
                <TouchableOpacity
                  onPress={() => deleteEmployee(item.id, item.name)}
                  style={styles.deleteButton}
                >
                  <Trash2 size={18} color={colors.danger} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      );
    },
    [
      canEdit,
      canDelete,
      deleteEmployee,
      getTodayShiftStatus,
      handleEmployeePress,
      isOwner,
      openEditModal,
      showFinance,
      t,
      ui.card,
      ui.input.backgroundColor,
      ui.subtitle,
      ui.title,
    ],
  );

  const listEmptyComponent = useMemo(() => {
    const isFilteredEmpty = employees.length > 0 && filteredEmployees.length === 0;
    return (
      <EmptyState
        icon={Users}
        title={t('screens.employees.empty')}
        description={isFilteredEmpty ? t('screens.employees.searchPlaceholder') : undefined}
        buttonText={canAdd && !isFilteredEmpty ? t('screens.employees.addButton') : undefined}
        onButtonPress={
          canAdd && !isFilteredEmpty
            ? () => navigateEmployeeAddForm(navigation, addScreenName, { pvzId: currentPvzId })
            : undefined
        }
      />
    );
  }, [
    addScreenName,
    canAdd,
    currentPvzId,
    employees.length,
    filteredEmployees.length,
    navigation,
    t,
  ]);

  const getHeaderTitle = () =>
    isOwner ? t('screens.employees.title') : t('screens.employees.titlePvz');

  const listHeader = (
    <>
      <View style={[styles.statsBar, ui.card]}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, ui.title]}>{stats.total}</Text>
          <Text style={[styles.statLabel, ui.subtitle]}>{t('common.stats.total')}</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: screen.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, ui.title]}>{stats.onShiftToday}</Text>
          <Text style={[styles.statLabel, ui.subtitle]}>{t('common.stats.shiftsToday')}</Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <View
          style={[
            styles.searchInputWrapper,
            { backgroundColor: ui.input.backgroundColor, borderColor: screen.border },
          ]}
        >
          <Search size={20} color={colors.gray} />
          <TextInput
            style={[styles.searchInput, { color: screen.text }]}
            placeholder={t('screens.employees.searchPlaceholder')}
            value={searchQuery}
            onChangeText={handleSearch}
            placeholderTextColor={colors.grayLight}
          />
        </View>
        <View style={styles.filterContainer}>
          {(['all', 'employee', 'admin'] as const).map((filterKey) => {
            const labels = {
              all: t('common.filters.all'),
              employee: t('common.filters.employees'),
              admin: t('common.filters.admins'),
            };
            const active = roleFilter === filterKey;
            return (
              <TouchableOpacity
                key={filterKey}
                style={[
                  styles.filterChip,
                  { backgroundColor: ui.input.backgroundColor },
                  active && styles.filterChipActive,
                ]}
                onPress={() => handleRoleFilter(filterKey)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    ui.subtitle,
                    active && styles.filterChipTextActive,
                  ]}
                >
                  {labels[filterKey]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {canAdd && (
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigateEmployeeAddForm(navigation, addScreenName, { pvzId: currentPvzId })}
        >
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            style={styles.addButtonGradient}
          >
            <UserPlus size={20} color="#FFFFFF" />
            <Text style={styles.addButtonText}>{t('screens.employees.addButton')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {canAdd && pendingEmployees.length > 0 && (
        <View style={[styles.pendingSection, ui.card]}>
          <Text style={[styles.pendingTitle, ui.title]}>
            {t('screens.employees.pendingTitle', { count: pendingEmployees.length })}
          </Text>
          <Text style={[styles.pendingHint, ui.subtitle]}>
            {t('screens.employees.pendingHint')}
          </Text>
          {pendingEmployees.map((emp) => (
            <View key={emp.id} style={[styles.pendingItem, { borderTopColor: screen.border }]}>
              <View style={styles.pendingInfo}>
                <Text style={[styles.pendingName, ui.title]}>{emp.name}</Text>
                <Text style={[styles.pendingPhone, ui.subtitle]}>
                  {formatPhoneForDisplay(emp.phone)}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={() => handleConfirmEmployee(emp)}
              >
                <Text style={styles.confirmButtonText}>{t('common.actions.confirm')}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {filteredEmployees.length > 0 && (
        <Text style={[styles.listSectionTitle, ui.sectionTitle]}>
          {t('screens.employees.teamTitle', { count: filteredEmployees.length })}
        </Text>
      )}
    </>
  );

  return (
    <ThemedSafeAreaView style={styles.container}>
      <ScreenHeader
        title={getHeaderTitle()}
        onBack={showBack ? () => navigation.goBack?.() : undefined}
      />

      {loading ? (
        <EmployeesListSkeleton />
      ) : (
      <FlatList
        style={styles.list}
        data={filteredEmployees}
        keyExtractor={(item) => item.id}
        renderItem={renderEmployee}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={listEmptyComponent}
        {...FLAT_LIST_PERF}
      />
      )}
    </ThemedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1 },

  statsBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: 'bold' },
  statLabel: { fontSize: 12 },
  statDivider: { width: 1, height: 30 },

  searchContainer: { marginHorizontal: 16, marginTop: 16 },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15 },
  filterContainer: { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  filterChipActive: { backgroundColor: colors.primary },
  filterChipText: { fontSize: 13 },
  filterChipTextActive: { color: '#FFFFFF' },

  addButton: { marginHorizontal: 16, marginTop: 8, borderRadius: 30, overflow: 'hidden' },
  addButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  addButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },

  pendingSection: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
  },
  pendingTitle: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  pendingHint: { fontSize: 12, marginBottom: 12 },
  pendingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  pendingInfo: { flex: 1, marginRight: 8 },
  pendingName: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  pendingPhone: { fontSize: 13 },
  confirmButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  confirmButtonText: { fontSize: 13, color: '#FFFFFF', fontWeight: '500' },

  listSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
  },

  listContent: { paddingHorizontal: 16, paddingBottom: 30 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 40, paddingBottom: 24 },
  emptyText: { fontSize: 16, marginTop: 16 },

  employeeCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  employeeInfo: { flex: 1 },
  employeeName: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  employeePhone: { fontSize: 14, marginBottom: 8 },

  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statChipText: { fontSize: 11 },
  balanceChip: { backgroundColor: '#FFF3E0' },
  balanceChipText: { fontSize: 11, color: colors.warning, fontWeight: '500' },

  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' },
  adminBadge: { backgroundColor: '#E8F0FE' },
  employeeBadge: { backgroundColor: '#F0F0F0' },
  roleText: { fontSize: 11, fontWeight: '500' },

  shiftStatusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' },
  shiftStatusText: { fontSize: 11, fontWeight: '500' },

  actions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  editButton: { padding: 8 },
  deleteButton: { padding: 8 },
});
