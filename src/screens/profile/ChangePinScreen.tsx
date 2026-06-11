import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { colors } from '../../constants/colors';
import { KeyRound, Save } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import ScreenHeader from '../../components/common/ScreenHeader';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { cleanPhone } from '../../utils/phoneHelpers';

const PIN_LENGTH = 4;

export default function ChangePinScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { ui, screen } = useThemedScreen();
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);

  const cleanedPhone = user?.phone ? cleanPhone(user.phone) : '';
  const pinKey = cleanedPhone ? `user_pin_${cleanedPhone}` : '';

  const handleSave = async () => {
    if (!pinKey) {
      Alert.alert(t('common.error.title'), t('alerts.validation.noAccount'));
      return;
    }
    if (!currentPin || !newPin || !confirmPin) {
      Alert.alert(t('common.error.title'), t('alerts.validation.fillAll'));
      return;
    }
    if (currentPin.length !== PIN_LENGTH || newPin.length !== PIN_LENGTH || confirmPin.length !== PIN_LENGTH) {
      Alert.alert(t('common.error.title'), t('alerts.validation.pinLength', { length: PIN_LENGTH }));
      return;
    }
    if (newPin !== confirmPin) {
      Alert.alert(t('common.error.title'), t('alerts.validation.pinMismatch'));
      return;
    }
    if (currentPin === newPin) {
      Alert.alert(t('common.error.title'), t('alerts.validation.pinSame'));
      return;
    }

    setLoading(true);
    try {
      const storedPin = await SecureStore.getItemAsync(pinKey);

      if (!storedPin) {
        Alert.alert(t('alerts.validation.pinNotSet'), t('alerts.validation.pinNotSetHint'));
        return;
      }

      if (storedPin !== currentPin) {
        Alert.alert(t('common.error.title'), t('alerts.validation.wrongCurrentPin'));
        return;
      }

      await SecureStore.setItemAsync(pinKey, newPin);
      Alert.alert(t('common.success.done'), t('alerts.success.pinChanged'));
      navigation.goBack();
    } catch (error) {
      console.error('Ошибка смены PIN:', error);
      Alert.alert(t('common.error.title'), t('alerts.network.changePinFailed'));
    } finally {
      setLoading(false);
    }
  };

  const renderPinField = (
    label: string,
    value: string,
    onChange: (text: string) => void,
    placeholder: string
  ) => (
    <View style={styles.inputContainer}>
      <Text style={[styles.label, { color: screen.text }]}>{label}</Text>
      <View
        style={[
          styles.inputWrapper,
          { backgroundColor: ui.input.backgroundColor, borderColor: screen.border },
        ]}
      >
        <KeyRound size={20} color={colors.gray} />
        <TextInput
          style={[styles.input, { color: screen.text }]}
          placeholder={placeholder}
          value={value}
          onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, PIN_LENGTH))}
          keyboardType="number-pad"
          maxLength={PIN_LENGTH}
          secureTextEntry
          placeholderTextColor={colors.grayLighter}
        />
      </View>
    </View>
  );

  return (
    <ThemedSafeAreaView style={styles.container}>
      <ScreenHeader
        title={t('settings.changePin.title')}
        onBack={() => navigation.goBack()}
        right={
          <TouchableOpacity onPress={handleSave} disabled={loading}>
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Save size={20} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        }
      />

      <View style={styles.content}>
        <View style={[styles.infoCard, ui.card]}>
          <KeyRound size={16} color={colors.primary} />
          <Text style={[styles.infoText, { color: screen.textSecondary }]}>
            {t('settings.changePin.info')}
          </Text>
        </View>

        {renderPinField(t('settings.changePin.current'), currentPin, setCurrentPin, t('settings.changePin.placeholder'))}
        {renderPinField(t('settings.changePin.new'), newPin, setNewPin, t('settings.changePin.placeholder'))}
        {renderPinField(t('settings.changePin.confirm'), confirmPin, setConfirmPin, t('settings.changePin.placeholder'))}

        {confirmPin.length === PIN_LENGTH && newPin !== confirmPin && (
          <Text style={styles.errorText}>{t('settings.changePin.mismatch')}</Text>
        )}
      </View>
    </ThemedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20 },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 12,
    marginBottom: 24,
  },
  infoText: { flex: 1, fontSize: 12, lineHeight: 18 },
  inputContainer: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 8 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderWidth: 1,
  },
  input: { flex: 1, fontSize: 18, letterSpacing: 4 },
  errorText: { fontSize: 12, color: colors.danger, marginTop: -12, marginLeft: 4 },
});
