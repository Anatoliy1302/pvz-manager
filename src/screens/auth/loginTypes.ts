import type { LucideIcon } from 'lucide-react-native';
import { UserRole } from '../../types/user';

/** Режим экрана: вход или регистрация владельца. */
export type AuthFlowMode = 'login' | 'register';

export type OtpChannel = 'email' | 'sms';
export type OtpSendStatus =
  | 'idle'
  | 'sending'
  | 'sent'
  | 'uncertain'
  | 'rate_limited'
  | 'failed';

export interface LoginRoleOption {
  id: UserRole;
  titleKey: string;
  descriptionKey: string;
  icon: LucideIcon;
}

export interface LoginPvzItem {
  id: string;
  name: string;
  address?: string;
}

export interface LoginInvitationItem {
  id: string;
  pvzId: string;
  pvzName: string;
  invitedByName?: string;
}

/** Шаги входа: роль → (владелец: email/PIN) | (staff: phone/SMS) → выбор ПВЗ. */
export type LoginStep =
  | 'role'
  | 'quick_login'
  | 'email'
  | 'phone'
  | 'sms'
  | 'select_pvz'
  | 'pin'
  | 'otp_reset'
  | 'register_otp'
  | 'new_pin'
  | 'create_pvz';

export type NewPinPhase = 'enter' | 'confirm';
