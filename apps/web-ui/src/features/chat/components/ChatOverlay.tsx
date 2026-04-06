import { config } from '@shared/config/appConfig';
import { Settings, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth';
import { useChatStore } from '../chatStore';
import { useChatWebSocket } from '../hooks/useChatWebSocket';
import styles from './ChatOverlay.module.css';

const STORAGE_KEY = 'chat-overlay-settings';

interface OverlaySettings {
  msgCount: number;
  timeout: number; // seconds, 0 = never fade
  visible: boolean;
}

function loadSettings(): OverlaySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { msgCount: 5, timeout: 8, visible: true, ...JSON.parse(raw) };
  } catch {}
  return { msgCount: 5, timeout: 8, visible: true };
}

export function ChatOverlay() {
  const { user } = useAuth();
  const { messages } = useChatStore();
  const { sendMessage } = useChatWebSocket(config.getWebSocketUrl(), user?.username || 'Guest');

  const [settings, setSettings] = useState<OverlaySettings>(loadSettings);
  const [focused, setFocused] = useState(false);
  const [input, setInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [, setTick] = useState(0); // forces re-render for message expiry

  // Track when each message was first seen
  const receivedAt = useRef<Map<string, number>>(new Map());
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Register arrival time for new messages
  useEffect(() => {
    const now = Date.now();
    for (const msg of messages) {
      if (!receivedAt.current.has(msg.id)) {
        receivedAt.current.set(msg.id, now);
      }
    }
  }, [messages]);

  // Tick every second for fade-out when unfocused
  useEffect(() => {
    if (!settings.visible || settings.timeout === 0 || focused) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [settings.visible, settings.timeout, focused]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function saveSettings(next: OverlaySettings) {
    setSettings(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    sendMessage(text);
    setInput('');
  }

  if (!settings.visible) {
    return (
      <button
        className={styles.showBtn}
        onClick={() => saveSettings({ ...settings, visible: true })}
        title="Show chat"
      >
        💬
      </button>
    );
  }

  const now = Date.now();
  const last = messages.slice(-settings.msgCount);
  const visibleMsgs = focused
    ? last
    : last.filter(m => {
        if (settings.timeout === 0) return true;
        const t = receivedAt.current.get(m.id) ?? m.timestamp;
        return now - t < settings.timeout * 1000;
      });

  return (
    <div className={styles.overlay} onMouseEnter={() => setFocused(true)} onMouseLeave={() => { setFocused(false); setShowSettings(false); }}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.headerTitle}>💬 Chat</span>
        <div className={styles.headerActions}>
          <button
            className={styles.iconBtn}
            onClick={() => setShowSettings(s => !s)}
            title="Settings"
          >
            <Settings size={13} />
          </button>
          <button
            className={styles.iconBtn}
            onClick={() => saveSettings({ ...settings, visible: false })}
            title="Hide chat"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className={styles.settingsPanel}>
          <label>
            Messages: {settings.msgCount}
            <input
              type="range" min={3} max={10} value={settings.msgCount}
              onChange={e => saveSettings({ ...settings, msgCount: +e.target.value })}
            />
          </label>
          <label>
            Fade after: {settings.timeout === 0 ? 'never' : `${settings.timeout}s`}
            <input
              type="range" min={0} max={15} value={settings.timeout}
              onChange={e => saveSettings({ ...settings, timeout: +e.target.value })}
            />
          </label>
        </div>
      )}

      {/* Messages */}
      <div className={styles.messages} ref={scrollRef}>
        {visibleMsgs.map(msg => (
          <div key={msg.id} className={styles.message}>
            <span className={styles.msgUser}>{msg.user}</span>
            <span className={styles.msgText}>{msg.text}</span>
          </div>
        ))}
        {visibleMsgs.length === 0 && focused && (
          <div className={styles.empty}>No recent messages</div>
        )}
      </div>

      {/* Input — only when focused */}
      {focused && (
        <form onSubmit={handleSend} className={styles.inputRow}>
          <input
            ref={inputRef}
            className={styles.input}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Say something…"
            maxLength={500}
            autoComplete="off"
          />
          <button type="submit" className={styles.sendBtn}>Send</button>
        </form>
      )}
    </div>
  );
}
