import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { scheduleStyles } from '../scheduleStyles';

interface ScheduleHourlyTimeFieldProps {
  label: string;
  value: string;
  error: string;
  placeholder: string;
  textColor: string;
  onPress: () => void;
}

export default function ScheduleHourlyTimeField({
  label,
  value,
  error,
  placeholder,
  textColor,
  onPress,
}: ScheduleHourlyTimeFieldProps) {
  return (
    <View style={[scheduleStyles.hourlyTimeField, error ? scheduleStyles.hourlyTimeFieldError : null]}>
      <Text style={scheduleStyles.hourlyTimeCaption}>{label}</Text>
      <TouchableOpacity style={scheduleStyles.hourlyTimePickerRow} onPress={onPress} activeOpacity={0.85}>
        <Text style={[scheduleStyles.hourlyTimeDisplay, { color: textColor }]}>
          {value || placeholder}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
