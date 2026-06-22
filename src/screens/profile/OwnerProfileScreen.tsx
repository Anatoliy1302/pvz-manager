// src/screens/profile/OwnerProfileScreen.tsx
import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../hooks/useSubscription';
import { useProfileQuery } from '../../hooks/queries';
import { colors as staticColors } from '../../constants/colors';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import ProfileHeader from '../../components/common/ProfileHeader';
import { formatPhoneForDisplay } from '../../utils/phoneHelpers';
import { getAppVersion, openLegalDocument } from '../../constants/legal';
import {
  LogOut,
  Trash2,
  ChevronRight,
  Shield,
  Building2,
  BarChart3,
  User,
  Settings,
  Info,
  FileText,
  LifeBuoy,
  Mail,
  Sigma,
  HandCoins,
  Crown,
} from 'lucide-react-native';

type MenuItem = {
  title: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  screen: string;
  description: string;
};

type MenuSection = {
  title: string;
  items: MenuItem[];
};

export default function OwnerProfileScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { user, pvz, userPvzs, signOut } = useAuth();
  const { isTrialActive, isPro, subscription } = useSubscription();
  const { colors, screen } = useThemedScreen();
  const styles = createStyles(colors, screen);
  const { refetch: refetchProfile } = useProfileQuery(user?.id);

  useFocusEffect(
    useCallback(() => {
      void refetchProfile();
    }, [refetchProfile])
  );

  const handleSignOut = () => {
    Alert.alert(
      t('alerts.confirm.logoutTitle'),
      t('alerts.confirm.logout'),
      [
        { text: t('common.actions.cancel'), style: 'cancel' },
        {
          text: t('common.actions.logout'),
          style: 'destructive',
          onPress: async () => {
            await signOut();
          },
        },
      ]
    );
  };

  const subscriptionStatusLabel = (() => {
    if (isTrialActive) return t('subscription.trialPlanName');
    if (isPro && subscription?.subscriptionPeriodEndsAt) {
      const date = new Date(subscription.subscriptionPeriodEndsAt).toLocaleDateString('ru-RU');
      return t('screens.profile.subscriptionProUntil', { date });
    }
    if (isPro) return t('subscription.plans.pro.name');
    return t('screens.profile.subscriptionFree');
  })();

  const accountItems = [
    {
      title: t('subscription.title'),
      icon: Crown,
      screen: 'Subscription',
      description: subscriptionStatusLabel,
    },
    { title: t('screens.profile.editProfile'), icon: User, screen: 'EditProfile', description: t('screens.profile.editProfileDescContact') },
    { title: t('screens.profile.settings'), icon: Settings, screen: 'Settings', description: t('screens.profile.settingsDesc') },
  ];

  const managementSections: MenuSection[] = [
    {
      title: t('screens.profile.sections.organization'),
      items: [
        { title: t('screens.owner.invitations'), icon: Mail, screen: 'Invitations', description: t('screens.owner.invitationsDesc') },
        { title: t('screens.owner.permissions'), icon: Shield, screen: 'EmployeePermissions', description: t('screens.owner.permissionsDesc') },
      ],
    },
    {
      title: t('screens.profile.sections.salary'),
      items: [
        { title: t('screens.owner.advanceRequests'), icon: HandCoins, screen: 'AdvanceRequests', description: t('screens.owner.advanceRequestsDesc') },
        { title: t('screens.finance.formulas'), icon: Sigma, screen: 'SalaryFormulas', description: t('screens.owner.formulasDesc') },
      ],
    },
    {
      title: t('screens.profile.sections.reports'),
      items: [
        { title: t('screens.owner.analytics'), icon: BarChart3, screen: 'OwnerAnalytics', description: t('screens.owner.analyticsDesc') },
      ],
    },
  ];

  const renderMenuItem = (item: MenuItem, index: number) => (
    <TouchableOpacity
      key={`${item.screen}-${item.title}`}
      style={[styles.menuItem, index === 0 && styles.menuItemFirst]}
      onPress={() => navigation.navigate(item.screen)}
      activeOpacity={0.7}
    >
      <View style={styles.menuIcon}>
        <item.icon size={22} color={colors.primary} />
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
          name={user?.name || t('common.roles.ownerShort')}
          phone={displayPhone}
          role="owner"
          avatarIcon="crown"
          avatarUri={user?.avatarUri}
        />

        {pvz && (
          <View style={styles.pvzCard}>
            <Building2 size={18} color={colors.primary} />
            <View style={styles.pvzCardContent}>
              <Text style={styles.pvzCardTitle}>{pvz.name}</Text>
              <Text style={styles.pvzCardSubtitle} numberOfLines={1}>
                {pvz.address}
              </Text>
              {userPvzs.length > 1 && (
                <Text style={styles.pvzCardMeta}>
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

        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>{t('screens.profile.management')}</Text>
          {managementSections.map((section) => (
            <View key={section.title}>
              <Text style={styles.subsectionTitle}>{section.title}</Text>
              {section.items.map(renderMenuItem)}
            </View>
          ))}
        </View>

        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>{t('screens.profile.about')}</Text>

          <TouchableOpacity
            style={[styles.menuItem, styles.menuItemFirst]}
            onPress={() => navigation.navigate('Support')}
            activeOpacity={0.7}
          >
            <View style={styles.menuIcon}>
              <LifeBuoy size={22} color={colors.primary} />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>{t('screens.profile.support')}</Text>
              <Text style={styles.menuDescription}>{t('screens.profile.supportDesc')}</Text>
            </View>
            <ChevronRight size={18} color={staticColors.grayLight} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate('About')}
            activeOpacity={0.7}
          >
            <View style={styles.menuIcon}>
              <Info size={22} color={colors.primary} />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>{t('screens.profile.aboutApp')}</Text>
              <Text style={styles.menuDescription}>{t('screens.profile.aboutDesc')}</Text>
            </View>
            <ChevronRight size={18} color={staticColors.grayLight} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => openLegalDocument('privacy')}
            activeOpacity={0.7}
          >
            <View style={styles.menuIcon}>
              <FileText size={22} color={colors.primary} />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>{t('screens.profile.privacy')}</Text>
              <Text style={styles.menuDescription}>{t('screens.profile.privacyDesc')}</Text>
            </View>
            <ChevronRight size={18} color={staticColors.grayLight} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => openLegalDocument('terms')}
            activeOpacity={0.7}
          >
            <View style={styles.menuIcon}>
              <FileText size={22} color={colors.primary} />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>{t('screens.profile.terms')}</Text>
              <Text style={styles.menuDescription}>{t('screens.profile.termsDesc')}</Text>
            </View>
            <ChevronRight size={18} color={staticColors.grayLight} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => openLegalDocument('consent')}
            activeOpacity={0.7}
          >
            <View style={styles.menuIcon}>
              <FileText size={22} color={colors.primary} />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>{t('screens.profile.consent')}</Text>
              <Text style={styles.menuDescription}>{t('screens.profile.consentDesc')}</Text>
            </View>
            <ChevronRight size={18} color={staticColors.grayLight} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.deleteAccountLink}
          onPress={() => navigation.navigate('DeleteAccount')}
          activeOpacity={0.7}
          testID="profile-delete-account-link"
        >
          <Trash2 size={20} color={staticColors.danger} />
          <Text style={styles.deleteAccountText}>{t('screens.deleteAccount.profileLink')}</Text>
        </TouchableOpacity>

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

  pvzCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: screen.card,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  pvzCardContent: { flex: 1 },
  pvzCardTitle: { fontSize: 16, fontWeight: '600', color: screen.text, marginBottom: 4 },
  pvzCardSubtitle: { fontSize: 13, color: screen.textSecondary },
  pvzCardMeta: { fontSize: 12, color: colors.primary, marginTop: 6 },

  menuSection: {
    backgroundColor: screen.card,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: screen.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  subsectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: screen.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    opacity: 0.85,
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

  deleteAccountLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FFCDD2',
    backgroundColor: '#FFF5F5',
    minHeight: 48,
  },
  deleteAccountText: { fontSize: 15, fontWeight: '600', color: staticColors.danger },
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
  versionText: { textAlign: 'center', fontSize: 12, color: screen.textSecondary, marginTop: 16, marginBottom: 20 },
});
