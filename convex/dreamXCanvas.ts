import { v } from "convex/values";
import { action, mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// Pipeline 新顺序：mediaUpload → memeRecall → bgmRecall → storyboard → ttsSelection → capcutBuild
// copywriting 保留在数据库状态中（供 suggestedMemes/suggestedBgms 用），但不作为用户等待的节点
const PIPELINE = [
  "mediaUpload",
  "memeRecall",
  "bgmRecall",
  "storyboard",
  "ttsSelection",
  "capcutBuild",
] as const;

type PipelineKey = typeof PIPELINE[number];

export const listProjects = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const projects = await ctx.db
      .query("dreamXProjects")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .collect();
    if (args.includeArchived) return projects;
    return projects.filter((p) => !p.isArchived);
  },
});

export const getProject = query({
  args: { id: v.id("dreamXProjects") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const project = await ctx.db.get(args.id);
    if (!project || project.userId !== identity.subject) return null;
    return project;
  },
});

export const createProject = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const now = Date.now();
    return await ctx.db.insert("dreamXProjects", {
      userId: identity.subject,
      title: args.title,
      description: args.description,
      createdAt: now,
      updatedAt: now,
      isArchived: false,
      nodeStates: {
        mediaUpload:  { status: "idle" },
        copywriting:  { status: "locked" }, // 后台静默状态，不展示为节点
        memeRecall:   { status: "locked" },
        bgmRecall:    { status: "locked" },
        storyboard:   { status: "locked" },
        ttsSelection: { status: "locked" },
        capcutBuild:  { status: "locked" },
      },
    });
  },
});

