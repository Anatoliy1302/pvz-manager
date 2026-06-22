import { checkHasRole, checkHasPermission } from '../context/auth/authPermissions';
import { User } from '../types/user';
import { defaultPermissions } from '../types/user';

const owner: User = {
  id: 'owner-1',
  name: 'Owner',
  email: 'owner@test.ru',
  phone: '',
  role: 'owner',
  status: 'active',
  pvzId: 'pvz-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  passwordHash: '',
};

const employee: User = {
  id: 'emp-1',
  name: 'Employee',
  email: '79001234567@users.pvzpersonal.ru',
  phone: '79001234567',
  role: 'employee',
  status: 'active',
  pvzId: 'pvz-1',
  permissions: { ...defaultPermissions, canManageEmployees: false, canViewReports: false },
  createdAt: '2026-01-01T00:00:00.000Z',
  passwordHash: '',
};

describe('authPermissions', () => {
  it('owner has owner role', () => {
    expect(checkHasRole(owner, ['owner'])).toBe(true);
    expect(checkHasRole(employee, ['owner'])).toBe(false);
  });

  it('owner has all permissions', () => {
    expect(checkHasPermission(owner, 'canManageEmployees')).toBe(true);
    expect(checkHasPermission(owner, 'canViewReports')).toBe(true);
  });

  it('employee cannot manage employees or view owner reports by default', () => {
    expect(checkHasPermission(employee, 'canManageEmployees')).toBe(false);
    expect(checkHasPermission(employee, 'canViewReports')).toBe(false);
  });
});
