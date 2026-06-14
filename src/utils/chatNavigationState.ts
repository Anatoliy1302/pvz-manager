/** Синхронизируется из ChatContext — для кода вне React-дерева */
let activeChatRoomId: string | null = null;

export const setActiveChatRoomId = (roomId: string | null): void => {
  activeChatRoomId = roomId;
};

export const getActiveChatRoomId = (): string | null => activeChatRoomId;
