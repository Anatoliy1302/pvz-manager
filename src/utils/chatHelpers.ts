import { User, Pvz } from '../types/user';

export function getGeneralChatId(pvzId: string): string {
  return `general_${pvzId}`;
}

export function getMessagesStorageKey(chatId: string): string {
  return `messages_${chatId}`;
}

export function getPrivateChatId(userIdA: string, userIdB: string): string {
  return `private_${[userIdA, userIdB].sort().join('_')}`;
}

export function userBelongsToPvz(u: User, pvz: Pvz): boolean {
  if (u.id === pvz.ownerId) return true;
  if (u.pvzId === pvz.id) return true;
  if (u.role === 'admin' && u.pvzIds?.includes(pvz.id)) return true;
  return false;
}

/** Контакты для личного чата: участники ПВЗ + владелец, без текущего пользователя */
export function getPvzChatContacts(
  users: User[],
  pvz: Pvz | null,
  currentUserId: string
): User[] {
  if (!pvz) return [];

  const contacts: User[] = [];
  const seen = new Set<string>();

  const add = (u: User | undefined) => {
    if (!u || u.id === currentUserId || u.status !== 'active' || seen.has(u.id)) return;
    if (!userBelongsToPvz(u, pvz) && u.role !== 'owner') return;
    if (u.role === 'owner' && u.id !== pvz.ownerId) return;
    seen.add(u.id);
    contacts.push(u);
  };

  add(users.find((u) => u.id === pvz.ownerId));
  users.filter((u) => u.pvzId === pvz.id && u.role !== 'owner').forEach(add);
  users
    .filter((u) => u.role === 'admin' && u.pvzIds?.includes(pvz.id))
    .forEach(add);

  return contacts;
}

/** ID всех активных участников ПВЗ (для непрочитанных в общем чате) */
export function getPvzMemberIds(
  users: User[],
  pvz: Pvz | null,
  excludeUserId?: string
): string[] {
  if (!pvz) return [];

  const ids = new Set<string>();
  users.forEach((u) => {
    if (u.status !== 'active') return;
    if (excludeUserId && u.id === excludeUserId) return;
    if (userBelongsToPvz(u, pvz)) ids.add(u.id);
  });
  return Array.from(ids);
}

export function getRoleLabel(role: User['role']): string {
  if (role === 'owner') return 'Владелец';
  if (role === 'admin') return 'Администратор';
  return 'Сотрудник';
}
