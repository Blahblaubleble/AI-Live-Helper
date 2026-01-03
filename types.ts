export enum ConnectionState {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

export interface AudioVisualizerData {
  volume: number; // 0.0 to 1.0
  isSpeaking: boolean;
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  sender: 'user' | 'ai' | 'system';
  message: string;
  isFinal?: boolean;
  responseTime?: number;
}

export interface UsageStats {
  imagesSent: number;
  modelTurns: number;
  estimatedTokens: number;
  tokensPerMinute: number;
}