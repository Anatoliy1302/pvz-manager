import React, { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';
import DataService from '../services/DataService';

function QueryInvalidationBridge() {
  useEffect(() => {
    const unsubs = [
      DataService.subscribe('pvz_list', () => {
        void queryClient.invalidateQueries({ queryKey: ['pvz'] });
      }),
      DataService.subscribe('pvz_users', () => {
        void queryClient.invalidateQueries({ queryKey: ['employees'] });
        void queryClient.invalidateQueries({ queryKey: ['profile'] });
      }),
      DataService.subscribe('shifts', () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.shifts() });
      }),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, []);

  return null;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <QueryInvalidationBridge />
      {children}
    </QueryClientProvider>
  );
}
