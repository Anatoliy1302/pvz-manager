import React from 'react';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import ScreenHeader from '../../components/common/ScreenHeader';
import EmptyState from '../../components/common/EmptyState';
import { Settings } from 'lucide-react-native';

export default function OwnerSettingsScreen({ navigation }: any) {
  const { t } = useTranslation();

  return (
    <ThemedSafeAreaView style={styles.container}>
      <ScreenHeader title={t('screens.profile.settings')} onBack={() => navigation.goBack()} />
      <EmptyState
        icon={Settings}
        title={t('screens.ownerSettings.movedTitle')}
        description={t('screens.ownerSettings.movedDesc')}
        buttonText={t('common.actions.openSettings')}
        onButtonPress={() => navigation.navigate('Settings')}
      />
    </ThemedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
