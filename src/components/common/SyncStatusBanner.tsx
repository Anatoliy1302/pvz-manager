import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import SyncStatusService, { SyncState } from '../../services/SyncStatusService';
import { colors } from '../../constants/colors';

export default function SyncStatusBanner() {
  const { t } = useTranslation();
  const [state, setState] = useState<SyncState>(SyncStatusService.getState());

  useEffect(() => SyncStatusService.subscribe(setState), []);

  if (state.isSyncing) {
    return (
      <View style={[styles.banner, styles.info]}>
        <Text style={styles.text}>{t('common.sync.inProgress')}</Text>
      </View>
    );
  }

  if (!state.lastError) {
    return null;
  }

  const countSuffix = state.errorCount > 1 ? ` (${state.errorCount})` : '';

  return (
    <TouchableOpacity
      style={[styles.banner, styles.error]}
      onPress={() => SyncStatusService.clearError()}
      activeOpacity={0.85}
    >
      <Text style={styles.text}>{t('common.sync.failed', { countSuffix })}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  info: {
    backgroundColor: colors.primaryLight,
  },
  error: {
    backgroundColor: '#FFEBEE',
  },
  text: {
    fontSize: 13,
    color: '#1A1A1A',
    textAlign: 'center',
  },
});
