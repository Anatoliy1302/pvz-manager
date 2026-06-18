import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import { colors } from '../../constants/colors';
import {
  APP_DISPLAY_NAME,
  OPERATOR_NAME,
  OPERATOR_FULL_NAME,
  OPERATOR_ADDRESS,
  SUPPORT_EMAIL,
  PRIVACY_POLICY_UPDATED,
  openLegalDocument,
} from '../../constants/legal';
import { ChevronLeft, Mail } from 'lucide-react-native';

interface PolicySection {
  title: string;
  paragraphs: string[];
}

export default function PrivacyPolicyScreen({ navigation }: any) {
  const { t } = useTranslation();

  const sections = useMemo<PolicySection[]>(() => {
    const vars = {
      appName: APP_DISPLAY_NAME,
      operator: OPERATOR_NAME,
      operatorFull: OPERATOR_FULL_NAME,
      operatorAddress: OPERATOR_ADDRESS,
    };

    return [
      {
        title: t('legal.privacy.sections.general.title'),
        paragraphs: [
          t('legal.privacy.sections.general.p1', vars),
          t('legal.privacy.sections.general.p2', vars),
          t('legal.privacy.sections.general.p3'),
        ],
      },
      {
        title: t('legal.privacy.sections.data.title'),
        paragraphs: [
          t('legal.privacy.sections.data.intro'),
          t('legal.privacy.sections.data.i1'),
          t('legal.privacy.sections.data.i2'),
          t('legal.privacy.sections.data.i3'),
          t('legal.privacy.sections.data.i4'),
          t('legal.privacy.sections.data.i5'),
          t('legal.privacy.sections.data.i6'),
          t('legal.privacy.sections.data.i7'),
        ],
      },
      {
        title: t('legal.privacy.sections.purposes.title'),
        paragraphs: [
          t('legal.privacy.sections.purposes.intro'),
          t('legal.privacy.sections.purposes.i1'),
          t('legal.privacy.sections.purposes.i2'),
          t('legal.privacy.sections.purposes.i3'),
          t('legal.privacy.sections.purposes.i4'),
          t('legal.privacy.sections.purposes.i5'),
          t('legal.privacy.sections.purposes.i6'),
        ],
      },
      {
        title: t('legal.privacy.sections.storage.title'),
        paragraphs: [
          t('legal.privacy.sections.storage.intro'),
          t('legal.privacy.sections.storage.i1'),
          t('legal.privacy.sections.storage.i2'),
          t('legal.privacy.sections.storage.i3'),
          t('legal.privacy.sections.storage.i4'),
        ],
      },
      {
        title: t('legal.privacy.sections.sharing.title'),
        paragraphs: [
          t('legal.privacy.sections.sharing.p1'),
          t('legal.privacy.sections.sharing.intro'),
          t('legal.privacy.sections.sharing.i1'),
          t('legal.privacy.sections.sharing.i2'),
        ],
      },
      {
        title: t('legal.privacy.sections.retention.title'),
        paragraphs: [
          t('legal.privacy.sections.retention.p1'),
          t('legal.privacy.sections.retention.p2'),
        ],
      },
      {
        title: t('legal.privacy.sections.rights.title'),
        paragraphs: [
          t('legal.privacy.sections.rights.intro'),
          t('legal.privacy.sections.rights.i1'),
          t('legal.privacy.sections.rights.i2'),
          t('legal.privacy.sections.rights.i3'),
          t('legal.privacy.sections.rights.i4'),
        ],
      },
      {
        title: t('legal.privacy.sections.security.title'),
        paragraphs: [
          t('legal.privacy.sections.security.p1'),
          t('legal.privacy.sections.security.p2'),
        ],
      },
      {
        title: t('legal.privacy.sections.children.title'),
        paragraphs: [t('legal.privacy.sections.children.p1')],
      },
      {
        title: t('legal.privacy.sections.changes.title'),
        paragraphs: [t('legal.privacy.sections.changes.p1')],
      },
      {
        title: t('legal.privacy.sections.contacts.title'),
        paragraphs: [t('legal.privacy.sections.contacts.p1', vars)],
      },
    ];
  }, [t]);

  const openEmail = () => {
    Linking.openURL(
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t('legal.privacy.emailSubject'))}`
    );
  };

  return (
    <ThemedSafeAreaView>
      <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ChevronLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('legal.privacy.title')}</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.updated}>
          {t('legal.privacy.updated', { date: PRIVACY_POLICY_UPDATED })}
        </Text>

        <TouchableOpacity
          style={styles.webVersionCard}
          onPress={() => openLegalDocument('privacy')}
        >
          <Text style={styles.webVersionText}>{t('legal.privacy.openOnWeb')}</Text>
        </TouchableOpacity>

        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.paragraphs.map((paragraph, index) => (
              <Text key={index} style={styles.paragraph}>
                {paragraph}
              </Text>
            ))}
          </View>
        ))}

        <TouchableOpacity style={styles.contactCard} onPress={openEmail}>
          <Mail size={18} color={colors.primary} />
          <Text style={styles.contactEmail}>{SUPPORT_EMAIL}</Text>
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
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
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: '#FFFFFF', flex: 1, textAlign: 'center' },
  content: { padding: 20 },
  updated: { fontSize: 12, color: '#999', marginBottom: 16 },
  webVersionCard: {
    backgroundColor: '#E8F0FE',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  webVersionText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A1A', marginBottom: 8 },
  paragraph: { fontSize: 14, color: '#555', lineHeight: 22, marginBottom: 6 },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#E8F0FE',
    padding: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  contactEmail: { fontSize: 14, color: colors.primary, fontWeight: '500' },
  bottomSpacer: { height: 30 },
});
