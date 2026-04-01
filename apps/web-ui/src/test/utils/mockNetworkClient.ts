export type MessageHandler = (type: string, data: any) => void;
export type ConnectionHandler = (state: string, error?: string) => void;
export type ErrorHandler = (error: string) => void;

export class MockNetworkClient {
  private messageHandler: MessageHandler | null = null;
  private connectionHandler: ConnectionHandler | null = null;
  private errorHandler: ErrorHandler | null = null;
  private clientId = 'test-client-' + Math.random().toString(36).substr(2, 9);

  set_message_handler(handler: MessageHandler) {
    this.messageHandler = handler;
  }

  set_connection_handler(handler: ConnectionHandler) {
    this.connectionHandler = handler;
  }

  set_error_handler(handler: ErrorHandler) {
    this.errorHandler = handler;
  }

  get_client_id() {
    return this.clientId;
  }

  connect(_url: string) {
    // Simulate async connection success (deterministic: microtask)
    setTimeout(() => {
      if (this.connectionHandler) this.connectionHandler('connected');
    }, 10);
    return Promise.resolve({ connected: true });
  }

  disconnect() {
    if (this.connectionHandler) this.connectionHandler('disconnected');
  }

  __simulate_incoming(type: string, data: any) {
    if (this.messageHandler) this.messageHandler(type, data);
  }

  __simulate_error(error: string) {
    if (this.errorHandler) this.errorHandler(error);
    if (this.connectionHandler) this.connectionHandler('error', error);
  }

  send_message(_type: string, _data: any) {
    return Promise.resolve();
  }

  // lightweight optional API stubs used by UI
  authenticate(_username: string, _password: string) { return Promise.resolve(true); }
  set_user_info(_userId: number, _username: string, _sessionCode?: string, _jwt?: string) { /* noop */ }
  join_session(_code: string) { /* noop */ }
  request_table_list() { /* noop */ }
  request_player_list() { /* noop */ }
  send_sprite_update(_data: any) { return Promise.resolve(); }
  send_sprite_create(_data: any) { return Promise.resolve(); }
  send_sprite_remove(_id: string) { return Promise.resolve(); }
  send_table_update(_data: any) { return Promise.resolve(); }
  send_ping() { return Promise.resolve(); }
  request_asset_upload(_filename: string, _hash: string, _size: bigint) { return Promise.resolve(); }
  request_asset_download(_id: string) { return Promise.resolve(); }
  confirm_asset_upload(_id: string, _ok: boolean) { return Promise.resolve(); }

  free() { /* noop for mock cleanup */ }
}

export function createMockNetworkClient() {
  return new MockNetworkClient();
}
