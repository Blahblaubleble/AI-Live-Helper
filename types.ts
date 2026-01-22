
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

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: 'Low' | 'Medium' | 'High';
  dueDate: string; // ISO String
  createdAt: string; // ISO String
  subtasks?: Task[]; // Nested tasks
}

export interface Project {
  id: string;
  name: string;
  createdAt: string; // ISO String
  logs: LogEntry[];
  tasks: Task[];
  lastActive: string; // ISO String
}

export interface UsageStats {
  imagesSent: number;
  modelTurns: number;
  estimatedTokens: number;
  tokensPerMinute: number;
}

export interface User {
  username: string;
  lastLogin: Date;
}