import React from 'react';
import { useAuth } from '../../context/AuthContext';
import OwnerEmployeesScreen from '../owner/OwnerEmployeesScreen';
import AdminEmployeesScreen from '../admin/AdminEmployeesScreen';

export default function EmployeesRouterScreen(props: any) {
  const { user } = useAuth();

  if (user?.role === 'owner') {
    return <OwnerEmployeesScreen {...props} />;
  }

  return <AdminEmployeesScreen {...props} />;
}
