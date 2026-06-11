import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TouchableOpacity, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { colors } from '../../../../constants/colors';
import { ShiftAssignment } from '../../scheduleTypes';
import {
  getHourlyTimeRange,
  getPaymentStatus,
  getShiftColor,
  getShiftInfo,
} from '../scheduleHelpers';
import { ShiftTypeConfig } from '../../scheduleTypes';
import { scheduleStyles } from '../scheduleStyles';

interface ScheduleShiftCellProps {
  assignment?: ShiftAssignment;
  canEdit: boolean;
  emptyCellBackground: string;
  shiftTypes: ShiftTypeConfig[];
  onPress: () => void;
}

export default function ScheduleShiftCell({
  assignment,
  canEdit,
  emptyCellBackground,
  shiftTypes,
  onPress,
}: ScheduleShiftCellProps) {
  const { t } = useTranslation();
  const paymentStatus = assignment ? getPaymentStatus(assignment) : null;

  return (
    <TouchableOpacity
      style={[
        scheduleStyles.gridCell,
        scheduleStyles.shiftCell,
        {
          backgroundColor: assignment
            ? getShiftColor(assignment, shiftTypes) + '20'
            : emptyCellBackground,
        },
      ]}
      onPress={onPress}
    >
      {assignment && (
        <View style={scheduleStyles.shiftContent}>
          <View
            style={[
              scheduleStyles.shiftBadge,
              { backgroundColor: getShiftColor(assignment, shiftTypes) },
            ]}
          >
            {assignment.shiftType === 'hourly' ? (
              <>
                <Text style={scheduleStyles.shiftBadgeText}>{t('common.shiftTypes.hourly')}</Text>
                <Text style={scheduleStyles.shiftTimeText}>{getHourlyTimeRange(assignment)}</Text>
              </>
            ) : (
              <Text style={scheduleStyles.shiftBadgeText}>
                {getShiftInfo(assignment, shiftTypes)}
              </Text>
            )}
          </View>
          {paymentStatus && (
            <View
              style={[
                scheduleStyles.paymentStatusBadge,
                { backgroundColor: paymentStatus.bg, marginTop: 4 },
              ]}
            >
              <Text style={[scheduleStyles.paymentStatusText, { color: paymentStatus.color }]}>
                {paymentStatus.text}
              </Text>
            </View>
          )}
          {(assignment.earnings ?? 0) > 0 && (
            <Text style={scheduleStyles.shiftEarnings}>{assignment.earnings} ₽</Text>
          )}
        </View>
      )}
      {!assignment && canEdit && (
        <View style={scheduleStyles.addShiftPlaceholder}>
          <Plus size={16} color={colors.grayLight} />
        </View>
      )}
    </TouchableOpacity>
  );
}
