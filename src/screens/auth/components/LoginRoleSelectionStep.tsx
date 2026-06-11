import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { UserRole } from '../../../types/user';
import { ROLE_OPTIONS } from '../loginConstants';
import LoginBannerHeader from './LoginBannerHeader';
import LoginContinueButton from './LoginContinueButton';
import LoginRoleCard from './LoginRoleCard';
import { useLoginStyles } from '../useLoginStyles';

interface LoginRoleSelectionStepProps {
  selectedRole: UserRole | null;
  titleStyle?: object;
  subtitleStyle?: object;
  cardBackground: string;
  cardBorder: string;
  onSelectRole: (role: UserRole) => void;
  onContinue: () => void;
}

export default function LoginRoleSelectionStep({
  selectedRole,
  titleStyle,
  subtitleStyle,
  cardBackground,
  cardBorder,
  onSelectRole,
  onContinue,
}: LoginRoleSelectionStepProps) {
  const { t } = useTranslation();
  const { styles: loginStyles } = useLoginStyles();

  return (
    <View style={loginStyles.roleStepContainer}>
      <LoginBannerHeader />

      <Text style={[loginStyles.roleSectionTitle, titleStyle]}>{t('auth.role.sectionTitle')}</Text>
      <Text style={[loginStyles.roleSectionSubtitle, subtitleStyle]}>
        {t('auth.role.sectionSubtitle')}
      </Text>

      <View style={loginStyles.roleCardsList}>
        {ROLE_OPTIONS.map((option) => (
          <LoginRoleCard
            key={option.id}
            option={option}
            isActive={selectedRole === option.id}
            cardBackground={cardBackground}
            cardBorder={cardBorder}
            onSelect={() => onSelectRole(option.id)}
          />
        ))}
      </View>

      <LoginContinueButton
        label={t('common.actions.continue')}
        enabled={!!selectedRole}
        onPress={onContinue}
      />
    </View>
  );
}
