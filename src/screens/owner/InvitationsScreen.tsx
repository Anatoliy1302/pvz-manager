import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import ScreenHeader from '../../components/common/ScreenHeader';
import EmptyState from '../../components/common/EmptyState';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../constants/colors';
import DataService from '../../services/DataService';
import { formatPhoneForDisplay } from '../../utils/phoneHelpers';
import {
  Mail,
  X,
  RefreshCw,
  UserPlus,
  Phone,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  Info,
} from 'lucide-react-native';

interface Invitation {
  id: string;
  phone: string;
  name: string;
  role: 'employee' | 'admin';
  pvzId: string;
  pvzName: string;
  status: 'pending' | 'accepted' | 'expired';
  createdAt: string;
  invitedBy: string;
}

type StatusFilter = 'all' | 'pending' | 'accepted' | 'expired';

export default function InvitationsScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { user, revokeInvitation } = useAuth();
  const { ui, screen, theme } = useThemedScreen();
  const styles = createStyles(screen, theme === 'dark');
  const [refreshing, setRefreshing] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [resendingId, setResendingId] = useState<string | null>(null);

  const loadInvitations = useCallback(async () => {
    if (!user?.id) return;
    try {
      const loaded = await DataService.getInvitations(user.id);
      setInvitations(loaded);
    } catch (error) {
      console.error('Ошибка загрузки приглашений:', error);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadInvitations();
      if (!user?.id) return undefined;
      const unsubscribe = DataService.subscribe(`invitations_${user.id}`, loadInvitations);
      return () => unsubscribe();
    }, [user?.id, loadInvitations])
  );

  const counts = useMemo(
    () => ({
      all: invitations.length,
      pending: invitations.filter((i) => i.status === 'pending').length,
      accepted: invitations.filter((i) => i.status === 'accepted').length,
      expired: invitations.filter((i) => i.status === 'expired').length,
    }),
    [invitations]
  );

  const filteredInvitations = useMemo(() => {
    if (statusFilter === 'all') return invitations;
    return invitations.filter((i) => i.status === statusFilter);
  }, [invitations, statusFilter]);

  const filters = useMemo<{ key: StatusFilter; label: string }[]>(
    () => [
      { key: 'all', label: t('common.filters.all') },
      { key: 'pending', label: t('common.filters.pending') },
      { key: 'accepted', label: t('common.filters.accepted') },
      { key: 'expired', label: t('common.filters.expired') },
    ],
    [t]
  );

  const deleteInvitation = (invitation: Invitation) => {
    Alert.alert(
      t('screens.owner.cancelInviteTitle'),
      t('screens.owner.cancelInviteMessage', { name: invitation.name }),
      [
        { text: t('common.actions.no'), style: 'cancel' },
        {
          text: t('common.actions.cancel'),
          style: 'destructive',
          onPress: async () => {
            try {
              await revokeInvitation(invitation.id);
              setInvitations((prev) => prev.filter((i) => i.id !== invitation.id));
              Alert.alert(t('common.success.done'), t('alerts.success.inviteCancelled'));
            } catch (error: any) {
              Alert.alert(t('common.error.title'), error.message || t('alerts.network.cancelInviteFailed'));
            }
          },
        },
      ]
    );
  };

  const resendInvitation = (invitation: Invitation) => {
    if (!user?.id) return;
    const displayPhone = formatPhoneForDisplay(invitation.phone);

    Alert.alert(
      t('screens.owner.resendInviteTitle'),
      t('screens.owner.resendInviteMessage', { name: invitation.name, phone: displayPhone }),
      [
        { text: t('common.actions.cancel'), style: 'cancel' },
        {
          text: t('screens.owner.resend'),
          onPress: async () => {
            setResendingId(invitation.id);
            try {
              const updated = await DataService.resendInvitation(user.id, invitation.id);
              setInvitations((prev) =>
                prev.map((i) => (i.id === invitation.id ? { ...i, ...updated } : i))
              );
              Alert.alert(
                t('common.success.done'),
                t('alerts.success.inviteUpdated', { name: invitation.name, phone: displayPhone })
              );
            } catch (error: any) {
              Alert.alert(t('common.error.title'), error.message || t('alerts.network.resendInviteFailed'));
            } finally {
              setResendingId(null);
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return t('common.time.today');
    if (diffDays === 1) return t('common.time.yesterday');
    if (diffDays < 7) return t('common.time.daysAgoShort', { days: diffDays });
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  const getStatusBadge = (status: string) => {
    const isDark = theme === 'dark';
    switch (status) {
      case 'accepted':
        return {
          text: t('screens.owner.invitationStatusAccepted'),
          color: colors.success,
          bg: isDark ? 'rgba(76, 175, 80, 0.2)' : '#E8F5E9',
          icon: CheckCircle,
        };
      case 'expired':
        return {
          text: t('screens.owner.invitationStatusExpired'),
          color: colors.danger,
          bg: isDark ? 'rgba(229, 57, 53, 0.2)' : '#FFEBEE',
          icon: XCircle,
        };
      default:
        return {
          text: t('screens.owner.invitationStatusPending'),
          color: colors.warning,
          bg: isDark ? 'rgba(255, 152, 0, 0.2)' : '#FFF3E0',
          icon: Clock,
        };
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInvitations();
    setRefreshing(false);
  };

  const emptyDescription =
    statusFilter === 'all'
      ? t('screens.owner.emptyInvitesDesc')
      : t('screens.owner.emptyInvitesFilter', {
          status: filters.find((f) => f.key === statusFilter)?.label ?? '',
        });

  return (
    <ThemedSafeAreaView style={styles.container}>
      <ScreenHeader
        title={t('screens.owner.invitations')}
        onBack={() => navigation.goBack()}
        right={
          <TouchableOpacity
            onPress={() => navigation.navigate('EmployeeAddForm')}
            accessibilityLabel={t('screens.owner.inviteEmployee')}
          >
            <UserPlus size={24} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={[styles.infoBanner, ui.card]}>
          <Info size={18} color={colors.primary} />
          <Text style={[styles.infoText, { color: screen.textSecondary }]}>
            {t('screens.owner.inviteHint')}
          </Text>
        </View>

        {invitations.length > 0 && (
          <>
            <View style={[styles.statsBar, ui.card]}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.warning }]}>{counts.pending}</Text>
                <Text style={[styles.statLabel, { color: screen.textSecondary }]}>{t('common.filters.pending')}</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: screen.border }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.success }]}>{counts.accepted}</Text>
                <Text style={[styles.statLabel, { color: screen.textSecondary }]}>{t('common.filters.accepted')}</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: screen.border }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.danger }]}>{counts.expired}</Text>
                <Text style={[styles.statLabel, { color: screen.textSecondary }]}>{t('common.filters.expired')}</Text>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {filters.map((filter) => {
                const active = statusFilter === filter.key;
                const count = counts[filter.key];
                return (
                  <TouchableOpacity
                    key={filter.key}
                    style={[
                      styles.filterChip,
                      { borderColor: screen.border, backgroundColor: ui.input.backgroundColor },
                      active && styles.filterChipActive,
                    ]}
                    onPress={() => setStatusFilter(filter.key)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        { color: screen.textSecondary },
                        active && styles.filterChipTextActive,
                      ]}
                    >
                      {filter.label} ({count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        {filteredInvitations.length === 0 ? (
          <EmptyState
            icon={Mail}
            title={invitations.length === 0 ? t('screens.owner.emptyInvitesTitle') : t('common.empty.notFound')}
            description={emptyDescription}
            buttonText={invitations.length === 0 ? t('screens.owner.inviteShort') : undefined}
            onButtonPress={
              invitations.length === 0 ? () => navigation.navigate('EmployeeAddForm') : undefined
            }
          />
        ) : (
          filteredInvitations.map((invitation) => {
            const status = getStatusBadge(invitation.status);
            const StatusIcon = status.icon;
            const isResending = resendingId === invitation.id;

            return (
              <View key={invitation.id} style={[styles.invitationCard, ui.card]}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderMain}>
                    <Text style={[styles.employeeName, ui.title]}>{invitation.name}</Text>
                    <View style={styles.employeeInfo}>
                      <Phone size={12} color={screen.textSecondary} />
                      <Text style={[styles.employeePhone, { color: screen.textSecondary }]}>
                        {formatPhoneForDisplay(invitation.phone)}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                    <StatusIcon size={12} color={status.color} />
                    <Text style={[styles.statusText, { color: status.color }]}>{status.text}</Text>
                  </View>
                </View>

                <View style={styles.cardDetails}>
                  <View style={styles.detailRow}>
                    <Users size={12} color={screen.textSecondary} />
                    <Text style={[styles.detailText, { color: screen.textSecondary }]}>
                      {invitation.role === 'admin' ? t('common.roles.adminShort') : t('common.roles.employeeShort')}
                    </Text>
                  </View>
                  <Text style={[styles.detailText, { color: screen.textSecondary }]}>
                    {invitation.pvzName || t('common.pvz.default')}
                  </Text>
                  <Text style={[styles.invitationDate, { color: screen.textSecondary }]}>
                    {t('screens.owner.sentAt', { date: formatDate(invitation.createdAt) })}
                  </Text>
                </View>

                {invitation.status === 'pending' && (
                  <View style={[styles.cardActions, { borderTopColor: screen.border }]}>
                    <TouchableOpacity
                      style={styles.resendButton}
                      onPress={() => resendInvitation(invitation)}
                      disabled={isResending}
                    >
                      <RefreshCw size={14} color={colors.primary} />
                      <Text style={styles.resendText}>
                        {isResending ? t('screens.owner.resending') : t('screens.owner.resend')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={() => deleteInvitation(invitation)}
                    >
                      <X size={14} color={colors.danger} />
                      <Text style={styles.cancelText}>{t('common.actions.cancel')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </ThemedSafeAreaView>
  );
}

const createStyles = (
  screen: ReturnType<typeof useThemedScreen>['screen'],
  _isDark: boolean
) =>
  StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { paddingBottom: 30 },
    infoBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginHorizontal: 16,
      marginTop: 16,
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: screen.border,
    },
    infoText: { flex: 1, fontSize: 13, lineHeight: 19 },
    statsBar: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 16,
      paddingVertical: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: screen.border,
    },
    statItem: { flex: 1, alignItems: 'center', gap: 2 },
    statValue: { fontSize: 20, fontWeight: 'bold' },
    statLabel: { fontSize: 11 },
    statDivider: { width: 1, height: 28 },
    filterRow: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 4,
      gap: 8,
    },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
    },
    filterChipActive: {
      backgroundColor: colors.primaryLight,
      borderColor: colors.primary,
    },
    filterChipText: { fontSize: 13, fontWeight: '500' },
    filterChipTextActive: { color: colors.primary, fontWeight: '600' },
    invitationCard: {
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: screen.border,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
      gap: 8,
    },
    cardHeaderMain: { flex: 1 },
    employeeName: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
    employeeInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    employeePhone: { fontSize: 13 },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    statusText: { fontSize: 11, fontWeight: '500' },
    cardDetails: { gap: 6, marginBottom: 4 },
    detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    detailText: { fontSize: 13 },
    invitationDate: { fontSize: 11, marginTop: 4 },
    cardActions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingTop: 12,
      marginTop: 8,
      borderTopWidth: 1,
    },
    resendButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    resendText: { fontSize: 13, color: colors.primary, fontWeight: '500' },
    cancelButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    cancelText: { fontSize: 13, color: colors.danger, fontWeight: '500' },
  });
