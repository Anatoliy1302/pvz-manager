// src/screens/profile/EditProfileScreen.tsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import { ChevronLeft, User, Phone, Save, Camera } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { LAST_LOGIN_PROFILE_KEY, type LastLoginProfile } from '../../context/AuthContext';
import { formatPhoneInput, cleanPhone } from '../../utils/phoneHelpers';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useScreenToast } from '../../hooks/useScreenToast';
import { safeParseJson } from '../../utils/safeJson';
import type { User as StoredUser } from '../../types/user';

export default function EditProfileScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { user, refreshUserData } = useAuth();
  const { colors, screen } = useThemedScreen();
  const { showError, showSuccess } = useScreenToast();
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone ? formatPhoneInput(user.phone) : '');
  const [avatarUri, setAvatarUri] = useState(user?.avatarUri || '');
  const [loading, setLoading] = useState(false);
  const [pickingPhoto, setPickingPhoto] = useState(false);

  const handlePhoneChange = (text: string) => {
    setPhone(formatPhoneInput(text));
  };

  const handleChangePhoto = () => {
    Alert.alert(t('screens.editProfile.photoTitle'), t('screens.editProfile.photoSource'), [
      { text: t('common.actions.cancel'), style: 'cancel' },
      { text: t('screens.editProfile.gallery'), onPress: () => pickImage('library') },
      { text: t('screens.editProfile.camera'), onPress: () => pickImage('camera') },
      ...(avatarUri
        ? [
            {
              text: t('screens.editProfile.removePhoto'),
              style: 'destructive' as const,
              onPress: () => setAvatarUri(''),
            },
          ]
        : []),
    ]);
  };

  const pickImage = async (source: 'library' | 'camera') => {
    setPickingPhoto(true);
    try {
      if (source === 'library') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          showError(t('alerts.permission.noPhotoAccess'));
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
        if (!result.canceled && result.assets[0]?.uri) {
          setAvatarUri(result.assets[0].uri);
        }
      } else {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          showError(t('alerts.permission.noCameraAccess'));
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
        if (!result.canceled && result.assets[0]?.uri) {
          setAvatarUri(result.assets[0].uri);
        }
      }
    } catch (error) {
      console.error('Ошибка выбора фото:', error);
      showError(t('alerts.network.photoFailed'));
    } finally {
      setPickingPhoto(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      showError(t('alerts.validation.enterName'));
      return;
    }

    setLoading(true);
    try {
      const usersRaw = await SecureStore.getItemAsync('pvz_users');
      const users = safeParseJson<StoredUser[]>(usersRaw ?? '[]', []);

      const userIndex = users.findIndex((u: { id: string }) => u.id === user?.id);
      if (userIndex !== -1) {
        const cleanedPhone = cleanPhone(phone);

        users[userIndex].name = name.trim();
        users[userIndex].phone = cleanedPhone;
        users[userIndex].avatarUri = avatarUri || undefined;
        await SecureStore.setItemAsync('pvz_users', JSON.stringify(users));

        const updatedUser = {
          ...user,
          name: name.trim(),
          phone: cleanedPhone,
          avatarUri: avatarUri || undefined,
        };
        await SecureStore.setItemAsync('user', JSON.stringify(updatedUser));

        const lastLoginRaw = await SecureStore.getItemAsync(LAST_LOGIN_PROFILE_KEY);
        if (lastLoginRaw) {
          const lastLogin = safeParseJson<LastLoginProfile>(lastLoginRaw, { phone: '', name: '', role: 'employee' });
          if (lastLogin.phone === cleanedPhone) {
            await SecureStore.setItemAsync(
              LAST_LOGIN_PROFILE_KEY,
              JSON.stringify({ ...lastLogin, name: name.trim(), phone: cleanedPhone })
            );
          }
        }

        await refreshUserData();

        showSuccess(t('alerts.success.profileUpdated'));
        navigation.goBack();
      }
    } catch (error) {
      console.error('Ошибка сохранения:', error);
      showError(t('alerts.network.saveFailed'));
    } finally {
      setLoading(false);
    }
  };

  const styles = createStyles(colors, screen);

  return (
    <ThemedSafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <ChevronLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('screens.profile.editProfile')}</Text>
        <TouchableOpacity onPress={handleSave} style={styles.headerButton} disabled={loading}>
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Save size={20} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.avatarSection}>
          <TouchableOpacity
            style={styles.avatar}
            onPress={handleChangePhoto}
            disabled={pickingPhoto}
            activeOpacity={0.85}
          >
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>👤</Text>
            )}
            <View style={styles.cameraButton}>
              {pickingPhoto ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Camera size={16} color="#FFFFFF" />
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleChangePhoto} disabled={pickingPhoto}>
            <Text style={styles.changePhotoText}>{t('screens.editProfile.changePhoto')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>{t('common.form.name')}</Text>
          <View style={styles.inputWrapper}>
            <User size={20} color={colors.textSecondary} />
            <TextInput
              style={styles.input}
              placeholder={t('screens.editProfile.namePlaceholder')}
              value={name}
              onChangeText={setName}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="words"
            />
          </View>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>{t('common.form.phone')}</Text>
          <View style={styles.inputWrapper}>
            <Phone size={20} color={colors.textSecondary} />
            <TextInput
              style={styles.input}
              placeholder="+7 (999) 123-45-67"
              value={phone}
              onChangeText={handlePhoneChange}
              keyboardType="phone-pad"
              placeholderTextColor={colors.textSecondary}
              maxLength={18}
            />
          </View>
          <Text style={styles.hint}>{t('screens.editProfile.phoneHint')}</Text>
        </View>
      </ScrollView>
    </ThemedSafeAreaView>
  );
}

const createStyles = (
  colors: ReturnType<typeof useThemedScreen>['colors'],
  screen: ReturnType<typeof useThemedScreen>['screen']
) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: screen.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 16,
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    headerButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' },
    content: { flex: 1 },
    contentContainer: { padding: 20, paddingBottom: 32 },
    avatarSection: { alignItems: 'center', marginBottom: 30 },
    avatar: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
      position: 'relative',
      overflow: 'hidden',
    },
    avatarImage: { width: 100, height: 100, borderRadius: 50 },
    avatarText: { fontSize: 40 },
    cameraButton: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: screen.card,
    },
    changePhotoText: { fontSize: 14, color: colors.primary, fontWeight: '500' },
    inputContainer: { marginBottom: 20 },
    label: { fontSize: 14, fontWeight: '500', color: screen.text, marginBottom: 8 },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: screen.card,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 12,
      borderWidth: 1,
      borderColor: screen.border,
    },
    input: { flex: 1, fontSize: 16, color: screen.text },
    hint: { fontSize: 11, color: colors.textSecondary, marginTop: 6 },
  });
