// src/screens/owner/EmployeeAddFormScreen.tsx
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
  Modal,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import ScreenHeader from '../../components/common/ScreenHeader';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useScreenToast } from '../../hooks/useScreenToast';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../constants/colors';
import {
  ChevronLeft,
  Phone,
  User,
  Building2,
  ChevronDown,
  X,
  Shield,
  UserPlus,
} from 'lucide-react-native';
import { UserRole } from '../../types/user';
import { useAccessiblePvzs } from '../../hooks/useAccessiblePvzs';

const { height } = Dimensions.get('window');

export default function EmployeeAddFormScreen({ navigation, route }: any) {
  const { t } = useTranslation();
  const { user, pvz, userPvzs, addEmployee } = useAuth();
  const { ui } = useThemedScreen();
  const { showError, showSuccess } = useScreenToast();
  const { pvzId: propPvzId } = route.params || {};

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+7');
  const [role, setRole] = useState<UserRole>('employee');
  const [showPvzModal, setShowPvzModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const { accessiblePvzs, selectedPvzId, setSelectedPvzId } = useAccessiblePvzs(
    user,
    userPvzs,
    pvz,
    propPvzId || pvz?.id
  );
  const canSelectRole = user?.role === 'owner';

  const formatPhone = (text: string) => {
    if (text === '') {
      setPhone('');
      return;
    }

    const cleaned = text.replace(/[^0-9]/g, '');

    if (cleaned.length === 0) {
      setPhone('');
      return;
    }

    let formatted = '';

    if (cleaned.length === 1) {
      formatted = `+${cleaned}`;
    } else if (cleaned.length <= 4) {
      formatted = `+${cleaned.slice(0, 1)} (${cleaned.slice(1)}`;
    } else if (cleaned.length <= 7) {
      formatted = `+${cleaned.slice(0, 1)} (${cleaned.slice(1, 4)}) ${cleaned.slice(4)}`;
    } else if (cleaned.length <= 9) {
      formatted = `+${cleaned.slice(0, 1)} (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    } else {
      formatted = `+${cleaned.slice(0, 1)} (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7, 9)}-${cleaned.slice(9, 11)}`;
    }

    if (formatted.length > 18) {
      formatted = formatted.slice(0, 18);
    }

    setPhone(formatted);
  };

  const handleSubmit = async () => {
    Keyboard.dismiss();

    if (!name.trim()) {
      showError(t('alerts.validation.enterEmployeeName'));
      return;
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (!cleanPhone || cleanPhone.length < 11) {
      showError(t('alerts.validation.invalidPhone10'));
      return;
    }

    if (!selectedPvzId) {
      showError(t('alerts.validation.selectEmployeePvz'));
      return;
    }

    setLoading(true);
    try {
      await addEmployee(cleanPhone, name.trim(), role, selectedPvzId);
      showSuccess(t('alerts.success.inviteSentDetail'));
      navigation.goBack();
    } catch (error: any) {
      showError(error.message || t('alerts.network.addEmployeeFailed'));
    } finally {
      setLoading(false);
    }
  };

  const selectedPvz = accessiblePvzs.find(p => p.id === selectedPvzId);

  const renderPvzModal = () => (
    <Modal
      visible={showPvzModal}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setShowPvzModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('common.pvz.select')}</Text>
            <TouchableOpacity onPress={() => setShowPvzModal(false)}>
              <X size={22} color={colors.gray} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalList}>
            {accessiblePvzs.length === 0 ? (
              <Text style={styles.modalEmptyText}>{t('screens.employeeForm.noPvzAvailable')}</Text>
            ) : (
              accessiblePvzs.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.modalItem,
                    selectedPvzId === p.id && styles.modalItemActive,
                  ]}
                  onPress={() => {
                    setSelectedPvzId(p.id);
                    setShowPvzModal(false);
                  }}
                >
                  <Building2 size={18} color={selectedPvzId === p.id ? colors.primary : colors.gray} />
                  <Text
                    style={[
                      styles.modalItemText,
                      selectedPvzId === p.id && styles.modalItemTextActive,
                    ]}
                  >
                    {p.name}
                  </Text>
                  {selectedPvzId === p.id && (
                    <View style={styles.modalItemCheck}>
                      <Text style={styles.modalItemCheckText}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  return (
    <ThemedSafeAreaView style={styles.container}>
      <ScreenHeader title={t('screens.employees.addTitle')} onBack={() => navigation.goBack()} />

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
            <View style={[styles.infoCard, ui.card]}>
              <Text style={[styles.infoTitle, ui.title]}>{t('screens.employeeForm.infoTitle')}</Text>
              <Text style={[styles.infoText, ui.subtitle]}>
                {t('screens.employeeForm.addInfo')}
              </Text>
            </View>

            <View style={[styles.formCard, ui.card]}>
              <Text style={[styles.fieldLabel, ui.title]}>{t('screens.employeeForm.nameLabel')} {t('common.form.required')}</Text>
              <View style={[styles.inputWrapper, { backgroundColor: ui.input.backgroundColor, borderColor: ui.input.borderColor }]}>
                <User size={20} color={colors.gray} />
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder={t('screens.employeeForm.namePlaceholder')}
                  placeholderTextColor={colors.grayLight}
                />
              </View>

              <Text style={styles.fieldLabel}>{t('screens.employeeForm.phoneLabel')} {t('common.form.required')}</Text>
              <View style={styles.inputWrapper}>
                <Phone size={20} color={colors.gray} />
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={formatPhone}
                  placeholder="+7 (999) 123-45-67"
                  keyboardType="phone-pad"
                  placeholderTextColor={colors.grayLight}
                />
              </View>

              <Text style={styles.fieldLabel}>{t('screens.employeeForm.pvzLabel')} {t('common.form.required')}</Text>
              <TouchableOpacity
                style={styles.pvzSelectorButton}
                onPress={() => setShowPvzModal(true)}
                activeOpacity={0.8}
              >
                <Building2 size={18} color={colors.primary} />
                <Text style={styles.pvzSelectorText}>
                  {selectedPvz?.name || t('common.pvz.select')}
                </Text>
                <ChevronDown size={16} color={colors.primary} />
              </TouchableOpacity>

              <Text style={styles.fieldLabel}>{t('screens.employeeForm.roleLabel')}</Text>
              {canSelectRole ? (
                <View style={styles.roleContainer}>
                  <TouchableOpacity
                    style={[styles.roleButton, role === 'employee' && styles.roleButtonActive]}
                    onPress={() => setRole('employee')}
                  >
                    <User size={18} color={role === 'employee' ? '#FFFFFF' : colors.gray} />
                    <Text style={[styles.roleText, role === 'employee' && styles.roleTextActive]}>
                      {t('common.roles.employee')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.roleButton, role === 'admin' && styles.roleButtonActive]}
                    onPress={() => setRole('admin')}
                  >
                    <Shield size={18} color={role === 'admin' ? '#FFFFFF' : colors.gray} />
                    <Text style={[styles.roleText, role === 'admin' && styles.roleTextActive]}>
                      {t('common.roles.admin')}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[styles.inputWrapper, { backgroundColor: ui.input.backgroundColor, borderColor: ui.input.borderColor }]}>
                  <User size={18} color={colors.gray} />
                  <Text style={styles.disabledText}>{t('common.roles.employee')}</Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[styles.submitButton, loading && styles.disabledButton]}
              onPress={handleSubmit}
              disabled={loading}
            >
              <LinearGradient
                colors={[colors.primary, colors.primaryDark]}
                style={styles.submitGradient}
              >
                <UserPlus size={20} color="#FFFFFF" />
                <Text style={styles.submitText}>
                  {loading ? t('common.loading.sending') : t('screens.employees.sendInvite')}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {renderPvzModal()}
    </ThemedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' },

  keyboardView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  infoCard: {
    backgroundColor: '#E8F0FE',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  infoTitle: { fontSize: 14, fontWeight: '600', color: colors.primary, marginBottom: 8 },
  infoText: { fontSize: 13, color: colors.primary, lineHeight: 18 },

  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  fieldLabel: { fontSize: 14, fontWeight: '500', color: '#1A1A1A', marginBottom: 8, marginTop: 12 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  input: { flex: 1, fontSize: 16, color: '#1A1A1A' },
  disabledText: { flex: 1, fontSize: 16, color: '#999999' },

  pvzSelectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  pvzSelectorText: { flex: 1, fontSize: 15, color: '#1A1A1A' },

  roleContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  roleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: '#FFFFFF',
  },
  roleButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  roleText: {
    fontSize: 14,
    color: '#666666',
  },
  roleTextActive: {
    color: '#FFFFFF',
  },

  submitButton: { borderRadius: 30, overflow: 'hidden' },
  submitGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  submitText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  disabledButton: { opacity: 0.6 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    width: '85%',
    maxHeight: height * 0.6,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  modalList: {
    padding: 8,
  },
  modalEmptyText: {
    textAlign: 'center',
    padding: 20,
    color: '#999999',
    fontSize: 14,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 4,
  },
  modalItemActive: {
    backgroundColor: colors.primaryLight,
  },
  modalItemText: {
    flex: 1,
    fontSize: 16,
    color: '#1A1A1A',
    marginLeft: 12,
  },
  modalItemTextActive: {
    color: colors.primary,
    fontWeight: '500',
  },
  modalItemCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalItemCheckText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});
