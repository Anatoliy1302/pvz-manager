// src/screens/common/SwapNotificationsScreen.tsx
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import ScreenHeader from '../../components/common/ScreenHeader';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useFocusEffect } from '@react-navigation/native';
import DataService from '../../services/DataService';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../constants/colors';
import { CheckCircle, XCircle, RefreshCw, Clock } from 'lucide-react-native';
import PermissionGate from '../../components/common/PermissionGate';
import type { SwapRequest } from '../../services/data/swapRequestDataService';
import { formatDate } from '../../utils/dateHelpers';

export default function SwapNotificationsScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { user, pvz } = useAuth();
  const { ui, screen } = useThemedScreen();
  const [refreshing, setRefreshing] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<SwapRequest[]>([]);
  const [historyRequests, setHistoryRequests] = useState<SwapRequest[]>([]);
  const swapEventKey = pvz?.id ? `swap_requests_${pvz.id}` : '';

  const loadSwapRequests = useCallback(async () => {
    try {
      const { pending, history } = await DataService.loadSwapRequestsForUser(pvz?.id, user?.id);
      setPendingRequests(pending);
      setHistoryRequests(history);
    } catch (error) {
      console.error('Ошибка загрузки заявок:', error);
    }
  }, [pvz?.id, user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadSwapRequests();
      if (!swapEventKey) return () => {};
      const unsub = DataService.subscribe(swapEventKey, loadSwapRequests);
      return () => unsub();
    }, [loadSwapRequests, swapEventKey])
  );

  const cancelRequest = (request: SwapRequest) => {
    Alert.alert(
      t('alerts.confirm.cancelSwapTitle'),
      t('alerts.confirm.cancelSwap', { name: request.toEmployeeName }),
      [
        { text: t('common.actions.no'), style: 'cancel' },
        {
          text: t('common.actions.yes'),
          onPress: async () => {
            try {
              if (!pvz?.id || !user?.id) return;
              const ok = await DataService.cancelSwapRequest(pvz.id, request.id, user.id);
              if (!ok) {
                Alert.alert(t('common.error.title'), t('alerts.network.cancelSwapFailed'));
                return;
              }
              await loadSwapRequests();
              Alert.alert(t('common.success.done'), t('alerts.success.swapCancelled'));
            } catch {
              Alert.alert(t('common.error.title'), t('alerts.network.cancelSwapFailed'));
            }
          },
        },
      ]
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSwapRequests();
    setRefreshing(false);
  };

  const getStatusIcon = (status: SwapRequest['status']) => {
    switch (status) {
      case 'approved':
        return <CheckCircle size={16} color={colors.success} />;
      case 'rejected':
        return <XCircle size={16} color={colors.danger} />;
      default:
        return <Clock size={16} color={colors.warning} />;
    }
  };

  const getStatusText = (status: SwapRequest['status']) => {
    switch (status) {
      case 'approved':
        return t('common.status.approved');
      case 'rejected':
        return t('common.status.rejected');
      default:
        return t('screens.swaps.waitingAdmin');
    }
  };

  const getStatusColor = (status: SwapRequest['status']) => {
    switch (status) {
      case 'approved':
        return colors.success;
      case 'rejected':
        return colors.danger;
      default:
        return colors.warning;
    }
  };

  const getStatusBadgeStyle = (status: SwapRequest['status']) => {
    switch (status) {
      case 'approved':
        return { backgroundColor: '#E8F5E9' };
      case 'rejected':
        return { backgroundColor: '#FFEBEE' };
      default:
        return { backgroundColor: '#FFF3E0' };
    }
  };

  const renderSwapCard = (request: SwapRequest, showCancel: boolean) => {
    const isInitiator = request.fromEmployeeId === user?.id;

    return (
      <View key={request.id} style={[styles.requestCard, ui.card]}>
        <View style={styles.requestHeader}>
          <Text style={[styles.employeeName, { color: screen.text }]}>
            {isInitiator
              ? t('screens.swaps.colleague', { name: request.toEmployeeName })
              : t('screens.swaps.from', { name: request.fromEmployeeName })}
          </Text>
          <View style={[styles.statusBadge, getStatusBadgeStyle(request.status)]}>
            {getStatusIcon(request.status)}
            <Text style={[styles.statusText, { color: getStatusColor(request.status) }]}>
              {getStatusText(request.status)}
            </Text>
          </View>
        </View>

        <View style={styles.swapDetails}>
          <Text style={[styles.swapLabel, { color: screen.textSecondary }]}>
            {isInitiator ? t('screens.swaps.yourShift') : t('screens.swaps.yourShiftColleague')}
          </Text>
          <Text style={[styles.swapDate, { color: screen.text }]}>
            {formatDate(isInitiator ? request.fromDate : request.toDate, 'dayMonth')}
          </Text>
          <Text style={[styles.swapLabel, { color: screen.textSecondary }]}>
            {isInitiator ? t('screens.swaps.colleagueShift') : t('screens.swaps.initiatorShift')}
          </Text>
          <Text style={[styles.swapDate, { color: screen.text }]}>
            {formatDate(isInitiator ? request.toDate : request.fromDate, 'dayMonth')}
          </Text>
        </View>

        {request.reason ? (
          <Text
            style={[
              styles.reasonText,
              { color: screen.textSecondary, borderTopColor: screen.border },
            ]}
          >
            {t('common.form.reason', { reason: request.reason })}
          </Text>
        ) : null}

        {showCancel && request.status === 'pending' && isInitiator ? (
          <TouchableOpacity style={styles.cancelButton} onPress={() => cancelRequest(request)}>
            <XCircle size={16} color={colors.danger} />
            <Text style={styles.cancelButtonText}>{t('screens.swaps.cancel')}</Text>
          </TouchableOpacity>
        ) : null}

        {request.status === 'pending' && !isInitiator ? (
          <Text style={[styles.hintText, { color: screen.textSecondary }]}>
            {t('screens.swaps.waitingAdmin')}
          </Text>
        ) : null}
      </View>
    );
  };

  return (
    <PermissionGate permission="canSwapShifts" navigation={navigation}>
      <ThemedSafeAreaView style={styles.container}>
        <ScreenHeader title={t('screens.swaps.myTitle')} onBack={() => navigation.goBack()} />

        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {pendingRequests.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, ui.sectionTitle]}>{t('screens.swaps.pending')}</Text>
              {pendingRequests.map((request) => renderSwapCard(request, true))}
            </View>
          )}

          {historyRequests.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, ui.sectionTitle]}>{t('screens.swaps.history')}</Text>
              {historyRequests.map((request) => renderSwapCard(request, false))}
            </View>
          )}

          {pendingRequests.length === 0 && historyRequests.length === 0 && (
            <View style={styles.emptyContainer}>
              <RefreshCw size={48} color={colors.grayLighter} />
              <Text style={[styles.emptyText, { color: screen.textSecondary }]}>
                {t('screens.swaps.emptyTitle')}
              </Text>
              <Text style={[styles.emptySubtext, { color: screen.textSecondary }]}>
                {t('screens.swaps.emptyHint')}
              </Text>
            </View>
          )}
        </ScrollView>
      </ThemedSafeAreaView>
    </PermissionGate>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: { marginTop: 16, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  requestCard: { borderRadius: 16, padding: 16, marginBottom: 12 },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  employeeName: { flex: 1, fontSize: 16, fontWeight: '600' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: { fontSize: 11, fontWeight: '500' },
  swapDetails: { marginBottom: 12, gap: 4 },
  swapLabel: { fontSize: 12 },
  swapDate: { fontSize: 14, fontWeight: '500', marginBottom: 8 },
  reasonText: {
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 12,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  hintText: { fontSize: 12, marginTop: 4 },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFEBEE',
  },
  cancelButtonText: { fontSize: 14, color: colors.danger, fontWeight: '500' },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 40,
  },
  emptyText: { fontSize: 16, marginTop: 16 },
  emptySubtext: { fontSize: 12, textAlign: 'center', marginTop: 8, lineHeight: 18 },
});
