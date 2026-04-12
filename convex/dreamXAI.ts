"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { anthropic, DEFAULT_MODEL } from "./lib/anthropic";
import { generateText } from "ai";
import { internal } from "./_generated/api";
import { ConvexError } from "convex/values";

// ─── analyzeMediaBatch ────────────────────────────────────────────────────────

export const analyzeMediaBatch = action({
  args: {
    imageUrls: v.array(v.string()),
    eventDescription: v.optional(v.string()),
    projectId: v.optional(v.id("dreamXProjects")),
  },
  handler: async (ctx, args) => {
    const { imageUrls, eventDescription } = args;
    const identity = await ctx.auth.getUserIdentity();

    if (identity) {
      await (ctx.runMutation as any)(internal.credits.checkBalanceInternal, {
        userId: identity.subject,
        nodeType: "mediaUpload",
        imageCount: imageUrls.length,
      });
    }

    // 把图片下载为 base64 data URL（Convex storage URL 有认证，Claude 代理无法直接访问）
    const imageContent: Array<{ type: "image"; image: string }> = [];
    for (const url of imageUrls) {
      try {
        const resp = await fetch(url);
        if (!resp.ok) {
          console.warn(`Failed to fetch image ${url}: ${resp.status}`);
          continue;
        }
        const contentType = resp.headers.get("content-type") ?? "image/jpeg";
        const mimeType = contentType.split(";")[0].trim();
        const arrayBuffer = await resp.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const dataUrl = `data:${mimeType};base64,${base64}`;
        imageContent.push({ type: "image" as const, image: dataUrl });
      } catch (err) {
        console.warn(`Error fetching image ${url}:`, err);
      }
    }

    if (imageContent.length === 0) {
      throw new Error("无法加载任何图片，请检查图片是否已正确上传");
    }

    const userPrompt = `请分析以下${imageContent.length}张图片的内容，这些图片用于制作小红书营销短视频。

事件描述：${eventDescription || "（请根据图片自行理解）"}

请按以下格式输出（所有内容总字数严格控制在400字以内，每图描述不超过20字）：

【逐图理解】
${imageContent.map((_, i) => `图${i + 1}：[简短描述，不超过20字]`).join("\n")}

【综合分析】
[2句话，描述整体主题和营销价值点，不超过60字]

【情绪标签】
[从以下标签中选2-4个最匹配的，用逗号分隔]
搞笑 / 震惊 / 励志 / 伤感 / 日常 / 可爱 / 委屈 / 愤怒 / 欢快`;

    let text: string;
    try {
      const result = await generateText({
        model: anthropic(DEFAULT_MODEL),
        system: "你是一名专业的短视频内容分析师，擅长理解图片内容并提炼营销价值。",
        messages: [
          {
            role: "user",
            content: [
              ...imageContent,
              { type: "text", text: userPrompt },
            ],
          },
        ],
        maxTokens: 600,
        // 增加重试配置
        maxRetries: 2,
        // 设置超时（单位：毫秒）
        abortSignal: AbortSignal.timeout(120000), // 120秒
      });
      text = result.text;
    } catch (err: any) {
      console.error("[analyzeMediaBatch] Claude API Error:", {
        name: err.name,
        message: err.message,
        status: err.statusCode || err.status,
        responseBody: err.responseBody,
        cause: err.cause,
        imageCount: imageContent.length,
        totalBase64Size: imageContent.reduce((sum, img) => sum + img.image.length, 0),
      });
      
      // 给用户友好的错误提示
      if (err.statusCode === 524 || err.status === 524) {
        throw new Error(
          `图片分析超时（524错误）。\n` +
          `原因：图片数量(${imageContent.length}张)或尺寸过大导致Claude API响应超时。\n` +
          `建议：\n` +
          `1. 减少图片数量（建议≤5张）\n` +
          `2. 压缩图片尺寸（建议单张≤2MB）\n` +
          `3. 稍后重试`
        );
      } else if (err.name === "AI_RetryError") {
        throw new Error(
          `Claude API调用失败（已重试${err.retryCount || 3}次）。\n` +
          `最后错误：${err.message}\n` +
          `图片数量：${imageContent.length}张\n` +
          `请稍后重试或联系管理员检查API配置`
        );
      } else if (err.name === "TimeoutError" || err.message?.includes("timeout")) {
        // 处理超时错误（120秒超时）
        const totalSizeMB = (imageContent.reduce((sum, img) => sum + img.image.length, 0) / 1024 / 1024).toFixed(2);
        throw new Error(
          `图片分析超时（120秒）。\n` +
          `当前状态：${imageContent.length}张图片，总大小${totalSizeMB}MB（Base64编码后约${(parseFloat(totalSizeMB) * 1.37).toFixed(2)}MB）\n` +
          `建议：\n` +
          `1. 减少图片数量（当前${imageContent.length}张，建议≤5张）\n` +
          `2. 压缩图片尺寸（建议单张≤1MB）\n` +
          `3. 分批上传处理`
        );
      } else {
        throw new Error(`图片分析失败：${err.message || "未知错误"}`);
      }
    }

    if (identity) {
      await (ctx.runMutation as any)(internal.credits.deductCreditsInternal, {
        userId: identity.subject,
        nodeType: "mediaUpload",
        imageCount: imageUrls.length,
        projectId: args.projectId,
        description: `分析素材（${imageUrls.length} 张图片）`,
      });
    }

    return text;
  },
});

// ─── generateCopywriting ─────────────────────────────────────────────────────
// 文案节点现在只生成 emotionTags，字幕脚本已合并到 generateStoryboard
// 同时保存 aiAnalysis 和 eventDescription 供分镜使用

