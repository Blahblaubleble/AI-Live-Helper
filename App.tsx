import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GeminiLiveService } from './services/geminiLiveService';
import ScreenShare, { ScreenShareHandle } from './components/ScreenShare';
import LoginPage from './components/LoginPage';
import { db } from './services/database'; // NEW IMPORT
import { ConnectionState, LogEntry, UsageStats, Project, User } from './types';
import { Play, Square, AlertCircle, Mic, MicOff, Monitor, Send, Clock, Activity, Video, VideoOff, FolderPlus, Folder, Trash2, ChevronRight, Zap, LogOut, User as UserIcon, Download, X } from 'lucide-react';

const FREE_TIER_LIMITS = {
  TPM: 1000000, 
  RPD: 1500     
};

const SmoothText = ({ text, isFinal }: { text: string; isFinal?: boolean }) => {
  const [displayedText, setDisplayedText] = useState(isFinal ? text : '');
  const indexRef = useRef(isFinal ? text.length : 0);

  useEffect(() => {
    if (text.length <= indexRef.current) {
       if (text.length < indexRef.current) {
         setDisplayedText(text);
         indexRef.current = text.length;
       }
       return;
    }

    const interval = setInterval(() => {
      if (indexRef.current < text.length) {
        const remaining = text.length - indexRef.current;
        let step = 1;
        if (remaining > 50) step = 5;
        else if (remaining > 20) step = 3;
        else if (remaining > 10) step = 2;
        if (isFinal && remaining > 5) step = Math.max(step, 4);

        indexRef.current = Math.min(text.length, indexRef.current + step);
        setDisplayedText(text.slice(0, indexRef.current));
      } else {
        clearInterval(interval);
      }
    }, 15);

    return () => clearInterval(interval);
  }, [text, isFinal]);

  return <span className="whitespace-pre-wrap">{displayedText}</span>;
};

