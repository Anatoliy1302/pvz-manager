// src/screens/owner/AdminPermissionsScreen.tsx
import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import ScreenHeader from '../../components/common/ScreenHeader';
import EmptyState from '../../components/common/EmptyState';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useScreenToast } from '../../hooks/useScreenToast';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import DataService from '../../services/DataService';
import { colors } from '../../constants/colors';
import { formatPhoneForDisplay } from '../../utils/phoneHelpers';
import {
  Shield,
  Check,
  Building2,
  ChevronRight,
  ChevronDown,
  Info,
} from 'lucide-react-native';

interface AdminUser {
  id: string;
  name: string;
  phone: string;
  pvzIds: string[];
}

export default function AdminPermissionsScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { ui, screen } = useThemedScreen();
  const styles = createStyles(screen);
  const { showError } = useScreenToast();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [pvzs, setPvzs] = useState<{ id: string; name: string }[]>([]);
  const [expandedAdmin, setExpandedAdmin] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    if (!user?.id) return;
    try {
      const users = await DataService.getUsers();
      const allPvzs = await DataService.getPvzs();
      const ownerPvzs = allPvzs.filter((p) => p.ownerId === user.id);
      const ownerPvzIds = new Set(ownerPvzs.map((p) => p.id));
      setPvzs(ownerPvzs);

      const adminUsers = users.filter(
        (u) =>
          u.role === 'admin' &&
          u.status === 'active' &&
          (ownerPvzIds.has(u.pvzId || '') ||
            (u.pvzIds || []).some((id) => ownerPvzIds.has(id)))
      );

      let migrated = false;
      for (const admin of adminUsers) {
        const currentIds = (admin.pvzIds || (admin.pvzId ? [admin.pvzId] : [])).filter((id) =>
          ownerPvzIds.has(id)
        );
        const needsMigration =
          admin.permissionLevel !== 'full' ||
          currentIds.length === 0;

        if (needsMigration) {
          const pvzIds =
            currentIds.length > 0
              ? currentIds
              : ownerPvzs.length > 0
                ? [ownerPvzs[0].id]
                : [];
          await DataService.updateAdminPermissions(admin.id, {
            permissionLevel: 'full',
            pvzIds,
          });
          migrated = true;
        }
      }

      const latestUsers = migrated ? await DataService.getUsers() : users;
      const latestAdmins = latestUsers.filter(
        (u) =>
          u.role === 'admin' &&
          u.status === 'active' &&
          (ownerPvzIds.has(u.pvzId || '') ||
            (u.pvzIds || []).some((id) => ownerPvzIds.has(id)))
      );

      setAdmins(
        latestAdmins.map((admin) => ({
          id: admin.id,
          name: admin.name,
          phone: admin.phone,
          pvzIds: (admin.pvzIds || (admin.pvzId ? [admin.pvzId] : [])).filter((id) =>
            ownerPvzIds.has(id)
          ),
        }))
      );
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
      showError(t('alerts.network.loadAdminsFailed'));
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [user?.id])
  );

  const getPvzNamesLabel = (admin: AdminUser) => {
    const names = admin.pvzIds
      .map((id) => pvzs.find((p) => p.id === id)?.name)
      .filter(Boolean) as string[];
    if (names.length === 0) return t('screens.adminPermissions.noPvzAssigned');
    if (names.length <= 2) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  };

  const togglePvzForAdmin = (adminId: string, pvzId: string, currentlyHas: boolean) => {
    const admin = admins.find((a) => a.id === adminId);
    if (!admin) return;

    if (currentlyHas && admin.pvzIds.length <= 1) {
      showError(t('alerts.confirm.minOnePvz'));
      return;
    }

    const newPvzIds = currentlyHas
      ? admin.pvzIds.filter((id) => id !== pvzId)
      : [...admin.pvzIds, pvzId];

    DataService.updateAdminPermissions(adminId, {
      permissionLevel: 'full',
      pvzIds: newPvzIds,
    })
      .then(loadData)
      .catch(() => showError(t('alerts.network.updatePvzListFailed')));
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const renderAdminCard = (admin: AdminUser) => {
    const isExpanded = expandedAdmin === admin.id;

    return (
      <View key={admin.id} style={[styles.adminCard, ui.card]}>
        <TouchableOpacity
          style={[
            styles.adminHeader,
            isExpanded && { borderBottomWidth: 1, borderBottomColor: screen.border },
          ]}
          onPress={() => setExpandedAdmin(isExpanded ? null : admin.id)}
          activeOpacity={0.75}
        >
          <View style={styles.adminIcon}>
            <Shield size={22} color={colors.primary} />
          </View>
          <View style={styles.adminInfo}>
            <Text style={[styles.adminName, { color: screen.text }]}>{admin.name}</Text>
            <Text style={[styles.adminDetails, { color: screen.textSecondary }]}>
              {formatPhoneForDisplay(admin.phone)}
            </Text>
            <Text style={[styles.adminPvzSummary, { color: screen.textSecondary }]}>
              {getPvzNamesLabel(admin)}
            </Text>
          </View>
          {isExpanded ? (
            <ChevronDown size={18} color={screen.textSecondary} style={styles.chevron} />
          ) : (
            <ChevronRight size={18} color={screen.textSecondary} style={styles.chevron} />
          )}
        </TouchableOpacity>

        {isExpanded && (
          <View style={[styles.expandedContent, { borderTopColor: screen.border }]}>
            <Text style={[styles.levelHint, { color: screen.textSecondary }]}>
              {t('screens.adminPermissions.levelHint')}
            </Text>

            <View style={styles.pvzList}>
              <Text style={[styles.pvzListTitle, { color: screen.textSecondary }]}>
                {t('screens.adminPermissions.pvzListTitle')}
              </Text>
              {pvzs.map((pvzItem) => {
                const hasAccess = admin.pvzIds.includes(pvzItem.id);
                return (
                  <TouchableOpacity
                    key={pvzItem.id}
                    style={[
                      styles.pvzItem,
                      { backgroundColor: ui.input.backgroundColor },
                      hasAccess && styles.pvzItemActive,
                    ]}
                    onPress={() => togglePvzForAdmin(admin.id, pvzItem.id, hasAccess)}
                  >
                    <Building2
                      size={16}
                      color={hasAccess ? colors.primary : screen.textSecondary}
                    />
                    <Text
                      style={[
                        styles.pvzName,
                        { color: screen.text },
                        hasAccess && styles.pvzNameActive,
                      ]}
                    >
                      {pvzItem.name}
                    </Text>
                    {hasAccess && <Check size={16} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <ThemedSafeAreaView style={styles.container}>
      <ScreenHeader title={t('screens.adminPermissions.title')} onBack={() => navigation.goBack()} />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={[styles.infoCard, ui.card]}>
          <Info size={18} color={colors.primary} />
          <Text style={[styles.infoText, { color: screen.textSecondary }]}>
            {t('screens.adminPermissions.info')}
          </Text>
        </View>

        {admins.length === 0 ? (
          <EmptyState
            icon={Shield}
            title={t('screens.adminPermissions.emptyTitle')}
            description={t('screens.adminPermissions.emptyDesc')}
            buttonText={t('screens.owner.inviteShort')}
            onButtonPress={() => navigation.navigate('EmployeeAddForm')}
          />
        ) : (
          admins.map(renderAdminCard)
        )}
      </ScrollView>
    </ThemedSafeAreaView>
  );
}

const createStyles = (screen: ReturnType<typeof useThemedScreen>['screen']) =>
  StyleSheet.create({
    container: { flex: 1 },
    content: { padding: 16, paddingBottom: 30 },
    infoCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: screen.border,
    },
    infoText: { flex: 1, fontSize: 13, lineHeight: 19 },
    adminCard: {
      borderRadius: 16,
      marginBottom: 12,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: screen.border,
    },
    adminHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
    },
    adminIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    adminInfo: { flex: 1, marginRight: 8 },
    adminName: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
    adminDetails: { fontSize: 12 },
    adminPvzSummary: { fontSize: 11, marginTop: 4 },
    chevron: { marginLeft: 2 },
    expandedContent: {
      paddingHorizontal: 16,
      paddingBottom: 16,
    },
    levelHint: {
      fontSize: 12,
      lineHeight: 17,
      marginBottom: 12,
    },
    pvzList: {
      marginTop: 4,
    },
    pvzListTitle: {
      fontSize: 13,
      fontWeight: '500',
      marginBottom: 10,
    },
    pvzItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      marginBottom: 6,
    },
    pvzItemActive: {
      backgroundColor: colors.primaryLight,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    pvzName: { flex: 1, fontSize: 14 },
    pvzNameActive: { color: colors.primary, fontWeight: '500' },
  });
