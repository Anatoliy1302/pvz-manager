import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../../../constants/colors';
import { formatDate } from '../../../../utils/dateHelpers';
import { EmployeeShift } from '../employeeScheduleTypes';
import { useEmployeeScheduleStyles } from '../useEmployeeScheduleStyles';

interface SwapRequestModalProps {
  visible: boolean;
  selectedShift: EmployeeShift | null;
  employees: { id: string; name: string }[];
  targetEmployeeShifts: EmployeeShift[];
  swapTargetEmployeeId: string;
  swapTargetShiftId: string;
  swapReason: string;
  onClose: () => void;
  onSelectEmployee: (employeeId: string) => void;
  onSelectShift: (shiftId: string) => void;
  onReasonChange: (reason: string) => void;
  onSubmit: () => void;
}

export default function SwapRequestModal({
  visible,
  selectedShift,
  employees,
  targetEmployeeShifts,
  swapTargetEmployeeId,
  swapTargetShiftId,
  swapReason,
  onClose,
  onSelectEmployee,
  onSelectShift,
  onReasonChange,
  onSubmit,
}: SwapRequestModalProps) {
  const { t } = useTranslation();
  const styles = useEmployeeScheduleStyles();

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{t('screens.schedule.offerSwap')}</Text>

          {selectedShift && (
            <View style={styles.selectedShiftInfo}>
              <Text style={styles.shiftInfoLabel}>{t('screens.schedule.yourShift')}</Text>
              <Text style={styles.shiftInfoText}>
                {formatDate(selectedShift.date, 'long')}, {selectedShift.startTime} —{' '}
                {selectedShift.endTime}
              </Text>
            </View>
          )}

          <Text style={styles.inputLabel}>{t('screens.schedule.offerTo')}</Text>
          <ScrollView style={styles.employeeSelectList}>
            {employees.map((emp) => (
              <TouchableOpacity
                key={emp.id}
                style={[
                  styles.employeeSelectItem,
                  swapTargetEmployeeId === emp.id && styles.employeeSelectItemActive,
                ]}
                onPress={() => onSelectEmployee(emp.id)}
              >
                <Text
                  style={[
                    styles.employeeSelectText,
                    swapTargetEmployeeId === emp.id && styles.employeeSelectTextActive,
                  ]}
                >
                  {emp.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {swapTargetEmployeeId ? (
            <>
              <Text style={styles.inputLabel}>{t('screens.schedule.colleagueShift')}</Text>
              {targetEmployeeShifts.length === 0 ? (
                <Text style={styles.noShiftsHint}>
                  {t('screens.schedule.colleagueNoShifts')}
                </Text>
              ) : (
                <ScrollView style={styles.employeeSelectList}>
                  {targetEmployeeShifts.map((shift) => (
                    <TouchableOpacity
                      key={shift.id}
                      style={[
                        styles.employeeSelectItem,
                        swapTargetShiftId === shift.id && styles.employeeSelectItemActive,
                      ]}
                      onPress={() => onSelectShift(shift.id)}
                    >
                      <Text
                        style={[
                          styles.employeeSelectText,
                          swapTargetShiftId === shift.id && styles.employeeSelectTextActive,
                        ]}
                      >
                        {formatDate(shift.date, 'dayMonth')}, {shift.startTime} — {shift.endTime}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </>
          ) : null}

          <Text style={styles.inputLabel}>{t('common.form.commentOptional')}</Text>
          <TextInput
            style={styles.reasonInput}
            value={swapReason}
            onChangeText={onReasonChange}
            placeholder={t('screens.schedule.swapReasonPlaceholder')}
            placeholderTextColor={colors.grayLighter}
            multiline
          />

          <TouchableOpacity style={styles.submitButton} onPress={onSubmit}>
            <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.submitGradient}>
              <Text style={styles.submitButtonText}>{t('common.actions.send')}</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>{t('common.actions.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
