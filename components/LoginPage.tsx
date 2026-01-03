import React, { useState, useEffect } from 'react';
import { ShieldCheck, User, ArrowRight, Loader2, RefreshCw, XCircle, Lock, KeyRound, LogIn, UserPlus, Eye, EyeOff, Upload } from 'lucide-react';
import { LocalAuthService } from '../services/localAuth';
import { db } from '../services/database';
import { User as UserType } from '../types';

interface LoginPageProps {
  onLogin: (user: UserType) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Debounce check for existing user
  useEffect(() => {
    const handler = setTimeout(async () => {
      if (username.trim()) {
        try {
            const exists = await LocalAuthService.userExists(username.trim());
            setIsNewUser(!exists);
        } catch (e) {
            console.warn("Failed to check user existence", e);
        }
      }
    }, 500);
    return () => clearTimeout(handler);
  }, [username]);

  // Load last user for convenience
  useEffect(() => {
    const lastUser = LocalAuthService.getLastUser();
    if (lastUser) {
        setUsername(lastUser);
    }
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    
    setError(null);
    setLoading(true);

    try {
      const user = username.trim();
      let result;
      
      // Artificial delay for UX smoothness
      await new Promise(resolve => setTimeout(resolve, 600));

      if (isNewUser) {
        result = await LocalAuthService.register(user, password);
      } else {
        result = await LocalAuthService.login(user, password);
      }

      if (result.success) {
        LocalAuthService.setLastUser(user);
        onLogin({
            username: user,
            lastLogin: new Date()
        });
      } else {
          setError(result.error || "Authentication failed");
          setPassword(''); // Clear password on error
      }
    } catch (err: any) {
        setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const result = await db.importData(event.target?.result as string);
            
            if (result.success) {
                 // Try to detect the user from the backup if possible
                 const lastUser = LocalAuthService.getLastUser();
                 if (lastUser) {
                     setUsername(lastUser);
                     setIsNewUser(false);
                 }
                 setError(null);
                 alert(`Successfully restored ${result.count} items. You can now log in.`);
            } else {
                 setError(result.message || "Failed to import data.");
            }
        } catch (err) {
            setError("Failed to parse backup file.");
            console.error(err);
        } finally {
            setLoading(false);
            // Clear input
            e.target.value = '';
        }
    };
    reader.readAsText(file);
  };

  const clearState = () => {
      setUsername('');
      setPassword('');
      setError(null);
      setIsNewUser(false);
      setShowPassword(false);
      LocalAuthService.clearLastUser();
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950 animate-pulse" />
      </div>

      <div className="w-full max-w-md z-10">
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden transition-all duration-500">
          
          <div className="p-8 text-center border-b border-slate-700/50 bg-slate-900/50">
            <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
              <ShieldCheck className="w-8 h-8 text-blue-400" />
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
              ScreenSentinel
            </h1>
            <p className="text-slate-400 text-sm mt-3 font-light tracking-wide">
              SECURE AI WORKSPACE
            </p>
          </div>

          <form onSubmit={handleAuth} className="p-8 space-y-5">
            
            <div className="space-y-4">
                {/* Username Field */}
                <div>
                  <label htmlFor="username" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Identity
                  </label>
                  <div className="relative group">
                    <User className="absolute left-3 top-3.5 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                    <input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter username"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3 pl-10 pr-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                      autoComplete="username"
                      autoFocus
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <label htmlFor="password" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Password
                  </label>
                  <div className="relative group">
                    <KeyRound className="absolute left-3 top-3.5 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={isNewUser ? "Create a password" : "Enter your password"}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3 pl-10 pr-12 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                      autoComplete={isNewUser ? "new-password" : "current-password"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-slate-500 hover:text-blue-400 focus:outline-none p-1 rounded-md transition-colors"
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                  {username && (
                    <p className="text-xs text-slate-600 mt-2 flex items-center gap-1 transition-all">
                        {isNewUser ? (
                            <span className="text-emerald-500/80 flex items-center gap-1">
                                <UserPlus className="w-3 h-3" /> Creating new account
                            </span>
                        ) : (
                            <span className="text-blue-500/80 flex items-center gap-1">
                                <LogIn className="w-3 h-3" /> Logging in
                            </span>
                        )}
                    </p>
                  )}
                </div>
            </div>

            <div className="mt-2">
                <button
                type="submit"
                disabled={loading || !username.trim() || !password.trim()}
                className={`w-full py-4 rounded-xl font-bold text-white transition-all transform duration-200 flex items-center justify-center gap-3 shadow-lg ${
                    loading || !username.trim() || !password.trim()
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : isNewUser 
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 hover:scale-[1.02] shadow-emerald-900/20'
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 hover:scale-[1.02] shadow-blue-900/20'
                }`}
                >
                {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                    isNewUser ? <UserPlus className="w-5 h-5" /> : <Lock className="w-5 h-5" />
                )}
                {loading ? 'Processing...' : (isNewUser ? 'Create Account' : 'Login Securely')}
                {!loading && username.trim() && <ArrowRight className="w-4 h-4 opacity-50" />}
                </button>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                <XCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}
            
            <div className="text-center">
                 <button 
                  type="button" 
                  onClick={clearState}
                  className="text-xs text-slate-500 hover:text-blue-400 transition-colors flex items-center justify-center gap-1 w-full"
                >
                  <RefreshCw className="w-3 h-3" />
                  Reset / Switch Account
                </button>
            </div>

          </form>
          
          <div className="px-8 pb-6 text-center">
             <label className="flex items-center justify-center gap-2 text-[10px] text-slate-500 uppercase tracking-widest cursor-pointer hover:text-blue-400 transition-colors">
                <Upload className="w-3 h-3" />
                Restore Backup
                <input 
                  type="file" 
                  accept=".json" 
                  className="hidden" 
                  onChange={handleRestoreBackup}
                />
             </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;