import { MessageType, type Message, type WebClientProtocol } from '@lib/websocket';

/** Observe a correlated durable acknowledgement. Never retry an uncertain write. */
export function sendConfirmedSpriteCommand(
  protocol: WebClientProtocol, message: Message, signal: AbortSignal,
  cancelled = 'Sprite edit cancelled.',
): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error(cancelled));
  if (!protocol.isConnected()) return Promise.reject(new Error('Connect to the session before saving.'));
  return new Promise<void>((resolve, reject) => {
    const types = [MessageType.SPRITE_RESPONSE, MessageType.SUCCESS, MessageType.ERROR];
    const cleanup = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      types.forEach(type => protocol.unregisterHandler(type, receive));
    };
    const abort = () => { cleanup(); reject(new Error(cancelled)); };
    const receive = (reply: Message) => {
      if (reply.correlation_id !== message.message_id) return;
      cleanup();
      if (reply.type === MessageType.ERROR || reply.data?.success === false) {
        reject(new Error(String(reply.data?.error ?? 'Sprite save rejected.')));
      } else resolve();
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Save confirmation timed out. Check the saved table before retrying.'));
    }, 15_000);
    signal.addEventListener('abort', abort, { once: true });
    try {
      types.forEach(type => protocol.registerHandler(type, receive));
      if (signal.aborted) { abort(); return; }
      protocol.sendMessage(message);
    } catch (error) { cleanup(); reject(error); }
  });
}
