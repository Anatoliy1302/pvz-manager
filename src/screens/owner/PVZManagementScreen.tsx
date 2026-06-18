// src/screens/owner/PVZManagementScreen.tsx
import React, { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import ScreenHeader from '../../components/common/ScreenHeader';
import EmptyState from '../../components/common/EmptyState';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useScreenToast } from '../../hooks/useScreenToast';
import { usePvzListQuery, useEmployeesQuery } from '../../hooks/queries';
import DataService from '../../services/DataService';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../constants/colors';
import { Pvz } from '../../types/user';
import { formatPhoneForDisplay } from '../../utils/phoneHelpers';
import { userWorksAtPvz } from '../../utils/pvzUserHelpers';
import {
  Building2,
  Plus,
  Edit2,
  Trash2,
  MapPin,
  Clock,
  Phone,
  Users,
  Check,
} from 'lucide-react-native';
import { FLAT_LIST_PERF } from '../../constants/flatListPerf';

type PvzWithCount = Pvz & { employeesCount: number };

export default function PVZManagementScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { user, pvz: activePvz, switchPvz, refreshUserData } = useAuth();
  const { ui, screen } = useThemedScreen();
  const styles = createStyles(screen);
  const { showError, showSuccess } = useScreenToast();
  const [refreshing, setRefreshing] = useState(false);

  const pvzScope = user?.id ? { kind: 'owner' as const, ownerId: user.id } : null;
  const {
    data: pvzList = [],
    isLoading,
    refetch: refetchPvzs,
  } = usePvzListQuery(pvzScope, { enabled: Boolean(user?.id) });
  const { data: allEmployees = [], refetch: refetchEmployees } = useEmployeesQuery(undefined, {
    enabled: Boolean(user?.id),
  });

  const pvzs = useMemo<PvzWithCount[]>(
    () =>
      pvzList.map((item) => ({
        ...item,
        employeesCount: allEmployees.filter(
          (u) => userWorksAtPvz(u, item.id) && u.role !== 'owner' && u.status === 'active'
        ).length,
      })),
    [pvzList, allEmployees]
  );

  const totalEmployees = useMemo(
    () => pvzs.reduce((sum, p) => sum + (p.employeesCount || 0), 0),
    [pvzs]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchPvzs(), refetchEmployees(), refreshUserData()]);
    } catch (error) {
      console.error('Ошибка загрузки ПВЗ:', error);
      showError(t('alerts.network.loadPvzFailed'));
    } finally {
      setRefreshing(false);
    }
  }, [refetchPvzs, refetchEmployees, refreshUserData, showError, t]);

  const formatWorkingHours = (item: Pvz) => {
    if (item.workStart && item.workEnd) {
      return `${item.workStart} — ${item.workEnd}`;
    }
    if (item.workingHours) return item.workingHours;
    return t('common.notSpecifiedAddress');
  };

  const deletePvz = (id: string, name: string, employeesCount: number = 0) => {
    if (employeesCount > 0) {
      showError(t('alerts.confirm.cannotDeletePvz', { name, count: employeesCount }));
      return;
    }

    Alert.alert(t('alerts.confirm.deleteEmployeeTitle'), t('alerts.confirm.deletePvz', { name }), [
      { text: t('common.actions.cancel'), style: 'cancel' },
      {
        text: t('common.actions.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await DataService.deletePvz(id);
            await refreshUserData();
            await Promise.all([refetchPvzs(), refetchEmployees()]);
            showSuccess(t('alerts.success.pvzDeleted'));
          } catch (error) {
            console.error('Ошибка удаления:', error);
            showError(t('alerts.network.deletePvzFailed'));
          }
        },
      },
    ]);
  };

  const formatPhone = (phone: string) => {
    if (!phone?.trim()) return t('common.notSpecified');
    return formatPhoneForDisplay(phone);
  };

  const handleSelectPvz = async (pvzId: string) => {
    if (activePvz?.id === pvzId) return;
    await switchPvz(pvzId);
  };

  const openEdit = (item: Pvz) => {
    navigation.navigate('PVZForm', { pvz: item });
  };

  const handleAddPvz = () => {
    navigation.navigate('PVZForm');
  };

  const renderPvzItem = useCallback(
    ({ item }: { item: PvzWithCount }) => {
      const isActive = activePvz?.id === item.id;
      return (
        <TouchableOpacity
          style={[styles.pvzCard, ui.card, isActive && styles.pvzCardActive]}
          onPress={() => openEdit(item)}
          activeOpacity={0.75}
        >
          <View style={styles.pvzHeader}>
            <View style={styles.pvzTitleRow}>
              <Text style={[styles.pvzName, ui.title]} numberOfLines={1}>
                {item.name}
              </Text>
              {isActive && (
                <View style={styles.activeBadge}>
                  <Check size={12} color={colors.primary} />
                  <Text style={styles.activeBadgeText}>{t('screens.owner.currentBadge')}</Text>
                </View>
              )}
            </View>
            <View style={styles.pvzActions}>
              {!isActive && pvzs.length > 1 && (
                <TouchableOpacity
                  onPress={() => handleSelectPvz(item.id)}
                  style={styles.selectButton}
                >
                  <Text style={styles.selectButtonText}>{t('screens.owner.selectBtn')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => openEdit(item)}
                style={styles.actionButton}
                accessibilityLabel={t('common.actions.edit')}
              >
                <Edit2 size={18} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => deletePvz(item.id, item.name, item.employeesCount || 0)}
                style={styles.actionButton}
                accessibilityLabel={t('common.actions.delete')}
              >
                <Trash2 size={18} color={colors.danger} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.pvzInfo}>
            <MapPin size={14} color={screen.textSecondary} />
            <Text style={[styles.pvzInfoText, { color: screen.textSecondary }]} numberOfLines={2}>
              {item.address || t('common.pvz.noAddress')}
            </Text>
          </View>

          <View style={styles.pvzInfo}>
            <Clock size={14} color={screen.textSecondary} />
            <Text style={[styles.pvzInfoText, { color: screen.textSecondary }]}>
              {formatWorkingHours(item)}
            </Text>
          </View>

          <View style={styles.pvzInfo}>
            <Phone size={14} color={screen.textSecondary} />
            <Text style={[styles.pvzInfoText, { color: screen.textSecondary }]}>
              {formatPhone(item.phone)}
            </Text>
          </View>

          <View style={[styles.pvzFooter, { borderTopColor: screen.border }]}>
            <View style={[styles.pvzEmployeesBadge, { backgroundColor: ui.input.backgroundColor }]}>
              <Users size={12} color={colors.primary} />
              <Text style={styles.pvzEmployeesText}>
                {t('screens.owner.employeesCount', { count: item.employeesCount || 0 })}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [activePvz?.id, ui, screen, t, pvzs.length, openEdit, handleSelectPvz, deletePvz, formatWorkingHours, formatPhone]
  );

  return (
    <ThemedSafeAreaView style={styles.container}>
      <ScreenHeader
        title={t('screens.owner.pvzManagement')}
        onBack={() => navigation.goBack()}
        right={
          <TouchableOpacity
            onPress={handleAddPvz}
            accessibilityLabel={t('screens.owner.addPvzLabel')}
          >
            <Plus size={24} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />

      <View style={[styles.statsBar, ui.card]}>
        <View style={styles.statItem}>
          <Building2 size={20} color={colors.primary} />
          <Text style={[styles.statValue, { color: screen.text }]}>{pvzs.length}</Text>
          <Text style={[styles.statLabel, { color: screen.textSecondary }]}>{t('screens.owner.pvzCount')}</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: screen.border }]} />
        <View style={styles.statItem}>
          <Users size={20} color={colors.primary} />
          <Text style={[styles.statValue, { color: screen.text }]}>{totalEmployees}</Text>
          <Text style={[styles.statLabel, { color: screen.textSecondary }]}>{t('screens.owner.employeesTotal')}</Text>
        </View>
      </View>

      <FlatList
        data={pvzs}
        keyExtractor={(item) => item.id}
        renderItem={renderPvzItem}
        refreshControl={<RefreshControl refreshing={refreshing || isLoading} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        ListEmptyComponent={
          <EmptyState
            icon={Building2}
            title={t('screens.owner.emptyPvzTitle')}
            description={t('screens.owner.emptyPvzDesc')}
            buttonText={t('screens.owner.addPvz')}
            onButtonPress={handleAddPvz}
          />
        }
        {...FLAT_LIST_PERF}
      />
    </ThemedSafeAreaView>
  );
}

