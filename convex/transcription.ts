"use node"
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// Action to transcribe video/audio using ElevenLabs (supports up to 1GB files!)
export const transcribeVideoElevenLabs = internalAction({
  args: {
    videoId: v.id("videos"),
    storageId: v.id("_storage"),
    fileType: v.optional(v.string()), // 'video' or 'audio'
    fileName: v.optional(v.string()), // Original file name for content type detection
  },
  handler: async (ctx, args): Promise<{ success: boolean; transcription: string; service?: string }> => {
    console.log("🎙️ ElevenLabs transcription started", {
      videoId: args.videoId,
      storageId: args.storageId,
      fileType: args.fileType,
      fileName: args.fileName
    });

    // Get ElevenLabs API key from Convex environment
    const apiKey = process.env.ELEVENLABS_API_KEY;
    console.log("🔑 ElevenLabs API key status:", apiKey ? "Found" : "Not found");

    if (!apiKey) {
      throw new Error("ElevenLabs API key not configured. Please add ELEVENLABS_API_KEY to your Convex environment variables.");
    }

    try {
      // Update status to show we're starting
      await ctx.runMutation(internal.videoJobs.updateTranscriptionStatus, {
        videoId: args.videoId,
        progress: "Starting transcription...",
      });


      // For smaller files, continue with direct download approach
      const fileUrl = await ctx.storage.getUrl(args.storageId);
      console.log("📁 Storage URL retrieved:", fileUrl ? "Success" : "Failed");

      if (!fileUrl) {
        throw new Error("Could not retrieve file URL from storage. The file may have been deleted.");
      }

      // Use ElevenLabs cloud_storage_url feature instead of downloading
      console.log("🌐 Starting ElevenLabs transcription with cloud URL");
      console.log("📍 File URL:", fileUrl);
      
      // Quick validation that the URL is accessible
      try {
        const fetch = (await import('node-fetch')).default;
        const headResponse = await fetch(fileUrl, { method: 'HEAD' });
        if (!headResponse.ok) {
          console.error("❌ File URL not accessible:", headResponse.status);
          throw new Error(`File URL is not accessible (${headResponse.status}). The file may have been deleted.`);
        }
        const contentLength = headResponse.headers.get('content-length');
        if (contentLength) {
          const sizeMB = parseInt(contentLength) / (1024 * 1024);
          console.log(`✅ File URL is accessible. Size: ${sizeMB.toFixed(2)}MB`);
        }
      } catch (error: any) {
        console.error("❌ Failed to validate file URL:", error);
        throw new Error("Could not validate file accessibility. " + error.message);
      }
      
      // Update progress
      await ctx.runMutation(internal.videoJobs.updateTranscriptionStatus, {
        videoId: args.videoId,
        progress: "Sending file URL to ElevenLabs...",
      });

      // Call ElevenLabs Speech-to-Text API with cloud URL
      console.log("🚀 Calling ElevenLabs API with cloud URL...");
      console.log("🔐 Using API key:", apiKey.substring(0, 10) + "...");

      // Update progress
      await ctx.runMutation(internal.videoJobs.updateTranscriptionStatus, {
        videoId: args.videoId,
        progress: "Processing with ElevenLabs Speech-to-Text API...",
      });

      // Create JSON body with cloud_storage_url
      const requestBody = {
        cloud_storage_url: fileUrl,
        model_id: 'scribe_v1',
      };
      
      console.log(`📎 Request details:`, {
        cloud_storage_url: fileUrl,
        model_id: 'scribe_v1',
        fileName: args.fileName,
        fileType: args.fileType,
        requestBody: requestBody,
      });

      // Make direct API call using cloud_storage_url
      const fetch = (await import('node-fetch')).default;
      const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: {
          'Xi-Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `ElevenLabs API error (${response.status})`;
        
        console.error("❌ ElevenLabs API error response:", {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText,
          headers: response.headers,
        });
        
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.detail) {
            errorMessage = errorJson.detail;
          } else if (typeof errorJson === 'object' && errorJson.message) {
            errorMessage = errorJson.message;
          }
          console.error("❌ Parsed error details:", errorJson);
        } catch (parseError) {
          console.error("❌ Failed to parse error response:", parseError);
          errorMessage = errorText || errorMessage;
        }
        
        // Provide user-friendly error messages
        if (response.status === 400) {
          if (errorMessage.includes("parsing the body") || errorMessage.includes("Invalid file format")) {
            errorMessage = "File format not supported. Please ensure your file is a valid video or audio file.";
          } else if (errorMessage.includes("cloud_storage_url")) {
            errorMessage = "Could not access the file URL. The file may not be publicly accessible.";
          } else if (errorMessage.includes("model_id")) {
            errorMessage = "Transcription model configuration error. Please try again.";
          }
        } else if (response.status === 401) {
          errorMessage = "ElevenLabs API authentication failed. Please check your API key.";
        } else if (response.status === 413) {
          errorMessage = "File is too large. ElevenLabs supports files up to 1GB.";
        } else if (response.status === 429) {
          errorMessage = "Rate limit exceeded. Please try again in a few moments.";
        } else if (response.status === 500) {
          errorMessage = "ElevenLabs service error. Please try again later.";
        }
        
        throw new Error(errorMessage);
      }

      const elevenLabsResponse = await response.json() as {
        text: string;
        language_code: string;
        language_probability: number;
        words: { type: string }[];
      };

      console.log("✅ ElevenLabs response received:", JSON.stringify(elevenLabsResponse, null, 2));

      // The SDK returns the response directly, not a fetch response
      const transcriptionText = elevenLabsResponse.text || "";
      
      // Log additional details if available
      if (elevenLabsResponse.language_code) {
        console.log(`🌐 Detected language: ${elevenLabsResponse.language_code} (confidence: ${elevenLabsResponse.language_probability || 'N/A'})`);
      }
      
      if (elevenLabsResponse.words && elevenLabsResponse.words.length > 0) {
        console.log(`📊 Word count: ${elevenLabsResponse.words.filter((w: any) => w.type === 'word').length} words`);
      }

      // Update progress
      await ctx.runMutation(internal.videoJobs.updateTranscriptionStatus, {
        videoId: args.videoId,
        progress: "Processing transcription results...",
      });

      // Log transcription result for debugging
      console.log(`📝 Transcription text found. Length: ${transcriptionText.length} characters`);
      console.log(`📄 First 200 chars: "${transcriptionText.substring(0, 200)}..."`);

      if (!transcriptionText || transcriptionText.length === 0) {
        console.error("⚠️ No transcription text found in response!");
        console.error("Response object keys:", Object.keys(elevenLabsResponse));
        throw new Error("No speech detected in the file. Please ensure your video/audio contains clear speech.");
      }

      // Basic quality check
      if (transcriptionText.length < 50) {
        console.warn("Transcription seems too short, might be an issue with audio quality");
      }

      // Update the video with transcription
      await ctx.runMutation(internal.videoJobs.updateTranscription, {
        videoId: args.videoId,
        transcription: transcriptionText,
      });

      return { success: true, transcription: transcriptionText, service: 'elevenlabs' };
    } catch (error: any) {
      console.error("❌ ElevenLabs transcription error:", error);
      console.error("Full error details:", error);
      
      // Update status to failed with user-friendly error message
      await ctx.runMutation(internal.videoJobs.markTranscriptionFailed, {
        videoId: args.videoId,
        error: error.message || "Transcription failed. Please try again.",
      });
      
      throw error; // Re-throw the error
    }
  },
});

