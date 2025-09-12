import { useEffect, useRef, useState } from 'react';
import { config } from '../config/appConfig';
import { useChatWebSocket } from '../hooks/useChatWebSocket';
import { useChatStore } from '../store/chatStore';

const USER = 'Player'; // TODO: Replace with real user info

export function ChatPanel() {
  const { messages } = useChatStore();
  const { sendMessage } = useChatWebSocket(config.getWebSocketUrl(), USER);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (input.trim()) {
      sendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', padding: 12, marginBottom: 8 }}>
        {messages.map(msg => (
          <div key={msg.id} style={{ marginBottom: 6, fontSize: 15 }}>
            <span style={{ fontWeight: 600, color: '#6366f1' }}>{msg.user}:</span> <span>{msg.text}</span>
            <span style={{ color: '#aaa', fontSize: 12, marginLeft: 8 }}>{new Date(msg.timestamp).toLocaleTimeString()}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
          placeholder="Type a message..."
          style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 15 }}
        />
        <button
          onClick={handleSend}
          style={{ padding: '8px 18px', borderRadius: 4, background: '#6366f1', color: '#fff', fontWeight: 700, border: 'none', fontSize: 15 }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default ChatPanel;
