// src/screens/owner/PenaltiesScreen.tsx
import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Modal,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../constants/colors';
import DataService from '../../services/DataService';
import StorageService from '../../services/StorageService';
import { addPenalty as savePenalty, updateEmployeeBalance } from '../../services/PaymentService';
import { ChevronLeft, Plus, X, Check, AlertCircle, User, Calendar, Trash2, RefreshCw } from 'lucide-react-native';
import MoneyIcon from '../../components/icons/MoneyIcon';
import EmptyState from '../../components/common/EmptyState';
import { generateSecureId } from '../../utils/generateSecureId';
import { safeParseJson } from '../../utils/safeJson';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useScreenToast } from '../../hooks/useScreenToast';

interface Penalty {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  reason: string;
  date: string;
  createdAt: string;
  createdBy: string;
}

export default function PenaltiesScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { user, pvz } = useAuth();
  const { screen } = useThemedScreen();
  const { showError, showSuccess } = useScreenToast();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [penalties, setPenalties] = useState<Penalty[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [type, setType] = useState<'fine' | 'bonus'>('fine');
  const [recalculating, setRecalculating] = useState(false);

  const loadData = async () => {
    if (!pvz?.id) return;
    
    try {
      const users = await DataService.getUsers();
      const pvzEmployees = users.filter(u => 
        u.role !== 'owner' && u.status === 'active' && u.pvzId === pvz.id
      );
      setEmployees(pvzEmployees);
      
      let allPenalties: Penalty[] = [];
      for (const emp of pvzEmployees) {
        const raw = await StorageService.getItem(`penalties_${emp.id}`);
        if (raw) {
          const penaltiesData = safeParseJson<Penalty[]>(raw, []);
          allPenalties = [...allPenalties, ...penaltiesData];
        }
      }
      
      allPenalties.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setPenalties(allPenalties);
      
    } catch (error) {
      console.error('Ошибка загрузки:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();
      const unsubBalance = DataService.subscribe('employee_balance', loadData);
      const unsubPenalties = pvz?.id
        ? DataService.subscribe(`penalties_${pvz.id}`, loadData)
        : () => {};
      return () => {
        unsubBalance();
        unsubPenalties();
      };
    }, [pvz?.id])
  );

  const syncEmployeeAccruals = async (employeeId: string) => {
    if (!pvz?.id) return;
    await updateEmployeeBalance(employeeId, pvz.id);
    DataService.emitChange('employee_balance');
  };

  const addPenalty = async () => {
    if (!selectedEmployeeId) {
      showError(t('alerts.validation.selectEmployee'));
      return;
    }
    if (!amount || parseFloat(amount) === 0) {
      showError(t('alerts.validation.enterAmount'));
      return;
    }
    if (!reason.trim()) {
      showError(t('alerts.validation.enterReason'));
      return;
    }
    
    const employee = employees.find(e => e.id === selectedEmployeeId);
    const absAmount = Math.abs(parseFloat(amount));
    // Штраф: положительное число. Бонус: отрицательное число
    const finalAmount = type === 'fine' ? absAmount : -absAmount;
    
    const newPenalty: Penalty = {
      id: generateSecureId(),
      employeeId: selectedEmployeeId,
      employeeName: employee?.name || '',
      amount: finalAmount,
      reason: reason.trim(),
      date: selectedDate,
      createdAt: new Date().toISOString(),
      createdBy: user?.name || '',
    };
    
    try {
      await savePenalty(selectedEmployeeId, newPenalty, pvz?.id || employee?.pvzId || '');
      
      setPenalties(prev => [newPenalty, ...prev]);
      
      await syncEmployeeAccruals(selectedEmployeeId);
      
      setModalVisible(false);
      setSelectedEmployeeId('');
      setAmount('');
      setReason('');
      setType('fine');
      
      showSuccess(
        t('alerts.success.penaltyAdded', {
          type: type === 'fine' ? t('screens.finance.fine') : t('screens.finance.bonusType'),
        })
      );
      
    } catch (error) {
      console.error('Ошибка:', error);
      showError(t('alerts.network.addPenaltyFailed'));
    }
  };

  const deletePenalty = async (penalty: Penalty) => {
    const isFine = penalty.amount > 0;
    Alert.alert(
      t('alerts.confirm.deleteEmployeeTitle'),
      t('alerts.confirm.deletePenaltyRecord', {
        type: isFine ? t('screens.finance.fine') : t('screens.finance.bonusType'),
        name: penalty.employeeName,
      }),
      [
        { text: t('common.actions.cancel'), style: 'cancel' },
        {
          text: t('common.actions.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const existingRaw = await StorageService.getItem(`penalties_${penalty.employeeId}`);
              const existing = safeParseJson<Penalty[]>(existingRaw ?? '[]', []);
              const filtered = existing.filter((p: any) => p.id !== penalty.id);
              await StorageService.setItem(`penalties_${penalty.employeeId}`, JSON.stringify(filtered));
              DataService.emitChange(`penalties_${penalty.employeeId}`);
              if (pvz?.id) {
                DataService.emitChange(`penalties_${pvz.id}`);
              }

              setPenalties(prev => prev.filter(p => p.id !== penalty.id));
              
              await syncEmployeeAccruals(penalty.employeeId);
              
              showSuccess(t('alerts.success.penaltyDeleted'));
            } catch (error) {
              showError(t('alerts.network.deletePenaltyFailed'));
            }
          }
        }
      ]
    );
  };

  const recalcAllBalances = async () => {
    setRecalculating(true);
    try {
      for (const emp of employees) {
        await syncEmployeeAccruals(emp.id);
      }

      showSuccess(t('alerts.success.recalcDone'));
      await loadData();
    } catch (error) {
      console.error('Ошибка пересчёта:', error);
      showError(t('alerts.network.recalcFailed'));
    } finally {
      setRecalculating(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  return (
    <ThemedSafeAreaView style={styles.container}>
      <LoadingSpinner visible={loading && penalties.length === 0} text={t('common.loading.default')} />
      <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ChevronLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('screens.finance.penalties')}</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity onPress={recalcAllBalances} style={styles.headerButton} disabled={recalculating}>
            <RefreshCw size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.headerButton}>
            <Plus size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.content}
      >
        {!loading && penalties.length === 0 ? (
          <EmptyState
            icon={AlertCircle}
            title={t('screens.finance.noRecords')}
            description={t('screens.finance.noRecordsDesc')}
            buttonText={t('common.actions.add')}
            onButtonPress={() => setModalVisible(true)}
          />
        ) : (
          penalties.map(penalty => (
            <View
              key={penalty.id}
              style={[
                styles.penaltyCard,
                { backgroundColor: screen.card, borderColor: screen.border },
                penalty.amount > 0 ? styles.fineCard : styles.bonusCard,
              ]}
            >
              <View style={styles.penaltyHeader}>
                <View style={styles.penaltyUser}>
                  <User size={16} color={penalty.amount > 0 ? colors.danger : colors.success} />
                  <Text style={[styles.penaltyName, { color: screen.text }]}>{penalty.employeeName}</Text>
                </View>
                <TouchableOpacity onPress={() => deletePenalty(penalty)}>
                  <Trash2 size={18} color={colors.gray} />
                </TouchableOpacity>
              </View>
              <View style={styles.penaltyDetails}>
                <View style={styles.penaltyRow}>
                  <MoneyIcon size={14} color={penalty.amount > 0 ? colors.danger : colors.success} />
                  <Text style={[styles.penaltyAmount, penalty.amount > 0 ? styles.fineAmount : styles.bonusAmount]}>
                    {penalty.amount > 0 ? `-${penalty.amount} ₽` : `+${Math.abs(penalty.amount)} ₽`}
                  </Text>
                </View>
                <View style={styles.penaltyRow}>
                  <Calendar size={14} color={colors.gray} />
                  <Text style={styles.penaltyDate}>{formatDate(penalty.date)}</Text>
                </View>
                <Text style={[styles.penaltyReason, { color: screen.text }]}>📝 {penalty.reason}</Text>
                <Text style={[styles.penaltyCreated, { color: screen.textSecondary }]}>
                  {t('screens.finance.addedAt', { date: new Date(penalty.createdAt).toLocaleDateString() })}
                  {penalty.createdBy ? ` (${penalty.createdBy})` : ''}
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('screens.finance.addRecord')}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={24} color={colors.gray} />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <View style={styles.typeSelector}>
                <TouchableOpacity
                  style={[styles.typeButton, type === 'fine' && styles.typeButtonFineActive]}
                  onPress={() => setType('fine')}
                >
                  <Text style={[styles.typeText, type === 'fine' && styles.typeTextActive]}>{t('screens.finance.fineEmoji')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeButton, type === 'bonus' && styles.typeButtonBonusActive]}
                  onPress={() => setType('bonus')}
                >
                  <Text style={[styles.typeText, type === 'bonus' && styles.typeTextActive]}>{t('screens.finance.bonusEmoji')}</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>{t('screens.schedule.employee')}</Text>
              <View style={styles.employeeSelector}>
                {employees.length === 0 ? (
                  <Text style={styles.noEmployeesText}>{t('screens.finance.noEmployeesInPvz')}</Text>
                ) : (
                  employees.map(emp => (
                    <TouchableOpacity
                      key={emp.id}
                      style={[styles.employeeChip, selectedEmployeeId === emp.id && styles.employeeChipActive]}
                      onPress={() => setSelectedEmployeeId(emp.id)}
                    >
                      <Text style={[styles.employeeChipText, selectedEmployeeId === emp.id && styles.employeeChipTextActive]}>
                        {emp.name}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>

              <Text style={styles.inputLabel}>{t('screens.finance.amount')}</Text>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder={type === 'fine' ? '500' : '1000'}
                placeholderTextColor={colors.grayLight}
              />

              <Text style={styles.inputLabel}>{t('screens.finance.reason')}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={reason}
                onChangeText={setReason}
                placeholder={type === 'fine' ? t('screens.finance.finePlaceholder') : t('screens.finance.bonusPlaceholder')}
                placeholderTextColor={colors.grayLight}
                multiline
                numberOfLines={3}
              />

              <TouchableOpacity style={styles.submitButton} onPress={addPenalty}>
                <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.submitGradient}>
                  <Check size={20} color="#FFFFFF" />
                  <Text style={styles.submitText}>{t('common.actions.add')}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 30 },
  
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText: { fontSize: 16, color: '#999999', marginTop: 16 },
  emptySubtext: { fontSize: 12, color: '#CCCCCC', marginTop: 4 },
  
  penaltyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  fineCard: { borderLeftWidth: 3, borderLeftColor: colors.danger },
  bonusCard: { borderLeftWidth: 3, borderLeftColor: colors.success },
  penaltyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  penaltyUser: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  penaltyName: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  penaltyDetails: { gap: 8 },
  penaltyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  penaltyAmount: { fontSize: 16, fontWeight: 'bold' },
  fineAmount: { color: colors.danger },
  bonusAmount: { color: colors.success },
  penaltyDate: { fontSize: 13, color: '#666666' },
  penaltyReason: { fontSize: 13, color: '#666666', marginTop: 4 },
  penaltyCreated: { fontSize: 11, color: '#999999', marginTop: 4 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#FFFFFF', borderRadius: 24, width: '90%', maxHeight: '85%', padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1A1A1A' },
  
  typeSelector: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  typeButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: '#F5F5F5' },
  typeButtonFineActive: { backgroundColor: colors.danger },
  typeButtonBonusActive: { backgroundColor: colors.success },
  typeText: { fontSize: 14, color: '#666666' },
  typeTextActive: { color: '#FFFFFF' },
  
  inputLabel: { fontSize: 14, fontWeight: '500', color: '#1A1A1A', marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: '#F5F5F5', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  
  employeeSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  employeeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F5F5F5' },
  employeeChipActive: { backgroundColor: colors.primary },
  employeeChipText: { fontSize: 14, color: '#666666' },
  employeeChipTextActive: { color: '#FFFFFF' },
  noEmployeesText: { fontSize: 14, color: '#999', fontStyle: 'italic' },
  
  submitButton: { marginTop: 24, borderRadius: 30, overflow: 'hidden' },
  submitGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  submitText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});
