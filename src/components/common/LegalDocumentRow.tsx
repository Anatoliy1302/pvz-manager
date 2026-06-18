import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { ChevronRight, FileText } from 'lucide-react-native';
import { colors } from '../../constants/colors';
import { LegalDocument, openLegalDocument } from '../../constants/legal';

interface LegalDocumentRowProps {
  document: LegalDocument;
  title: string;
  hint: string;
}

export default function LegalDocumentRow({ document, title, hint }: LegalDocumentRowProps) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => openLegalDocument(document)}
      activeOpacity={0.8}
    >
      <View style={styles.left}>
        <FileText size={20} color={colors.primary} />
        <View style={styles.textBlock}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.hint}>{hint}</Text>
        </View>
      </View>
      <ChevronRight size={18} color={colors.grayLight} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  textBlock: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  hint: { fontSize: 12, color: '#999', marginTop: 2 },
});
