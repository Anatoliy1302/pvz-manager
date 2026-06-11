// src/screens/owner/OwnerEmployeesScreen.tsx
import React from 'react';
import PermissionGate from '../../components/common/PermissionGate';
import EmployeesListScreen from '../common/EmployeesListScreen';

interface OwnerEmployeesScreenProps {
  navigation: any;
  route?: any;
}

export default function OwnerEmployeesScreen({ navigation, route }: OwnerEmployeesScreenProps) {
  return (
    <PermissionGate permission="canManageEmployees" navigation={navigation}>
      <EmployeesListScreen
        navigation={navigation}
        route={{
          ...route,
          params: {
            ...route?.params,
            role: 'owner',
            showBack: false,
            canEdit: true,
            canDelete: true,
            canAdd: true,
            addScreenName: 'EmployeeAddForm',
            editScreenName: 'EmployeeEditForm',
          },
        }}
      />
    </PermissionGate>
  );
}
