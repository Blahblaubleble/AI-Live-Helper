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
  const [streamKey, setStreamKey] = useState<string | null>(null);
  
  const lastFrameTimeRef = useRef<number>(0);

  const stopSharing = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsSharing(false);
    setStreamKey(null);
    onStop();
  }, [onStop]);

  const captureAndSendFrame = useCallback(() => {
      if (!videoRef.current || !canvasRef.current) return;
      
      const now = Date.now();
      if (now - lastFrameTimeRef.current < 500) {
          return;
      }
      lastFrameTimeRef.current = now;
      
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (ctx && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        const MAX_WIDTH = 800;
        const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64Data = canvas.toDataURL('image/jpeg', 0.5);
        const data = base64Data.split(',')[1];
        onFrame(data);
      }
  }, [onFrame]);

  const startSharing = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 5 } },
        audio: false 
      });

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      streamRef.current = stream;
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length > 0) {
        videoTracks[0].onended = () => stopSharing();
      }

      setStreamKey(stream.id);
      setIsSharing(true);
    } catch (err: any) {
        console.log("Screen share cancelled or failed.");
        setIsSharing(false);
    }
  };

  useImperativeHandle(ref, () => ({
    start: startSharing,
    stop: stopSharing
  }));

  const handleVideoLoad = () => {
    if (videoRef.current) {
      videoRef.current.play()
        .then(() => {
          setTimeout(captureAndSendFrame, 100);
          if (onStart) onStart();
        })
        .catch(e => console.error("Error playing video:", e));
    }
  };

  useEffect(() => {
    if (isSharing && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
      }
    }
  }, [isSharing, streamKey]);

  useEffect(() => {
    if (!isActive || !isSharing || isPaused) return;
    const intervalId = setInterval(captureAndSendFrame, 2000); 
    return () => clearInterval(intervalId);
  }, [isActive, isSharing, isPaused, captureAndSendFrame]);

  useEffect(() => {
    if (isActive && isSharing && !isPaused) captureAndSendFrame();
  }, [isPaused, isActive, isSharing, captureAndSendFrame]);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-black/60 rounded-xl overflow-hidden shadow-inner group">
      {!isSharing ? (
        <div className="text-center p-6 transition-all transform hover:scale-105">
          <button 
            onClick={startSharing}
            disabled={!isActive}
            className={`px-6 py-3 rounded-full font-medium transition-all shadow-lg backdrop-blur-sm ${
              isActive 
              ? "bg-blue-600/90 hover:bg-blue-500 text-white shadow-blue-500/30" 
              : "bg-white/10 text-white/30 cursor-not-allowed"
            }`}
          >
            {isActive ? "Share Screen" : "Connect First"}
          </button>
        </div>
      ) : (
        <>
           <video 
            key={streamKey}
            ref={videoRef} 
            className={`w-full h-full object-contain transition-all duration-500 ${isPaused ? 'opacity-30 blur-sm grayscale' : 'opacity-100'}`}
            onLoadedData={handleVideoLoad}
            muted 
            playsInline
            autoPlay
          />
          
          <div className="absolute top-4 left-4 flex gap-2">
               <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide backdrop-blur-md border border-white/10 shadow-lg ${isPaused ? 'bg-yellow-500/20 text-yellow-300' : 'bg-red-500/20 text-red-300 animate-pulse'}`}>
                   {isPaused ? 'PAUSED' : 'LIVE'}
               </div>
          </div>
          
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 translate-y-10 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300">
             <button
               onClick={startSharing}
               className="flex items-center gap-2 px-5 py-2 bg-black/70 hover:bg-black/90 text-white text-xs font-medium rounded-full backdrop-blur-md border border-white/10 shadow-2xl hover:scale-105 transition-transform"
             >
               Switch Source
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