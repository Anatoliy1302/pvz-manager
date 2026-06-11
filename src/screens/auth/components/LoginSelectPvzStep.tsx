import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { UserRole } from '../../../types/user';
import { LoginInvitationItem, LoginPvzItem } from '../loginTypes';
import LoginContinueButton from './LoginContinueButton';
import LoginPvzListItem from './LoginPvzListItem';
import LoginStepHeader from './LoginStepHeader';
import { useLoginStyles } from '../useLoginStyles';

interface LoginSelectPvzStepProps {
  selectedRole: UserRole | null;
  selectedPvzId: string;
  pvzList: LoginPvzItem[];
  invitations: LoginInvitationItem[];
  titleStyle?: object;
  subtitleStyle?: object;
  onSelectPvz: (pvzId: string, invitationId?: string) => void;
  onContinue: () => void;
  onCreateNew?: () => void;
}

export default function LoginSelectPvzStep({
  selectedRole,
  selectedPvzId,
  pvzList,
  invitations,
  titleStyle,
  subtitleStyle,
  onSelectPvz,
  onContinue,
  onCreateNew,
}: LoginSelectPvzStepProps) {
  const { t } = useTranslation();
  const { styles: loginStyles } = useLoginStyles();

  return (
    <View style={loginStyles.stepContainer}>
      <LoginStepHeader
        title={t('auth.pvzSelect.title')}
        subtitle={
          selectedRole === 'owner'
            ? t('auth.pvzSelect.subtitleOwner')
            : t('auth.pvzSelect.subtitleInvite')
        }
        titleStyle={titleStyle}
        subtitleStyle={subtitleStyle}
      />

      <ScrollView style={loginStyles.pvzList}>
        {selectedRole === 'owner'
          ? pvzList.map((pvz) => (
              <LoginPvzListItem
                key={pvz.id}
                name={pvz.name}
                subtitle={pvz.address}
                isActive={selectedPvzId === pvz.id}
                onPress={() => onSelectPvz(pvz.id)}
              />
            ))
          : invitations.map((invite) => (
              <LoginPvzListItem
                key={invite.id}
                name={invite.pvzName}
                subtitle={
                  invite.invitedByName
                    ? t('auth.pvzSelect.inviteFrom', { name: invite.invitedByName })
                    : t('auth.pvzSelect.inviteFromOwner')
                }
                isActive={selectedPvzId === invite.pvzId}
                onPress={() => onSelectPvz(invite.pvzId, invite.id)}
              />
            ))}
      </ScrollView>

      <LoginContinueButton
        label={t('common.actions.continue')}
        enabled={!!selectedPvzId}
        onPress={onContinue}
      />

      {selectedRole === 'owner' && onCreateNew && (
        <TouchableOpacity onPress={onCreateNew} style={loginStyles.createNewButton}>
          <Text style={loginStyles.createNewText}>{t('auth.pvzSelect.createNew')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
