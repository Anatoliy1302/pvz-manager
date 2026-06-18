import type { Dispatch, SetStateAction } from 'react';
import { User, UserRole, Pvz, EmployeePermissions } from '../../types/user';
import { Subscription } from '../../services/subscriptionService';

export interface SignInOptions {
  pvzId?: string;
  invitationId?: string;
  loginMethod?: 'phone' | 'email';
}

export interface AuthContextData {
  user: User | null;
  pvz: Pvz | null;
  subscription: Subscription | null;
  isLoading: boolean;
  signIn: (phone: string, role: UserRole, options?: SignInOptions) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  deleteUserAccount: () => Promise<void>;
  hasRole: (roles: UserRole[]) => boolean;
  switchPvz: (pvzId: string) => Promise<void>;
  userPvzs: Pvz[];
  addEmployee: (phone: string, name: string, role: UserRole, pvzId?: string) => Promise<void>;
  revokeInvitation: (invitationId: string) => Promise<void>;
  confirmPendingEmployee: (pendingUserId: string) => Promise<void>;
  getPendingEmployees: () => User[];
  getEmployees: () => User[];
  getEmployeesByPvz: (pvzId: string) => User[];
  updateEmployeePvz: (employeeId: string, pvzId: string) => Promise<void>;
  updateUserPvzs: (newPvzs: Pvz[]) => Promise<void>;
  updateCurrentPvz: (pvzId: string) => Promise<void>;
  refreshUserData: () => Promise<void>;
  getPendingEmployeesCount: () => number;
  registerOwner: (phone: string, name: string, pvzName: string, address: string) => Promise<void>;
  isOwnerExists: () => Promise<boolean>;
  blockUser: (userId: string) => Promise<void>;
  hasPermission: (permission: keyof EmployeePermissions) => boolean;
  refreshSubscription: () => Promise<Subscription | null>;
}

export interface AuthSetters {
  setUser: Dispatch<SetStateAction<User | null>>;
  setPvz: Dispatch<SetStateAction<Pvz | null>>;
  setUserPvzs: Dispatch<SetStateAction<Pvz[]>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
}
