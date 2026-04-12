import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    tokenIdentifier: v.string(),
  }).index("by_token", ["tokenIdentifier"]),

  projects: defineTable({
    userId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    thumbnail: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    isArchived: v.boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_updated", ["updatedAt"])
    .index("by_user_archived", ["userId", "isArchived"]),

  videos: defineTable({
    userId: v.string(),
    projectId: v.optional(v.id("projects")),
    title: v.optional(v.string()),
    videoUrl: v.optional(v.string()),
    fileId: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")), // Convex storage ID
    transcription: v.optional(v.string()),
    canvasPosition: v.object({
      x: v.number(),
      y: v.number(),
    }),
    // Video metadata fields
    duration: v.optional(v.number()), // Duration in seconds
    fileSize: v.optional(v.number()), // Size in bytes
    resolution: v.optional(v.object({
      width: v.number(),
      height: v.number(),
    })),
    frameRate: v.optional(v.number()), // FPS
    bitRate: v.optional(v.number()), // Bits per second
    format: v.optional(v.string()), // Video format/container
    codec: v.optional(v.string()), // Video codec
    audioInfo: v.optional(v.object({
      codec: v.string(),
      sampleRate: v.number(),
      channels: v.number(),
      bitRate: v.number(),
    })),
    metadata: v.optional(v.any()), // Additional metadata
    // Transcription status tracking
    transcriptionStatus: v.optional(v.union(
      v.literal("idle"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    )),
    transcriptionError: v.optional(v.string()),
    transcriptionProgress: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_project", ["projectId"])
    .index("by_created", ["createdAt"]),

  agents: defineTable({
    videoId: v.id("videos"),
    userId: v.string(),
    projectId: v.optional(v.id("projects")),
    type: v.union(
      v.literal("title"),
      v.literal("description"),
      v.literal("thumbnail"),
      v.literal("tweets")
    ),
    draft: v.string(),
    thumbnailUrl: v.optional(v.string()),
    thumbnailStorageId: v.optional(v.id("_storage")),
    connections: v.array(v.string()),
    chatHistory: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("ai")),
        message: v.string(),
        timestamp: v.number(),
      })
    ),
    canvasPosition: v.object({
      x: v.number(),
      y: v.number(),
    }),
    status: v.union(
      v.literal("idle"),
      v.literal("generating"),
      v.literal("ready"),
      v.literal("error")
    ),
    createdAt: v.number(),
  })
    .index("by_video", ["videoId"])
    .index("by_user", ["userId"])
    .index("by_project", ["projectId"])
    .index("by_type", ["type"]),

  profiles: defineTable({
    userId: v.string(),
    channelName: v.string(),
    contentType: v.string(),
    niche: v.string(),
    links: v.array(v.string()),
    tone: v.optional(v.string()),
    targetAudience: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"]),

  shares: defineTable({
    shareId: v.string(),
    projectId: v.id("projects"),
    userId: v.string(),
    canvasState: v.object({
      nodes: v.array(v.any()),
      edges: v.array(v.any()),
      viewport: v.optional(v.object({
        x: v.number(),
        y: v.number(),
        zoom: v.number(),
      })),
    }),
    viewCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_shareId", ["shareId"])
    .index("by_project", ["projectId"])
    .index("by_user", ["userId"]),

  projectCanvases: defineTable({
    userId: v.string(),
    projectId: v.id("projects"),
    nodes: v.array(
      v.object({
        id: v.string(),
        type: v.string(),
        position: v.object({
          x: v.number(),
          y: v.number(),
        }),
        data: v.any(),
      })
    ),
    edges: v.array(
      v.object({
        id: v.string(),
        source: v.string(),
        target: v.string(),
        sourceHandle: v.optional(v.string()),
        targetHandle: v.optional(v.string()),
      })
    ),
    viewport: v.object({
      x: v.number(),
      y: v.number(),
      zoom: v.number(),
    }),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_project", ["projectId"]),
    
  transcriptions: defineTable({
    userId: v.string(),
    projectId: v.id("projects"),
    videoId: v.optional(v.id("videos")), // Optional - can be standalone
    fileName: v.string(),
    format: v.string(),
    fullText: v.string(),
    segments: v.optional(v.array(v.object({
      start: v.number(),
      end: v.number(),
      text: v.string(),
    }))),
    wordCount: v.number(),
    duration: v.optional(v.number()),
    fileStorageId: v.optional(v.id("_storage")),
    canvasPosition: v.object({
      x: v.number(),
      y: v.number(),
    }),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_project", ["projectId"])
    .index("by_video", ["videoId"]),

  // ─── Story Canvas (Drama.Land-style pipeline) ───────────────────────────────
  // Stores a single-episode story project with its 5-node pipeline state.
  storyProjects: defineTable({
    userId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    isArchived: v.boolean(),
    // Pipeline node states – each node is unlocked only after the previous completes
    nodeStates: v.object({
      // Node 1: idea input
      start: v.object({
        status: v.union(v.literal("idle"), v.literal("completed")),
        ideaText: v.optional(v.string()),
        genre: v.optional(v.string()),
        tone: v.optional(v.string()),
      }),
      // Node 2: AI-generated script
      script: v.object({
        status: v.union(v.literal("locked"), v.literal("idle"), v.literal("generating"), v.literal("completed"), v.literal("error")),
        content: v.optional(v.string()),   // full script text
        synopsis: v.optional(v.string()),  // one-line summary
        errorMessage: v.optional(v.string()),
      }),
      // Node 3: characters
      character: v.object({
        status: v.union(v.literal("locked"), v.literal("idle"), v.literal("generating"), v.literal("completed"), v.literal("error")),
        characters: v.optional(v.array(v.object({
          name: v.string(),
          role: v.string(),       // "protagonist" | "antagonist" | "supporting"
          description: v.string(),
          personality: v.string(),
          visualPrompt: v.string(),
        }))),
        errorMessage: v.optional(v.string()),
      }),
      // Node 4: storyboard
      storyboard: v.object({
        status: v.union(v.literal("locked"), v.literal("idle"), v.literal("generating"), v.literal("completed"), v.literal("error")),
        scenes: v.optional(v.array(v.object({
          sceneNumber: v.number(),
          description: v.string(),  // visual scene description
          dialogue: v.optional(v.string()),
          characters: v.array(v.string()),  // character names in scene
          mood: v.string(),
          cameraNote: v.optional(v.string()),
        }))),
        errorMessage: v.optional(v.string()),
      }),
      // Node 5: video segments list
      segment: v.object({
        status: v.union(v.literal("locked"), v.literal("idle"), v.literal("generating"), v.literal("completed"), v.literal("error")),
        segments: v.optional(v.array(v.object({
          segmentNumber: v.number(),
          startTime: v.number(),    // seconds
          endTime: v.number(),
          sceneNumber: v.number(),
          narration: v.string(),
          videoPrompt: v.string(),  // Kling-style prompt
          characters: v.array(v.string()),
          mood: v.string(),
        }))),
        errorMessage: v.optional(v.string()),
      }),
    }),
  })
    .index("by_user", ["userId"])
    .index("by_user_archived", ["userId", "isArchived"]),

  // ─── DreamX AI 营销视频生成流水线 ────────────────────────────────────────────
  dreamXProjects: defineTable({
    userId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    isArchived: v.boolean(),
    autopilotEnabled: v.optional(v.boolean()),
    autopilotFailed: v.optional(v.boolean()),
    autopilotScheduledJobId: v.optional(v.id("_scheduled_functions")),
    nodeStates: v.object({
      mediaUpload: v.object({
        status: v.union(v.literal("idle"), v.literal("generating"), v.literal("completed"), v.literal("error")),
        images: v.optional(v.array(v.object({
          storageId: v.id("_storage"),
          url: v.string(),
          fileName: v.string(),
          width: v.optional(v.number()),
          height: v.optional(v.number()),
          aiDescription: v.optional(v.string()),
        }))),
        videos: v.optional(v.array(v.object({
          storageId: v.id("_storage"),
          url: v.string(),
          fileName: v.string(),
          durationMs: v.optional(v.number()),
          fileSizeBytes: v.optional(v.number()),
          aiDescription: v.optional(v.string()),
        }))),
        eventDescription: v.optional(v.string()),
        moodPreference: v.optional(v.string()),
        aiAnalysis: v.optional(v.string()),
        emotionTags: v.optional(v.array(v.string())),
        errorMessage: v.optional(v.string()),
      }),
      copywriting: v.object({
        status: v.union(v.literal("locked"), v.literal("idle"), v.literal("generating"), v.literal("completed"), v.literal("error")),
        script: v.optional(v.array(v.object({
          text: v.string(),
          durationMs: v.number(),
          imageIndex: v.number(),
          mood: v.optional(v.string()),
        }))),
        emotionTags: v.optional(v.array(v.string())),
        errorMessage: v.optional(v.string()),
      }),
      memeRecall: v.object({
        status: v.union(v.literal("locked"), v.literal("idle"), v.literal("generating"), v.literal("completed"), v.literal("error")),
        suggestedMemes: v.optional(v.array(v.object({
          url: v.string(),
          name: v.string(),
          mood: v.string(),
          mediaId: v.optional(v.id("dreamXMedia")),
          isBuiltin: v.boolean(),
        }))),
        selectedMemes: v.optional(v.array(v.object({
          url: v.string(),
          name: v.string(),
          mood: v.string(),
          insertAfterImageIndex: v.number(),
          storageId: v.optional(v.id("_storage")),
        }))),
        skipped: v.optional(v.boolean()),
      }),
      storyboard: v.object({
        status: v.union(v.literal("locked"), v.literal("idle"), v.literal("generating"), v.literal("completed"), v.literal("error")),
        timeline: v.optional(v.array(v.object({
          type: v.union(v.literal("image"), v.literal("meme")),
          url: v.string(),
          name: v.string(),
          startMs: v.number(),
          durationMs: v.number(),
          groupId: v.optional(v.number()),  // 所属镜头组索引，用于 TTS/字幕编辑后整组 rebase
          subtitles: v.optional(v.array(v.object({
            text: v.string(),
            startMs: v.number(),
            durationMs: v.number(),
            // 字幕级配音：TTS 按字幕条粒度生成后写入
            voiceTrack: v.optional(v.object({
              url: v.string(),
              storageId: v.string(),
              durationMs: v.number(),
            })),
          }))),
          // 配音轨：TTS 按段生成后写入
          voiceTrack: v.optional(v.object({
            url: v.string(),
            storageId: v.string(),
            durationMs: v.number(),
          })),
        }))),
        totalDurationMs: v.optional(v.number()),
        directorNote: v.optional(v.string()),
        errorMessage: v.optional(v.string()),
      }),
      bgmRecall: v.object({
        status: v.union(v.literal("locked"), v.literal("idle"), v.literal("generating"), v.literal("completed"), v.literal("error")),
        suggestedBgms: v.optional(v.array(v.object({
          url: v.string(),
          name: v.string(),
          mood: v.string(),
          durationMs: v.optional(v.number()),
          mediaId: v.optional(v.id("dreamXMedia")),
          isBuiltin: v.boolean(),
        }))),
        selectedBgm: v.optional(v.object({
          url: v.string(),
          name: v.string(),
          durationMs: v.optional(v.number()),
          startMs: v.optional(v.number()),   // BGM 在时间轴上的起始偏移（ms）
          volume: v.number(),
          storageId: v.optional(v.id("_storage")),
        })),
        skipped: v.optional(v.boolean()),
      }),
      ttsSelection: v.optional(v.object({
        status: v.union(v.literal("locked"), v.literal("idle"), v.literal("generating"), v.literal("completed"), v.literal("error")),
        ttsText: v.optional(v.string()),
        subtitleSnapshot: v.optional(v.string()),  // 上次成功生成 TTS 时所有字幕文本的快照（用于判断是否需要重新编排）
        recommendedVoices: v.optional(v.array(v.object({
          voiceType: v.string(),
          name: v.string(),
          sampleAudioUrl: v.string(),
          gender: v.string(),
          description: v.string(),
          avatarUrl: v.optional(v.string()),
        }))),
        selectedVoiceType: v.optional(v.string()),
        selectedVoiceName: v.optional(v.string()),
        audioStorageId: v.optional(v.id("_storage")),
        audioUrl: v.optional(v.string()),
        audioDurationMs: v.optional(v.number()),
        errorMessage: v.optional(v.string()),
      })),
      capcutBuild: v.optional(v.object({
        status: v.union(v.literal("locked"), v.literal("idle"), v.literal("generating"), v.literal("completed"), v.literal("error")),
        storageId: v.optional(v.id("_storage")),
        downloadUrl: v.optional(v.string()),
        projectName: v.optional(v.string()),
        errorMessage: v.optional(v.string()),
      })),
      jianyingBuild: v.optional(v.any()),
    }),
  })
    .index("by_user", ["userId"])
    .index("by_user_archived", ["userId", "isArchived"]),

  autopilotJobs: defineTable({
    projectId: v.id("dreamXProjects"),
    currentNodeIndex: v.number(),
    retryCount: v.number(),
    pendingScheduledJobId: v.optional(v.id("_scheduled_functions")),
    confirmedNodeIndices: v.array(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"]),

  redeemCodes: defineTable({
    code: v.string(),
    type: v.union(v.literal("trial"), v.literal("vip"), v.literal("svip")),
    credits: v.number(),
    isUsed: v.boolean(),
    usedBy: v.optional(v.string()),
    usedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_used", ["isUsed"]),

  userCredits: defineTable({
    userId: v.string(),
    balance: v.number(),
    totalRedeemed: v.number(),
    totalConsumed: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"]),

  creditsTransactions: defineTable({
    userId: v.string(),
    type: v.union(v.literal("redeem"), v.literal("consume")),
    amount: v.number(),
    codeId: v.optional(v.id("redeemCodes")),
    nodeType: v.optional(v.string()),
    projectId: v.optional(v.id("dreamXProjects")),
    description: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_created", ["userId", "createdAt"]),

  nodeCreditConfigs: defineTable({
    nodeType: v.string(),
    baseCost: v.number(),
    isEnabled: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_nodeType", ["nodeType"]),

  dreamXMedia: defineTable({
    type: v.union(v.literal("meme"), v.literal("bgm")),
    name: v.string(),
    mood: v.string(),
    url: v.string(),
    storageId: v.optional(v.id("_storage")),
    isBuiltin: v.boolean(),
    userId: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    durationMs: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_type_mood", ["type", "mood"])
    .index("by_type_builtin", ["type", "isBuiltin"])
    .index("by_user", ["userId"]),
});
