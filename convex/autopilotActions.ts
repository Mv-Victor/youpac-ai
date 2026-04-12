"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal as _internal, api } from "./_generated/api";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const internal: any = _internal;

const PIPELINE = [
  "mediaUpload",
  "memeRecall",
  "bgmRecall",
  "storyboard",
  "ttsSelection",
  "capcutBuild",
] as const;

type PipelineKey = typeof PIPELINE[number];

const DEFAULT_VOICE_TYPE = "zh_female_xiaohe_uranus_bigtts";
const DEFAULT_VOICE_NAME = "小何 2.0";

const EMOTION_VOICE_PRIORITY: Record<string, string[]> = {
  搞笑: ["zh_female_xiaohe_uranus_bigtts", "zh_male_shaonianzixin_uranus_bigtts"],
  震惊: ["zh_female_xiaohe_uranus_bigtts", "zh_male_m191_uranus_bigtts"],
  励志: ["zh_male_m191_uranus_bigtts", "zh_male_taocheng_uranus_bigtts"],
  伤感: ["zh_female_vv_uranus_bigtts", "zh_female_meilinvyou_uranus_bigtts"],
  日常: ["zh_female_vv_uranus_bigtts", "zh_female_xiaohe_uranus_bigtts"],
  可爱: ["zh_female_cancan_mars_bigtts", "zh_female_xiaohe_uranus_bigtts"],
  委屈: ["zh_female_vv_uranus_bigtts", "zh_female_cancan_mars_bigtts"],
  愤怒: ["zh_male_m191_uranus_bigtts", "zh_male_liufei_uranus_bigtts"],
};

const VOICE_NAMES: Record<string, string> = {
  "zh_female_vv_uranus_bigtts": "Vivi 2.0",
  "zh_female_xiaohe_uranus_bigtts": "小何 2.0",
  "zh_male_m191_uranus_bigtts": "云舟 2.0",
  "zh_male_taocheng_uranus_bigtts": "小天 2.0",
  "zh_male_liufei_uranus_bigtts": "刘飞",
  "zh_female_cancan_mars_bigtts": "灿灿",
  "zh_female_meilinvyou_uranus_bigtts": "美玲",
  "zh_male_shaonianzixin_uranus_bigtts": "少年梓鑫",
};

