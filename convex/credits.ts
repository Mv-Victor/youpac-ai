import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { ConvexError } from "convex/values";

const DEFAULT_BASE_COSTS: Record<string, number> = {
  mediaUpload: 2,
  memeInsert: 2,
  storyboard: 3,
  ttsSelection: 3,
};

function calcImageBonus(imageCount: number): number {
  return imageCount > 4 ? Math.ceil((imageCount - 4) / 2) : 0;
}

function calcCharBonus(charCount: number): number {
  return charCount > 50 ? Math.ceil((charCount - 50) / 20) : 0;
}

export function calcNodeCost(baseCost: number, imageCount = 0, charCount = 0): number {
  return baseCost + calcImageBonus(imageCount) + calcCharBonus(charCount);
}

export const getMyBalance = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("UNAUTHORIZED");
    const userId = identity.subject;
    const account = await ctx.db
      .query("userCredits")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!account) return { balance: 0, totalRedeemed: 0, totalConsumed: 0 };
    return {
      balance: account.balance,
      totalRedeemed: account.totalRedeemed,
      totalConsumed: account.totalConsumed,
    };
  },
});

export const getMyTransactions = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("UNAUTHORIZED");
    const userId = identity.subject;
    const limit = Math.min(args.limit ?? 50, 100);
    const txs = await ctx.db
      .query("creditsTransactions")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
    return txs.map((tx) => ({
      _id: tx._id,
      type: tx.type,
      amount: tx.amount,
      description: tx.description,
      nodeType: tx.nodeType,
      createdAt: tx.createdAt,
    }));
  },
});

export const getAllNodeCreditConfigs = query({
  args: {},
  handler: async (ctx) => {
    const configs = await ctx.db.query("nodeCreditConfigs").collect();
    return configs.map((c) => ({
      nodeType: c.nodeType,
      baseCost: c.baseCost,
      isEnabled: c.isEnabled,
    }));
  },
});

export const redeemCode = mutation({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("UNAUTHORIZED");
    const userId = identity.subject;

    const normalizedCode = args.code.toUpperCase().replace(/-/g, "");

    const codeRecord = await ctx.db
      .query("redeemCodes")
      .withIndex("by_code", (q) => q.eq("code", normalizedCode))
      .unique();

    if (!codeRecord) throw new ConvexError("CODE_NOT_FOUND");
    if (codeRecord.isUsed) throw new ConvexError("CODE_ALREADY_USED");

    await ctx.db.patch(codeRecord._id, {
      isUsed: true,
      usedBy: userId,
      usedAt: Date.now(),
    });

    const existing = await ctx.db
      .query("userCredits")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const creditsAdded = codeRecord.credits;

    if (existing) {
      await ctx.db.patch(existing._id, {
        balance: existing.balance + creditsAdded,
        totalRedeemed: existing.totalRedeemed + creditsAdded,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userCredits", {
        userId,
        balance: creditsAdded,
        totalRedeemed: creditsAdded,
        totalConsumed: 0,
        updatedAt: Date.now(),
      });
    }

    await ctx.db.insert("creditsTransactions", {
      userId,
      type: "redeem",
      amount: creditsAdded,
      codeId: codeRecord._id,
      description: `兑换 ${codeRecord.type === "trial" ? "体验版" : codeRecord.type === "vip" ? "VIP" : "SVIP"} 码`,
      createdAt: Date.now(),
    });

    const updated = await ctx.db
      .query("userCredits")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    return {
      creditsAdded,
      newBalance: updated?.balance ?? creditsAdded,
      codeType: codeRecord.type,
    };
  },
});

export const deductCredits = mutation({
  args: {
    nodeType: v.string(),
    imageCount: v.optional(v.number()),
    projectId: v.optional(v.id("dreamXProjects")),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("UNAUTHORIZED");
    const userId = identity.subject;

    const config = await ctx.db
      .query("nodeCreditConfigs")
      .withIndex("by_nodeType", (q) => q.eq("nodeType", args.nodeType))
      .unique();

    const baseCost = config?.baseCost ?? DEFAULT_BASE_COSTS[args.nodeType] ?? 1;
    const totalCost = calcNodeCost(baseCost, args.imageCount ?? 0);

    const account = await ctx.db
      .query("userCredits")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const currentBalance = account?.balance ?? 0;
    if (currentBalance < totalCost) throw new ConvexError("INSUFFICIENT_CREDITS");

    if (account) {
      await ctx.db.patch(account._id, {
        balance: account.balance - totalCost,
        totalConsumed: account.totalConsumed + totalCost,
        updatedAt: Date.now(),
      });
    } else {
      throw new ConvexError("INSUFFICIENT_CREDITS");
    }

    const projectTitle = args.projectId
      ? (await ctx.db.get(args.projectId))?.title
      : undefined;
    const description = projectTitle
      ? `[${projectTitle}] ${args.description ?? ""}`
      : args.description;

    await ctx.db.insert("creditsTransactions", {
      userId,
      type: "consume",
      amount: totalCost,
      nodeType: args.nodeType,
      projectId: args.projectId,
      description,
      createdAt: Date.now(),
    });

    const updated = await ctx.db
      .query("userCredits")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    return {
      deducted: totalCost,
      newBalance: updated?.balance ?? 0,
    };
  },
});

