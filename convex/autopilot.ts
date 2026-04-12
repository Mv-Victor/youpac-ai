import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal as _internal } from "./_generated/api";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const internal: any = _internal;

export const setAutopilot = mutation({
  args: {
    projectId: v.id("dreamXProjects"),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== identity.subject) throw new Error("Unauthorized");

    if (args.enabled) {
      if (project.autopilotScheduledJobId) {
        try { await ctx.scheduler.cancel(project.autopilotScheduledJobId); } catch {}
      }
      const jobId = await ctx.scheduler.runAfter(
        1000,
        internal.autopilotActions.runAutopilotStep,
        { projectId: args.projectId }
      );
      await ctx.db.patch(args.projectId, {
        autopilotEnabled: true,
        autopilotScheduledJobId: jobId,
        updatedAt: Date.now(),
      });
    } else {
      if (project.autopilotScheduledJobId) {
        try {
          await ctx.scheduler.cancel(project.autopilotScheduledJobId);
        } catch {
          // Job may have already run or been cancelled, ignore
        }
      }
      await ctx.db.patch(args.projectId, {
        autopilotEnabled: false,
        autopilotScheduledJobId: undefined,
        updatedAt: Date.now(),
      });
    }
  },
});

export const getAutopilotProjects = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const projects = await ctx.db
      .query("dreamXProjects")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
    return projects
      .filter((p) => p.autopilotEnabled === true)
      .map((p) => ({ projectId: p._id, title: p.title }));
  },
});

export const getProjectAutopilot = query({
  args: { projectId: v.id("dreamXProjects") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== identity.subject) return false;
    return project.autopilotEnabled === true;
  },
});

export const _stopAutopilot = internalMutation({
  args: { projectId: v.id("dreamXProjects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return;
    if (project.autopilotScheduledJobId) {
      try { await ctx.scheduler.cancel(project.autopilotScheduledJobId); } catch {}
    }
    await ctx.db.patch(args.projectId, {
      autopilotEnabled: false,
      autopilotScheduledJobId: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const _scheduleNextStep = internalMutation({
  args: {
    projectId: v.id("dreamXProjects"),
    delayMs: v.number(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || !project.autopilotEnabled) return;

    const jobId = await ctx.scheduler.runAfter(
      args.delayMs,
      internal.autopilotActions.runAutopilotStep,
      { projectId: args.projectId }
    );
    await ctx.db.patch(args.projectId, {
      autopilotScheduledJobId: jobId,
      updatedAt: Date.now(),
    });
  },
});

export const _claimNode = internalMutation({
  args: {
    projectId: v.id("dreamXProjects"),
    nodeKey: v.string(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return false;
    const ns = (project as any).nodeStates;
    if (ns[args.nodeKey]?.status !== "idle") return false;
    await ctx.db.patch(args.projectId, {
      nodeStates: {
        ...ns,
        [args.nodeKey]: { ...(ns[args.nodeKey] ?? {}), status: "generating" },
      },
      updatedAt: Date.now(),
    });
    return true;
  },
});
