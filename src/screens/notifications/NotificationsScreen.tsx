// src/screens/notifications/NotificationsScreen.tsx
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import ScreenHeader from '../../components/common/ScreenHeader';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { colors } from '../../constants/colors';
import notificationService, { NotificationRecord } from '../../services/NotificationService';
import { useAuth } from '../../context/AuthContext';
import DataService from '../../services/DataService';
import { Bell, ChevronLeft, Clock, CheckCircle, AlertCircle, Calendar, RefreshCw, Trash2 } from 'lucide-react-native';
import { FLAT_LIST_PERF } from '../../constants/flatListPerf';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { getDateLocale } from '../../i18n';

export default function NotificationsScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { screen } = useThemedScreen();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);

  const loadNotifications = async () => {
    try {
      const loaded = await notificationService.getNotifications(user?.id);
      setNotifications(loaded);
    } catch (error) {
      console.error('Ошибка загрузки уведомлений:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
      const unsubAll = DataService.subscribe('notifications', loadNotifications);
      const unsubUser = user?.id
        ? DataService.subscribe(`notifications_${user.id}`, loadNotifications)
        : () => {};
      return () => {
        unsubAll();
        unsubUser();
      };
    }, [user?.id])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  };

  const markAsRead = async (id: string) => {
    await notificationService.markAsRead(id, user?.id);
    await loadNotifications();
  };

  const markAllAsRead = async () => {
    Alert.alert(t('alerts.confirm.markAllTitle'), t('alerts.confirm.markAllNotifications'), [
      { text: t('common.actions.cancel'), style: 'cancel' },
      {
        text: t('common.actions.mark'),
        onPress: async () => {
          await notificationService.markAllAsRead(user?.id);
          await loadNotifications();
        },
      },
    ]);
  };

  const clearAll = async () => {
    Alert.alert(t('alerts.confirm.clearTitle'), t('alerts.confirm.clearNotifications'), [
      { text: t('common.actions.cancel'), style: 'cancel' },
      {
        text: t('common.actions.delete'),
        style: 'destructive',
        onPress: async () => {
          await notificationService.clearAllNotifications();
          await loadNotifications();
        },
      },
    ]);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'shift':
        return <Calendar size={20} color={colors.primary} />;
      case 'schedule':
        return <Calendar size={20} color={colors.warning} />;
      case 'request':
        return <AlertCircle size={20} color={colors.warning} />;
      case 'swap':
        return <RefreshCw size={20} color={colors.success} />;
      default:
        return <Bell size={20} color={colors.primary} />;
    }
  };

  const getTypeBgColor = (type: string) => {
    switch (type) {
      case 'shift':
        return '#E8F0FE';
      case 'schedule':
        return '#FFF3E0';
      case 'request':
        return '#FFF3E0';
      case 'swap':
        return '#E8F5E9';
      default:
        return '#F0F0F0';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return t('common.time.justNow');
    if (minutes < 60) return t('common.time.minutesAgo', { minutes });
    if (hours < 24) return t('common.time.hoursAgo', { hours });
    if (days < 7) return t('common.time.daysAgo', { days });
    return date.toLocaleDateString(getDateLocale(), { day: 'numeric', month: 'short' });
  };

  const renderNotification = ({ item }: { item: NotificationRecord }) => (
    <TouchableOpacity
      style={[
        styles.notificationCard,
        { backgroundColor: screen.card, borderColor: screen.border },
        !item.isRead && styles.unreadCard,
      ]}
      onPress={() => markAsRead(item.id)}
      activeOpacity={0.7}
    >
      <View style={[styles.notificationIcon, { backgroundColor: getTypeBgColor(item.type) }]}>
        {getTypeIcon(item.type)}
      </View>
      <View style={styles.notificationContent}>
        <Text style={[styles.notificationTitle, { color: screen.text }]}>{item.title}</Text>
        <Text style={[styles.notificationMessage, { color: screen.textSecondary }]}>{item.message}</Text>
        <View style={styles.notificationFooter}>
          <Clock size={12} color={colors.grayLight} />
          <Text style={[styles.notificationTime, { color: screen.textSecondary }]}>{formatDate(item.createdAt)}</Text>
        </View>
      </View>
      {!item.isRead && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <ThemedSafeAreaView style={styles.container}>
      <LoadingSpinner visible={loading && notifications.length === 0} />
      <ScreenHeader
        title={t('screens.notifications.title')}
        onBack={() => navigation.goBack()}
        right={
          <View style={styles.headerActions}>
            {unreadCount > 0 && (
              <TouchableOpacity onPress={markAllAsRead} style={styles.headerAction}>
                <CheckCircle size={20} color="#FFFFFF" />
              </TouchableOpacity>
            )}
            {notifications.length > 0 && (
              <TouchableOpacity onPress={clearAll} style={styles.headerAction}>
                <Trash2 size={20} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>
        }
      />

      <FlatList
        data={notifications}
        renderItem={renderNotification}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon={Bell}
              title={t('screens.notifications.emptyTitle')}
              description={t('screens.notifications.emptyDesc')}
            />
          ) : null
        }
        {...FLAT_LIST_PERF}
      />
    </ThemedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerActions: { flexDirection: 'row', gap: 4 },
  headerAction: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, paddingBottom: 30 },
  notificationCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  unreadCard: {
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  notificationIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  notificationContent: { flex: 1 },
  notificationTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A1A', marginBottom: 4 },
  notificationMessage: { fontSize: 13, color: '#666666', marginBottom: 6 },
  notificationFooter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  notificationTime: { fontSize: 11, color: '#999999' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginLeft: 8 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyText: { fontSize: 16, color: '#999999', marginTop: 16 },
  emptySubtext: { fontSize: 12, color: '#CCCCCC', textAlign: 'center', marginTop: 8 },
});