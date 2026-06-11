import { EmployeePermissions, User, defaultPermissions } from '../types/user';

export function normalizePermissions(
  permissions?: Partial<EmployeePermissions>
): EmployeePermissions {
  return { ...defaultPermissions, ...permissions };
}

export function mergeUserPermissions(
  user: User,
  source?: Partial<EmployeePermissions>
): User {
  if (user.role !== 'employee') return user;
  return {
    ...user,
    permissions: normalizePermissions({ ...user.permissions, ...source }),
  };
}

/** Админ с полным доступом: явные permissions + permissionLevel. */
export function ensureFullAdmin(user: User): User {
  if (user.role !== 'admin') return user;
  return {
    ...user,
    permissionLevel: 'full',
    permissions: {
      ...defaultPermissions,
      canViewShifts: true,
      canRequestShifts: true,
      canSwapShifts: true,
      canViewStats: true,
      canManageEmployees: true,
      canManageSchedule: true,
      canManageShifts: true,
      canViewRequests: true,
      isFullAdmin: true,
    },
  };
}
