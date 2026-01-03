import { db } from './database';

// Simple hash (DJB2 variant) for environment-agnostic environments
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

export interface AuthResult {
  success: boolean;
  error?: string;
}

export const LocalAuthService = {
  setLastUser(username: string) {
    try {
      localStorage.setItem('screenSentinel_lastUser', username);
    } catch (e) {}
  },

  getLastUser(): string | null {
    try {
      return localStorage.getItem('screenSentinel_lastUser');
    } catch (e) {
      return null;
    }
  },
  
  clearLastUser() {
    try {
      localStorage.removeItem('screenSentinel_lastUser');
    } catch (e) {}
  },

  async userExists(username: string): Promise<boolean> {
    return await db.userExists(username);
  },

  async register(username: string, password: string): Promise<AuthResult> {
    if (!username || !password) return { success: false, error: "Missing credentials" };
    
    try {
        const passwordHash = simpleHash(password);
        const success = await db.createUser(username, passwordHash);
        
        if (!success) {
            return { success: false, error: "User already exists or DB Error" };
        }
        return { success: true };
    } catch (e) {
        console.error("Storage error", e);
        return { success: false, error: "Could not save account" };
    }
  },

  async login(username: string, password: string): Promise<AuthResult> {
    if (!username || !password) return { success: false, error: "Missing credentials" };

    try {
        const passwordHash = simpleHash(password);
        const valid = await db.verifyUser(username, passwordHash);
        
        if (valid) {
            return { success: true };
        } else {
            // Check if user exists at all to give better error message
            const exists = await db.userExists(username);
            if (!exists) {
                return { success: false, error: "User not found." };
            }
            return { success: false, error: "Invalid password" };
        }
    } catch (e) {
        console.error("Login error", e);
        return { success: false, error: "Login failed (System Error)" };
    }
  }
};