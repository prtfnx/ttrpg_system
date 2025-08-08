import React, { useState, useCallback } from 'react';
import { useNetworkClient } from '../hooks/useNetworkClient';
import styles from './NetworkPanel.module.css';

interface NetworkMessage {
  type: string;
  data: any;
  timestamp: number;
}

export const NetworkPanel: React.FC = () => {
  const [serverUrl, setServerUrl] = useState('ws://localhost:8080');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [sessionCode, setSessionCode] = useState('');
  const [messages, setMessages] = useState<NetworkMessage[]>([]);
  const [customMessage, setCustomMessage] = useState('');
  const [customMessageType, setCustomMessageType] = useState('ping');

  const onMessage = useCallback((message: NetworkMessage) => {
    console.log('Network message received:', message);
    setMessages(prev => [...prev.slice(-49), message]); // Keep last 50 messages
  }, []);

  const onConnectionChange = useCallback((state: string, error?: string) => {
    console.log('Connection state changed:', state, error);
    if (error) {
      setMessages(prev => [...prev, {
        type: 'connection_error',
        data: { error },
        timestamp: Date.now(),
      }]);
    }
  }, []);

  const onError = useCallback((error: string) => {
    console.error('Network error:', error);
    setMessages(prev => [...prev, {
      type: 'error',
      data: { error },
      timestamp: Date.now(),
    }]);
  }, []);

  const {
    networkState,
    connect,
    disconnect,
    authenticate,
    setUserInfo,
    joinSession,
    requestTableList,
    requestPlayerList,
    sendMessage,
    sendPing,
    sendSpriteUpdate,
    sendSpriteCreate,
    sendSpriteRemove,
    requestAssetUpload,
  } = useNetworkClient({
    onMessage,
    onConnectionChange,
    onError,
  });

  const handleConnect = () => {
    if (!networkState.isConnected) {
      connect(serverUrl);
    } else {
      disconnect();
    }
  };

  const handleAuthenticate = () => {
    if (username && password) {
      authenticate(username, password);
    }
  };

  const handleJoinSession = () => {
    if (sessionCode) {
      joinSession(sessionCode);
    }
  };

  const handleSendCustomMessage = () => {
    try {
      const data = customMessage ? JSON.parse(customMessage) : {};
      sendMessage(customMessageType, data);
    } catch (error) {
      console.error('Invalid JSON in custom message:', error);
    }
  };

  const handleSendTestSprite = () => {
    const testSprite = {
      sprite_id: `test_sprite_${Date.now()}`,
      layer_name: 'tokens',
      world_x: Math.random() * 800,
      world_y: Math.random() * 600,
      width: 64,
      height: 64,
      rotation: 0,
      texture_name: 'test_texture',
    };
    sendSpriteCreate(testSprite);
  };

  const clearMessages = () => {
    setMessages([]);
  };

  return (
    <div className={styles['network-panel']}>
      <h3>Network Protocol System</h3>
      
      {/* Connection Status */}
      <div className={styles['connection-status']}>
        <div className={`${styles.status} ${networkState.isConnected ? styles.connected : styles.disconnected}`}>
          Status: {networkState.connectionState}
        </div>
        <div className={styles['client-info']}>
          Client ID: {networkState.clientId || 'Not initialized'}
        </div>
        {networkState.username && (
          <div className={styles['user-info']}>
            User: {networkState.username} | Session: {networkState.sessionCode || 'None'}
          </div>
        )}
        {networkState.lastError && (
          <div className={styles.error}>
            Error: {networkState.lastError}
          </div>
        )}
      </div>

      {/* Connection Controls */}
      <div className={styles['connection-controls']}>
        <div className={styles['input-group']}>
          <label>Server URL:</label>
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            disabled={networkState.isConnected}
            placeholder="ws://localhost:8080"
          />
        </div>
        <button
          onClick={handleConnect}
          className={networkState.isConnected ? styles.disconnect : styles.connect}
        >
          {networkState.isConnected ? 'Disconnect' : 'Connect'}
        </button>
      </div>

      {/* Authentication */}
      {networkState.isConnected && (
        <div className={styles['auth-section']}>
          <h4>Authentication</h4>
          <div className={styles['input-group']}>
            <label>Username:</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
            />
          </div>
          <div className={styles['input-group']}>
            <label>Password:</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
            />
          </div>
          <button onClick={handleAuthenticate} disabled={!username || !password}>
            Authenticate
          </button>
        </div>
      )}

      {/* Session Management */}
      {networkState.isConnected && (
        <div className={styles['session-section']}>
          <h4>Session Management</h4>
          <div className={styles['input-group']}>
            <label>Session Code:</label>
            <input
              type="text"
              value={sessionCode}
              onChange={(e) => setSessionCode(e.target.value)}
              placeholder="Enter session code"
            />
          </div>
          <div className={styles['button-group']}>
            <button onClick={handleJoinSession} disabled={!sessionCode}>
              Join Session
            </button>
            <button onClick={requestTableList}>
              Request Tables
            </button>
            <button onClick={requestPlayerList}>
              Request Players
            </button>
          </div>
        </div>
      )}

      {/* Testing Tools */}
      {networkState.isConnected && (
        <div className={styles['testing-section']}>
          <h4>Testing Tools</h4>
          <div className={styles['button-group']}>
            <button onClick={sendPing}>
              Send Ping
            </button>
            <button onClick={handleSendTestSprite}>
              Send Test Sprite
            </button>
          </div>

          {/* Custom Message */}
          <div className={styles['custom-message']}>
            <div className={styles['input-group']}>
              <label>Message Type:</label>
              <select
                value={customMessageType}
                onChange={(e) => setCustomMessageType(e.target.value)}
              >
                <option value="ping">ping</option>
                <option value="table_request">table_request</option>
                <option value="sprite_update">sprite_update</option>
                <option value="player_action">player_action</option>
                <option value="custom">custom</option>
              </select>
            </div>
            <div className={styles['input-group']}>
              <label>JSON Data:</label>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder='{"key": "value"}'
                rows={3}
              />
            </div>
            <button onClick={handleSendCustomMessage}>
              Send Custom Message
            </button>
          </div>
        </div>
      )}

      {/* Message Log */}
      <div className={styles['message-log']}>
        <div className={styles['log-header']}>
          <h4>Message Log ({messages.length})</h4>
          <button onClick={clearMessages} className={styles['clear-button']}>
            Clear
          </button>
        </div>
        <div className={styles['messages']}>
          {messages.slice(-10).map((message, index) => (
            <div key={`${message.timestamp}-${index}`} className={styles.message}>
              <div className={styles['message-header']}>
                <span className={styles.type}>{message.type}</span>
                <span className={styles.timestamp}>
                  {new Date(message.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className={styles['message-data']}>
                {JSON.stringify(message.data, null, 2)}
              </div>
            </div>
          ))}
          {messages.length === 0 && (
            <div className={styles['no-messages']}>
              No messages received yet. Connect to a server to see network activity.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