const UsageBar = ({ label, current, max, unit }: { label: string, current: number, max: number, unit: string }) => {
  const percentage = Math.min(100, Math.max(0, (current / max) * 100));
  let colorClass = "bg-blue-500";
  if (percentage > 75) colorClass = "bg-yellow-500";
  if (percentage > 90) colorClass = "bg-red-500";

  return (
    <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col gap-2">
      <div className="flex justify-between items-end">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
        <span className="text-sm font-mono text-slate-200">
          {current.toLocaleString()} <span className="text-slate-500">/ {max.toLocaleString()} {unit}</span>
        </span>
      </div>
      <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-700/50">
        <div className={`h-full ${colorClass} transition-all duration-500 ease-out`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
};

const App: React.FC = () => {
  // Auth State
  const [user, setUser] = useState<User | null>(null);

  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.IDLE);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoPaused, setIsVideoPaused] = useState(false);
  const [inputText, setInputText] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  // Project State
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  
  // Create Project Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const newProjectInputRef = useRef<HTMLInputElement>(null);

  // Real-time stats
  const [stats, setStats] = useState<UsageStats>({ imagesSent: 0, modelTurns: 0, estimatedTokens: 0, tokensPerMinute: 0 });
  const [dailyRequests, setDailyRequests] = useState(0);

  const serviceRef = useRef<GeminiLiveService | null>(null);
  const screenShareRef = useRef<ScreenShareHandle>(null);
  const isScreenSharingRef = useRef(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Load persistence via DB Service
  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
        // Load Daily Stats
        const count = await db.getDailyStats(user.username);
        setDailyRequests(count);

        // Load Projects
        const loadedProjects = await db.getProjects(user.username);
        setProjects(loadedProjects);
        
        setIsDataLoaded(true);
    };

    loadData();
  }, [user]);

  // Save Projects Persistence via DB Service
  useEffect(() => {
    if (!user || !isDataLoaded) return;
    
    // Auto-save logic
    db.saveProjects(user.username, projects);
  }, [projects, user, isDataLoaded]);

  // Sync Logs to Active Project
  useEffect(() => {
    if (activeProjectId) {
        setProjects(prev => prev.map(p => {
            if (p.id === activeProjectId) {
                return { ...p, logs: logs, lastActive: new Date().toISOString() };
            }
            return p;
        }));
    }
  }, [logs, activeProjectId]);

  // Focus input when modal opens
  useEffect(() => {
    if (isCreateModalOpen && newProjectInputRef.current) {
        setTimeout(() => newProjectInputRef.current?.focus(), 100);
    }
  }, [isCreateModalOpen]);

  // Initialize service
  useEffect(() => {
    serviceRef.current = new GeminiLiveService({
      onConnect: () => {
        setConnectionState(ConnectionState.CONNECTED);
        addLog('system', 'Connected to Gemini Live Agent.');
        
        // Update stats
        if (user) {
            db.incrementDailyStats(user.username).then(newCount => {
                setDailyRequests(newCount);
            });
        }

        if (isScreenSharingRef.current) {
             serviceRef.current?.notifyScreenStart();
        }
      },
      onDisconnect: () => {
        setConnectionState(ConnectionState.IDLE);
        addLog('system', 'Disconnected.');
      },
      onError: (err) => {
        setConnectionState(ConnectionState.ERROR);
        setErrorMsg(err.message);
        addLog('system', `Error: ${err.message}`);
      },
      onTranscript: (text, sender, isFinal, responseTime) => {
        setLogs(prev => {
          const lastLog = prev[prev.length - 1];
          if (lastLog && lastLog.sender === sender && !lastLog.isFinal) {
            const updatedLog = {
              ...lastLog,
              message: text,
              isFinal: isFinal,
              timestamp: new Date(),
              responseTime: responseTime !== undefined ? responseTime : lastLog.responseTime
            };
            return [...prev.slice(0, -1), updatedLog];
          } else {
            return [...prev, {
              id: Math.random().toString(36).substring(7),
              timestamp: new Date(),
              sender,
              message: text,
              isFinal: isFinal,
              responseTime
            }];
          }
        });
      },
      onStats: (newStats) => {
        setStats({ ...newStats });
      }
    });

    return () => {
      serviceRef.current?.disconnect();
    };
  }, [user]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (sender: 'user' | 'ai' | 'system', message: string) => {
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substring(7),
      timestamp: new Date(),
      sender,
      message,
      isFinal: true
    }]);
  };

  const handleLogout = () => {
    if (connectionState === ConnectionState.CONNECTED) {
        handleStop();
    }
    setUser(null);
    setIsDataLoaded(false); // Reset persistence lock
    setProjects([]);
    setActiveProjectId(null);
    setLogs([]);
    setDailyRequests(0);
  };

  const handleExportData = async () => {
      if (!user) return;
      
      const jsonStr = await db.exportData(user.username);
      
      // Create Blob
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `screenSentinel_backup_${user.username}_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  // Project Management Functions
  const openCreateModal = () => {
      setNewProjectName('');
      setIsCreateModalOpen(true);
  };

  const handleCreateProject = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newProjectName.trim()) return;
      
      const newProject: Project = {
          id: Math.random().toString(36).substring(2, 9),
          name: newProjectName.trim(),
          createdAt: new Date().toISOString(),
          lastActive: new Date().toISOString(),
          logs: []
      };
      setProjects([...projects, newProject]);
      selectProject(newProject.id);
      setIsCreateModalOpen(false);
  };

  const selectProject = (id: string) => {
      // Disconnect if active to prevent state bleeding
      if (connectionState === ConnectionState.CONNECTED) {
          handleStop();
      }

      const project = projects.find(p => p.id === id);
      if (project) {
          setActiveProjectId(id);
          setLogs(project.logs);
      }
  };

  const deleteProject = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (!user) return;

      const updated = projects.filter(p => p.id !== id);
      setProjects(updated);
      
      // Auto-save handles the DB update via useEffect
      
      if (activeProjectId === id) {
          setActiveProjectId(null);
          setLogs([]);
      }
  };

  const switchToQuickSession = () => {
      if (connectionState === ConnectionState.CONNECTED) handleStop();
      setActiveProjectId(null);
      setLogs([]);
  };

  const handleStart = () => {
    if (!process.env.API_KEY) {
      setErrorMsg("API_KEY not found in environment.");
      setConnectionState(ConnectionState.ERROR);
      return;
    }
    setErrorMsg(null);
    setConnectionState(ConnectionState.CONNECTING);
    setIsMuted(false);
    setIsVideoPaused(false);
    
    if (screenShareRef.current) {
        screenShareRef.current.start().catch(err => {
            console.warn("Screen share start failed", err);
        });
    }
    serviceRef.current?.connect();
  };

  const handleStop = () => {
    serviceRef.current?.disconnect();
    screenShareRef.current?.stop();
    isScreenSharingRef.current = false;
  };

  const handleMuteToggle = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    serviceRef.current?.setMuted(newMutedState);
  };
  
  const handleVideoPauseToggle = () => {
    const newState = !isVideoPaused;
    setIsVideoPaused(newState);
    serviceRef.current?.notifyVideoStateChange(newState);
    addLog('system', newState ? "Video monitoring paused." : "Video monitoring resumed.");
  };

  const handleSendText = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || connectionState !== ConnectionState.CONNECTED) return;
    serviceRef.current?.sendTextMessage(inputText);
    setInputText('');
  };

  const handleVideoFrame = useCallback((base64: string) => {
    if (connectionState === ConnectionState.CONNECTED) {
      serviceRef.current?.sendVideoFrame(base64);
    }
  }, [connectionState]);

  // Auth Guard
  if (!user) {
      return <LoginPage onLogin={setUser} />;
  }

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 overflow-hidden relative">
      
      {/* Create Project Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <h3 className="font-bold text-slate-200 text-lg flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-blue-500" />
                Create New Project
              </h3>
              <button 
                onClick={() => setIsCreateModalOpen(false)} 
                className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateProject} className="p-6 space-y-4">
              <div>
                <label htmlFor="projectName" className="block text-sm font-semibold text-slate-400 mb-2">
                  Project Name
                </label>
                <input
                  ref={newProjectInputRef}
                  id="projectName"
                  type="text"
                  maxLength={50}
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g., Marketing Dashboard Review"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder-slate-600 transition-all focus:border-blue-500/50"
                  autoComplete="off"
                />
                <div className="flex justify-end mt-2">
                   <span className={`text-xs font-mono transition-colors ${
                      newProjectName.length >= 45 ? 'text-yellow-500' : 'text-slate-600'
                   }`}>
                     {newProjectName.length}/50
                   </span>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newProjectName.trim()}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/20"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sidebar - Fixed Width */}
      <aside 
        className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col relative shrink-0"
      >
        <div className="p-4 border-b border-slate-800 flex items-center justify-between overflow-hidden whitespace-nowrap">
            <h2 className="font-bold text-slate-200 flex items-center gap-2">
                <Folder className="w-5 h-5 text-blue-500" />
                Projects
            </h2>
             <button onClick={openCreateModal} className="p-1.5 hover:bg-slate-800 rounded-lg text-blue-400 transition-colors" title="New Project">
                <FolderPlus className="w-5 h-5" />
            </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
             <button
                onClick={switchToQuickSession}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                    !activeProjectId ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
             >
                <Zap className="w-4 h-4" />
                Quick Session
             </button>

             <div className="h-px bg-slate-800 my-2" />

             {projects.map(p => (
                 <div 
                    key={p.id}
                    onClick={() => selectProject(p.id)}
                    className={`group w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                        activeProjectId === p.id ? 'bg-slate-800 text-slate-100 border border-slate-700' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                    }`}
                 >
                    <div className="flex flex-col truncate">
                        <span className="truncate font-medium">{p.name}</span>
                        <span className="text-[10px] text-slate-600">{new Date(p.lastActive).toLocaleDateString()}</span>
                    </div>
                    <button 
                        onClick={(e) => deleteProject(e, p.id)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded transition-all"
                        title="Delete Project"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                 </div>
             ))}

             {projects.length === 0 && (
                 <div className="text-center text-xs text-slate-600 mt-4 italic">No saved projects</div>
             )}
        </div>
        
        {/* User Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/50 space-y-2">
            <div className="flex items-center justify-between rounded-lg bg-slate-900 p-2 border border-slate-800">
                <div className="flex items-center gap-2 overflow-hidden">
                    <div className="w-7 h-7 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                        <UserIcon className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col truncate">
                        <span className="text-xs font-bold text-slate-200 truncate max-w-[90px]">{user.username}</span>
                        <span className="text-[10px] text-emerald-500 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Secure
                        </span>
                    </div>
                </div>
                <button 
                    onClick={handleLogout}
                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-all"
                    title="Logout"
                >
                    <LogOut className="w-4 h-4" />
                </button>
            </div>
            
            <button 
                onClick={handleExportData}
                className="w-full flex items-center justify-center gap-2 py-1.5 text-xs text-slate-500 hover:text-blue-400 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors"
            >
                <Download className="w-3 h-3" />
                Backup Data
            </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
          
          {/* Top Bar */}
          <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 md:px-8">
            <div className="flex items-center gap-4">
                <div>
                    <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent flex items-center gap-2">
                        ScreenSentinel AI
                        {activeProjectId && <span className="text-slate-500 text-sm font-normal hidden md:inline"> / {projects.find(p => p.id === activeProjectId)?.name}</span>}
                    </h1>
                </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className={`px-3 py-1 rounded-full text-xs font-medium border flex items-center gap-2 ${
                connectionState === ConnectionState.CONNECTED 
                ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                : connectionState === ConnectionState.CONNECTING
                ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                    connectionState === ConnectionState.CONNECTED ? 'bg-green-500 animate-pulse' : 
                    connectionState === ConnectionState.CONNECTING ? 'bg-yellow-500 animate-bounce' : 'bg-slate-500'
                }`} />
                {connectionState}
              </div>
            </div>
          </header>

          <main className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 p-4 md:p-6 overflow-hidden">
            
            {/* Left Column: Screen & Controls */}
            <div className="lg:col-span-2 flex flex-col gap-6 overflow-y-auto">
              
              <div className="flex-1 bg-slate-800 rounded-2xl p-1 shadow-xl border border-slate-700 relative min-h-[350px] flex flex-col">
                {connectionState === ConnectionState.IDLE && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-sm rounded-xl p-6 text-center">
                    <Monitor className="w-16 h-16 text-slate-600 mb-4" />
                    <h3 className="text-xl font-semibold text-slate-300">
                        {activeProjectId ? `Ready to resume "${projects.find(p => p.id === activeProjectId)?.name}"` : "Ready to Monitor"}
                    </h3>
                    <p className="text-slate-500 max-w-md mt-2 mb-8">
                       {activeProjectId ? "History is loaded. Connect to resume the session." : "Connect to start the AI agent. It will watch your screen and listen to your voice commands."}
                    </p>
                    <button
                      onClick={handleStart}
                      className="flex items-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-bold shadow-lg shadow-blue-500/20 transition-all transform hover:scale-105"
                    >
                      <Play className="w-5 h-5" fill="currentColor" />
                      {activeProjectId ? "RESUME SESSION" : "START AGENT"}
                    </button>
                  </div>
                )}
                
                {connectionState === ConnectionState.ERROR && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-red-900/20 backdrop-blur-sm rounded-xl border border-red-500/30">
                    <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
                    <h3 className="text-xl font-semibold text-red-400">Connection Error</h3>
                    <p className="text-red-200 mt-2">{errorMsg}</p>
                    <button onClick={() => setConnectionState(ConnectionState.IDLE)} className="mt-6 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm">Dismiss</button>
                  </div>
                )}

                <div className="flex-1 relative rounded-xl overflow-hidden bg-black">
                     <ScreenShare 
                      ref={screenShareRef}
                      isActive={connectionState === ConnectionState.CONNECTED}
                      isPaused={isVideoPaused}
                      onFrame={handleVideoFrame}
                      onStop={() => {
                          isScreenSharingRef.current = false;
                          handleStop();
                      }}
                      onStart={() => {
                          isScreenSharingRef.current = true;
                          if (connectionState === ConnectionState.CONNECTED) {
                              serviceRef.current?.notifyScreenStart();
                          }
                      }}
                    />
                </div>
              </div>

              {/* Control Bar */}
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                   <div className={`p-2 rounded-lg ${connectionState === ConnectionState.CONNECTED ? 'bg-green-500/20 text-green-400' : 'bg-slate-700/50 text-slate-500'}`}>
                      {connectionState === ConnectionState.CONNECTED && !isVideoPaused ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                   </div>
                   <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-200">
                             {connectionState === ConnectionState.CONNECTED ? "Session Active" : "Session Idle"}
                        </span>
                        <span className="text-xs text-slate-500">
                             {connectionState === ConnectionState.CONNECTED 
                                ? (isVideoPaused ? "Audio Only (Video Paused)" : "Monitoring Screen & Audio")
                                : "Waiting to start..."}
                        </span>
                   </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleMuteToggle}
                    disabled={connectionState !== ConnectionState.CONNECTED}
                    className={`p-3 rounded-full transition-colors ${
                      isMuted 
                        ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' 
                        : 'bg-slate-700 hover:bg-slate-600 text-blue-400'
                    } disabled:opacity-50`}
                    title={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>
                  
                   <button
                    onClick={handleVideoPauseToggle}
                    disabled={connectionState !== ConnectionState.CONNECTED}
                    className={`p-3 rounded-full transition-colors ${
                      isVideoPaused 
                        ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30' 
                        : 'bg-slate-700 hover:bg-slate-600 text-emerald-400'
                    } disabled:opacity-50`}
                    title={isVideoPaused ? "Resume Video" : "Pause Video"}
                  >
                    {isVideoPaused ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                  </button>

                  {connectionState === ConnectionState.CONNECTED && (
                   <button 
                    onClick={handleStop}
                    className="p-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-full transition border border-red-500/30"
                    title="Stop Session"
                   >
                     <Square className="w-5 h-5" fill="currentColor" />
                   </button>
                 )}
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <UsageBar label="Speed (TPM)" current={stats.tokensPerMinute} max={FREE_TIER_LIMITS.TPM} unit="TPM" />
                 <UsageBar label="Daily Requests" current={dailyRequests} max={FREE_TIER_LIMITS.RPD} unit="Reqs" />
              </div>

            </div>

            {/* Right Column: Chat */}
            <div className="bg-slate-800 rounded-2xl border border-slate-700 flex flex-col overflow-hidden max-h-[calc(100vh-8rem)] shadow-lg">
              <div className="p-4 border-b border-slate-700 bg-slate-800/80 backdrop-blur flex justify-between items-center">
                <h2 className="font-semibold text-slate-300 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-400" />
                    Transcript
                </h2>
                <div className="text-xs text-slate-500 font-mono">
                   {stats.modelTurns} turns
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 bg-slate-900/30">
                {logs.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-2">
                    <Activity className="w-8 h-8 opacity-20" />
                    <p className="text-sm italic">Conversation history will appear here...</p>
                  </div>
                )}
                {logs.map((log) => (
                  <div 
                    key={log.id} 
                    className={`flex flex-col ${
                      log.sender === 'user' ? 'items-end' : 
                      log.sender === 'ai' ? 'items-start' : 'items-center'
                    }`}
                  >
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-md ${
                      log.sender === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 
                      log.sender === 'ai' ? 'bg-slate-700 text-slate-200 rounded-bl-none' : 
                      'bg-slate-800/50 text-slate-500 text-xs italic border border-slate-700'
                    }`}>
                      <SmoothText text={log.message} isFinal={log.isFinal} />
                    </div>
                    {log.sender !== 'system' && (
                      <div className="flex items-center gap-2 mt-1 px-1">
                         <span className="text-[10px] text-slate-600 font-mono">
                          {new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second: '2-digit'})}
                        </span>
                        {log.sender === 'ai' && log.responseTime !== undefined && (
                          <span className="flex items-center text-[10px] text-emerald-500 bg-emerald-500/10 px-1 rounded">
                             <Clock className="w-3 h-3 mr-1" />
                             {(log.responseTime / 1000).toFixed(2)}s
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>

              <div className="p-4 bg-slate-900 border-t border-slate-700">
                <form onSubmit={handleSendText} className="flex gap-2">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    disabled={connectionState !== ConnectionState.CONNECTED}
                    placeholder={connectionState === ConnectionState.CONNECTED ? "Type a message..." : "Connect to chat..."}
                    className="flex-1 bg-slate-800 text-slate-200 placeholder-slate-500 border border-slate-700 rounded-full px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  />
                  <button
                    type="submit"
                    disabled={!inputText.trim() || connectionState !== ConnectionState.CONNECTED}
                    className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-500 disabled:opacity-50 disabled:bg-slate-800 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-900/20"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
              </div>
            </div>

          </main>
      </div>
    </div>
  );
};

export default App;