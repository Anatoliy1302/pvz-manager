import React from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';
import { formatTimeFromDate, parseTimeToDate } from '../scheduleHelpers';
import { scheduleStyles } from '../scheduleStyles';

interface ScheduleHourlyTimePickerProps {
  field: 'start' | 'end' | null;
  pickerDraftTime: string;
  theme: 'light' | 'dark';
  textColor: string;
  modalStyle: object;
  titleStyle: object;
  onDismiss: () => void;
  onDraftChange: (time: string) => void;
  onConfirm: () => void;
  onAndroidSelect: (field: 'start' | 'end', time: string) => void;
}

export default function ScheduleHourlyTimePicker({
  field,
  pickerDraftTime,
  theme,
  textColor,
  modalStyle,
  titleStyle,
  onDismiss,
  onDraftChange,
  onConfirm,
  onAndroidSelect,
}: ScheduleHourlyTimePickerProps) {
  const { t } = useTranslation();

  if (field === null) return null;

  if (Platform.OS === 'android') {
    return (
      <DateTimePicker
        key={`hourly-time-${field}`}
        value={parseTimeToDate(pickerDraftTime)}
        mode="time"
        display="default"
        onChange={(event, date) => {
          const currentField = field;
          onDismiss();
          if (event.type === 'dismissed' || !date) return;
          onAndroidSelect(currentField, formatTimeFromDate(date));
        }}
      />
    );
  }

  return (
    <View style={scheduleStyles.fullScreenPickerOverlay}>
      <TouchableOpacity style={scheduleStyles.inlinePickerBackdrop} activeOpacity={1} onPress={onDismiss} />
      <View style={[scheduleStyles.pickerSheet, modalStyle]}>
        <Text style={[scheduleStyles.pickerTitle, titleStyle]}>
          {field === 'start' ? t('screens.schedule.startShift') : t('screens.schedule.endShift')}
        </Text>
        <View style={scheduleStyles.pickerSpinnerContainer}>
          <DateTimePicker
            key={`hourly-time-${field}`}
            value={parseTimeToDate(pickerDraftTime)}
            mode="time"
            display="spinner"
            themeVariant={theme}
            textColor={textColor}
            locale="ru-RU"
            style={scheduleStyles.pickerSpinner}
            onChange={(_, date) => {
              if (date) {
                onDraftChange(formatTimeFromDate(date));
              }
            }}
          />
        </View>
        <View style={scheduleStyles.pickerActions}>
          <TouchableOpacity style={scheduleStyles.pickerCancelButton} onPress={onDismiss}>
            <Text style={scheduleStyles.pickerCancelText}>{t('common.actions.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={scheduleStyles.pickerDoneButton} onPress={onConfirm}>
            <Text style={scheduleStyles.pickerDoneText}>{t('common.actions.done')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
