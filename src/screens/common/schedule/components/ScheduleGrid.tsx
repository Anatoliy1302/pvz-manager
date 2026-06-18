import React, { useCallback } from 'react';
import { FlatList, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { toDateKey } from '../../../../utils/dateHelpers';
import { FLAT_LIST_PERF } from '../../../../constants/flatListPerf';
import { ShiftAssignment } from '../../scheduleTypes';
import { ShiftTypeConfig } from '../../scheduleTypes';
import { getWeekdays, formatScheduleDate } from '../scheduleHelpers';
import { scheduleStyles } from '../scheduleStyles';
import ScheduleShiftCell from './ScheduleShiftCell';

interface ScheduleEmployee {
  id: string;
  name: string;
  role: string;
}

interface ScheduleGridProps {
  dates: Date[];
  employees: ScheduleEmployee[];
  canEdit: boolean;
  textColor: string;
  textSecondary: string;
  borderColor: string;
  emptyCellBackground: string;
  shiftTypes: ShiftTypeConfig[];
  getAssignment: (employeeId: string, dateStr: string) => ShiftAssignment | undefined;
  onCellPress: (
    dateStr: string,
    employeeId: string,
    employeeName: string,
    assignment?: ShiftAssignment
  ) => void;
}

export default function ScheduleGrid({
  dates,
  employees,
  canEdit,
  textColor,
  textSecondary,
  borderColor,
  emptyCellBackground,
  shiftTypes,
  getAssignment,
  onCellPress,
}: ScheduleGridProps) {
  const { t } = useTranslation();
  const weekdays = getWeekdays();

  const renderEmployeeRow = useCallback(
    ({ item: employee }: { item: ScheduleEmployee }) => (
      <View style={scheduleStyles.gridRow}>
        <View style={[scheduleStyles.gridCell, scheduleStyles.employeeCell]}>
          <Text style={[scheduleStyles.employeeName, { color: textColor }]}>{employee.name}</Text>
          <Text style={[scheduleStyles.employeeRole, { color: textSecondary }]}>
            {employee.role === 'admin'
              ? t('screens.employees.adminShort')
              : t('screens.schedule.employee')}
          </Text>
        </View>
        {dates.map((date, idx) => {
          const dateStr = toDateKey(date);
          const assignment = getAssignment(employee.id, dateStr);

          return (
            <ScheduleShiftCell
              key={idx}
              assignment={assignment}
              canEdit={canEdit}
              emptyCellBackground={emptyCellBackground}
              shiftTypes={shiftTypes}
              onPress={() => onCellPress(dateStr, employee.id, employee.name, assignment)}
            />
          );
        })}
      </View>
    ),
    [
      dates,
      canEdit,
      textColor,
      textSecondary,
      emptyCellBackground,
      shiftTypes,
      getAssignment,
      onCellPress,
      t,
    ]
  );

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={scheduleStyles.gridContainer}>
        <View style={[scheduleStyles.gridHeader, { borderBottomColor: borderColor }]}>
          <View style={[scheduleStyles.gridCell, scheduleStyles.employeeHeaderCell]}>
            <Text style={[scheduleStyles.employeeHeaderText, { color: textSecondary }]}>
              {t('screens.schedule.employee')}
            </Text>
          </View>
          {dates.map((date, idx) => (
            <View key={idx} style={[scheduleStyles.gridCell, scheduleStyles.dateHeaderCell]}>
              <Text style={[scheduleStyles.weekdayText, { color: textSecondary }]}>
                {weekdays[date.getDay() === 0 ? 6 : date.getDay() - 1]}
              </Text>
              <Text style={[scheduleStyles.dateText, { color: textSecondary }]}>
                {formatScheduleDate(date)}
              </Text>
            </View>
          ))}
        </View>

        <FlatList
          data={employees}
          keyExtractor={(item) => item.id}
          renderItem={renderEmployeeRow}
          scrollEnabled
          nestedScrollEnabled
          {...FLAT_LIST_PERF}
        />
      </View>
    </ScrollView>
  );
}
