import { useGameStore } from '@/store';
import { isDM } from '@features/session/types/roles';
import { config } from '@shared/config/appConfig';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth';
import { useChatStore } from '../chatStore';
import { useChatWebSocket } from '../hooks/useChatWebSocket';
import styles from './ChatPanel.module.css';

export function ChatPanel() {
  const { user } = useAuth();
  const { messages } = useChatStore();
  const sessionRole = useGameStore(state => state.sessionRole);
  const canModerate = isDM(sessionRole);
  const { sendMessage, retryMessage, loadOlderMessages, moderateMessage } = useChatWebSocket(config.getWebSocketUrl(), user?.username || 'Anonymous');
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
      
      if (message.startsWith('/')) {
        setErrorMessage('Slash commands are not supported. Use the character controls for rolls.');
        setInput('');
        return;
      }
      
      sendMessage(message);
      setInput('');
    }
  };

  const handleModeration = (
    messageId: string,
    action: 'redact' | 'delete',
    ownsMessage: boolean,
  ) => {
    let reason: string | undefined;
    if (canModerate && (action === 'delete' || !ownsMessage)) {
      const entered = window.prompt('Moderation reason (required):');
      if (!entered?.trim()) return;
      reason = entered.trim();
    }
    moderateMessage(messageId, action, reason);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.historyActions}>
        <button className={styles.historyBtn} onClick={loadOlderMessages} type="button">
          Load older messages
        </button>
      </div>
      <div className={styles.messages}>
        {messages.map(msg => {
          const ownsMessage = msg.user_id === user?.id
            || (msg.user_id == null && msg.user === user?.username);
          const persisted = msg.deliveryStatus == null || msg.deliveryStatus === 'sent';
          return (
          <div key={msg.id} className={styles.message} title={msg.tooltip}>
            <span className={styles.username}>{msg.user}:</span> <span>{msg.text}</span>
            <span className={styles.timestamp}>{new Date(msg.timestamp).toLocaleTimeString()}</span>
            {msg.deliveryStatus === 'pending' && <span aria-label="Sending"> · sending</span>}
            {msg.deliveryStatus === 'failed' && (
              <button type="button" onClick={() => retryMessage(msg.client_operation_id ?? msg.id)}>
                Retry
              </button>
            )}
            {persisted && !msg.redacted && !msg.deleted && (ownsMessage || canModerate) && (
              <button
                className={styles.moderationBtn}
                type="button"
                onClick={() => handleModeration(msg.id, 'redact', ownsMessage)}
                aria-label={`Redact message from ${msg.user}`}
              >
                Redact
              </button>
            )}
            {persisted && !msg.deleted && canModerate && (
              <button
                className={styles.moderationBtn}
                type="button"
                onClick={() => handleModeration(msg.id, 'delete', ownsMessage)}
                aria-label={`Delete message from ${msg.user}`}
              >
                Delete
              </button>
            )}
          </div>
          );
        })}
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
