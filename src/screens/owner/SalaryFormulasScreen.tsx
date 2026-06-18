// src/screens/owner/SalaryFormulasScreen.tsx
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Switch,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import ScreenHeader from '../../components/common/ScreenHeader';
import EmptyState from '../../components/common/EmptyState';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useScreenToast } from '../../hooks/useScreenToast';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../constants/colors';
import { SalaryFormula } from '../../types/salary';
import { getFormulas, deleteFormula, saveFormula } from '../../services/SalaryFormulaService';
import DataService from '../../services/DataService';
import { 
  ChevronLeft, 
  Plus, 
  Trash2, 
  Edit2,
  Users,
  Package,
  Clock,
  AlertCircle,
  Star,
  Check,
  X,
  Calculator,
} from 'lucide-react-native';
import MoneyIcon from '../../components/icons/MoneyIcon';
import { FLAT_LIST_PERF } from '../../constants/flatListPerf';

export default function SalaryFormulasScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { pvz } = useAuth();
  const { ui, screen } = useThemedScreen();
  const { showSuccess } = useScreenToast();
  const [refreshing, setRefreshing] = useState(false);
  const [formulas, setFormulas] = useState<SalaryFormula[]>([]);

  const loadFormulas = async () => {
    if (!pvz?.id) return;
    const loaded = await getFormulas(pvz.id);
    setFormulas(loaded);
  };

  useFocusEffect(
    useCallback(() => {
      loadFormulas();
      if (!pvz?.id) {
        return undefined;
      }
      const unsubscribe = DataService.subscribe(`salary_formulas_${pvz.id}`, loadFormulas);
      return () => unsubscribe();
    }, [pvz?.id])
  );

  const handleDelete = (formula: SalaryFormula) => {
    Alert.alert(
      t('alerts.confirm.deleteFormulaTitle'),
      t('alerts.confirm.deleteFormulaMessage', { name: formula.name }),
      [
        { text: t('common.actions.cancel'), style: 'cancel' },
        {
          text: t('common.actions.delete'),
          style: 'destructive',
          onPress: async () => {
            if (pvz?.id) {
              await deleteFormula(pvz.id, formula.id);
              await loadFormulas();
              showSuccess(t('alerts.success.formulaDeleted'));
            }
          }
        }
      ]
    );
  };

  const handleSetDefault = async (formula: SalaryFormula) => {
    if (!pvz?.id) return;
    
    const updatedFormulas = formulas.map(f => ({
      ...f,
      isActive: f.id === formula.id,
    }));
    
    for (const f of updatedFormulas) {
      await saveFormula(pvz.id, f);
    }
    
    await loadFormulas();
    showSuccess(t('alerts.success.formulaSetDefault', { name: formula.name }));
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadFormulas();
    setRefreshing(false);
  };

  const getPayTypeText = (payType: string) => {
    switch (payType) {
      case 'fixed_shift': return t('screens.formulas.payTypeFixed');
      case 'hourly': return t('screens.formulas.payTypeHourly');
      case 'mixed': return t('screens.formulas.payTypeMixed');
      default: return payType;
    }
  };

  const getRateText = (formula: SalaryFormula) => {
    const rates = [];
    if (formula.rate1Employee) rates.push(t('screens.formulas.rate1', { amount: formula.rate1Employee }));
    if (formula.rate2Employees) rates.push(t('screens.formulas.rate2', { amount: formula.rate2Employees }));
    if (formula.rate3Employees) rates.push(t('screens.formulas.rate3', { amount: formula.rate3Employees }));
    if (formula.rate4Employees) rates.push(t('screens.formulas.rate4', { amount: formula.rate4Employees }));
    return rates.join(' • ');
  };

  const getBonusCount = (formula: SalaryFormula) => {
    let count = 0;
    if (formula.goodsIssuedBonus?.enabled) count++;
    if (formula.goodsReceivedBonus?.enabled) count++;
    if (formula.substitutionBonus?.enabled) count++;
    if (formula.seniorityBonus?.enabled) count++;
    return count;
  };

  const getPenaltyCount = (formula: SalaryFormula) => {
    let count = 0;
    if (formula.latePenalty?.enabled) count++;
    if (formula.ratingPenalty?.enabled) count++;
    return count;
  };

  const listHeader = (
    <View style={[styles.infoCard, ui.card]}>
      <Text style={[styles.infoText, ui.subtitle]}>{t('screens.formulas.info')}</Text>
    </View>
  );

  const renderFormulaItem = useCallback(
    ({ item: formula }: { item: SalaryFormula }) => (
      <View style={[styles.formulaCard, ui.card, formula.isActive && styles.activeCard]}>
        <View style={styles.formulaHeader}>
          <View style={styles.formulaTitleRow}>
            <Text style={[styles.formulaName, ui.title]}>{formula.name}</Text>
            {formula.isActive && (
              <View style={styles.defaultBadge}>
                <Text style={styles.defaultBadgeText}>{t('screens.formulas.defaultBadge')}</Text>
              </View>
            )}
          </View>
          <View style={styles.formulaActions}>
            <TouchableOpacity
              onPress={() => navigation.navigate('FormulaEditor', { formula })}
              style={styles.actionButton}
            >
              <Edit2 size={18} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDelete(formula)} style={styles.actionButton}>
              <Trash2 size={18} color={colors.danger} />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.formulaType}>{getPayTypeText(formula.payType)}</Text>
        <Text style={[styles.formulaRates, ui.subtitle]}>{getRateText(formula)}</Text>

        <View style={styles.formulaStats}>
          <View style={styles.statItem}>
            <Package size={14} color={colors.primary} />
            <Text style={[styles.statText, ui.subtitle]}>
              {t('screens.formulas.bonuses', { count: getBonusCount(formula) })}
            </Text>
          </View>
          <View style={styles.statItem}>
            <AlertCircle size={14} color={colors.danger} />
            <Text style={[styles.statText, ui.subtitle]}>
              {t('screens.formulas.penalties', { count: getPenaltyCount(formula) })}
            </Text>
          </View>
        </View>

        {formula.description && (
          <Text style={[styles.formulaDescription, ui.subtitle]}>{formula.description}</Text>
        )}

        {!formula.isActive && (
          <TouchableOpacity
            style={[styles.setDefaultButton, { borderTopColor: screen.border }]}
            onPress={() => handleSetDefault(formula)}
          >
            <Text style={styles.setDefaultText}>{t('screens.formulas.setDefault')}</Text>
          </TouchableOpacity>
        )}
      </View>
    ),
    [ui, screen, t, navigation, handleDelete, handleSetDefault, getPayTypeText, getRateText, getBonusCount, getPenaltyCount]
  );

  return (
    <ThemedSafeAreaView style={styles.container}>
      <ScreenHeader
        title={t('screens.finance.formulas')}
        onBack={() => navigation.goBack()}
        right={
          <TouchableOpacity onPress={() => navigation.navigate('FormulaEditor', { formula: null })}>
            <Plus size={24} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />

      <FlatList
        data={formulas}
        keyExtractor={(item) => item.id}
        renderItem={renderFormulaItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <EmptyState
            icon={Calculator}
            title={t('screens.formulas.emptyTitle')}
            description={t('screens.formulas.emptyDesc')}
            buttonText={t('common.actions.create')}
            onButtonPress={() => navigation.navigate('FormulaEditor', { formula: null })}
          />
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.content}
        {...FLAT_LIST_PERF}
      />
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
  addButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 30 },
  
  infoCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  infoText: { fontSize: 13, lineHeight: 18 },
  
  formulaCard: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  },
  activeCard: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  formulaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  formulaTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  formulaName: {
    fontSize: 16,
    fontWeight: '600',
  },
  defaultBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  defaultBadgeText: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: '500',
  },
  formulaActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    padding: 4,
  },
  formulaType: {
    fontSize: 13,
    color: colors.primary,
    marginBottom: 6,
  },
  formulaRates: {
    fontSize: 12,
    marginBottom: 8,
  },
  formulaStats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 11,
  },
  formulaDescription: {
    fontSize: 12,
    marginTop: 4,
    fontStyle: 'italic',
  },
  setDefaultButton: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  setDefaultText: {
    fontSize: 13,
    color: colors.primary,
  },
});
