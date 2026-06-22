// src/navigation/MainTabNavigator.tsx
import React, { useMemo, memo } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { useChatOptional } from '../context/ChatContext';
import { 
  Users, 
  User,
  Home,
  MessageCircle,
  BarChart3,
} from 'lucide-react-native';
import { Platform, View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors as staticColors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';

// Импорт экранов для Владельца (owner)
import OwnerDashboardScreen from '../screens/owner/OwnerDashboardScreen';
import OwnerEmployeesScreen from '../screens/owner/OwnerEmployeesScreen';
import OwnerProfileScreen from '../screens/profile/OwnerProfileScreen';
import ChatScreen from '../screens/chat/ChatScreen';

// Импорт экранов для Администратора (admin)
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import AdminEmployeesScreen from '../screens/admin/AdminEmployeesScreen';
import AdminProfileScreen from '../screens/profile/AdminProfileScreen';

// Импорт экранов для Сотрудника (employee)
import EmployeeHomeScreen from '../screens/employee/EmployeeHomeScreen';
import EmployeeProfileScreen from '../screens/profile/EmployeeProfileScreen';
import EmployeeChatScreen from '../screens/chat/ChatScreen';
import StatisticsScreen from '../screens/statistics/StatisticsScreen';
import { ChatProvider } from '../context/ChatContext';

const Tab = createBottomTabNavigator();

interface TabIconProps {
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  focused: boolean;
  label: string;
  themeColors: ReturnType<typeof useTheme>['colors'];
  badgeCount?: number;
}

const TabIcon = memo(function TabIcon({
  Icon,
  focused,
  label,
  themeColors,
  badgeCount = 0,
}: TabIconProps) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 70 }}>
      <View style={{ position: 'relative' }}>
        {focused ? (
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: themeColors.card,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 4,
              shadowColor: themeColors.primary,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            }}
          >
            <LinearGradient
              colors={[themeColors.primary, themeColors.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: 46,
                height: 46,
                borderRadius: 23,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon size={22} color="#FFFFFF" strokeWidth={2} />
            </LinearGradient>
          </View>
        ) : (
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 4,
              backgroundColor: themeColors.background,
            }}
          >
            <Icon size={20} color={staticColors.grayLight} strokeWidth={1.5} />
          </View>
        )}
        {badgeCount > 0 ? (
          <View
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: staticColors.danger,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 4,
              borderWidth: 2,
              borderColor: themeColors.card,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>
              {badgeCount > 99 ? '99+' : badgeCount}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        style={{
          fontSize: 11,
          color: focused ? themeColors.primary : staticColors.grayLight,
          fontWeight: focused ? '600' : '500',
          marginTop: 2,
        }}
      >
        {label}
      </Text>
    </View>
  );
});

function MainTabNavigatorInner() {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const { colors, theme } = useTheme();
  const role = user?.role || 'employee';
  const insets = useSafeAreaInsets();
  const chatUnreadCount = useChatOptional()?.totalUnreadCount ?? 0;

  const screenOptions = useMemo(
    () => ({
      headerShown: false,
      lazy: true,
      freezeOnBlur: true,
      sceneStyle: { backgroundColor: colors.background },
      tabBarStyle: {
        backgroundColor: colors.card,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        height: Platform.OS === 'ios' ? 85 : 70 + Math.max(insets.bottom, 10),
        paddingBottom: Platform.OS === 'ios' ? 25 : 15 + (insets.bottom > 0 ? insets.bottom - 10 : 0),
        paddingTop: 8,
        shadowColor: theme === 'dark' ? '#000' : '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: theme === 'dark' ? 0.3 : 0.08,
        shadowRadius: 12,
        elevation: 10,
      },
      tabBarShowLabel: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: staticColors.grayLight,
    }),
    [colors, theme, insets.bottom]
  );

  // ========== ВЛАДЕЛЕЦ (owner) ==========
  if (role === 'owner') {
    return (
      <Tab.Navigator screenOptions={screenOptions}>
        <Tab.Screen 
          name="Dashboard" 
          component={OwnerDashboardScreen} 
          options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={Home} focused={focused} label={t('tabs.home')} themeColors={colors} /> }} 
        />
        <Tab.Screen 
          name="Employees" 
          component={OwnerEmployeesScreen} 
          options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={Users} focused={focused} label={t('tabs.employees')} themeColors={colors} /> }} 
        />
        <Tab.Screen 
          name="Chat" 
          component={ChatScreen} 
          options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={MessageCircle} focused={focused} label={t('tabs.chat')} themeColors={colors} badgeCount={chatUnreadCount} /> }} 
        />
        <Tab.Screen 
          name="Profile" 
          component={OwnerProfileScreen} 
          options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={User} focused={focused} label={t('tabs.profile')} themeColors={colors} /> }} 
        />
      </Tab.Navigator>
    );
  }

  // ========== АДМИНИСТРАТОР (admin) ==========
  if (role === 'admin') {
    return (
      <Tab.Navigator screenOptions={screenOptions}>
        <Tab.Screen
          name="Dashboard"
          component={AdminDashboardScreen}
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon Icon={Home} focused={focused} label={t('tabs.home')} themeColors={colors} />
            ),
          }}
        />
        {hasPermission('canManageEmployees') && (
          <Tab.Screen
            name="Employees"
            component={AdminEmployeesScreen}
            options={{
              tabBarIcon: ({ focused }) => (
                <TabIcon Icon={Users} focused={focused} label={t('tabs.employees')} themeColors={colors} />
              ),
            }}
          />
        )}
        <Tab.Screen
          name="Chat"
          component={ChatScreen}
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon Icon={MessageCircle} focused={focused} label={t('tabs.chat')} themeColors={colors} badgeCount={chatUnreadCount} />
            ),
          }}
        />
        <Tab.Screen
          name="Profile"
          component={AdminProfileScreen}
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon Icon={User} focused={focused} label={t('tabs.profile')} themeColors={colors} />
            ),
          }}
        />
      </Tab.Navigator>
    );
  }

  // ========== СОТРУДНИК (employee) ==========
  // Без вкладки "Финансы"
  return (
    <Tab.Navigator screenOptions={screenOptions}>
      <Tab.Screen 
        name="Home" 
        component={EmployeeHomeScreen} 
        options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={Home} focused={focused} label="Главная" themeColors={colors} /> }} 
      />
      <Tab.Screen 
        name="Chat" 
        component={EmployeeChatScreen} 
        options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={MessageCircle} focused={focused} label="Чат" themeColors={colors} badgeCount={chatUnreadCount} /> }} 
      />
      {hasPermission('canViewStats') && (
        <Tab.Screen 
          name="Statistics" 
          component={StatisticsScreen} 
          options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={BarChart3} focused={focused} label={t('tabs.statistics')} themeColors={colors} /> }} 
        />
      )}
      <Tab.Screen 
        name="Profile" 
        component={EmployeeProfileScreen} 
        options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={User} focused={focused} label="Профиль" themeColors={colors} /> }} 
      />
    </Tab.Navigator>
  );
}

export default function MainTabNavigator() {
  return (
    <ChatProvider>
      <MainTabNavigatorInner />
    </ChatProvider>
  );
}