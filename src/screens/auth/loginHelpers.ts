import PinService from '../../services/PinService';

export async function isPinSetupComplete(loginKey: string): Promise<boolean> {
  return PinService.isSetupComplete(loginKey);
}
