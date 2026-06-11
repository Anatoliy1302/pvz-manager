// src/components/common/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../constants/colors';
import { AlertCircle, RefreshCw } from 'lucide-react-native';
import ThemedSafeAreaView from './ThemedSafeAreaView';
import ScreenHeader from './ScreenHeader';
import { t } from '../../i18n';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
  navigation?: any;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary поймал ошибку:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleGoBack = (): void => {
    if (this.props.navigation) {
      this.props.navigation.goBack();
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ThemedSafeAreaView style={styles.container}>
          <ScreenHeader
            title={t('common.error.boundaryHeader')}
            onBack={this.props.navigation ? this.handleGoBack : undefined}
          />

          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.errorIcon}>
              <AlertCircle size={64} color={colors.danger} />
            </View>

            <Text style={styles.errorTitle}>{t('common.error.boundaryTitle')}</Text>
            <Text style={styles.errorMessage}>
              {this.state.error?.message || t('common.error.generic')}
            </Text>

            {__DEV__ && this.state.errorInfo && (
              <View style={styles.debugContainer}>
                <Text style={styles.debugTitle}>{t('common.error.debugTitle')}</Text>
                <Text style={styles.debugText}>
                  {this.state.error?.stack?.slice(0, 500)}
                </Text>
              </View>
            )}

            <TouchableOpacity style={styles.resetButton} onPress={this.handleReset}>
              <LinearGradient
                colors={[colors.primary, colors.primaryDark]}
                style={styles.resetGradient}
              >
                <RefreshCw size={18} color="#FFFFFF" />
                <Text style={styles.resetButtonText}>{t('common.actions.retry')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </ThemedSafeAreaView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' },
  content: { padding: 20, alignItems: 'center' },
  errorIcon: { marginTop: 40, marginBottom: 20 },
  errorTitle: { fontSize: 20, fontWeight: 'bold', color: '#1A1A1A', marginBottom: 8 },
  errorMessage: { fontSize: 14, color: '#666666', textAlign: 'center', marginBottom: 24 },
  debugContainer: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 12,
    marginBottom: 24,
    width: '100%',
  },
  debugTitle: { fontSize: 12, fontWeight: '600', color: '#666', marginBottom: 8 },
  debugText: { fontSize: 10, color: '#999', fontFamily: 'monospace' },
  resetButton: { borderRadius: 30, overflow: 'hidden', width: '100%' },
  resetGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  resetButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});