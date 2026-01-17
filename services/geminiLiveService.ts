import { GoogleGenAI, LiveServerMessage, Modality, GenerateContentResponse, FunctionDeclaration, Type } from "@google/genai";
import { createPcmBlob, decodeAudioData, base64ToUint8Array, arrayBufferToBase64 } from "./audioUtils";
import { UsageStats } from "../types";

// LiveSession is not exported from the SDK, so we derive it from the return type of connect()
type LiveSession = Awaited<ReturnType<GoogleGenAI['live']['connect']>>;

export interface ToolExecutors {
  createProject: (name: string) => string;
  switchProject: (name: string) => string;
  addTask: (title: string, priority: string) => string;
  editTask: (originalTitle: string, newTitle?: string, newPriority?: string) => string;
  markTaskComplete: (title: string) => string;
  getTasks: () => string;
}

interface LiveServiceCallbacks {
  onConnect: () => void;
  onDisconnect: () => void;
  onError: (error: Error) => void;
  onTranscript: (text: string, sender: 'user' | 'ai' | 'system', isFinal: boolean, responseTime?: number) => void;
  onStats: (stats: UsageStats) => void;
  onVolumeUpdate: (userVolume: number, aiVolume: number) => void;
  toolExecutors: ToolExecutors;
}

const TOOLS: FunctionDeclaration[] = [
  {
    name: "create_project",
    description: "Create a new project workspace with the given name and automatically switch to it.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: "The name of the new project" }
      },
      required: ["name"]
    }
  },
  {
    name: "switch_project",
    description: "Switch the active workspace to an existing project by matching its name.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: "The name of the project to switch to" }
      },
      required: ["name"]
    }
  },
  {
    name: "add_task",
    description: "Add a new to-do task to the currently active project.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "The content or title of the task" },
        priority: { 
            type: Type.STRING, 
            description: "Priority level of the task",
            enum: ["Low", "Medium", "High"]
        }
      },
      required: ["title"]
    }
  },
  {
    name: "edit_task",
    description: "Update an existing task's title or priority. You must provide the original title to identify the task.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        originalTitle: { type: Type.STRING, description: "The current title (or part of it) to identify the task." },
        newTitle: { type: Type.STRING, description: "The new title to set (optional)." },
        newPriority: { 
            type: Type.STRING, 
            description: "The new priority level (Low, Medium, High) (optional).",
            enum: ["Low", "Medium", "High"]
        }
      },
      required: ["originalTitle"]
    }
  },
  {
    name: "mark_task_complete",
    description: "Mark a task as completed in the current project by finding a task that matches the title.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "The title or partial title of the task to complete" }
      },
      required: ["title"]
    }
  },
  {
    name: "get_tasks",
    description: "Get the list of all tasks in the current project to see what needs to be done.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    }
  }
];

export class GeminiLiveService {
  private ai: GoogleGenAI;
  private session: LiveSession | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private mediaStream: MediaStream | null = null;
  private nextStartTime: number = 0;
  private audioSources: Set<AudioBufferSourceNode> = new Set();
  private callbacks: LiveServiceCallbacks;
  
  // Browser TTS
  private synthesis: SpeechSynthesis;
  private voice: SpeechSynthesisVoice | null = null;

  // Track transcription
  private currentInputTranscription = '';
  private currentOutputTranscription = '';

  // Cache the last video frame for text-based fallback
  private lastFrame: string | null = null;
  private isVideoStreamActive: boolean = true; // Tracks intended state, not just if we have a frame

  // Latency tracking
  private lastUserInteractionTime: number = 0;
  private responsePending: boolean = false;
  private currentTurnLatency: number | undefined = undefined;

  // Volume tracking
  private volumeInterval: number | null = null;
  private currentInputVolume = 0;

  // Usage Stats
  private stats: UsageStats = {
    imagesSent: 0,
    modelTurns: 0,
    estimatedTokens: 0,
    tokensPerMinute: 0
  };
  
  // Sliding window for TPM calculation (timestamp, tokenCount)
  private tokenHistory: { time: number, count: number }[] = [];
  private statsInterval: number | null = null;

