import { Blob } from '@google/genai';

export function base64ToUint8Array(base64: string): Uint8Array {
  // Remove any whitespace (newlines, spaces) and handle URL-safe chars
  const cleanBase64 = base64
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/\s/g, '');
    
  const binaryString = atob(cleanBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function createPcmBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    // Clamp values to [-1, 1] range to prevent clipping distortion
    const s = Math.max(-1, Math.min(1, data[i]));
    // Convert float [-1.0, 1.0] to int16 [-32768, 32767]
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return {
    data: arrayBufferToBase64(int16.buffer),
    mimeType: 'audio/pcm;rate=16000',
  };
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  // Ensure data is aligned to 2 bytes (16-bit)
  if (data.byteLength % 2 !== 0) {
    const padded = new Uint8Array(data.byteLength + 1);
    padded.set(data);
    data = padded;
  }

  // CRITICAL: Use byteOffset and length to create a view specifically into the data passed.
  // This prevents reading surrounding memory if 'data' is a subarray (slice) of a larger buffer.
  const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
  
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Convert Int16 to Float32 [-1.0, 1.0]
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}