function selectVoiceByEmotion(emotionTags: string[]): { voiceType: string; voiceName: string } {
  const scores = new Map<string, number>();
  for (const tag of emotionTags) {
    const priorities = EMOTION_VOICE_PRIORITY[tag] ?? [];
    priorities.forEach((voiceType, idx) => {
      scores.set(voiceType, (scores.get(voiceType) ?? 0) + (3 - idx));
    });
  }
  if (scores.size === 0) {
    return { voiceType: DEFAULT_VOICE_TYPE, voiceName: DEFAULT_VOICE_NAME };
  }
  const best = [...scores.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return { voiceType: best, voiceName: VOICE_NAMES[best] ?? best };
}

export const runAutopilotStep = internalAction({
  args: {
    projectId: v.id("dreamXProjects"),
    jobId: v.id("autopilotJobs"),
  },
  handler: async (ctx, args) => {
    const { projectId, jobId } = args;

    // 1. Read project and job
    const project = await ctx.runQuery(api.dreamXCanvas.getProject, { id: projectId });
    if (!project) return;
    if (!(project as any).autopilotEnabled) return;

    // Fetch the autopilot job via a dedicated internal query
    const job = await ctx.runQuery(internal.autopilot._getJob, { jobId });
    if (!job) return;

    // 2. Clear pendingScheduledJobId — prevent double-cancel
    await ctx.runMutation(internal.autopilot._updateJob, {
      jobId,
      patch: { pendingScheduledJobId: null },
    });

    const ns = (project as any).nodeStates;

    // 3. Find the first non-completed node
    let currentNodeIndex: number | null = null;
    let currentNode: PipelineKey | null = null;
    for (let i = 0; i < PIPELINE.length; i++) {
      const key = PIPELINE[i];
      const nodeStatus = ns[key]?.status;
      if (nodeStatus !== "completed") {
        currentNodeIndex = i;
        currentNode = key;
        break;
      }
    }

    // 4. All nodes completed → stop autopilot (success)
    if (currentNode === null || currentNodeIndex === null) {
      await ctx.runMutation(internal.autopilot._stopAutopilot, { projectId });
      return;
    }

    const nodeStatus = ns[currentNode]?.status;

    // 5. Current node in error → mark failed
    if (nodeStatus === "error") {
      await ctx.runMutation(internal.autopilot._markFailed, {
        projectId,
        reason: `Node ${currentNode} encountered an error`,
      });
      return;
    }

    // 6. Retry count exceeded → mark failed (timeout)
    if (job.retryCount >= 30) {
      await ctx.runMutation(internal.autopilot._markFailed, {
        projectId,
        reason: `Timeout waiting for node ${currentNode} after 30 retries`,
      });
      return;
    }

    // 7. Node still generating → increment retryCount and schedule 10s retry
    if (nodeStatus === "generating") {
      await ctx.runMutation(internal.autopilot._updateJob, {
        jobId,
        patch: { retryCount: job.retryCount + 1 },
      });
      await ctx.runMutation(internal.autopilot._scheduleNextStep, {
        projectId,
        jobId,
        delayMs: 10000,
      });
      return;
    }

    // 8. Node is idle
    if (nodeStatus === "idle") {
      const confirmedNodeIndices: number[] = job.confirmedNodeIndices ?? [];

      // Check if this node index is already confirmed (idempotency guard)
      if (confirmedNodeIndices.includes(currentNodeIndex)) {
        // Skip and advance to the next node index
        await ctx.runMutation(internal.autopilot._updateJob, {
          jobId,
          patch: { currentNodeIndex: currentNodeIndex + 1, retryCount: 0 },
        });
        // Schedule next step immediately
        await ctx.runMutation(internal.autopilot._scheduleNextStep, {
          projectId,
          jobId,
          delayMs: 3000,
        });
        return;
      }

      // Execute the handler for this node
      try {
        if (currentNode === "mediaUpload") {
          await handleMediaUpload(ctx, projectId, jobId, ns, currentNodeIndex, confirmedNodeIndices);
        } else if (currentNode === "memeRecall") {
          await handleMemeRecall(ctx, projectId, jobId, ns, currentNodeIndex, confirmedNodeIndices);
        } else if (currentNode === "bgmRecall") {
          await handleBgmRecall(ctx, projectId, jobId, ns, currentNodeIndex, confirmedNodeIndices);
        } else if (currentNode === "storyboard") {
          await handleStoryboard(ctx, projectId, jobId, ns, currentNodeIndex, confirmedNodeIndices);
        } else if (currentNode === "ttsSelection") {
          await handleTtsSelection(ctx, projectId, jobId, ns, currentNodeIndex, confirmedNodeIndices);
        } else if (currentNode === "capcutBuild") {
          await handleCapcutBuild(ctx, projectId, jobId, currentNodeIndex, confirmedNodeIndices);
        }
      } catch (e: any) {
        console.error(`[Autopilot] Error in handler for node ${currentNode}:`, e?.message ?? e);
        await ctx.runMutation(internal.autopilot._markFailed, {
          projectId,
          reason: `Handler error in node ${currentNode}: ${e?.message ?? String(e)}`,
        });
        return;
      }
    }

    // 9. Schedule next step after 3s (for both successful handler execution and non-idle states)
    await ctx.runMutation(internal.autopilot._scheduleNextStep, {
      projectId,
      jobId,
      delayMs: 3000,
    });
  },
});

// ─── Handler: mediaUpload ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleMediaUpload(ctx: any, projectId: any, jobId: any, ns: any, nodeIndex: number, confirmedNodeIndices: number[]) {
  const images: any[] = ns.mediaUpload?.images ?? [];

  // Ready condition: images non-empty AND all aiDescriptions present
  if (images.length === 0) {
    // No images: schedule a retry to wait for images to be uploaded
    await ctx.runMutation(internal.autopilot._scheduleNextStep, {
      projectId,
      jobId,
      delayMs: 10000,
    });
    return;
  }

  const allDescribed = images.every((img: any) => img.aiDescription && img.aiDescription.trim().length > 0);
  if (!allDescribed) {
    // AI analysis not yet complete: wait and retry
    await ctx.runMutation(internal.autopilot._updateJob, {
      jobId,
      patch: { retryCount: (await ctx.runQuery(internal.autopilot._getJob, { jobId })).retryCount + 1 },
    });
    await ctx.runMutation(internal.autopilot._scheduleNextStep, {
      projectId,
      jobId,
      delayMs: 10000,
    });
    return;
  }

  // All images have AI descriptions: confirm mediaUpload by marking as confirmed
  // The mediaUpload node may already be "idle" or "completed" after AI analysis
  // We just need to mark it as confirmed so the pipeline can proceed
  const updatedConfirmed = [...confirmedNodeIndices, nodeIndex];
  await ctx.runMutation(internal.autopilot._updateJob, {
    jobId,
    patch: {
      confirmedNodeIndices: updatedConfirmed,
      currentNodeIndex: nodeIndex + 1,
      retryCount: 0,
    },
  });
}

