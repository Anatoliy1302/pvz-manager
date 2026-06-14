// src/screens/common/EmployeesListScreen.tsx
import React, { useState, useCallback, useMemo } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import StorageService from '../../services/StorageService';
import { formatPhoneForDisplay } from '../../utils/phoneHelpers';
import { getEmployeeBalance } from '../../services/PaymentService';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../constants/colors';
import { User } from '../../types/user';
import DataService from '../../services/DataService';
import { safeParseJson } from '../../utils/safeJson';
import { formatHours } from '../../utils/dateHelpers';
import { userWorksAtPvz } from '../../utils/pvzUserHelpers';
import {
  Users,
  UserPlus,
  Trash2,
  Edit2,
  Search,
  Clock,
} from 'lucide-react-native';
import MoneyIcon from '../../components/icons/MoneyIcon';

interface EmployeesListScreenProps {
  navigation: any;
  route: {
    params?: {
      pvzId?: string;
      role?: 'owner' | 'admin';
      canEdit?: boolean;
      canDelete?: boolean;
      canAdd?: boolean;
      showBack?: boolean;
      addScreenName?: string;
      editScreenName?: string;
    };
  };
}

interface EmployeeWithStats extends User {
  totalHours?: number;
  totalEarned?: number;
  balance?: number;
}

