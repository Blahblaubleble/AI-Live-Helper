import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  isActive: boolean;
  volume: number; // 0 to 1
  color?: string;
}

const Visualizer: React.FC<VisualizerProps> = ({ isActive, volume, color = '#3b82f6' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      if (!isActive) {
         // Draw a flat line or idle pulse
         ctx.beginPath();
         ctx.moveTo(0, height / 2);
         ctx.lineTo(width, height / 2);
         ctx.strokeStyle = '#334155';
         ctx.lineWidth = 2;
         ctx.stroke();
         return;
      }

      ctx.beginPath();
      ctx.moveTo(0, height / 2);

      // Simple sine wave simulation based on volume
      const amplitude = Math.max(5, volume * (height / 2)); 
      const frequency = 0.1;
      const speed = 0.2;

      for (let x = 0; x < width; x++) {
        const y = height / 2 + Math.sin(x * frequency + time * speed) * amplitude * Math.sin(x / width * Math.PI); 
        ctx.lineTo(x, y);
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.shadowBlur = 10;
      ctx.shadowColor = color;
      ctx.stroke();
      ctx.shadowBlur = 0;

      time++;
      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [isActive, volume, color]);

  return (
    <canvas 
      ref={canvasRef} 
      width={300} 
      height={100} 
      className="w-full h-full"
    />
  );
};

export default Visualizer;