// ─── Handler: memeRecall ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleMemeRecall(ctx: any, projectId: any, jobId: any, ns: any, nodeIndex: number, confirmedNodeIndices: number[]) {
  // memeRecall status === "idle" means AI analysis is complete; confirm it
  const emotionTags: string[] = ns.copywriting?.emotionTags ?? ns.mediaUpload?.emotionTags ?? [];
  const imageUrls: string[] = (ns.mediaUpload?.images ?? []).map((i: any) => i.url);

  const suggestedMemes = await ctx.runQuery(api.dreamXMedia.getSuggestedMemes, {
    emotionTags,
    limit: 6,
    shuffleSeed: 0,
  });

  const memes: Array<{ url: string; name: string; mood: string; insertAfterImageIndex: number }> = [];

  if (suggestedMemes && suggestedMemes.length > 0 && imageUrls.length > 0) {
    try {
      const suggestions = await ctx.runAction(api.dreamXAI.suggestMemeInsertions, {
        imageUrls,
        memes: suggestedMemes.slice(0, 6).map((m: any) => ({ url: m.url, name: m.name, mood: m.mood })),
        projectId,
      });
      if (suggestions && suggestions.length > 0) {
        for (const s of suggestions) {
          const meme = suggestedMemes.find((m: any) => m.url === s.memeUrl);
          if (meme) {
            memes.push({ url: meme.url, name: meme.name, mood: meme.mood, insertAfterImageIndex: s.insertAfterImageIndex });
          }
        }
      }
    } catch {
      suggestedMemes.slice(0, 3).forEach((m: any, i: number) => {
        memes.push({ url: m.url, name: m.name, mood: m.mood, insertAfterImageIndex: i });
      });
    }
  } else if (suggestedMemes && suggestedMemes.length > 0) {
    suggestedMemes.slice(0, 3).forEach((m: any, i: number) => {
      memes.push({ url: m.url, name: m.name, mood: m.mood, insertAfterImageIndex: i });
    });
  }

  await ctx.runMutation(internal.dreamXCanvas._completeMemeRecall, {
    id: projectId,
    selectedMemes: memes,
  });

  // Mark as confirmed and advance
  const updatedConfirmed = [...confirmedNodeIndices, nodeIndex];
  await ctx.runMutation(internal.autopilot._updateJob, {
    jobId,
    patch: {
      confirmedNodeIndices: updatedConfirmed,
      currentNodeIndex: nodeIndex + 1,
      retryCount: 0,
    },
  });
}

// ─── Handler: bgmRecall ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleBgmRecall(ctx: any, projectId: any, jobId: any, ns: any, nodeIndex: number, confirmedNodeIndices: number[]) {
  // bgmRecall status === "idle": randomly select a BGM and confirm
  const emotionTags: string[] = ns.copywriting?.emotionTags ?? ns.mediaUpload?.emotionTags ?? [];

  const suggestedBgms = await ctx.runQuery(api.dreamXMedia.getSuggestedBgms, {
    emotionTags,
    limit: 5,
    shuffleSeed: 0,
  });

  if (suggestedBgms && suggestedBgms.length > 0) {
    const randomIndex = Math.floor(Math.random() * suggestedBgms.length);
    const bgm = suggestedBgms[randomIndex];
    await ctx.runMutation(internal.dreamXCanvas._completeBgmRecall, {
      id: projectId,
      selectedBgm: { url: bgm.url, name: bgm.name, durationMs: bgm.durationMs, volume: -35 },
    });
  } else {
    await ctx.runMutation(internal.dreamXCanvas._completeBgmRecall, {
      id: projectId,
      skipped: true,
    });
  }

  // Mark as confirmed and advance (storyboard generation is triggered as a side-effect by _completeBgmRecall)
  const updatedConfirmed = [...confirmedNodeIndices, nodeIndex];
  await ctx.runMutation(internal.autopilot._updateJob, {
    jobId,
    patch: {
      confirmedNodeIndices: updatedConfirmed,
      currentNodeIndex: nodeIndex + 1,
      retryCount: 0,
    },
  });
}

