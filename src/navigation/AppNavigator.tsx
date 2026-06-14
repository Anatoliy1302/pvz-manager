// src/navigation/AppNavigator.tsx
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';
import { ChatProvider } from '../context/ChatContext';
import { useTheme } from '../context/ThemeContext';
import LoginScreen from '../screens/auth/LoginScreen';
import MainTabNavigator from './MainTabNavigator';
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';
import LoadingSpinner from '../components/common/LoadingSpinner';

// Общие экраны
import AboutScreen from '../screens/common/AboutScreen';
import PrivacyPolicyScreen from '../screens/common/PrivacyPolicyScreen';
import SupportScreen from '../screens/common/SupportScreen';
import SettingsScreen from '../screens/common/SettingsScreen';
import ChatScreen from '../screens/chat/ChatScreen';
import NotificationsScreen from '../screens/notifications/NotificationsScreen';
import ScheduleScreen from '../screens/common/ScheduleScreen';
import SwapNotificationsScreen from '../screens/common/SwapNotificationsScreen';

import EmployeeScheduleScreen from '../screens/employee/EmployeeScheduleScreen';

// Экран табеля сотрудника
import EmployeeTimesheetScreen from '../screens/profile/EmployeeTimesheetScreen';

// Экран профиля и связанные с ним
import EmployeeProfileScreen from '../screens/profile/EmployeeProfileScreen';
import ShiftHistoryScreen from '../screens/profile/ShiftHistoryScreen';
import MyRequestsScreen from '../screens/profile/MyRequestsScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import ChangePinScreen from '../screens/profile/ChangePinScreen';

// Экран заявок сотрудника
import EmployeeRequestsScreen from '../screens/requests/EmployeeRequestsScreen';

// Экран статистики
import StatisticsScreen from '../screens/statistics/StatisticsScreen';

// Экран заявок на смены (администратор/владелец)
import ShiftRequestsScreen from '../screens/admin/ShiftRequestsScreen';
import SwapRequestsScreen from '../screens/admin/SwapRequestsScreen';

// Экран владельца
import EmployeesRouterScreen from '../screens/common/EmployeesRouterScreen';
import OwnerProfileScreen from '../screens/profile/OwnerProfileScreen';
import PVZManagementScreen from '../screens/owner/PVZManagementScreen';
import PVZFormScreen from '../screens/owner/PVZFormScreen';
import OwnerSettingsScreen from '../screens/owner/OwnerSettingsScreen';
import OwnerAnalyticsScreen from '../screens/owner/OwnerAnalyticsScreen';
import SalarySettingsScreen from '../screens/owner/SalarySettingsScreen';
import InvitationsScreen from '../screens/owner/InvitationsScreen';
import AdminPermissionsScreen from '../screens/owner/AdminPermissionsScreen';
import EmployeePermissionsScreen from '../screens/owner/EmployeePermissionsScreen';
import PenaltiesScreen from '../screens/owner/PenaltiesScreen';
import PaymentsScreen from '../screens/owner/PaymentsScreen';
import EmployeePaymentDetailsScreen from '../screens/owner/EmployeePaymentDetailsScreen';
import AdvanceRequestsScreen from '../screens/owner/AdvanceRequestsScreen';
import SalaryFormulasScreen from '../screens/owner/SalaryFormulasScreen';
import FormulaEditorScreen from '../screens/owner/FormulaEditorScreen';

// Экран добавления и редактирования сотрудника (владелец)
import EmployeeAddFormScreen from '../screens/owner/EmployeeAddFormScreen';
import EmployeeEditFormScreen from '../screens/owner/EmployeeEditFormScreen';

// Экран администратора
import AdminEmployeesScreen from '../screens/admin/AdminEmployeesScreen';
import AdminProfileScreen from '../screens/profile/AdminProfileScreen';
import AdminEmployeeAddFormScreen from '../screens/admin/AdminEmployeeAddFormScreen';
import AdminEmployeeEditFormScreen from '../screens/admin/AdminEmployeeEditFormScreen';

// Экран сотрудника - финансы и авансы
import EmployeeFinanceScreen from '../screens/employee/EmployeeFinanceScreen';
import AdvanceRequestScreen from '../screens/employee/AdvanceRequestScreen';

import { withRoleGuard } from './roleGuard';

const Stack = createNativeStackNavigator();

const OwnerPaymentsScreen = withRoleGuard(PaymentsScreen, ['owner']);
const OwnerPenaltiesScreen = withRoleGuard(PenaltiesScreen, ['owner']);
const OwnerPvzManagementScreen = withRoleGuard(PVZManagementScreen, ['owner']);
const OwnerPvzFormScreen = withRoleGuard(PVZFormScreen, ['owner']);
const OwnerAnalyticsGuardedScreen = withRoleGuard(OwnerAnalyticsScreen, ['owner']);
const OwnerInvitationsScreen = withRoleGuard(InvitationsScreen, ['owner']);
const OwnerSalarySettingsScreen = withRoleGuard(SalarySettingsScreen, ['owner']);
const OwnerAdminPermissionsScreen = withRoleGuard(AdminPermissionsScreen, ['owner']);
const OwnerEmployeePermissionsScreen = withRoleGuard(EmployeePermissionsScreen, ['owner']);
const OwnerAdvanceRequestsScreen = withRoleGuard(AdvanceRequestsScreen, ['owner']);
const OwnerSalaryFormulasScreen = withRoleGuard(SalaryFormulasScreen, ['owner']);
const OwnerFormulaEditorScreen = withRoleGuard(FormulaEditorScreen, ['owner']);
const OwnerEmployeePaymentDetailsScreen = withRoleGuard(EmployeePaymentDetailsScreen, ['owner']);
const StaffShiftRequestsScreen = withRoleGuard(ShiftRequestsScreen, ['owner', 'admin']);
const StaffSwapRequestsScreen = withRoleGuard(SwapRequestsScreen, ['owner', 'admin']);

