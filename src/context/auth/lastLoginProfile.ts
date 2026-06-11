import { UserRole } from '../../types/user';

export const LAST_LOGIN_PROFILE_KEY = 'last_login_profile';

export interface LastLoginProfile {
  phone: string;
  role: UserRole;
  name: string;
}
