import { createNavigationContainerRef, ParamListBase } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef<ParamListBase>();

export function navigateFromNotificationData(data: Record<string, unknown> | undefined): void {
  if (!data || !navigationRef.isReady()) return;

  const screen = typeof data.screen === 'string' ? data.screen : undefined;
  if (!screen) return;

  const params: Record<string, unknown> = {};
  if (typeof data.chatId === 'string') params.chatId = data.chatId;
  if (typeof data.requestId === 'string') params.requestId = data.requestId;

  navigationRef.navigate(screen, params);
}
