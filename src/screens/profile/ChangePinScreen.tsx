import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { colors } from '../../constants/colors';
import { KeyRound, Save } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import ScreenHeader from '../../components/common/ScreenHeader';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { cleanPhone } from '../../utils/phoneHelpers';
import PinService from '../../services/PinService';
import { useToast } from '../../components/common/Toast';

const PIN_LENGTH = 4;

export default function ChangePinScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { ui, screen } = useThemedScreen();
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);

  const cleanedPhone = user?.phone ? cleanPhone(user.phone) : '';

  const handleSave = async () => {
    if (!cleanedPhone) {
      showToast(t('alerts.validation.noAccount'), 'error');
      return;
    }
    if (!currentPin || !newPin || !confirmPin) {
      showToast(t('alerts.validation.fillAll'), 'error');
      return;
    }
    if (
      currentPin.length !== PIN_LENGTH ||
      newPin.length !== PIN_LENGTH ||
      confirmPin.length !== PIN_LENGTH
    ) {
      showToast(t('alerts.validation.pinLength', { length: PIN_LENGTH }), 'error');
      return;
    }
    if (newPin !== confirmPin) {
      showToast(t('alerts.validation.pinMismatch'), 'error');
      return;
    }
    if (currentPin === newPin) {
      showToast(t('alerts.validation.pinSame'), 'error');
      return;
    }

    setLoading(true);
    try {
      await PinService.changePin(cleanedPhone, currentPin, newPin);
      showToast(t('alerts.success.pinChanged'), 'success');
      navigation.goBack();
    } catch (error) {
      if (error instanceof Error && error.message === 'PIN_NOT_SET') {
        showToast(t('alerts.validation.pinNotSetHint'), 'error');
        return;
      }
      if (error instanceof Error && error.message === 'WRONG_PIN') {
        showToast(t('alerts.validation.wrongCurrentPin'), 'error');
        return;
      }
      console.error('Ошибка смены PIN:', error);
      showToast(t('alerts.network.changePinFailed'), 'error');
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
        {renderPinField(
          t('settings.changePin.current'),
          currentPin,
          setCurrentPin,
          t('settings.changePin.currentPlaceholder')
        )}
        {renderPinField(
          t('settings.changePin.new'),
          newPin,
          setNewPin,
          t('settings.changePin.newPlaceholder')
        )}
        {renderPinField(
          t('settings.changePin.confirm'),
          confirmPin,
          setConfirmPin,
          t('settings.changePin.confirmPlaceholder')
        )}
      </View>
    </ThemedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 16 },
  inputContainer: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600' },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  input: { flex: 1, fontSize: 18, letterSpacing: 4 },
});