export default function AppNavigator() {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  const { colors } = useTheme();
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null);

  useEffect(() => {
    const checkFirstLaunch = async () => {
      try {
        const completed = await SecureStore.getItemAsync('onboarding_completed');
        setIsFirstLaunch(!completed);
      } catch (error) {
        console.error('Ошибка проверки первого запуска:', error);
        setIsFirstLaunch(false);
      }
    };
    checkFirstLaunch();
  }, []);

  if (isLoading || isFirstLaunch === null) {
    return <LoadingSpinner visible text={t('common.loading.default')} transparent={false} />;
  }

  const screenOptions = {
    headerShown: false,
    contentStyle: {
      backgroundColor: colors.background,
    },
  };

  return (
    <ChatProvider>
      <Stack.Navigator screenOptions={screenOptions}>
      {/* Онбординг при первом запуске */}
      {isFirstLaunch && !user && (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      )}

      {/* Авторизация */}
      {!user && (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
        </>
      )}

      {/* Главное приложение */}
      {user && (
        <>
          {/* Главный таб-навигатор */}
          <Stack.Screen name="Main" component={MainTabNavigator} />

          {/* Общие экраны для всех ролей */}
          <Stack.Screen name="About" component={AboutScreen} />
          <Stack.Screen name="Privacy" component={PrivacyPolicyScreen} />
          <Stack.Screen name="Support" component={SupportScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
          <Stack.Screen name="ShiftRequests" component={StaffShiftRequestsScreen} />
          <Stack.Screen name="SwapRequests" component={StaffSwapRequestsScreen} />
          <Stack.Screen name="Schedule" component={ScheduleScreen} />
          <Stack.Screen name="SwapNotifications" component={SwapNotificationsScreen} />

          <Stack.Screen name="EmployeeSchedule" component={EmployeeScheduleScreen} />

          {/* Экран табеля сотрудника */}
          <Stack.Screen name="Timesheet" component={EmployeeTimesheetScreen} />

          {/* Экран профиля и связанные */}
          <Stack.Screen name="Profile" component={EmployeeProfileScreen} />
          <Stack.Screen name="ShiftHistory" component={ShiftHistoryScreen} />
          <Stack.Screen name="MyRequests" component={MyRequestsScreen} />
          <Stack.Screen name="EditProfile" component={EditProfileScreen} />
          <Stack.Screen name="ChangePin" component={ChangePinScreen} />

          {/* Экран заявок сотрудника */}
          <Stack.Screen name="Requests" component={EmployeeRequestsScreen} />

          {/* Экран статистики */}
          <Stack.Screen name="Statistics" component={StatisticsScreen} />

          {/* Экран сотрудника - финансы */}
          <Stack.Screen name="EmployeeFinance" component={EmployeeFinanceScreen} />
          <Stack.Screen name="AdvanceRequest" component={AdvanceRequestScreen} />

          {/* ========== ЭКРАНЫ ВЛАДЕЛЬЦА ========== */}
          <Stack.Screen name="PVZManagement" component={OwnerPvzManagementScreen} />
          <Stack.Screen name="PVZForm" component={OwnerPvzFormScreen} />
          <Stack.Screen name="OwnerSettings" component={OwnerSettingsScreen} />
          <Stack.Screen name="OwnerAnalytics" component={OwnerAnalyticsGuardedScreen} />
          <Stack.Screen name="Employees" component={EmployeesRouterScreen} />
          <Stack.Screen name="OwnerProfile" component={OwnerProfileScreen} />
          <Stack.Screen name="Invitations" component={OwnerInvitationsScreen} />
          <Stack.Screen name="SalarySettings" component={OwnerSalarySettingsScreen} />
          <Stack.Screen name="EmployeeAddForm" component={EmployeeAddFormScreen} />
          <Stack.Screen name="EmployeeEditForm" component={EmployeeEditFormScreen} />
          <Stack.Screen name="AdminPermissions" component={OwnerAdminPermissionsScreen} />
          <Stack.Screen
            name="OwnerPayroll"
            component={OwnerPaymentsScreen}
            options={{ title: t('screens.finance.payments') }}
          />
          <Stack.Screen name="EmployeePermissions" component={OwnerEmployeePermissionsScreen} />
          <Stack.Screen name="Penalties" component={OwnerPenaltiesScreen} />
          <Stack.Screen name="Payments" component={OwnerPaymentsScreen} />
          <Stack.Screen name="EmployeePaymentDetails" component={OwnerEmployeePaymentDetailsScreen} />
          <Stack.Screen name="AdvanceRequests" component={OwnerAdvanceRequestsScreen} />
          <Stack.Screen name="SalaryFormulas" component={OwnerSalaryFormulasScreen} />
          <Stack.Screen name="FormulaEditor" component={OwnerFormulaEditorScreen} />

          {/* ========== ЭКРАНЫ АДМИНИСТРАТОРА ========== */}
          <Stack.Screen name="AdminEmployees" component={AdminEmployeesScreen} />
          <Stack.Screen name="AdminProfile" component={AdminProfileScreen} />
          <Stack.Screen name="AdminEmployeeAddForm" component={AdminEmployeeAddFormScreen} />
          <Stack.Screen name="AdminEmployeeEditForm" component={AdminEmployeeEditFormScreen} />
        </>
      )}
    </Stack.Navigator>
    </ChatProvider>
  );
}