/**
 * CapCut Project Builder — TypeScript port of dreamX Java engine
 *
 * Generates draft_info.json + draft_meta_info.json from a DreamX project's storyboard timeline.
 * Reference: duo-video-jy/src/main/java/com/duoec/video/jy/
 *
 * Key differences from Java version:
 * - No local file system — media paths are HTTPS URLs (Convex Storage)
 * - No FFmpeg — media dimensions/duration come from storyboard data
 * - Output is pure JSON strings (caller handles ZIP packaging)
 */

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

// ─── UUID helper (matches Java UuidUtils.next()) ──────────────────────────────

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16).toUpperCase();
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimeRange {
  start: number;
  duration: number;
}

interface Segment {
  id: string;
  material_id: string;
  render_index: number;
  track_render_index: number;
  speed: number;
  source_timerange: TimeRange;
  target_timerange: TimeRange;
  clip: {
    alpha: number;
    flip: { horizontal: boolean; vertical: boolean };
    rotation: number;
    scale: { x: number; y: number };
    transform: { x: number; y: number };
  };
  volume: number;
  visible: boolean;
  common_keyframes: unknown[];
  enable_adjust: boolean;
  enable_color_correct_adjust: boolean;
  enable_color_curves: boolean;
  enable_color_match_adjust: boolean;
  enable_color_wheels: boolean;
  enable_lut: boolean;
  enable_smart_color_adjust: boolean;
  extra_material_refs: string[];
  group_id: string;
  hdr_settings: { intensity: number; mode: number; nits: number };
  intensifies_audio: boolean;
  is_placeholder: boolean;
  is_tone_modify: boolean;
  keyframe_refs: unknown[];
  last_nonzero_volume: number;
  responsive_layout: {
    enable: boolean;
    horizontal_pos_layout: number;
    size_layout: number;
    target_follow: string;
    vertical_pos_layout: number;
  };
  reverse: boolean;
  template_id: string;
  template_scene: string;
  track_attribute: number;
  uniform_scale: { on: boolean; value: number };
  caption_info: null;
  cartoon: boolean;
}

interface Track {
  attribute: number;
  flag: number;
  id: string;
  is_default_name: boolean;
  name: string;
  segments: Segment[];
  type: string;
  /** Internal sort key — not part of Jianying spec */
  _duoLayoutIndex?: number;
}

interface VideoMaterial {
  aigc_history_id: string;
  aigc_item_id: string;
  aigc_type: string;
  audio_fade: null;
  cartoon_path: string;
  category_id: string;
  category_name: string;
  check_flag: number;
  crop: { lower_left_x: number; lower_left_y: number; lower_right_x: number; lower_right_y: number; upper_left_x: number; upper_left_y: number; upper_right_x: number; upper_right_y: number };
  crop_ratio: string;
  crop_scale: number;
  duration: number;
  extra_type_option: number;
  formula_id: string;
  freeze: null;
  has_audio: boolean;
  height: number;
  id: string;
  intensifies_audio_path: string;
  intensifies_path: string;
  is_ai_generate_content: boolean;
  is_copyright: boolean;
  is_text_edit_overdub: boolean;
  is_unified_beauty_mode: boolean;
  local_id: string;
  local_material_id: string;
  material_id: string;
  material_name: string;
  material_url: string;
  matting: { flag: number; has_use_quick_brush: boolean; has_use_quick_eraser: boolean; interactiveTime: unknown[]; path: string; strokes: unknown[] };
  media_path: string;
  object_locked: null;
  origin_material_id: string;
  path: string;
  picture_from: string;
  picture_set_category_id: string;
  picture_set_category_name: string;
  request_id: string;
  reverse_intensifies_path: string;
  reverse_path: string;
  smart_motion: null;
  source: number;
  source_platform: number;
  stable: { matrix_path: string; stable_level: number; time_range: TimeRange };
  team_id: string;
  type: string;
  video_algorithm: { algorithms: unknown[]; complement_frame_config: null; deflicker: null; gameplay_configs: unknown[]; motion_blur_config: null; noise_reduction: null; path: string; quality_enhance: null; time_range: null };
  width: number;
}

interface AudioMaterial {
  aigc_history_id: string;
  aigc_item_id: string;
  app_id: number;
  category_id: string;
  category_name: string;
  check_flag: number;
  copyright_limit_type: string;
  duration: number;
  effect_id: string;
  formula_id: string;
  id: string;
  intensifies_path: string;
  is_ai_clone_tone: boolean;
  is_text_edit_overdub: boolean;
  is_ugc: boolean;
  local_material_id: string;
  music_id: string;
  name: string;
  path: string;
  query: string;
  request_id: string;
  resource_id: string;
  search_id: string;
  source_from: string;
  source_platform: number;
  team_id: string;
  text_id: string;
  tone_category_id: string;
  tone_category_name: string;
  tone_effect_id: string;
  tone_effect_name: string;
  tone_platform: string;
  tone_second_category_id: string;
  tone_second_category_name: string;
  tone_speaker: string;
  tone_type: string;
  type: string;
  video_id: string;
  wave_points: unknown[];
}

