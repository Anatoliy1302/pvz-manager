/** ID комнаты, открытой в ChatScreen (чтобы не дублировать push) */
let activeChatRoomId: string | null = null;

export const setActiveChatRoomId = (roomId: string | null): void => {
  activeChatRoomId = roomId;
};

export const getActiveChatRoomId = (): string | null => activeChatRoomId;
