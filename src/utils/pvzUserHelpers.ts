import { User } from '../types/user';

export function userWorksAtPvz(u: User, pvzId: string): boolean {
  if (u.pvzId === pvzId) return true;
  return u.pvzIds?.includes(pvzId) ?? false;
}
