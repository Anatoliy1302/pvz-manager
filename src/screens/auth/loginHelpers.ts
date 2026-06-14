import PinService from '../../services/PinService';

export async function isPinSetupComplete(cleanedPhone: string): Promise<boolean> {
  return PinService.isSetupComplete(cleanedPhone);
}
