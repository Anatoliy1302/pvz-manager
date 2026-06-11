import { Pvz, User } from '../../types/user';
import { readLocalPvzs, writeLocalPvzs } from '../local/localPvzStore';
import { dataEventBus } from './dataEventBus';

export async function getPvzs(): Promise<Pvz[]> {
  return readLocalPvzs();
}

export async function getPvzById(id: string): Promise<Pvz | null> {
  const pvzs = await getPvzs();
  return pvzs.find((p) => p.id === id) || null;
}

export async function getPvzsForAdmin(admin: Pick<User, 'pvzId' | 'pvzIds'>): Promise<Pvz[]> {
  const ids = admin.pvzIds?.length
    ? [...new Set(admin.pvzIds)]
    : admin.pvzId
      ? [admin.pvzId]
      : [];
  if (ids.length === 0) return [];

  const allPvzs = await getPvzs();
  return ids.map((id) => allPvzs.find((p) => p.id === id)).filter((p): p is Pvz => !!p);
}

export async function getPvzsByOwner(ownerId: string): Promise<Pvz[]> {
  const pvzs = await getPvzs();
  return pvzs.filter((p) => p.ownerId === ownerId);
}

export async function savePvz(pvz: Pvz): Promise<void> {
  const pvzs = await getPvzs();
  const index = pvzs.findIndex((p) => p.id === pvz.id);

  if (index !== -1) {
    pvzs[index] = pvz;
  } else {
    pvzs.push(pvz);
  }

  await writeLocalPvzs(pvzs);
  dataEventBus.notify('pvz_list');
}

export async function deletePvz(id: string): Promise<void> {
  const pvzs = await getPvzs();
  const filtered = pvzs.filter((p) => p.id !== id);
  await writeLocalPvzs(filtered);
  dataEventBus.notify('pvz_list');
}
