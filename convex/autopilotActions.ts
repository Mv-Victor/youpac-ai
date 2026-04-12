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
  args: { projectId: v.id("dreamXProjects") },
  handler: async (ctx, args) => {
    const { projectId } = args;

    const project = await ctx.runQuery(api.dreamXCanvas.getProject, { id: projectId });
    if (!project) return;
    if (!(project as any).autopilotEnabled) return;

    const ns = (project as any).nodeStates;

    let currentNode: PipelineKey | null = null;
    for (const key of PIPELINE) {
      const nodeStatus = ns[key]?.status;
      if (nodeStatus !== "completed") {
        currentNode = key;
        break;
      }
    }

    if (!currentNode) {
      await ctx.runMutation(internal.autopilot._stopAutopilot, { projectId });
      return;
    }

    const nodeStatus = ns[currentNode]?.status;

    if (nodeStatus === "error") {
      await ctx.runMutation(internal.autopilot._stopAutopilot, { projectId });
      return;
    }

    if (nodeStatus === "generating") {
      await ctx.runMutation(internal.autopilot._scheduleNextStep, { projectId, delayMs: 15000 });
      return;
    }

    if (currentNode === "mediaUpload") {
      await ctx.runMutation(internal.autopilot._scheduleNextStep, { projectId, delayMs: 20000 });
      return;
    }

    try {
      if (currentNode === "memeRecall" && nodeStatus === "idle") {
        await handleMemeRecall(ctx, projectId, ns);
      } else if (currentNode === "bgmRecall" && nodeStatus === "idle") {
        await handleBgmRecall(ctx, projectId, ns);
      } else if (currentNode === "storyboard" && nodeStatus === "idle") {
        await handleStoryboard(ctx, projectId, ns);
      } else if (currentNode === "ttsSelection" && nodeStatus === "idle") {
        await handleTTSSelection(ctx, projectId, ns);
      } else if (currentNode === "capcutBuild" && nodeStatus === "idle") {
        await handleCapcutBuild(ctx, projectId);
      }
    } catch (e: any) {
      console.error(`[Autopilot] Error in node ${currentNode}:`, e?.message ?? e);
      await ctx.runMutation(internal.autopilot._stopAutopilot, { projectId });
      return;
    }

    await ctx.runMutation(internal.autopilot._scheduleNextStep, { projectId, delayMs: 3000 });
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleMemeRecall(ctx: any, projectId: any, ns: any) {
  const claimed = await ctx.runMutation(internal.autopilot._claimNode, { projectId, nodeKey: "memeRecall" });
  if (!claimed) return;

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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleBgmRecall(ctx: any, projectId: any, ns: any) {
  const claimed = await ctx.runMutation(internal.autopilot._claimNode, { projectId, nodeKey: "bgmRecall" });
  if (!claimed) return;

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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleStoryboard(ctx: any, projectId: any, ns: any) {
  const claimed = await ctx.runMutation(internal.autopilot._claimNode, { projectId, nodeKey: "storyboard" });
  if (!claimed) return;

  const existingTimeline = ns.storyboard?.timeline;
  if (existingTimeline && existingTimeline.length > 0) {
    await ctx.runMutation(internal.dreamXCanvas._completeStoryboard, {
      id: projectId,
      timeline: existingTimeline,
      totalDurationMs: ns.storyboard?.totalDurationMs ?? 0,
    });
  } else {
    const images = (ns.mediaUpload?.images ?? []).map((i: any) => ({ url: i.url, fileName: i.fileName }));
    const selectedMemes = ns.memeRecall?.selectedMemes ?? [];
    await ctx.runAction(api.dreamXAI.generateStoryboard, {
      projectId,
      images,
      selectedMemes,
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleTTSSelection(ctx: any, projectId: any, ns: any) {
  const claimed = await ctx.runMutation(internal.autopilot._claimNode, { projectId, nodeKey: "ttsSelection" });
  if (!claimed) return;

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
    return;
  }

  await ctx.runAction(api.dreamXAI.generateTTSPerSegment, {
    projectId,
    voiceType,
    segments,
    subtitlesChanged: false,
    imageCount: ns.mediaUpload?.images?.length ?? 0,
  });

  const currentSnapshot = segments.map((s) => {
    const tiIdx = Math.floor(s.itemIdx / 100000);
    const subIdx = s.itemIdx % 100000;
    return `${tiIdx}_${subIdx}:${s.text}`;
  }).join("|");

  const totalAudioMs = timeline.reduce((sum: number, item: any) => sum + (item.durationMs ?? 0), 0);

  await ctx.runMutation(internal.dreamXCanvas._completeTTSSelection, {
    id: projectId,
    selectedVoiceType: voiceType,
    selectedVoiceName: voiceName,
    audioUrl: "",
    audioDurationMs: totalAudioMs || (ns.storyboard?.totalDurationMs ?? 0),
    subtitleSnapshot: currentSnapshot,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCapcutBuild(ctx: any, projectId: any) {
  const claimed = await ctx.runMutation(internal.autopilot._claimNode, { projectId, nodeKey: "capcutBuild" });
  if (!claimed) return;

  await ctx.runAction(api.capcutBuilder.buildCapcutProject, { projectId });
}