export const _patchStoryboardVoiceTracks = internalMutation({
  args: {
    projectId: v.id("dreamXProjects"),
    voiceTracks: v.array(v.object({
      itemIdx: v.number(),
      storageId: v.string(),
      url: v.string(),
      durationMs: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return;

    const ns = project.nodeStates as any;
    const oldTimeline: any[] = ns.storyboard?.timeline ?? [];

    type VoiceEntry = { url: string; storageId: string; durationMs: number };
    type MapEntry = { item?: VoiceEntry; subs: Map<number, VoiceEntry> };
    const itemVoiceMap = new Map<number, MapEntry>();

    for (const vt of args.voiceTracks) {
      const tiIdx = Math.floor(vt.itemIdx / 100000);
      const subIdx = vt.itemIdx % 100000;
      const entry: MapEntry = itemVoiceMap.get(tiIdx) ?? { subs: new Map() };
      entry.subs.set(subIdx, { url: vt.url, storageId: vt.storageId, durationMs: vt.durationMs });
      if (subIdx === 0 || !entry.item) {
        entry.item = { url: vt.url, storageId: vt.storageId, durationMs: vt.durationMs };
      }
      itemVoiceMap.set(tiIdx, entry);
    }

    const newTimeline = oldTimeline.map((item: any, i: number) => {
      const entry = itemVoiceMap.get(i);
      if (!entry) return item;

      let newSubs = item.subtitles;
      if (entry.subs.size > 0 && Array.isArray(item.subtitles)) {
        newSubs = item.subtitles.map((sub: any, j: number) => {
          const sv = entry.subs.get(j);
          if (!sv) return sub;
          return { ...sub, voiceTrack: { url: sv.url, storageId: sv.storageId, durationMs: sv.durationMs } };
        });
      }

      const itemVoice = entry.item
        ? { url: entry.item.url, storageId: entry.item.storageId, durationMs: entry.item.durationMs }
        : item.voiceTrack;

      return { ...item, subtitles: newSubs, voiceTrack: itemVoice };
    });

    await ctx.db.patch(args.projectId, {
      updatedAt: Date.now(),
      nodeStates: { ...ns, storyboard: { ...(ns.storyboard ?? {}), timeline: newTimeline } },
    });
  },
});

export const _updateNodeState = internalMutation({  args: {
    id: v.id("dreamXProjects"),
    nodeKey: v.union(
      v.literal("mediaUpload"),
      v.literal("copywriting"),
      v.literal("memeRecall"),
      v.literal("storyboard"),
      v.literal("bgmRecall"),
      v.literal("ttsSelection"),
      v.literal("capcutBuild")
    ),
    patch: v.any(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (!project) return;

    const ns = project.nodeStates as any;
    const updated = {
      ...ns,
      [args.nodeKey]: { ...(ns[args.nodeKey] ?? {}), ...args.patch },
    };

    if (args.patch.status === "completed") {
      const PIPELINE_KEYS = ["mediaUpload", "memeRecall", "bgmRecall", "storyboard", "ttsSelection", "capcutBuild"];
      const idx = PIPELINE_KEYS.indexOf(args.nodeKey);
      if (idx >= 0 && idx < PIPELINE_KEYS.length - 1) {
        const next = PIPELINE_KEYS[idx + 1];
        updated[next] = { ...(updated[next] ?? {}), status: "idle" };
      }
    }

    await ctx.db.patch(args.id, { nodeStates: updated, updatedAt: Date.now() });
  },
});

export const deleteProject = mutation({
  args: { id: v.id("dreamXProjects") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const project = await ctx.db.get(args.id);
    if (!project || project.userId !== identity.subject) throw new Error("Unauthorized");
    await ctx.db.delete(args.id);
  },
});

export const updateNodeState = mutation({
  args: {
    id: v.id("dreamXProjects"),
    nodeKey: v.union(
      v.literal("mediaUpload"),
      v.literal("copywriting"),
      v.literal("memeRecall"),
      v.literal("storyboard"),
      v.literal("bgmRecall"),
      v.literal("ttsSelection"),
      v.literal("capcutBuild")
    ),
    patch: v.any(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const project = await ctx.db.get(args.id);
    if (!project || project.userId !== identity.subject) throw new Error("Unauthorized");

    const ns = project.nodeStates as any;
    const updated = {
      ...ns,
      [args.nodeKey]: { ...(ns[args.nodeKey] ?? {}), ...args.patch },
    };

    // 如果 status 设为 completed，自动解锁下一个 PIPELINE 节点
    if (args.patch.status === "completed") {
      const idx = PIPELINE.indexOf(args.nodeKey as PipelineKey);
      if (idx >= 0 && idx < PIPELINE.length - 1) {
        const next = PIPELINE[idx + 1];
        updated[next] = { ...(updated[next] ?? {}), status: "idle" };
      }
    }

    await ctx.db.patch(args.id, { nodeStates: updated, updatedAt: Date.now() });
  },
});

export const completeMediaUpload = mutation({
  args: {
    id: v.id("dreamXProjects"),
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
    eventDescription: v.string(),
    moodPreference: v.optional(v.string()),
    aiAnalysis: v.optional(v.string()),
    emotionTags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const project = await ctx.db.get(args.id);
    if (!project || project.userId !== identity.subject) throw new Error("Unauthorized");
    const ns = project.nodeStates as any;

    await ctx.db.patch(args.id, {
      updatedAt: Date.now(),
      nodeStates: {
        ...ns,
        mediaUpload: {
          status: "completed",
          images: args.images ?? [],
          videos: args.videos ?? [],
          eventDescription: args.eventDescription,
          moodPreference: args.moodPreference,
          aiAnalysis: args.aiAnalysis,
          emotionTags: args.emotionTags ?? [],
        },
        // 同时把 copywriting 静默标记为 completed（供 suggestedMemes/suggestedBgms 使用）
        copywriting: {
          ...(ns.copywriting ?? {}),
          status: "completed",
          emotionTags: args.emotionTags ?? [],
        },
        // 解锁 memeRecall（跳过独立的 copywriting 节点等待）
        memeRecall: { ...(ns.memeRecall ?? {}), status: "idle" },
      },
    });
  },
});

export const completeMemeRecall = mutation({
  args: {
    id: v.id("dreamXProjects"),
    selectedMemes: v.array(v.object({
      url: v.string(),
      name: v.string(),
      mood: v.string(),
      insertAfterImageIndex: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const project = await ctx.db.get(args.id);
    if (!project || project.userId !== identity.subject) throw new Error("Unauthorized");
    const ns = project.nodeStates as any;

    await ctx.db.patch(args.id, {
      updatedAt: Date.now(),
      nodeStates: {
        ...ns,
        memeRecall: { ...(ns.memeRecall ?? {}), status: "completed", selectedMemes: args.selectedMemes },
        // 新顺序：memeRecall → bgmRecall
        bgmRecall: { ...(ns.bgmRecall ?? {}), status: "idle" },
      },
    });
  },
});

export const completeBgmRecall = mutation({
  args: {
    id: v.id("dreamXProjects"),
    selectedBgm: v.optional(v.object({
      url: v.string(),
      name: v.string(),
      durationMs: v.optional(v.number()),
      startMs: v.optional(v.number()),  // BGM 在时间轴上的起始偏移（ms）
      volume: v.number(),
      storageId: v.optional(v.id("_storage")),
    })),
    skipped: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const project = await ctx.db.get(args.id);
    if (!project || project.userId !== identity.subject) throw new Error("Unauthorized");
    const ns = project.nodeStates as any;

    await ctx.db.patch(args.id, {
      updatedAt: Date.now(),
      nodeStates: {
        ...ns,
        bgmRecall: { ...(ns.bgmRecall ?? {}), status: "completed", selectedBgm: args.selectedBgm, skipped: args.skipped },
        // 新顺序：bgmRecall → storyboard
        storyboard: { ...(ns.storyboard ?? {}), status: "idle" },
      },
    });
  },
});

// ─── saveBgmTiming ────────────────────────────────────────────────────────────
// 分镜节点拖拽 BGM 后保存起始/结束时间
export const saveBgmTiming = mutation({
  args: {
    id: v.id("dreamXProjects"),
    startMs: v.number(),
    durationMs: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const project = await ctx.db.get(args.id);
    if (!project || project.userId !== identity.subject) throw new Error("Unauthorized");
    const ns = project.nodeStates as any;
    const oldBgm = ns.bgmRecall?.selectedBgm;
    if (!oldBgm) return; // 没有 BGM，不操作
    await ctx.db.patch(args.id, {
      updatedAt: Date.now(),
      nodeStates: {
        ...ns,
        bgmRecall: {
          ...(ns.bgmRecall ?? {}),
          selectedBgm: { ...oldBgm, startMs: args.startMs, durationMs: args.durationMs },
        },
      },
    });
  },
});

export const completeStoryboard = mutation({
  args: {
    id: v.id("dreamXProjects"),
    timeline: v.any(),
    totalDurationMs: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const project = await ctx.db.get(args.id);
    if (!project || project.userId !== identity.subject) throw new Error("Unauthorized");
    const ns = project.nodeStates as any;

    await ctx.db.patch(args.id, {
      updatedAt: Date.now(),
      nodeStates: {
        ...ns,
        storyboard: {
          ...(ns.storyboard ?? {}),
          status: "completed",
          timeline: args.timeline,
          totalDurationMs: args.totalDurationMs,
        },
        ttsSelection: { ...(ns.ttsSelection ?? {}), status: "idle" },
      },
    });
  },
});

export const completeTTSSelection = mutation({
  args: {
    id: v.id("dreamXProjects"),
    selectedVoiceType: v.string(),
    selectedVoiceName: v.string(),
    audioStorageId: v.optional(v.id("_storage")),
    audioUrl: v.string(),
    audioDurationMs: v.number(),
    skipped: v.optional(v.boolean()),
    subtitleSnapshot: v.optional(v.string()),  // 此次生成 TTS 时所有字幕文本的快照
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const project = await ctx.db.get(args.id);
    if (!project || project.userId !== identity.subject) throw new Error("Unauthorized");
    const ns = project.nodeStates as any;

    await ctx.db.patch(args.id, {
      updatedAt: Date.now(),
      nodeStates: {
        ...ns,
        ttsSelection: {
          ...(ns.ttsSelection ?? {}),
          status: "completed",
          selectedVoiceType: args.selectedVoiceType,
          selectedVoiceName: args.selectedVoiceName,
          audioStorageId: args.audioStorageId,
          audioUrl: args.audioUrl,
          audioDurationMs: args.audioDurationMs,
          skipped: args.skipped,
          subtitleSnapshot: args.subtitleSnapshot,
        },
        capcutBuild: { ...(ns.capcutBuild ?? {}), status: "idle" },
      },
    });
  },
});

export const resetFromNode = mutation({
  args: {
    id: v.id("dreamXProjects"),
    fromNodeKey: v.union(
      v.literal("mediaUpload"),
      v.literal("copywriting"),
      v.literal("memeRecall"),
      v.literal("storyboard"),
      v.literal("bgmRecall"),
      v.literal("ttsSelection"),
      v.literal("capcutBuild")
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const project = await ctx.db.get(args.id);
    if (!project || project.userId !== identity.subject) throw new Error("Unauthorized");

    // 使用含 copywriting 的完整列表来确定重置顺序
    const FULL_PIPELINE = [
      "mediaUpload", "copywriting", "memeRecall", "bgmRecall",
      "storyboard", "ttsSelection", "capcutBuild",
    ];
    const fromIdx = FULL_PIPELINE.indexOf(args.fromNodeKey);
    if (fromIdx < 0) return;

    const ns = project.nodeStates as any;
    const updated = { ...ns };

    // 当前节点重置为 idle
    if (args.fromNodeKey === "ttsSelection") {
      // TTS 重置时保留 subtitleSnapshot，以便下次生成时能正确检测字幕变化
      updated[args.fromNodeKey] = {
        ...ns[args.fromNodeKey],
        status: "idle",
        selectedVoiceType: undefined,
        selectedVoiceName: undefined,
        audioStorageId: undefined,
        audioUrl: undefined,
        audioDurationMs: undefined,
        skipped: undefined,
        // subtitleSnapshot 保留，用于下次检测字幕是否变化
      };
    } else {
      updated[args.fromNodeKey] = {
        status: args.fromNodeKey === "mediaUpload" ? "idle" : "idle",
      };
    }

    // 后续节点全部锁定
    for (let i = fromIdx + 1; i < FULL_PIPELINE.length; i++) {
      const key = FULL_PIPELINE[i];
      updated[key] = { status: "locked" };
    }

    await ctx.db.patch(args.id, { nodeStates: updated, updatedAt: Date.now() });
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    return await ctx.storage.generateUploadUrl();
  },
});

export const getStorageFileUrl = action({
  args: { storageId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId as any);
  },
});

// ─── patchStoryboardVoiceTracks ───────────────────────────────────────────────
// 将 TTS 逐段生成结果写入 storyboard.timeline
// 【纯插入模式】：只写 voiceTrack 字段，完全不修改 startMs / durationMs / totalDurationMs
// 时间轴布局由用户在分镜节点手动调整，TTS 不干扰。
// itemIdx 编码规则：
//   itemIdx = tiIdx * 100000 + subIdx（字幕粒度，确保多字幕 item 不冲突）
export const patchStoryboardVoiceTracks = mutation({
  args: {
    projectId: v.id("dreamXProjects"),
    voiceTracks: v.array(v.object({
      itemIdx: v.number(),   // tiIdx * 100000 + subIdx
      storageId: v.string(),
      url: v.string(),
      durationMs: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== identity.subject) throw new Error("Unauthorized");

    const ns = project.nodeStates as any;
    const oldTimeline: any[] = ns.storyboard?.timeline ?? [];

    // 解码 itemIdx = tiIdx * 100000 + subIdx
    type VoiceEntry = { url: string; storageId: string; durationMs: number };
    type MapEntry = { item?: VoiceEntry; subs: Map<number, VoiceEntry> };
    const itemVoiceMap = new Map<number, MapEntry>();

    for (const vt of args.voiceTracks) {
      const tiIdx = Math.floor(vt.itemIdx / 100000);
      const subIdx = vt.itemIdx % 100000;
      const entry: MapEntry = itemVoiceMap.get(tiIdx) ?? { subs: new Map() };
      entry.subs.set(subIdx, { url: vt.url, storageId: vt.storageId, durationMs: vt.durationMs });
      // 取 subIdx=0 作为该 timeline item 的代表配音（向后兼容轨道展示）
      if (subIdx === 0 || !entry.item) {
        entry.item = { url: vt.url, storageId: vt.storageId, durationMs: vt.durationMs };
      }
      itemVoiceMap.set(tiIdx, entry);
    }

    // 纯插入：只把 voiceTrack 写入对应字幕，其余字段原样保留
    const newTimeline = oldTimeline.map((item: any, i: number) => {
      const entry = itemVoiceMap.get(i);
      if (!entry) return item; // 不受影响的 item，直接返回原对象（避免不必要的 patch）

      // 更新字幕级 voiceTrack
      let newSubs = item.subtitles;
      if (entry.subs.size > 0 && Array.isArray(item.subtitles)) {
        newSubs = item.subtitles.map((sub: any, j: number) => {
          const sv = entry.subs.get(j);
          if (!sv) return sub;
          return {
            ...sub,
            voiceTrack: {
              url: sv.url,
              storageId: sv.storageId,
              durationMs: sv.durationMs,
            },
          };
        });
      }

      // item 级 voiceTrack 向后兼容（取第一段字幕的配音）
      const itemVoice = entry.item
        ? { url: entry.item.url, storageId: entry.item.storageId, durationMs: entry.item.durationMs }
        : item.voiceTrack;

      return { ...item, subtitles: newSubs, voiceTrack: itemVoice };
    });

    await ctx.db.patch(args.projectId, {
      updatedAt: Date.now(),
      nodeStates: {
        ...ns,
        storyboard: { ...(ns.storyboard ?? {}), timeline: newTimeline },
      },
    });
  },
});

// ─── Internal mutations for autopilot (no auth required) ─────────────────────

export const _completeMemeRecall = internalMutation({
  args: {
    id: v.id("dreamXProjects"),
    selectedMemes: v.array(v.object({
      url: v.string(),
      name: v.string(),
      mood: v.string(),
      insertAfterImageIndex: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (!project) return;
    const ns = project.nodeStates as any;
    await ctx.db.patch(args.id, {
      updatedAt: Date.now(),
      nodeStates: {
        ...ns,
        memeRecall: { ...(ns.memeRecall ?? {}), status: "completed", selectedMemes: args.selectedMemes },
        bgmRecall: { ...(ns.bgmRecall ?? {}), status: "idle" },
      },
    });
  },
});

export const _completeBgmRecall = internalMutation({
  args: {
    id: v.id("dreamXProjects"),
    selectedBgm: v.optional(v.object({
      url: v.string(),
      name: v.string(),
      durationMs: v.optional(v.number()),
      startMs: v.optional(v.number()),
      volume: v.number(),
      storageId: v.optional(v.id("_storage")),
    })),
    skipped: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (!project) return;
    const ns = project.nodeStates as any;
    await ctx.db.patch(args.id, {
      updatedAt: Date.now(),
      nodeStates: {
        ...ns,
        bgmRecall: { ...(ns.bgmRecall ?? {}), status: "completed", selectedBgm: args.selectedBgm, skipped: args.skipped },
        storyboard: { ...(ns.storyboard ?? {}), status: "idle" },
      },
    });
  },
});

export const _completeStoryboard = internalMutation({
  args: {
    id: v.id("dreamXProjects"),
    timeline: v.any(),
    totalDurationMs: v.number(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (!project) return;
    const ns = project.nodeStates as any;
    await ctx.db.patch(args.id, {
      updatedAt: Date.now(),
      nodeStates: {
        ...ns,
        storyboard: {
          ...(ns.storyboard ?? {}),
          status: "completed",
          timeline: args.timeline,
          totalDurationMs: args.totalDurationMs,
        },
        ttsSelection: { ...(ns.ttsSelection ?? {}), status: "idle" },
      },
    });
  },
});

export const _completeTTSSelection = internalMutation({
  args: {
    id: v.id("dreamXProjects"),
    selectedVoiceType: v.string(),
    selectedVoiceName: v.string(),
    audioStorageId: v.optional(v.id("_storage")),
    audioUrl: v.string(),
    audioDurationMs: v.number(),
    skipped: v.optional(v.boolean()),
    subtitleSnapshot: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (!project) return;
    const ns = project.nodeStates as any;
    await ctx.db.patch(args.id, {
      updatedAt: Date.now(),
      nodeStates: {
        ...ns,
        ttsSelection: {
          ...(ns.ttsSelection ?? {}),
          status: "completed",
          selectedVoiceType: args.selectedVoiceType,
          selectedVoiceName: args.selectedVoiceName,
          audioStorageId: args.audioStorageId,
          audioUrl: args.audioUrl,
          audioDurationMs: args.audioDurationMs,
          skipped: args.skipped,
          subtitleSnapshot: args.subtitleSnapshot,
        },
        capcutBuild: { ...(ns.capcutBuild ?? {}), status: "idle" },
      },
    });
  },
});

// ─── deleteSubtitle ──────────────────────────────────────────────────────────
// 删除指定字幕（用户在编辑弹窗里清空文本 / 点删除按钮）
// 同时清除对应 voiceTrack，提示用户重新生成 TTS
export const deleteSubtitle = mutation({
  args: {
    projectId: v.id("dreamXProjects"),
    tiIdx: v.number(),
    subIdx: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== identity.subject) throw new Error("Unauthorized");

    const ns = project.nodeStates as any;
    const oldTimeline: any[] = ns.storyboard?.timeline ?? [];

    const newTimeline = oldTimeline.map((item: any, i: number) => {
      if (i !== args.tiIdx) return item;
      const newSubs = Array.isArray(item.subtitles)
        ? item.subtitles.filter((_: any, j: number) => j !== args.subIdx)
        : item.subtitles;
      return { ...item, subtitles: newSubs };
    });

    await ctx.db.patch(args.projectId, {
      updatedAt: Date.now(),
      nodeStates: {
        ...ns,
        storyboard: { ...(ns.storyboard ?? {}), timeline: newTimeline },
      },
    });
  },
});

// ─── updateSubtitleText ───────────────────────────────────────────────────────
// TTS 节点 / 分镜节点编辑字幕文本后实时写回
// 【只更新文本】：不重算 durationMs，不 rebase startMs
// 字幕文本改变后对应的 voiceTrack 已失效，一并清空，提示用户重新生成 TTS
export const updateSubtitleText = mutation({
  args: {
    projectId: v.id("dreamXProjects"),
    tiIdx: v.number(),   // timeline item 索引
    subIdx: v.number(),  // 字幕索引
    text: v.string(),    // 新字幕文本
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== identity.subject) throw new Error("Unauthorized");

    const ns = project.nodeStates as any;
    const oldTimeline: any[] = ns.storyboard?.timeline ?? [];

    const newTimeline = oldTimeline.map((item: any, i: number) => {
      if (i !== args.tiIdx) return item;
      const newSubs = Array.isArray(item.subtitles)
        ? item.subtitles.map((sub: any, j: number) => {
            if (j !== args.subIdx) return sub;
            // 只更新文本；清空 voiceTrack（旧配音已与新文本不符）
            const { voiceTrack: _dropped, ...rest } = sub;
            return { ...rest, text: args.text };
          })
        : item.subtitles;
      return { ...item, subtitles: newSubs };
    });

    await ctx.db.patch(args.projectId, {
      updatedAt: Date.now(),
      nodeStates: {
        ...ns,
        storyboard: { ...(ns.storyboard ?? {}), timeline: newTimeline },
      },
    });
  },
});
