// src/screens/owner/AdvanceRequestsScreen.tsx
import React, { useState, useCallback } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import ScreenHeader from '../../components/common/ScreenHeader';
import EmptyState from '../../components/common/EmptyState';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useScreenToast } from '../../hooks/useScreenToast';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { getDateLocale } from '../../i18n';
import DataService from '../../services/DataService';
import { colors } from '../../constants/colors';
import { AdvanceRequest } from '../../types/payment';
import { 
  getAdvanceRequests, 
  updateAdvanceRequestStatus,
  addPayment
} from '../../services/PaymentService';
import { 
  ChevronLeft, 
  CheckCircle, 
  XCircle, 
  Clock,
  User,
  Calendar,
  Send,
} from 'lucide-react-native';
import MoneyIcon from '../../components/icons/MoneyIcon';
import { FLAT_LIST_PERF } from '../../constants/flatListPerf';

export default function AdvanceRequestsScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { user, pvz } = useAuth();
  const { ui } = useThemedScreen();
  const { showError, showSuccess } = useScreenToast();
  const [refreshing, setRefreshing] = useState(false);
  const [requests, setRequests] = useState<AdvanceRequest[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  const loadRequests = async () => {
    if (!pvz?.id) return;
    
    try {
      const allRequests = await getAdvanceRequests(pvz.id, { refresh: true });
      allRequests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setRequests(allRequests);
    } catch (error) {
      console.error('Ошибка загрузки запросов:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadRequests();
      if (!pvz?.id) {
        return undefined;
      }
      const unsubscribe = DataService.subscribe(`advance_requests_${pvz.id}`, loadRequests);
      return () => unsubscribe();
    }, [pvz?.id])
  );

  const handleApprove = async (request: AdvanceRequest) => {
    Alert.alert(
      t('screens.advanceRequests.confirmTitle'),
      t('alerts.confirm.approveAdvance', {
        name: request.employeeName,
        amount: request.amount.toLocaleString(getDateLocale()),
      }),
      [
        { text: t('common.actions.cancel'), style: 'cancel' },
        {
          text: t('common.actions.approve'),
          onPress: async () => {
            try {
              await updateAdvanceRequestStatus(
                pvz!.id,
                request.id,
                'approved',
                user!.id,
                user!.name || t('common.roles.ownerShort')
              );
              
              // Автоматически создаём выплату
              await addPayment(pvz!.id, {
                employeeId: request.employeeId,
                employeeName: request.employeeName,
                amount: request.amount,
                type: 'advance',
                periodStart: request.periodStart,
                periodEnd: request.periodEnd,
                note: t('screens.advanceRequests.advanceNote', {
                  reason: request.reason || t('screens.advanceRequests.noReason'),
                }),
                createdBy: user!.id,
                createdByName: user!.name || t('common.roles.ownerShort'),
                pvzId: pvz!.id,
              });
              
              await loadRequests();
              showSuccess(t('alerts.success.advanceApproved'));
            } catch (error) {
              showError(t('alerts.network.approveAdvanceFailed'));
            }
          }
        }
      ]
    );
  };

  const handleReject = async (request: AdvanceRequest) => {
    Alert.alert(
      t('screens.advanceRequests.rejectTitle'),
      t('screens.advanceRequests.rejectMessage', {
        name: request.employeeName,
        amount: request.amount.toLocaleString(getDateLocale()),
      }),
      [
        { text: t('common.actions.cancel'), style: 'cancel' },
        {
          text: t('common.actions.reject'),
          style: 'destructive',
          onPress: async () => {
            try {
              await updateAdvanceRequestStatus(
                pvz!.id,
                request.id,
                'rejected',
                user!.id,
                user!.name || t('common.roles.ownerShort')
              );
              await loadRequests();
              showSuccess(t('alerts.success.advanceRejected'));
            } catch (error) {
              showError(t('alerts.network.rejectAdvanceFailed'));
            }
          }
        }
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(getDateLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle size={18} color={colors.success} />;
      case 'rejected': return <XCircle size={18} color={colors.danger} />;
      default: return <Clock size={18} color={colors.warning} />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'approved': return t('common.status.approvedShort');
      case 'rejected': return t('common.status.rejectedShort');
      default: return t('common.status.pending');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return colors.success;
      case 'rejected': return colors.danger;
      default: return colors.warning;
    }
  };

  const filteredRequests = requests.filter(r => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRequests();
    setRefreshing(false);
  };

  const renderRequestItem = useCallback(
    ({ item: request }: { item: AdvanceRequest }) => (
      <View style={[styles.requestCard, ui.card]}>
        <View style={styles.requestHeader}>
          <View style={styles.employeeInfo}>
            <User size={16} color={colors.primary} />
            <Text style={[styles.employeeName, ui.title]}>{request.employeeName}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(request.status) + '20' }]}>
            {getStatusIcon(request.status)}
            <Text style={[styles.statusText, { color: getStatusColor(request.status) }]}>
              {getStatusText(request.status)}
            </Text>
          </View>
        </View>

        <View style={styles.amountRow}>
          <MoneyIcon size={16} color={colors.success} />
          <Text style={styles.amountText}>{request.amount.toLocaleString()} ₽</Text>
        </View>

        <View style={styles.periodRow}>
          <Calendar size={14} color={colors.gray} />
          <Text style={styles.periodText}>
            {formatDate(request.periodStart)} — {formatDate(request.periodEnd)}
          </Text>
        </View>

        {request.reason && (
          <Text style={styles.reasonText}>📝 {request.reason}</Text>
        )}

        <Text style={styles.requestDate}>
          {t('screens.advanceRequests.requestFrom', { date: formatDate(request.createdAt) })}
        </Text>

        {request.status === 'pending' && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.approveButton}
              onPress={() => handleApprove(request)}
            >
              <CheckCircle size={18} color={colors.success} />
              <Text style={styles.approveButtonText}>{t('common.actions.approve')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rejectButton}
              onPress={() => handleReject(request)}
            >
              <XCircle size={18} color={colors.danger} />
              <Text style={styles.rejectButtonText}>{t('common.actions.reject')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {request.reviewedAt && (
          <Text style={styles.reviewedText}>
            {t('screens.finance.reviewedAt', {
              date: formatDate(request.reviewedAt),
              reviewer: request.reviewedByName ? `(${request.reviewedByName})` : '',
            })}
          </Text>
        )}
      </View>
    ),
    [ui, t, handleApprove, handleReject, getStatusColor, getStatusIcon, getStatusText, formatDate]
  );

  return (
    <ThemedSafeAreaView style={styles.container}>
      <ScreenHeader
        title={t('screens.finance.advances')}
        onBack={() => navigation.goBack()}
        right={
          pendingCount > 0 ? (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>{pendingCount}</Text>
            </View>
          ) : undefined
        }
      />

      <View style={[styles.filterContainer, ui.card]}>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'pending' && styles.filterActive]}
          onPress={() => setFilter('pending')}
        >
          <Text style={[styles.filterText, filter === 'pending' && styles.filterTextActive]}>
            {t('screens.advanceRequests.pendingFilter', { count: pendingCount })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'approved' && styles.filterActive]}
          onPress={() => setFilter('approved')}
        >
          <Text style={[styles.filterText, filter === 'approved' && styles.filterTextActive]}>
            {t('common.filters.approved')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'rejected' && styles.filterActive]}
          onPress={() => setFilter('rejected')}
        >
          <Text style={[styles.filterText, filter === 'rejected' && styles.filterTextActive]}>
            {t('common.filters.rejected')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'all' && styles.filterActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            {t('common.filters.all')}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredRequests}
        keyExtractor={(item) => item.id}
        renderItem={renderRequestItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        ListEmptyComponent={
          <EmptyState
            icon={Send}
            title={t('common.empty.default')}
            description={t('screens.advanceRequests.emptyDesc')}
          />
        }
        {...FLAT_LIST_PERF}
      />
    </ThemedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' },
  pendingBadge: {
    backgroundColor: colors.danger,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  pendingBadgeText: { fontSize: 12, fontWeight: 'bold', color: '#FFFFFF' },

  filterContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    gap: 12,
  },
  filterButton: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#F5F5F5' },
  filterActive: { backgroundColor: colors.primary },
  filterText: { fontSize: 13, color: '#666666' },
  filterTextActive: { color: '#FFFFFF' },

  content: { padding: 16, paddingBottom: 30 },

  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText: { fontSize: 16, color: '#999999', marginTop: 16 },
  emptySubtext: { fontSize: 12, color: '#CCCCCC', marginTop: 4, textAlign: 'center' },

  requestCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  requestHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  employeeInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  employeeName: { fontSize: 15, fontWeight: '500', color: '#1A1A1A' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: '500' },

  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  amountText: { fontSize: 18, fontWeight: 'bold', color: colors.success },

  periodRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  periodText: { fontSize: 13, color: '#666666' },

  reasonText: { fontSize: 12, color: colors.primary, marginBottom: 8, fontStyle: 'italic' },

  requestDate: { fontSize: 11, color: '#999999', marginTop: 4 },

  actionButtons: { flexDirection: 'row', gap: 12, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  approveButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: '#E8F5E9' },
  approveButtonText: { fontSize: 14, color: colors.success, fontWeight: '500' },
  rejectButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: '#FFEBEE' },
  rejectButtonText: { fontSize: 14, color: colors.danger, fontWeight: '500' },

  reviewedText: { fontSize: 10, color: colors.primary, marginTop: 8, textAlign: 'right' },
});