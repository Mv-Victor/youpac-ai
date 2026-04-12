import { v } from "convex/values";
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";

export const getMemesByMood = query({
  args: {
    mood: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    let all;
    if (args.mood) {
      all = await ctx.db
        .query("dreamXMedia")
        .withIndex("by_type_mood", (q) => q.eq("type", "meme").eq("mood", args.mood!))
        .collect();
    } else {
      all = await ctx.db
        .query("dreamXMedia")
        .withIndex("by_type_builtin", (q) => q.eq("type", "meme").eq("isBuiltin", true))
        .collect();
    }
    const filtered = all.filter((m) => m.isBuiltin || m.userId === userId);
    return filtered.slice(0, args.limit ?? 20);
  },
});

export const getBgmsByMood = query({
  args: {
    mood: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    let all;
    if (args.mood) {
      all = await ctx.db
        .query("dreamXMedia")
        .withIndex("by_type_mood", (q) => q.eq("type", "bgm").eq("mood", args.mood!))
        .collect();
    } else {
      all = await ctx.db
        .query("dreamXMedia")
        .withIndex("by_type_builtin", (q) => q.eq("type", "bgm").eq("isBuiltin", true))
        .collect();
    }
    const filtered = all.filter((m) => m.isBuiltin || m.userId === userId);
    return filtered.slice(0, args.limit ?? 10);
  },
});

