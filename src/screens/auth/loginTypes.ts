import { UserRole } from '../../types/user';
import { LucideIcon } from 'lucide-react-native';

export type LoginStep =
  | 'quickLogin'
  | 'role'
  | 'email'
  | 'phone'
  | 'sms'
  | 'pin'
  | 'createPvz'
  | 'selectPvz';

export type OtpChannel = 'sms' | 'email';

/** Статус доставки OTP на экране ввода кода. */
export type OtpSendStatus =
  | 'idle'
  | 'sending'
  | 'sent'
  | 'uncertain'
  | 'rate_limited'
  | 'failed';

export type PinMode = 'setup' | 'entry';

export interface LoginRoleOption {
  id: UserRole;
  titleKey: string;
  descriptionKey: string;
  icon: LucideIcon;
}

export interface LoginPvzItem {
  id: string;
  name: string;
  address: string;
}

export interface LoginInvitationItem {
  id: string;
  pvzId: string;
  pvzName: string;
  invitedByName?: string;
}
