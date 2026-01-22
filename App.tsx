import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GeminiLiveService, ToolExecutors } from './services/geminiLiveService';
import ScreenShare, { ScreenShareHandle } from './components/ScreenShare';
import Visualizer from './components/Visualizer';
import LoginPage from './components/LoginPage';
import TodoList from './components/TodoList'; 
import { db } from './services/database';
import { ConnectionState, LogEntry, UsageStats, Project, User, Task } from './types';
import { Play, Mic, MicOff, Monitor, ArrowRight, Video, VideoOff, Folder, Trash2, Zap, Plus, X, ListTodo, MessageSquare, Sun, Moon, LogOut, Download, Bot } from 'lucide-react';

const FREE_TIER_LIMITS = { TPM: 1000000, RPD: 1500 };

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

const UsageBar = ({ label, current, max }: { label: string, current: number, max: number, unit: string }) => {
  const percentage = Math.min(100, Math.max(0, (current / max) * 100));
  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex justify-between items-end px-1">
        <span className="text-[10px] font-semibold text-slate-500 dark:text-white/40 uppercase tracking-wide">{label}</span>
        <span className="text-[10px] font-mono text-slate-700 dark:text-white/60">
          {current.toLocaleString()} / {max.toLocaleString()}
        </span>
      </div>
      <div className="w-full h-1.5 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full bg-blue-500/60 dark:bg-white/60 transition-all duration-500 ease-out`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
};

// Helper to safely format time
const safeFormatTime = (date: Date): string => {
    try {
        if (isNaN(date.getTime())) return '';
        return date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    } catch (e) {
        return '';
    }
};

