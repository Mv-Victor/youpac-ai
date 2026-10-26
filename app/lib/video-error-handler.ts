import { toast } from "sonner";

export type VideoProcessingError = {
  type: 'upload' | 'transcription' | 'thumbnail' | 'metadata' | 'extraction' | 'format' | 'size' | 'network';
  message: string;
  details?: string;
  recoverable: boolean;
  action?: {
    label: string;
    handler: () => void;
  };
};

export class VideoError extends Error {
  type: VideoProcessingError['type'];
  details?: string;
  recoverable: boolean;
  action?: VideoProcessingError['action'];

  constructor(error: VideoProcessingError) {
    super(error.message);
    this.type = error.type;
    this.details = error.details;
    this.recoverable = error.recoverable;
    this.action = error.action;
    this.name = 'VideoError';
  }
}

export function getErrorDetails(error: any): VideoProcessingError {
  const message = typeof error?.message === 'string' ? error.message : '';
  const normalizedMessage = message.toLowerCase();

  // Network errors
  if (normalizedMessage.includes('fetch') || normalizedMessage.includes('network')) {
    return {
      type: 'network',
      message: 'Network connection error',
      details: 'Please check your internet connection and try again.',
      recoverable: true,
    };
  }

  // Authorization errors must take precedence over generic upload errors.
  if (normalizedMessage.includes('unauthorized') || normalizedMessage.includes('auth')) {
    return {
      type: 'upload',
      message: 'Authentication required',
      details: 'Please sign in to upload videos.',
      recoverable: false,
    };
  }

  // Format errors must take precedence over generic upload errors.
  if (normalizedMessage.includes('format') || normalizedMessage.includes('codec') || normalizedMessage.includes('not supported')) {
    return {
      type: 'format',
      message: 'Unsupported video format',
      details: 'Please upload a video in MP4, MOV, AVI, or WebM format.',
      recoverable: false,
    };
  }

  // Upload errors
  if (normalizedMessage.includes('upload')) {
    return {
      type: 'upload',
      message: 'Failed to upload video',
      details: 'The video upload was interrupted. Please try again.',
      recoverable: true,
    };
  }

  // File size errors
  if (normalizedMessage.includes('too large') || normalizedMessage.includes('maximum size')) {
    const sizeMatch = message.match(/(\d+\.?\d*)MB/);
    const size = sizeMatch ? sizeMatch[1] : 'unknown';
    return {
      type: 'size',
      message: 'Video file is too large',
      details: `Your video is ${size}MB. For files over 25MB, we'll extract the audio for transcription. Files over 100MB are not supported.`,
      recoverable: size && parseFloat(size) <= 100,
    };
  }

  // Transcription errors
  if (normalizedMessage.includes('transcrib') || normalizedMessage.includes('whisper')) {
    return {
      type: 'transcription',
      message: 'Failed to transcribe video',
      details: message.includes('timeout')
        ? 'The transcription took too long. Try with a shorter video.'
        : 'We couldn\'t transcribe the audio. The video might be silent or in an unsupported language.',
      recoverable: true,
    };
  }

  // Thumbnail errors
  if (normalizedMessage.includes('thumbnail') || normalizedMessage.includes('dall-e') || normalizedMessage.includes('safety system')) {
    return {
      type: 'thumbnail',
      message: 'Failed to generate thumbnail',
      details: normalizedMessage.includes('safety')
        ? 'The AI safety system blocked thumbnail generation. Try uploading a custom thumbnail.'
        : 'We couldn\'t generate a thumbnail automatically.',
      recoverable: true,
    };
  }

  // Metadata errors
  if (normalizedMessage.includes('metadata') || normalizedMessage.includes('duration') || normalizedMessage.includes('ffmpeg')) {
    return {
      type: 'metadata',
      message: 'Failed to extract video information',
      details: 'Some video details couldn\'t be extracted, but your video was uploaded successfully.',
      recoverable: true,
    };
  }

  // Audio extraction errors
  if (message.includes('extract') || message.includes('audio')) {
    return {
      type: 'extraction',
      message: 'Failed to extract audio',
      details: 'We couldn\'t extract audio from your video for transcription. The video might be corrupted or use an unsupported codec.',
      recoverable: false,
    };
  }

  // Generic error
  return {
    type: 'upload',
    message: 'Something went wrong',
    details: message || 'An unexpected error occurred. Please try again.',
    recoverable: true,
  };
}

export function handleVideoError(error: any, context: string = '') {
  console.error(`[Video Error${context ? ` - ${context}` : ''}]:`, error);
  
  const errorDetails = getErrorDetails(error);
  
  // Show appropriate toast based on error type
  if (errorDetails.recoverable) {
    toast.error(errorDetails.message, {
      description: errorDetails.details,
      duration: 6000,
    });
  } else {
    toast.error(errorDetails.message, {
      description: errorDetails.details,
      duration: 8000,
    });
  }
  
  return errorDetails;
}

// Helper to create retry action
export function createRetryAction(retryFn: () => void) {
  return {
    label: 'Retry',
    onClick: retryFn,
  };
}

// Helper to check if error is recoverable
export function isRecoverableError(error: any): boolean {
  const errorDetails = getErrorDetails(error);
  return errorDetails.recoverable;
}

// Helper to format error for display in UI
export function formatErrorForDisplay(error: any): string {
  const errorDetails = getErrorDetails(error);
  return errorDetails.details || errorDetails.message;
}
