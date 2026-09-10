import { expect, test } from 'vitest';

test('imports and validates messages under the server script CSP', async () => {
  const frame = document.createElement('iframe');
  frame.hidden = true;
  let receive: (event: MessageEvent) => void = () => {};
  const result = new Promise<unknown>((resolve) => {
    receive = (event) => {
      if (event.source === frame.contentWindow && event.data?.kind === 'protocol-csp-result') {
        resolve(event.data);
      }
    };
    window.addEventListener('message', receive);
  });
  frame.srcdoc = `<!doctype html>
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'">
    <script type="module">
      const result = { kind: 'protocol-csp-result', evalBlocked: false, valid: false, invalidRejected: false };
      try {
        try { new Function('return 1')(); } catch (error) { result.evalBlocked = error.name === 'EvalError'; }
        const { parseMessage } = await import('/src/lib/websocket/message.ts');
        result.valid = parseMessage('{"type":"ping"}').type === 'ping';
        try { parseMessage('{"type":"not_registered"}'); }
        catch (error) { result.invalidRejected = error.message.startsWith('Invalid message:'); }
      } catch (error) { result.error = String(error); }
      parent.postMessage(result, ${JSON.stringify(window.location.origin)});
    </script>`;
  document.body.append(frame);
  try {
    expect(await result).toEqual({
      kind: 'protocol-csp-result', evalBlocked: true, valid: true, invalidRejected: true,
    });
  } finally {
    window.removeEventListener('message', receive);
    frame.remove();
  }
}, 15_000);
