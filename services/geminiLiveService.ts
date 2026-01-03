import { GoogleGenAI, LiveServerMessage, Modality, GenerateContentResponse } from "@google/genai";
import { createPcmBlob, decodeAudioData, base64ToUint8Array, arrayBufferToBase64 } from "./audioUtils";

// LiveSession is not exported from the SDK, so we derive it from the return type of connect()
type LiveSession = Awaited<ReturnType<GoogleGenAI['live']['connect']>>;

interface LiveServiceCallbacks {
  onConnect: () => void;
  onDisconnect: () => void;
  onError: (error: Error) => void;
  onTranscript: (text: string, sender: 'user' | 'ai' | 'system', isFinal: boolean, responseTime?: number) => void;
}

export class GeminiLiveService {
  private ai: GoogleGenAI;
  private session: LiveSession | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
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

  // Latency tracking
  private lastUserInteractionTime: number = 0;
  private responsePending: boolean = false;
  private currentTurnLatency: number | undefined = undefined;

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
    // Prioritize Google voices or decent English voices
    this.voice = voices.find(v => v.name.includes("Google US English")) || 
                 voices.find(v => v.name.includes("Google") && v.lang.startsWith("en")) || 
                 voices.find(v => v.lang === "en-US") || 
                 voices.find(v => v.lang.startsWith("en")) || 
                 voices[0] || null;
  }

  public async connect() {
    try {
      // 1. Setup Audio Contexts
      // INPUT: Force 16000Hz because the model expects 16k PCM. 
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      
      // OUTPUT: Use NATIVE sample rate.
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      this.nextStartTime = this.outputAudioContext.currentTime;

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
          systemInstruction: "You are an intelligent screen-monitoring assistant. I may share my screen with you. If I am sharing my screen, I will send video frames. Please watch the screen continuously. If you have NOT received any video frames yet, assume I am not sharing my screen and explicitly state that you cannot see the screen if asked. Do not hallucinate or make up details about the screen content if you cannot see it. When I ask questions, answer them based on what you see (if available) and your general knowledge. Be concise, helpful, and attentive.",
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
      const inputData = e.inputBuffer.getChannelData(0);
      const pcmBlob = createPcmBlob(inputData);
      
      sessionPromise.then(session => {
        if (session && typeof session.sendRealtimeInput === 'function') {
          session.sendRealtimeInput({ media: pcmBlob });
        }
      });
    };

    this.inputSource.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  private async handleMessage(message: LiveServerMessage) {
    // Track User Input Activity
    if (message.serverContent?.inputTranscription) {
      this.lastUserInteractionTime = Date.now();
      this.responsePending = true;
      this.currentTurnLatency = undefined; // Reset latency for the new turn
    }

    // 1. Handle Audio Output (From Live API)
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

    // 2. Handle Interruption
    if (message.serverContent?.interrupted) {
      this.stopAudioOutput();
      this.responsePending = false; // Reset if interrupted
    }

    // 3. Handle Transcriptions (Streaming)
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
    
    // Create a GainNode for smoothing (anti-pop)
    const gainNode = this.outputAudioContext.createGain();
    source.connect(gainNode);
    gainNode.connect(this.outputAudioContext.destination);

    const currentTime = this.outputAudioContext.currentTime;
    
    // SAFETY BUFFER: If we are starting from silence or a gap, add a small lookahead (50ms).
    if (this.nextStartTime < currentTime) {
        this.nextStartTime = currentTime + 0.05; 
    }

    // Apply micro-fades to prevent clicking at chunk boundaries
    const FADE_DURATION = 0.005; // 5ms
    gainNode.gain.setValueAtTime(0, this.nextStartTime);
    gainNode.gain.linearRampToValueAtTime(1, this.nextStartTime + FADE_DURATION);
    gainNode.gain.setValueAtTime(1, this.nextStartTime + buffer.duration - FADE_DURATION);
    gainNode.gain.linearRampToValueAtTime(0, this.nextStartTime + buffer.duration);

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
    if (this.session && typeof (this.session as any).send === 'function') {
      try {
        (this.session as any).send({
          clientContent: {
            turns: [{
              role: 'user',
              parts: [{ text: "System notification: I have started sharing my screen." }]
            }],
            turnComplete: true
          }
        });
      } catch (e) {
        console.warn("Failed to notify screen start", e);
      }
    }
  }

  public async sendTextMessage(text: string) {
    this.stopAudioOutput();

    if (this.outputAudioContext?.state === 'suspended') {
        try { await this.outputAudioContext.resume(); } catch(e) { console.warn("Failed to resume audio context", e); }
    }

    this.callbacks.onTranscript(text, 'user', true);
    const startTime = Date.now();
    
    try {
      const parts: any[] = [{ text }];
      if (this.lastFrame) {
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: this.lastFrame
          }
        });
      } else {
         parts[0].text = `[System: No screen shared] ${text}`;
      }

      const stream = await this.ai.models.generateContentStream({
        model: 'gemini-3-flash-preview',
        contents: { parts },
        config: {
          systemInstruction: "You are an intelligent screen-monitoring assistant. I may share my screen with you. If I am sharing my screen, I will send video frames. Please watch the screen continuously. If you have NOT received any video frames yet, assume I am not sharing my screen and explicitly state that you cannot see the screen if asked. Do not hallucinate or make up details about the screen content if you cannot see it."
        }
      });

      let fullText = '';
      let textBuffer = '';
      let latency: number | undefined = undefined;
      
      for await (const chunk of stream) {
        const c = chunk as GenerateContentResponse;
        if (c.text) {
          // Capture latency on first token
          if (latency === undefined) {
             latency = Date.now() - startTime;
          }

          fullText += c.text;
          textBuffer += c.text;
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
    this.stopAudioOutput();
    this.lastFrame = null;
    
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

    this.session = null;
    this.callbacks.onDisconnect();
  }
}