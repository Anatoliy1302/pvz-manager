// src/screens/admin/SwapRequestsScreen.tsx
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import ScreenHeader from '../../components/common/ScreenHeader';
import EmptyState from '../../components/common/EmptyState';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useScreenToast } from '../../hooks/useScreenToast';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { colors as staticColors } from '../../constants/colors';
import DataService from '../../services/DataService';
import notificationService from '../../services/NotificationService';
import PermissionGate from '../../components/common/PermissionGate';
import { formatDate } from '../../utils/dateHelpers';
import { getDateLocale } from '../../i18n';
import type { SwapRequest } from '../../services/data/swapRequestDataService';
import { FLAT_LIST_PERF } from '../../constants/flatListPerf';
import { Check, X, Repeat, User, Calendar, Building2 } from 'lucide-react-native';

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';

export default function SwapRequestsScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { pvz, user, userPvzs, hasPermission } = useAuth();
  const { colors, screen, ui } = useThemedScreen();
  const styles = useMemo(() => createStyles(screen, colors), [screen, colors]);
  const { showError, showSuccess } = useScreenToast();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<SwapRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');

  const filterOptions = useMemo(
    (): { key: StatusFilter; label: string }[] => [
      { key: 'pending', label: t('common.filters.pending') },
      { key: 'approved', label: t('common.filters.approved') },
      { key: 'rejected', label: t('common.filters.rejected') },
      { key: 'all', label: t('common.filters.all') },
    ],
    [t]
  );

  const canModerate =
    user?.role === 'owner' ||
    hasPermission('canManageSchedule') ||
    hasPermission('canManageShifts');
  const showPvzOnCard = (userPvzs?.length ?? 0) > 1;
  const swapEventKey = pvz?.id ? `swap_requests_${pvz.id}` : '';

  const loadRequests = useCallback(async () => {
    try {
      if (!pvz?.id) {
        setRequests([]);
        return;
      }
      const all = await DataService.getSwapRequestsByPvz(pvz.id);
      setRequests(all);
    } catch (error) {
      console.error('Ошибка загрузки обменов:', error);
    } finally {
      setLoading(false);
    }
  }, [pvz?.id]);

  useFocusEffect(
    useCallback(() => {
      loadRequests();
      if (!swapEventKey) return () => {};
      const unsub = DataService.subscribe(swapEventKey, loadRequests);
      return () => unsub();
    }, [loadRequests, swapEventKey])
  );

  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === 'pending').length,
    [requests]
  );

  const filteredRequests = useMemo(() => {
    if (statusFilter === 'all') return requests;
    return requests.filter((r) => r.status === statusFilter);
  }, [requests, statusFilter]);

  const formatCreatedAt = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(getDateLocale(), {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusLabel = (status: SwapRequest['status']) => {
    switch (status) {
      case 'approved':
        return t('common.status.approvedShort');
      case 'rejected':
        return t('common.status.rejectedShort');
      default:
        return t('common.status.waiting');
    }
  };

  const getStatusStyle = (status: SwapRequest['status']) => {
    switch (status) {
      case 'approved':
        return styles.statusApproved;
      case 'rejected':
        return styles.statusRejected;
      default:
        return styles.statusPending;
    }
  };

  const approveRequest = (request: SwapRequest) => {
    Alert.alert(
      t('alerts.confirm.approveSwapTitle'),
      t('alerts.confirm.approveSwap', {
        from: request.fromEmployeeName,
        to: request.toEmployeeName,
      }),
      [
        { text: t('common.actions.cancel'), style: 'cancel' },
        {
          text: t('common.actions.approve'),
          onPress: async () => {
            try {
              if (!pvz?.id) return;
              const approved = await DataService.approveSwapRequest(pvz.id, request.id);
              if (!approved) {
                showError(t('alerts.network.requestAlreadyProcessed'));
                return;
              }

              await notificationService.notifySwapApprovedByAdmin(
                request.fromEmployeeId,
                request.toEmployeeId,
                request.fromEmployeeName,
                request.toEmployeeName,
                request.fromDate
              );

              await loadRequests();
              showSuccess(t('alerts.success.swapApproved'));
            } catch {
              showError(t('alerts.network.approveSwapFailed'));
            }
          },
        },
      ]
    );
  };

  const rejectRequest = (request: SwapRequest) => {
    Alert.alert(
      t('alerts.confirm.rejectSwapTitle'),
      t('alerts.confirm.rejectSwap', {
        from: request.fromEmployeeName,
        to: request.toEmployeeName,
      }),
      [
        { text: t('common.actions.cancel'), style: 'cancel' },
        {
          text: t('common.actions.reject'),
          style: 'destructive',
          onPress: async () => {
            try {
              if (!pvz?.id) return;
              const rejected = await DataService.rejectSwapRequest(pvz.id, request.id);
              if (!rejected) {
                showError(t('alerts.network.requestAlreadyProcessed'));
                return;
              }

              await notificationService.notifySwapRejectedByAdmin(
                request.fromEmployeeId,
                request.toEmployeeId,
                request.fromEmployeeName,
                request.toEmployeeName
              );

              await loadRequests();
              showSuccess(t('alerts.success.swapRejected'));
            } catch {
              showError(t('alerts.network.rejectSwapFailed'));
            }
          },
        },
      ]
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRequests();
    setRefreshing(false);
  };

  const emptyDescription =
    statusFilter === 'pending'
      ? t('screens.swaps.emptyPending')
      : statusFilter === 'all'
        ? t('screens.swaps.emptyAll')
        : t('screens.swaps.emptyFiltered', {
            status: filterOptions.find((f) => f.key === statusFilter)?.label ?? '',
          });

  const headerSubtitle = pvz?.name
    ? t('screens.swaps.headerSubtitle', { pvz: pvz.name, count: pendingCount })
    : undefined;

  const renderRequestItem = useCallback(
    ({ item: request }: { item: SwapRequest }) => (
      <View style={[styles.requestCard, ui.card]}>
        <View style={styles.requestHeader}>
          <View style={styles.requestHeaderLeft}>
            <User size={16} color={colors.primary} />
            <Text style={[styles.employeeName, ui.title]}>
              {request.fromEmployeeName} ↔ {request.toEmployeeName}
            </Text>
          </View>
          <View style={[styles.statusBadge, getStatusStyle(request.status)]}>
            <Text style={styles.statusBadgeText}>{getStatusLabel(request.status)}</Text>
          </View>
        </View>

        {showPvzOnCard && pvz?.name ? (
          <View style={styles.detailRow}>
            <Building2 size={14} color={screen.textSecondary} />
            <Text style={styles.detailText}>{pvz.name}</Text>
          </View>
        ) : null}

        <View style={styles.requestDetails}>
          <View style={styles.detailRow}>
            <Calendar size={14} color={screen.textSecondary} />
            <Text style={styles.detailText}>
              {request.fromEmployeeName}: {formatDate(request.fromDate, 'dayMonth')}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Repeat size={14} color={screen.textSecondary} />
            <Text style={styles.detailText}>
              {request.toEmployeeName}: {formatDate(request.toDate, 'dayMonth')}
            </Text>
          </View>
          {request.reason ? (
            <Text style={styles.reasonText}>«{request.reason}»</Text>
          ) : null}
          <Text style={styles.createdAt}>
            {t('screens.swaps.submittedAt', { date: formatCreatedAt(request.createdAt) })}
          </Text>
        </View>

        {request.status === 'pending' && canModerate && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.approveButton}
              onPress={() => approveRequest(request)}
            >
              <Check size={18} color={staticColors.success} />
              <Text style={styles.approveText}>{t('common.actions.approve')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rejectButton}
              onPress={() => rejectRequest(request)}
            >
              <X size={18} color={staticColors.danger} />
              <Text style={styles.rejectText}>{t('common.actions.reject')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    ),
    [ui, screen, colors, t, showPvzOnCard, pvz, canModerate, approveRequest, rejectRequest, getStatusStyle, getStatusLabel, formatCreatedAt]
  );

  return (
    <PermissionGate
      anyOf={['canManageSchedule', 'canManageShifts']}
      navigation={navigation}
      title={t('common.access.denied')}
      description={t('screens.swaps.accessDeniedDesc')}
    >
      <ThemedSafeAreaView style={styles.container}>
        <ScreenHeader title={t('screens.swaps.adminTitle')} onBack={() => navigation.goBack()} />
        {headerSubtitle ? (
          <Text style={[styles.headerSubtitle, ui.subtitle]}>{headerSubtitle}</Text>
        ) : null}

        <View style={styles.filterRow}>
          {filterOptions.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[
                styles.filterChip,
                statusFilter === option.key && styles.filterChipActive,
              ]}
              onPress={() => setStatusFilter(option.key)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterChipText,
                  statusFilter === option.key && styles.filterChipTextActive,
                ]}
              >
                {option.label}
                {option.key === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={filteredRequests}
            keyExtractor={(item) => item.id}
            renderItem={renderRequestItem}
            contentContainerStyle={styles.content}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
            ListEmptyComponent={
              <EmptyState icon={Repeat} title={t('screens.swaps.emptyRequestsTitle')} description={emptyDescription} />
            }
            {...FLAT_LIST_PERF}
          />
        )}
      </ThemedSafeAreaView>
    </PermissionGate>
  );
}

const createStyles = (
  screen: ReturnType<typeof useThemedScreen>['screen'],
  colors: ReturnType<typeof useThemedScreen>['colors']
) =>
  StyleSheet.create({
    container: { flex: 1 },
    headerSubtitle: {
      fontSize: 12,
      textAlign: 'center',
      marginBottom: 8,
      paddingHorizontal: 16,
    },
    filterRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: 16,
      marginBottom: 8,
    },
    filterChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: screen.card,
      borderWidth: 1,
      borderColor: screen.border,
    },
    filterChipActive: {
      backgroundColor: colors.primaryLight,
      borderColor: colors.primary,
    },
    filterChipText: {
      fontSize: 12,
      color: screen.textSecondary,
    },
    filterChipTextActive: {
      color: colors.primary,
      fontWeight: '600',
    },
    loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    content: { padding: 16, paddingBottom: 32 },
    requestCard: {
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
    },
    requestHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 8,
      marginBottom: 12,
    },
    requestHeaderLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    employeeName: { flex: 1, fontSize: 15, fontWeight: '600' },
    statusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    statusBadgeText: { fontSize: 11, fontWeight: '600', color: '#FFFFFF' },
    statusPending: { backgroundColor: staticColors.warning },
    statusApproved: { backgroundColor: staticColors.success },
    statusRejected: { backgroundColor: staticColors.danger },
    requestDetails: { gap: 6 },
    detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    detailText: { fontSize: 13, color: screen.textSecondary, flex: 1 },
    reasonText: {
      fontSize: 12,
      fontStyle: 'italic',
      color: screen.textSecondary,
      marginTop: 4,
    },
    createdAt: { fontSize: 11, color: screen.textSecondary, marginTop: 6 },
    actionButtons: { flexDirection: 'row', gap: 12, marginTop: 14 },
    approveButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: '#E8F5E9',
    },
    approveText: { fontSize: 14, color: staticColors.success, fontWeight: '500' },
    rejectButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: '#FFEBEE',
    },
    rejectText: { fontSize: 14, color: staticColors.danger, fontWeight: '500' },
  });