export const generateCopywriting = action({
  args: {
    projectId: v.id("dreamXProjects"),
    eventDescription: v.string(),
    imageDescriptions: v.array(v.string()),
    imageCount: v.number(),
    moodPreference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { projectId, eventDescription, imageDescriptions, imageCount, moodPreference } = args;

    await (ctx.runMutation as any)("dreamXCanvas:_updateNodeState", {
      id: projectId,
      nodeKey: "copywriting",
      patch: { status: "generating", errorMessage: undefined },
    });

    try {
      const project = await (ctx.runQuery as any)("dreamXCanvas:getProject", { id: projectId });
      const aiAnalysis = (project?.nodeStates?.mediaUpload as any)?.aiAnalysis ?? "";

      const userPrompt = `根据以下图片内容，提炼最适合小红书营销短视频的情绪标签。

【图片分析】
${aiAnalysis || imageDescriptions.map((d, i) => `图${i + 1}：${d}`).join("\n")}

【情绪偏好】
${moodPreference || "日常"}

【事件描述】
${eventDescription || "营销宣传短视频"}

【图片数量】
${imageCount}张

请输出2-4个情绪标签，用于后续表情包推荐和BGM匹配。

输出格式（严格JSON，不要输出任何其他内容）：
{
  "emotionTags": ["搞笑", "震惊"]
}

情绪标签只能从以下中选：搞笑 / 震惊 / 励志 / 伤感 / 日常 / 可爱 / 委屈 / 愤怒`;

      const { text } = await generateText({
        model: anthropic(DEFAULT_MODEL),
        system: `你是一名小红书短视频内容策划师，擅长分析图片情绪价值并提炼营销标签。输出严格的JSON格式，不要有任何其他说明文字。`,
        messages: [{ role: "user", content: userPrompt }],
        maxTokens: 200,
      });

      let parsed: { emotionTags: string[] };
      try {
        const jsonStr = text.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
        parsed = JSON.parse(jsonStr);
      } catch {
        // Fallback: extract emotion tags from text
        const tagMap: Record<string, boolean> = { 搞笑: true, 震惊: true, 励志: true, 伤感: true, 日常: true, 可爱: true, 委屈: true, 愤怒: true };
        const found = Object.keys(tagMap).filter((tag) => text.includes(tag));
        parsed = { emotionTags: found.length > 0 ? found.slice(0, 4) : ["日常"] };
      }

      await (ctx.runMutation as any)("dreamXCanvas:_updateNodeState", {
        id: projectId,
        nodeKey: "copywriting",
        patch: {
          status: "completed",
          emotionTags: parsed.emotionTags,
          script: [],
          errorMessage: undefined,
        },
      });

      // Unlock memeRecall
      await (ctx.runMutation as any)("dreamXCanvas:_updateNodeState", {
        id: projectId,
        nodeKey: "memeRecall",
        patch: { status: "idle" },
      });

      return { emotionTags: parsed.emotionTags };
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      await (ctx.runMutation as any)("dreamXCanvas:_updateNodeState", {
        id: projectId,
        nodeKey: "copywriting",
        patch: { status: "error", errorMessage: message },
      });
      throw error;
    }
  },
});

// ─── generateStoryboard ──────────────────────────────────────────────────────
// 分镜直接读取 mediaUpload 的 aiAnalysis/eventDescription，
// 以及 copywriting 的 emotionTags，自己生成营销字幕 + 时间轴

