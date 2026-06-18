// src/screens/owner/PVZFormScreen.tsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  ActivityIndicator,
  Modal,
} from 'react-native';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import ScreenHeader from '../../components/common/ScreenHeader';
import PremiumGate from '../../components/common/PremiumGate';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useScreenToast } from '../../hooks/useScreenToast';
import { useErrorHandler } from '../../context/ErrorHandlerContext';
import { useFormValidation } from '../../hooks/useFormValidation';
import FormFieldError from '../../components/common/FormFieldError';
import DataService from '../../services/DataService';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../hooks/useSubscription';
import { FREE_PVZ_LIMIT } from '../../services/subscriptionService';
import { colors } from '../../constants/colors';
import { Pvz } from '../../types/user';
import { MapPin, Clock, Phone, AlertCircle } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { formatPhoneInput, cleanPhone, isValidPhone } from '../../utils/phoneHelpers';
import { normalizeInn, isValidInn } from '../../utils/innHelpers';
import { ensurePvzSynced, PVZ_INN_TAKEN_MESSAGE, PVZ_LIMIT_PRO_MESSAGE } from '../../services/SupabasePvzService';
import analyticsService from '../../services/AnalyticsService';
import { AnalyticsEvents } from '../../services/analytics/events';
import { generateSecureId } from '../../utils/generateSecureId';

type PvzFormField = 'name' | 'address' | 'workHours' | 'ownerInn' | 'phone';

type TimePickerField = 'start' | 'end' | null;

