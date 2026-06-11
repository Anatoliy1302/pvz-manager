// src/screens/profile/AdminProfileScreen.tsx
import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { colors as staticColors } from '../../constants/colors';
import ProfileHeader from '../../components/common/ProfileHeader';
import { formatPhoneForDisplay } from '../../utils/phoneHelpers';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { getAppVersion } from '../../constants/legal';
import {
  LogOut,
  Info,
  FileText,
  LifeBuoy,
  ChevronRight,
  Building2,
  ClipboardList,
  TrendingUp,
  User,
  Settings,
  BarChart3,
  Wallet,
  History,
  CalendarDays,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

interface MenuItem {
  title: string;
  icon: LucideIcon;
  screen: string;
  description: string;
}

export default function AdminProfileScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { user, pvz, userPvzs, signOut, hasPermission } = useAuth();
  const { colors, screen } = useThemedScreen();
  const styles = createStyles(colors, screen);

  const accountItems: MenuItem[] = useMemo(
    () => [
      {
        title: t('screens.profile.editProfile'),
        icon: User,
        screen: 'EditProfile',
        description: t('screens.profile.editProfileDescFull'),
      },
      {
        title: t('screens.profile.settings'),
        icon: Settings,
        screen: 'Settings',
        description: t('screens.profile.settingsDesc'),
      },
    ],
    [t]
  );

  const personalItems = useMemo(() => {
    const items: MenuItem[] = [];

    if (hasPermission('canViewShifts')) {
      items.push(
        {
          title: t('screens.profile.mySchedule'),
          icon: CalendarDays,
          screen: 'EmployeeSchedule',
          description: t('screens.profile.myScheduleDesc'),
        },
        {
          title: t('screens.profile.timesheet'),
          icon: BarChart3,
          screen: 'Timesheet',
          description: t('screens.profile.timesheetDesc'),
        },
        {
          title: t('screens.profile.finance'),
          icon: Wallet,
          screen: 'EmployeeFinance',
          description: t('screens.profile.financeDesc'),
        },
        {
          title: t('screens.profile.shiftHistory'),
          icon: History,
          screen: 'ShiftHistory',
          description: t('screens.profile.shiftHistoryDesc'),
        }
      );
    }
    if (hasPermission('canRequestShifts')) {
      items.push({
        title: t('screens.profile.myRequests'),
        icon: ClipboardList,
        screen: 'Requests',
        description: t('screens.profile.myRequestsDesc'),
      });
    }
    if (hasPermission('canViewStats')) {
      items.push({
        title: t('screens.profile.statistics'),
        icon: TrendingUp,
        screen: 'Statistics',
        description: t('screens.profile.statisticsDesc'),
      });
    }

    return items;
  }, [hasPermission, t]);

  const aboutItems: MenuItem[] = useMemo(
    () => [
      {
        title: t('screens.profile.support'),
        icon: LifeBuoy,
        screen: 'Support',
        description: t('screens.profile.supportDesc'),
      },
      {
        title: t('screens.profile.aboutApp'),
        icon: Info,
        screen: 'About',
        description: t('screens.profile.aboutDesc'),
      },
      {
        title: t('screens.profile.privacy'),
        icon: FileText,
        screen: 'Privacy',
        description: t('screens.profile.privacyDesc'),
      },
    ],
    [t]
  );

  const handleSignOut = () => {
    Alert.alert(t('alerts.confirm.logoutTitle'), t('alerts.confirm.logout'), [
      { text: t('common.actions.cancel'), style: 'cancel' },
      {
        text: t('common.actions.logout'),
        style: 'destructive',
        onPress: async () => {
          await signOut();
        },
      },
    ]);
  };

  const renderMenuItem = (item: MenuItem, index: number) => (
    <TouchableOpacity
      key={item.screen + item.title}
      style={[styles.menuItem, index === 0 && styles.menuItemFirst]}
      onPress={() => navigation.navigate(item.screen)}
      activeOpacity={0.7}
    >
      <View style={styles.menuIcon}>
        <item.icon size={20} color={colors.primary} />
      </View>
      <View style={styles.menuContent}>
        <Text style={styles.menuTitle}>{item.title}</Text>
        <Text style={styles.menuDescription}>{item.description}</Text>
      </View>
      <ChevronRight size={18} color={staticColors.grayLight} />
    </TouchableOpacity>
  );

  const displayPhone = user?.phone ? formatPhoneForDisplay(user.phone) : '';

  return (
    <ThemedSafeAreaView>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <ProfileHeader
          name={user?.name || t('common.roles.admin')}
          phone={displayPhone}
          role="admin"
          avatarIcon="shield"
          avatarUri={user?.avatarUri}
          onEditPress={() => navigation.navigate('EditProfile')}
        />

        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>{t('common.roles.adminBadge')}</Text>
        </View>

        {pvz && (
          <View style={styles.pvzCard}>
            <View style={styles.pvzIconWrap}>
              <Building2 size={20} color={colors.primary} />
            </View>
            <View style={styles.pvzCardContent}>
              <Text style={styles.pvzLabel}>{t('common.pvz.current')}</Text>
              <Text style={styles.pvzCardTitle}>{pvz.name}</Text>
              {pvz.address ? (
                <Text style={styles.pvzCardSubtitle} numberOfLines={2}>
                  {pvz.address}
                </Text>
              ) : null}
              {pvz.workingHours ? (
                <Text style={styles.pvzCardMeta}>{pvz.workingHours}</Text>
              ) : null}
              {userPvzs.length > 1 && (
                <Text style={styles.pvzCardHint}>
                  {t('common.pvz.countSwitchHintAlt', { count: userPvzs.length })}
                </Text>
              )}
            </View>
          </View>
        )}

        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>{t('screens.profile.account')}</Text>
          {accountItems.map(renderMenuItem)}
        </View>

        {personalItems.length > 0 && (
          <View style={styles.menuSection}>
            <Text style={styles.sectionTitle}>{t('screens.profile.personal')}</Text>
            {personalItems.map(renderMenuItem)}
          </View>
        )}

        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>{t('screens.profile.about')}</Text>
          {aboutItems.map(renderMenuItem)}
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleSignOut}>
          <LogOut size={20} color={staticColors.danger} />
          <Text style={styles.logoutText}>{t('common.actions.logout')}</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>{t('common.version', { version: getAppVersion() })}</Text>
      </ScrollView>
    </ThemedSafeAreaView>
  );
}