interface TextMaterial {
  id: string;
  type: string;
  alignment: number;
  content: string;
  font_size: number;
  text_color: string;
  bold_width: number;
  border_color: string;
  border_alpha: number;
  background_alpha: number;
  background_color: string;
  background_height: number;
  background_horizontal_offset: number;
  background_round_radius: number;
  background_style: number;
  background_vertical_offset: number;
  background_width: number;
  check_flag: number;
  global_alpha: number;
  line_spacing: number;
  letter_spacing: number;
  [key: string]: unknown;
}

// ─── Build Project ──────────────────────────────────────────────────────────

// Helper: fetch a URL and return its bytes as Uint8Array
async function fetchBytes(url: string): Promise<{ data: Uint8Array; ext: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch media: ${url} (${res.status})`);
  const buf = await res.arrayBuffer();
  // Guess extension from URL or Content-Type
  const ct = res.headers.get("content-type") ?? "";
  let ext = "bin";
  if (ct.includes("jpeg") || ct.includes("jpg") || url.match(/\.jpe?g($|\?)/i)) ext = "jpg";
  else if (ct.includes("png") || url.match(/\.png($|\?)/i)) ext = "png";
  else if (ct.includes("webp") || url.match(/\.webp($|\?)/i)) ext = "webp";
  else if (ct.includes("gif") || url.match(/\.gif($|\?)/i)) ext = "gif";
  else if (ct.includes("mp3") || url.match(/\.mp3($|\?)/i)) ext = "mp3";
  else if (ct.includes("mp4") || url.match(/\.mp4($|\?)/i)) ext = "mp4";
  else if (ct.includes("aac") || url.match(/\.aac($|\?)/i)) ext = "aac";
  else if (ct.includes("ogg") || url.match(/\.ogg($|\?)/i)) ext = "ogg";
  return { data: new Uint8Array(buf), ext };
}

export const buildCapcutProject = action({
  args: {
    projectId: v.id("dreamXProjects"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    // Use string-based function references to avoid circular api type inference
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const project = await (ctx.runQuery as any)("dreamXCanvas:getProject", {
      id: args.projectId,
    });
    if (!project) throw new Error("Project not found");

    const userId = identity?.subject ?? (project as any).userId;
    if (!userId) throw new Error("Unauthorized");

    await (ctx.runMutation as any)(internal.credits.checkBalanceInternal, {
      userId,
      nodeType: "capcutBuild",
      imageCount: 0,
    });

    // Mark as generating
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ctx.runMutation as any)("dreamXCanvas:_updateNodeState", {
      id: args.projectId,
      nodeKey: "capcutBuild",
      patch: { status: "generating", errorMessage: undefined },
    });

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ns = (project as any).nodeStates;
      const images: Array<{ url: string; fileName: string; width?: number; height?: number }> = ns.mediaUpload.images ?? [];
      const timeline: Array<{
        type: "image" | "meme";
        url: string;
        name: string;
        startMs: number;
        durationMs: number;
        subtitles?: Array<{ text: string; startMs: number; durationMs: number }>;
        voiceTrack?: { url: string; storageId: string; durationMs: number } | null;
      }> = ns.storyboard.timeline ?? [];
      const selectedBgm: { url: string; name: string; durationMs?: number; volume: number } | undefined = ns.bgmRecall.selectedBgm;
      const totalDurationMs: number = ns.storyboard.totalDurationMs ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const projectName: string = (project as any).title;

      // 生成 draftId（用于 draft_info.json 的 id 字段及占位符 UUID，不作为文件夹名）
      const draftId = uuid();
      // ZIP 内文件夹名使用项目名（清理特殊字符）
      const folderName = projectName.replace(/[\\/:\*\?"<>|]/g, "_").trim() || "dreamX";

        // ── 按照剪映工程规范下载所有媒体文件，打包进 ZIP ──
      // 文件夹结构：{folderName}/Resources/local/{image|audio|fonts}/文件名
      // draft_info.json 里 path 字段使用 draftpath 占位符:
      //   ##_draftpath_placeholder_0E685133-18CE-45ED-8CB8-2904A212EC80_##/Resources/local/{image|audio|fonts}/文件名
      //
      // 参考示例：~/Downloads/100001/

      const DRAFTPATH_PLACEHOLDER = "##_draftpath_placeholder_0E685133-18CE-45ED-8CB8-2904A212EC80_##";
      const FONT_NAME = "抖音美好体.otf";
      const FONT_URL = "https://api.duoec.com/public/fonts/%E6%8A%96%E9%9F%B3%E7%BE%8E%E5%A5%BD%E4%BD%93.otf";

      const mediaEntries: Array<{ zipPath: string; data: Uint8Array }> = [];

      // URL → 占位符路径（path 字段用于 draft_info.json）
      const urlToPlaceholderPath = new Map<string, string>();
      // URL → ZIP 内相对路径
      const urlToZipPath = new Map<string, string>();
      let mediaIdx = 0;

      const allocMedia = (url: string, subDir: "image" | "audio", ext: string) => {
        if (urlToZipPath.has(url)) return;
        const fileName = `${subDir}_${mediaIdx++}.${ext}`;
        const zipPath = `${folderName}/Resources/local/${subDir}/${fileName}`;
        const placeholderPath = `${DRAFTPATH_PLACEHOLDER}/Resources/local/${subDir}/${fileName}`;
        urlToZipPath.set(url, zipPath);
        urlToPlaceholderPath.set(url, placeholderPath);
      };

      // 收集所有 URL（图片、配音、BGM）
      const urlsToFetch: Array<{ url: string; subDir: "image" | "audio" }> = [];
      for (const item of timeline) {
        if (item.url) urlsToFetch.push({ url: item.url, subDir: "image" });
        if (item.voiceTrack?.url) urlsToFetch.push({ url: item.voiceTrack.url, subDir: "audio" });
        // 处理 subtitle 级别的 voiceTrack
        for (const sub of (item.subtitles ?? [])) {
          if ((sub as any).voiceTrack?.url) urlsToFetch.push({ url: (sub as any).voiceTrack.url, subDir: "audio" });
        }
      }
      if (selectedBgm?.url) urlsToFetch.push({ url: selectedBgm.url, subDir: "audio" });

      // 先 alloc 路径（避免重复下载）
      for (const item of urlsToFetch) {
        allocMedia(item.url, item.subDir, item.subDir === "image" ? "jpg" : "mp3");
      }

      // 并行下载（最多 5 并发），自动修正扩展名
      const CONCURRENCY = 5;
      const fetchQueue = [...urlsToFetch];
      const fetchWithPath = async (item: { url: string; subDir: "image" | "audio" }) => {
        const { data, ext } = await fetchBytes(item.url);
        const oldZipPath = urlToZipPath.get(item.url)!;
        // 若扩展名与实际不同，更新路径
        const correctExt = ext;
        const parts = oldZipPath.split("/");
        const oldFile = parts[parts.length - 1];
        const baseFile = oldFile.replace(/\.[^.]+$/, `.${correctExt}`);
        if (baseFile !== oldFile) {
          parts[parts.length - 1] = baseFile;
          const newZipPath = parts.join("/");
          urlToZipPath.set(item.url, newZipPath);
          const pParts = urlToPlaceholderPath.get(item.url)!.split("/");
          pParts[pParts.length - 1] = baseFile;
          urlToPlaceholderPath.set(item.url, pParts.join("/"));
        }
        mediaEntries.push({ zipPath: urlToZipPath.get(item.url)!, data });
      };
      while (fetchQueue.length > 0) {
        const batch = fetchQueue.splice(0, CONCURRENCY);
        await Promise.all(batch.map(fetchWithPath));
      }

      // 下载字体文件（抖音美好体.otf），打包到 fonts/
      const fontZipPath = `${folderName}/Resources/local/fonts/${FONT_NAME}`;
      const fontPlaceholderPath = `${DRAFTPATH_PLACEHOLDER}/Resources/local/fonts/${FONT_NAME}`;
      try {
        const { data: fontData } = await fetchBytes(FONT_URL);
        mediaEntries.push({ zipPath: fontZipPath, data: fontData });
      } catch (e) {
        console.warn("[CapCut] 字体下载失败，跳过：", e);
      }

      // 为 timeline 的每个 item 计算占位符路径
      const resolvedTimeline = timeline.map((item) => ({
        ...item,
        localPath: urlToPlaceholderPath.get(item.url) ?? item.url,
        voiceTrack: item.voiceTrack
          ? { ...item.voiceTrack, localPath: urlToPlaceholderPath.get(item.voiceTrack.url) ?? item.voiceTrack.url }
          : item.voiceTrack,
        subtitles: (item.subtitles ?? []).map((sub: any) => ({
          ...sub,
          voiceTrack: sub.voiceTrack
            ? { ...sub.voiceTrack, localPath: urlToPlaceholderPath.get(sub.voiceTrack.url) ?? sub.voiceTrack.url }
            : sub.voiceTrack,
        })),
      }));
      const resolvedBgm = selectedBgm?.url
        ? { ...selectedBgm, localPath: urlToPlaceholderPath.get(selectedBgm.url) ?? selectedBgm.url }
        : selectedBgm;

      // Build the project JSON（draftId 用于文件夹名，保持与示例一致）
      const { draftInfo, draftMeta } = buildDraft({
        projectName,
        draftId,
        fontPlaceholderPath,
        images,
        timeline: resolvedTimeline as any,
        selectedBgm: resolvedBgm as any,
        totalDurationMs,
        width: 1080,
        height: 1920,
      });

      // Encode as UTF-8 JSON strings
      const draftInfoJson = JSON.stringify(draftInfo);
      const draftMetaJson = JSON.stringify(draftMeta);

      // Create ZIP with media files embedded（文件夹名使用项目名）
      const zipBytes = createZipWithMedia(folderName, draftInfoJson, draftMetaJson, mediaEntries);

      // Upload ZIP to Convex Storage
      const blob = new Blob([zipBytes], { type: "application/zip" });
      const storageId = await ctx.storage.store(blob);
      const downloadUrl = await ctx.storage.getUrl(storageId);

      if (!downloadUrl) throw new Error("Failed to get download URL");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (ctx.runMutation as any)("dreamXCanvas:_updateNodeState", {
        id: args.projectId,
        nodeKey: "capcutBuild",
        patch: {
          status: "completed",
          downloadUrl,
          storageId,
          projectName,
          errorMessage: undefined,
        },
      });

      return { success: true, downloadUrl, projectName };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (ctx.runMutation as any)("dreamXCanvas:_updateNodeState", {
        id: args.projectId,
        nodeKey: "capcutBuild",
        patch: { status: "error", errorMessage: message },
      });
      throw error;
    }
  },
});

// ─── Core Build Logic ─────────────────────────────────────────────────────────

interface BuildDraftOptions {
  projectName: string;
  draftId: string;  // 用于 draft_info.json id 字段（也是文件夹名）
  fontPlaceholderPath: string;  // 字体占位符路径
  images: Array<{
    url: string;
    fileName: string;
    width?: number;
    height?: number;
  }>;
  timeline: Array<{
    type: "image" | "meme";
    url: string;
    localPath?: string;  // 占位符路径
    name: string;
    startMs: number;
    durationMs: number;
    subtitles?: Array<{ text: string; startMs: number; durationMs: number; voiceTrack?: { url: string; localPath?: string } | null }>;
    voiceTrack?: { url: string; localPath?: string; storageId?: string; durationMs: number } | null;
  }>;
  selectedBgm?: {
    url: string;
    localPath?: string;  // 占位符路径
    name: string;
    durationMs?: number;
    startMs?: number;   // BGM 在时间轴上的起始偏移（ms）
    volume: number;
  };
  totalDurationMs: number;
  width: number;
  height: number;
}

function buildDraft(opts: BuildDraftOptions) {
  const { projectName, draftId, fontPlaceholderPath, timeline, selectedBgm, totalDurationMs, width, height } = opts;

  // Jianying uses microseconds internally (ms × 1000)
  const toUs = (ms: number) => ms * 1000;

  const tracks: Track[] = [];
  const videoMaterials: VideoMaterial[] = [];
  const audioMaterials: AudioMaterial[] = [];
  const textMaterials: TextMaterial[] = [];

  // ── Image / Meme track ────────────────────────────────────────────────────
  const imageTrackSegments: Segment[] = [];

  for (const item of timeline) {
    const matId = uuid();
    const imgWidth = width;
    const imgHeight = height;
    const durationUs = toUs(item.durationMs);

    const videoMat: VideoMaterial = {
      aigc_history_id: "", aigc_item_id: "", aigc_type: "none",
      audio_fade: null,
      cartoon_path: "",
      category_id: "", category_name: "",
      check_flag: 63487,
      crop: { lower_left_x: 0, lower_left_y: 1, lower_right_x: 1, lower_right_y: 1, upper_left_x: 0, upper_left_y: 0, upper_right_x: 1, upper_right_y: 0 },
      crop_ratio: "free", crop_scale: 1.0,
      duration: durationUs,
      extra_type_option: 0, formula_id: "",
      freeze: null, has_audio: false,
      height: imgHeight, id: matId,
      intensifies_audio_path: "", intensifies_path: "",
      is_ai_generate_content: false, is_copyright: false, is_text_edit_overdub: false, is_unified_beauty_mode: false,
      local_id: "", local_material_id: "", material_id: "",
      material_name: item.name,
      material_url: "",  // 不使用在线 URL，使用本地路径
      matting: { flag: 0, has_use_quick_brush: false, has_use_quick_eraser: false, interactiveTime: [], path: "", strokes: [] },
      media_path: "",
      object_locked: null, origin_material_id: "",
      path: item.localPath ?? "",  // 使用占位符路径
      picture_from: "none", picture_set_category_id: "", picture_set_category_name: "",
      request_id: "", reverse_intensifies_path: "", reverse_path: "",
      smart_motion: null, source: 0, source_platform: 0,
      stable: { matrix_path: "", stable_level: 0, time_range: { start: 0, duration: 0 } },
      team_id: "",
      type: "photo",
      video_algorithm: { algorithms: [], complement_frame_config: null, deflicker: null, gameplay_configs: [], motion_blur_config: null, noise_reduction: null, path: "", quality_enhance: null, time_range: null },
      width: imgWidth,
    };
    videoMaterials.push(videoMat);

    const segment = makeSegment({
      materialId: matId,
      sourceStart: 0,
      sourceDuration: durationUs,
      targetStart: toUs(item.startMs),
      targetDuration: durationUs,
    });
    imageTrackSegments.push(segment);
  }

  tracks.push({
    attribute: 0, flag: 0, id: uuid(),
    is_default_name: true, name: "图片",
    segments: imageTrackSegments,
    type: "video",
    _duoLayoutIndex: 30000,
  });

  // ── Voice tracks (per-subtitle TTS audio) ────────────────────────────────
  const voiceSegments: Segment[] = [];

  for (const item of timeline) {
    for (const sub of (item.subtitles ?? [])) {
      const subVoice = (sub as any).voiceTrack;
      if (!subVoice) continue;
      const vocalMatId = uuid();
      const vocalDurationUs = toUs(sub.durationMs);
      const audioMat: AudioMaterial = {
        aigc_history_id: "", aigc_item_id: "", app_id: 0,
        category_id: "", category_name: "",
        check_flag: 1, copyright_limit_type: "none",
        duration: vocalDurationUs,
        effect_id: "", formula_id: "",
        id: vocalMatId,
        intensifies_path: "", is_ai_clone_tone: false, is_text_edit_overdub: false, is_ugc: false,
        local_material_id: "", music_id: "",
        name: `配音-${sub.text.slice(0, 8)}`,
        path: subVoice.localPath ?? "",
        query: "", request_id: "", resource_id: "", search_id: "",
        source_from: "", source_platform: 0,
        team_id: "", text_id: "",
        tone_category_id: "", tone_category_name: "", tone_effect_id: "", tone_effect_name: "",
        tone_platform: "", tone_second_category_id: "", tone_second_category_name: "",
        tone_speaker: "", tone_type: "",
        type: "extract_music",
        video_id: "", wave_points: [],
      };
      audioMaterials.push(audioMat);

      const voiceSeg = makeSegment({
        materialId: vocalMatId,
        sourceStart: 0,
        sourceDuration: vocalDurationUs,
        targetStart: toUs(sub.startMs),
        targetDuration: vocalDurationUs,
      });
      voiceSegments.push(voiceSeg);
    }
  }

  if (voiceSegments.length > 0) {
    tracks.push({
      attribute: 0, flag: 0, id: uuid(),
      is_default_name: true, name: "配音",
      segments: voiceSegments,
      type: "audio",
      _duoLayoutIndex: 20000,
    });
  }

  // ── Subtitle tracks ───────────────────────────────────────────────────────
  const subtitleSegments: Segment[] = [];

  for (const item of timeline) {
    if (!item.subtitles?.length) continue;

    for (const sub of item.subtitles) {
      const textMatId = uuid();
      const textMat = makeTextMaterial(textMatId, sub.text, fontPlaceholderPath);
      textMaterials.push(textMat);

      // 字幕底部位置：clip.transform.y（剪映坐标系，0=画面中央，负值=向下）
      // 参考 info.json 示例值 -0.390625，稍微再往下移到 -0.45
      const seg = makeSegment({
        materialId: textMatId,
        sourceStart: 0,
        sourceDuration: toUs(sub.durationMs),
        targetStart: toUs(sub.startMs),
        targetDuration: toUs(sub.durationMs),
        clipTransformY: -0.55,
      });
      subtitleSegments.push(seg);
    }
  }

  if (subtitleSegments.length > 0) {
    tracks.push({
      attribute: 0, flag: 0, id: uuid(),
      is_default_name: true, name: "字幕",
      segments: subtitleSegments,
      type: "text",
      _duoLayoutIndex: 90000,
    });
  }

  // ── BGM track ─────────────────────────────────────────────────────────────
  if (selectedBgm) {
    const bgmMatId = uuid();
    const bgmDurationUs = toUs(selectedBgm.durationMs ?? totalDurationMs);

    const audioMat: AudioMaterial = {
      aigc_history_id: "", aigc_item_id: "", app_id: 0,
      category_id: "", category_name: "",
      check_flag: 1,
      copyright_limit_type: "none",
      duration: bgmDurationUs,
      effect_id: "", formula_id: "",
      id: bgmMatId,
      intensifies_path: "", is_ai_clone_tone: false, is_text_edit_overdub: false, is_ugc: false,
      local_material_id: "", music_id: "",
      name: selectedBgm.name,
      path: selectedBgm.localPath ?? "",  // 使用占位符路径
      query: "", request_id: "", resource_id: "", search_id: "",
      source_from: "", source_platform: 0,
      team_id: "", text_id: "",
      tone_category_id: "", tone_category_name: "", tone_effect_id: "", tone_effect_name: "",
      tone_platform: "", tone_second_category_id: "", tone_second_category_name: "",
      tone_speaker: "", tone_type: "",
      type: "extract_music",
      video_id: "", wave_points: [],
    };
    audioMaterials.push(audioMat);

    const bgmTargetDuration = toUs(totalDurationMs);
    const bgmStartMs = selectedBgm.startMs ?? 0;
    const bgmSeg = makeSegment({
      materialId: bgmMatId,
      sourceStart: toUs(bgmStartMs),
      sourceDuration: Math.min(bgmDurationUs - toUs(bgmStartMs), bgmTargetDuration),
      targetStart: 0,
      targetDuration: bgmTargetDuration,
    });
    // Apply volume: dreamX volume is linear dB, convert: volume/100 → amplitude
    bgmSeg.volume = amplitudeGain(selectedBgm.volume / 100.0);

    tracks.push({
      attribute: 0, flag: 0, id: uuid(),
      is_default_name: true, name: "音频",
      segments: [bgmSeg],
      type: "audio",
      _duoLayoutIndex: 10000,
    });
  }

  // ── Sort tracks by layout index ───────────────────────────────────────────
  tracks.sort((a, b) => (a._duoLayoutIndex ?? 0) - (b._duoLayoutIndex ?? 0));

  // Set track flags (first of each type = 0, others = 2)
  const typeFlags = new Map<string, number>();
  for (const t of tracks) {
    const count = typeFlags.get(t.type) ?? 0;
    t.flag = count === 0 ? 0 : 2;
    typeFlags.set(t.type, count + 1);
  }

  // Remove internal _duoLayoutIndex before output
  const cleanTracks = tracks.map(({ _duoLayoutIndex: _, ...t }) => t);

  // ── Assemble draft_info.json ──────────────────────────────────────────────
  const now = Math.floor(Date.now() / 1000);
  const draftInfo = {
    canvas_config: { height, ratio: "original", width },
    color_space: -1,
    config: {
      adjust_max_index: 1, attachment_info: [], combination_max_index: 1,
      extract_audio_last_index: 1, lyrics_recognition_id: "", lyrics_sync: true,
      lyrics_taskinfo: [], maintrack_adsorb: false, material_save_mode: 0,
      multi_language_current: "none", multi_language_list: [], multi_language_main: "none",
      multi_language_mode: "none", original_sound_last_index: 1, record_audio_last_index: 1,
      sticker_max_index: 1, subtitle_recognition_id: "", subtitle_sync: true,
      subtitle_taskinfo: [], system_font_list: [], use_float_render: false, video_mute: false,
    },
    create_time: now,
    draft_type: "video",
    fps: 30.0,
    free_render_index_mode_on: false,
    function_assistant_info: { auto_adjust: false, auto_caption: false },
    id: draftId,
    is_drop_frame_timecode: false,
    keyframe_graph_list: [],
    keyframes: { handwrites: [], videos: [], texts: [], audios: [], adjusts: [], stickers: [], filters: [], effects: [] },
    last_modified_platform: { app_version: "", os_version: "", os: "", hard_disk_id: "", device_id: "", mac_address: "", app_id: 0, app_source: "" },
    lyrics_effects: [],
    materials: {
      ai_translates: [], audio_balances: [], audio_effects: [], audio_fades: [],
      audio_track_indexes: [],
      audios: audioMaterials,
      beats: [], canvases: [], chromas: [], color_curves: [], common_mask: [],
      digital_human_model_dressing: [], digital_humans: [], drafts: [], effects: [],
      flowers: [], green_screens: [], handwrites: [], hsl: [], hsl_curves: [],
      images: [], log_color_wheels: [], loudnesses: [], manual_beautys: [],
      manual_deformations: [], material_animations: [], material_colors: [],
      multi_language_refs: [], placeholder_infos: [], placeholders: [],
      plugin_effects: [], primary_color_wheels: [], realtime_denoises: [],
      shapes: [], smart_crops: [], smart_relights: [], sound_channel_mappings: [],
      speeds: [], stickers: [], tail_leaders: [],
      texts: textMaterials,
      text_templates: [], time_marks: [], transitions: [],
      video_effects: [], video_radius: [], video_shadows: [], video_strokes: [], video_trackings: [],
      videos: videoMaterials,
      vocal_beautifys: [], vocal_separations: [],
    },
    name: projectName,
    new_version: "111.0.0",
    path: "",
    platform: { app_version: "9.6.0", os_version: "15.1", os: "mac", hard_disk_id: "9d5cea4f22458a4e59d643d07162d324", device_id: "0b02b9bd41947815545481af8a5bde46", mac_address: "f8e784e2995a6aed158ef584d6245be8", app_id: 3704, app_source: "lv" },
    relationships: [],
    render_index_track_mode_on: true,
    smart_ads_info: { page_from: "", routine: "", draft_url: "" },
    source: "default",
    static_cover_image_path: "",
    tracks: cleanTracks,
    uneven_animation_template_info: { order: "", sub_template_info_list: [], content: "", composition: "" },
    update_time: now,
    version: "360000",
    duration: toUs(totalDurationMs),
  };

  // ── Assemble draft_meta_info.json ─────────────────────────────────────────
  const nowMs = Date.now();
  const draftMeta = {
    cloud_package_completed_time: "",
    draft_cloud_capcut_purchase_info: "",
    draft_cloud_last_action_download: false,
    draft_cloud_materials: [],
    draft_cloud_purchase_info: "",
    draft_cloud_template_id: "",
    draft_cloud_tutorial_info: "",
    draft_cloud_videocut_purchase_info: "",
    draft_cover: "",
    draft_deeplink_url: "",
    draft_enterprise_info: { draft_enterprise_extra: "", draft_enterprise_id: "", draft_enterprise_name: "", enterprise_material: [] },
    draft_fold_path: "",
    draft_id: draftId,
    draft_is_ai_packaging_used: false,
    draft_is_ai_shorts: false,
    draft_is_article_video_draft: false,
    draft_is_from_deeplink: "false",
    draft_is_invisible: false,
    draft_materials: [
      { type: 0, value: [] },
      { type: 1, value: [] },
      { type: 2, value: [] },
      { type: 3, value: [] },
      { type: 6, value: [] },
      { type: 7, value: [] },
      { type: 8, value: [] },
    ],
    draft_materials_copied_info: [],
    draft_name: projectName,
    draft_new_version: "111.0.0",
    draft_removable_storage_device: "",
    draft_root_path: "",
    draft_segment_extra_info: [],
    draft_timeline_materials_size_: 0,
    draft_type: "video",
    tm_draft_cloud_completed: "",
    tm_draft_cloud_modified: 0,
    tm_draft_create: nowMs,
    tm_draft_modified: nowMs,
    tm_draft_removed: 0,
    tm_duration: toUs(totalDurationMs),
  };

  return { draftInfo, draftMeta };
}

// ─── Helper: create a Segment ─────────────────────────────────────────────────

function makeSegment(opts: {
  materialId: string;
  sourceStart: number;
  sourceDuration: number;
  targetStart: number;
  targetDuration: number;
  /** clip.transform.y 垂直偏移（剪映坐标系：0=画面中央，上正下负，-1.0=最底部）*/
  clipTransformY?: number;
}): Segment {
  return {
    id: uuid(),
    material_id: opts.materialId,
    render_index: 2,
    track_render_index: 2,
    speed: 1.0,
    source_timerange: { start: opts.sourceStart, duration: opts.sourceDuration },
    target_timerange: { start: opts.targetStart, duration: opts.targetDuration },
    clip: {
      alpha: 1.0,
      flip: { horizontal: false, vertical: false },
      rotation: 0.0,
      scale: { x: 1.0, y: 1.0 },
      transform: { x: 0.0, y: opts.clipTransformY ?? 0.0 },
    },
    volume: 1.0,
    visible: true,
    common_keyframes: [],
    enable_adjust: true,
    enable_color_correct_adjust: false,
    enable_color_curves: true,
    enable_color_match_adjust: false,
    enable_color_wheels: true,
    enable_lut: true,
    enable_smart_color_adjust: false,
    extra_material_refs: [],
    group_id: "",
    hdr_settings: { intensity: 1.0, mode: 1, nits: 1000 },
    intensifies_audio: false,
    is_placeholder: false,
    is_tone_modify: false,
    keyframe_refs: [],
    last_nonzero_volume: 1.0,
    responsive_layout: {
      enable: false,
      horizontal_pos_layout: 0,
      size_layout: 0,
      target_follow: "",
      vertical_pos_layout: 0,
    },
    reverse: false,
    template_id: "",
    template_scene: "default",
    track_attribute: 0,
    uniform_scale: { on: true, value: 1.0 },
    caption_info: null,
    cartoon: false,
  };
}

// ─── Helper: create a Text material (subtitle) ───────────────────────────────
// 字幕样式：抖音美好体 + 黄色填充 + 黑色描边 + 粗体，完全匹配示例 draft_info.json 格式

function makeTextMaterial(id: string, text: string, fontPlaceholderPath: string): TextMaterial {
  // content 字段格式完全对齐示例 draft_info.json，使用 draftpath 占位符路径
  const contentObj = {
    styles: [
      {
        fill: {
          alpha: 1.0,
          content: {
            solid: {
              alpha: 1.0,
              color: [1.0, 0.8705882430076599, 0.0],  // 黄色 #FFde00
            },
          },
        },
        strokes: [
          {
            alpha: 1.0,
            content: {
              solid: {
                alpha: 1.0,
                color: [0.0, 0.0, 0.0],  // 黑色描边
              },
            },
            width: 0.12402901309054055,
          },
        ],
        useLetterColor: true,
        font: {
          id: "",
          path: fontPlaceholderPath,  // 使用 draftpath 占位符
        },
        range: [0, text.length],
        size: 8.0,
        bold: true,
      },
    ],
    text,
  };

  return {
    id,
    type: "text",
    alignment: 1,
    content: JSON.stringify(contentObj),
    font_size: 8.0,
    text_color: "#FFDE00",
    bold_width: 0.12402901309054055,
    border_color: "#000000",
    border_alpha: 1.0,
    background_alpha: 1.0,
    background_color: "",
    background_height: 0.0,
    background_horizontal_offset: 0.0,
    background_round_radius: 0.0,
    background_style: 0,
    background_vertical_offset: 0.0,
    background_width: 0.0,
    check_flag: 15,
    global_alpha: 1.0,
    line_spacing: 0.02,
    letter_spacing: 0.0,
    // additional fields
    add_type: 0,
    base_content: "",
    caption_template_info: { category_id: "", category_name: "", effect_id: "", is_new: false, path: "", request_id: "", resource_id: "", resource_name: "", source_platform: 0 },
    combo_info: { text_templates: [] },
    fixed_height: -1.0,
    fixed_width: -1.0,
    font_category_id: "", font_category_name: "", font_id: "", font_name: "抖音美好体", font_path: fontPlaceholderPath, font_resource_id: "", font_source_platform: 0, font_team_id: "", font_title: "none", font_url: "",
    fonts: [],
    force_apply_line_max_width: false,
    group_id: "",
    has_shadow: false,
    initial_scale: 1.0,
    inner_padding: -1.0,
    is_rich_text: false,
    italic_degree: 0,
    ktv_color: "",
    language: "",
    layer_weight: 1,
    line_feed: 1,
    line_max_width: 0.82,
    multi_language_current: "none",
    name: "",
    original_size: [],
    preset_category: "", preset_category_id: "", preset_has_set_alignment: false, preset_id: "", preset_index: 0, preset_name: "",
    recognize_task_id: "", recognize_type: 0,
    relevance_segment: [],
    shadow_alpha: 0.9, shadow_angle: -45.0, shadow_color: "", shadow_distance: 5.0,
    shadow_point: { x: 0.0, y: 0.0 },
    shadow_smoothing: 0.45,
    shape_clip_x: false, shape_clip_y: false,
    source_from: "", style_name: "",
    sub_type: 0,
    subtitle_keywords: null,
    subtitle_template_original_fontsize: 0.0,
    text_alpha: 1.0,
    text_curve: null,
    text_preset_resource_id: "",
    text_size: 30,
    text_to_audio_ids: [],
    tts_auto_update: false,
    typesetting: 0,
    underline: false,
    underline_offset: 0.22,
    underline_width: 0.05,
    use_effect_default_color: false,
    words: { end_time: [], start_time: [], text: [] },
  };
}

// ─── Helper: volume dB to amplitude gain ─────────────────────────────────────
// Matches JianyingUtils.amplitudeGain(dB)

function amplitudeGain(dB: number): number {
  if (dB <= -100) return 0;
  return Math.pow(10, dB / 20);
}

// ─── ZIP builder (包含媒体文件) ───────────────────────────────────────────────
// 生成包含 draft_info.json + draft_meta_info.json + 所有媒体文件的 ZIP

function createZipWithMedia(
  folderName: string,  // 文件夹名（项目名，解压后看到的目录名）
  draftInfoJson: string,
  draftMetaJson: string,
  mediaEntries: Array<{ zipPath: string; data: Uint8Array }>,
): Uint8Array {
  const entries: Array<{ name: string; data: Uint8Array }> = [
    { name: `${folderName}/draft_info.json`, data: new TextEncoder().encode(draftInfoJson) },
    { name: `${folderName}/draft_meta_info.json`, data: new TextEncoder().encode(draftMetaJson) },
    ...mediaEntries.map((m) => ({ name: m.zipPath, data: m.data })),
  ];
  return buildZipFromEntries(entries);
}

// ─── Minimal ZIP builder (pure TypeScript, no dependencies) ──────────────────
// Kept for compatibility, now just calls the unified builder

function createSimpleZip(projectName: string, draftInfoJson: string, draftMetaJson: string): Uint8Array {
  const entries: Array<{ name: string; data: Uint8Array }> = [
    { name: `${projectName}/draft_info.json`, data: new TextEncoder().encode(draftInfoJson) },
    { name: `${projectName}/draft_meta_info.json`, data: new TextEncoder().encode(draftMetaJson) },
  ];
  return buildZipFromEntries(entries);
}

function buildZipFromEntries(entries: Array<{ name: string; data: Uint8Array }>): Uint8Array {

  const localHeaders: Uint8Array[] = [];
  const localOffsets: number[] = [];
  let offset = 0;

  for (const entry of entries) {
    localOffsets.push(offset);
    const nameBytes = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.data);
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); // local file header sig
    view.setUint16(4, 20, true);          // version needed
    view.setUint16(6, 0, true);           // flags
    view.setUint16(8, 0, true);           // compression (stored)
    view.setUint16(10, 0, true);          // mod time
    view.setUint16(12, 0, true);          // mod date
    view.setUint32(14, crc, true);        // crc32
    view.setUint32(18, entry.data.length, true); // compressed size
    view.setUint32(22, entry.data.length, true); // uncompressed size
    view.setUint16(26, nameBytes.length, true);  // file name length
    view.setUint16(28, 0, true);           // extra field length
    header.set(nameBytes, 30);
    localHeaders.push(header);
    offset += header.length + entry.data.length;
  }

  // Central directory
  const cdHeaders: Uint8Array[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const nameBytes = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.data);
    const cdHeader = new Uint8Array(46 + nameBytes.length);
    const view = new DataView(cdHeader.buffer);
    view.setUint32(0, 0x02014b50, true); // central directory sig
    view.setUint16(4, 20, true);          // version made by
    view.setUint16(6, 20, true);          // version needed
    view.setUint16(8, 0, true);           // flags
    view.setUint16(10, 0, true);          // compression
    view.setUint16(12, 0, true);          // mod time
    view.setUint16(14, 0, true);          // mod date
    view.setUint32(16, crc, true);        // crc32
    view.setUint32(20, entry.data.length, true); // compressed size
    view.setUint32(24, entry.data.length, true); // uncompressed size
    view.setUint16(28, nameBytes.length, true);  // file name length
    view.setUint16(30, 0, true);          // extra field length
    view.setUint16(32, 0, true);          // file comment length
    view.setUint16(34, 0, true);          // disk number start
    view.setUint16(36, 0, true);          // internal file attributes
    view.setUint32(38, 0, true);          // external file attributes
    view.setUint32(42, localOffsets[i], true); // relative offset
    cdHeader.set(nameBytes, 46);
    cdHeaders.push(cdHeader);
  }

  const cdSize = cdHeaders.reduce((s, h) => s + h.length, 0);
  const cdOffset = offset;

  // End of central directory
  const eocdr = new Uint8Array(22);
  const eocdrView = new DataView(eocdr.buffer);
  eocdrView.setUint32(0, 0x06054b50, true); // end of central directory sig
  eocdrView.setUint16(4, 0, true);           // disk number
  eocdrView.setUint16(6, 0, true);           // start disk
  eocdrView.setUint16(8, entries.length, true);  // entries on disk
  eocdrView.setUint16(10, entries.length, true); // total entries
  eocdrView.setUint32(12, cdSize, true);          // size of central dir
  eocdrView.setUint32(16, cdOffset, true);        // offset of central dir
  eocdrView.setUint16(20, 0, true);               // comment length

  // Concatenate all parts
  const totalSize = localHeaders.reduce((s, h, i) => s + h.length + entries[i].data.length, 0)
    + cdHeaders.reduce((s, h) => s + h.length, 0)
    + eocdr.length;
  const result = new Uint8Array(totalSize);
  let pos = 0;
  for (let i = 0; i < entries.length; i++) {
    result.set(localHeaders[i], pos); pos += localHeaders[i].length;
    result.set(entries[i].data, pos); pos += entries[i].data.length;
  }
  for (const cdHeader of cdHeaders) {
    result.set(cdHeader, pos); pos += cdHeader.length;
  }
  result.set(eocdr, pos);
  return result;
}

// ─── CRC-32 ───────────────────────────────────────────────────────────────────

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
