import { Shield, User, Users } from 'lucide-react-native';
import { UserRole } from '../../types/user';
import { LoginRoleOption } from './loginTypes';

export const ROLE_LABEL_KEYS: Record<UserRole, string> = {
  owner: 'common.roles.owner',
  admin: 'common.roles.admin',
  employee: 'common.roles.employee',
};

export const ROLE_OPTIONS: LoginRoleOption[] = [
  {
    id: 'owner',
    titleKey: 'auth.role.owner.title',
    descriptionKey: 'auth.role.owner.description',
    icon: Shield,
  },
  {
    id: 'employee',
    titleKey: 'auth.role.employee.title',
    descriptionKey: 'auth.role.employee.description',
    icon: User,
  },
  {
    id: 'admin',
    titleKey: 'auth.role.admin.title',
    descriptionKey: 'auth.role.admin.description',
    icon: Users,
  },
];
