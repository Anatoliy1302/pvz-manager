import DataService from '../DataService';
import { User } from '../../types/user';
import { userWorksAtPvz } from '../../utils/pvzUserHelpers';

export async function fetchEmployeesList(pvzId?: string): Promise<User[]> {
  const users = await DataService.getUsers();
  const active = users.filter((u) => u.role !== 'owner' && u.status === 'active');
  if (!pvzId) return active;
  return active.filter((u) => userWorksAtPvz(u, pvzId));
}
