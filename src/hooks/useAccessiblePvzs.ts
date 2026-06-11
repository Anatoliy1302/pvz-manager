import { useState, useEffect, useCallback } from 'react';
import DataService from '../services/DataService';
import { Pvz, User } from '../types/user';

export function useAccessiblePvzs(
  user: User | null | undefined,
  userPvzs: Pvz[] | undefined,
  pvz: Pvz | null | undefined,
  initialPvzId?: string
) {
  const [accessiblePvzs, setAccessiblePvzs] = useState<Pvz[]>([]);
  const [selectedPvzId, setSelectedPvzId] = useState(initialPvzId || pvz?.id || '');

  const loadAccessiblePvzs = useCallback(async () => {
    if (!user) return;

    try {
      const allPvzs = await DataService.getPvzs();
      let pvzList: Pvz[] = [];

      if (user.role === 'owner') {
        pvzList = allPvzs.filter((p) => p.ownerId === user.id);
      } else if (user.role === 'admin') {
        if (user.pvzIds && user.pvzIds.length > 0) {
          pvzList = allPvzs.filter((p) => user.pvzIds?.includes(p.id));
        } else if (user.pvzId) {
          const adminPvz = allPvzs.find((p) => p.id === user.pvzId);
          pvzList = adminPvz ? [adminPvz] : [];
        } else {
          pvzList = userPvzs?.length ? userPvzs : pvz ? [pvz] : [];
        }
      } else {
        pvzList = userPvzs?.length ? userPvzs : pvz ? [pvz] : [];
      }

      setAccessiblePvzs(pvzList);

      setSelectedPvzId((current) => {
        if (current && pvzList.some((p) => p.id === current)) {
          return current;
        }
        return pvzList[0]?.id || '';
      });
    } catch (error) {
      console.error('Ошибка загрузки ПВЗ:', error);
    }
  }, [user, userPvzs, pvz]);

  useEffect(() => {
    loadAccessiblePvzs();
  }, [loadAccessiblePvzs]);

  return {
    accessiblePvzs,
    selectedPvzId,
    setSelectedPvzId,
    reloadPvzs: loadAccessiblePvzs,
  };
}
