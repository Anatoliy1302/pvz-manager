import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { useThemedScreen } from '../../hooks/useThemedScreen';

export interface DashboardActionTile {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  gradient: [string, string];
  badge?: number;
  onPress: () => void;
}

interface DashboardActionTilesProps {
  actions: DashboardActionTile[];
}

export default function DashboardActionTiles({ actions }: DashboardActionTilesProps) {
  const { colors } = useTheme();
  const { screen } = useThemedScreen();

  if (actions.length === 0) return null;

  return (
    <View style={styles.actionsGrid}>
      {actions.map((action, index) => (
        <TouchableOpacity
          key={`${action.label}-${index}`}
          style={[styles.actionTile, { borderColor: colors.primary }]}
          onPress={action.onPress}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={action.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.actionGradient}
          >
            <View style={styles.actionIconContainer}>
              <action.icon size={28} color="#FFFFFF" />
              {(action.badge ?? 0) > 0 && (
                <View style={[styles.actionBadge, { backgroundColor: screen.card }]}>
                  <Text style={styles.actionBadgeText}>
                    {(action.badge ?? 0) > 99 ? '99+' : action.badge}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.actionLabel}>{action.label}</Text>
          </LinearGradient>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 16,
    marginTop: 20,
    gap: 12,
  },
  actionTile: {
    width: '47%',
    height: 120,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  actionGradient: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  actionBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    borderRadius: 10,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBadgeText: {
    fontSize: 11,
    color: '#FF9800',
    fontWeight: 'bold',
  },
});
