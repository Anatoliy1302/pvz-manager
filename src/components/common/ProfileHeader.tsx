// src/components/common/ProfileHeader.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { Crown, Shield, User as UserIcon, Phone, Camera } from 'lucide-react-native';
import AnimatedBanner from './AnimatedBanner';

interface ProfileHeaderProps {
  name: string;
  phone: string;
  role: 'owner' | 'admin' | 'employee';
  avatarIcon?: 'crown' | 'shield' | 'user';
  avatarUri?: string;
  height?: number;
  delay?: number;
  onEditPress?: () => void;
}

export default function ProfileHeader({
  name,
  phone,
  role,
  avatarIcon,
  avatarUri,
  height = 180,
  delay = 0,
  onEditPress,
}: ProfileHeaderProps) {
  const { t } = useTranslation();

  const getIcon = () => {
    if (avatarIcon === 'crown') return <Crown size={40} color="#FFFFFF" />;
    if (avatarIcon === 'shield') return <Shield size={40} color="#FFFFFF" />;
    return <UserIcon size={40} color="#FFFFFF" />;
  };

  const getRoleText = () => {
    if (role === 'owner') return t('common.roles.owner');
    if (role === 'admin') return t('common.roles.adminPvz');
    return t('common.roles.employeePvz');
  };

  return (
    <AnimatedBanner delay={delay} height={height}>
      <View style={styles.bannerContent}>
        <TouchableOpacity
          style={styles.avatarContainer}
          onPress={onEditPress}
          disabled={!onEditPress}
          activeOpacity={onEditPress ? 0.8 : 1}
        >
          <View style={styles.avatarCircle}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              getIcon()
            )}
            {onEditPress && (
              <View style={styles.editBadge}>
                <Camera size={12} color="#FFFFFF" />
              </View>
            )}
          </View>
        </TouchableOpacity>
        <Text style={styles.userName}>{name}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{getRoleText()}</Text>
        </View>
        <View style={styles.userInfoRow}>
          <Phone size={14} color="rgba(255,255,255,0.8)" />
          <Text style={styles.userInfoText}>{phone}</Text>
        </View>
      </View>
    </AnimatedBanner>
  );
}

const styles = StyleSheet.create({
  bannerContent: { alignItems: 'center' },
  avatarContainer: { marginBottom: 12 },
  avatarCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
    position: 'relative',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  avatarImage: { width: 70, height: 70, borderRadius: 35 },
  userName: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  roleBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    marginBottom: 8,
  },
  roleText: { fontSize: 11, fontWeight: '500', color: '#FFFFFF' },
  userInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  userInfoText: { fontSize: 12, color: 'rgba(255,255,255,0.85)' },
});
