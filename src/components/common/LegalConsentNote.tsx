import React from 'react';
import { StyleProp, Text, TextStyle, ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { openLegalDocument } from '../../constants/legal';

interface LegalConsentNoteProps {
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
}

export default function LegalConsentNote({ style, containerStyle }: LegalConsentNoteProps) {
  const { t } = useTranslation();

  const linkStyle: TextStyle = {
    textDecorationLine: 'underline',
  };

  return (
    <Text style={[style, containerStyle]}>
      {t('legal.consentNote.prefix')}{' '}
      <Text style={linkStyle} onPress={() => openLegalDocument('privacy')}>
        {t('legal.links.privacy')}
      </Text>
      {t('legal.consentNote.separator')}
      <Text style={linkStyle} onPress={() => openLegalDocument('terms')}>
        {t('legal.links.terms')}
      </Text>
      {t('legal.consentNote.lastSeparator')}
      <Text style={linkStyle} onPress={() => openLegalDocument('consent')}>
        {t('legal.links.consent')}
      </Text>
    </Text>
  );
}
