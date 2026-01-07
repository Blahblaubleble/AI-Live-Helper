import { Project } from '../types';
import { createClient } from '@supabase/supabase-js';

/**
 * DATABASE ABSTRACTION LAYER
 * 
 * Currently, this uses the browser's LocalStorage to simulate a database.
 * To use a REAL database (like Firebase, Supabase, or MongoDB):
 * 
 * 1. Create a new class that implements this 'Database' interface.
 * 2. Replace the 'db' export at the bottom with your new class.
 */

export interface Database {
  // User Management
  userExists(username: string): Promise<boolean>;
  createUser(username: string, passwordHash: string): Promise<boolean>;
  verifyUser(username: string, passwordHash: string): Promise<boolean>;
  
  // Data Management
  getProjects(username: string): Promise<Project[]>;
  saveProjects(username: string, projects: Project[]): Promise<void>;
  
  // Stats
  getDailyStats(username: string): Promise<number>;
  incrementDailyStats(username: string): Promise<number>;
  
  // System
  exportData(username: string): Promise<string>; // Changed to Promise
  importData(jsonString: string): Promise<{ success: boolean; count: number; message?: string }>;
}

const PREFIX = 'screenSentinel_';
const AUTH_PREFIX = 'auth_user_';

export const LocalStorageDB: Database = {
  
  async userExists(username: string): Promise<boolean> {
    return !!localStorage.getItem(`${AUTH_PREFIX}${username.toLowerCase()}`);
  },

  async createUser(username: string, passwordHash: string): Promise<boolean> {
    const key = `${AUTH_PREFIX}${username.toLowerCase()}`;
    if (localStorage.getItem(key)) return false; // Already exists
    
    const userData = { passwordHash };
    localStorage.setItem(key, JSON.stringify(userData));
    return true;
  },

  async verifyUser(username: string, passwordHash: string): Promise<boolean> {
    const key = `${AUTH_PREFIX}${username.toLowerCase()}`;
    const stored = localStorage.getItem(key);
    if (!stored) return false;
    
    try {
      const userData = JSON.parse(stored);
      return userData.passwordHash === passwordHash;
    } catch (e) {
      return false;
    }
  },

  async getProjects(username: string): Promise<Project[]> {
    const key = `${PREFIX}projects_${username}`;
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    
    try {
      const parsed = JSON.parse(stored);
      // Re-hydrate Date objects and ensure tasks exist
      return parsed.map((p: any) => ({
        ...p,
        logs: p.logs.map((l: any) => ({ ...l, timestamp: new Date(l.timestamp) })),
        tasks: p.tasks || []
      }));
    } catch (e) {
      console.error("DB Corrupt:", e);
      return [];
    }
  },

  async saveProjects(username: string, projects: Project[]): Promise<void> {
    const key = `${PREFIX}projects_${username}`;
    localStorage.setItem(key, JSON.stringify(projects));
  },

  async getDailyStats(username: string): Promise<number> {
    const today = new Date().toDateString();
    const key = `${PREFIX}dailyStats_${username}`;
    const stored = localStorage.getItem(key);
    
    if (stored) {
      const { date, count } = JSON.parse(stored);
      if (date === today) return count;
    }
    
    // Reset if new day or not found
    localStorage.setItem(key, JSON.stringify({ date: today, count: 0 }));
    return 0;
  },

  async incrementDailyStats(username: string): Promise<number> {
    const today = new Date().toDateString();
    const key = `${PREFIX}dailyStats_${username}`;
    let count = 0;
    
    const stored = localStorage.getItem(key);
    if (stored) {
      const data = JSON.parse(stored);
      if (data.date === today) {
        count = data.count;
      }
    }
    
    count++;
    localStorage.setItem(key, JSON.stringify({ date: today, count }));
    return count;
  },

  async exportData(username: string): Promise<string> {
    const exportPayload: Record<string, string | null> = {};
    
    // 1. Projects
    exportPayload[`${PREFIX}projects_${username}`] = localStorage.getItem(`${PREFIX}projects_${username}`);
    
    // 2. Auth Record
    const authKey = `${AUTH_PREFIX}${username.toLowerCase()}`;
    exportPayload[authKey] = localStorage.getItem(authKey);
    
    // 3. Stats
    const statsKey = `${PREFIX}dailyStats_${username}`;
    exportPayload[statsKey] = localStorage.getItem(statsKey);

    return JSON.stringify(exportPayload, null, 2);
  },

  async importData(jsonString: string): Promise<{ success: boolean; count: number; message?: string }> {
    try {
      const data = JSON.parse(jsonString);
      let count = 0;

      Object.keys(data).forEach(key => {
        // Security: Only allow keys that belong to our app
        if ((key.startsWith(PREFIX) || key.startsWith(AUTH_PREFIX)) && data[key]) {
          localStorage.setItem(key, data[key]);
          count++;
        }
      });

      if (count === 0) {
        return { success: false, count: 0, message: "No valid application data found in file." };
      }
      return { success: true, count };
    } catch (e) {
      return { success: false, count: 0, message: "Invalid JSON file." };
    }
  }
};


