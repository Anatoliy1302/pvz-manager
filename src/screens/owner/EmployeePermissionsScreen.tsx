// src/screens/owner/EmployeePermissionsScreen.tsx
import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
  RefreshControl,
  TextInput,
} from 'react-native';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import ScreenHeader from '../../components/common/ScreenHeader';
import EmptyState from '../../components/common/EmptyState';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../constants/colors';
import DataService from '../../services/DataService';
import { EmployeePermissions, defaultPermissions } from '../../types/user';
import { normalizePermissions } from '../../utils/permissionHelpers';
import { formatPhoneForDisplay } from '../../utils/phoneHelpers';
import {
  Shield,
  User,
  Eye,
  Edit,
  Users,
  Calendar,
  ClipboardList,
  Inbox,
  Crown,
  ChevronRight,
  ChevronDown,
  Building2,
  Info,
  Search,
  X,
} from 'lucide-react-native';

interface EmployeeWithPermissions {
  id: string;
  name: string;
  phone: string;
  permissions: EmployeePermissions;
}

type PermissionKey = keyof EmployeePermissions;

type PermissionRow = {
  key: PermissionKey;
  label: string;
  icon: typeof Eye;
  dangerous?: boolean;
};

const EXTENDED_KEYS: PermissionKey[] = [
  'canManageEmployees',
  'canManageSchedule',
  'canManageShifts',
  'canViewRequests',
  'isFullAdmin',
];

const DANGEROUS_KEYS: PermissionKey[] = [
  'isFullAdmin',
  'canManageEmployees',
  'canManageSchedule',
  'canManageShifts',
];

