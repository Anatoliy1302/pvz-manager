// src/screens/owner/SalarySettingsScreen.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import ScreenHeader from '../../components/common/ScreenHeader';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useScreenToast } from '../../hooks/useScreenToast';
import { useFocusEffect } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../../context/AuthContext';
import { User } from '../../types/user';
import { colors } from '../../constants/colors';
import {
  getPvzWorkHours,
  getGlobalFullShiftRate,
  buildRatesFromFullShift,
} from '../../utils/salaryRateHelpers';
import { pushPvzSalarySettings } from '../../services/SupabaseSalarySettingsService';
import DataService from '../../services/DataService';
import { safeParseJson } from '../../utils/safeJson';
import { 
  ChevronLeft, 
  Clock, 
  Users, 
  Save, 
  AlertCircle,
  Building2,
  ChevronDown,
  Calendar,
} from 'lucide-react-native';

type EmployeeSalarySetting = {
  fullShiftRate?: number;
  halfShiftRate?: number;
  hourlyRate?: number;
  updatedAt?: string;
};

interface EmployeeSalary {
  id: string;
  name: string;
  phone: string;
  role: 'employee' | 'admin';
  fullShiftRate: number;
  halfShiftRate: number;
  hourlyRate: number;
  isCustom: boolean;
  displayValue: string;
}