export default function PVZFormScreen({ navigation, route }: any) {
  const { t } = useTranslation();
  const { user, refreshUserData, userPvzs } = useAuth();
  const { isPro } = useSubscription();
  const { ui, screen, theme } = useThemedScreen();
  const { showSuccess } = useScreenToast();
  const { handleError } = useErrorHandler();
  const {
    validate,
    clearFieldError,
    getFieldError,
    inputContainerStyle,
  } = useFormValidation<PvzFormField>();
  const { pvz } = route.params || {};
  const isEditing = !!pvz;

  const pvzCount = userPvzs.length;
  const isFreeAndOverPvzLimit =
    !isEditing && !isPro && pvzCount >= FREE_PVZ_LIMIT;

  const [formData, setFormData] = useState({
    name: pvz?.name || '',
    address: pvz?.address || '',
    workStart: pvz?.workStart || '09:00',
    workEnd: pvz?.workEnd || '21:00',
    phone: pvz?.phone ? formatPhoneInput(pvz.phone) : '',
    ownerInn: pvz?.ownerInn || '',
  });

  const [loading, setLoading] = useState(false);
  const [timePickerField, setTimePickerField] = useState<TimePickerField>(null);
  const [timePickerDraft, setTimePickerDraft] = useState(new Date());

  const handlePhoneChange = (text: string) => {
    clearFieldError('phone');
    setFormData({ ...formData, phone: formatPhoneInput(text) });
  };

  const formatTime = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const parseTime = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const d = new Date();
    d.setHours(h || 0, m || 0, 0, 0);
    return d;
  };

  const openTimePicker = (field: 'start' | 'end') => {
    setTimePickerDraft(parseTime(field === 'start' ? formData.workStart : formData.workEnd));
    setTimePickerField(field);
  };

  const closeTimePicker = () => {
    setTimePickerField(null);
  };

  const confirmTimePicker = () => {
    const value = formatTime(timePickerDraft);
    if (timePickerField === 'start') {
      setFormData({ ...formData, workStart: value });
    } else if (timePickerField === 'end') {
      setFormData({ ...formData, workEnd: value });
    }
    closeTimePicker();
  };

  const savePvz = async () => {
    if (isFreeAndOverPvzLimit) {
      navigation.navigate('Subscription');
      return;
    }

    const [startH, startM] = formData.workStart.split(':').map(Number);
    const [endH, endM] = formData.workEnd.split(':').map(Number);
    const workHoursInvalid =
      !formData.workStart ||
      !formData.workEnd ||
      startH * 60 + startM >= endH * 60 + endM;

    const ownerInnRequired = !isEditing;
    const ownerInnInvalid =
      (ownerInnRequired && !formData.ownerInn.trim()) ||
      (formData.ownerInn.trim() && !isValidInn(formData.ownerInn));

    const isValid = validate([
      { field: 'name', valid: Boolean(formData.name.trim()), message: t('alerts.validation.enterPvzName') },
      {
        field: 'address',
        valid: Boolean(formData.address.trim()),
        message: t('alerts.validation.enterPvzAddress'),
      },
      {
        field: 'workHours',
        valid: !workHoursInvalid,
        message: workHoursInvalid && formData.workStart && formData.workEnd
          ? t('alerts.validation.closeAfterOpen')
          : t('alerts.validation.workHours'),
      },
      {
        field: 'ownerInn',
        valid: !ownerInnInvalid,
        message: ownerInnRequired && !formData.ownerInn.trim()
          ? t('alerts.validation.enterOwnerInn')
          : t('alerts.validation.invalidOwnerInn'),
      },
      {
        field: 'phone',
        valid: !formData.phone || isValidPhone(formData.phone),
        message: t('alerts.validation.invalidPhone'),
      },
    ]);

    if (!isValid) return;

    setLoading(true);
    try {
      const cleanedPhone = formData.phone ? cleanPhone(formData.phone) : '';
      const pvzPayload: Pvz = {
        id: isEditing && pvz ? pvz.id : generateSecureId(),
        name: formData.name.trim(),
        address: formData.address.trim(),
        workStart: formData.workStart,
        workEnd: formData.workEnd,
        workingHours: `${formData.workStart} — ${formData.workEnd}`,
        phone: cleanedPhone,
        ownerInn: normalizeInn(formData.ownerInn),
        ownerId: user?.id || pvz?.ownerId || '',
      };

      await DataService.savePvz(pvzPayload);
      await ensurePvzSynced(pvzPayload);
      await refreshUserData();

      showSuccess(isEditing ? t('alerts.success.pvzUpdated') : t('alerts.success.pvzCreated'));
      analyticsService.track(isEditing ? AnalyticsEvents.PVZ_UPDATED : AnalyticsEvents.PVZ_CREATED, {
        pvzId: pvzPayload.id,
      });
      navigation.goBack();
    } catch (error) {
      console.error('Ошибка сохранения ПВЗ:', error);
      const message = error instanceof Error ? error.message : '';
      if (message === PVZ_LIMIT_PRO_MESSAGE) {
        navigation.navigate('Subscription');
        return;
      }
      if (message === PVZ_INN_TAKEN_MESSAGE) {
        handleError(new Error(message));
        return;
      }
      handleError(error, { fallbackKey: 'alerts.network.savePvzFailed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedSafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScreenHeader
        title={isEditing ? t('screens.owner.editPvz') : t('screens.owner.newPvz')}
        onBack={() => navigation.goBack()}
        right={
          !isFreeAndOverPvzLimit ? (
            <TouchableOpacity onPress={savePvz} disabled={loading}>
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveHeaderText}>{t('common.actions.save')}</Text>
              )}
            </TouchableOpacity>
          ) : undefined
        }
      />

      {isFreeAndOverPvzLimit ? (
        <PremiumGate
          requiredTier="pro"
          title={t('subscription.pvzLimit.title')}
          description={t('subscription.pvzLimit.description', {
            limit: FREE_PVZ_LIMIT,
            count: pvzCount,
          })}
          onUpgrade={() => navigation.navigate('Subscription')}
        />
      ) : (
        <>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.inputContainer}>
              <Text style={[styles.label, ui.title]}>{t('screens.owner.pvzNameLabel')}</Text>
              <View
                style={inputContainerStyle('name', [
                  styles.inputWrapper,
                  { backgroundColor: ui.input.backgroundColor, borderColor: screen.border },
                ])}
              >
                <TextInput
                  style={[styles.input, { color: screen.text }]}
                  placeholder={t('screens.owner.pvzNamePlaceholder')}
                  value={formData.name}
                  onChangeText={(text) => {
                    clearFieldError('name');
                    setFormData({ ...formData, name: text });
                  }}
                  placeholderTextColor={colors.grayLighter}
                />
              </View>
              <FormFieldError message={getFieldError('name')} />
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.label, ui.title]}>{t('screens.owner.pvzAddressLabel')}</Text>
              <View
                style={inputContainerStyle('address', [
                  styles.inputWrapper,
                  { backgroundColor: ui.input.backgroundColor, borderColor: screen.border },
                ])}
              >
                <MapPin size={20} color={screen.textSecondary} />
                <TextInput
                  style={[styles.input, { color: screen.text }]}
                  placeholder={t('screens.owner.pvzAddressPlaceholder')}
                  value={formData.address}
                  onChangeText={(text) => {
                    clearFieldError('address');
                    setFormData({ ...formData, address: text });
                  }}
                  placeholderTextColor={colors.grayLighter}
                />
              </View>
              <FormFieldError message={getFieldError('address')} />
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.label, ui.title]}>{t('screens.owner.pvzHoursLabel')}</Text>
              <View style={styles.workHoursRow}>
                <TouchableOpacity
                  style={inputContainerStyle('workHours', [
                    styles.timeButton,
                    { backgroundColor: ui.input.backgroundColor, borderColor: screen.border },
                  ])}
                  onPress={() => {
                    clearFieldError('workHours');
                    openTimePicker('start');
                  }}
                >
                  <Clock size={18} color={colors.primary} />
                  <Text style={[styles.timeButtonText, { color: screen.text }]}>{formData.workStart}</Text>
                </TouchableOpacity>
                <Text style={[styles.workHoursSeparator, { color: screen.textSecondary }]}>—</Text>
                <TouchableOpacity
                  style={inputContainerStyle('workHours', [
                    styles.timeButton,
                    { backgroundColor: ui.input.backgroundColor, borderColor: screen.border },
                  ])}
                  onPress={() => {
                    clearFieldError('workHours');
                    openTimePicker('end');
                  }}
                >
                  <Clock size={18} color={colors.primary} />
                  <Text style={[styles.timeButtonText, { color: screen.text }]}>{formData.workEnd}</Text>
                </TouchableOpacity>
              </View>
              <FormFieldError message={getFieldError('workHours')} />
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.label, ui.title]}>{t('screens.owner.pvzOwnerInnLabel')}</Text>
              <View
                style={inputContainerStyle('ownerInn', [
                  styles.inputWrapper,
                  { backgroundColor: ui.input.backgroundColor, borderColor: screen.border },
                ])}
              >
                <TextInput
                  style={[styles.input, { color: screen.text }]}
                  placeholder={t('screens.owner.pvzOwnerInnPlaceholder')}
                  value={formData.ownerInn}
                  onChangeText={(text) => {
                    clearFieldError('ownerInn');
                    setFormData({ ...formData, ownerInn: normalizeInn(text) });
                  }}
                  keyboardType="number-pad"
                  placeholderTextColor={colors.grayLighter}
                  maxLength={12}
                  editable={!isEditing || !pvz?.ownerInn}
                />
              </View>
              <FormFieldError message={getFieldError('ownerInn')} />
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.label, ui.title]}>{t('screens.owner.pvzPhoneLabel')}</Text>
              <View
                style={inputContainerStyle('phone', [
                  styles.inputWrapper,
                  { backgroundColor: ui.input.backgroundColor, borderColor: screen.border },
                ])}
              >
                <Phone size={20} color={screen.textSecondary} />
                <TextInput
                  style={[styles.input, { color: screen.text }]}
                  placeholder="+7 (999) 123-45-67"
                  value={formData.phone}
                  onChangeText={handlePhoneChange}
                  keyboardType="phone-pad"
                  placeholderTextColor={colors.grayLighter}
                  maxLength={18}
                />
              </View>
              <FormFieldError message={getFieldError('phone')} />
            </View>

            <View style={[styles.infoCard, { backgroundColor: colors.primaryLight }]}>
              <AlertCircle size={16} color={colors.primary} />
              <Text style={styles.infoText}>
                {isEditing ? t('screens.owner.pvzEditHint') : t('screens.owner.pvzCreateHint')}
              </Text>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {timePickerField && Platform.OS === 'android' && (
        <DateTimePicker
          value={timePickerDraft}
          mode="time"
          display="default"
          onChange={(event, date) => {
            closeTimePicker();
            if (event.type === 'dismissed' || !date) return;
            const value = formatTime(date);
            if (timePickerField === 'start') {
              setFormData({ ...formData, workStart: value });
            } else {
              setFormData({ ...formData, workEnd: value });
            }
          }}
        />
      )}

      <Modal
        visible={timePickerField !== null && Platform.OS === 'ios'}
        transparent
        animationType="slide"
        onRequestClose={closeTimePicker}
      >
        <View style={styles.pickerOverlay}>
          <TouchableOpacity style={styles.pickerBackdrop} activeOpacity={1} onPress={closeTimePicker} />
          <View style={[styles.pickerSheet, ui.modal]}>
            <Text style={[styles.pickerTitle, ui.title]}>
              {timePickerField === 'start' ? t('screens.owner.openTime') : t('screens.owner.closeTime')}
            </Text>
            <View style={styles.pickerSpinnerContainer}>
              <DateTimePicker
                value={timePickerDraft}
                mode="time"
                display="spinner"
                locale="ru-RU"
                themeVariant={theme === 'dark' ? 'dark' : 'light'}
                textColor={screen.text}
                style={styles.pickerSpinner}
                onChange={(_event, date) => {
                  if (date) setTimePickerDraft(date);
                }}
              />
            </View>
            <View style={styles.pickerActions}>
              <TouchableOpacity
                style={[styles.pickerCancelButton, { backgroundColor: ui.input.backgroundColor }]}
                onPress={closeTimePicker}
              >
                <Text style={[styles.pickerCancelText, { color: screen.textSecondary }]}>{t('common.actions.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pickerDoneButton} onPress={confirmTimePicker}>
                <Text style={styles.pickerDoneText}>{t('common.actions.done')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
        </>
      )}
    </ThemedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  saveHeaderText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  keyboardView: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
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
  input: { flex: 1, fontSize: 16 },
  workHoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
  },
  timeButtonText: { fontSize: 18, fontWeight: '600' },
  workHoursSeparator: { fontSize: 18 },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 14,
    marginTop: 10,
  },
  infoText: { flex: 1, fontSize: 13, color: colors.primary, lineHeight: 18 },
  pickerOverlay: { flex: 1, justifyContent: 'flex-end' },
  pickerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  pickerSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingBottom: 28,
    paddingHorizontal: 20,
  },
  pickerTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  pickerSpinnerContainer: {
    width: '100%',
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerSpinner: { width: '100%', height: 180 },
  pickerActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, gap: 12 },
  pickerCancelButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  pickerCancelText: { fontSize: 16, fontWeight: '500' },
  pickerDoneButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  pickerDoneText: { fontSize: 16, color: '#FFFFFF', fontWeight: '600' },
});
