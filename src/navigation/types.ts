import type { NavigatorScreenParams, CompositeScreenProps, NavigationProp } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { User, Pvz } from '../types/user';
import type { SalaryFormula } from '../types/salary';

/** Chat — push / stack overlay. */
export type ChatRouteParams = {
  chatId?: string;
  chatName?: string;
};

/** Params attached by push notifications (requestId, chatId…). */
export type NotificationRouteParams = ChatRouteParams & {
  requestId?: string;
};

/** Employee add/edit screen names used from EmployeesListScreen. */
export type EmployeeFormScreenName =
  | 'EmployeeAddForm'
  | 'EmployeeEditForm'
  | 'AdminEmployeeAddForm'
  | 'AdminEmployeeEditForm';

/** Params for Employees stack screen (EmployeesRouterScreen → EmployeesListScreen). */
export type EmployeesListRouteParams = {
  pvzId?: string;
  role?: 'owner' | 'admin';
  canEdit?: boolean;
  canDelete?: boolean;
  canAdd?: boolean;
  showBack?: boolean;
  addScreenName?: EmployeeFormScreenName;
  editScreenName?: EmployeeFormScreenName;
};

/**
 * Bottom tabs — all role variants in one map.
 * Unused tab names are simply not registered for the current role.
 */
export type MainTabParamList = {
  Dashboard: undefined;
  Home: undefined;
  Employees: undefined;
  Chat: ChatRouteParams | undefined;
  Profile: undefined;
  Statistics: undefined;
};

/** Root native stack — mirrors AppNavigator Stack.Screen registrations. */
export type RootStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  Main: NavigatorScreenParams<MainTabParamList>;

  About: undefined;
  Privacy: undefined;
  Support: undefined;
  Settings: undefined;
  Chat: ChatRouteParams | undefined;
  Notifications: undefined;
  ShiftRequests: NotificationRouteParams | undefined;
  SwapRequests: NotificationRouteParams | undefined;
  Schedule: undefined;
  SwapNotifications: undefined;

  EmployeeSchedule: undefined;
  Timesheet: undefined;
  Profile: undefined;
  ShiftHistory: undefined;
  MyRequests: undefined;
  EditProfile: undefined;
  ChangePin: undefined;
  DeleteAccount: undefined;
  Requests: undefined;
  Statistics: undefined;
  EmployeeFinance: { openAdvanceModal?: boolean } | undefined;
  AdvanceRequest: undefined;

  PVZManagement: undefined;
  PVZForm: { pvz?: Pvz } | undefined;
  OwnerSettings: undefined;
  OwnerAnalytics: undefined;
  Employees: EmployeesListRouteParams | undefined;
  OwnerProfile: undefined;
  Invitations: undefined;
  SalarySettings: undefined;
  EmployeeAddForm: { pvzId?: string } | undefined;
  EmployeeEditForm: { employee: User; pvzId?: string };
  AdminPermissions: undefined;
  OwnerPayroll: undefined;
  EmployeePermissions: undefined;
  Penalties: undefined;
  Payments: { employeeName?: string } | undefined;
  EmployeePaymentDetails: { employeeId: string; employeeName: string };
  AdvanceRequests: NotificationRouteParams | undefined;
  SalaryFormulas: undefined;
  FormulaEditor: { formula: SalaryFormula | null };
  Subscription: undefined;
  Export: undefined;
  OneCExport: undefined;

  AdminEmployees: EmployeesListRouteParams | undefined;
  AdminProfile: undefined;
  AdminEmployeeAddForm: { pvzId?: string } | undefined;
  AdminEmployeeEditForm: { employee: User; pvzId?: string };
};

/** Screens reachable from push notification handlers. */
export type NotificationNavigateTarget =
  | { screen: 'EmployeeSchedule' }
  | { screen: 'Requests' }
  | { screen: 'Chat'; params?: ChatRouteParams }
  | { screen: 'EmployeeFinance' }
  | { screen: 'ShiftRequests'; params?: NotificationRouteParams }
  | { screen: 'SwapRequests'; params?: NotificationRouteParams }
  | { screen: 'SwapNotifications' }
  | { screen: 'AdvanceRequests'; params?: NotificationRouteParams };

declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}

export type RootStackScreenProps<T extends keyof RootStackParamList = keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type MainTabScreenProps<T extends keyof MainTabParamList = keyof MainTabParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<MainTabParamList, T>,
    NativeStackScreenProps<RootStackParamList>
  >;

export type RootStackNavigationProp = RootStackScreenProps['navigation'];

export type MainTabNavigationProp = MainTabScreenProps['navigation'];

/** Stack targets from dashboard / profile menus (not tab routes). */
export type MenuStackScreen = Exclude<
  keyof RootStackParamList,
  'Main' | 'Onboarding' | 'Login' | 'AdvanceRequest' | 'OwnerProfile' | 'AdminProfile' | 'Profile'
>;

/** Minimal navigate surface shared by tab composite and root stack navigators. */
export type AppNavigationLike = {
  navigate: NavigationProp<RootStackParamList>['navigate'];
  goBack?: () => void;
  canGoBack?: () => boolean;
  setParams?: NavigationProp<RootStackParamList>['setParams'];
};

export function navigateRoot(navigation: AppNavigationLike, screen: MenuStackScreen): void {
  (navigation.navigate as (name: MenuStackScreen) => void)(screen);
}

export function navigateEmployeeAddForm(
  navigation: AppNavigationLike,
  screen: EmployeeFormScreenName,
  params?: { pvzId?: string },
): void {
  if (screen === 'EmployeeAddForm' || screen === 'AdminEmployeeAddForm') {
    navigation.navigate(screen, params);
  }
}

export function navigateEmployeeEditForm(
  navigation: AppNavigationLike,
  screen: EmployeeFormScreenName,
  params: { employee: User; pvzId?: string },
): void {
  if (screen === 'EmployeeEditForm' || screen === 'AdminEmployeeEditForm') {
    navigation.navigate(screen, params);
  }
}

export { useAppNavigation, useAppRoute } from './hooks';

/** Screen registered on both root stack and bottom tabs under different names. */
export type StackOrTabScreenProps<
  TStack extends keyof RootStackParamList,
  TTab extends keyof MainTabParamList,
> = RootStackScreenProps<TStack> | MainTabScreenProps<TTab>;

/** Same component, two stack registrations (owner vs admin forms). */
export type DualStackScreenProps<
  A extends keyof RootStackParamList,
  B extends keyof RootStackParamList,
> = RootStackScreenProps<A> | RootStackScreenProps<B>;