const createStyles = (screen: ReturnType<typeof useThemedScreen>['screen']) =>
  StyleSheet.create({
    container: { flex: 1 },
    statsBar: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginTop: 16,
      borderRadius: 20,
      paddingVertical: 12,
      alignItems: 'center',
    },
    statItem: { flex: 1, alignItems: 'center', gap: 4 },
    statValue: { fontSize: 20, fontWeight: 'bold' },
    statLabel: { fontSize: 12 },
    statDivider: { width: 1, height: 30 },
    content: { padding: 16, paddingBottom: 30 },
    pvzCard: {
      borderRadius: 20,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    pvzCardActive: {
      borderColor: colors.primary,
    },
    pvzHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
      gap: 8,
    },
    pvzTitleRow: { flex: 1, gap: 6 },
    pvzName: { fontSize: 18, fontWeight: 'bold' },
    activeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 4,
      backgroundColor: colors.primaryLight,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    activeBadgeText: {
      fontSize: 11,
      color: colors.primary,
      fontWeight: '600',
    },
    pvzActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    selectButton: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor: colors.primaryLight,
    },
    selectButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
    },
    actionButton: { padding: 4 },
    pvzInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    pvzInfoText: { fontSize: 14, flex: 1 },
    pvzFooter: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
    },
    pvzEmployeesBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    pvzEmployeesText: {
      fontSize: 11,
      color: colors.primary,
      fontWeight: '500',
    },
  });