export const getSuggestedMemes = query({
  args: {
    emotionTags: v.array(v.string()),
    limit: v.optional(v.number()),
    shuffleSeed: v.optional(v.number()), // 传入不同 seed 可以得到不同的召回顺序
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    const limit = args.limit ?? 12;

    // 先收集所有符合条件的 memes（按情绪标签优先，兜底全量内置）
    const allCandidates: any[] = [];
    const seen = new Set<string>();

    for (const tag of args.emotionTags) {
      const memes = await ctx.db
        .query("dreamXMedia")
        .withIndex("by_type_mood", (q) => q.eq("type", "meme").eq("mood", tag))
        .collect();
      for (const m of memes) {
        if (!seen.has(m._id) && (m.isBuiltin || m.userId === userId)) {
          seen.add(m._id);
          allCandidates.push(m);
        }
      }
    }

    // 兜底：补充所有内置表情包
    const more = await ctx.db
      .query("dreamXMedia")
      .withIndex("by_type_builtin", (q) => q.eq("type", "meme").eq("isBuiltin", true))
      .collect();
    for (const m of more) {
      if (!seen.has(m._id)) {
        seen.add(m._id);
        allCandidates.push(m);
      }
    }

    // 内置和用户上传分开处理
    const builtinCandidates = allCandidates.filter((m) => m.isBuiltin);
    const userCandidates = allCandidates.filter((m) => !m.isBuiltin);

    // Fisher-Yates shuffle（用 seed 决定顺序，seed 变化则结果不同）
    const seed = args.shuffleSeed ?? 0;
    const shuffle = <T>(arr: T[]): T[] => {
      const a = [...arr];
      let s = seed;
      for (let i = a.length - 1; i > 0; i--) {
        s = (s * 1664525 + 1013904223) & 0xffffffff;
        const j = Math.abs(s) % (i + 1);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    const shuffledBuiltin = shuffle(builtinCandidates);
    // 内置部分向上对齐到6的倍数，用户上传追加在后不补齐
    const alignedLimit = Math.ceil(Math.min(shuffledBuiltin.length, limit) / 6) * 6;
    return [...shuffledBuiltin.slice(0, alignedLimit), ...userCandidates];
  },
});

export const getSuggestedBgms = query({
  args: {
    emotionTags: v.array(v.string()),
    limit: v.optional(v.number()),
    shuffleSeed: v.optional(v.number()), // 传入不同 seed 可以得到不同的召回顺序
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    const limit = args.limit ?? 5;
    const results: any[] = [];
    const seen = new Set<string>();

    // 先加入用户上传的所有BGM（不限mood）
    if (userId) {
      const userBgms = await ctx.db
        .query("dreamXMedia")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      for (const m of userBgms) {
        if (m.type === "bgm" && !seen.has(m._id)) {
          seen.add(m._id);
          results.push(m);
        }
      }
    }

    for (const tag of args.emotionTags) {
      const bgms = await ctx.db
        .query("dreamXMedia")
        .withIndex("by_type_mood", (q) => q.eq("type", "bgm").eq("mood", tag))
        .collect();
      for (const m of bgms) {
        if (!seen.has(m._id) && m.isBuiltin) {
          seen.add(m._id);
          results.push(m);
        }
      }
    }

    if (results.filter((m) => m.isBuiltin).length < limit) {
      const more = await ctx.db
        .query("dreamXMedia")
        .withIndex("by_type_builtin", (q) => q.eq("type", "bgm").eq("isBuiltin", true))
        .collect();
      for (const m of more) {
        if (!seen.has(m._id)) {
          seen.add(m._id);
          results.push(m);
        }
      }
    }

    // Fisher-Yates shuffle（用 seed 决定顺序，seed 变化则结果不同）
    const seed = args.shuffleSeed ?? 0;
    const shuffle = <T>(arr: T[]): T[] => {
      const a = [...arr];
      let s = seed;
      for (let i = a.length - 1; i > 0; i--) {
        s = (s * 1664525 + 1013904223) & 0xffffffff;
        const j = Math.abs(s) % (i + 1);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    const userResults = results.filter((m: any) => !m.isBuiltin);
    const builtinResults = results.filter((m: any) => m.isBuiltin);
    const shuffledBuiltin = shuffle(builtinResults);
    return [...userResults, ...shuffledBuiltin.slice(0, limit)];
  },
});

export const getMoodCategories = query({
  args: {},
  handler: async (ctx) => {
    return ["搞笑", "励志", "伤感", "震惊", "日常", "愤怒", "可爱", "委屈"];
  },
});

export const listUserMedia = query({
  args: { type: v.optional(v.union(v.literal("meme"), v.literal("bgm"))) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const all = await ctx.db
      .query("dreamXMedia")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
    if (args.type) return all.filter((m) => m.type === args.type);
    return all;
  },
});

export const addUserMedia = mutation({
  args: {
    type: v.union(v.literal("meme"), v.literal("bgm")),
    name: v.string(),
    mood: v.string(),
    url: v.string(),
    storageId: v.optional(v.id("_storage")),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    return await ctx.db.insert("dreamXMedia", {
      type: args.type,
      name: args.name,
      mood: args.mood,
      url: args.url,
      storageId: args.storageId,
      durationMs: args.durationMs,
      isBuiltin: false,
      userId: identity.subject,
      createdAt: Date.now(),
    });
  },
});

export const deleteUserMedia = mutation({
  args: { id: v.id("dreamXMedia") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const media = await ctx.db.get(args.id);
    if (!media || media.userId !== identity.subject) throw new Error("Unauthorized");
    await ctx.db.delete(args.id);
  },
});

export const seedBuiltinMedia = mutation({
  args: {
    items: v.array(v.object({
      type: v.union(v.literal("meme"), v.literal("bgm")),
      name: v.string(),
      mood: v.string(),
      url: v.string(),
      durationMs: v.optional(v.number()),
      tags: v.optional(v.array(v.string())),
    })),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    for (const item of args.items) {
      const existing = await ctx.db
        .query("dreamXMedia")
        .withIndex("by_type_mood", (q) => q.eq("type", item.type).eq("mood", item.mood))
        .filter((q) => q.eq(q.field("name"), item.name))
        .first();
      if (!existing) {
        await ctx.db.insert("dreamXMedia", {
          ...item,
          isBuiltin: true,
          createdAt: Date.now(),
        });
      }
    }
  },
});

export const getBuiltinByName = internalQuery({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("dreamXMedia")
      .filter((q) => q.and(q.eq(q.field("isBuiltin"), true), q.eq(q.field("name"), args.name)))
      .first();
  },
});

export const insertBuiltinMedia = internalMutation({
  args: {
    type: v.union(v.literal("meme"), v.literal("bgm")),
    name: v.string(),
    mood: v.string(),
    url: v.string(),
    storageId: v.optional(v.id("_storage")),
    durationMs: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("dreamXMedia", {
      ...args,
      isBuiltin: true,
      createdAt: Date.now(),
    });
  },
});