  constructor(callbacks: LiveServiceCallbacks) {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    this.callbacks = callbacks;
    this.synthesis = window.speechSynthesis;
    
    // Initialize voices
    this.loadVoices();
    if (this.synthesis.onvoiceschanged !== undefined) {
      this.synthesis.onvoiceschanged = () => this.loadVoices();
    }
  }

  private loadVoices() {
    const voices = this.synthesis.getVoices();
    // Prioritize British English voices for Jarvis persona
    this.voice = voices.find(v => v.name.includes("Google UK English Male")) || 
                 voices.find(v => v.lang === "en-GB" && v.name.includes("Male")) ||
                 voices.find(v => v.lang === "en-GB") ||
                 voices.find(v => v.name.includes("Google US English")) || 
                 voices[0] || null;
  }

  // Helper to update token usage
  private recordTokenUsage(count: number) {
    const now = Date.now();
    this.tokenHistory.push({ time: now, count });
    // We do not filter here immediately; the interval handles the decay and filtering
    // to ensure UI updates even when no new tokens are added.
    this.updateStats();
  }

  private updateStats() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Filter out old entries
    this.tokenHistory = this.tokenHistory.filter(entry => entry.time > oneMinuteAgo);
    
    // Sum tokens in the last minute
    const tpm = this.tokenHistory.reduce((acc, entry) => acc + entry.count, 0);
    
