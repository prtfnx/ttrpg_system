/**
 * Configuration utility for the TTRPG client
 */

interface AppConfig {
  webSocketUrl: string;
  apiBaseUrl: string;
  isDevelopment: boolean;
}

class ConfigManager {
  private static instance: ConfigManager;
  private config: AppConfig;

  private constructor() {
    this.config = this.loadConfig();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfig(): AppConfig {
    // Get base URL from current location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = import.meta.env.VITE_WS_PORT || '8000';
    
    // Check if we're in development mode
    const isDevelopment = import.meta.env.DEV;
    
    // For development, use localhost if not overridden
    const wsHost = isDevelopment && !import.meta.env.VITE_WS_HOST ? 'localhost' : host;
    
    const config: AppConfig = {
      webSocketUrl: import.meta.env.VITE_WS_URL || `${protocol}//${wsHost}:${port}/ws`,
      apiBaseUrl: import.meta.env.VITE_API_BASE_URL || `${window.location.protocol}//${host}:${port}`,
      isDevelopment
    };

    console.log('Loaded config:', config);
    return config;
  }

  public getWebSocketUrl(): string {
    return this.config.webSocketUrl;
  }

  public getApiBaseUrl(): string {
    return this.config.apiBaseUrl;
  }

  public isDev(): boolean {
    return this.config.isDevelopment;
  }
}

export const config = ConfigManager.getInstance();