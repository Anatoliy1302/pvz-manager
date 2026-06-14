import * as SecureStore from 'expo-secure-store';
import { cleanPhone } from '../utils/phoneHelpers';
import { hashPin, verifyPin, upgradePinIfLegacy } from '../utils/pinHash';

const pinKey = (phone: string) => `user_pin_${cleanPhone(phone)}`;
const setupKey = (phone: string) => `user_setup_complete_${cleanPhone(phone)}`;

const PinService = {
  async hasPin(phone: string): Promise<boolean> {
    const stored = await SecureStore.getItemAsync(pinKey(phone));
    return stored !== null;
  },

  async savePin(phone: string, pin: string): Promise<void> {
    const hashed = await hashPin(pin);
    await SecureStore.setItemAsync(pinKey(phone), hashed);
    await SecureStore.setItemAsync(setupKey(phone), 'true');
  },

  async verifyPin(phone: string, pin: string): Promise<boolean> {
    const stored = await SecureStore.getItemAsync(pinKey(phone));
    if (!stored) return false;

    const valid = await verifyPin(pin, stored);
    if (!valid) return false;

    const upgraded = await upgradePinIfLegacy(pin, stored);
    if (upgraded) {
      await SecureStore.setItemAsync(pinKey(phone), upgraded);
    }

    return true;
  },

  async changePin(phone: string, currentPin: string, newPin: string): Promise<void> {
    const stored = await SecureStore.getItemAsync(pinKey(phone));
    if (!stored) {
      throw new Error('PIN_NOT_SET');
    }

    const valid = await verifyPin(currentPin, stored);
    if (!valid) {
      throw new Error('WRONG_PIN');
    }

    await PinService.savePin(phone, newPin);
  },

  async isSetupComplete(phone: string): Promise<boolean> {
    const flag = await SecureStore.getItemAsync(setupKey(phone));
    if (flag === 'true') return true;
    return PinService.hasPin(phone);
  },
};

export default PinService;
