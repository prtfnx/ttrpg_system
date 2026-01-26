import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  user: string;
  text: string;
  timestamp: number;
}

interface ChatState {
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  setMessages: (msgs) => set(() => ({ messages: msgs })),
  clearMessages: () => set(() => ({ messages: [] })),
}));
