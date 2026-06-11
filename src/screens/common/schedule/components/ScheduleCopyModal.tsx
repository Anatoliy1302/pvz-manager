import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  Keyboard,
} from 'react-native';
import { Copy } from 'lucide-react-native';
import { colors } from '../../../../constants/colors';
import { scheduleStyles } from '../scheduleStyles';

interface ScheduleCopyModalProps {
  visible: boolean;
  copyFromDate: string;
  copyToDate: string;
  modalStyle: object;
  titleStyle: object;
  inputStyle: object;
  sectionTitleStyle: object;
  onChangeFromDate: (value: string) => void;
  onChangeToDate: (value: string) => void;
  onClose: () => void;
  onCopy: () => void;
}

export default function ScheduleCopyModal({
  visible,
  copyFromDate,
  copyToDate,
  modalStyle,
  titleStyle,
  inputStyle,
  sectionTitleStyle,
  onChangeFromDate,
  onChangeToDate,
  onClose,
  onCopy,
}: ScheduleCopyModalProps) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={scheduleStyles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={scheduleStyles.keyboardAvoidingView}
          >
            <View style={[scheduleStyles.modalContent, modalStyle]}>
              <Text style={[scheduleStyles.modalTitle, titleStyle]}>{t('screens.schedule.copySchedule')}</Text>
              <Text style={[scheduleStyles.inputLabel, sectionTitleStyle]}>
                {t('screens.schedule.copyFromDate')}
              </Text>
              <TextInput
                style={[scheduleStyles.modalInput, inputStyle]}
                placeholder="2024-01-15"
                value={copyFromDate}
                onChangeText={onChangeFromDate}
                placeholderTextColor={colors.grayLight}
                keyboardType="numeric"
              />
              <Text style={[scheduleStyles.inputLabel, sectionTitleStyle]}>
                {t('screens.schedule.copyToDate')}
              </Text>
              <TextInput
                style={[scheduleStyles.modalInput, inputStyle]}
                placeholder="2024-01-16"
                value={copyToDate}
                onChangeText={onChangeToDate}
                placeholderTextColor={colors.grayLight}
                keyboardType="numeric"
              />
              <View style={scheduleStyles.modalButtons}>
                <TouchableOpacity style={scheduleStyles.cancelButton} onPress={onClose}>
                  <Text style={scheduleStyles.cancelButtonText}>{t('common.actions.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={scheduleStyles.saveButton} onPress={onCopy}>
                  <Copy size={20} color="#FFFFFF" />
                  <Text style={scheduleStyles.saveButtonText}>{t('screens.schedule.copy')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
