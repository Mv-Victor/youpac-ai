import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal as _internal } from "./_generated/api";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const internal: any = _internal;

// ─── New autopilot rewrite (003-ai-hosting-rewrite) ──────────────────────────

export const enableAutopilot = mutation({
  args: {
    projectId: v.id("dreamXProjects"),
  },
  handler: async (ctx, args) => {
    // 1. Auth check
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== identity.subject) throw new Error("Unauthorized");

    // 2. Idempotent: if already running, ignore
    if (project.autopilotEnabled === true) return;

    // 3. Validate images non-empty
    const images = project.nodeStates?.mediaUpload?.images ?? [];
    if (images.length === 0) throw new Error("请先上传图片");

    // 4. Clean up any existing orphaned AutopilotJob for this project
    const existingJobs = await ctx.db
      .query("autopilotJobs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const job of existingJobs) {
      if (job.pendingScheduledJobId) {
        try {
          await ctx.scheduler.cancel(job.pendingScheduledJobId);
        } catch {
          // Job may have already run or been cancelled, ignore
        }
      }
      await ctx.db.delete(job._id);
    }

    // 5. Write project: autopilotEnabled=true, autopilotFailed=false
    await ctx.db.patch(args.projectId, {
      autopilotEnabled: true,
      autopilotFailed: false,
      updatedAt: Date.now(),
    });

    // 6. Find startIndex: first node with status !== "completed"
    const PIPELINE = [
      "mediaUpload",
      "memeRecall",
      "bgmRecall",
      "storyboard",
      "ttsSelection",
      "capcutBuild",
    ] as const;

    let startIndex = 0;
    for (let i = 0; i < PIPELINE.length; i++) {
      const nodeKey = PIPELINE[i];
      const nodeStatus = (project.nodeStates as any)[nodeKey]?.status;
      if (nodeStatus !== "completed") {
        startIndex = i;
        break;
      }
      // If all are completed, startIndex stays at last
      if (i === PIPELINE.length - 1) startIndex = i;
    }

    // 7. Create new AutopilotJob
    const now = Date.now();
    const jobId = await ctx.db.insert("autopilotJobs", {
      projectId: args.projectId,
      currentNodeIndex: startIndex,
      retryCount: 0,
      pendingScheduledJobId: undefined,
      confirmedNodeIndices: [],
      createdAt: now,
      updatedAt: now,
    });

    // 8. Schedule runAutopilotStep after 1000ms and write pendingScheduledJobId
    const scheduledId = await ctx.scheduler.runAfter(
      1000,
      internal.autopilotActions.runAutopilotStep,
      { projectId: args.projectId, jobId }
    );

    await ctx.db.patch(jobId, {
      pendingScheduledJobId: scheduledId,
      updatedAt: Date.now(),
    });
  },
});

export const getProjectAutopilotStatus = query({
  args: {
    projectId: v.id("dreamXProjects"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== identity.subject) return null;

    return {
      enabled: project.autopilotEnabled === true,
      failed: project.autopilotFailed === true,
    };
  },
});

export const disableAutopilot = mutation({
  args: {
    projectId: v.id("dreamXProjects"),
  },
  handler: async (ctx, args) => {
    // 1. Auth check
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== identity.subject) throw new Error("Unauthorized");

    // 2. Find and clean up all AutopilotJob records for this project
    const jobs = await ctx.db
      .query("autopilotJobs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const job of jobs) {
      if (job.pendingScheduledJobId) {
        try {
          await ctx.scheduler.cancel(job.pendingScheduledJobId);
        } catch {
          // Job may have already run or been cancelled, ignore
        }
      }
      await ctx.db.delete(job._id);
    }

    // 3. Write project: autopilotEnabled=false (do NOT change autopilotFailed)
    await ctx.db.patch(args.projectId, {
      autopilotEnabled: false,
      updatedAt: Date.now(),
    });
  },
});

// ─── Legacy autopilot (to be replaced in T003-T009) ──────────────────────────

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
      .filter((p) => p.autopilotEnabled === true || p.autopilotFailed === true)
      .map((p) => ({
        projectId: p._id,
        title: p.title,
        failed: p.autopilotFailed === true,
      }));
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
    // Write autopilotEnabled=false, autopilotFailed=false (success path)
    await ctx.db.patch(args.projectId, {
      autopilotEnabled: false,
      autopilotFailed: false,
      updatedAt: Date.now(),
    });

    // Delete the AutopilotJob record for this project
    const jobs = await ctx.db
      .query("autopilotJobs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const job of jobs) {
      await ctx.db.delete(job._id);
    }
  },
});

export const _markFailed = internalMutation({
  args: {
    projectId: v.id("dreamXProjects"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Write autopilotEnabled=false, autopilotFailed=true (failure path)
    await ctx.db.patch(args.projectId, {
      autopilotEnabled: false,
      autopilotFailed: true,
      updatedAt: Date.now(),
    });

    // Delete the AutopilotJob record for this project
    const jobs = await ctx.db
      .query("autopilotJobs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const job of jobs) {
      await ctx.db.delete(job._id);
    }
  },
});

export const _updateJob = internalMutation({
  args: {
    jobId: v.id("autopilotJobs"),
    patch: v.object({
      currentNodeIndex: v.optional(v.number()),
      retryCount: v.optional(v.number()),
      pendingScheduledJobId: v.optional(v.union(v.id("_scheduled_functions"), v.null())),
      confirmedNodeIndices: v.optional(v.array(v.number())),
    }),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return;

    // Build patch object, only including provided fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: any = { updatedAt: Date.now() };

    if (args.patch.currentNodeIndex !== undefined) {
      update.currentNodeIndex = args.patch.currentNodeIndex;
    }
    if (args.patch.retryCount !== undefined) {
      update.retryCount = args.patch.retryCount;
    }
    if ("pendingScheduledJobId" in args.patch) {
      // null means clear the field (set to undefined in Convex)
      update.pendingScheduledJobId = args.patch.pendingScheduledJobId ?? undefined;
    }
    if (args.patch.confirmedNodeIndices !== undefined) {
      update.confirmedNodeIndices = args.patch.confirmedNodeIndices;
    }

    await ctx.db.patch(args.jobId, update);
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
