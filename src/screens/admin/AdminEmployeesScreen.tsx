// src/screens/admin/AdminEmployeesScreen.tsx
import React from 'react';
import { useAuth } from '../../context/AuthContext';
import EmployeesListScreen from '../common/EmployeesListScreen';

interface AdminEmployeesScreenProps {
  navigation: any;
  route?: any;
}

export default function AdminEmployeesScreen({ navigation, route }: AdminEmployeesScreenProps) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('canManageEmployees');

  return (
    <EmployeesListScreen
      navigation={navigation}
      route={{
        ...route,
        params: {
          ...route?.params,
          role: 'admin',
          showBack: false,
          canEdit: canManage,
          canDelete: canManage,
          canAdd: canManage,
          addScreenName: 'AdminEmployeeAddForm',
          editScreenName: 'AdminEmployeeEditForm',
        },
      }}
    />
  );
}