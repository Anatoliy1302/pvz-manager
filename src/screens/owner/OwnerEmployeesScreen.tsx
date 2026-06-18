import React, { useMemo } from 'react';
import PermissionGate from '../../components/common/PermissionGate';
import EmployeesListScreen from '../common/EmployeesListScreen';

interface OwnerEmployeesScreenProps {
  navigation: any;
  route?: any;
}

export default function OwnerEmployeesScreen({ navigation, route }: OwnerEmployeesScreenProps) {
  const listRoute = useMemo(
    () => ({
      ...route,
      params: {
        ...route?.params,
        role: 'owner' as const,
        showBack: false,
        canEdit: true,
        canDelete: true,
        canAdd: true,
        addScreenName: 'EmployeeAddForm',
        editScreenName: 'EmployeeEditForm',
      },
    }),
    [route]
  );

  return (
    <PermissionGate permission="canManageEmployees" navigation={navigation}>
      <EmployeesListScreen navigation={navigation} route={listRoute} />
    </PermissionGate>
  );
}
