"use node";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function isPublicIpAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
    );
  }

  if (version === 6) {
    const normalized = address.toLowerCase();
    // Only globally routable unicast space is accepted. IPv4-mapped addresses
    // are deliberately rejected instead of maintaining two parsing paths.
    return /^(2|3)[0-9a-f]{3}:/.test(normalized) &&
      !normalized.startsWith("2001:db8:");
  }

  return false;
}

async function validatePublicImageUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid image URL");
  }

  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new Error("Image URL must be an HTTP(S) URL without credentials");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (hostname.toLowerCase() === "localhost" || hostname.toLowerCase().endsWith(".localhost")) {
    throw new Error("Image URL must resolve to a public address");
  }

  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new Error("Image URL must resolve only to public addresses");
  }

  return url;
}

async function readBoundedImage(response: Response): Promise<{ dataUrl: string; size: number; mimeType: string }> {
  const mimeType = (response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) throw new Error("Response is not a supported image");

  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null && Number(declaredLength) > MAX_IMAGE_BYTES) {
    throw new Error("Image exceeds the maximum size");
  }
  if (!response.body) throw new Error("Image response has no body");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) throw new Error("Image exceeds the maximum size");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }

  const buffer = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), size);
  return { dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`, size, mimeType };
}

async function downloadPublicImage(rawUrl: string): Promise<{ dataUrl: string; size: number; mimeType: string }> {
  let url = await validatePublicImageUrl(rawUrl);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const response = await fetch(url, { redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === MAX_REDIRECTS) throw new Error("Too many image redirects");
      url = await validatePublicImageUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
    return await readBoundedImage(response);
  }
  throw new Error("Too many image redirects");
}

// Helper function to extract YouTube video ID
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  
  return null;
}

// Helper function to extract Spotify ID
function extractSpotifyId(url: string): { type: string; id: string } | null {
  const match = url.match(/spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/);
  if (match) {
    return { type: match[1], id: match[2] };
  }
  return null;
}

// Fetch metadata for a URL using oEmbed services
export const fetchUrlMetadata = action({
  args: {
    url: v.string(),
    type: v.string(),
  },
  handler: async (ctx, args) => {
    const { url, type } = args;
    
    try {
      if (type === "youtube") {
        // Use noembed for YouTube (no API key needed)
        const response = await fetch(
          `https://noembed.com/embed?url=${encodeURIComponent(url)}`
        );
        
        if (!response.ok) {
          console.warn("[MoodBoard] Failed to fetch YouTube metadata:", response.status);
          return null;
        }
        
        const data = await response.json();
        
        // Extract video ID for thumbnail
        const videoId = extractYouTubeId(url);
        
        return {
          title: data.title || "YouTube Video",
          author: data.author_name || "",
          thumbnail: videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : data.thumbnail_url,
          description: data.title || "",
          duration: data.duration,
        };
      }
      
      if (type === "music" && url.includes("spotify.com")) {
        // Use Spotify oEmbed
        const response = await fetch(
          `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`
        );
        
        if (!response.ok) {
          console.warn("[MoodBoard] Failed to fetch Spotify metadata:", response.status);
          return null;
        }
        
        const data = await response.json();
        
        return {
          title: data.title || "Spotify Track",
          author: data.provider_name || "Spotify",
          thumbnail: data.thumbnail_url,
          description: data.description || "",
        };
      }
      
      if (type === "music" && url.includes("soundcloud.com")) {
        // Use SoundCloud oEmbed
        const response = await fetch(
          `https://soundcloud.com/oembed?url=${encodeURIComponent(url)}&format=json`
        );
        
        if (!response.ok) {
          console.warn("[MoodBoard] Failed to fetch SoundCloud metadata:", response.status);
          return null;
        }
        
        const data = await response.json();
        
        return {
          title: data.title || "SoundCloud Track",
          author: data.author_name || "",
          thumbnail: data.thumbnail_url,
          description: data.description || "",
        };
      }
      
      // For images and other URLs, return basic info
      return {
        title: new URL(url).hostname,
        author: "",
        thumbnail: type === "image" ? url : undefined,
        description: "",
      };
      
    } catch (error) {
      console.error("[MoodBoard] Error fetching metadata:", error);
      return null;
    }
  },
});

// Download an image and convert to base64
export const downloadImageAsBase64 = action({
  args: {
    url: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Unauthorized");
      console.log("[MoodBoard] Downloading image:", args.url);
      return await downloadPublicImage(args.url);
    } catch (error) {
      console.error("[MoodBoard] Error downloading image:", error);
      throw error;
    }
  },
});

// Process mood board references for thumbnail generation
export const processMoodBoardReferences = action({
  args: {
    references: v.array(v.object({
      url: v.string(),
      type: v.string(),
      title: v.optional(v.string()),
      thumbnail: v.optional(v.string()),
    })),
    maxImages: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Array<{
    url: string;
    type: string;
    title?: string;
    thumbnail?: string;
    imageData: string | null;
    description: string;
  }>> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const { references, maxImages = 5 } = args;
    const processedRefs = [];
    let imageCount = 0;
    
    for (const ref of references) {
      try {
        if (imageCount >= maxImages) {
          // Just add text reference if we've hit the image limit
          processedRefs.push({
            ...ref,
            imageData: null,
            description: `${ref.type}: ${ref.title || ref.url}`,
          });
          continue;
        }
        
        if (ref.type === "youtube" && ref.thumbnail) {
          // Download YouTube thumbnail
          try {
            const image = await downloadPublicImage(ref.thumbnail);
            
            processedRefs.push({
              ...ref,
              imageData: image.dataUrl,
              description: `YouTube thumbnail reference: ${ref.title || "Video"}`,
            });
            imageCount++;
          } catch (error) {
            console.warn(`Failed to download YouTube thumbnail: ${ref.thumbnail}`, error);
            processedRefs.push({
              ...ref,
              imageData: null,
              description: `YouTube video (thumbnail failed): ${ref.title || ref.url}`,
            });
          }
        } else if (ref.type === "image" && ref.url) {
          // Download direct image
          try {
            const image = await downloadPublicImage(ref.url);
            
            processedRefs.push({
              ...ref,
              imageData: image.dataUrl,
              description: `Image reference: ${ref.title || "Mood board image"}`,
            });
            imageCount++;
          } catch (error) {
            console.warn(`Failed to download image: ${ref.url}`, error);
            processedRefs.push({
              ...ref,
              imageData: null,
              description: `Image (failed to load): ${ref.title || ref.url}`,
            });
          }
        } else {
          // Non-image references
          processedRefs.push({
            ...ref,
            imageData: null,
            description: `${ref.type}: ${ref.title || ref.url}`,
          });
        }
      } catch (error) {
        console.warn(`[MoodBoard] Failed to process reference: ${ref.url}`, error);
        // Add as text reference if download fails
        processedRefs.push({
          ...ref,
          imageData: null,
          description: `${ref.type} (failed to load): ${ref.title || ref.url}`,
        });
      }
    }
    
    return processedRefs;
  },
});