export default function EmployeesListScreen({ navigation, route }: EmployeesListScreenProps) {
  const { t } = useTranslation();
  const { pvz, blockUser, confirmPendingEmployee } = useAuth();
  const { ui, screen } = useThemedScreen();
  const { showError, showSuccess } = useScreenToast();
  const {
    pvzId: propPvzId,
    role = 'admin',
    canEdit = true,
    canDelete = true,
    canAdd = true,
    showBack = true,
    addScreenName = role === 'owner' ? 'EmployeeAddForm' : 'AdminEmployeeAddForm',
    editScreenName = role === 'owner' ? 'EmployeeEditForm' : 'AdminEmployeeEditForm',
  } = route.params || {};

  const isOwner = role === 'owner';
  const showFinance = isOwner;

  const [employees, setEmployees] = useState<EmployeeWithStats[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<EmployeeWithStats[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'employee' | 'admin'>('all');
  const [stats, setStats] = useState({ total: 0, onShiftToday: 0 });
  const [pendingEmployees, setPendingEmployees] = useState<
    Array<{ id: string; name: string; phone: string }>
  >([]);

  const currentPvzId = propPvzId || pvz?.id;
  const todayKey = useMemo(() => new Date().toISOString().split('T')[0], []);

  const loadShifts = async () => {
    if (!currentPvzId) return;
    try {
      const shiftsRaw = await StorageService.getItem('shifts');
      const allShifts = safeParseJson<unknown[]>(shiftsRaw ?? '[]', []);
      const pvzShifts = allShifts.filter((s: any) => s.pvzId === currentPvzId);
      setShifts(pvzShifts);
    } catch (error) {
      console.error('Ошибка загрузки смен:', error);
    }
  };

  const loadPendingEmployees = async () => {
    if (!canAdd || !currentPvzId) {
      setPendingEmployees([]);
      return;
    }
    try {
      const pendingRaw = await SecureStore.getItemAsync('pending_employees');
      const pending = safeParseJson<User[]>(pendingRaw ?? '[]', []);
      setPendingEmployees(
        pending.filter((p: { pvzId?: string }) => p.pvzId === currentPvzId)
      );
    } catch (error) {
      console.error('Ошибка загрузки ожидающих сотрудников:', error);
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
            } catch (error: any) {
              showError(error?.message || t('alerts.network.confirmEmployeeFailed'));
            }
          },
        },
      ]
    );
  };

  const loadEmployees = async () => {
    if (!currentPvzId) return;
    try {
      const stored = await StorageService.getItem('pvz_users');
      if (stored) {
        const all = safeParseJson<User[]>(stored, []);
        const filtered = all.filter(
          (u: User) =>
            u.role !== 'owner' &&
            u.status === 'active' &&
            userWorksAtPvz(u, currentPvzId)
        );

        const shiftsRaw = await StorageService.getItem('shifts');
        const allShifts = safeParseJson<unknown[]>(shiftsRaw ?? '[]', []);

        const employeesWithStats = await Promise.all(
          filtered.map(async (emp: User) => {
            const employeeShifts = allShifts.filter(
              (s: any) =>
                s.employeeId === emp.id &&
                (s.status === 'completed' || s.status === 'paid')
            );
            const totalHours = employeeShifts.reduce(
              (sum: number, s: any) => sum + (s.totalHours || s.actualHours || 0),
              0
            );
            const balance = isOwner ? await getEmployeeBalance(emp.id) : null;

            return {
              ...emp,
              totalHours: Math.round(totalHours * 10) / 10,
              totalEarned: balance?.totalEarned ?? 0,
              balance: balance?.balance ?? 0,
            };
          })
        );

        const onShiftToday = employeesWithStats.filter((emp) =>
          allShifts.some(
            (s: any) =>
              s.employeeId === emp.id &&
              s.date === todayKey &&
              s.pvzId === currentPvzId
          )
        ).length;

        setEmployees(employeesWithStats);
        applyFilters(employeesWithStats, searchQuery, roleFilter);
        setStats({
          total: employeesWithStats.length,
          onShiftToday,
        });
      }
    } catch (error) {
      console.error('Ошибка загрузки сотрудников:', error);
    }
  };

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

    const now = new Date();
    const shiftDate = new Date(todayShift.date);
    const [startHour] = todayShift.startTime.split(':').map(Number);
    const [endHour] = todayShift.endTime.split(':').map(Number);

    const shiftStartTime = new Date(shiftDate);
    shiftStartTime.setHours(startHour, 0, 0);
    const shiftEndTime = new Date(shiftDate);
    shiftEndTime.setHours(endHour, 0, 0);

    if (todayShift.paymentStatus === 'paid') {
      return { text: t('common.shiftStatus.paid'), color: colors.success, bg: '#E8F5E9' };
    }
    if (todayShift.status === 'completed') {
      return { text: t('common.shiftStatus.awaitingPayment'), color: colors.warning, bg: '#FFF3E0' };
    }
    if (todayShift.status === 'active') {
      return { text: t('common.shiftStatus.working'), color: colors.success, bg: '#E8F5E9' };
    }
    if (now > shiftEndTime) {
      return { text: t('common.shiftStatus.finished'), color: colors.warning, bg: '#FFF3E0' };
    }
    if (now >= shiftStartTime && now <= shiftEndTime) {
      return { text: t('common.shiftStatus.canStart'), color: colors.primary, bg: '#E8F0FE' };
    }
    return { text: t('common.shiftStatus.scheduled'), color: colors.gray, bg: '#F5F5F5' };
  };

  useFocusEffect(
    useCallback(() => {
      loadEmployees();
      loadShifts();
      loadPendingEmployees();
      const unsubBalance = DataService.subscribe('employee_balance', loadEmployees);
      const unsubPending = DataService.subscribe('pending_employees', () => {
        loadPendingEmployees();
        loadEmployees();
      });
      return () => {
        unsubBalance();
        unsubPending();
      };
    }, [currentPvzId, canAdd, isOwner])
  );

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
    navigation.navigate(editScreenName, { employee, pvzId: currentPvzId });
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
    await loadEmployees();
    await loadShifts();
    await loadPendingEmployees();
    setRefreshing(false);
  };

  const renderEmployee = ({ item }: { item: EmployeeWithStats }) => {
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
  };

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
          onPress={() => navigation.navigate(addScreenName, { pvzId: currentPvzId })}
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
        onBack={showBack ? () => navigation.goBack() : undefined}
      />

      <FlatList
        style={styles.list}
        data={filteredEmployees}
        keyExtractor={(item) => item.id}
        renderItem={renderEmployee}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Users size={64} color={colors.grayLighter} />
            <Text style={[styles.emptyText, ui.subtitle]}>{t('screens.employees.empty')}</Text>
          </View>
        }
      />
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