export default function EmployeePermissionsScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { pvz, userPvzs } = useAuth();
  const { ui, screen, theme } = useThemedScreen();
  const styles = createStyles(screen, theme === 'dark');

  const basicPermissionRows = useMemo<PermissionRow[]>(
    () => [
      { key: 'canViewShifts', label: t('screens.employeePermissions.permViewShifts'), icon: Eye },
      { key: 'canRequestShifts', label: t('screens.employeePermissions.permRequestShifts'), icon: Edit },
      { key: 'canSwapShifts', label: t('screens.employeePermissions.permSwapShifts'), icon: Shield },
      { key: 'canViewStats', label: t('screens.employeePermissions.permViewStats'), icon: Users },
    ],
    [t]
  );

  const extendedPermissionRows = useMemo<PermissionRow[]>(
    () => [
      { key: 'canManageEmployees', label: t('screens.employeePermissions.permManageEmployees'), icon: Users, dangerous: true },
      { key: 'canManageSchedule', label: t('screens.employeePermissions.permManageSchedule'), icon: Calendar, dangerous: true },
      { key: 'canManageShifts', label: t('screens.employeePermissions.permManageShifts'), icon: ClipboardList, dangerous: true },
      { key: 'canViewRequests', label: t('screens.employeePermissions.permViewRequests'), icon: Inbox },
      { key: 'isFullAdmin', label: t('screens.employeePermissions.permFullAdmin'), icon: Crown, dangerous: true },
    ],
    [t]
  );

  const allRows = useMemo(
    () => [...basicPermissionRows, ...extendedPermissionRows],
    [basicPermissionRows, extendedPermissionRows]
  );
  const [employees, setEmployees] = useState<EmployeeWithPermissions[]>([]);
  const [adminCount, setAdminCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadEmployees = async () => {
    if (!pvz?.id) return;

    try {
      const users = await DataService.getUsers();
      const employeesList = users.filter(
        (u) => u.role === 'employee' && u.status === 'active' && u.pvzId === pvz.id
      );
      const adminsOnPvz = users.filter(
        (u) => u.role === 'admin' && u.status === 'active' && u.pvzId === pvz.id
      );

      setAdminCount(adminsOnPvz.length);
      setEmployees(
        employeesList.map((emp) => ({
          id: emp.id,
          name: emp.name,
          phone: emp.phone,
          permissions: normalizePermissions(emp.permissions),
        }))
      );
    } catch (error) {
      console.error('Ошибка загрузки сотрудников:', error);
      Alert.alert(t('common.error.title'), t('alerts.network.loadEmployeesFailed'));
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadEmployees();
      const unsubscribe = DataService.subscribe('pvz_users', loadEmployees);
      return () => unsubscribe();
    }, [pvz?.id])
  );

  const filteredEmployees = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return employees;
    const digits = query.replace(/[^0-9]/g, '');
    return employees.filter((emp) => {
      if (emp.name.toLowerCase().includes(query)) return true;
      if (digits && emp.phone.replace(/[^0-9]/g, '').includes(digits)) return true;
      return false;
    });
  }, [employees, searchQuery]);

  const countEnabled = (permissions: EmployeePermissions) =>
    allRows.filter((row) => permissions[row.key]).length;

  const buildNextPermissions = (
    previous: EmployeePermissions,
    permission: PermissionKey,
    value: boolean
  ): EmployeePermissions => {
    if (permission === 'isFullAdmin' && value) {
      const next: EmployeePermissions = { ...previous };
      (Object.keys(defaultPermissions) as PermissionKey[]).forEach((key) => {
        next[key] = true;
      });
      return next;
    }

    if (permission === 'isFullAdmin' && !value) {
      const next: EmployeePermissions = { ...previous, isFullAdmin: false };
      EXTENDED_KEYS.filter((k) => k !== 'isFullAdmin').forEach((key) => {
        next[key] = false;
      });
      return next;
    }

    return { ...previous, [permission]: value };
  };

  const applyPermissionUpdate = async (
    employeeId: string,
    permission: PermissionKey,
    value: boolean
  ) => {
    const previous = employees.find((e) => e.id === employeeId);
    if (!previous) return;

    const nextPermissions = buildNextPermissions(previous.permissions, permission, value);

    setEmployees((prev) =>
      prev.map((emp) =>
        emp.id === employeeId ? { ...emp, permissions: nextPermissions } : emp
      )
    );

    try {
      await DataService.updateEmployeePermissions(employeeId, nextPermissions);
    } catch (error) {
      console.error('Ошибка обновления прав:', error);
      setEmployees((prev) =>
        prev.map((emp) => (emp.id === employeeId ? previous : emp))
      );
      Alert.alert(t('common.error.title'), t('alerts.network.updatePermissionsFailed'));
    }
  };

  const updatePermission = (employeeId: string, permission: PermissionKey, value: boolean) => {
    const label =
      allRows.find((r) => r.key === permission)?.label || permission;

    if (permission === 'isFullAdmin' && !value) {
      Alert.alert(
        t('screens.employeePermissions.revokeFullTitle'),
        t('screens.employeePermissions.revokeFullMessage'),
        [
          { text: t('common.actions.cancel'), style: 'cancel' },
          {
            text: t('screens.employeePermissions.revoke'),
            style: 'destructive',
            onPress: () => applyPermissionUpdate(employeeId, permission, value),
          },
        ]
      );
      return;
    }

    if (value && DANGEROUS_KEYS.includes(permission)) {
      Alert.alert(
        t('screens.employeePermissions.grantTitle'),
        t('alerts.confirm.grantPermissionMessage', { label }),
        [
          { text: t('common.actions.cancel'), style: 'cancel' },
          {
            text: t('screens.employeePermissions.grant'),
            onPress: () => applyPermissionUpdate(employeeId, permission, value),
          },
        ]
      );
      return;
    }

    applyPermissionUpdate(employeeId, permission, value);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadEmployees();
    setRefreshing(false);
  };

  const toggleExpanded = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const renderPermissionRow = (
    emp: EmployeeWithPermissions,
    row: PermissionRow,
    isExtended: boolean
  ) => {
    const Icon = row.icon;
    const disabled = emp.permissions.isFullAdmin && row.key !== 'isFullAdmin';

    return (
      <View
        key={row.key}
        style={[
          styles.permissionRow,
          { borderBottomColor: screen.border },
          isExtended && [styles.permissionRowExtended, { backgroundColor: ui.input.backgroundColor }],
        ]}
      >
        <View style={styles.permissionInfo}>
          <Icon size={16} color={isExtended ? colors.primary : screen.textSecondary} />
          <Text style={[styles.permissionLabel, { color: screen.text }]}>{row.label}</Text>
        </View>
        <Switch
          value={emp.permissions[row.key]}
          onValueChange={(v) => updatePermission(emp.id, row.key, v)}
          trackColor={{ false: colors.grayLighter, true: colors.primary }}
          disabled={disabled}
        />
      </View>
    );
  };

  return (
    <ThemedSafeAreaView style={styles.container}>
      <ScreenHeader title={t('screens.employeePermissions.title')} onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {pvz && (
          <View style={[styles.pvzBadge, ui.card]}>
            <Building2 size={16} color={colors.primary} />
            <Text style={[styles.pvzBadgeText, { color: screen.text }]}>
              {t('common.pvz.label')} {pvz.name}
            </Text>
          </View>
        )}

        <View style={[styles.infoCard, ui.card]}>
          <Info size={18} color={colors.primary} />
          <Text style={[styles.infoText, { color: screen.textSecondary }]}>
            {t('screens.employeePermissions.info')}
          </Text>
        </View>

        {userPvzs.length > 1 && (
          <View style={[styles.multiPvzHint, ui.card]}>
            <Building2 size={16} color={colors.primary} />
            <Text style={[styles.multiPvzHintText, { color: screen.textSecondary }]}>
              {t('screens.employeePermissions.multiPvzHint')}
            </Text>
          </View>
        )}

        {adminCount > 0 && (
          <TouchableOpacity
            style={[styles.adminLinkCard, { backgroundColor: theme === 'dark' ? 'rgba(255,193,7,0.12)' : '#FFF8E1' }]}
            onPress={() => navigation.navigate('AdminPermissions')}
          >
            <View style={styles.adminLinkLeft}>
              <Crown size={20} color={colors.warning} />
              <View>
                <Text style={[styles.adminLinkTitle, { color: screen.text }]}>
                  {t('screens.employeePermissions.adminLinkTitle')}
                </Text>
                <Text style={[styles.adminLinkSub, { color: screen.textSecondary }]}>
                  {t('screens.employeePermissions.adminLinkSub', { count: adminCount })}
                </Text>
              </View>
            </View>
            <ChevronRight size={20} color={screen.textSecondary} />
          </TouchableOpacity>
        )}

        {employees.length > 0 && (
          <View style={[styles.searchRow, ui.card]}>
            <Search size={18} color={screen.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: screen.text }]}
              placeholder={t('screens.employeePermissions.searchPlaceholder')}
              placeholderTextColor={colors.grayLighter}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={18} color={screen.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {employees.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t('screens.employees.empty')}
            description={t('screens.employeePermissions.emptyDesc')}
            buttonText={t('screens.owner.inviteShort')}
            onButtonPress={() => navigation.navigate('EmployeeAddForm')}
          />
        ) : filteredEmployees.length === 0 ? (
          <EmptyState
            icon={Search}
            title={t('common.empty.notFound')}
            description={t('screens.employeePermissions.notFoundDesc', { query: searchQuery.trim() })}
            buttonText={t('screens.employeePermissions.resetSearch')}
            onButtonPress={() => setSearchQuery('')}
          />
        ) : (
          filteredEmployees.map((emp) => {
            const isExpanded = expandedId === emp.id;
            const enabledCount = countEnabled(emp.permissions);
            const hasExtended = EXTENDED_KEYS.some((key) => emp.permissions[key]);

            return (
              <View key={emp.id} style={[styles.employeeCard, ui.card]}>
                <TouchableOpacity
                  style={[
                    styles.employeeHeader,
                    isExpanded && { borderBottomWidth: 1, borderBottomColor: screen.border },
                  ]}
                  onPress={() => toggleExpanded(emp.id)}
                  activeOpacity={0.75}
                >
                  <View style={styles.employeeAvatar}>
                    <User size={20} color={colors.primary} />
                  </View>
                  <View style={styles.employeeInfo}>
                    <Text style={[styles.employeeName, { color: screen.text }]}>{emp.name}</Text>
                    <Text style={[styles.employeePhone, { color: screen.textSecondary }]}>
                      {formatPhoneForDisplay(emp.phone)}
                    </Text>
                    <Text style={[styles.employeeSummary, { color: screen.textSecondary }]}>
                      {t('screens.employeePermissions.rightsSummary', {
                        enabled: enabledCount,
                        total: allRows.length,
                      })}
                      {hasExtended ? t('screens.employeePermissions.hasExtended') : ''}
                    </Text>
                  </View>
                  {isExpanded ? (
                    <ChevronDown size={20} color={screen.textSecondary} />
                  ) : (
                    <ChevronRight size={20} color={screen.textSecondary} />
                  )}
                </TouchableOpacity>

                {isExpanded && (
                  <>
                    <View style={styles.permissionsSection}>
                      <Text style={[styles.permissionsGroupTitle, { color: screen.textSecondary }]}>
                        {t('screens.employeePermissions.basicGroup')}
                      </Text>
                      {basicPermissionRows.map((row) => renderPermissionRow(emp, row, false))}

                      <Text
                        style={[
                          styles.permissionsGroupTitle,
                          styles.permissionsGroupTitleExtended,
                          { color: screen.textSecondary },
                        ]}
                      >
                        {t('screens.employeePermissions.extendedGroup')}
                      </Text>
                      {extendedPermissionRows.map((row) => renderPermissionRow(emp, row, true))}
                    </View>

                    {emp.permissions.isFullAdmin && (
                      <View
                        style={[
                          styles.fullAdminNote,
                          { backgroundColor: theme === 'dark' ? 'rgba(255,193,7,0.12)' : '#FFF8E1' },
                        ]}
                      >
                        <Crown size={14} color={colors.warning} />
                        <Text style={styles.fullAdminNoteText}>
                          {t('screens.employeePermissions.fullAdminNote')}
                        </Text>
                      </View>
                    )}
                  </>
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
    content: { padding: 16, paddingBottom: 30 },
    pvzBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 12,
      borderRadius: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: screen.border,
    },
    pvzBadgeText: { fontSize: 14, fontWeight: '600', flex: 1 },
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
    multiPvzHint: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: screen.border,
    },
    multiPvzHintText: { flex: 1, fontSize: 12, lineHeight: 17 },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: screen.border,
    },
    searchInput: { flex: 1, fontSize: 15, paddingVertical: 4 },
    adminLinkCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: 16,
      padding: 14,
      marginBottom: 16,
    },
    adminLinkLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    adminLinkTitle: { fontSize: 14, fontWeight: '600' },
    adminLinkSub: { fontSize: 12, marginTop: 2 },
    employeeCard: {
      borderRadius: 20,
      marginBottom: 12,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: screen.border,
    },
    employeeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
    },
    employeeAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    employeeInfo: { flex: 1 },
    employeeName: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
    employeePhone: { fontSize: 12 },
    employeeSummary: { fontSize: 11, marginTop: 4 },
    permissionsSection: { padding: 16 },
    permissionsGroupTitle: {
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 8,
    },
    permissionsGroupTitleExtended: { marginTop: 16 },
    permissionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
    },
    permissionRowExtended: {
      marginHorizontal: -6,
      paddingHorizontal: 6,
      borderRadius: 8,
    },
    permissionInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 },
    permissionLabel: { fontSize: 14, flexShrink: 1 },
    fullAdminNote: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 12,
    },
    fullAdminNoteText: { fontSize: 12, color: colors.warning, flex: 1, lineHeight: 17 },
  });
