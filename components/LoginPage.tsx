import React, { useState, useEffect } from 'react';
import { User, ArrowRight, Loader2, RefreshCw, XCircle, Lock, Eye, EyeOff, Upload, DownloadCloud } from 'lucide-react';
import { LocalAuthService } from '../services/localAuth';
import { db } from '../services/database';
import { User as UserType } from '../types';

interface LoginPageProps {
  onLogin: (user: UserType) => void;
  theme?: 'light' | 'dark';
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin, theme = 'dark' }) => {
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
      
      await new Promise(resolve => setTimeout(resolve, 800));

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
          setPassword(''); 
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
        } finally {
            setLoading(false);
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
    <div className="relative z-10 w-full h-full flex flex-col items-center pt-[15vh]">
      
      {/* Avatar Circle */}
      <div className="mb-8 relative group">
        <div className="w-24 h-24 rounded-full bg-white/40 dark:bg-gray-200/20 backdrop-blur-md shadow-2xl flex items-center justify-center border border-white/20 dark:border-white/10 transition-transform duration-500 hover:scale-105">
           {username ? (
              <span className="text-3xl font-semibold text-slate-700 dark:text-white/90">{username[0].toUpperCase()}</span>
           ) : (
              <User className="w-10 h-10 text-slate-500 dark:text-white/50" />
           )}
        </div>
        {loading && (
            <div className="absolute inset-0 rounded-full border-4 border-t-blue-500 dark:border-t-white/80 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
        )}
      </div>

      <div className="w-full max-w-xs space-y-4">
          <div className="text-center mb-6">
             <h2 className="text-2xl font-semibold text-slate-800 dark:text-white drop-shadow-sm">
                 {username || "ScreenSentinel"}
             </h2>
             {username && isNewUser && (
                 <p className="text-xs text-slate-500 dark:text-white/60 mt-1">Create Account</p>
             )}
          </div>

          <form onSubmit={handleAuth} className="space-y-3 relative">
             <div className="space-y-3">
                 <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="User Name"
                    className="w-full bg-white/60 dark:bg-white/10 backdrop-blur-md border border-white/40 dark:border-white/20 rounded-xl px-4 py-2.5 text-center text-slate-800 dark:text-white placeholder-slate-500 dark:placeholder-white/40 focus:outline-none focus:bg-white/80 dark:focus:bg-white/20 focus:border-blue-400 dark:focus:border-white/40 transition-all shadow-lg"
                    autoFocus
                 />
                 
                 <div className="relative">
                     <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter Password"
                        className="w-full bg-white/60 dark:bg-white/10 backdrop-blur-md border border-white/40 dark:border-white/20 rounded-xl pl-4 pr-12 py-2.5 text-center text-slate-800 dark:text-white placeholder-slate-500 dark:placeholder-white/40 focus:outline-none focus:bg-white/80 dark:focus:bg-white/20 focus:border-blue-400 dark:focus:border-white/40 transition-all shadow-lg"
                     />
                     {password && (
                         <button 
                           type="button" 
                           onClick={() => setShowPassword(!showPassword)}
                           className="absolute right-10 top-2.5 text-slate-500 dark:text-white/50 hover:text-slate-800 dark:hover:text-white"
                         >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                         </button>
                     )}
                     
                     <button
                        type="submit"
                        disabled={!username || !password || loading}
                        className="absolute right-2 top-2 p-1 bg-blue-500 dark:bg-white/20 hover:bg-blue-600 dark:hover:bg-white/30 rounded-full text-white transition-opacity disabled:opacity-0 opacity-100"
                     >
                        <ArrowRight className="w-4 h-4" />
                     </button>
                 </div>
             </div>

             {error && (
                 <div className="text-center text-red-600 dark:text-red-300 text-xs font-medium bg-red-100 dark:bg-red-500/20 py-1.5 rounded-lg border border-red-200 dark:border-red-500/20 mt-2 backdrop-blur-sm animate-in fade-in slide-in-from-top-1">
                     {error}
                 </div>
             )}
          </form>

          <div className="flex justify-center gap-6 pt-8">
               <button 
                 onClick={clearState}
                 className="flex flex-col items-center gap-2 group"
               >
                   <div className="w-10 h-10 rounded-full bg-white/40 dark:bg-white/10 flex items-center justify-center border border-white/20 dark:border-white/5 group-hover:bg-white/60 dark:group-hover:bg-white/20 transition-all">
                       <RefreshCw className="w-4 h-4 text-slate-600 dark:text-white/80" />
                   </div>
                   <span className="text-[10px] font-medium text-slate-500 dark:text-white/60">Switch User</span>
               </button>

               <label className="flex flex-col items-center gap-2 group cursor-pointer">
                   <div className="w-10 h-10 rounded-full bg-white/40 dark:bg-white/10 flex items-center justify-center border border-white/20 dark:border-white/5 group-hover:bg-white/60 dark:group-hover:bg-white/20 transition-all">
                       <DownloadCloud className="w-4 h-4 text-slate-600 dark:text-white/80" />
                   </div>
                   <span className="text-[10px] font-medium text-slate-500 dark:text-white/60">Restore</span>
                   <input type="file" accept=".json" className="hidden" onChange={handleRestoreBackup} />
               </label>
          </div>
      </div>
    </div>
  );
};

export default LoginPage;