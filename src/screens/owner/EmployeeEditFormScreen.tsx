// src/screens/owner/EmployeeEditFormScreen.tsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
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
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../constants/colors';
import { ChevronLeft, Save, User, Phone, AlertCircle, Building2, ChevronDown, X, Shield, UserCog } from 'lucide-react-native';
import { UserRole } from '../../types/user';
import { useAccessiblePvzs } from '../../hooks/useAccessiblePvzs';

const { height } = Dimensions.get('window');

export default function EmployeeEditFormScreen({ navigation, route }: any) {
  const { t } = useTranslation();
  const { refreshUserData, user, pvz } = useAuth();
  const { ui } = useThemedScreen();
  const { employee, pvzId } = route.params || {};
  
  const [name, setName] = useState(employee?.name || '');
  const [role, setRole] = useState<UserRole>(employee?.role || 'employee');
  const [showPvzModal, setShowPvzModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const { accessiblePvzs, selectedPvzId, setSelectedPvzId } = useAccessiblePvzs(
    user,
    undefined,
    pvz,
    employee?.pvzId || pvzId
  );
  const canEditRole = user?.role === 'owner';
  const employeeRoleLabel = employee?.role === 'admin' ? t('common.roles.admin') : t('common.roles.employee');

  const handleSubmit = async () => {
    Keyboard.dismiss();
    
    if (!name.trim()) {
      Alert.alert(t('common.error.title'), t('alerts.validation.enterEmployeeName'));
      return;
    }
    
    if (!selectedPvzId) {
      Alert.alert(t('common.error.title'), t('alerts.validation.selectEmployeePvz'));
      return;
    }
    
    setLoading(true);
    try {
      const stored = await SecureStore.getItemAsync('pvz_users');
      if (stored) {
        const all = JSON.parse(stored);
        const userIndex = all.findIndex((u: any) => u.id === employee.id);
        
        if (userIndex !== -1) {
          // Обновляем имя, роль и ПВЗ
          all[userIndex].name = name.trim();
          all[userIndex].role = role;
          all[userIndex].pvzId = selectedPvzId;
          
          await SecureStore.setItemAsync('pvz_users', JSON.stringify(all));
          await refreshUserData();
          
          Alert.alert(t('common.success.title'), t('alerts.success.employeeUpdated'), [
            { text: 'OK', onPress: () => navigation.goBack() }
          ]);
        } else {
          Alert.alert(t('common.error.title'), t('alerts.network.employeeNotFound'));
        }
      }
    } catch (error: any) {
      Alert.alert(t('common.error.title'), error.message || t('alerts.network.updateEmployeeFailed'));
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
      <TouchableOpacity 
        style={styles.modalOverlay} 
        activeOpacity={1} 
        onPress={() => setShowPvzModal(false)}
      >
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
                    selectedPvzId === p.id && styles.modalItemActive
                  ]}
                  onPress={() => {
                    setSelectedPvzId(p.id);
                    setShowPvzModal(false);
                  }}
                >
                  <Building2 size={18} color={selectedPvzId === p.id ? colors.primary : colors.gray} />
                  <Text style={[
                    styles.modalItemText,
                    selectedPvzId === p.id && styles.modalItemTextActive
                  ]}>
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
      </TouchableOpacity>
    </Modal>
  );

  return (
    <ThemedSafeAreaView style={styles.container}>
      <ScreenHeader
        title={t('screens.employees.editTitle')}
        onBack={() => navigation.goBack()}
        right={
          <TouchableOpacity onPress={handleSubmit} disabled={loading}>
            <Save size={20} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />

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
              <Text style={styles.infoText}>
                {t('screens.employeeForm.editInfo')}
              </Text>
            </View>

            <View style={[styles.formCard, ui.card]}>
              <Text style={styles.fieldLabel}>{t('screens.employeeForm.nameLabel')} {t('common.form.required')}</Text>
              <View style={styles.inputWrapper}>
                <User size={20} color={colors.gray} />
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder={t('screens.employeeForm.namePlaceholder')}
                  placeholderTextColor={colors.grayLight}
                />
              </View>

              <Text style={styles.fieldLabel}>{t('screens.employeeForm.phoneLabel')}</Text>
              <View style={[styles.inputWrapper, styles.disabledInput]}>
                <Phone size={20} color={colors.gray} />
                <Text style={styles.disabledText}>{employee?.phone || t('common.notSpecified')}</Text>
              </View>
              <Text style={styles.hintText}>
                {t('screens.employeeForm.phoneLockedHint')}
              </Text>

              {/* Выбор ПВЗ */}
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

              {/* Выбор роли */}
              <Text style={styles.fieldLabel}>{t('screens.employeeForm.roleLabel')}</Text>
              {canEditRole ? (
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
                <>
                  <View style={[styles.inputWrapper, styles.disabledInput]}>
                    <UserCog size={20} color={colors.gray} />
                    <Text style={styles.disabledText}>{employeeRoleLabel}</Text>
                  </View>
                  <Text style={styles.hintText}>
                    {t('screens.employeeForm.roleLockedHint')}
                  </Text>
                </>
              )}
            </View>

            <View style={styles.warningCard}>
              <AlertCircle size={20} color={colors.warning} />
              <Text style={styles.warningText}>
                {t('screens.employeeForm.changesWarning')}
              </Text>
            </View>
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
  saveButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
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
  disabledInput: { backgroundColor: '#F9F9F9' },
  disabledText: { flex: 1, fontSize: 16, color: '#999999' },
  hintText: { fontSize: 11, color: '#999999', marginTop: 6 },
  
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
  
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFF3E0',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  warningText: { flex: 1, fontSize: 13, color: colors.warning, lineHeight: 18 },

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