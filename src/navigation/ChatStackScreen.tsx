import React from 'react';
import { ChatProvider } from '../context/ChatContext';
import ChatScreen from '../screens/chat/ChatScreen';

/** Stack-экран чата с собственным ChatProvider (не перерендеривает всё приложение). */
export default function ChatStackScreen(props: object) {
  return (
    <ChatProvider>
      <ChatScreen {...props} />
    </ChatProvider>
  );
}