// ─── Handler: storyboard ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleStoryboard(ctx: any, projectId: any, jobId: any, ns: any, nodeIndex: number, confirmedNodeIndices: number[]) {
  // storyboard status === "idle": BGM recall already triggered generation as side-effect
  // If it's idle (not generating), it means we need to trigger generation explicitly
  const existingTimeline = ns.storyboard?.timeline;
  if (existingTimeline && existingTimeline.length > 0) {
    await ctx.runMutation(internal.dreamXCanvas._completeStoryboard, {
      id: projectId,
      timeline: existingTimeline,
      totalDurationMs: ns.storyboard?.totalDurationMs ?? 0,
    });

    // Mark as confirmed and advance
    const updatedConfirmed = [...confirmedNodeIndices, nodeIndex];
    await ctx.runMutation(internal.autopilot._updateJob, {
      jobId,
      patch: {
        confirmedNodeIndices: updatedConfirmed,
        currentNodeIndex: nodeIndex + 1,
        retryCount: 0,
      },
    });
  } else {
    // Trigger storyboard generation
    const images = (ns.mediaUpload?.images ?? []).map((i: any) => ({ url: i.url, fileName: i.fileName }));
    const selectedMemes = ns.memeRecall?.selectedMemes ?? [];
    await ctx.runAction(api.dreamXAI.generateStoryboard, {
      projectId,
      images,
      selectedMemes,
    });
    // After triggering generation, the node transitions to "generating"
    // The next step check will detect this and wait
  }
}

// ─── Handler: ttsSelection ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleTtsSelection(ctx: any, projectId: any, jobId: any, ns: any, nodeIndex: number, confirmedNodeIndices: number[]) {
  // ttsSelection status === "idle" means storyboard is completed and ttsSelection is unlocked
  const emotionTags: string[] = ns.copywriting?.emotionTags ?? ns.mediaUpload?.emotionTags ?? [];
  const { voiceType, voiceName } = selectVoiceByEmotion(emotionTags);

  const timeline: any[] = ns.storyboard?.timeline ?? [];
  const segments: Array<{ itemIdx: number; text: string }> = [];

  for (let tiIdx = 0; tiIdx < timeline.length; tiIdx++) {
    const item = timeline[tiIdx];
    if (!Array.isArray(item.subtitles)) continue;
    for (let subIdx = 0; subIdx < item.subtitles.length; subIdx++) {
      const sub = item.subtitles[subIdx];
      if (sub.text?.trim()) {
        segments.push({ itemIdx: tiIdx * 100000 + subIdx, text: sub.text.trim() });
      }
    }
  }

  if (segments.length === 0) {
    await ctx.runMutation(internal.dreamXCanvas._completeTTSSelection, {
      id: projectId,
      selectedVoiceType: voiceType,
      selectedVoiceName: voiceName,
      audioUrl: "",
      audioDurationMs: ns.storyboard?.totalDurationMs ?? 0,
      skipped: true,
    });
  } else {
    await ctx.runAction(api.dreamXAI.generateTTSPerSegment, {
      projectId,
      voiceType,
      segments,
      subtitlesChanged: false,
      imageCount: ns.mediaUpload?.images?.length ?? 0,
    });

    const totalAudioMs = timeline.reduce((sum: number, item: any) => sum + (item.durationMs ?? 0), 0);

    const currentSnapshot = segments.map((s) => {
      const tiIdx = Math.floor(s.itemIdx / 100000);
      const subIdx = s.itemIdx % 100000;
      return `${tiIdx}_${subIdx}:${s.text}`;
    }).join("|");

    await ctx.runMutation(internal.dreamXCanvas._completeTTSSelection, {
      id: projectId,
      selectedVoiceType: voiceType,
      selectedVoiceName: voiceName,
      audioUrl: "",
      audioDurationMs: totalAudioMs || (ns.storyboard?.totalDurationMs ?? 0),
      subtitleSnapshot: currentSnapshot,
    });
  }

  // Mark as confirmed and advance
  const updatedConfirmed = [...confirmedNodeIndices, nodeIndex];
  await ctx.runMutation(internal.autopilot._updateJob, {
    jobId,
    patch: {
      confirmedNodeIndices: updatedConfirmed,
      currentNodeIndex: nodeIndex + 1,
      retryCount: 0,
    },
  });
}

// ─── Handler: capcutBuild ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCapcutBuild(ctx: any, projectId: any, jobId: any, nodeIndex: number, confirmedNodeIndices: number[]) {
  // capcutBuild status === "idle" means ttsSelection is completed and capcutBuild is unlocked
  await ctx.runAction(api.capcutBuilder.buildCapcutProject, { projectId });

  // Mark as confirmed and advance
  const updatedConfirmed = [...confirmedNodeIndices, nodeIndex];
  await ctx.runMutation(internal.autopilot._updateJob, {
    jobId,
    patch: {
      confirmedNodeIndices: updatedConfirmed,
      currentNodeIndex: nodeIndex + 1,
      retryCount: 0,
    },
  });
}
