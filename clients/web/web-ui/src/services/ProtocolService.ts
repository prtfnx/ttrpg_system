/**
 * Protocol Service - Singleton WebSocket protocol manager
 * Implements singleton pattern from architecture document
 */

import { WebClientProtocol } from '../protocol/clientProtocol';

export class ProtocolService {
  private static instance: WebClientProtocol | null = null;
  
  static setProtocol(protocol: WebClientProtocol): void {
    this.instance = protocol;
  }
  
  static getProtocol(): WebClientProtocol {
    if (!this.instance) throw new Error('Protocol not initialized');
    return this.instance;
  }
  
  static clearProtocol(): void {
    this.instance = null;
  }
  
  static hasProtocol(): boolean {
    return this.instance !== null;
  }
}