const createStyles = (
  colors: ReturnType<typeof useThemedScreen>['colors'],
  screen: ReturnType<typeof useThemedScreen>['screen']
) =>
  StyleSheet.create({
    scrollContent: { paddingBottom: 30 },
    roleBadge: {
      marginHorizontal: 16,
      marginTop: 12,
      paddingVertical: 8,
      paddingHorizontal: 12,
      backgroundColor: colors.primaryLight,
      borderRadius: 12,
      alignItems: 'center',
    },
    roleBadgeText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.primary,
    },
    pvzCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      backgroundColor: screen.card,
      marginHorizontal: 16,
      marginTop: 16,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: screen.border,
    },
    pvzIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pvzCardContent: { flex: 1 },
    pvzLabel: { fontSize: 11, color: screen.textSecondary, marginBottom: 2 },
    pvzCardTitle: { fontSize: 16, fontWeight: '600', color: screen.text, marginBottom: 4 },
    pvzCardSubtitle: { fontSize: 13, color: screen.textSecondary, lineHeight: 18 },
    pvzCardMeta: { fontSize: 12, color: colors.primary, marginTop: 6, fontWeight: '500' },
    pvzCardHint: { fontSize: 12, color: screen.textSecondary, marginTop: 6 },
    menuSection: {
      backgroundColor: screen.card,
      marginHorizontal: 16,
      marginTop: 16,
      borderRadius: 20,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: screen.border,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: screen.textSecondary,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: screen.border,
    },
    menuItemFirst: { borderTopWidth: 0 },
    menuIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    menuContent: { flex: 1 },
    menuTitle: { fontSize: 16, fontWeight: '500', color: screen.text, marginBottom: 2 },
    menuDescription: { fontSize: 12, color: screen.textSecondary },
    logoutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: screen.card,
      marginHorizontal: 16,
      marginTop: 24,
      marginBottom: 16,
      paddingVertical: 14,
      borderRadius: 30,
      borderWidth: 1,
      borderColor: staticColors.dangerLight,
    },
    logoutText: { fontSize: 16, fontWeight: '500', color: staticColors.danger },
    versionText: {
      textAlign: 'center',
      fontSize: 12,
      color: screen.textSecondary,
      marginBottom: 20,
    },
  });
