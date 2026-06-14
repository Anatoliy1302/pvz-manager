// src/screens/owner/FormulaEditorScreen.tsx
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import ScreenHeader from '../../components/common/ScreenHeader';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useScreenToast } from '../../hooks/useScreenToast';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../constants/colors';
import {
  SalaryFormula,
  PayType,
  defaultSalaryFormula,
  GoodsBonus,
  SubstitutionBonus,
  SeniorityBonus,
  LatePenalty,
  RatingPenalty,
} from '../../types/salary';
import { saveFormula } from '../../services/SalaryFormulaService';
import {
  ChevronLeft,
  Save,
  Users,
  Package,
  Clock,
  AlertCircle,
  Star,
  TrendingUp,
  Shield,
} from 'lucide-react-native';
import MoneyIcon from '../../components/icons/MoneyIcon';
import { generateSecureId } from '../../utils/generateSecureId';

const mergeGoodsBonus = (current: GoodsBonus | undefined, patch: Partial<GoodsBonus>): GoodsBonus => ({
  enabled: patch.enabled ?? current?.enabled ?? false,
  threshold: patch.threshold ?? current?.threshold ?? 0,
  perItem: patch.perItem ?? current?.perItem,
  percent: patch.percent ?? current?.percent,
});

const mergeSubstitutionBonus = (
  current: SubstitutionBonus | undefined,
  patch: Partial<SubstitutionBonus>
): SubstitutionBonus => ({
  enabled: patch.enabled ?? current?.enabled ?? false,
  amount: patch.amount ?? current?.amount ?? 0,
});

const mergeSeniorityBonus = (
  current: SeniorityBonus | undefined,
  patch: Partial<SeniorityBonus>
): SeniorityBonus => ({
  enabled: patch.enabled ?? current?.enabled ?? false,
  perYear: patch.perYear ?? current?.perYear ?? 0,
});

const mergeLatePenalty = (current: LatePenalty | undefined, patch: Partial<LatePenalty>): LatePenalty => ({
  enabled: patch.enabled ?? current?.enabled ?? false,
  amount: patch.amount ?? current?.amount ?? 0,
});

const mergeRatingPenalty = (
  current: RatingPenalty | undefined,
  patch: Partial<RatingPenalty>
): RatingPenalty => ({
  enabled: patch.enabled ?? current?.enabled ?? false,
  perPoint: patch.perPoint ?? current?.perPoint ?? 0,
  targetRating: patch.targetRating ?? current?.targetRating ?? 4.5,
});