export const deductCreditsInternal = internalMutation({
  args: {
    userId: v.string(),
    nodeType: v.string(),
    imageCount: v.optional(v.number()),
    charCount: v.optional(v.number()),
    projectId: v.optional(v.id("dreamXProjects")),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const config = await ctx.db
      .query("nodeCreditConfigs")
      .withIndex("by_nodeType", (q) => q.eq("nodeType", args.nodeType))
      .unique();

    const baseCost = config?.baseCost ?? DEFAULT_BASE_COSTS[args.nodeType] ?? 1;
    const totalCost = calcNodeCost(baseCost, args.imageCount ?? 0, args.charCount ?? 0);

    const account = await ctx.db
      .query("userCredits")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    const currentBalance = account?.balance ?? 0;
    if (currentBalance < totalCost) throw new ConvexError("INSUFFICIENT_CREDITS");

    if (account) {
      await ctx.db.patch(account._id, {
        balance: account.balance - totalCost,
        totalConsumed: account.totalConsumed + totalCost,
        updatedAt: Date.now(),
      });
    } else {
      throw new ConvexError("INSUFFICIENT_CREDITS");
    }

    const projectTitle = args.projectId
      ? (await ctx.db.get(args.projectId))?.title
      : undefined;
    const description = projectTitle
      ? `[${projectTitle}] ${args.description ?? ""}`
      : args.description;

    await ctx.db.insert("creditsTransactions", {
      userId: args.userId,
      type: "consume",
      amount: totalCost,
      nodeType: args.nodeType,
      projectId: args.projectId,
      description,
      createdAt: Date.now(),
    });

    const updated = await ctx.db
      .query("userCredits")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    return {
      deducted: totalCost,
      newBalance: updated?.balance ?? 0,
    };
  },
});

export const checkBalanceInternal = internalMutation({
  args: {
    userId: v.string(),
    nodeType: v.string(),
    imageCount: v.optional(v.number()),
    charCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const config = await ctx.db
      .query("nodeCreditConfigs")
      .withIndex("by_nodeType", (q) => q.eq("nodeType", args.nodeType))
      .unique();

    const baseCost = config?.baseCost ?? DEFAULT_BASE_COSTS[args.nodeType] ?? 1;
    const totalCost = calcNodeCost(baseCost, args.imageCount ?? 0, args.charCount ?? 0);

    const account = await ctx.db
      .query("userCredits")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    const currentBalance = account?.balance ?? 0;
    if (currentBalance < totalCost) throw new ConvexError("INSUFFICIENT_CREDITS");

    return { sufficient: true, balance: currentBalance, required: totalCost };
  },
});

export const insertRedeemCode = internalMutation({
  args: {
    code: v.string(),
    type: v.union(v.literal("trial"), v.literal("vip"), v.literal("svip")),
    credits: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("redeemCodes")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();

    if (existing) throw new ConvexError(`Code already exists: ${args.code}`);

    await ctx.db.insert("redeemCodes", {
      code: args.code,
      type: args.type,
      credits: args.credits,
      isUsed: false,
      createdAt: Date.now(),
    });
  },
});

export const seedNodeCreditConfigs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const initialConfigs = [
      { nodeType: "mediaUpload", baseCost: 2, isEnabled: true },
      { nodeType: "memeInsert", baseCost: 2, isEnabled: true },
      { nodeType: "memeRecall", baseCost: 1, isEnabled: false },
      { nodeType: "storyboard", baseCost: 3, isEnabled: true },
      { nodeType: "ttsSelection", baseCost: 3, isEnabled: true },
    ];

    let seeded = 0;
    let skipped = 0;

    for (const cfg of initialConfigs) {
      const existing = await ctx.db
        .query("nodeCreditConfigs")
        .withIndex("by_nodeType", (q) => q.eq("nodeType", cfg.nodeType))
        .unique();

      if (existing) {
        skipped++;
        continue;
      }

      await ctx.db.insert("nodeCreditConfigs", {
        ...cfg,
        updatedAt: Date.now(),
      });
      seeded++;
    }

    return { seeded, skipped };
  },
});
