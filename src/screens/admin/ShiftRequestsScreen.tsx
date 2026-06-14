// src/screens/admin/ShiftRequestsScreen.tsx
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
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
import { Check, X, Clock, User, Calendar, Building2 } from 'lucide-react-native';
import PermissionGate from '../../components/common/PermissionGate';
import { formatDate } from '../../utils/dateHelpers';
import { getDateLocale } from '../../i18n';
import { User as UserType } from '../../types/user';

interface ShiftRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  pvzId?: string;
  pvzName?: string;
  reason?: string;
}

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';

function requestBelongsToPvz(
  request: ShiftRequest,
  pvzId: string,
  users: UserType[]
): boolean {
  if (request.pvzId) return request.pvzId === pvzId;
  const employee = users.find((u) => u.id === request.employeeId);
  if (!employee) return false;
  if (employee.pvzId === pvzId) return true;
  return employee.pvzIds?.includes(pvzId) ?? false;
}

export default function ShiftRequestsScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { pvz, user, userPvzs, hasPermission } = useAuth();
  const { colors, screen, ui } = useThemedScreen();
  const styles = useMemo(() => createStyles(screen, colors), [screen, colors]);
  const { showError, showSuccess } = useScreenToast();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
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

  const canApprove =
    user?.role === 'owner' ||
    hasPermission('canManageSchedule') ||
    hasPermission('canManageShifts');
  const showPvzOnCard = (userPvzs?.length ?? 0) > 1;

  const loadRequests = useCallback(async () => {
    try {
      const [allRequests, users] = await Promise.all([
        DataService.getAllShiftRequests(),
        DataService.getUsers(),
      ]);

      if (!pvz?.id) {
        setRequests([]);
        return;
      }

      const pvzRequests = allRequests
        .filter((r) => requestBelongsToPvz(r, pvz.id, users))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setRequests(pvzRequests);
    } catch (error) {
      console.error('Ошибка загрузки заявок:', error);
    } finally {
      setLoading(false);
    }
  }, [pvz?.id]);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        notificationService.deliverPendingStaffAlerts(user.id);
      }
      loadRequests();
      const unsub = DataService.subscribe('all_shift_requests', loadRequests);
      return () => unsub();
    }, [loadRequests, user?.id])
  );

  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === 'pending').length,
    [requests]
  );

  const filteredRequests = useMemo(() => {
    if (statusFilter === 'all') return requests;
    return requests.filter((r) => r.status === statusFilter);
  }, [requests, statusFilter]);

  const approveRequest = async (request: ShiftRequest) => {
    Alert.alert(
      t('alerts.confirm.approveRequestTitle'),
      t('alerts.confirm.approveRequest', {
        name: request.employeeName,
        date: formatDate(request.date, 'dayMonth'),
      }),
      [
        { text: t('common.actions.cancel'), style: 'cancel' },
        {
          text: t('common.actions.approve'),
          onPress: async () => {
            try {
              await DataService.approveShiftRequest({
                ...request,
                pvzId: request.pvzId || pvz?.id,
                pvzName: request.pvzName || pvz?.name,
              });

              await notificationService.notifyShiftRequestDecision({
                recipientUserId: request.employeeId,
                date: request.date,
                status: 'approved',
                pvzName: request.pvzName || pvz?.name,
              });

              await loadRequests();
              showSuccess(t('alerts.success.requestApproved'));
            } catch {
              showError(t('alerts.network.approveRequestFailed'));
            }
          },
        },
      ]
    );
  };

  const rejectRequest = async (request: ShiftRequest) => {
    Alert.alert(
      t('alerts.confirm.rejectRequestTitle'),
      t('alerts.confirm.rejectRequest', { name: request.employeeName }),
      [
        { text: t('common.actions.cancel'), style: 'cancel' },
        {
          text: t('common.actions.reject'),
          style: 'destructive',
          onPress: async () => {
            try {
              await DataService.updateShiftRequest(request.id, { status: 'rejected' });

              await notificationService.notifyShiftRequestDecision({
                recipientUserId: request.employeeId,
                date: request.date,
                status: 'rejected',
                pvzName: request.pvzName || pvz?.name,
              });

              await loadRequests();
              showSuccess(t('alerts.success.requestRejected'));
            } catch {
              showError(t('alerts.network.rejectRequestFailed'));
            }
          },
        },
      ]
    );
  };

  const formatCreatedAt = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(getDateLocale(), {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusLabel = (status: ShiftRequest['status']) => {
    switch (status) {
      case 'approved':
        return t('screens.requests.statusApproved');
      case 'rejected':
        return t('screens.requests.statusRejected');
      default:
        return t('screens.requests.statusWaiting');
    }
  };

  const getStatusStyle = (status: ShiftRequest['status']) => {
    switch (status) {
      case 'approved':
        return styles.statusApproved;
      case 'rejected':
        return styles.statusRejected;
      default:
        return styles.statusPending;
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRequests();
    setRefreshing(false);
  };

  const emptyDescription =
    statusFilter === 'pending'
      ? t('screens.requests.emptyPending')
      : statusFilter === 'all'
        ? t('screens.requests.emptyAll')
        : t('screens.requests.emptyFiltered', {
            status: filterOptions.find((f) => f.key === statusFilter)?.label ?? '',
          });

  const headerSubtitle = pvz?.name
    ? t('screens.requests.headerSubtitle', { pvz: pvz.name, count: pendingCount })
    : undefined;

  return (
    <PermissionGate permission="canViewRequests" navigation={navigation}>
      <ThemedSafeAreaView style={styles.container}>
        <ScreenHeader title={t('screens.requests.title')} onBack={() => navigation.goBack()} />
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
                {option.key === 'pending' && pendingCount > 0
                  ? ` (${pendingCount})`
                  : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <ScrollView
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
            contentContainerStyle={styles.content}
          >
            {filteredRequests.length === 0 ? (
              <EmptyState
                icon={Clock}
                title={t('screens.requests.emptyTitle')}
                description={emptyDescription}
              />
            ) : (
              filteredRequests.map((request) => (
                <View key={request.id} style={[styles.requestCard, ui.card]}>
                  <View style={styles.requestHeader}>
                    <View style={styles.requestHeaderLeft}>
                      <User size={16} color={colors.primary} />
                      <Text style={[styles.employeeName, ui.title]}>{request.employeeName}</Text>
                    </View>
                    <View style={[styles.statusBadge, getStatusStyle(request.status)]}>
                      <Text style={styles.statusBadgeText}>{getStatusLabel(request.status)}</Text>
                    </View>
                  </View>

                  {showPvzOnCard && (request.pvzName || pvz?.name) ? (
                    <View style={styles.detailRow}>
                      <Building2 size={14} color={screen.textSecondary} />
                      <Text style={styles.detailText}>{request.pvzName || pvz?.name}</Text>
                    </View>
                  ) : null}

                  <View style={styles.requestDetails}>
                    <View style={styles.detailRow}>
                      <Calendar size={14} color={screen.textSecondary} />
                      <Text style={styles.detailText}>{formatDate(request.date, 'long')}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Clock size={14} color={screen.textSecondary} />
                      <Text style={styles.detailText}>
                        {request.startTime} — {request.endTime}
                      </Text>
                    </View>
                    {request.reason ? (
                      <Text style={styles.reasonText}>«{request.reason}»</Text>
                    ) : null}
                    <Text style={styles.createdAt}>
                      {t('screens.requests.submittedAt', { date: formatCreatedAt(request.createdAt) })}
                    </Text>
                  </View>

                  {request.status === 'pending' && canApprove && (
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
              ))
            )}
          </ScrollView>
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
      paddingBottom: 12,
    },
    filterChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: screen.card,
      borderWidth: 1,
      borderColor: screen.border,
    },
    filterChipActive: {
      backgroundColor: colors.primaryLight,
      borderColor: colors.primary,
    },
    filterChipText: {
      fontSize: 13,
      color: screen.textSecondary,
      fontWeight: '500',
    },
    filterChipTextActive: {
      color: colors.primary,
    },
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 40,
    },
    content: { padding: 16, paddingBottom: 30 },

    requestCard: {
      borderRadius: 20,
      padding: 16,
      marginBottom: 12,
    },
    requestHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
      gap: 8,
    },
    requestHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    employeeName: { fontSize: 16, fontWeight: '600' },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    statusPending: { backgroundColor: colors.primaryLight },
    statusApproved: { backgroundColor: 'rgba(76, 175, 80, 0.15)' },
    statusRejected: { backgroundColor: 'rgba(244, 67, 54, 0.12)' },
    statusBadgeText: {
      fontSize: 11,
      fontWeight: '600',
      color: screen.textSecondary,
    },

    requestDetails: { gap: 8, marginBottom: 16 },
    detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    detailText: { fontSize: 14, color: screen.textSecondary },
    reasonText: {
      fontSize: 13,
      color: screen.textSecondary,
      fontStyle: 'italic',
      marginTop: 2,
    },
    createdAt: { fontSize: 11, color: screen.textSecondary, marginTop: 4, opacity: 0.8 },

    actionButtons: { flexDirection: 'row', gap: 12 },
    approveButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: 'rgba(76, 175, 80, 0.12)',
      borderWidth: 1,
      borderColor: 'rgba(76, 175, 80, 0.25)',
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
      backgroundColor: 'rgba(244, 67, 54, 0.1)',
      borderWidth: 1,
      borderColor: 'rgba(244, 67, 54, 0.2)',
    },
    rejectText: { fontSize: 14, color: staticColors.danger, fontWeight: '500' },
  });