export default function FormulaEditorScreen({ navigation, route }: any) {
  const { t } = useTranslation();
  const { pvz } = useAuth();
  const { ui, screen } = useThemedScreen();
  const { showError, showSuccess } = useScreenToast();
  const { formula: existingFormula } = route.params || {};
  
  const [formula, setFormula] = useState<Partial<SalaryFormula>>(
    existingFormula || {
      ...defaultSalaryFormula,
      name: '',
      description: '',
      pvzId: pvz?.id,
      isActive: false,
    }
  );
  
  const [activeTab, setActiveTab] = useState<'base' | 'bonus' | 'penalty'>('base');

  const handleSave = async () => {
    if (!formula.name?.trim()) {
      showError(t('alerts.validation.enterFormulaName'));
      return;
    }
    
    if (!pvz?.id) return;
    
    const formulaToSave: SalaryFormula = {
      id: existingFormula?.id || generateSecureId(),
      pvzId: pvz.id,
      name: formula.name || '',
      description: formula.description,
      payType: formula.payType as PayType || 'fixed_shift',
      rate1Employee: formula.rate1Employee || 0,
      rate2Employees: formula.rate2Employees || 0,
      rate3Employees: formula.rate3Employees || 0,
      rate4Employees: formula.rate4Employees || 0,
      hoursCalculationType: formula.hoursCalculationType || 'planned',
      goodsIssuedBonus: formula.goodsIssuedBonus || { enabled: false, threshold: 0 },
      goodsReceivedBonus: formula.goodsReceivedBonus || { enabled: false, threshold: 0 },
      latePenalty: formula.latePenalty || { enabled: false, amount: 0 },
      ratingPenalty: formula.ratingPenalty || { enabled: false, perPoint: 0, targetRating: 4.5 },
      substitutionBonus: formula.substitutionBonus || { enabled: false, amount: 0 },
      seniorityBonus: formula.seniorityBonus || { enabled: false, perYear: 0 },
      appliesTo: formula.appliesTo || 'all_employees',
      isActive: formula.isActive || false,
      createdAt: existingFormula?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await saveFormula(pvz.id, formulaToSave);
    showSuccess(t('alerts.success.formulaSaved'));
    navigation.goBack();
  };

  const renderBaseTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>{t('screens.formulaEditor.payTypeSection')}</Text>
      <View style={styles.payTypeRow}>
        <TouchableOpacity
          style={[styles.payTypeButton, formula.payType === 'fixed_shift' && styles.payTypeActive]}
          onPress={() => setFormula({ ...formula, payType: 'fixed_shift' })}
        >
          <Text style={[styles.payTypeText, formula.payType === 'fixed_shift' && styles.payTypeTextActive]}>
            {t('screens.formulas.payTypeFixed')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.payTypeButton, formula.payType === 'hourly' && styles.payTypeActive]}
          onPress={() => setFormula({ ...formula, payType: 'hourly' })}
        >
          <Text style={[styles.payTypeText, formula.payType === 'hourly' && styles.payTypeTextActive]}>
            {t('screens.formulas.payTypeHourly')}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>{t('screens.formulaEditor.ratesSection')}</Text>
      <View style={styles.ratesGrid}>
        <View style={styles.rateItem}>
          <Text style={styles.rateLabel}>{t('screens.formulaEditor.rate1Label')}</Text>
          <TextInput
            style={styles.rateInput}
            value={formula.rate1Employee?.toString()}
            onChangeText={(v) => setFormula({ ...formula, rate1Employee: parseFloat(v) || 0 })}
            keyboardType="numeric"
            placeholder="0"
          />
        </View>
        <View style={styles.rateItem}>
          <Text style={styles.rateLabel}>{t('screens.formulaEditor.rate2Label')}</Text>
          <TextInput
            style={styles.rateInput}
            value={formula.rate2Employees?.toString()}
            onChangeText={(v) => setFormula({ ...formula, rate2Employees: parseFloat(v) || 0 })}
            keyboardType="numeric"
            placeholder="0"
          />
        </View>
        <View style={styles.rateItem}>
          <Text style={styles.rateLabel}>{t('screens.formulaEditor.rate3Label')}</Text>
          <TextInput
            style={styles.rateInput}
            value={formula.rate3Employees?.toString()}
            onChangeText={(v) => setFormula({ ...formula, rate3Employees: parseFloat(v) || 0 })}
            keyboardType="numeric"
            placeholder="0"
          />
        </View>
        <View style={styles.rateItem}>
          <Text style={styles.rateLabel}>{t('screens.formulaEditor.rate4Label')}</Text>
          <TextInput
            style={styles.rateInput}
            value={formula.rate4Employees?.toString()}
            onChangeText={(v) => setFormula({ ...formula, rate4Employees: parseFloat(v) || 0 })}
            keyboardType="numeric"
            placeholder="0"
          />
        </View>
      </View>

      <Text style={styles.sectionTitle}>{t('screens.formulaEditor.hoursSection')}</Text>
      <View style={styles.hoursRow}>
        <TouchableOpacity
          style={[styles.hoursButton, formula.hoursCalculationType === 'planned' && styles.hoursActive]}
          onPress={() => setFormula({ ...formula, hoursCalculationType: 'planned' })}
        >
          <Text style={styles.hoursText}>{t('screens.formulaEditor.hoursPlanned')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.hoursButton, formula.hoursCalculationType === 'factual' && styles.hoursActive]}
          onPress={() => setFormula({ ...formula, hoursCalculationType: 'factual' })}
        >
          <Text style={styles.hoursText}>{t('screens.formulaEditor.hoursFactual')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderBonusTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>{t('screens.formulaEditor.goodsBonusSection')}</Text>
      
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{t('screens.formulaEditor.issuedBonus')}</Text>
        <Switch 
          value={formula.goodsIssuedBonus?.enabled || false} 
          onValueChange={(v) => setFormula({ 
            ...formula, 
            goodsIssuedBonus: { ...formula.goodsIssuedBonus, enabled: v, threshold: formula.goodsIssuedBonus?.threshold || 0 }
          })}
        />
      </View>
      
      {formula.goodsIssuedBonus?.enabled && (
        <View style={styles.bonusContainer}>
          <TextInput
            style={styles.bonusInput}
            placeholder={t('screens.formulaEditor.thresholdIssued')}
            value={formula.goodsIssuedBonus?.threshold?.toString()}
            onChangeText={(v) => setFormula({
              ...formula,
              goodsIssuedBonus: mergeGoodsBonus(formula.goodsIssuedBonus, { threshold: parseInt(v) || 0 }),
            })}
            keyboardType="numeric"
          />
          <TextInput
            style={styles.bonusInput}
            placeholder={t('screens.formulaEditor.perItemBonus')}
            value={formula.goodsIssuedBonus?.perItem?.toString()}
            onChangeText={(v) => setFormula({
              ...formula,
              goodsIssuedBonus: mergeGoodsBonus(formula.goodsIssuedBonus, { perItem: parseFloat(v) || 0 }),
            })}
            keyboardType="numeric"
          />
        </View>
      )}

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{t('screens.formulaEditor.receivedBonus')}</Text>
        <Switch 
          value={formula.goodsReceivedBonus?.enabled || false} 
          onValueChange={(v) => setFormula({ 
            ...formula, 
            goodsReceivedBonus: { ...formula.goodsReceivedBonus, enabled: v, threshold: formula.goodsReceivedBonus?.threshold || 0 }
          })}
        />
      </View>
      
      {formula.goodsReceivedBonus?.enabled && (
        <View style={styles.bonusContainer}>
          <TextInput
            style={styles.bonusInput}
            placeholder={t('screens.formulaEditor.threshold')}
            value={formula.goodsReceivedBonus?.threshold?.toString()}
            onChangeText={(v) => setFormula({
              ...formula,
              goodsReceivedBonus: mergeGoodsBonus(formula.goodsReceivedBonus, { threshold: parseInt(v) || 0 }),
            })}
            keyboardType="numeric"
          />
          <TextInput
            style={styles.bonusInput}
            placeholder={t('screens.formulaEditor.perItemBonus')}
            value={formula.goodsReceivedBonus?.perItem?.toString()}
            onChangeText={(v) => setFormula({
              ...formula,
              goodsReceivedBonus: mergeGoodsBonus(formula.goodsReceivedBonus, { perItem: parseFloat(v) || 0 }),
            })}
            keyboardType="numeric"
          />
        </View>
      )}

      <Text style={styles.sectionTitle}>{t('screens.formulaEditor.extrasSection')}</Text>
      
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{t('screens.formulaEditor.substitutionBonus')}</Text>
        <Switch 
          value={formula.substitutionBonus?.enabled || false} 
          onValueChange={(v) => setFormula({ 
            ...formula, 
            substitutionBonus: { ...formula.substitutionBonus, enabled: v, amount: formula.substitutionBonus?.amount || 0 }
          })}
        />
      </View>
      
      {formula.substitutionBonus?.enabled && (
        <TextInput
          style={styles.fullInput}
          placeholder={t('screens.formulaEditor.substitutionAmount')}
          value={formula.substitutionBonus?.amount?.toString()}
          onChangeText={(v) => setFormula({
            ...formula,
            substitutionBonus: mergeSubstitutionBonus(formula.substitutionBonus, { amount: parseFloat(v) || 0 }),
          })}
          keyboardType="numeric"
        />
      )}

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{t('screens.formulaEditor.seniorityBonus')}</Text>
        <Switch 
          value={formula.seniorityBonus?.enabled || false} 
          onValueChange={(v) => setFormula({ 
            ...formula, 
            seniorityBonus: { ...formula.seniorityBonus, enabled: v, perYear: formula.seniorityBonus?.perYear || 0 }
          })}
        />
      </View>
      
      {formula.seniorityBonus?.enabled && (
        <TextInput
          style={styles.fullInput}
          placeholder={t('screens.formulaEditor.seniorityPerYear')}
          value={formula.seniorityBonus?.perYear?.toString()}
          onChangeText={(v) => setFormula({
            ...formula,
            seniorityBonus: mergeSeniorityBonus(formula.seniorityBonus, { perYear: parseFloat(v) || 0 }),
          })}
          keyboardType="numeric"
        />
      )}
    </View>
  );

  const renderPenaltyTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>{t('screens.formulaEditor.penaltiesSection')}</Text>
      
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{t('screens.formulaEditor.latePenalty')}</Text>
        <Switch 
          value={formula.latePenalty?.enabled || false} 
          onValueChange={(v) => setFormula({ 
            ...formula, 
            latePenalty: { ...formula.latePenalty, enabled: v, amount: formula.latePenalty?.amount || 0 }
          })}
        />
      </View>
      
      {formula.latePenalty?.enabled && (
        <TextInput
          style={styles.fullInput}
          placeholder={t('screens.formulaEditor.penaltyAmount')}
          value={formula.latePenalty?.amount?.toString()}
          onChangeText={(v) => setFormula({
            ...formula,
            latePenalty: mergeLatePenalty(formula.latePenalty, { amount: parseFloat(v) || 0 }),
          })}
          keyboardType="numeric"
        />
      )}

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{t('screens.formulaEditor.ratingPenalty')}</Text>
        <Switch 
          value={formula.ratingPenalty?.enabled || false} 
          onValueChange={(v) => setFormula({ 
            ...formula, 
            ratingPenalty: { ...formula.ratingPenalty, enabled: v, perPoint: formula.ratingPenalty?.perPoint || 0, targetRating: formula.ratingPenalty?.targetRating || 4.5 }
          })}
        />
      </View>
      
      {formula.ratingPenalty?.enabled && (
        <View style={styles.ratingRow}>
          <TextInput
            style={styles.ratingInput}
            placeholder={t('screens.formulaEditor.targetRating')}
            value={formula.ratingPenalty?.targetRating?.toString()}
            onChangeText={(v) => setFormula({
              ...formula,
              ratingPenalty: mergeRatingPenalty(formula.ratingPenalty, { targetRating: parseFloat(v) || 4.5 }),
            })}
            keyboardType="numeric"
          />
          <TextInput
            style={styles.ratingInput}
            placeholder={t('screens.formulaEditor.perPointPenalty')}
            value={formula.ratingPenalty?.perPoint?.toString()}
            onChangeText={(v) => setFormula({
              ...formula,
              ratingPenalty: mergeRatingPenalty(formula.ratingPenalty, { perPoint: parseFloat(v) || 0 }),
            })}
            keyboardType="numeric"
          />
        </View>
      )}
    </View>
  );

  return (
    <ThemedSafeAreaView style={styles.container}>
      <ScreenHeader
        title={existingFormula ? t('screens.formulaEditor.editTitle') : t('screens.formulaEditor.newTitle')}
        onBack={() => navigation.goBack()}
        right={
          <TouchableOpacity onPress={handleSave}>
            <Save size={20} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView style={styles.formContainer}>
          <View style={[styles.nameCard, ui.card]}>
            <Text style={[styles.nameLabel, ui.title]}>{t('screens.formulaEditor.nameLabel')}</Text>
            <TextInput
              style={[styles.nameInput, { color: screen.text, backgroundColor: ui.input.backgroundColor }]}
              value={formula.name}
              onChangeText={(v) => setFormula({ ...formula, name: v })}
              placeholder={t('screens.formulaEditor.namePlaceholder')}
              placeholderTextColor={colors.grayLight}
            />
            <Text style={styles.nameLabel}>{t('screens.formulaEditor.descLabel')}</Text>
            <TextInput
              style={styles.descInput}
              value={formula.description}
              onChangeText={(v) => setFormula({ ...formula, description: v })}
              placeholder={t('screens.formulaEditor.descPlaceholder')}
              placeholderTextColor={colors.grayLight}
              multiline
            />
          </View>

          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'base' && styles.tabActive]}
              onPress={() => setActiveTab('base')}
            >
              <MoneyIcon size={18} color={activeTab === 'base' ? colors.primary : '#666'} />
              <Text style={[styles.tabText, activeTab === 'base' && styles.tabTextActive]}>{t('screens.formulaEditor.tabBase')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'bonus' && styles.tabActive]}
              onPress={() => setActiveTab('bonus')}
            >
              <TrendingUp size={18} color={activeTab === 'bonus' ? colors.primary : '#666'} />
              <Text style={[styles.tabText, activeTab === 'bonus' && styles.tabTextActive]}>{t('screens.formulaEditor.tabBonus')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'penalty' && styles.tabActive]}
              onPress={() => setActiveTab('penalty')}
            >
              <Shield size={18} color={activeTab === 'penalty' ? colors.primary : '#666'} />
              <Text style={[styles.tabText, activeTab === 'penalty' && styles.tabTextActive]}>{t('screens.formulaEditor.tabPenalty')}</Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'base' && renderBaseTab()}
          {activeTab === 'bonus' && renderBonusTab()}
          {activeTab === 'penalty' && renderPenaltyTab()}
        </ScrollView>
      </KeyboardAvoidingView>
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
  saveButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  keyboardView: { flex: 1 },
  formContainer: { padding: 20 },
  
  nameCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  nameLabel: { fontSize: 14, fontWeight: '500', color: '#1A1A1A', marginBottom: 8 },
  nameInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  descInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 16,
    marginBottom: 20,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
  },
  tabActive: {
    backgroundColor: colors.primaryLight,
  },
  tabText: {
    fontSize: 14,
    color: '#666',
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '500',
  },
  
  tabContent: { paddingBottom: 40 },
  
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#1A1A1A', marginTop: 20, marginBottom: 12 },
  
  payTypeRow: { flexDirection: 'row', gap: 12 },
  payTypeButton: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: '#F5F5F5' },
  payTypeActive: { backgroundColor: colors.primary },
  payTypeText: { fontSize: 14, color: '#666' },
  payTypeTextActive: { color: '#FFF' },
  
  ratesGrid: { gap: 12 },
  rateItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rateLabel: { fontSize: 14, color: '#666' },
  rateInput: { width: 100, backgroundColor: '#F5F5F5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, textAlign: 'center' },
  
  hoursRow: { flexDirection: 'row', gap: 12 },
  hoursButton: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: '#F5F5F5' },
  hoursActive: { backgroundColor: colors.primary },
  hoursText: { fontSize: 13, color: '#666' },
  
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  switchLabel: { fontSize: 14, color: '#1A1A1A' },
  
  bonusContainer: { marginTop: 8, marginBottom: 16, gap: 8 },
  bonusInput: { backgroundColor: '#F5F5F5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  fullInput: { backgroundColor: '#F5F5F5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16 },
  
  ratingRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  ratingInput: { flex: 1, backgroundColor: '#F5F5F5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
});