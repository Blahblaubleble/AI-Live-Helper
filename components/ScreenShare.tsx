import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';

export interface ScreenShareHandle {
  start: () => Promise<void>;
  stop: () => void;
}

interface ScreenShareProps {
  onFrame: (base64: string) => void;
  onStop: () => void;
  onStart?: () => void;
  isActive: boolean;
  isPaused?: boolean;
}

const ScreenShare = forwardRef<ScreenShareHandle, ScreenShareProps>(({ onFrame, onStop, onStart, isActive, isPaused = false }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  
  // Rate limiting ref to prevent "going crazy" loops
  const lastFrameTimeRef = useRef<number>(0);

  const stopSharing = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsSharing(false);
    onStop();
  }, [onStop]);

  // Capture frame function extracted for reuse
  const captureAndSendFrame = useCallback(() => {
      if (!videoRef.current || !canvasRef.current) return;
      
      const now = Date.now();
      // Hard throttle: never send more than 1 frame per 500ms, protecting against loops
      if (now - lastFrameTimeRef.current < 500) {
          return;
      }
      lastFrameTimeRef.current = now;
      
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (ctx && video.videoWidth > 0 && video.videoHeight > 0) {
        // Downscale to max 800px width for performance
        const MAX_WIDTH = 800;
        const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
        
        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;
        
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Compress to JPEG 0.5 to further reduce payload size
        const base64Data = canvas.toDataURL('image/jpeg', 0.5);
        const data = base64Data.split(',')[1];
        onFrame(data);
      }
  }, [onFrame]);

  const startSharing = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1280 }, // Capture at decent res for preview
          height: { ideal: 720 },
          frameRate: { ideal: 5 }
        },
        audio: false 
      });

      // If we are already sharing, stop the previous stream to avoid multiple tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      streamRef.current = stream;
      
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length > 0) {
        videoTracks[0].onended = () => {
          stopSharing();
        };
      }

      setIsSharing(true);
      // NOTE: We do not set srcObject or call onStart here anymore.
      // We wait for the state update to mount the <video>, then useEffect sets srcObject,
      // then onLoadedData triggers the first frame and notification.

    } catch (err: any) {
      // Handle user cancellation gracefully
      if (err.name === 'NotAllowedError' || err.message?.includes('Permission denied')) {
        console.log("Screen share permission denied or cancelled by user.");
      } else {
        console.error("Error starting screen share:", err);
      }

      // Check if we still have a valid active stream from before
      const hasActiveStream = streamRef.current && 
                              streamRef.current.active && 
                              streamRef.current.getVideoTracks().length > 0 &&
                              streamRef.current.getVideoTracks()[0].readyState === 'live';

      if (!hasActiveStream) {
        setIsSharing(false);
      }
    }
  };

  useImperativeHandle(ref, () => ({
    start: startSharing,
    stop: stopSharing
  }));

  // When video data is loaded, play it, send the first frame, and notify the agent.
  // This ensures the agent receives the visual context BEFORE or WITH the "I am sharing" message.
  const handleVideoLoad = () => {
    if (videoRef.current) {
      videoRef.current.play()
        .then(() => {
          console.log("Video playing, sending initial frame...");
          captureAndSendFrame();
          if (onStart) onStart();
        })
        .catch(e => console.error("Error playing video preview:", e));
    }
  };

  useEffect(() => {
    if (isSharing && videoRef.current && streamRef.current) {
      // Ensure srcObject is set if re-rendering or mounting
      if (videoRef.current.srcObject !== streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          // Note: we rely on onLoadedData to play and trigger start logic
      }
    }
  }, [isSharing]);

  useEffect(() => {
    // If paused, do not set interval
    if (!isActive || !isSharing) return;
    
    if (isPaused) return;

    // Send a frame every 2000ms (0.5 FPS) - Reduced from 1000ms to save tokens
    const intervalId = setInterval(captureAndSendFrame, 2000); 

    return () => clearInterval(intervalId);
  }, [isActive, isSharing, isPaused, captureAndSendFrame]);

  // Force immediate frame capture when unpausing
  // This prevents the "I can't see anything" gap between resume and the next interval tick
  useEffect(() => {
    if (isActive && isSharing && !isPaused) {
      captureAndSendFrame();
    }
  }, [isPaused, isActive, isSharing, captureAndSendFrame]);

  // Determine badge text and color
  let badgeText = 'LIVE MONITORING';
  let badgeColor = 'bg-emerald-500/90 animate-pulse'; // Green for live

  if (isPaused) {
      badgeText = 'VIDEO PAUSED (SAVING TOKENS)';
      badgeColor = 'bg-yellow-500/90';
  } else if (!isActive) {
      badgeText = 'WAITING FOR CONNECTION...';
      badgeColor = 'bg-blue-500/80 animate-pulse';
  }

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-black/50 rounded-xl overflow-hidden border border-slate-700 group">
      {!isSharing ? (
        <div className="text-slate-400 text-center p-6">
          <p className="mb-4">Monitor your screen with AI</p>
          <button 
            onClick={startSharing}
            disabled={!isActive}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              isActive 
              ? "bg-blue-600 hover:bg-blue-500 text-white" 
              : "bg-slate-700 text-slate-500 cursor-not-allowed"
            }`}
          >
            {isActive ? "Select Screen to Share" : "Connect first to Share Screen"}
          </button>
        </div>
      ) : (
        <>
           <video 
            ref={videoRef} 
            className={`max-w-full max-h-full object-contain transition-opacity duration-300 ${isPaused ? 'opacity-50 grayscale' : 'opacity-100'}`}
            onLoadedData={handleVideoLoad}
            muted 
            playsInline
            autoPlay
          />
          
          {/* Status Badge */}
          <div className={`absolute top-2 left-2 px-2 py-1 text-white text-xs font-bold tracking-wide rounded pointer-events-none transition-colors duration-300 shadow-lg ${badgeColor}`}>
            {badgeText}
          </div>
          
          {/* Change Screen Button Overlay */}
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
             <button
               onClick={startSharing}
               className="flex items-center gap-2 px-4 py-2 bg-slate-900/80 hover:bg-blue-600 text-white text-sm font-medium rounded-full backdrop-blur-md border border-slate-600 shadow-xl transition-all hover:scale-105"
             >
               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path><path d="M13.5 10.5 21 3"></path><path d="M16 3h5v5"></path></svg>
               Change Screen
             </button>
          </div>
        </>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
});

ScreenShare.displayName = 'ScreenShare';

export default ScreenShare;