export const generateStoryboard = action({
  args: {
    projectId: v.id("dreamXProjects"),
    images: v.array(v.object({
      url: v.string(),
      fileName: v.string(),
    })),
    selectedMemes: v.array(v.object({
      url: v.string(),
      name: v.string(),
      mood: v.string(),
      insertAfterImageIndex: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const { projectId, images, selectedMemes } = args;
    const identity = await ctx.auth.getUserIdentity();

    if (identity) {
      await (ctx.runMutation as any)(internal.credits.checkBalanceInternal, {
        userId: identity.subject,
        nodeType: "storyboard",
        imageCount: images.length,
      });
    }

    await (ctx.runMutation as any)("dreamXCanvas:_updateNodeState", {
      id: projectId,
      nodeKey: "storyboard",
      patch: { status: "generating", errorMessage: undefined },
    });

    try {
      // 读取 mediaUpload 的 AI 分析和事件描述
      const project = await (ctx.runQuery as any)("dreamXCanvas:getProject", { id: projectId });
      const mediaState = (project?.nodeStates?.mediaUpload as any) ?? {};
      const aiAnalysis: string = mediaState.aiAnalysis ?? "";
      const eventDescription: string = mediaState.eventDescription ?? "";
      const emotionTags: string[] = (project?.nodeStates?.copywriting as any)?.emotionTags ?? [];

      const imageListText = images
        .map((img, i) => `图${i + 1}: ${img.fileName}`)
        .join("\n");

      const memeListText = selectedMemes.length > 0
        ? selectedMemes.map((m) => `"${m.name}"(${m.mood}) → 插入图${m.insertAfterImageIndex + 1}之后`)
            .join("\n")
        : "无表情包";

      const userPrompt = `请为以下营销短视频生成完整的分镜时间轴。

【图片列表（按拍摄顺序）】
${imageListText}

【图片AI分析】
${aiAnalysis || "（未提供分析）"}

【事件描述】
${eventDescription || "营销宣传短视频"}

【情绪标签】
${emotionTags.join("、") || "日常"}

【表情包插入计划】
${memeListText}

**核心概念：group（镜头组）**
每个 group 包含：
- items：一张图片 + 紧跟其后的0-1张表情包（严格按时间顺序）
- subtitles：该 group 的字幕序列，字幕时长跨越整个 group（图片+表情包）

字幕可以**跨越图片和表情包**，在图片切到表情包时字幕继续显示，情绪更连贯。

**字幕创作要求（重要）**：
1. 每句字幕不超过14个中文字（含标点）
2. 情绪递进框架：Hook（吸引）→ 爆料/展示（冲击）→ 利益点（与我相关）→ 引导（互动）
3. 文风口语化、夸张、情绪化，代替用户抒发情绪
4. 适当使用情绪词：天塌了、羡慕麻了、酸了、离大谱、破防了、炸裂、赢麻了
5. 适当使用强动词：干掉、飞升、狂招、抢疯、被逼、疯抢

**时间设置规则（重要）**：
1. 每句字幕时长 = 字数 × 255ms，最小1500ms，最大5000ms
2. 高潮句用1500-2000ms（快切节奏），铺垫句用2500-3000ms
3. 图片 durationMs ≥ 该图片对应的字幕时长之和（字幕不能比图片长太多）
4. 表情包 durationMs 通常1200-2000ms（情绪高潮点可稍短以增加冲击感）
5. 跨图片-表情包的字幕：startOffsetMs 从0开始，durationMs 超过图片时长延伸到表情包
6. 所有 group 的字幕 startOffsetMs + durationMs 不得超过该 group 的所有 items durationMs 之和

输出严格JSON格式（不要输出其他内容）：
{
  "groups": [
    {
      "items": [
        { "type": "image", "imageIndex": 0, "durationMs": 2500 },
        { "type": "meme", "memeName": "猫咪震惊1", "durationMs": 1500 }
      ],
      "subtitles": [
        { "text": "天啊这也太炸裂了", "startOffsetMs": 0, "durationMs": 2000 },
        { "text": "情绪直接爆了", "startOffsetMs": 2000, "durationMs": 2000 }
      ]
    },
    {
      "items": [
        { "type": "image", "imageIndex": 1, "durationMs": 3000 }
      ],
      "subtitles": [
        { "text": "这谁顶得住啊", "startOffsetMs": 0, "durationMs": 1500 },
        { "text": "羡慕麻了真的", "startOffsetMs": 1500, "durationMs": 1500 }
      ]
    }
  ],
  "directorNote": "整体节奏说明（1句）"
}`;

      const { text } = await generateText({
        model: anthropic(DEFAULT_MODEL),
        system: `你是一名专业的小红书短视频分镜师，擅长将图片+字幕+表情包组合成节奏感强的营销视频分镜脚本。

核心原则：
1. 图片和表情包必须严格按时间顺序排列（每个 group 内：图片在前，表情包紧随其后）
2. 表情包在情绪高潮点插入，一张图片最多跟一张表情包
3. 字幕可以横跨图片和表情包，让情绪更连贯（startOffsetMs + durationMs 可以延伸进表情包时段）
4. 所有轨道（图片、字幕、配音）必须在最后一个 group 结束时同时终止
5. 字幕要有营销爆点，要夸张、情绪化，符合小红书风格`,
        messages: [{ role: "user", content: userPrompt }],
        maxTokens: 4000,
      });

      // ─── 解析 LLM 输出 ────────────────────────────────────────────────────
      type LLMItem = { type: "image"; imageIndex: number; durationMs: number }
        | { type: "meme"; memeName: string; durationMs: number };
      type LLMSubtitle = { text: string; startOffsetMs: number; durationMs: number };
      type LLMGroup = { items: LLMItem[]; subtitles: LLMSubtitle[] };

      let groups: LLMGroup[];
      let directorNote: string | undefined;

      try {
        const jsonStr = text.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
        const parsed = JSON.parse(jsonStr);
        groups = parsed.groups;
        directorNote = parsed.directorNote;
        if (!Array.isArray(groups) || groups.length === 0) throw new Error("no groups");
      } catch {
        // Fallback: 用旧格式构建
        return buildFallbackAndSave(ctx, projectId, images, selectedMemes, identity?.subject);
      }

      // ─── 算法：将 group 结构展开为 flat timeline ───────────────────────────
      // 规则：
      //   1. 每个 group 的实际时长 = MAX(所有 items 之和, 所有字幕的 startOffsetMs+durationMs 最大值)
      //   2. 字幕的绝对 startMs = group 绝对开始时间 + startOffsetMs
      //   3. 表情包 items 没有字幕（字幕是 group 级别的）
      //   4. 字幕写入第一个 image item（向后兼容 patchStoryboardVoiceTracks 按 tiIdx 查找）

      const finalTimeline: Array<{
        type: "image" | "meme";
        url: string;
        name: string;
        startMs: number;
        durationMs: number;
        groupId: number;  // 所属 group 的索引，用于 TTS/字幕编辑后整组 rebase
        subtitles?: Array<{ text: string; startMs: number; durationMs: number }>;
      }> = [];

      let currentMs = 0;

      for (let gIdx = 0; gIdx < groups.length; gIdx++) {
        const group = groups[gIdx];
        const groupStartMs = currentMs;

        // 计算各 item 的时长之和
        const itemsTotalMs = group.items.reduce((sum, item) => sum + (item.durationMs || 1500), 0);

        // 计算字幕覆盖的最大时长
        const subtitlesMaxMs = group.subtitles.length > 0
          ? Math.max(...group.subtitles.map((s) => (s.startOffsetMs ?? 0) + (s.durationMs ?? 1500)))
          : 0;

        // group 实际时长：保证字幕和画面同时结束
        const groupDurationMs = Math.max(itemsTotalMs, subtitlesMaxMs);

        // 字幕转换为绝对时间戳
        const subtitlesAbs = group.subtitles.map((s) => ({
          text: s.text,
          startMs: groupStartMs + (s.startOffsetMs ?? 0),
          durationMs: s.durationMs ?? 1500,
        }));

        // 按比例分配 groupDurationMs 给各 item（如果 group 时长被字幕拉长，按原比例缩放）
        const scale = groupDurationMs / (itemsTotalMs || groupDurationMs);

        let itemOffsetMs = 0;
        let isFirstImage = true;

        for (const item of group.items) {
          const rawDurationMs = item.durationMs || 1500;
          const scaledDurationMs = Math.round(rawDurationMs * scale);

          if (item.type === "image") {
            const img = images[item.imageIndex];
            if (!img) { itemOffsetMs += scaledDurationMs; continue; }

            finalTimeline.push({
              type: "image",
              url: img.url,
              name: img.fileName,
              startMs: groupStartMs + itemOffsetMs,
              durationMs: scaledDurationMs,
              groupId: gIdx,
              // 字幕只写入该 group 的第一个 image item（供 patchStoryboardVoiceTracks 按 tiIdx 寻址）
              subtitles: isFirstImage ? subtitlesAbs : [],
            });
            isFirstImage = false;
          } else if (item.type === "meme") {
            const meme = selectedMemes.find((m) => m.name === item.memeName);
            if (!meme) { itemOffsetMs += scaledDurationMs; continue; }

            finalTimeline.push({
              type: "meme",
              url: meme.url,
              name: meme.name,
              startMs: groupStartMs + itemOffsetMs,
              durationMs: scaledDurationMs,
              groupId: gIdx,
              subtitles: [],  // 字幕在 image item 上，表情包无独立字幕
            });
          }

          itemOffsetMs += scaledDurationMs;
        }

        currentMs = groupStartMs + groupDurationMs;
      }

      const totalDurationMs = currentMs;

      await (ctx.runMutation as any)("dreamXCanvas:_updateNodeState", {
        id: projectId,
        nodeKey: "storyboard",
        patch: {
          status: "completed",
          timeline: finalTimeline,
          totalDurationMs,
          directorNote,
          errorMessage: undefined,
        },
      });

      if (identity) {
        await (ctx.runMutation as any)(internal.credits.deductCreditsInternal, {
          userId: identity.subject,
          nodeType: "storyboard",
          imageCount: images.length,
          projectId,
          description: `生成分镜脚本（${images.length} 张图片）`,
        }).catch(() => {});
      }

      return { timeline: finalTimeline, totalDurationMs };
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      await (ctx.runMutation as any)("dreamXCanvas:_updateNodeState", {
        id: projectId,
        nodeKey: "storyboard",
        patch: { status: "error", errorMessage: message },
      });
      throw error;
    }
  },
});

// ─── Fallback builder + save ──────────────────────────────────────────────────
async function buildFallbackAndSave(
  ctx: any,
  projectId: string,
  images: Array<{ url: string; fileName: string }>,
  selectedMemes: Array<{ url: string; name: string; mood: string; insertAfterImageIndex: number }>,
  userId?: string
) {
  const { timeline: llmTl, directorNote } = buildFallbackTimeline(images, selectedMemes);

  // 将旧格式 flat timeline 转换为 finalTimeline（已有绝对时间戳）
  const finalTimeline: Array<{
    type: "image" | "meme";
    url: string;
    name: string;
    startMs: number;
    durationMs: number;
    subtitles?: Array<{ text: string; startMs: number; durationMs: number }>;
  }> = [];

  let currentMs = 0;
  for (const item of llmTl) {
    if (item.type === "image" && item.imageIndex !== undefined) {
      const img = images[item.imageIndex];
      if (!img) { currentMs += item.durationMs; continue; }
      finalTimeline.push({
        type: "image",
        url: img.url,
        name: img.fileName,
        startMs: currentMs,
        durationMs: item.durationMs,
        subtitles: [],
      });
    } else if (item.type === "meme" && item.memeName) {
      const meme = selectedMemes.find((m) => m.name === item.memeName);
      if (!meme) { currentMs += item.durationMs; continue; }
      finalTimeline.push({
        type: "meme",
        url: meme.url,
        name: meme.name,
        startMs: currentMs,
        durationMs: item.durationMs,
        subtitles: [],
      });
    }
    currentMs += item.durationMs;
  }

  const totalDurationMs = currentMs;

  await (ctx.runMutation as any)("dreamXCanvas:_updateNodeState", {
    id: projectId,
    nodeKey: "storyboard",
    patch: {
      status: "completed",
      timeline: finalTimeline,
      totalDurationMs,
      directorNote,
      errorMessage: undefined,
    },
  });

  if (userId) {
    await (ctx.runMutation as any)(internal.credits.deductCreditsInternal, {
      userId,
      nodeType: "storyboard",
      imageCount: images.length,
      projectId,
      description: `生成分镜脚本（${images.length} 张图片）`,
    }).catch(() => {});
  }

  return { timeline: finalTimeline, totalDurationMs };
}

// ─── generateTTSAudio ────────────────────────────────────────────────────────

export const generateTTSAudio = action({
  args: {
    projectId: v.id("dreamXProjects"),
    voiceType: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const { projectId, voiceType, text } = args;

    const appId = process.env.DOUBAO_SOUND_APP_ID;
    // X-Api-Access-Key 对应 ACCESS_TOKEN，不是 API_KEY
    const accessToken = process.env.DOUBAO_SOUND_ACCESS_TOKEN;

    if (!appId || !accessToken) {
      throw new Error("DOUBAO_SOUND_APP_ID 或 DOUBAO_SOUND_ACCESS_TOKEN 未配置");
    }

    const response = await fetch(
      "https://openspeech.bytedance.com/api/v3/tts/unidirectional",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-App-Id": appId,
          "X-Api-Access-Key": accessToken,
          "X-Api-Resource-Id": "seed-tts-2.0",
        },
        body: JSON.stringify({
          user: { uid: projectId },
          req_params: {
            text,
            speaker: voiceType,
            audio_params: { format: "mp3", sample_rate: 24000 },
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`TTS API 错误 ${response.status}: ${errText}`);
    }

    // Collect chunked base64 audio data
    const reader = response.body!.getReader();
    const audioChunks: string[] = [];
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += new TextDecoder().decode(value);

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.code === 0 && parsed.data) {
            audioChunks.push(parsed.data);
          } else if (parsed.code !== 0 && parsed.code !== 20000000) {
            console.warn("TTS chunk error:", parsed);
          }
        } catch {
          // Non-JSON line, skip
        }
      }
    }

    if (audioChunks.length === 0) {
      throw new Error("TTS API 未返回任何音频数据");
    }

    // Concatenate base64 → Buffer → Blob → Storage
    const audioBase64 = audioChunks.join("");
    const audioBuffer = Buffer.from(audioBase64, "base64");
    const blob = new Blob([audioBuffer], { type: "audio/mp3" });
    const storageId = await ctx.storage.store(blob);
    const url = await ctx.storage.getUrl(storageId);

    if (!url) throw new Error("Failed to get audio URL from storage");

    // Rough duration estimate (mp3 ~128kbps = 16000 bytes/sec)
    const durationMs = Math.round((audioBuffer.length / 16000) * 1000);

    return { storageId, url, durationMs };
  },
});

