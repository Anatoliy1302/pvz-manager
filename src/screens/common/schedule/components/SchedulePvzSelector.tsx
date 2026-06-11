import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TouchableOpacity, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { colors } from '../../../../constants/colors';
import { scheduleStyles } from '../scheduleStyles';

interface PvzOption {
  id: string;
  name: string;
}

interface SchedulePvzSelectorProps {
  currentPvzName?: string;
  userPvzs: PvzOption[];
  selectedPvzId?: string;
  showDropdown: boolean;
  cardStyle: object;
  textSecondary: string;
  borderColor: string;
  onToggle: () => void;
  onSelectPvz: (pvzId: string) => void;
}

export default function SchedulePvzSelector({
  currentPvzName,
  userPvzs,
  selectedPvzId,
  showDropdown,
  cardStyle,
  textSecondary,
  borderColor,
  onToggle,
  onSelectPvz,
}: SchedulePvzSelectorProps) {
  const { t } = useTranslation();

  return (
    <>
      <TouchableOpacity
        style={[scheduleStyles.pvzSelector, cardStyle]}
        onPress={onToggle}
        activeOpacity={0.8}
      >
        <Text style={[scheduleStyles.pvzSelectorLabel, { color: textSecondary }]}>{t('common.pvz.label')}</Text>
        <View style={scheduleStyles.pvzSelectorValue}>
          <Text style={scheduleStyles.pvzSelectorText}>{currentPvzName || t('common.pvz.select')}</Text>
          <ChevronRight size={16} color={colors.gray} />
        </View>
      </TouchableOpacity>

      {showDropdown && (
        <View style={[scheduleStyles.pvzDropdown, cardStyle]}>
          {userPvzs.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[
                scheduleStyles.pvzDropdownItem,
                { borderBottomColor: borderColor },
                selectedPvzId === p.id && scheduleStyles.pvzDropdownItemActive,
              ]}
              onPress={() => onSelectPvz(p.id)}
            >
              <Text
                style={[
                  scheduleStyles.pvzDropdownText,
                  { color: textSecondary },
                  selectedPvzId === p.id && scheduleStyles.pvzDropdownTextActive,
                ]}
              >
                {p.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </>
  );
}
