import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import { colors } from '../../constants/colors';
import {
  APP_DISPLAY_NAME,
  OPERATOR_NAME,
  SUPPORT_EMAIL,
  getAppVersion,
  getCopyrightYear,
} from '../../constants/legal';
import { Info, Mail, FileText, ChevronLeft, ChevronRight } from 'lucide-react-native';

export default function AboutScreen({ navigation }: any) {
  const { t } = useTranslation();
  const version = getAppVersion();

  return (
    <ThemedSafeAreaView>
      <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ChevronLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('screens.about.title')}</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.logoSection}>
          <View style={styles.logoCircle}>
            <Info size={40} color={colors.primary} />
          </View>
          <Text style={styles.appName}>{APP_DISPLAY_NAME}</Text>
          <Text style={styles.version}>{t('screens.about.version', { version })}</Text>
          <Text style={styles.operator}>{OPERATOR_NAME}</Text>
        </View>

        <View style={styles.disclaimerCard}>
          <Text style={styles.disclaimerTitle}>{t('screens.about.disclaimerTitle')}</Text>
          <Text style={styles.disclaimerText}>
            {t('screens.about.disclaimer', { appName: APP_DISPLAY_NAME })}
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>{t('screens.about.purposeTitle')}</Text>
          <Text style={styles.infoText}>{t('screens.about.purpose')}</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>{t('screens.about.audienceTitle')}</Text>
          <Text style={styles.infoText}>{t('screens.about.audience')}</Text>
        </View>

        <TouchableOpacity
          style={styles.supportCard}
          onPress={() => navigation.navigate('Support')}
          activeOpacity={0.8}
        >
          <Text style={styles.infoTitle}>{t('screens.about.supportTitle')}</Text>
          <Text style={styles.infoText}>{t('screens.about.supportHint')}</Text>
          <View style={styles.supportAction}>
            <Mail size={16} color={colors.primary} />
            <Text style={styles.contactLink}>{t('screens.about.support')}</Text>
            <ChevronRight size={16} color={colors.grayLight} />
          </View>
          <Text style={styles.supportEmail}>{SUPPORT_EMAIL}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.privacyLink}
          onPress={() => navigation.navigate('Privacy')}
        >
          <View style={styles.privacyLeft}>
            <FileText size={20} color={colors.primary} />
            <View>
              <Text style={styles.privacyTitle}>{t('screens.about.privacy')}</Text>
              <Text style={styles.privacyHint}>{t('screens.about.privacyHint')}</Text>
            </View>
          </View>
          <ChevronRight size={18} color={colors.grayLight} />
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {t('screens.about.copyright', { year: getCopyrightYear(), name: OPERATOR_NAME })}
          </Text>
        </View>
      </ScrollView>
    </ThemedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' },
  content: { padding: 20 },
  logoSection: { alignItems: 'center', marginBottom: 24, marginTop: 12 },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E8F0FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  appName: { fontSize: 22, fontWeight: 'bold', color: '#1A1A1A', marginBottom: 4 },
  version: { fontSize: 14, color: '#999' },
  operator: { fontSize: 13, color: '#666', marginTop: 6 },
  disclaimerCard: {
    backgroundColor: '#FFF8E1',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  disclaimerTitle: { fontSize: 14, fontWeight: '600', color: '#E65100', marginBottom: 8 },
  disclaimerText: { fontSize: 13, color: '#5D4037', lineHeight: 20 },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  infoTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A1A', marginBottom: 10 },
  infoText: { fontSize: 14, color: '#666', lineHeight: 22 },
  supportCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  supportAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  contactLink: { flex: 1, fontSize: 14, color: colors.primary, fontWeight: '600' },
  supportEmail: { fontSize: 12, color: '#999', marginTop: 8 },
  privacyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginTop: 4,
    marginBottom: 16,
  },
  privacyLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  privacyTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  privacyHint: { fontSize: 12, color: '#999', marginTop: 2 },
  footer: { alignItems: 'center', paddingVertical: 16 },
  footerText: { fontSize: 12, color: '#999', textAlign: 'center' },
});