// ─── generateTTSPerSegment ────────────────────────────────────────────────────
// 按 storyboard timeline 的字幕段逐段调用 TTS，结果写回每个片段的 voiceTrack

export const generateTTSPerSegment = action({
  args: {
    projectId: v.id("dreamXProjects"),
    voiceType: v.string(),
    segments: v.array(v.object({
      itemIdx: v.number(),
      text: v.string(),
    })),
    subtitlesChanged: v.optional(v.boolean()),
    imageCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { projectId, voiceType, segments } = args;
    const identity = await ctx.auth.getUserIdentity();
    const totalChars = segments.reduce((sum, s) => sum + s.text.length, 0);

    if (identity) {
      await (ctx.runMutation as any)(internal.credits.checkBalanceInternal, {
        userId: identity.subject,
        nodeType: "ttsSelection",
        charCount: totalChars,
      });
    }

    const appId = process.env.DOUBAO_SOUND_APP_ID;
    const accessToken = process.env.DOUBAO_SOUND_ACCESS_TOKEN;
    if (!appId || !accessToken) {
      throw new Error("DOUBAO_SOUND_APP_ID 或 DOUBAO_SOUND_ACCESS_TOKEN 未配置");
    }

    const results: Array<{
      itemIdx: number;
      storageId: string;
      url: string;
      durationMs: number;
    }> = [];

    const failedSegs: number[] = [];

    for (const seg of segments) {
      if (!seg.text.trim()) continue;

      try {
        const response = await fetch(
          "https://openspeech.bytedance.com/api/v3/tts/unidirectional",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Api-App-Id": appId,
              "X-Api-Access-Key": accessToken,
              "X-Api-Resource-Id": "seed-tts-2.0",
            },
            body: JSON.stringify({
              user: { uid: `${projectId}-seg${seg.itemIdx}` },
              req_params: {
                text: seg.text,
                speaker: voiceType,
                audio_params: {
                  format: "mp3",
                  sample_rate: 24000,
                  enable_subtitle: true,  // 开启字幕时间戳，用于获取精确音频时长
                },
              },
            }),
          }
        );

        if (!response.ok) {
          const errText = await response.text().catch(() => "");
          console.error(`[TTS] 段 ${seg.itemIdx} 失败 (HTTP ${response.status}): ${errText}`);
          failedSegs.push(seg.itemIdx);
          continue; // 跳过失败段，继续处理后续段
        }

        const reader = response.body!.getReader();
        const audioChunks: string[] = [];
        let actualDurationMs = 0;  // 从 sentence.words 解析出的真实时长
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += new TextDecoder().decode(value);
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const parsed = JSON.parse(line);
              if (parsed.code === 0 && parsed.data) {
                audioChunks.push(parsed.data);
              }
              // 解析 sentence.words 获取精确时长（endTime 单位：秒）
              if (parsed.sentence?.words?.length) {
                const words: Array<{ endTime: number; startTime: number; word: string }> = parsed.sentence.words;
                const lastEndTime = Math.max(...words.map((w) => w.endTime));
                if (lastEndTime > 0) {
                  actualDurationMs = Math.round(lastEndTime * 1000);
                }
              }
            } catch { /* skip */ }
          }
        }

        if (audioChunks.length === 0) {
          console.warn(`[TTS] 段 ${seg.itemIdx} 无音频数据返回，跳过`);
          failedSegs.push(seg.itemIdx);
          continue;
        }

        const audioBase64 = audioChunks.join("");
        const audioBuffer = Buffer.from(audioBase64, "base64");
        const blob = new Blob([audioBuffer], { type: "audio/mp3" });
        const storageId = await ctx.storage.store(blob);
        const url = await ctx.storage.getUrl(storageId);
        if (!url) {
          failedSegs.push(seg.itemIdx);
          continue;
        }

        // 若未能从 sentence 解析到时长（如网络问题），fallback 到 mp3 字节估算
        if (actualDurationMs === 0) {
          // mp3 @24kHz ~128kbps ≈ 16000 bytes/sec
          actualDurationMs = Math.round((audioBuffer.length / 16000) * 1000);
        }

        results.push({ itemIdx: seg.itemIdx, storageId: storageId as string, url, durationMs: actualDurationMs });
      } catch (err) {
        console.error(`[TTS] 段 ${seg.itemIdx} 异常:`, err);
        failedSegs.push(seg.itemIdx);
        // 继续处理下一段
      }
    }

    await (ctx.runMutation as any)(
      "dreamXCanvas:_patchStoryboardVoiceTracks",
      { projectId, voiceTracks: results }
    );

    if (identity) {
      const totalChars = segments.reduce((sum, s) => sum + s.text.length, 0);
      if (args.subtitlesChanged) {
        await (ctx.runMutation as any)(internal.credits.deductCreditsInternal, {
          userId: identity.subject,
          nodeType: "storyboard",
          imageCount: args.imageCount ?? 0,
          projectId,
          description: "字幕变更重新生成分镜",
        });
      }
      await (ctx.runMutation as any)(internal.credits.deductCreditsInternal, {
        userId: identity.subject,
        nodeType: "ttsSelection",
        charCount: totalChars,
        projectId,
        description: `生成配音（${totalChars} 字）`,
      });
    }

    return { count: results.length };
  },
});

