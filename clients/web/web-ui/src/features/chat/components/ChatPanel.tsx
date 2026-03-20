import { config } from '@shared/config/appConfig';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth';
import { useChatStore } from '../chatStore';
import { useChatWebSocket } from '../hooks/useChatWebSocket';
import styles from './ChatPanel.module.css';

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
    <div className={styles.panel}>
      <div className={styles.messages}>
        {messages.map(msg => (
          <div key={msg.id} className={styles.message}>
            <span className={styles.username}>{msg.user}:</span> <span>{msg.text}</span>
            <span className={styles.timestamp}>{new Date(msg.timestamp).toLocaleTimeString()}</span>
          </div>
        ))}
        {errorMessage && (
          <div className={styles.errorMsg}>
            <span style={{ fontWeight: 600 }}>Error:</span> <span>{errorMessage}</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className={styles.inputRow}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
          placeholder="Type a message..."
          className={styles.input}
        />
        <button className={styles.sendBtn} onClick={handleSend}>
          Send
        </button>
      </div>
    </div>
  );
}

export default ChatPanel;
