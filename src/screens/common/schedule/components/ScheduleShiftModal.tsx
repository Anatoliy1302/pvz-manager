import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Check, Trash2, Users, X } from 'lucide-react-native';
import { calculateTotalHours } from '../../../../utils/advancedPayrollCalculator';
import { colors } from '../../../../constants/colors';
import MoneyIcon from '../../../../components/icons/MoneyIcon';
import { ShiftType, ShiftTypeConfig } from '../../scheduleTypes';
import { validateTime } from '../scheduleHelpers';
import { scheduleStyles } from '../scheduleStyles';
import ScheduleHourlyTimeField from './ScheduleHourlyTimeField';
import ScheduleHourlyTimePicker from './ScheduleHourlyTimePicker';

interface ScheduleShiftModalProps {
  visible: boolean;
  selectedCell: { date: string; employeeId: string; employeeName: string } | null;
  selectedShiftType: ShiftType;
  shiftTypes: ShiftTypeConfig[];
  customStart: string;
  customEnd: string;
  startError: string;
  endError: string;
  calculatedEarnings: number;
  hasExistingAssignment: boolean;
  hourlyPickerField: 'start' | 'end' | null;
  pickerDraftTime: string;
  theme: 'light' | 'dark';
  textColor: string;
  textSecondary: string;
  modalStyle: object;
  titleStyle: object;
  onClose: () => void;
  onSelectShiftType: (type: ShiftType) => void;
  onOpenHourlyPicker: (field: 'start' | 'end') => void;
  onHourlyPickerDismiss: () => void;
  onHourlyPickerDraftChange: (time: string) => void;
  onHourlyPickerConfirm: () => void;
  onAndroidHourlySelect: (field: 'start' | 'end', time: string) => void;
  onSave: () => void;
  onDelete: () => void;
}

