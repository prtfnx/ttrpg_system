/**
 * Real-Time Multiplayer and Network System Behavior Tests
 * Tests WebSocket connections, session management, real-time synchronization
 * Focus: Real expected behavior for multiplayer TTRPG sessions
 */
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Import actual components
import { ProtocolContext } from '../services/ProtocolContext';
import { EnhancedLogin } from '../components/EnhancedLogin';

describe('Real-Time Multiplayer System - Session Management', () => {
  const mockWebSocketURL = 'wss://ttrpg-server.example.com/ws';
  
  describe('WebSocket Connection and Authentication', () => {
    it('should establish secure WebSocket connection with proper authentication', async () => {
      const user = userEvent.setup();
      
      // Mock WebSocket connection establishment
      const mockWebSocket = {
        readyState: WebSocket.CONNECTING,
        url: mockWebSocketURL,
        close: () => {},
        send: (data: string) => {},
        addEventListener: (event: string, handler: Function) => {}
      };
      
      render(
        <ProtocolContext.Provider value={{ 
          socket: mockWebSocket,
          isConnected: false,
          connectionState: 'connecting'
        }}>
          <EnhancedLogin />
        </ProtocolContext.Provider>
      );
      
      // User enters credentials
      const usernameInput = screen.getByLabelText(/username/i);
      const passwordInput = screen.getByLabelText(/password/i);
      
      await user.type(usernameInput, 'dm_mike');
      await user.type(passwordInput, 'secure_password_123');
      
      const loginButton = screen.getByRole('button', { name: /log in/i });
      await user.click(loginButton);
      
      // Authentication should be sent over WebSocket
      expect(screen.getByText(/connecting to server/i)).toBeInTheDocument();
      
      // Simulate successful authentication
      mockWebSocket.readyState = WebSocket.OPEN;
      
      await waitFor(() => {
        expect(screen.getByText(/connected successfully/i)).toBeInTheDocument();
      });
      
      // User info should be received
      expect(screen.getByTestId('user-role')).toHaveTextContent('DM');
      expect(screen.getByTestId('session-token')).toBeTruthy();
    });

    it('should handle connection failures with proper retry mechanism', async () => {
      const user = userEvent.setup();
      
      const mockFailingWebSocket = {
        readyState: WebSocket.CLOSED,
        url: mockWebSocketURL,
        close: () => {},
        send: () => { throw new Error('Connection failed'); },
        addEventListener: (event: string, handler: Function) => {
          if (event === 'error') {
            setTimeout(() => handler(new Event('error')), 100);
          }
        }
      };
      
      render(
        <ProtocolContext.Provider value={{ 
          socket: mockFailingWebSocket,
          isConnected: false,
          connectionState: 'error',
          retryAttempts: 0,
          maxRetries: 3
        }}>
          <EnhancedLogin />
        </ProtocolContext.Provider>
      );
      
      // Should show connection error
      await waitFor(() => {
        expect(screen.getByText(/connection failed/i)).toBeInTheDocument();
      });
      
      // Should show retry button
      const retryButton = screen.getByRole('button', { name: /retry connection/i });
      expect(retryButton).toBeInTheDocument();
      
      await user.click(retryButton);
      
      // Should attempt reconnection
      expect(screen.getByText(/retrying connection \(attempt 1 of 3\)/i)).toBeInTheDocument();
      
      // After max retries, should show offline mode option
      await waitFor(() => {
        expect(screen.getByText(/unable to connect after 3 attempts/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /continue offline/i })).toBeInTheDocument();
      });
    });

    it('should maintain connection heartbeat and detect disconnections', async () => {
      let heartbeatInterval: NodeJS.Timeout;
      let lastHeartbeat = Date.now();
      
      const mockWebSocket = {
        readyState: WebSocket.OPEN,
        url: mockWebSocketURL,
        close: () => {},
        send: (data: string) => {
          const message = JSON.parse(data);
          if (message.type === 'heartbeat') {
            lastHeartbeat = Date.now();
          }
        },
        addEventListener: (event: string, handler: Function) => {}
      };
      
      render(
        <ProtocolContext.Provider value={{ 
          socket: mockWebSocket,
          isConnected: true,
          connectionState: 'connected',
          lastHeartbeat: lastHeartbeat
        }}>
          <div data-testid="connection-status">Connected</div>
        </ProtocolContext.Provider>
      );
      
      // Should send heartbeat every 30 seconds
      expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');
      
      // Simulate heartbeat timeout (no response in 60 seconds)
      const sixtySecondsAgo = Date.now() - 61000;
      lastHeartbeat = sixtySecondsAgo;
      
      // Should detect connection loss
      await waitFor(() => {
        expect(screen.getByText(/connection lost/i)).toBeInTheDocument();
        expect(screen.getByText(/attempting to reconnect/i)).toBeInTheDocument();
      });
      
      clearInterval(heartbeatInterval);
    });
  });

  describe('Session Management and Room Joining', () => {
    it('should allow DM to create and configure game session', async () => {
      const user = userEvent.setup();
      
      const mockDMSocket = {
        readyState: WebSocket.OPEN,
        send: (data: string) => {
          const message = JSON.parse(data);
          expect(message.type).toBe('create_session');
        }
      };
      
      render(
        <ProtocolContext.Provider value={{ 
          socket: mockDMSocket,
          isConnected: true,
          userInfo: { role: 'dm', username: 'DM Mike', id: 'dm1' }
        }}>
          <div data-testid="session-management">
            <button>Create New Session</button>
          </div>
        </ProtocolContext.Provider>
      );
      
      const createSessionButton = screen.getByRole('button', { name: /create new session/i });
      await user.click(createSessionButton);
      
      // Session configuration form
      expect(screen.getByText(/session configuration/i)).toBeInTheDocument();
      
      const sessionName = screen.getByLabelText(/session name/i);
      await user.type(sessionName, 'Dragons of Autumn Twilight');
      
      const maxPlayers = screen.getByLabelText(/maximum players/i);
      await user.clear(maxPlayers);
      await user.type(maxPlayers, '6');
      
      const passwordProtected = screen.getByLabelText(/password protected/i);
      await user.click(passwordProtected);
      
      const sessionPassword = screen.getByLabelText(/session password/i);
      await user.type(sessionPassword, 'dragonlance123');
      
      const createButton = screen.getByRole('button', { name: /create session/i });
      await user.click(createButton);
      
      // Session should be created and session code generated
      await waitFor(() => {
        expect(screen.getByText(/session created successfully/i)).toBeInTheDocument();
        expect(screen.getByTestId('session-code')).toHaveTextContent(/[A-Z0-9]{6}/); // 6-character code
        expect(screen.getByText(/share this code with your players/i)).toBeInTheDocument();
      });
    });

    it('should allow players to join session with proper validation', async () => {
      const user = userEvent.setup();
      
      const mockPlayerSocket = {
        readyState: WebSocket.OPEN,
        send: (data: string) => {
          const message = JSON.parse(data);
          if (message.type === 'join_session') {
            expect(message.sessionCode).toBe('ABC123');
            expect(message.password).toBe('dragonlance123');
          }
        }
      };
      
      render(
        <ProtocolContext.Provider value={{ 
          socket: mockPlayerSocket,
          isConnected: true,
          userInfo: { role: 'player', username: 'Alice', id: 'player1' }
        }}>
          <div data-testid="join-session">
            <input aria-label="Session Code" />
            <input aria-label="Session Password" />
            <button>Join Session</button>
          </div>
        </ProtocolContext.Provider>
      );
      
      // Enter session code
      const sessionCodeInput = screen.getByLabelText(/session code/i);
      await user.type(sessionCodeInput, 'ABC123');
      
      // Enter session password
      const passwordInput = screen.getByLabelText(/session password/i);
      await user.type(passwordInput, 'dragonlance123');
      
      const joinButton = screen.getByRole('button', { name: /join session/i });
      await user.click(joinButton);
      
      // Should validate and join session
      await waitFor(() => {
        expect(screen.getByText(/joining session/i)).toBeInTheDocument();
      });
      
      // Simulate successful join
      await waitFor(() => {
        expect(screen.getByText(/joined dragons of autumn twilight/i)).toBeInTheDocument();
        expect(screen.getByTestId('player-count')).toHaveTextContent('1 of 6 players');
      });
    });

    it('should handle session full and invalid code scenarios', async () => {
      const user = userEvent.setup();
      
      const mockSocket = {
        readyState: WebSocket.OPEN,
        send: (data: string) => {
          const message = JSON.parse(data);
          if (message.sessionCode === 'FULL01') {
            // Simulate session full response
            setTimeout(() => {
              const event = new MessageEvent('message', {
                data: JSON.stringify({
                  type: 'join_error',
                  error: 'Session is full'
                })
              });
              window.dispatchEvent(event);
            }, 100);
          }
        }
      };
      
      render(
        <ProtocolContext.Provider value={{ socket: mockSocket, isConnected: true }}>
          <div data-testid="join-session">
            <input aria-label="Session Code" />
            <button>Join Session</button>
          </div>
        </ProtocolContext.Provider>
      );
      
      // Try to join full session
      await user.type(screen.getByLabelText(/session code/i), 'FULL01');
      await user.click(screen.getByRole('button', { name: /join session/i }));
      
      await waitFor(() => {
        expect(screen.getByText(/session is full/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /try different session/i })).toBeInTheDocument();
      });
      
      // Try invalid session code
      await user.clear(screen.getByLabelText(/session code/i));
      await user.type(screen.getByLabelText(/session code/i), 'INVALID');
      await user.click(screen.getByRole('button', { name: /join session/i }));
      
      await waitFor(() => {
        expect(screen.getByText(/session not found/i)).toBeInTheDocument();
      });
    });
  });

  describe('Real-Time Synchronization', () => {
    it('should synchronize token movements across all connected clients', async () => {
      const user = userEvent.setup();
      
      let broadcastedUpdates: any[] = [];
      
      const mockSocket = {
        readyState: WebSocket.OPEN,
        send: (data: string) => {
          const message = JSON.parse(data);
          if (message.type === 'token_move') {
            broadcastedUpdates.push(message);
          }
        }
      };
      
      render(
        <ProtocolContext.Provider value={{ socket: mockSocket, isConnected: true }}>
          <div data-testid="game-map">
            <div data-testid="token-wizard" draggable style={{ position: 'absolute', left: 100, top: 100 }}>
              Wizard
            </div>
          </div>
        </ProtocolContext.Provider>
      );
      
      // Simulate token drag
      const wizardToken = screen.getByTestId('token-wizard');
      
      // Start drag
      const dragStartEvent = new DragEvent('dragstart', { clientX: 100, clientY: 100 });
      wizardToken.dispatchEvent(dragStartEvent);
      
      // End drag at new position
      const dropEvent = new DragEvent('drop', { clientX: 200, clientY: 150 });
      wizardToken.dispatchEvent(dropEvent);
      
      // Should broadcast token movement
      await waitFor(() => {
        expect(broadcastedUpdates).toHaveLength(1);
        expect(broadcastedUpdates[0]).toMatchObject({
          type: 'token_move',
          tokenId: 'wizard',
          position: { x: 200, y: 150 },
          timestamp: expect.any(Number)
        });
      });
      
      // Simulate receiving update from another client
      const incomingUpdate = new MessageEvent('message', {
        data: JSON.stringify({
          type: 'token_move',
          tokenId: 'dragon',
          position: { x: 300, y: 250 },
          playerId: 'dm1'
        })
      });
      
      window.dispatchEvent(incomingUpdate);
      
      // Dragon token should appear at new position
      await waitFor(() => {
        const dragonToken = screen.getByTestId('token-dragon');
        expect(dragonToken).toHaveStyle('left: 300px; top: 250px');
      });
    });

    it('should handle conflict resolution for simultaneous edits', async () => {
      const user = userEvent.setup();
      
      const mockSocket = {
        readyState: WebSocket.OPEN,
        send: (data: string) => {
          const message = JSON.parse(data);
          if (message.type === 'character_update') {
            // Simulate conflict - another user edited same character
            setTimeout(() => {
              const conflictEvent = new MessageEvent('message', {
                data: JSON.stringify({
                  type: 'edit_conflict',
                  entityId: message.characterId,
                  conflictingUser: 'Alice',
                  lastModified: Date.now() - 1000 // Their edit was 1 second ago
                })
              });
              window.dispatchEvent(conflictEvent);
            }, 50);
          }
        }
      };
      
      render(
        <ProtocolContext.Provider value={{ socket: mockSocket, isConnected: true }}>
          <div data-testid="character-sheet">
            <input aria-label="Character Name" defaultValue="Thorin" />
            <input aria-label="Hit Points" defaultValue="45" />
            <button>Save Changes</button>
          </div>
        </ProtocolContext.Provider>
      );
      
      // User edits character
      const hpInput = screen.getByLabelText(/hit points/i);
      await user.clear(hpInput);
      await user.type(hpInput, '38');
      
      const saveButton = screen.getByRole('button', { name: /save changes/i });
      await user.click(saveButton);
      
      // Conflict resolution dialog should appear
      await waitFor(() => {
        expect(screen.getByText(/edit conflict detected/i)).toBeInTheDocument();
        expect(screen.getByText(/alice modified this character/i)).toBeInTheDocument();
      });
      
      // User can choose to merge or overwrite
      const mergeButton = screen.getByRole('button', { name: /merge changes/i });
      const overwriteButton = screen.getByRole('button', { name: /overwrite/i });
      
      expect(mergeButton).toBeInTheDocument();
      expect(overwriteButton).toBeInTheDocument();
      
      await user.click(mergeButton);
      
      // Should show merge interface
      expect(screen.getByText(/review merged changes/i)).toBeInTheDocument();
    });

    it('should maintain session state consistency with lag compensation', async () => {
      let networkDelay = 100; // 100ms simulated network delay
      let receivedMessages: any[] = [];
      
      const mockSocket = {
        readyState: WebSocket.OPEN,
        send: (data: string) => {
          // Simulate network delay
          setTimeout(() => {
            const message = JSON.parse(data);
            receivedMessages.push({
              ...message,
              serverTimestamp: Date.now(),
              clientTimestamp: message.timestamp
            });
          }, networkDelay);
        }
      };
      
      render(
        <ProtocolContext.Provider value={{ 
          socket: mockSocket, 
          isConnected: true,
          networkLatency: networkDelay 
        }}>
          <div data-testid="dice-roller">
            <button>Roll d20</button>
            <div data-testid="roll-result">-</div>
            <div data-testid="roll-timestamp">-</div>
          </div>
        </ProtocolContext.Provider>
      );
      
      const user = userEvent.setup();
      const rollButton = screen.getByRole('button', { name: /roll d20/i });
      
      const rollTime = Date.now();
      await user.click(rollButton);
      
      // Should show immediate local result with timestamp
      await waitFor(() => {
        const result = screen.getByTestId('roll-result');
        expect(result).toHaveTextContent(/\d+/); // Some number 1-20
        
        const timestamp = screen.getByTestId('roll-timestamp');
        expect(timestamp).toHaveTextContent(rollTime.toString().substring(0, 10)); // Approx time
      });
      
      // After network delay, should confirm with server
      await waitFor(() => {
        expect(receivedMessages).toHaveLength(1);
        
        const serverMessage = receivedMessages[0];
        const timeDifference = serverMessage.serverTimestamp - serverMessage.clientTimestamp;
        
        // Server timestamp should account for network delay
        expect(timeDifference).toBeGreaterThanOrEqual(networkDelay - 10); // Allow 10ms tolerance
        expect(timeDifference).toBeLessThanOrEqual(networkDelay + 50); // Network jitter
      });
    });
  });

  describe('Session Persistence and Recovery', () => {
    it('should save and restore session state after disconnection', async () => {
      const user = userEvent.setup();
      
      // Initial connected state with game data
      const initialGameState = {
        characters: [{ id: 'char1', name: 'Thorin', hp: 45 }],
        mapTokens: [{ id: 'token1', position: { x: 100, y: 100 } }],
        currentTurn: 'char1',
        round: 3
      };
      
      let savedState: any = null;
      
      const mockSocket = {
        readyState: WebSocket.OPEN,
        send: (data: string) => {
          const message = JSON.parse(data);
          if (message.type === 'save_state') {
            savedState = message.gameState;
          }
        }
      };
      
      render(
        <ProtocolContext.Provider value={{ 
          socket: mockSocket,
          isConnected: true,
          gameState: initialGameState,
          autoSave: true
        }}>
          <div data-testid="game-session">
            <div>Round: {initialGameState.round}</div>
            <div>Current Turn: {initialGameState.currentTurn}</div>
            <button>End Turn</button>
          </div>
        </ProtocolContext.Provider>
      );
      
      // Make game state change
      const endTurnButton = screen.getByRole('button', { name: /end turn/i });
      await user.click(endTurnButton);
      
      // Should auto-save state changes
      await waitFor(() => {
        expect(savedState).toBeTruthy();
        expect(savedState.round).toBe(3);
        expect(savedState.currentTurn).toBe('char1');
      });
      
      // Simulate disconnection
      mockSocket.readyState = WebSocket.CLOSED;
      
      // Should show disconnection notice
      await waitFor(() => {
        expect(screen.getByText(/connection lost/i)).toBeInTheDocument();
        expect(screen.getByText(/game state saved locally/i)).toBeInTheDocument();
      });
      
      // Simulate reconnection
      mockSocket.readyState = WebSocket.OPEN;
      
      // Should offer to restore state
      await waitFor(() => {
        expect(screen.getByText(/reconnected successfully/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /restore session state/i })).toBeInTheDocument();
      });
      
      const restoreButton = screen.getByRole('button', { name: /restore session state/i });
      await user.click(restoreButton);
      
      // Game should resume from saved state
      await waitFor(() => {
        expect(screen.getByText(/session restored/i)).toBeInTheDocument();
        expect(screen.getByText(/round: 3/i)).toBeInTheDocument();
      });
    });
  });
});