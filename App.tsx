import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GeminiLiveService } from './services/geminiLiveService';
import ScreenShare, { ScreenShareHandle } from './components/ScreenShare';
import { ConnectionState, LogEntry, UsageStats } from './types';
import { Play, Square, AlertCircle, Mic, MicOff, Monitor, Send, Clock, Image as ImageIcon, MessageSquare, Zap, Activity, Video, VideoOff } from 'lucide-react';

const FREE_TIER_LIMITS = {
  TPM: 1000000, // 1 Million Tokens Per Minute
  RPD: 1500     // 1,500 Requests Per Day
};

const SmoothText = ({ text, isFinal }: { text: string; isFinal?: boolean }) => {
  // If the message is final on mount (e.g. user message or history), show immediately.
  // Otherwise start empty and type out.
  const [displayedText, setDisplayedText] = useState(isFinal ? text : '');
  const indexRef = useRef(isFinal ? text.length : 0);

  useEffect(() => {
    // If text prop matches what we have, stop.
    if (text.length <= indexRef.current) {
       // Safety: if text shrunk, reset.
       if (text.length < indexRef.current) {
         setDisplayedText(text);
         indexRef.current = text.length;
       }
       return;
    }

    const interval = setInterval(() => {
      if (indexRef.current < text.length) {
        // Dynamic typing speed: catch up faster if we are far behind
        const remaining = text.length - indexRef.current;
        let step = 1;
        if (remaining > 50) step = 5;
        else if (remaining > 20) step = 3;
        else if (remaining > 10) step = 2;

        // If the message is complete (isFinal), finish up quickly but smoothly
        if (isFinal && remaining > 5) step = Math.max(step, 4);

        indexRef.current = Math.min(text.length, indexRef.current + step);
        setDisplayedText(text.slice(0, indexRef.current));
      } else {
        clearInterval(interval);
      }
    }, 15); // 15ms base interval

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
        <div 
          className={`h-full ${colorClass} transition-all duration-500 ease-out`} 
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.IDLE);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoPaused, setIsVideoPaused] = useState(false);
  const [inputText, setInputText] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  // Real-time stats from service
  const [stats, setStats] = useState<UsageStats>({ imagesSent: 0, modelTurns: 0, estimatedTokens: 0, tokensPerMinute: 0 });
  
  // Persisted daily stats
  const [dailyRequests, setDailyRequests] = useState(0);

  const serviceRef = useRef<GeminiLiveService | null>(null);
  const screenShareRef = useRef<ScreenShareHandle>(null);
  const isScreenSharingRef = useRef(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Load daily requests from localStorage on mount
  useEffect(() => {
    const today = new Date().toDateString();
    const stored = localStorage.getItem('screenSentinel_dailyStats');
    if (stored) {
      const { date, count } = JSON.parse(stored);
      if (date === today) {
        setDailyRequests(count);
      } else {
        // New day, reset
        localStorage.setItem('screenSentinel_dailyStats', JSON.stringify({ date: today, count: 0 }));
        setDailyRequests(0);
      }
    } else {
       localStorage.setItem('screenSentinel_dailyStats', JSON.stringify({ date: today, count: 0 }));
    }
  }, []);

  // Initialize service ref
  useEffect(() => {
    serviceRef.current = new GeminiLiveService({
      onConnect: () => {
        setConnectionState(ConnectionState.CONNECTED);
        addLog('system', 'Connected to Gemini Live Agent.');
        
        // INCREMENT DAILY REQUESTS
        const today = new Date().toDateString();
        const stored = localStorage.getItem('screenSentinel_dailyStats');
        let currentCount = 0;
        
        if (stored) {
          try {
            const { date, count } = JSON.parse(stored);
            if (date === today) {
              currentCount = count;
            }
          } catch (e) { /* ignore parse error */ }
        }
        
        const newCount = currentCount + 1;
        localStorage.setItem('screenSentinel_dailyStats', JSON.stringify({ date: today, count: newCount }));
        setDailyRequests(newCount);

        // Notify screen start if video is already ready
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
  }, []); 

  // Auto scroll logs
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
    
    // 1. Trigger Screen Share Immediately (Requires user gesture, so we do it here)
    if (screenShareRef.current) {
        screenShareRef.current.start().catch(err => {
            console.warn("Screen share start failed or cancelled", err);
        });
    }

    // 2. Connect to Service
    serviceRef.current?.connect();
  };

  const handleStop = () => {
    serviceRef.current?.disconnect();
    // Screen share stop is handled by component prop logic mostly, but if button clicked we should stop both
    screenShareRef.current?.stop();
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

  // Critical: useCallback prevents this function from changing on every render (e.g. typing logs),
  // which prevents the ScreenShare component from constantly resetting/firing its effects.
  const handleVideoFrame = useCallback((base64: string) => {
    if (connectionState === ConnectionState.CONNECTED) {
      serviceRef.current?.sendVideoFrame(base64);
    }
  }, [connectionState]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col p-4 md:p-8">
      {/* Header */}
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
            ScreenSentinel AI
          </h1>
          <p className="text-slate-400 text-sm">Always-on screen monitoring agent</p>
        </div>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${
            connectionState === ConnectionState.CONNECTED ? 'bg-green-500 animate-pulse' : 
            connectionState === ConnectionState.CONNECTING ? 'bg-yellow-500 animate-bounce' : 'bg-slate-600'
          }`} />
          <span className="text-xs font-mono uppercase text-slate-500">{connectionState}</span>
        </div>
      </header>

      {/* Main Content Grid */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
        
        {/* Left Column: Screen & Controls & Stats */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Screen Share Viewport */}
          <div className="flex-1 bg-slate-800 rounded-2xl p-1 shadow-2xl shadow-black/50 border border-slate-700 relative min-h-[400px]">
            {connectionState === ConnectionState.IDLE && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-sm rounded-xl">
                <Monitor className="w-16 h-16 text-slate-600 mb-4" />
                <h3 className="text-xl font-semibold text-slate-300">Ready to Monitor</h3>
                <p className="text-slate-500 max-w-md text-center mt-2 mb-8">
                  Connect to start the AI agent. It will watch your screen and listen to your voice commands in real-time.
                </p>
                <button
                  onClick={handleStart}
                  className="flex items-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-bold shadow-lg shadow-blue-500/20 transition-all transform hover:scale-105"
                >
                  <Play className="w-5 h-5" fill="currentColor" />
                  START AGENT
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
                  // Video is ready
                  isScreenSharingRef.current = true;
                  if (connectionState === ConnectionState.CONNECTED) {
                      serviceRef.current?.notifyScreenStart();
                  }
              }}
            />
          </div>

          {/* Control Bar */}
          <div className="h-24 bg-slate-800 rounded-2xl border border-slate-700 flex items-center justify-between px-8">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${
                connectionState === ConnectionState.CONNECTED 
                   ? (isMuted ? 'bg-slate-500' : 'bg-green-500 animate-pulse')
                   : 'bg-slate-600'
              }`} />
              <span className="text-slate-400 font-medium hidden sm:inline">
                {connectionState === ConnectionState.CONNECTED 
                  ? (isVideoPaused ? "Video Paused (Audio Only)" : "Live Video & Audio") 
                  : "Agent Idle"}
              </span>
            </div>

            <div className="flex items-center gap-4">
              {/* Mic Toggle */}
              <button
                onClick={handleMuteToggle}
                disabled={connectionState !== ConnectionState.CONNECTED}
                className={`p-4 rounded-full transition-colors ${
                  isMuted 
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' 
                    : 'bg-slate-700 hover:bg-slate-600 text-blue-400'
                } ${connectionState !== ConnectionState.CONNECTED ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
              >
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>
              
              {/* Video Pause Toggle */}
               <button
                onClick={handleVideoPauseToggle}
                disabled={connectionState !== ConnectionState.CONNECTED}
                className={`p-4 rounded-full transition-colors ${
                  isVideoPaused 
                    ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30' 
                    : 'bg-slate-700 hover:bg-slate-600 text-emerald-400'
                } ${connectionState !== ConnectionState.CONNECTED ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={isVideoPaused ? "Resume Video Stream" : "Pause Video Stream"}
              >
                {isVideoPaused ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
              </button>

              {connectionState === ConnectionState.CONNECTED && (
               <button 
                onClick={handleStop}
                className="p-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-full transition border border-red-500/30"
                title="Stop Agent"
               >
                 <Square className="w-6 h-6" fill="currentColor" />
               </button>
             )}
            </div>
          </div>
          
          {/* Usage Limit Bars */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <UsageBar 
               label="Current Speed (Tokens / Min)" 
               current={stats.tokensPerMinute} 
               max={FREE_TIER_LIMITS.TPM} 
               unit="TPM"
             />
             <UsageBar 
               label="Daily Requests (Sessions)" 
               current={dailyRequests} 
               max={FREE_TIER_LIMITS.RPD} 
               unit="Reqs"
             />
          </div>

        </div>

        {/* Right Column: Conversation Log & Text Input */}
        <div className="bg-slate-800 rounded-2xl border border-slate-700 flex flex-col overflow-hidden max-h-[calc(100vh-8rem)]">
          <div className="p-4 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center">
            <h2 className="font-semibold text-slate-300">Live Transcript</h2>
            <div className="flex items-center gap-2 text-xs text-slate-500">
               <Activity className="w-3 h-3" />
               <span>{stats.modelTurns} turns</span>
            </div>
          </div>
          
          {/* Logs */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
            {logs.length === 0 && (
              <div className="text-center text-slate-600 mt-10 italic">
                Conversation will appear here...
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
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                  log.sender === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 
                  log.sender === 'ai' ? 'bg-slate-700 text-slate-200 rounded-bl-none' : 
                  'bg-transparent text-slate-500 text-xs italic'
                }`}>
                  <SmoothText text={log.message} isFinal={log.isFinal} />
                </div>
                {log.sender !== 'system' && (
                  <div className="flex items-center gap-2 mt-1 px-1">
                     <span className="text-[10px] text-slate-500">
                      {log.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second: '2-digit'})}
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

          {/* Text Input Area */}
          <div className="p-4 bg-slate-900 border-t border-slate-700">
            <form onSubmit={handleSendText} className="flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={connectionState !== ConnectionState.CONNECTED}
                placeholder={connectionState === ConnectionState.CONNECTED ? "Type a message..." : "Start agent to chat"}
                className="flex-1 bg-slate-800 text-slate-200 placeholder-slate-500 border border-slate-700 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || connectionState !== ConnectionState.CONNECTED}
                className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-500 disabled:opacity-50 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          </div>
        </div>

      </main>
    </div>
  );
};

export default App;