export default function SalarySettingsScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { user, pvz, userPvzs } = useAuth();
  const { ui } = useThemedScreen();
  const { showError, showSuccess } = useScreenToast();
  const [refreshing, setRefreshing] = useState(false);
  const [employees, setEmployees] = useState<EmployeeSalary[]>([]);
  const [globalFullShiftRate, setGlobalFullShiftRate] = useState('3000');
  const [loading, setLoading] = useState(false);
  const [pvzWorkHours, setPvzWorkHours] = useState({ workStart: '09:00', workEnd: '21:00', totalHours: 12 });
  const [savingEmployeeId, setSavingEmployeeId] = useState<string | null>(null);
  
  const [selectedPvzId, setSelectedPvzId] = useState<string>('');
  const [showPvzDropdown, setShowPvzDropdown] = useState(false);
  const [selectedPvzName, setSelectedPvzName] = useState<string>('');

  const saveTimeouts = useRef<{ [key: string]: NodeJS.Timeout }>({});
  const pendingValues = useRef<{ [key: string]: number }>({});
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      Object.values(saveTimeouts.current).forEach(clearTimeout);
      saveTimeouts.current = {};
      pendingValues.current = {};
    };
  }, []);

  useEffect(() => {
    if (userPvzs && userPvzs.length > 0 && !selectedPvzId) {
      setSelectedPvzId(userPvzs[0].id);
      setSelectedPvzName(userPvzs[0].name);
      loadPvzWorkHours(userPvzs[0].id);
    } else if (pvz && !selectedPvzId) {
      setSelectedPvzId(pvz.id);
      setSelectedPvzName(pvz.name);
      loadPvzWorkHours(pvz.id);
    }
  }, [userPvzs, pvz]);

  const loadPvzWorkHours = async (pvzId: string) => {
    try {
      const hours = await getPvzWorkHours(pvzId);
      setPvzWorkHours(hours);
      return hours;
    } catch (error) {
      console.error('Ошибка загрузки часов работы:', error);
      return pvzWorkHours;
    }
  };

  const loadSalarySettings = async (totalHoursOverride?: number) => {
    if (!selectedPvzId) return;

    const totalHours = totalHoursOverride ?? pvzWorkHours.totalHours;

    try {
      const usersRaw = await SecureStore.getItemAsync('pvz_users');
      const users = safeParseJson<User[]>(usersRaw ?? '[]', []);
      const employeesList = users.filter((u: any) =>
        u.role !== 'owner' && u.status === 'active' && u.pvzId === selectedPvzId
      );

      const salarySettingsRaw = await SecureStore.getItemAsync(`salary_settings_${selectedPvzId}`);
      const salarySettings = safeParseJson<Record<string, EmployeeSalarySetting>>(salarySettingsRaw ?? '{}', {});

      const globalFullShiftRateTemp = await getGlobalFullShiftRate(selectedPvzId);

      setGlobalFullShiftRate(globalFullShiftRateTemp.toString());

      const employeesWithSalary: EmployeeSalary[] = employeesList.map((emp: any) => {
        const customSetting = salarySettings[emp.id];
        const fullRate = customSetting?.fullShiftRate || globalFullShiftRateTemp;
        const derived = buildRatesFromFullShift(fullRate, totalHours);
        return {
          id: emp.id,
          name: emp.name,
          phone: emp.phone,
          role: emp.role,
          fullShiftRate: derived.fullShiftRate,
          halfShiftRate: derived.halfShiftRate,
          hourlyRate: derived.hourlyRate,
          isCustom: !!customSetting?.fullShiftRate,
          displayValue: fullRate.toString(),
        };
      });

      setEmployees(employeesWithSalary);
    } catch (error) {
      console.error('Ошибка загрузки настроек зарплаты:', error);
    }
  };

  const reloadAll = async (pvzId: string) => {
    const hours = await loadPvzWorkHours(pvzId);
    await loadSalarySettings(hours.totalHours);
  };

  useFocusEffect(
    useCallback(() => {
      if (!selectedPvzId) {
        return undefined;
      }
      reloadAll(selectedPvzId);
      const unsubscribe = DataService.subscribe(`salary_settings_${selectedPvzId}`, () => {
        reloadAll(selectedPvzId);
      });
      return () => unsubscribe();
    }, [selectedPvzId])
  );

  const saveGlobalSettings = async () => {
    setLoading(true);
    try {
      const fullRate = parseFloat(globalFullShiftRate);
      if (isNaN(fullRate) || fullRate <= 0) {
        showError(t('alerts.validation.positiveAmount'));
        return;
      }

      const derived = buildRatesFromFullShift(fullRate, pvzWorkHours.totalHours);
      const hourlyRate = derived.hourlyRate;
      const halfRate = derived.halfShiftRate;
      
      const globalSettings = {
        fullShiftRate: fullRate,
        halfShiftRate: halfRate,
        hourlyRate: hourlyRate,
        updatedAt: new Date().toISOString(),
      };
      
      await SecureStore.setItemAsync(`global_salary_settings_${selectedPvzId}`, JSON.stringify(globalSettings));
      await pushPvzSalarySettings(selectedPvzId);
      
      setEmployees(prev => prev.map(emp => {
        if (!emp.isCustom) {
          return {
            ...emp,
            fullShiftRate: fullRate,
            halfShiftRate: halfRate,
            hourlyRate: hourlyRate,
            displayValue: fullRate.toString(),
          };
        }
        return emp;
      }));
      
      showSuccess(t('alerts.success.settingsSaved'));
    } catch (error) {
      console.error('Ошибка сохранения:', error);
      showError(t('alerts.network.saveSettingsFailed'));
    } finally {
      setLoading(false);
    }
  };

  const applyGlobalToAll = async () => {
    Alert.alert(
      t('screens.salarySettings.applyToAllTitle'),
      t('screens.salarySettings.applyToAllMessage'),
      [
        { text: t('common.actions.cancel'), style: 'cancel' },
        {
          text: t('common.actions.apply'),
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const fullRate = parseFloat(globalFullShiftRate);
              const derived = buildRatesFromFullShift(fullRate, pvzWorkHours.totalHours);
              const halfRate = derived.halfShiftRate;
              const hourlyRate = derived.hourlyRate;
              
              const globalSettings = {
                fullShiftRate: fullRate,
                halfShiftRate: halfRate,
                hourlyRate: hourlyRate,
                updatedAt: new Date().toISOString(),
              };
              await SecureStore.setItemAsync(`global_salary_settings_${selectedPvzId}`, JSON.stringify(globalSettings));
              
              await SecureStore.deleteItemAsync(`salary_settings_${selectedPvzId}`);
              await pushPvzSalarySettings(selectedPvzId);
              
              setEmployees(prev => prev.map(emp => ({
                ...emp,
                fullShiftRate: fullRate,
                halfShiftRate: halfRate,
                hourlyRate: hourlyRate,
                isCustom: false,
                displayValue: fullRate.toString(),
              })));
              
              showSuccess(t('alerts.success.settingsAppliedAll'));
            } catch (error) {
              showError(t('alerts.network.applySettingsFailed'));
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const performSave = async (employeeId: string, value: number) => {
    if (!Number.isFinite(value) || value <= 0) {
      showError(t('alerts.validation.positiveRate'));
      return;
    }

    setSavingEmployeeId(employeeId);
    try {
      const salarySettingsRaw = await SecureStore.getItemAsync(`salary_settings_${selectedPvzId}`);
      const salarySettings = safeParseJson<Record<string, EmployeeSalarySetting>>(salarySettingsRaw ?? '{}', {});
      
      const derived = buildRatesFromFullShift(value, pvzWorkHours.totalHours);

      salarySettings[employeeId] = {
        fullShiftRate: derived.fullShiftRate,
        halfShiftRate: derived.halfShiftRate,
        hourlyRate: derived.hourlyRate,
        updatedAt: new Date().toISOString(),
      };
      
      await SecureStore.setItemAsync(`salary_settings_${selectedPvzId}`, JSON.stringify(salarySettings));
      await pushPvzSalarySettings(selectedPvzId);
      
      setEmployees(prev => prev.map(emp => {
        if (emp.id === employeeId) {
          return {
            ...emp,
            fullShiftRate: derived.fullShiftRate,
            halfShiftRate: derived.halfShiftRate,
            hourlyRate: derived.hourlyRate,
            isCustom: true,
            displayValue: value.toString(),
          };
        }
        return emp;
      }));
      
      setTimeout(() => {
        if (mountedRef.current) {
          setSavingEmployeeId(null);
        }
      }, 500);
    } catch (error) {
      console.error('Ошибка сохранения:', error);
      showError(t('alerts.network.saveSettingFailed'));
      setSavingEmployeeId(null);
    }
  };

  const handleTextChange = (employeeId: string, text: string) => {
    setEmployees(prev => prev.map(emp => {
      if (emp.id !== employeeId) return emp;
      const numValue = parseFloat(text);
      if (!isNaN(numValue) && numValue > 0) {
        const derived = buildRatesFromFullShift(numValue, pvzWorkHours.totalHours);
        return {
          ...emp,
          displayValue: text,
          halfShiftRate: derived.halfShiftRate,
          hourlyRate: derived.hourlyRate,
        };
      }
      return { ...emp, displayValue: text };
    }));
    
    if (saveTimeouts.current[employeeId]) {
      clearTimeout(saveTimeouts.current[employeeId]);
    }
    
    if (text === '' || text === '-') {
      delete pendingValues.current[employeeId];
      return;
    }
    
    const numValue = parseFloat(text);
    if (isNaN(numValue)) return;
    
    pendingValues.current[employeeId] = numValue;
    
    saveTimeouts.current[employeeId] = setTimeout(() => {
      if (pendingValues.current[employeeId] !== undefined) {
        performSave(employeeId, pendingValues.current[employeeId]);
        delete pendingValues.current[employeeId];
      }
      delete saveTimeouts.current[employeeId];
    }, 800);
  };

  const handleBlur = (employeeId: string) => {
    const employee = employees.find(e => e.id === employeeId);
    if (!employee) return;
    
    if (saveTimeouts.current[employeeId]) {
      clearTimeout(saveTimeouts.current[employeeId]);
      delete saveTimeouts.current[employeeId];
    }
    
    let value = parseFloat(employee.displayValue);
    
    if (isNaN(value) || employee.displayValue === '') {
      setEmployees(prev => prev.map(emp => 
        emp.id === employeeId 
          ? { ...emp, displayValue: emp.fullShiftRate.toString() }
          : emp
      ));
      return;
    }
    
    if (value !== employee.fullShiftRate) {
      performSave(employeeId, value);
    }
  };

  const resetEmployeeToGlobal = async (employeeId: string) => {
    Alert.alert(
      t('screens.salarySettings.resetTitle'),
      t('alerts.confirm.resetRate'),
      [
        { text: t('common.actions.cancel'), style: 'cancel' },
        {
          text: t('common.actions.reset'),
          onPress: async () => {
            try {
              const globalFullRate = parseFloat(globalFullShiftRate);
              const derived = buildRatesFromFullShift(globalFullRate, pvzWorkHours.totalHours);
              const salarySettingsRaw = await SecureStore.getItemAsync(`salary_settings_${selectedPvzId}`);
              const salarySettings = safeParseJson<Record<string, EmployeeSalarySetting>>(salarySettingsRaw ?? '{}', {});
              
              delete salarySettings[employeeId];
              
              await SecureStore.setItemAsync(`salary_settings_${selectedPvzId}`, JSON.stringify(salarySettings));
              await pushPvzSalarySettings(selectedPvzId);
              
              setEmployees(prev => prev.map(emp => {
                if (emp.id === employeeId) {
                  return {
                    ...emp,
                    fullShiftRate: derived.fullShiftRate,
                    halfShiftRate: derived.halfShiftRate,
                    hourlyRate: derived.hourlyRate,
                    isCustom: false,
                    displayValue: globalFullRate.toString(),
                  };
                }
                return emp;
              }));
              
              showSuccess(t('alerts.success.employeeResetRate'));
            } catch (error) {
              showError(t('alerts.network.resetSettingFailed'));
            }
          }
        }
      ]
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (selectedPvzId) {
      await reloadAll(selectedPvzId);
    }
    setRefreshing(false);
  };

  const formatCurrency = (value: number) => {
    return Math.round(value).toLocaleString();
  };

  const switchPvz = async (pvzId: string, pvzName: string) => {
    setSelectedPvzId(pvzId);
    setSelectedPvzName(pvzName);
    setShowPvzDropdown(false);
    await reloadAll(pvzId);
  };

  return (
    <ThemedSafeAreaView style={styles.container}>
      <ScreenHeader
        title={t('screens.finance.rates')}
        onBack={() => navigation.goBack()}
        right={
          <TouchableOpacity onPress={saveGlobalSettings} disabled={loading}>
            <Save size={20} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {userPvzs && userPvzs.length > 1 && (
          <View style={styles.pvzSelectorContainer}>
            <TouchableOpacity 
              style={styles.pvzSelectorButton}
              onPress={() => setShowPvzDropdown(!showPvzDropdown)}
              activeOpacity={0.8}
            >
              <Building2 size={16} color={colors.primary} />
              <Text style={styles.pvzSelectorText}>
                {selectedPvzName || t('common.pvz.select')}
              </Text>
              <ChevronDown size={16} color={colors.gray} />
            </TouchableOpacity>
            
            {showPvzDropdown && (
              <View style={styles.pvzDropdown}>
                {userPvzs.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.pvzDropdownItem, selectedPvzId === p.id && styles.pvzDropdownItemActive]}
                    onPress={() => switchPvz(p.id, p.name)}
                  >
                    <Text style={[styles.pvzDropdownText, selectedPvzId === p.id && styles.pvzDropdownTextActive]}>
                      {p.name}
                    </Text>
                    {selectedPvzId === p.id && (
                      <View style={styles.pvzDropdownCheck}>
                        <Text style={styles.pvzDropdownCheckText}>✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={styles.infoCard}>
          <Calendar size={18} color={colors.primary} />
          <Text style={styles.infoText}>
            {t('screens.salarySettings.workHours', {
              start: pvzWorkHours.workStart,
              end: pvzWorkHours.workEnd,
              hours: pvzWorkHours.totalHours,
            })}
          </Text>
        </View>

        {/* Глобальные настройки */}
        <View style={[styles.globalCard, ui.card]}>
          <Text style={styles.cardTitle}>{t('screens.salarySettings.globalTitle')}</Text>
          <Text style={styles.cardSubtitle}>{t('screens.salarySettings.globalSubtitle')}</Text>
          
          <View style={styles.rateRow}>
            <Text style={styles.rateLabel}>
              {t('screens.salarySettings.fullShiftRate', { hours: pvzWorkHours.totalHours })}
            </Text>
          </View>
          <View style={styles.rateValueRow}>
            <TextInput
              style={styles.rateInput}
              value={globalFullShiftRate}
              onChangeText={setGlobalFullShiftRate}
              keyboardType="numeric"
              placeholder="3000"
              placeholderTextColor={colors.grayLight}
            />
            <Text style={styles.rateUnit}>{t('screens.salarySettings.perShift')}</Text>
          </View>
          
          <View style={styles.autoCalculated}>
            <Text style={styles.autoLabel}>{t('screens.salarySettings.autoCalc')}</Text>
            <View style={styles.autoRow}>
              <Text style={styles.autoText}>
                {t('screens.salarySettings.halfShift', { hours: pvzWorkHours.totalHours / 2 })}
              </Text>
              <Text style={styles.autoValue}>
                {formatCurrency(parseFloat(globalFullShiftRate || '0') / 2)} ₽
              </Text>
            </View>
            <View style={styles.autoRow}>
              <Text style={styles.autoText}>{t('screens.salarySettings.hourly')}</Text>
              <Text style={styles.autoValue}>
                {formatCurrency(parseFloat(globalFullShiftRate || '0') / pvzWorkHours.totalHours)}{' '}
                {t('screens.salarySettings.perHour')}
              </Text>
            </View>
          </View>
          
          {/* Кнопки */}
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.saveGlobalButton} onPress={saveGlobalSettings}>
              <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.saveGlobalGradient}>
                <Save size={16} color="#FFFFFF" />
                <Text style={styles.saveGlobalText}>{t('common.actions.save')}</Text>
              </LinearGradient>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.applyToAllButton} onPress={applyGlobalToAll}>
              <LinearGradient colors={[colors.warning, colors.warning]} style={styles.applyToAllGradient}>
                <Users size={16} color="#FFFFFF" />
                <Text style={styles.applyToAllText}>{t('screens.salarySettings.applyToAll')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
          
          <Text style={styles.noteText}>
            {t('screens.salarySettings.applyToAllWarning')}
          </Text>
        </View>

        {/* Индивидуальные настройки сотрудников */}
        <View style={styles.employeesCard}>
          <Text style={styles.cardTitle}>{t('screens.salarySettings.individualTitle')}</Text>
          <Text style={styles.cardSubtitle}>{t('screens.salarySettings.individualSubtitle')}</Text>
          
          {employees.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Users size={48} color={colors.grayLighter} />
              <Text style={styles.emptyText}>{t('screens.salarySettings.noEmployees')}</Text>
            </View>
          ) : (
            employees.map((employee) => (
              <View key={employee.id} style={[styles.employeeCard, ui.card]}>
                <View style={styles.employeeHeader}>
                  <View>
                    <Text style={styles.employeeName}>{employee.name}</Text>
                    <Text style={styles.employeeRole}>
                      {employee.role === 'admin'
                        ? t('common.roles.admin')
                        : t('common.roles.employee')}
                    </Text>
                  </View>
                  {!employee.isCustom && (
                    <View style={styles.globalBadge}>
                      <Text style={styles.globalBadgeText}>{t('screens.salarySettings.usesGlobal')}</Text>
                    </View>
                  )}
                  {employee.isCustom && (
                    <View style={styles.customBadge}>
                      <Text style={styles.customBadgeText}>{t('screens.salarySettings.customRate')}</Text>
                    </View>
                  )}
                </View>
                
                <View style={styles.employeeRateRow}>
                  <Text style={styles.employeeRateLabel}>
                    {t('screens.salarySettings.employeeRate', { hours: pvzWorkHours.totalHours })}
                  </Text>
                  <View style={styles.employeeRateValue}>
                    <TextInput
                      style={styles.employeeRateInput}
                      value={employee.displayValue}
                      onChangeText={(text) => handleTextChange(employee.id, text)}
                      onBlur={() => handleBlur(employee.id)}
                      keyboardType="numeric"
                      placeholder={globalFullShiftRate}
                      placeholderTextColor={colors.grayLight}
                    />
                    <Text style={styles.employeeRateUnit}>{t('screens.salarySettings.perShift')}</Text>
                    {savingEmployeeId === employee.id && (
                      <Text style={styles.savingText}>💾</Text>
                    )}
                  </View>
                </View>
                
                <View style={styles.employeeAuto}>
                  <Text style={styles.employeeAutoText}>
                    {t('screens.salarySettings.halfShiftRate', {
                      amount: formatCurrency(employee.halfShiftRate),
                    })}
                  </Text>
                  <Text style={styles.employeeAutoText}>
                    {t('screens.salarySettings.hourlyRate', {
                      amount: formatCurrency(employee.hourlyRate),
                    })}
                  </Text>
                </View>
                
                {employee.isCustom && (
                  <TouchableOpacity
                    style={styles.resetButton}
                    onPress={() => resetEmployeeToGlobal(employee.id)}
                  >
                    <Text style={styles.resetButtonText}>{t('screens.salarySettings.resetToGlobal')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </View>

        <View style={styles.infoCardBottom}>
          <AlertCircle size={20} color={colors.warning} />
          <Text style={styles.infoTextBottom}>
            {t('screens.salarySettings.hint1', { hours: pvzWorkHours.totalHours })}
          </Text>
          <Text style={styles.infoTextBottom}>
            {t('screens.salarySettings.hint2', { hours: pvzWorkHours.totalHours / 2 })}
          </Text>
          <Text style={styles.infoTextBottom}>
            {t('screens.salarySettings.hint3')}
          </Text>
          <Text style={styles.infoTextBottom}>
            {t('screens.salarySettings.hint4')}
          </Text>
        </View>
      </ScrollView>
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

  pvzSelectorContainer: { marginHorizontal: 16, marginTop: 16, position: 'relative', zIndex: 10 },
  pvzSelectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  pvzSelectorText: { flex: 1, fontSize: 14, fontWeight: '500', color: '#1A1A1A' },
  pvzDropdown: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    zIndex: 20,
  },
  pvzDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  pvzDropdownItemActive: { backgroundColor: colors.primaryLight },
  pvzDropdownText: { fontSize: 14, color: '#666' },
  pvzDropdownTextActive: { color: colors.primary, fontWeight: '500' },
  pvzDropdownCheck: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  pvzDropdownCheckText: { fontSize: 12, color: '#FFFFFF', fontWeight: 'bold' },

  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E8F0FE',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
    borderRadius: 16,
  },
  infoText: { flex: 1, fontSize: 13, color: colors.primary },

  globalCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  employeesCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#1A1A1A', marginBottom: 4 },
  cardSubtitle: { fontSize: 12, color: '#999999', marginBottom: 16 },
  
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  rateLabel: { fontSize: 14, fontWeight: '500', color: '#1A1A1A' },
  
  rateValueRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  rateInput: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginRight: 8,
  },
  rateUnit: { fontSize: 14, color: '#666666' },
  
  autoCalculated: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  autoLabel: { fontSize: 12, color: '#666666', marginBottom: 8 },
  autoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  autoText: { fontSize: 13, color: '#1A1A1A' },
  autoValue: { fontSize: 13, fontWeight: '500', color: colors.primary },
  
  buttonRow: { 
    flexDirection: 'row', 
    gap: 12, 
    marginBottom: 12,
    marginTop: 8,
  },
  saveGlobalButton: { 
    flex: 1, 
    borderRadius: 30, 
    overflow: 'hidden',
    minWidth: 120,
  },
  saveGlobalGradient: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 6, 
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  saveGlobalText: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: '#FFFFFF',
  },
  applyToAllButton: { 
    flex: 1, 
    borderRadius: 30, 
    overflow: 'hidden',
    minWidth: 120,
  },
  applyToAllGradient: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 6, 
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  applyToAllText: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: '#FFFFFF',
  },
  noteText: { fontSize: 11, color: colors.warning, marginTop: 8, textAlign: 'center' },
  
  employeeCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  employeeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  employeeName: { fontSize: 16, fontWeight: '600', color: '#1A1A1A' },
  employeeRole: { fontSize: 12, color: '#999999', marginTop: 2 },
  globalBadge: { backgroundColor: '#E8F0FE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  globalBadgeText: { fontSize: 10, color: colors.primary },
  customBadge: { backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  customBadgeText: { fontSize: 10, color: colors.success },
  
  employeeRateRow: { marginBottom: 12 },
  employeeRateLabel: { fontSize: 12, color: '#666666', marginBottom: 6 },
  employeeRateValue: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: '#E8E8E8' },
  employeeRateInput: { flex: 1, fontSize: 16, paddingVertical: 10, textAlign: 'center', color: '#1A1A1A' },
  employeeRateUnit: { fontSize: 12, color: '#999999', marginLeft: 4 },
  savingText: { fontSize: 14, marginLeft: 8 },
  
  employeeAuto: { marginBottom: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E8E8E8' },
  employeeAutoText: { fontSize: 12, color: '#666666', marginBottom: 4 },
  
  resetButton: { alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E8E8E8' },
  resetButtonText: { fontSize: 12, color: colors.danger },
  
  infoCardBottom: {
    backgroundColor: '#FFF3E0',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 30,
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  infoTextBottom: { fontSize: 12, color: colors.warning, lineHeight: 18 },
  
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 14, color: '#999999', marginTop: 12 },
});