const App: React.FC = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [user, setUser] = useState<User | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.IDLE);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoPaused, setIsVideoPaused] = useState(false);
  const [inputText, setInputText] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<'chat' | 'tasks'>('chat');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const newProjectInputRef = useRef<HTMLInputElement>(null);
  const [stats, setStats] = useState<UsageStats>({ imagesSent: 0, modelTurns: 0, estimatedTokens: 0, tokensPerMinute: 0 });
  const [dailyRequests, setDailyRequests] = useState(0);
  
  // Audio Levels
  const [audioLevels, setAudioLevels] = useState({ user: 0, ai: 0 });

  const serviceRef = useRef<GeminiLiveService | null>(null);
  const screenShareRef = useRef<ScreenShareHandle>(null);
  const isScreenSharingRef = useRef(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  const logsRef = useRef<LogEntry[]>([]);
  const projectsRef = useRef<Project[]>([]);
  const activeProjectIdRef = useRef<string | null>(null);

  // Sync refs
  useEffect(() => { logsRef.current = logs; }, [logs]);
  useEffect(() => { projectsRef.current = projects; }, [projects]);
  useEffect(() => { activeProjectIdRef.current = activeProjectId; }, [activeProjectId]);

  // Load Data
  useEffect(() => {
    if (!user) return;
    const loadData = async () => {
        const count = await db.getDailyStats(user.username);
        setDailyRequests(count);
        const loadedProjects = await db.getProjects(user.username);
        setProjects(loadedProjects);
        setIsDataLoaded(true);
    };
    loadData();
  }, [user]);

  // Auto-save
  useEffect(() => {
    if (!user || !isDataLoaded || !activeProjectId) return;
    const syncAndSave = () => {
        const currentProjects = projectsRef.current;
        const currentLogs = logsRef.current;
        const updatedProjects = currentProjects.map(p => {
            if (p.id === activeProjectId) {
                return { ...p, logs: currentLogs, lastActive: new Date().toISOString() };
            }
            return p;
        });
        setProjects(updatedProjects);
        db.saveProjects(user.username, updatedProjects).catch(err => console.error("Auto-save failed", err));
    };
    const intervalId = setInterval(syncAndSave, 2000);
    return () => {
        clearInterval(intervalId);
        syncAndSave();
    };
  }, [activeProjectId, user, isDataLoaded]); 

  // Initialize Service
  useEffect(() => {
    const toolExecutors: ToolExecutors = {
        createProject: (name) => {
            if (!user) return "Error: No user logged in.";
            const newProject: Project = {
                id: Math.random().toString(36).substring(2, 9),
                name: name.trim(),
                createdAt: new Date().toISOString(),
                lastActive: new Date().toISOString(),
                logs: [],
                tasks: []
            };
            const updated = [...projectsRef.current, newProject];
            setProjects(updated);
            db.saveProjects(user.username, updated);
            setActiveProjectId(newProject.id);
            setLogs([]);
            setViewMode('tasks');
            return `Project '${name}' created.`;
        },
        switchProject: (name) => {
            if (!user) return "Error: No user logged in.";
            const project = projectsRef.current.find(p => p.name.toLowerCase().includes(name.toLowerCase()));
            if (project) {
                if (activeProjectIdRef.current) {
                     const currentId = activeProjectIdRef.current;
                     const updatedProjects = projectsRef.current.map(p => {
                         if (p.id === currentId) {
                             return { ...p, logs: logsRef.current, lastActive: new Date().toISOString() };
                         }
                         return p;
                     });
                     db.saveProjects(user.username, updatedProjects);
                     setProjects(updatedProjects);
                }
                setActiveProjectId(project.id);
                setLogs(project.logs || []);
                return `Switched to project '${project.name}'.`;
            }
            return `Project '${name}' not found.`;
        },
        addTask: (title, priority) => {
            let currentProjectId = activeProjectIdRef.current;
            
            // Auto-create "General" project if none is selected
            if (!currentProjectId) {
                const existingGeneral = projectsRef.current.find(p => p.name === "General");
                if (existingGeneral) {
                    currentProjectId = existingGeneral.id;
                    setActiveProjectId(existingGeneral.id);
                } else {
                     const newProject: Project = {
                        id: Math.random().toString(36).substring(2, 9),
                        name: "General",
                        createdAt: new Date().toISOString(),
                        lastActive: new Date().toISOString(),
                        logs: [],
                        tasks: []
                    };
                    const updated = [...projectsRef.current, newProject];
                    setProjects(updated);
                    if (user) db.saveProjects(user.username, updated);
                    setActiveProjectId(newProject.id);
                    currentProjectId = newProject.id;
                }
            }

            const validPriority = (['Low', 'Medium', 'High'].includes(priority) ? priority : 'Medium') as 'Low'|'Medium'|'High';
            const today = new Date();
            today.setHours(23, 59, 59, 999);
            const newTask: Task = {
                id: Math.random().toString(36).substring(2, 9),
                title: title,
                completed: false,
                priority: validPriority,
                dueDate: today.toISOString(),
                createdAt: new Date().toISOString(),
                subtasks: []
            };
            
            setProjects(prev => prev.map(p => {
                if (p.id === currentProjectId) {
                    return { ...p, tasks: [...(p.tasks || []), newTask], lastActive: new Date().toISOString() };
                }
                return p;
            }));
            setViewMode('tasks');
            return `Task '${title}' added to project.`;
        },
        addSubtask: (parentTitle, subtaskTitle) => {
            if (!activeProjectIdRef.current) return "No active project.";
            const currentProject = projectsRef.current.find(p => p.id === activeProjectIdRef.current);
            if (!currentProject) return "Active project not found.";
            
            // Fuzzy match parent task
            const parentTask = currentProject.tasks.find(t => t.title.toLowerCase().includes(parentTitle.toLowerCase()));
            
            if (parentTask) {
                const newSubtask: Task = {
                    id: Math.random().toString(36).substring(2, 9),
                    title: subtaskTitle,
                    completed: false,
                    priority: 'Medium', // Inherit or default? Default for now
                    dueDate: '', // No due date by default for subtasks
                    createdAt: new Date().toISOString(),
                    subtasks: []
                };

                setProjects(prev => prev.map(p => {
                    if (p.id === activeProjectIdRef.current) {
                        return {
                            ...p,
                            tasks: p.tasks.map(t => {
                                if (t.id === parentTask.id) {
                                    return { ...t, subtasks: [...(t.subtasks || []), newSubtask] };
                                }
                                return t;
                            }),
                            lastActive: new Date().toISOString()
                        };
                    }
                    return p;
                }));
                setViewMode('tasks');
                return `Subtask '${subtaskTitle}' added to '${parentTask.title}'.`;
            }
            return `Parent task '${parentTitle}' not found.`;
        },
        editTask: (originalTitle, newTitle, newPriority, newDueDate) => {
             if (!activeProjectIdRef.current) return "No active project.";
             const currentProject = projectsRef.current.find(p => p.id === activeProjectIdRef.current);
             if (!currentProject) return "Active project not found.";
             
             // Fuzzy match finder
             const searchTitle = originalTitle.toLowerCase().trim();
             const task = currentProject.tasks.find(t => t.title.toLowerCase().includes(searchTitle));
             
             if (task) {
                 let updates: any = {};
                 let msgParts = [];
                 
                 if (newTitle && newTitle.trim()) {
                     updates.title = newTitle.trim();
                     msgParts.push(`renamed to '${newTitle.trim()}'`);
                 }
                 
                 if (newPriority) {
                     // Normalize priority (e.g. "high" -> "High")
                     const normalized = newPriority.charAt(0).toUpperCase() + newPriority.slice(1).toLowerCase();
                     if (['Low', 'Medium', 'High'].includes(normalized)) {
                         updates.priority = normalized;
                         msgParts.push(`priority set to ${normalized}`);
                     }
                 }

                 if (newDueDate) {
                     const date = new Date(newDueDate);
                     if (!isNaN(date.getTime())) {
                         updates.dueDate = date.toISOString();
                         msgParts.push(`due date set to ${date.toLocaleString()}`);
                     }
                 }
                 
                 if (Object.keys(updates).length === 0) return "No changes requested for the task.";

                 setProjects(prev => prev.map(p => {
                    if (p.id === activeProjectIdRef.current) {
                        return { 
                            ...p, 
                            tasks: p.tasks.map(t => t.id === task.id ? { ...t, ...updates } : t),
                            lastActive: new Date().toISOString()
                        };
                    }
                    return p;
                }));
                setViewMode('tasks');
                return `Task '${task.title}' updated: ${msgParts.join(', ')}.`;
             }
             return `Task '${originalTitle}' not found.`;
        },
        markTaskComplete: (title) => {
             if (!activeProjectIdRef.current) return "No active project.";
             const currentProject = projectsRef.current.find(p => p.id === activeProjectIdRef.current);
             if (!currentProject) return "Active project not found.";
             const task = currentProject.tasks.find(t => t.title.toLowerCase().includes(title.toLowerCase()));
             if (task) {
                 setProjects(prev => prev.map(p => {
                    if (p.id === activeProjectIdRef.current) {
                        return { 
                            ...p, 
                            tasks: p.tasks.map(t => t.id === task.id ? { ...t, completed: true } : t),
                            lastActive: new Date().toISOString()
                        };
                    }
                    return p;
                }));
                setViewMode('tasks');
                return `Task '${task.title}' marked as complete.`;
             }
             return `Task '${title}' not found.`;
        },
        getTasks: () => {
             if (!activeProjectIdRef.current) return "No active project.";
             const currentProject = projectsRef.current.find(p => p.id === activeProjectIdRef.current);
             if (!currentProject) return "Active project not found.";
             const allTasks = currentProject.tasks || [];
             if (allTasks.length === 0) return "The to-do list is empty.";
             const pending = allTasks.filter(t => !t.completed).map(t => `- [ ] ${t.title} (${t.priority})`);
             const completed = allTasks.filter(t => t.completed).map(t => `- [x] ${t.title}`);
             let response = "";
             if (pending.length > 0) response += `Here are the pending tasks:\n${pending.join('\n')}`;
             if (completed.length > 0) response += `\n\nCompleted:\n${completed.join('\n')}`;
             setViewMode('tasks'); 
             return response;
        }
    };

    serviceRef.current = new GeminiLiveService({
      onConnect: () => {
        setConnectionState(ConnectionState.CONNECTED);
        addLog('system', 'Connected to Gemini Live Agent.');
        if (user) {
            db.incrementDailyStats(user.username).then(newCount => setDailyRequests(newCount));
        }
        if (isScreenSharingRef.current) serviceRef.current?.notifyScreenStart();
      },
      onDisconnect: () => {
        setConnectionState(ConnectionState.IDLE);
        setAudioLevels({ user: 0, ai: 0 });
        addLog('system', 'Disconnected.');
      },
      onError: (err) => {
        setConnectionState(ConnectionState.ERROR);
        setErrorMsg(err.message);
        addLog('system', `Error: ${err.message}`);
      },
      onTranscript: (text, sender, isFinal, responseTime) => {
        setLogs(prev => {
          let matchIndex = -1;
          for (let i = prev.length - 1; i >= 0; i--) {
              if (prev[i].sender === sender && !prev[i].isFinal) {
                  matchIndex = i;
                  break;
              }
          }
          if (matchIndex !== -1) {
            const updatedLogs = [...prev];
            updatedLogs[matchIndex] = {
              ...updatedLogs[matchIndex],
              message: text,
              isFinal: isFinal,
              timestamp: new Date(),
              responseTime: responseTime !== undefined ? responseTime : updatedLogs[matchIndex].responseTime
            };
            return updatedLogs;
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
      onStats: (newStats) => setStats({ ...newStats }),
      onVolumeUpdate: (userVol, aiVol) => setAudioLevels({ user: userVol, ai: aiVol }),
      toolExecutors
    });

    return () => serviceRef.current?.disconnect();
  }, [user]);

  // Scroll to bottom
  useEffect(() => {
    if (viewMode === 'chat') {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, viewMode]);

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
    if (connectionState === ConnectionState.CONNECTED) handleStop();
    if (user && activeProjectId) {
         const currentProjects = projectsRef.current;
         const updatedProjects = currentProjects.map(p => {
            if (p.id === activeProjectId) {
                return { ...p, logs: logsRef.current, lastActive: new Date().toISOString() };
            }
            return p;
         });
         db.saveProjects(user.username, updatedProjects);
    }
    setUser(null);
    setIsDataLoaded(false);
    setProjects([]);
    setActiveProjectId(null);
    setLogs([]);
    setDailyRequests(0);
  };

  // Helper functions
  const handleExportData = async () => {
      if (!user) return;
      const jsonStr = await db.exportData(user.username);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
  };
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
          logs: [],
          tasks: []
      };
      const updatedProjects = [...projects, newProject];
      setProjects(updatedProjects);
      if (user) db.saveProjects(user.username, updatedProjects);
      selectProject(newProject.id);
      setIsCreateModalOpen(false);
  };
  const selectProject = (id: string) => {
      if (connectionState === ConnectionState.CONNECTED) handleStop();
      if (activeProjectId && user) {
        const updatedProjects = projects.map(p => {
            if (p.id === activeProjectId) {
                return { ...p, logs: logsRef.current, lastActive: new Date().toISOString() };
            }
            return p;
        });
        setProjects(updatedProjects);
        db.saveProjects(user.username, updatedProjects);
      }
      const project = projects.find(p => p.id === id);
      if (project) {
          setActiveProjectId(id);
          setLogs(project.logs || []);
          setViewMode('chat');
      }
  };
  const deleteProject = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (!user) return;
      const updated = projects.filter(p => p.id !== id);
      setProjects(updated);
      db.saveProjects(user.username, updated);
      if (activeProjectId === id) {
          setActiveProjectId(null);
          setLogs([]);
      }
  };
  const switchToQuickSession = () => {
      if (activeProjectId && user) {
          const updatedProjects = projects.map(p => {
            if (p.id === activeProjectId) {
                return { ...p, logs: logsRef.current, lastActive: new Date().toISOString() };
            }
            return p;
          });
          setProjects(updatedProjects);
          db.saveProjects(user.username, updatedProjects);
      }
      if (connectionState === ConnectionState.CONNECTED) handleStop();
      setActiveProjectId(null);
      setLogs([]);
      setViewMode('chat');
  };
  const handleStart = () => {
    if (!process.env.API_KEY) {
      setErrorMsg("API_KEY missing");
      setConnectionState(ConnectionState.ERROR);
      return;
    }
    setErrorMsg(null);
    setConnectionState(ConnectionState.CONNECTING);
    setIsMuted(false);
    setIsVideoPaused(false);
    if (screenShareRef.current) screenShareRef.current.start().catch(err => console.warn(err));
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
  };
  const handleSendText = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim()) return;
    serviceRef.current?.sendTextMessage(inputText);
    setInputText('');
  };
  const handleVideoFrame = useCallback((base64: string) => {
    if (connectionState === ConnectionState.CONNECTED) {
      serviceRef.current?.sendVideoFrame(base64);
    }
  }, [connectionState]);

  // Task Wrappers
  const handleAddTask = (task: Task) => {
      if (!activeProjectId) return;
      setProjects(prev => prev.map(p => {
          if (p.id === activeProjectId) return { ...p, tasks: [...(p.tasks || []), task], lastActive: new Date().toISOString() };
          return p;
      }));
  };
  const handleToggleTask = (taskId: string) => {
      if (!activeProjectId) return;
      setProjects(prev => prev.map(p => {
          if (p.id === activeProjectId) return { ...p, tasks: (p.tasks || []).map(t => t.id === taskId ? { ...t, completed: !t.completed } : t), lastActive: new Date().toISOString() };
          return p;
      }));
  };
  const handleEditTask = (taskId: string, newTitle: string) => {
    if (!activeProjectId) return;
    setProjects(prev => prev.map(p => {
        if (p.id === activeProjectId) return { ...p, tasks: (p.tasks || []).map(t => t.id === taskId ? { ...t, title: newTitle } : t), lastActive: new Date().toISOString() };
        return p;
    }));
  };
  const handleDeleteTask = (taskId: string) => {
      if (!activeProjectId) return;
      setProjects(prev => prev.map(p => {
          if (p.id === activeProjectId) return { ...p, tasks: (p.tasks || []).filter(t => t.id !== taskId), lastActive: new Date().toISOString() };
          return p;
      }));
  };

  // Subtask Wrappers
  const handleAddSubtask = (parentId: string, subtaskTitle: string) => {
      if (!activeProjectId) return;
      const newSubtask: Task = {
        id: Math.random().toString(36).substring(2, 9),
        title: subtaskTitle,
        completed: false,
        priority: 'Medium',
        dueDate: '',
        createdAt: new Date().toISOString(),
        subtasks: []
      };

      setProjects(prev => prev.map(p => {
          if (p.id === activeProjectId) {
              return {
                  ...p,
                  tasks: p.tasks.map(t => {
                      if (t.id === parentId) {
                          return { ...t, subtasks: [...(t.subtasks || []), newSubtask] };
                      }
                      return t;
                  }),
                  lastActive: new Date().toISOString()
              };
          }
          return p;
      }));
  };

  const handleToggleSubtask = (parentId: string, subtaskId: string) => {
    if (!activeProjectId) return;
    setProjects(prev => prev.map(p => {
        if (p.id === activeProjectId) {
            return {
                ...p,
                tasks: p.tasks.map(t => {
                    if (t.id === parentId) {
                        return { 
                            ...t, 
                            subtasks: (t.subtasks || []).map(st => st.id === subtaskId ? { ...st, completed: !st.completed } : st)
                        };
                    }
                    return t;
                }),
                lastActive: new Date().toISOString()
            };
        }
        return p;
    }));
  };

  const handleDeleteSubtask = (parentId: string, subtaskId: string) => {
    if (!activeProjectId) return;
    setProjects(prev => prev.map(p => {
        if (p.id === activeProjectId) {
            return {
                ...p,
                tasks: p.tasks.map(t => {
                    if (t.id === parentId) {
                        return { 
                            ...t, 
                            subtasks: (t.subtasks || []).filter(st => st.id !== subtaskId)
                        };
                    }
                    return t;
                }),
                lastActive: new Date().toISOString()
            };
        }
        return p;
    }));
  };

  const activeProject = projects.find(p => p.id === activeProjectId);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  return (
    <div className={`${theme} h-full w-full`}>
      <div className="relative w-full h-full flex overflow-hidden bg-slate-50 dark:bg-black/90 transition-colors duration-500">
         
         {/* Background Gradients */}
         <div className="absolute inset-0 z-0 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-[#1a1a1a] dark:to-black opacity-100 dark:opacity-100 transition-colors duration-500" />
         
         {!user ? (
            <LoginPage onLogin={setUser} theme={theme} />
         ) : (
             <div className="relative z-10 w-full h-full flex overflow-hidden">
                {/* Create Modal */}
                {isCreateModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md p-4 animate-in fade-in duration-200">
                    <div className="bg-white/90 dark:bg-black/80 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-2xl w-full max-w-sm overflow-hidden p-6 shadow-2xl">
                        <h3 className="font-semibold text-slate-800 dark:text-white text-lg mb-4 text-center">New Workspace</h3>
                        <form onSubmit={handleCreateProject} className="space-y-4">
                        <input
                            ref={newProjectInputRef}
                            type="text"
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            placeholder="Name your project"
                            className="w-full bg-slate-200/50 dark:bg-white/10 border border-transparent dark:border-white/10 rounded-lg px-4 py-2 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-white/40 focus:outline-none focus:bg-slate-200 dark:focus:bg-white/20 text-center transition-all"
                        />
                        <div className="flex gap-2 pt-2">
                            <button
                            type="button"
                            onClick={() => setIsCreateModalOpen(false)}
                            className="flex-1 px-4 py-2 rounded-lg text-slate-600 dark:text-white/60 hover:bg-slate-200 dark:hover:bg-white/5 transition-colors text-sm"
                            >
                            Cancel
                            </button>
                            <button
                            type="submit"
                            disabled={!newProjectName.trim()}
                            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium text-sm shadow-lg disabled:opacity-50"
                            >
                            Create
                            </button>
                        </div>
                        </form>
                    </div>
                    </div>
                )}

                {/* Sidebar */}
                <div className="w-64 bg-white/60 dark:bg-[#0f0f0f]/60 backdrop-blur-xl flex flex-col shrink-0 pt-5 pb-3 px-3 border-r border-slate-200 dark:border-white/5 transition-colors duration-500">
                    <div className="flex-1 overflow-y-auto space-y-1">
                        <div className="px-3 text-[10px] font-semibold text-slate-400 dark:text-white/40 uppercase tracking-widest mb-2 mt-2">Workspaces</div>
                        
                        <button onClick={switchToQuickSession} className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm transition-all ${!activeProjectId ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 dark:text-white/70 hover:bg-slate-200 dark:hover:bg-white/10'}`}>
                            <Zap className="w-4 h-4" />
                            Quick Session
                        </button>
                        
                        {projects.map(p => (
                            <div key={p.id} className="group relative">
                                <button onClick={() => selectProject(p.id)} className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm transition-all text-left ${activeProjectId === p.id ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 dark:text-white/70 hover:bg-slate-200 dark:hover:bg-white/10'}`}>
                                    <Folder className="w-4 h-4" />
                                    <span className="truncate">{p.name}</span>
                                </button>
                                <button onClick={(e) => deleteProject(e, p.id)} className="absolute right-2 top-1.5 p-0.5 text-slate-400 dark:text-white/40 hover:text-red-500 dark:hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                        
                        <button onClick={openCreateModal} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 dark:text-white/40 hover:text-slate-900 dark:hover:text-white transition-colors mt-2">
                            <Plus className="w-4 h-4" />
                            New Project
                        </button>
                    </div>

                    {/* User Profile */}
                    <div className="pt-4 mt-2 border-t border-slate-200 dark:border-white/5">
                        <div className="flex items-center gap-3 px-2 mb-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-400 to-indigo-500 flex items-center justify-center text-xs font-bold text-white shadow-md">
                                {user.username[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-slate-800 dark:text-white truncate">{user.username}</div>
                                <div className="text-[10px] text-slate-500 dark:text-white/40">Online</div>
                            </div>
                            <button onClick={toggleTheme} className="p-1.5 rounded-md text-slate-500 dark:text-white/40 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
                                {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                            </button>
                        </div>
                        <div className="flex gap-1">
                            <button onClick={handleExportData} className="flex-1 py-1.5 bg-slate-200/50 dark:bg-white/5 hover:bg-slate-300 dark:hover:bg-white/10 rounded-md text-[10px] text-slate-600 dark:text-white/60 font-medium transition-colors flex items-center justify-center gap-1">
                                <Download className="w-3 h-3" /> Backup
                            </button>
                            <button onClick={handleLogout} className="flex-1 py-1.5 bg-slate-200/50 dark:bg-white/5 hover:bg-red-100 dark:hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-300 rounded-md text-[10px] text-slate-600 dark:text-white/60 font-medium transition-colors flex items-center justify-center gap-1">
                                <LogOut className="w-3 h-3" /> Log Out
                            </button>
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col bg-white/40 dark:bg-black/20 backdrop-blur-sm relative transition-colors duration-500">
                    
                    {/* Header */}
                    <div className="h-14 border-b border-slate-200 dark:border-white/5 flex items-center justify-between px-6 bg-white/30 dark:bg-white/5 backdrop-blur-md">
                        <div className="flex items-center gap-3">
                            <h1 className="text-base font-semibold text-slate-800 dark:text-white tracking-wide">
                                {activeProjectId ? activeProject?.name : "Dashboard"}
                            </h1>
                            {connectionState !== ConnectionState.IDLE && (
                                <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${connectionState === ConnectionState.CONNECTED ? 'border-green-500/30 text-green-600 dark:text-green-400 bg-green-500/10' : 'border-yellow-500/30 text-yellow-600 dark:text-yellow-400 bg-yellow-500/10'}`}>
                                    {connectionState === ConnectionState.CONNECTED ? 'LIVE' : 'CONNECTING...'}
                                </div>
                            )}
                        </div>

                        {/* Tab Switcher */}
                        <div className="bg-slate-200 dark:bg-black/40 p-1 rounded-lg flex gap-1">
                            <button onClick={() => setViewMode('chat')} className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${viewMode === 'chat' ? 'bg-white dark:bg-white/20 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-white/40 hover:text-slate-900 dark:hover:text-white'}`}>Chat</button>
                            <button onClick={() => setViewMode('tasks')} className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${viewMode === 'tasks' ? 'bg-white dark:bg-white/20 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-white/40 hover:text-slate-900 dark:hover:text-white'}`}>Tasks</button>
                        </div>
                    </div>

                    <div className="flex-1 flex overflow-hidden">
                        {/* Left Panel: Monitor */}
                        <div className="w-[45%] flex flex-col p-6 gap-6 border-r border-slate-200 dark:border-white/5 overflow-y-auto">
                            
                            <div className="bg-slate-200 dark:bg-black/40 rounded-2xl overflow-hidden aspect-video relative shadow-xl border border-white/20 dark:border-white/5 ring-1 ring-black/5 dark:ring-white/5 group">
                                {connectionState === ConnectionState.IDLE ? (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 bg-gradient-to-br from-white/40 to-transparent dark:from-white/5 dark:to-transparent">
                                        <div className="w-16 h-16 rounded-full bg-white/50 dark:bg-white/5 flex items-center justify-center mb-4 backdrop-blur-sm border border-white/20 dark:border-white/10 shadow-sm">
                                            <Monitor className="w-8 h-8 text-slate-400 dark:text-white/60" />
                                        </div>
                                        <h3 className="text-slate-700 dark:text-white font-medium mb-1">AI Monitor</h3>
                                        <p className="text-xs text-slate-500 dark:text-white/40 mb-6">Connect to enable visual context</p>
                                        <button onClick={handleStart} className="px-6 py-2 bg-slate-900 dark:bg-white text-white dark:text-black font-semibold rounded-full hover:scale-105 transition-transform shadow-lg shadow-black/10 dark:shadow-white/10 flex items-center gap-2">
                                            <Play className="w-4 h-4 fill-current" /> Start Session
                                        </button>
                                    </div>
                                ) : (
                                    <ScreenShare 
                                        ref={screenShareRef}
                                        isActive={connectionState === ConnectionState.CONNECTED}
                                        isPaused={isVideoPaused}
                                        onFrame={handleVideoFrame}
                                        onStop={() => { isScreenSharingRef.current = false; handleStop(); }}
                                        onStart={() => { isScreenSharingRef.current = true; if(connectionState === ConnectionState.CONNECTED) serviceRef.current?.notifyScreenStart(); }}
                                    />
                                )}
                            </div>

                            {/* Controls */}
                            <div className="bg-white/40 dark:bg-white/5 rounded-2xl p-4 border border-white/20 dark:border-white/5 backdrop-blur-md shadow-sm space-y-4">
                                
                                {/* Audio Visualizers - The Core Interaction Enhancement */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-white/50 dark:bg-black/30 rounded-xl p-3 border border-white/20 dark:border-white/5 flex flex-col gap-2">
                                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-white/70">
                                            <Mic className={`w-3.5 h-3.5 ${audioLevels.user > 0.1 ? 'text-blue-500' : ''}`} />
                                            Microphone
                                        </div>
                                        <div className="h-12 w-full bg-slate-200/50 dark:bg-black/40 rounded-lg overflow-hidden relative">
                                            <Visualizer isActive={connectionState === ConnectionState.CONNECTED} volume={audioLevels.user} color="#3b82f6" />
                                        </div>
                                    </div>

                                    <div className="bg-white/50 dark:bg-black/30 rounded-xl p-3 border border-white/20 dark:border-white/5 flex flex-col gap-2">
                                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-white/70">
                                            <Bot className={`w-3.5 h-3.5 ${audioLevels.ai > 0.1 ? 'text-purple-500' : ''}`} />
                                            AI Voice
                                        </div>
                                        <div className="h-12 w-full bg-slate-200/50 dark:bg-black/40 rounded-lg overflow-hidden relative">
                                            <Visualizer isActive={connectionState === ConnectionState.CONNECTED} volume={audioLevels.ai} color="#a855f7" />
                                        </div>
                                    </div>
                                </div>

                                <div className="h-px bg-slate-200 dark:bg-white/10 w-full" />

                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <button onClick={handleMuteToggle} disabled={connectionState !== ConnectionState.CONNECTED} className={`p-3 rounded-full transition-all ${isMuted ? 'bg-red-500 text-white' : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-white hover:bg-slate-300 dark:hover:bg-white/20'}`}>
                                            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                                        </button>
                                        <button onClick={handleVideoPauseToggle} disabled={connectionState !== ConnectionState.CONNECTED} className={`p-3 rounded-full transition-all ${isVideoPaused ? 'bg-yellow-500 text-black' : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-white hover:bg-slate-300 dark:hover:bg-white/20'}`}>
                                            {isVideoPaused ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                                        </button>
                                    </div>
                                    {connectionState === ConnectionState.CONNECTED && (
                                        <button onClick={handleStop} className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 dark:text-red-300 rounded-lg text-xs font-medium border border-red-500/20 transition-colors">
                                            End Session
                                        </button>
                                    )}
                                </div>
                                <div className="space-y-3">
                                    <UsageBar label="Tokens / Min" current={stats.tokensPerMinute} max={FREE_TIER_LIMITS.TPM} unit="" />
                                    <UsageBar label="Daily Requests" current={dailyRequests} max={FREE_TIER_LIMITS.RPD} unit="" />
                                </div>
                            </div>
                        </div>

                        {/* Right Panel: Chat or Tasks */}
                        <div className="flex-1 bg-gradient-to-b from-white/20 to-transparent dark:from-white/5 dark:to-transparent flex flex-col relative">
                            {viewMode === 'chat' ? (
                                <>
                                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                        {logs.length === 0 && (
                                            <div className="h-full flex flex-col items-center justify-center opacity-40">
                                                <MessageSquare className="w-12 h-12 mb-3 text-slate-400 dark:text-white" />
                                                <p className="text-sm text-slate-500 dark:text-white">Conversation History</p>
                                            </div>
                                        )}
                                        {logs.map((log) => (
                                            <div key={log.id} className={`flex flex-col ${log.sender === 'user' ? 'items-end' : log.sender === 'ai' ? 'items-start' : 'items-center'}`}>
                                                {log.sender === 'system' ? (
                                                    <span className="text-[10px] text-slate-400 dark:text-white/30 uppercase tracking-widest my-2 px-2 py-1 bg-slate-200/50 dark:bg-white/5 rounded-full">{log.message}</span>
                                                ) : (
                                                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm backdrop-blur-sm ${
                                                        log.sender === 'user' 
                                                        ? 'bg-blue-600 text-white rounded-br-sm shadow-blue-500/20' 
                                                        : 'bg-white dark:bg-[#3A3A3C] text-slate-800 dark:text-white rounded-bl-sm border border-slate-100 dark:border-transparent'
                                                    }`}>
                                                        <SmoothText text={log.message} isFinal={log.isFinal} />
                                                    </div>
                                                )}
                                                {log.sender !== 'system' && (
                                                    <span className="text-[10px] text-slate-400 dark:text-white/20 mt-1 px-1">
                                                        {safeFormatTime(log.timestamp instanceof Date ? log.timestamp : new Date(log.timestamp))}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                        <div ref={logsEndRef} />
                                    </div>
                                    
                                    <div className="p-4 bg-white/60 dark:bg-white/5 backdrop-blur-md border-t border-slate-200 dark:border-white/5">
                                        <form onSubmit={handleSendText} className="relative">
                                            <input
                                                type="text"
                                                value={inputText}
                                                onChange={(e) => setInputText(e.target.value)}
                                                placeholder="Type a message..."
                                                className="w-full bg-slate-100 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-full pl-5 pr-12 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:bg-white dark:focus:bg-black/40 focus:border-blue-400 dark:focus:border-white/20 transition-all placeholder-slate-400 dark:placeholder-white/30"
                                            />
                                            <button type="submit" disabled={!inputText.trim()} className="absolute right-2 top-1.5 p-1.5 bg-blue-600 rounded-full text-white hover:bg-blue-500 disabled:opacity-0 transition-all shadow-md">
                                                <ArrowRight className="w-4 h-4" />
                                            </button>
                                        </form>
                                    </div>
                                </>
                            ) : (
                                <div className="flex-1 overflow-hidden">
                                    {activeProjectId ? (
                                        <TodoList 
                                            tasks={activeProject?.tasks || []} 
                                            onAddTask={handleAddTask}
                                            onToggleTask={handleToggleTask}
                                            onDeleteTask={handleDeleteTask}
                                            onEditTask={handleEditTask}
                                            onAddSubtask={handleAddSubtask}
                                            onToggleSubtask={handleToggleSubtask}
                                            onDeleteSubtask={handleDeleteSubtask}
                                        />
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center opacity-40">
                                            <ListTodo className="w-12 h-12 mb-3 text-slate-400 dark:text-white" />
                                            <p className="text-sm text-slate-500 dark:text-white">Select a Workspace</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
         )}
      </div>
    </div>
  );
};

export default App;