// ─── chatWithMediaAgent ──────────────────────────────────────────────────────

export const chatWithMediaAgent = action({
  args: {
    message: v.string(),
    imageUrls: v.array(v.string()),
    aiAnalysis: v.optional(v.string()),
    eventDescription: v.optional(v.string()),
    chatHistory: v.optional(
      v.array(
        v.object({
          role: v.union(v.literal("user"), v.literal("assistant")),
          content: v.string(),
        })
      )
    ),
  },
  handler: async (_ctx, args) => {
    const { message, imageUrls, aiAnalysis, eventDescription, chatHistory = [] } = args;

    const imageContent = imageUrls.slice(0, 5).map((url) => ({
      type: "image" as const,
      image: url,
    }));

    const systemPrompt = `你是 DreamX 的素材分析助手（MEDIA_AGENT），帮助用户理解上传的图片内容，分析营销价值，提供文案创作建议。

已知信息：
- 事件描述：${eventDescription || "（未提供）"}
- AI 初步分析：${aiAnalysis || "（尚未分析）"}

你的职责：
1. 回答用户关于图片内容的问题
2. 提供针对性的营销文案建议
3. 分析图片的情绪价值和营销潜力
4. 建议合适的表情包风格和 BGM 类型`;

    const messages: any[] = [
      ...chatHistory.map((h) => ({ role: h.role, content: h.content })),
      {
        role: "user",
        content: [
          ...imageContent,
          { type: "text", text: message },
        ],
      },
    ];

    const { text } = await generateText({
      model: anthropic("claude-opus-4-5"),
      system: systemPrompt,
      messages,
      maxTokens: 800,
    });

    return text;
  },
});

