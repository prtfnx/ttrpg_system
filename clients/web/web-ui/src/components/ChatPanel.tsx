import { useEffect, useRef, useState } from 'react';
import { config } from '../config/appConfig';
import { useChatWebSocket } from '../hooks/useChatWebSocket';
import { useChatStore } from '../store/chatStore';
import { useAuth } from './AuthContext';

export function ChatPanel() {
  const { user } = useAuth();
  const { messages } = useChatStore();
  const { sendMessage } = useChatWebSocket(config.getWebSocketUrl(), user?.username || 'Anonymous');
  const [input, setInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Mock-safe scrollIntoView for testing
    if (messagesEndRef.current && typeof messagesEndRef.current.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = () => {
    if (input.trim()) {
      const message = input.trim();
      setErrorMessage(null); // Clear previous errors
      
      // Check for commands
      if (message.startsWith('/')) {
        const command = message.split(' ')[0];
        const validCommands = ['/roll', '/whisper', '/help', '/clear'];
        
        if (!validCommands.includes(command)) {
          setErrorMessage(`Unknown command: ${command}. Type /help for available commands.`);
          setInput('');
          return;
        }
      }
      
      sendMessage(message);
      setInput('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'transparent' }}>
      <div style={{ flex: 1, overflowY: 'auto', background: '#1a1a1a', borderRadius: 8, border: '1px solid #404040', padding: 12, marginBottom: 8 }}>
        {messages.map(msg => (
          <div key={msg.id} style={{ marginBottom: 6, fontSize: 15, color: '#ffffff' }}>
            <span style={{ fontWeight: 600, color: '#6366f1' }}>{msg.user}:</span> <span>{msg.text}</span>
            <span style={{ color: '#808080', fontSize: 12, marginLeft: 8 }}>{new Date(msg.timestamp).toLocaleTimeString()}</span>
          </div>
        ))}
        {errorMessage && (
          <div style={{ marginBottom: 6, fontSize: 15, color: '#ff6b6b' }}>
            <span style={{ fontWeight: 600 }}>Error:</span> <span>{errorMessage}</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
          placeholder="Type a message..."
          style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #404040', background: '#1a1a1a', color: '#ffffff', fontSize: 15 }}
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