export default function ScheduleShiftModal({
  visible,
  selectedCell,
  selectedShiftType,
  shiftTypes,
  customStart,
  customEnd,
  startError,
  endError,
  calculatedEarnings,
  hasExistingAssignment,
  hourlyPickerField,
  pickerDraftTime,
  theme,
  textColor,
  textSecondary,
  modalStyle,
  titleStyle,
  onClose,
  onSelectShiftType,
  onOpenHourlyPicker,
  onHourlyPickerDismiss,
  onHourlyPickerDraftChange,
  onHourlyPickerConfirm,
  onAndroidHourlySelect,
  onSave,
  onDelete,
}: ScheduleShiftModalProps) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={scheduleStyles.modalOverlay}>
        <TouchableOpacity
          style={scheduleStyles.modalBackdrop}
          activeOpacity={1}
          onPress={() => {
            onHourlyPickerDismiss();
            onClose();
          }}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={scheduleStyles.keyboardAvoidingView}
          pointerEvents="box-none"
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={[scheduleStyles.modalContent, modalStyle]}>
              <Text style={[scheduleStyles.modalTitle, titleStyle]}>{t('screens.schedule.assignShift')}</Text>

              <ScrollView
                style={scheduleStyles.modalScrollView}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={scheduleStyles.modalScrollContent}
                bounces={false}
              >
                {selectedCell && (
                  <View style={scheduleStyles.selectedEmployeeCard}>
                    <Users size={16} color={colors.primary} />
                    <Text style={scheduleStyles.selectedEmployeeText}>
                      {t('screens.schedule.employeeLabel')}{' '}
                      <Text style={scheduleStyles.selectedEmployeeName}>
                        {selectedCell.employeeName}
                      </Text>
                    </Text>
                  </View>
                )}

                <Text style={scheduleStyles.modalSubtitle}>
                  {selectedCell &&
                    new Date(selectedCell.date).toLocaleDateString('ru-RU', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                </Text>

                <View style={scheduleStyles.shiftTypesGrid}>
                  {shiftTypes.map((type) => (
                    <TouchableOpacity
                      key={type.id}
                      style={[
                        scheduleStyles.shiftTypeCard,
                        selectedShiftType === type.id && scheduleStyles.shiftTypeCardActive,
                        { borderColor: type.color },
                      ]}
                      onPress={() => onSelectShiftType(type.id)}
                    >
                      <View style={[scheduleStyles.shiftTypeColor, { backgroundColor: type.color }]} />
                      <Text style={[scheduleStyles.shiftTypeName, { color: textColor }]}>{type.name}</Text>
                      <Text style={[scheduleStyles.shiftTypeTime, { color: textSecondary }]}>
                        {type.id === 'hourly'
                          ? selectedShiftType === 'hourly' &&
                            validateTime(customStart) &&
                            validateTime(customEnd)
                            ? `${customStart} – ${customEnd}`
                            : t('common.shiftTypes.customTime')
                          : `${type.startTime} – ${type.endTime}`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {selectedShiftType === 'hourly' && (
                  <View style={scheduleStyles.customTimeContainer}>
                    <Text style={[scheduleStyles.customTimeLabel, { color: textColor }]}>
                      {t('screens.schedule.shiftTime')}
                    </Text>
                    <View style={scheduleStyles.hourlyTimeRow}>
                      <ScheduleHourlyTimeField
                        label={t('screens.schedule.start')}
                        value={customStart}
                        error={startError}
                        placeholder="09:00"
                        textColor={textColor}
                        onPress={() => onOpenHourlyPicker('start')}
                      />
                      <Text style={scheduleStyles.hourlyTimeDivider}>—</Text>
                      <ScheduleHourlyTimeField
                        label={t('screens.schedule.end')}
                        value={customEnd}
                        error={endError}
                        placeholder="13:00"
                        textColor={textColor}
                        onPress={() => onOpenHourlyPicker('end')}
                      />
                    </View>
                    {startError ? <Text style={scheduleStyles.errorText}>{startError}</Text> : null}
                    {endError ? <Text style={scheduleStyles.errorText}>{endError}</Text> : null}
                    {validateTime(customStart) && validateTime(customEnd) && (
                      <Text style={scheduleStyles.hourlyDuration}>
                        {t('screens.schedule.duration', { hours: calculateTotalHours(customStart, customEnd) })}
                      </Text>
                    )}
                  </View>
                )}

                <View style={scheduleStyles.earningsPreview}>
                  <MoneyIcon size={20} color={colors.success} />
                  <Text style={[scheduleStyles.earningsPreviewText, { color: textColor }]}>
                    {t('screens.schedule.shiftAmount')}{' '}
                    <Text style={scheduleStyles.earningsPreviewValue}>{calculatedEarnings} ₽</Text>
                  </Text>
                </View>
              </ScrollView>

              <View style={scheduleStyles.modalFooter}>
                <View style={scheduleStyles.modalButtons}>
                  <TouchableOpacity style={scheduleStyles.cancelButton} onPress={onClose}>
                    <X size={20} color={colors.gray} />
                    <Text style={scheduleStyles.cancelButtonText}>{t('common.actions.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={scheduleStyles.saveButton} onPress={onSave}>
                    <Check size={20} color="#FFFFFF" />
                    <Text style={scheduleStyles.saveButtonText}>{t('common.actions.save')}</Text>
                  </TouchableOpacity>
                </View>

                {hasExistingAssignment && (
                  <TouchableOpacity style={scheduleStyles.deleteButton} onPress={onDelete}>
                    <Trash2 size={20} color={colors.danger} />
                    <Text style={scheduleStyles.deleteButtonText}>{t('screens.schedule.deleteShift')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>

        <ScheduleHourlyTimePicker
          field={hourlyPickerField}
          pickerDraftTime={pickerDraftTime}
          theme={theme}
          textColor={textColor}
          modalStyle={modalStyle}
          titleStyle={titleStyle}
          onDismiss={onHourlyPickerDismiss}
          onDraftChange={onHourlyPickerDraftChange}
          onConfirm={onHourlyPickerConfirm}
          onAndroidSelect={onAndroidHourlySelect}
        />
      </View>
    </Modal>
  );
}