/**
 * ------------------------------------------------------------------
 * SUPABASE IMPLEMENTATION
 * ------------------------------------------------------------------
 */

const SUPABASE_URL = 'https://nwcooqowjnwaiylahyei.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53Y29vcW93am53YWl5bGFoeWVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNzA4NjksImV4cCI6MjA4Mjk0Njg2OX0.6m4p6YeZsXwq3N7_QZkvvUVlcqYZqNkY2S77Z-iBZjc';

// Safe initialization that won't crash if keys aren't set yet
const supabase = (SUPABASE_URL.includes('YOUR_')) 
  ? null 
  : createClient(SUPABASE_URL, SUPABASE_KEY);

export const SupabaseDB: Database = {
  
  async userExists(username: string): Promise<boolean> {
    if (!supabase) return false;
    const { count, error } = await supabase
      .from('app_data')
      .select('*', { count: 'exact', head: true })
      .eq('username', username);
      
    if (error) {
        console.warn("Supabase check error", error);
        return false;
    }
    return (count || 0) > 0;
  },

  async createUser(username: string, passwordHash: string): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase.from('app_data').insert({
        username,
        password_hash: passwordHash,
        projects: [],
        daily_stats: { date: new Date().toDateString(), count: 0 }
    });
    if (error) console.error(error);
    return !error;
  },

  async verifyUser(username: string, passwordHash: string): Promise<boolean> {
    if (!supabase) return false;
    const { data } = await supabase.from('app_data').select('password_hash').eq('username', username).single();
    return data?.password_hash === passwordHash;
  },

  async getProjects(username: string): Promise<Project[]> {
    if (!supabase) return [];
    const { data } = await supabase.from('app_data').select('projects').eq('username', username).single();
    if (!data?.projects) return [];
    
    // Supabase returns JSON automatically, we just need to fix Date strings and ensure tasks
    return data.projects.map((p: any) => ({
        ...p,
        logs: p.logs.map((l: any) => ({ ...l, timestamp: new Date(l.timestamp) })),
        tasks: p.tasks || []
    }));
  },

  async saveProjects(username: string, projects: Project[]): Promise<void> {
    if (!supabase) return;
    await supabase.from('app_data').update({ projects }).eq('username', username);
  },

  async getDailyStats(username: string): Promise<number> {
    if (!supabase) return 0;
    const today = new Date().toDateString();
    const { data } = await supabase.from('app_data').select('daily_stats').eq('username', username).single();
    
    if (data?.daily_stats?.date === today) {
        return data.daily_stats.count;
    }
    // Reset if day changed
    await supabase.from('app_data').update({ daily_stats: { date: today, count: 0 } }).eq('username', username);
    return 0;
  },

  async incrementDailyStats(username: string): Promise<number> {
    if (!supabase) return 0;
    const current = await this.getDailyStats(username);
    const newVal = current + 1;
    const today = new Date().toDateString();
    
    await supabase.from('app_data').update({ daily_stats: { date: today, count: newVal } }).eq('username', username);
    return newVal;
  },
  
  async exportData(username: string): Promise<string> {
      if (!supabase) return JSON.stringify({ error: "No DB Connection" });
      const { data } = await supabase.from('app_data').select('*').eq('username', username).single();
      
      if (!data) return JSON.stringify({ error: "User not found" });

      // Transform back into LocalStorage-compatible format if migration is ever needed
      // Or just dump the raw DB object
      return JSON.stringify({
          source: 'supabase',
          exportedAt: new Date().toISOString(),
          data: data
      }, null, 2);
  },
  
  async importData(jsonString: string): Promise<{ success: boolean; count: number }> {
      return { success: false, count: 0 };
  }
};


// ------------------------------------------------------------------
// EXPORT THE ACTIVE DATABASE
// ------------------------------------------------------------------
export const db = SupabaseDB; // switched to Supabase
