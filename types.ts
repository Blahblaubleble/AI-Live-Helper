
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
  estimatedTime?: number; // Estimated time in minutes
  createdAt: string; // ISO String
  subtasks?: Task[]; // Nested tasks
}

export interface SchoolNote {
  id: string;
  title: string;
  subject: string;
  content: string;
  createdAt: string; // ISO String
}

export interface Assignment {
  id: string;
  title: string;
  subject: string;
  dueDate: string; // ISO String
  status: 'To Do' | 'In Progress' | 'Done';
  priority: 'Low' | 'Medium' | 'High';
  details?: string;
  createdAt: string; // ISO String
}

export interface CalendarEvent {
  id: string;
  title: string;
  startDate: string; // ISO String
  endDate: string; // ISO String
  description?: string;
  location?: string;
  type: 'event' | 'task' | 'assignment'; // To distinguish source
  referenceId?: string; // ID of the task or assignment if applicable
  color?: string;
}

export interface Routine {
  id: string;
  title: string;
  frequency: 'Daily' | 'Weekly' | 'Monthly';
  startTime: string; // e.g., "08:00"
  endTime: string; // e.g., "09:00"
  daysOfWeek?: number[]; // 0-6 for Weekly
  showInCalendar?: boolean;
  createdAt: string; // ISO String
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