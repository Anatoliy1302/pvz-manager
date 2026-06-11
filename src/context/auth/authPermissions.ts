import { User, UserRole, EmployeePermissions } from '../../types/user';
import { normalizePermissions } from '../../utils/permissionHelpers';

export const checkHasRole = (user: User | null, roles: UserRole[]) => {
  if (!user) return false;
  return roles.includes(user.role);
};

export const checkHasPermission = (
  user: User | null,
  permission: keyof EmployeePermissions
): boolean => {
  if (!user) return false;
  if (user.role === 'owner') return true;

  if (user.role === 'admin') {
    if (user.permissionLevel === 'full') return true;
    const perms = normalizePermissions(user.permissions);
    if (perms.isFullAdmin) return true;
    return perms[permission] || false;
  }

  if (user.role === 'employee') {
    const perms = normalizePermissions(user.permissions);
    if (perms.isFullAdmin) return true;
    return perms[permission] || false;
  }

  return false;
};
