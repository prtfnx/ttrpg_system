import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  client_operation_id?: string;
  server_cursor?: number;
  user: string;
  text: string;
  timestamp: number;
  tooltip?: string;
  deliveryStatus?: 'pending' | 'sent' | 'failed';
}

interface ChatState {
  activeSessionId: string | null;
  messagesBySession: Record<string, ChatMessage[]>;
  messages: ChatMessage[];
  setActiveSession: (sessionId: string) => void;
  addMessage: (msg: ChatMessage) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  confirmMessage: (clientOperationId: string, persisted: ChatMessage) => void;
  failMessage: (clientOperationId: string) => void;
  retryMessage: (clientOperationId: string) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  activeSessionId: null,
  messagesBySession: {},
  messages: [],
  setActiveSession: (sessionId) => set((state) => ({
    activeSessionId: sessionId,
    messages: state.messagesBySession[sessionId] ?? [],
  })),
  addMessage: (msg) => set((state) => {
    if (!state.activeSessionId) return state;
    const existingIndex = state.messages.findIndex((message) => message.id === msg.id);
    const messages = existingIndex >= 0
      ? state.messages.map((message, index) => index === existingIndex ? msg : message)
      : [...state.messages, msg];
    return {
      messages,
      messagesBySession: { ...state.messagesBySession, [state.activeSessionId]: messages },
    };
  }),
  setMessages: (msgs) => set((state) => {
    if (!state.activeSessionId) return state;
    return {
      messages: msgs,
      messagesBySession: { ...state.messagesBySession, [state.activeSessionId]: msgs },
    };
  }),
  confirmMessage: (clientOperationId, persisted) => set((state) => {
    if (!state.activeSessionId) return state;
    const messages = state.messages.map((message) =>
      message.client_operation_id === clientOperationId || message.id === clientOperationId
        ? { ...persisted, deliveryStatus: 'sent' as const }
        : message
    );
    return {
      messages,
      messagesBySession: { ...state.messagesBySession, [state.activeSessionId]: messages },
    };
  }),
  failMessage: (clientOperationId) => set((state) => {
    if (!state.activeSessionId) return state;
    const messages = state.messages.map((message) =>
      message.client_operation_id === clientOperationId || message.id === clientOperationId
        ? { ...message, deliveryStatus: 'failed' as const }
        : message
    );
    return {
      messages,
      messagesBySession: { ...state.messagesBySession, [state.activeSessionId]: messages },
    };
  }),
  retryMessage: (clientOperationId) => set((state) => {
    if (!state.activeSessionId) return state;
    const messages = state.messages.map((message) =>
      message.client_operation_id === clientOperationId || message.id === clientOperationId
        ? { ...message, deliveryStatus: 'pending' as const }
        : message
    );
    return {
      messages,
      messagesBySession: { ...state.messagesBySession, [state.activeSessionId]: messages },
    };
  }),
  clearMessages: () => set((state) => {
    if (!state.activeSessionId) return { messages: [], messagesBySession: {} };
    return {
      messages: [],
      messagesBySession: { ...state.messagesBySession, [state.activeSessionId]: [] },
    };
  }),
}));
