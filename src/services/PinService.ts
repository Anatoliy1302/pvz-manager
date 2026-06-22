import * as SecureStore from 'expo-secure-store';
import { toSecureStoreKeySuffix } from '../utils/loginIdentifier';
import { hashPin, verifyPin, upgradePinIfLegacy } from '../utils/pinHash';

const pinKey = (loginKey: string) => `user_pin_${toSecureStoreKeySuffix(loginKey)}`;
const setupKey = (loginKey: string) => `user_setup_complete_${toSecureStoreKeySuffix(loginKey)}`;

const PinService = {
  async hasPin(loginKey: string): Promise<boolean> {
    const stored = await SecureStore.getItemAsync(pinKey(loginKey));
    return stored !== null;
  },

  async savePin(loginKey: string, pin: string): Promise<void> {
    const hashed = await hashPin(pin);
    await SecureStore.setItemAsync(pinKey(loginKey), hashed);
    await SecureStore.setItemAsync(setupKey(loginKey), 'true');
  },

  async verifyPin(loginKey: string, pin: string): Promise<boolean> {
    const stored = await SecureStore.getItemAsync(pinKey(loginKey));
    if (!stored) return false;

    const valid = await verifyPin(pin, stored);
    if (!valid) return false;

    const upgraded = await upgradePinIfLegacy(pin, stored);
    if (upgraded) {
      await SecureStore.setItemAsync(pinKey(loginKey), upgraded);
    }

    return true;
  },

  async changePin(loginKey: string, currentPin: string, newPin: string): Promise<void> {
    const stored = await SecureStore.getItemAsync(pinKey(loginKey));
    if (!stored) {
      throw new Error('PIN_NOT_SET');
    }

    const valid = await verifyPin(currentPin, stored);
    if (!valid) {
      throw new Error('WRONG_PIN');
    }

    await PinService.savePin(loginKey, newPin);
  },

  async isSetupComplete(loginKey: string): Promise<boolean> {
    const flag = await SecureStore.getItemAsync(setupKey(loginKey));
    if (flag === 'true') return true;
    return PinService.hasPin(loginKey);
  },

  async clearPin(loginKey: string): Promise<void> {
    await SecureStore.deleteItemAsync(pinKey(loginKey));
    await SecureStore.deleteItemAsync(setupKey(loginKey));
  },

  async getStoredPinHash(loginKey: string): Promise<string | null> {
    return SecureStore.getItemAsync(pinKey(loginKey));
  },
};

export default PinService;
