import { expect, test } from 'vitest';
import { createMessage, MessageType } from './message';
import { OperationRecoveryJournal } from './operationRecovery';

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
      const result = { kind: 'protocol-csp-result', evalBlocked: false, valid: false, invalidRejected: false, wallIdentityRejected: false, tableIdentityRejected: false };
      try {
        try { new Function('return 1')(); } catch (error) { result.evalBlocked = error.name === 'EvalError'; }
        const { parseMessage } = await import('/src/lib/websocket/message.ts');
        result.valid = parseMessage('{"type":"ping"}').type === 'ping';
        try { parseMessage('{"type":"not_registered"}'); }
        catch (error) { result.invalidRejected = error.message.startsWith('Invalid message:'); }
        try { parseMessage(JSON.stringify({ type: 'door_toggle', data: { table_id: 'table', wall_id: 'wall' } })); }
        catch (error) { result.wallIdentityRejected = error.message.startsWith('Invalid message:'); }
        try { parseMessage(JSON.stringify({ type: 'table_move', data: { table_id: 'table', x_moved: 1, y_moved: 2 } })); }
        catch (error) { result.tableIdentityRejected = error.message.startsWith('Invalid message:'); }
      } catch (error) { result.error = String(error); }
      parent.postMessage(result, ${JSON.stringify(window.location.origin)});
    </script>`;
  document.body.append(frame);
  try {
    expect(await result).toEqual({
      kind: 'protocol-csp-result', evalBlocked: true, valid: true, invalidRejected: true, wallIdentityRejected: true, tableIdentityRejected: true,
    });
  } finally {
    window.removeEventListener('message', receive);
    frame.remove();
  }
}, 15_000);

test('reconstructs exact request identity from native tab storage', () => {
  const scope = { actorId: 1, sessionCode: `BROWSER-${crypto.randomUUID()}`,
    sessionInstance: '1:created', domains: ['xp_award'] };
  const first = new OperationRecoveryJournal(scope);
  const original = createMessage(MessageType.XP_AWARD, { character_id: 'hero', amount: 100 });
  try {
    first.capture(original);
    const reconstructed = new OperationRecoveryJournal(scope);
    expect(reconstructed.entries()[0]?.message).toEqual(original);
    reconstructed.complete(original.message_id!);
    expect(first.entries()).toEqual([]);
  } finally { first.discardAll(); }
});

test.each([
  [MessageType.CHARACTER_UPDATE, { character_id: 'hero', updates: { name: 'Saved' }, version: 3 }, 'character_update'],
  [MessageType.MULTICLASS_REQUEST, { character_id: 'hero', new_class: 'rogue', version: 3 }, 'character_multiclass'],
  [MessageType.ENCOUNTER_ROLL, { encounter_id: 'original', choice_id: 'door', bonus: 2 }, 'choice_encounter'],
])('retains extended %s original bodies in native tab storage', (type, data, domain) => {
  const scope = { actorId: 1, sessionCode: `BROWSER-${crypto.randomUUID()}`,
    sessionInstance: '1:created', domains: [domain as string] };
  const first = new OperationRecoveryJournal(scope);
  const original = createMessage(type as MessageType, data as Record<string, unknown>);
  try {
    first.capture(original);
    expect(new OperationRecoveryJournal(scope).entries()[0]?.message).toEqual(original);
  } finally { first.discardAll(); }
});