// ─── analyzeMemeImage ─────────────────────────────────────────────────────────
// AI 分析单张表情包图片，返回最匹配的 mood 标签

export const analyzeMemeImage = action({
  args: {
    imageUrl: v.string(),
  },
  handler: async (_ctx, args) => {
    const MOOD_OPTIONS = ["搞笑", "励志", "伤感", "震惊", "日常", "愤怒", "可爱", "委屈"];
    try {
      const resp = await fetch(args.imageUrl);
      if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`);
      const mime = resp.headers.get("content-type")?.split(";")[0].trim() ?? "image/jpeg";
      const b64 = Buffer.from(await resp.arrayBuffer()).toString("base64");

      const { text } = await generateText({
        model: anthropic(DEFAULT_MODEL),
        system: "你是一个表情包情绪分类专家。根据图片内容输出最匹配的单个情绪标签，只输出标签本身，不要有其他文字。",
        messages: [{
          role: "user",
          content: [
            { type: "image", image: `data:${mime};base64,${b64}` },
            { type: "text", text: `请从以下情绪标签中选一个最匹配此表情包的：${MOOD_OPTIONS.join("、")}` },
          ],
        }],
        maxTokens: 20,
      });

      const detected = MOOD_OPTIONS.find((m) => text.includes(m));
      return detected ?? "搞笑"; // fallback
    } catch {
      return "搞笑"; // 分析失败时使用默认
    }
  },
});

// ─── suggestMemeInsertions ────────────────────────────────────────────────────
// AI 辅助分析表情包插入位置：给定素材图片列表和推荐表情包，返回 { memeUrl, insertAfterImageIndex }

export const suggestMemeInsertions = action({
  args: {
    imageUrls: v.array(v.string()),
    memes: v.array(v.object({
      url: v.string(),
      name: v.string(),
      mood: v.string(),
    })),
    projectId: v.optional(v.id("dreamXProjects")),
  },
  handler: async (ctx, args) => {
    const { imageUrls, memes } = args;
    if (!imageUrls.length || !memes.length) return [];

    const identity = await ctx.auth.getUserIdentity();
    if (identity) {
      await (ctx.runMutation as any)(internal.credits.checkBalanceInternal, {
        userId: identity.subject,
        nodeType: "memeInsert",
      });
    }

    // 下载图片为 base64（最多取 6 张）
    const imageContent: Array<{ type: "image"; image: string }> = [];
    for (const url of imageUrls.slice(0, 6)) {
      try {
        const resp = await fetch(url);
        if (!resp.ok) continue;
        const mime = resp.headers.get("content-type")?.split(";")[0].trim() ?? "image/jpeg";
        const b64 = Buffer.from(await resp.arrayBuffer()).toString("base64");
        imageContent.push({ type: "image" as const, image: `data:${mime};base64,${b64}` });
      } catch { continue; }
    }

    const memeList = memes.map((m, i) => `${i + 1}. ${m.name}（情绪: ${m.mood}）`).join("\n");
    const prompt = `你是一个短视频剪辑助手。下面是 ${imageUrls.length} 张按顺序排列的视频素材图片（图1、图2…），以及一组候选表情包。

候选表情包列表：
${memeList}

任务：从候选表情包中**挑选 1-3 个**最能增强视频感染力的表情包（不要全选），并为每个选中的表情包推荐最合适的插入位置。

选择原则：
- 优先选择与图片情绪最契合的表情包
- 插入位置要自然，不要堆叠太多
- 不需要每个表情包都用，宁少勿滥

插入位置说明：
- -1 表示插入到"最开始"（所有图片之前）
- 0 表示插入到"图1之后"
- 1 表示插入到"图2之后"
- 以此类推，最大值为 ${imageUrls.length - 1}

输出格式（纯 JSON 数组，只包含你选中的表情包，不要有其他文字）：
[{"memeIndex": 1, "insertAfterImageIndex": 0}]

memeIndex 从 1 开始，对应上面候选列表的序号。只输出你认为合适的，其余的不要出现在数组里。`;

    try {
      const { text } = await generateText({
        model: anthropic(DEFAULT_MODEL),
        system: "你是一名专业的短视频剪辑助手，擅长根据图片情绪安排表情包插入时机。输出严格的 JSON 数组，不要有其他说明。",
        messages: [{
          role: "user",
          content: [
            ...imageContent,
            { type: "text", text: prompt },
          ],
        }],
        maxTokens: 500,
      });

      const jsonStr = text.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
      const parsed: Array<{ memeIndex: number; insertAfterImageIndex: number }> = JSON.parse(jsonStr);

      const result = parsed.map((item) => ({
        memeUrl: memes[item.memeIndex - 1]?.url ?? "",
        insertAfterImageIndex: item.insertAfterImageIndex,
      })).filter((r) => r.memeUrl);

      if (identity) {
        await (ctx.runMutation as any)(internal.credits.deductCreditsInternal, {
          userId: identity.subject,
          nodeType: "memeInsert",
          projectId: args.projectId,
          description: "表情包插入位置分析",
        });
      }

      return result;
    } catch {
      // Fallback: 只选第一个，插入到中间位置
      const fallbackMeme = memes[0];
      if (!fallbackMeme) return [];

      if (identity) {
        await (ctx.runMutation as any)(internal.credits.deductCreditsInternal, {
          userId: identity.subject,
          nodeType: "memeInsert",
          projectId: args.projectId,
          description: "表情包插入位置分析",
        }).catch(() => {});
      }

      return [{
        memeUrl: fallbackMeme.url,
        insertAfterImageIndex: Math.floor(imageUrls.length / 2) - 1,
      }];
    }
  },
});

// ─── rebalanceStoryboardDurations ────────────────────────────────────────────
// 用户编辑了字幕文本后，调用此 action 让 AI 重新计算分镜时长。
// 保持图片/表情包/BGM 顺序不变，只输出每条字幕和每个 item 的新 durationMs。
// 成功后直接 patch storyboard.timeline。
export const rebalanceStoryboardDurations = action({
  args: {
    projectId: v.id("dreamXProjects"),
  },
  handler: async (ctx, args) => {
    const { projectId } = args;

    const project = await (ctx.runQuery as any)("dreamXCanvas:getProject", { id: projectId });
    const timeline: any[] = project?.nodeStates?.storyboard?.timeline ?? [];
    if (!timeline.length) throw new Error("分镜 Timeline 为空");

    // 把 timeline 转换为按 groupId 聚合的 group 列表（与 generateStoryboard 格式一致）
    const groupMap = new Map<number, { items: any[]; subtitles: any[]; imageItemIdx: number }>();
    for (let i = 0; i < timeline.length; i++) {
      const item = timeline[i];
      const gid: number = item.groupId ?? i;
      if (!groupMap.has(gid)) groupMap.set(gid, { items: [], subtitles: [], imageItemIdx: -1 });
      const g = groupMap.get(gid)!;
      g.items.push({ tiIdx: i, type: item.type, name: item.name, durationMs: item.durationMs });
      if (item.type === "image" && Array.isArray(item.subtitles) && item.subtitles.length > 0 && g.imageItemIdx === -1) {
        g.imageItemIdx = i;
        g.subtitles = item.subtitles.map((s: any) => ({
          text: s.text,
          durationMs: s.durationMs,
          startMs: s.startMs,
        }));
      }
    }

    const sortedGroups = Array.from(groupMap.entries()).sort((a, b) => a[0] - b[0]);

    // 构造给 AI 的 prompt：只展示结构和字幕文本，让 AI 输出新时长
    const groupDesc = sortedGroups.map(([gid, g], idx) => {
      const itemsStr = g.items.map((it: any) =>
        `  - ${it.type === "image" ? "图片" : "表情包"}「${it.name}」 当前时长: ${it.durationMs}ms`
      ).join("\n");
      const subsStr = g.subtitles.length > 0
        ? g.subtitles.map((s: any, j: number) =>
            `  - 字幕${j + 1}: 「${s.text}」 当前时长: ${s.durationMs}ms`
          ).join("\n")
        : "  （无字幕）";
      return `Group ${idx + 1}:\n${itemsStr}\n  字幕:\n${subsStr}`;
    }).join("\n\n");

    const userPrompt = `以下是当前短视频的分镜结构（图片/表情包顺序和字幕内容已固定，不能改变）。
请根据字幕字数重新计算每条字幕的合理时长，并相应调整每个镜头（item）的时长，确保：
1. 字幕时长 = 字数 × 255ms，最小1500ms，最大5000ms
2. 每个 Group 的所有 item 时长之和 ≥ 该 Group 内字幕时长最大覆盖范围（字幕不超出画面）
3. 表情包 durationMs 1200-2000ms，图片 durationMs ≥ 对应字幕时长之和
4. 图片/表情包顺序不变，只调整 durationMs

当前分镜结构：
${groupDesc}

输出严格 JSON 格式（不要输出其他内容）：
{
  "groups": [
    {
      "items": [
        { "durationMs": 2500 },
        { "durationMs": 1500 }
      ],
      "subtitles": [
        { "durationMs": 2000 },
        { "durationMs": 1800 }
      ]
    }
  ]
}
注意：groups 数量、每个 group 内 items 数量、subtitles 数量必须与输入完全一致，只修改 durationMs。`;

    const { text } = await generateText({
      model: anthropic(DEFAULT_MODEL),
      system: "你是一名专业短视频分镜师，根据字幕字数精确计算分镜时长，保持画面和配音同步。只输出 JSON，不要有任何解释。",
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 2000,
    });

    // 解析 AI 输出
    let newGroups: Array<{ items: Array<{ durationMs: number }>; subtitles: Array<{ durationMs: number }> }>;
    try {
      const jsonStr = text.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
      const parsed = JSON.parse(jsonStr);
      newGroups = parsed.groups;
      if (!Array.isArray(newGroups) || newGroups.length !== sortedGroups.length) {
        throw new Error("group 数量不匹配");
      }
    } catch (e) {
      throw new Error(`AI 时长重算输出解析失败: ${e}`);
    }

    // 将 AI 输出的新 durationMs 写回 timeline
    // 先深拷贝 timeline
    const newTimeline = timeline.map((item: any) => ({ ...item, subtitles: item.subtitles ? [...item.subtitles] : [] }));
    let currentMs = 0;

    for (let gi = 0; gi < sortedGroups.length; gi++) {
      const [, g] = sortedGroups[gi];
      const newGroup = newGroups[gi];
      if (!newGroup) continue;

      const groupStartMs = currentMs;

      // 更新各 item 的 durationMs
      for (let ii = 0; ii < g.items.length; ii++) {
        const tiIdx = g.items[ii].tiIdx;
        const newDurationMs = newGroup.items[ii]?.durationMs ?? newTimeline[tiIdx].durationMs;
        newTimeline[tiIdx] = { ...newTimeline[tiIdx], durationMs: newDurationMs };
      }

      // 计算 group 实际时长
      const groupTotalMs = g.items.reduce((sum: number, it: any, ii: number) => {
        return sum + (newGroup.items[ii]?.durationMs ?? it.durationMs);
      }, 0);

      // 更新字幕（写在第一个 image item 上）
      if (g.imageItemIdx >= 0 && g.subtitles.length > 0) {
        let subOffsetMs = 0;
        const newSubs = g.subtitles.map((sub: any, si: number) => {
          const newSubDurationMs = newGroup.subtitles[si]?.durationMs ?? sub.durationMs;
          // 字幕 startMs = group 起点 + 在 group 内的累积偏移
          const newSubStartMs = groupStartMs + subOffsetMs;
          subOffsetMs += newSubDurationMs;
          return { ...sub, durationMs: newSubDurationMs, startMs: newSubStartMs };
        });
        newTimeline[g.imageItemIdx] = { ...newTimeline[g.imageItemIdx], subtitles: newSubs };
      }

      // 更新 group 内各 item 的 startMs（按新 durationMs 顺序累积）
      let itemOffsetMs = 0;
      for (let ii = 0; ii < g.items.length; ii++) {
        const tiIdx = g.items[ii].tiIdx;
        newTimeline[tiIdx] = { ...newTimeline[tiIdx], startMs: groupStartMs + itemOffsetMs };
        itemOffsetMs += newTimeline[tiIdx].durationMs;
      }

      currentMs = groupStartMs + groupTotalMs;
    }

    const newTotalDurationMs = currentMs;

    // 写回 DB
    await (ctx.runMutation as any)("dreamXCanvas:_updateNodeState", {
      id: projectId,
      nodeKey: "storyboard",
      patch: {
        timeline: newTimeline,
        totalDurationMs: newTotalDurationMs,
      },
    });

    return { totalDurationMs: newTotalDurationMs };
  },
});

// ─── Fallback timeline builder (no LLM) ──────────────────────────────────────

function buildFallbackTimeline(
  images: Array<{ url: string; fileName: string }>,
  selectedMemes: Array<{ url: string; name: string; mood: string; insertAfterImageIndex: number }>
) {
  // Group memes by insertAfterImageIndex
  const memesByPosition: Record<number, typeof selectedMemes> = {};
  for (const m of selectedMemes) {
    if (!memesByPosition[m.insertAfterImageIndex]) memesByPosition[m.insertAfterImageIndex] = [];
    memesByPosition[m.insertAfterImageIndex].push(m);
  }

  const timeline: Array<{
    type: "image" | "meme";
    imageIndex?: number;
    durationMs: number;
    subtitles?: Array<{ text: string; durationMs: number }>;
    memeName?: string;
  }> = [];

  // Memes at position -1 (before all images)
  for (const meme of memesByPosition[-1] ?? []) {
    timeline.push({ type: "meme", memeName: meme.name, durationMs: 1500 });
  }

  for (let i = 0; i < images.length; i++) {
    timeline.push({
      type: "image",
      imageIndex: i,
      durationMs: 2500,
      subtitles: [],
    });
    for (const meme of memesByPosition[i] ?? []) {
      timeline.push({ type: "meme", memeName: meme.name, durationMs: 1500 });
    }
  }

  const totalDurationMs = timeline.reduce((sum, item) => sum + item.durationMs, 0);
  return { timeline, totalDurationMs, directorNote: "算法自动生成分镜" };
}