    this.stats.tokensPerMinute = tpm;
    this.callbacks.onStats(this.stats);
  }

  public async connect() {
    try {
      // Reset stats on new connection
      this.stats = { imagesSent: 0, modelTurns: 0, estimatedTokens: 0, tokensPerMinute: 0 };
      this.tokenHistory = [];
      this.callbacks.onStats(this.stats);

      // Start Stats Interval for TPM Decay
      if (this.statsInterval) clearInterval(this.statsInterval);
      this.statsInterval = window.setInterval(() => {
         this.updateStats();
      }, 1000);

      // 1. Setup Audio Contexts
      // INPUT: Force 16000Hz because the model expects 16k PCM. 
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      
      // OUTPUT: Use NATIVE sample rate.
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Setup Analyser for AI Voice Visualization
      this.outputAnalyser = this.outputAudioContext.createAnalyser();
      this.outputAnalyser.fftSize = 64; // Low resolution is fine for volume
      this.outputAnalyser.smoothingTimeConstant = 0.5;
      this.outputAnalyser.connect(this.outputAudioContext.destination);

      this.nextStartTime = this.outputAudioContext.currentTime;

      // Start Volume Polling Loop
      if (this.volumeInterval) clearInterval(this.volumeInterval);
      this.volumeInterval = window.setInterval(() => {
          let aiVol = 0;
          if (this.outputAnalyser) {
              const data = new Uint8Array(this.outputAnalyser.frequencyBinCount);
              this.outputAnalyser.getByteFrequencyData(data);
              const sum = data.reduce((a, b) => a + b, 0);
              aiVol = sum / data.length / 255; // Normalize 0-1
          }
          
          // Smooth decay for input volume to prevent stuttering visuals
          this.currentInputVolume *= 0.85;
          if (this.currentInputVolume < 0.01) this.currentInputVolume = 0;

          this.callbacks.onVolumeUpdate(this.currentInputVolume, aiVol);
      }, 50);

      // 2. Get User Media (Microphone)
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
              channelCount: 1,
              sampleRate: 16000 // Request 16k from hardware if possible
          } 
      });

      // 3. Connect to Gemini Live
      const sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            console.log("Gemini Live Session Opened");
            this.callbacks.onConnect();
            if (this.mediaStream) {
                this.startAudioInputStream(this.mediaStream, sessionPromise);
            }
          },
          onmessage: (message) => this.handleMessage(message),
          onclose: (e) => {
            console.log("Gemini Live Session Closed", e);
            this.disconnect();
          },
          onerror: (e) => {
            console.error("Gemini Live Error", e);
            this.callbacks.onError(new Error("Connection error"));
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          // Provide the tools to the model
          tools: [{ functionDeclarations: TOOLS }],
          systemInstruction: `You are J.A.R.V.I.S., a highly advanced, formal, and efficient AI system. 
          
          WAKE WORD PROTOCOL:
          You are monitoring a continuous audio stream. You must ONLY respond, speak, or execute tools if the user explicitly says the name "Jarvis" (or "J.A.R.V.I.S"). 
          If the user speaks but does not address you as "Jarvis", you must remain silent and do nothing.

          PERSONA:
          Your tone is formal, polite, British, and concise. Similar to Tony Stark's AI. 
          Address the user as "Sir" (or "Ma'am").
          Be incredibly helpful but succinct.

          CONFIRMATION PROTOCOL:
          After executing any tool (like adding a task or switching projects), you MUST explicitly confirm the action to the user verbaly.
          Example: "I have added 'Buy milk' to your list, Sir." or "Project 'Alpha' created."

          VISUAL CONTEXT:
          You have continuous access to the user's screen.
          1. Use this visual context to answer questions about what is displayed (e.g., "What is this error?", "Who is that?").
          2. If the user refers to "this" or "that", use the screen content to identify the object.

          CAPABILITIES:
          You have tools to manage Projects and To-Do lists. Use them immediately when commanded.
          `,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        }
      });

      this.session = await sessionPromise;

    } catch (error) {
      console.error("Failed to connect:", error);
      this.callbacks.onError(error instanceof Error ? error : new Error("Unknown connection error"));
      this.disconnect();
    }
  }

  private startAudioInputStream(stream: MediaStream, sessionPromise: Promise<LiveSession>) {
    if (!this.inputAudioContext) return;

    this.inputSource = this.inputAudioContext.createMediaStreamSource(stream);
    // 2048 buffer size is a balance between latency (~128ms at 16k) and performance stability
    this.processor = this.inputAudioContext.createScriptProcessor(2048, 1, 1);

    this.processor.onaudioprocess = (e) => {
      // GUARD: If session is disconnected, stop processing immediately
      if (!this.session) return;

      const inputData = e.inputBuffer.getChannelData(0);
      
      // Calculate Input Volume (RMS)
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      // Boost sensitivity for visualizer
      this.currentInputVolume = Math.min(1, rms * 5); 

      const pcmBlob = createPcmBlob(inputData);
      
      // Calculate duration based on actual sample rate to be accurate even if fallback occurs
      const durationSeconds = inputData.length / e.inputBuffer.sampleRate;
      // Estimate audio tokens: ~32 tokens per second
      const estimatedTokens = Math.max(1, Math.ceil(durationSeconds * 32));
      
      this.recordTokenUsage(estimatedTokens);

      sessionPromise.then(session => {
        // Double check session match to prevent sending to closed session
        if (session && this.session === session && typeof session.sendRealtimeInput === 'function') {
          session.sendRealtimeInput({ media: pcmBlob });
        }
      });
    };

    this.inputSource.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  private executeTool(name: string, args: any): string {
      try {
          switch(name) {
              case 'create_project':
                  return this.callbacks.toolExecutors.createProject(args.name);
              case 'switch_project':
                  return this.callbacks.toolExecutors.switchProject(args.name);
              case 'add_task':
                  return this.callbacks.toolExecutors.addTask(args.title, args.priority || 'Medium');
              case 'edit_task':
                  return this.callbacks.toolExecutors.editTask(args.originalTitle, args.newTitle, args.newPriority);
              case 'mark_task_complete':
                  return this.callbacks.toolExecutors.markTaskComplete(args.title);
              case 'get_tasks':
                  return this.callbacks.toolExecutors.getTasks();
              default:
                  return "Unknown tool.";
          }
      } catch (e: any) {
          return `Error executing tool: ${e.message}`;
      }
  }

  private async handleMessage(message: LiveServerMessage) {
    // Track User Input Activity
    if (message.serverContent?.inputTranscription) {
      this.lastUserInteractionTime = Date.now();
      this.responsePending = true;
      this.currentTurnLatency = undefined; // Reset latency for the new turn
    }

    // 1. Handle Tool Calls
    if (message.toolCall) {
        // Execute tool logic
        const responses = [];
        for (const fc of message.toolCall.functionCalls) {
            const result = this.executeTool(fc.name, fc.args);

            responses.push({
                id: fc.id,
                name: fc.name,
                response: { result }
            });
            
            // Log tool execution as a system message
            this.callbacks.onTranscript(`[Tool Executed: ${fc.name}] -> ${result}`, 'system', true);
        }

        // Send results back to model
        if (this.session && responses.length > 0) {
            this.session.sendToolResponse({
                functionResponses: responses
            });
        }
    }

    // 2. Handle Audio Output (From Live API)
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      // Calculate latency if this is the first response after user input
      if (this.responsePending) {
        this.currentTurnLatency = Date.now() - this.lastUserInteractionTime;
        this.responsePending = false;
        // Notify logs immediately so user sees latency even if text lags
        this.callbacks.onTranscript(this.currentOutputTranscription, 'ai', false, this.currentTurnLatency);
      }

      if (this.outputAudioContext) {
        try {
          const audioData = base64ToUint8Array(base64Audio);
          const audioBuffer = await decodeAudioData(audioData, this.outputAudioContext);
          this.scheduleAudioPlay(audioBuffer);
        } catch (err) {
          console.error("Error decoding audio", err);
        }
      }
    }

    // 3. Handle Interruption
    if (message.serverContent?.interrupted) {
      this.stopAudioOutput();
      this.responsePending = false; // Reset if interrupted
    }

    // 4. Handle Transcriptions (Streaming)
    if (message.serverContent?.outputTranscription) {
      this.currentOutputTranscription += message.serverContent.outputTranscription.text;
      // Pass the calculated latency if we have it
      this.callbacks.onTranscript(this.currentOutputTranscription, 'ai', false, this.currentTurnLatency);
    }
    if (message.serverContent?.inputTranscription) {
      this.currentInputTranscription += message.serverContent.inputTranscription.text;
      this.callbacks.onTranscript(this.currentInputTranscription, 'user', false);
    }

    if (message.serverContent?.turnComplete) {
      // Update stats for model turn
      this.stats.modelTurns++;
      // Estimate Output Tokens: ~1.3 tokens per word, or roughly per character count
      // Just a loose heuristic: length / 4
      const outputTokens = Math.ceil(this.currentOutputTranscription.length / 4);
      this.recordTokenUsage(outputTokens);

      // Finalize transcriptions
      if (this.currentInputTranscription.trim()) {
        this.callbacks.onTranscript(this.currentInputTranscription, 'user', true);
        this.currentInputTranscription = '';
      }
      if (this.currentOutputTranscription.trim()) {
        this.callbacks.onTranscript(this.currentOutputTranscription, 'ai', true, this.currentTurnLatency);
        this.currentOutputTranscription = '';
        this.currentTurnLatency = undefined;
      }
    }
  }

  private scheduleAudioPlay(buffer: AudioBuffer) {
    if (!this.outputAudioContext) return;

    const source = this.outputAudioContext.createBufferSource();
    source.buffer = buffer;
    
    // Create a GainNode for smoothing (anti-pop) only at start
    const gainNode = this.outputAudioContext.createGain();
    
    // Routing: Source -> Gain -> Analyser -> Destination
    source.connect(gainNode);
    if (this.outputAnalyser) {
        gainNode.connect(this.outputAnalyser);
    } else {
        gainNode.connect(this.outputAudioContext.destination);
    }

    const currentTime = this.outputAudioContext.currentTime;
    
    // If nextStartTime is in the past, it means there was a silence gap or this is the start of a turn.
    // We add a tiny buffer to avoid cutting off the first millisecond.
    if (this.nextStartTime < currentTime) {
        this.nextStartTime = currentTime + 0.05; 
        
        // Only apply fade-in if we are starting fresh (prevent pop on attack)
        gainNode.gain.setValueAtTime(0, this.nextStartTime);
        gainNode.gain.linearRampToValueAtTime(1, this.nextStartTime + 0.02);
    } else {
        // Continuous stream: Keep gain at 1, do NOT fade between chunks
        gainNode.gain.setValueAtTime(1, this.nextStartTime);
    }

    // Schedule the playback
    source.start(this.nextStartTime);
    
    this.nextStartTime += buffer.duration;
    this.audioSources.add(source);

    source.onended = () => {
      this.audioSources.delete(source);
    };
  }

  private stopAudioOutput() {
    // 1. Stop Web Audio (Live API)
    this.audioSources.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    this.audioSources.clear();
    
    if (this.outputAudioContext) {
        this.nextStartTime = this.outputAudioContext.currentTime; 
    }
    
    // 2. Stop Browser TTS (Text Fallback)
    if (this.synthesis.speaking || this.synthesis.pending) {
        this.synthesis.cancel();
    }
  }

  public sendVideoFrame(base64Image: string) {
    this.lastFrame = base64Image;
    this.stats.imagesSent++;
    // 1 image ~ 258 tokens (Flash)
    this.recordTokenUsage(258);

    if (this.session && typeof (this.session as any).sendRealtimeInput === 'function') {
      (this.session as any).sendRealtimeInput({
        media: {
          mimeType: 'image/jpeg',
          data: base64Image
        }
      });
    }
  }

  public notifyScreenStart() {
    this.isVideoStreamActive = true;
    if (this.session && typeof (this.session as any).send === 'function') {
      try {
        (this.session as any).send({
          clientContent: {
            turns: [{
              role: 'user',
              // Explicitly tell the model to look at the video feed now.
              parts: [{ text: "I am now sharing my screen with you. Please look at the video feed." }]
            }],
            turnComplete: true
          }
        });
        // Input tokens for text
        this.recordTokenUsage(15); 
      } catch (e) {
        console.warn("Failed to notify screen start", e);
      }
    }
  }

  public notifyVideoStateChange(isPaused: boolean) {
    this.isVideoStreamActive = !isPaused;
    if (isPaused) {
        // Clear the buffer so text fallback doesn't use stale images
        this.lastFrame = null;
        this.sendSystemMessage("User has paused the video stream. You cannot see the screen right now.");
    } else {
        this.sendSystemMessage("User has resumed the video stream. You can see the screen again.");
    }
  }

  private sendSystemMessage(text: string) {
      if (this.session && typeof (this.session as any).send === 'function') {
          try {
            (this.session as any).send({
                clientContent: {
                    turns: [{
                        role: 'user',
                        parts: [{ text: `[System Event: ${text}]` }]
                    }],
                    turnComplete: true
                }
            });
          } catch(e) {
              console.warn("Failed to send system message", e);
          }
      }
  }

  // Safe helper to extract text without triggering getter warnings
  private getTextFromChunk(chunk: GenerateContentResponse): string | null {
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (!parts) return null;
      let text = '';
      for (const part of parts) {
          if (part.text) text += part.text;
      }
      return text || null;
  }

  public async sendTextMessage(text: string) {
    this.stopAudioOutput();

    if (this.outputAudioContext?.state === 'suspended') {
        try { await this.outputAudioContext.resume(); } catch(e) { console.warn("Failed to resume audio context", e); }
    }

    this.callbacks.onTranscript(text, 'user', true);
    const startTime = Date.now();
    
    try {
      // Estimate input tokens
      this.recordTokenUsage(Math.ceil(text.length / 4));

      const parts: any[] = [{ text }];
      if (this.lastFrame) {
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: this.lastFrame
          }
        });
        // Image token usage for fallback
        this.recordTokenUsage(258);
      } else {
         // Fallback logic if we don't have a frame yet
         const systemMsg = this.isVideoStreamActive 
            ? "[System: Video stream is active but no image frame has been received yet. If the user asks about the screen, tell them you are waiting for the video feed to sync.]" 
            : "[System: No screen shared / Video Paused]";
         parts[0].text = `${systemMsg} ${text}`;
      }

      const stream = await this.ai.models.generateContentStream({
        model: 'gemini-3-flash-preview',
        contents: { parts },
        config: {
          // Provide tools to the text model
          tools: [{ functionDeclarations: TOOLS }],
          // Sync system instruction with the Live one
          systemInstruction: `You are J.A.R.V.I.S., an advanced, formal, and efficient AI assistant.
          
          PERSONA:
          Your tone is formal, polite, British, and concise. Address the user as "Sir".

          CONFIRMATION PROTOCOL:
          After executing any tool, you MUST explicitly confirm to the user that the task was completed successfully.
          
          CONTEXT:
          You are receiving a text message and a stream of screen images. The user is sharing their screen with you.
          ALWAYS use the visual information from these images to answer questions.
          If the user asks 'what do you see' or about specific content on the screen, describe the latest image you received.
          
          TOOLS:
          You have tools to manage the user's Project and To-Do list.
          If the user asks to create a task, edit a task, create a project, or complete a task, use the appropriate tool.
          `
        }
      });

      let fullText = '';
      let textBuffer = '';
      let latency: number | undefined = undefined;
      
      for await (const chunk of stream) {
        const c = chunk as GenerateContentResponse;
        
        // Handle Tool Calls in text mode
        if (c.functionCalls && c.functionCalls.length > 0) {
            for (const fc of c.functionCalls) {
                const result = this.executeTool(fc.name, fc.args);
                this.callbacks.onTranscript(`[Tool Executed: ${fc.name}] -> ${result}`, 'system', true);
            }
        }

        // Use safe helper instead of c.text to avoid warnings on non-text chunks
        const chunkText = this.getTextFromChunk(c);
        
        if (chunkText) {
          // Capture latency on first token
          if (latency === undefined) {
             latency = Date.now() - startTime;
          }

          fullText += chunkText;
          textBuffer += chunkText;
          this.callbacks.onTranscript(fullText, 'ai', false, latency);

          // Process complete sentences for smoother TTS
          let match;
          while ((match = textBuffer.match(/([.!?]+)(\s+|$)/))) {
             if (textBuffer.length < 8 && !match[0].includes('\n')) {
                 break; 
             }
             const separatorIndex = match.index! + match[0].length;
             const sentence = textBuffer.slice(0, separatorIndex);
             textBuffer = textBuffer.slice(separatorIndex);
             
             if (sentence.trim()) {
               this.processTTSChunk(sentence);
             }
          }
        }
      }

      if (textBuffer.trim()) {
        this.processTTSChunk(textBuffer);
      }

      if (fullText) {
        this.callbacks.onTranscript(fullText, 'ai', true, latency);
        // Count text fallback as a turn
        this.stats.modelTurns++;
        this.recordTokenUsage(Math.ceil(fullText.length / 4));
      }
    } catch (error: any) {
      console.error("Text fallback failed:", error);
      this.callbacks.onTranscript(`Error: ${error.message}`, 'system', true);
    }
  }

  private processTTSChunk(text: string) {
      // Use Browser Native TTS
      // Sanitize text: remove markdown characters (*, _, `) and trim whitespace
      const cleanText = text.replace(/[*_`]/g, '').trim();
      if (!cleanText) return;

      const utterance = new SpeechSynthesisUtterance(cleanText);
      if (this.voice) {
          utterance.voice = this.voice;
      }
      utterance.rate = 1.0; 
      utterance.pitch = 1.0;
      
      this.synthesis.speak(utterance);
  }

  public setMuted(muted: boolean) {
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach(track => {
        track.enabled = !muted;
      });
    }
  }

  public disconnect() {
    // Stop Stats Interval
    if (this.statsInterval) {
        clearInterval(this.statsInterval);
        this.statsInterval = null;
    }
    
    // Stop Volume Polling
    if (this.volumeInterval) {
        clearInterval(this.volumeInterval);
        this.volumeInterval = null;
    }

    const wasConnected = this.session !== null;

    // Explicitly nullify session first to stop onaudioprocess logic
    const currentSession = this.session;
    this.session = null;

    if (currentSession) {
        try {
            // Close the connection explicitly
            (currentSession as any).close();
        } catch(e) {
            console.warn("Failed to close session", e);
        }
    }

    this.stopAudioOutput();
    this.lastFrame = null;
    this.tokenHistory = [];
    this.isVideoStreamActive = true; // Reset assumption
    
    if (this.inputSource) {
      try { this.inputSource.disconnect(); } catch (e) {}
    }
    if (this.processor) {
      try {
        this.processor.disconnect();
        this.processor.onaudioprocess = null;
      } catch (e) {}
    }
    
    try {
      if (this.inputAudioContext && this.inputAudioContext.state !== 'closed') {
        this.inputAudioContext.close();
      }
    } catch (e) { /* ignore already closed */ }
    
    try {
      if (this.outputAudioContext && this.outputAudioContext.state !== 'closed') {
        this.outputAudioContext.close();
      }
    } catch (e) { /* ignore already closed */ }
    
    if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
    }

    // Only notify if we were previously connected to avoid loops
    if (wasConnected) {
        this.callbacks.onDisconnect();
    }
  }
}