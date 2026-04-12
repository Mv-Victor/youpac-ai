import { memo, useState, useEffect, useRef, useCallback } from "react";
import { Mic, Loader2, Volume2, CheckCircle2, Play, Pause, Pencil, Check, X, RefreshCw } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { useCredits } from "~/contexts/CreditsContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { DXNodeBase } from "../DXNodeBase";
import type { DXNodeData } from "./pipeline.config";

function TotalCreditsBadge({ cost, breakdown }: { cost: number; breakdown?: { tts: number; storyboard: number } }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center text-xs font-medium text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5 ml-1 cursor-default select-none">
            {cost} 积分
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-0.5">
            {breakdown ? (
              <>
                <div>配音积分：{breakdown.tts}</div>
                <div>字幕变更分镜积分：{breakdown.storyboard}</div>
                <div className="font-semibold">合计：{cost} 积分</div>
              </>
            ) : (
              <div>{cost} 积分</div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface Voice {
  id: string;
  name: string;
  voiceType: string;
  gender: string;
  ageGroup?: string;
  description: string;
  avatarUrl?: string;
  sampleAudioUrl: string;
}

function matchVoicesByEmotionTags(emotionTags: string[], voices: Voice[], count = 5): Voice[] {
  if (!emotionTags.length) return voices.slice(0, count);

  const priority: Record<string, string[]> = {
    搞笑: ["zh_female_xiaohe_uranus_bigtts", "zh_male_shaonianzixin_uranus_bigtts", "zh_female_cancan_mars_bigtts"],
    震惊: ["zh_female_xiaohe_uranus_bigtts", "zh_male_m191_uranus_bigtts"],
    励志: ["zh_male_m191_uranus_bigtts", "zh_male_taocheng_uranus_bigtts", "zh_male_liufei_uranus_bigtts"],
    伤感: ["zh_female_vv_uranus_bigtts", "zh_female_meilinvyou_uranus_bigtts"],
    日常: ["zh_female_vv_uranus_bigtts", "zh_female_xiaohe_uranus_bigtts", "zh_male_taocheng_uranus_bigtts"],
    可爱: ["zh_female_cancan_mars_bigtts", "zh_female_xiaohe_uranus_bigtts"],
    委屈: ["zh_female_vv_uranus_bigtts", "zh_female_cancan_mars_bigtts"],
    愤怒: ["zh_male_m191_uranus_bigtts", "zh_male_liufei_uranus_bigtts"],
    欢快: ["zh_female_cancan_mars_bigtts", "zh_female_xiaohe_uranus_bigtts"],
  };

  const scores = new Map<string, number>();
  voices.forEach((v) => scores.set(v.voiceType, 0));
  emotionTags.forEach((tag) => {
    (priority[tag] ?? []).forEach((voiceType, idx) => {
      scores.set(voiceType, (scores.get(voiceType) ?? 0) + (3 - idx));
    });
  });

  return voices
    .sort((a, b) => (scores.get(b.voiceType) ?? 0) - (scores.get(a.voiceType) ?? 0))
    .slice(0, count);
}

interface SegmentInfo {
  itemIdx: number;
  tiIdx: number;   // timeline item 索引（供编辑回调用）
  subIdx: number;  // 字幕索引（供编辑回调用）
  text: string;
}

interface TTSSelectionNodeInnerProps {
  data: DXNodeData & {
    emotionTags?: string[];
    // 各片段字幕文本列表（按分镜顺序），携带 tiIdx/subIdx 供编辑
    segments?: SegmentInfo[];
    segmentCount?: number;
    recommendedVoices?: Array<{
      voiceType: string;
      name: string;
      sampleAudioUrl: string;
      gender: string;
      description: string;
      avatarUrl?: string;
    }>;
    selectedVoiceType?: string;
    audioUrl?: string;
    audioDurationMs?: number;
    errorMessage?: string;
    onSaveRecommendedVoices: (voices: any[]) => Promise<void>;
    onGenerateTTS: (voiceType: string) => Promise<void>;
    onSkipTTS: () => Promise<void>;
    onReRecall?: () => void;
    // 字幕编辑回调（TTS 节点未完成时可编辑字幕，实时写回分镜节点）
    onUpdateSubtitleText?: (tiIdx: number, subIdx: number, text: string) => Promise<void>;
  };
}

const TTSSelectionNode = memo(({ data }: TTSSelectionNodeInnerProps) => {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [recommended, setRecommended] = useState<Voice[]>([]);
  const [selectedVoiceType, setSelectedVoiceType] = useState(data.selectedVoiceType ?? "");
  const [isGeneratingTTS, setIsGeneratingTTS] = useState(false);
  const { balance, nodeCosts, autopilotEnabled } = useCredits();
  const baseCost = nodeCosts["ttsSelection"] ?? 3;
  const segments = data.segments ?? [];
  const totalChars = segments.reduce((sum, s) => sum + (s.text?.length ?? 0), 0);
  const charBonus = totalChars > 50 ? Math.ceil((totalChars - 50) / 20) : 0;
  const ttsTotalCost = baseCost + charBonus;

  const imageCount = (data.allNodeStates as any)?.mediaUpload?.images?.length ?? 0;
  const lastSnapshot = (data.nodeState as any)?.subtitleSnapshot as string | undefined;
  const currentSnapshot = segments.map((s) => `${s.tiIdx}_${s.subIdx}:${s.text.trim()}`).join("|");
  const subtitlesChanged = !!lastSnapshot && lastSnapshot !== currentSnapshot;
  const storyboardBaseCost = nodeCosts["storyboard"] ?? 3;
  const storyboardBonus = imageCount > 4 ? Math.ceil((imageCount - 4) / 2) : 0;
  const extraCost = subtitlesChanged ? storyboardBaseCost + storyboardBonus : 0;
  const totalTTSCost = ttsTotalCost + extraCost;

  const insufficientCredits = balance !== undefined && balance < totalTTSCost;

  // 试听播放状态
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playProgress, setPlayProgress] = useState(0);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const status = (data.nodeState as any).status;
  const isCompleted = data.isReadOnly;
  const isGenerating = status === "generating";

  useEffect(() => {
    if (status !== "idle" && status !== "generating") return;
    fetch("/voices/voices.json")
      .then((r) => r.json())
      .then((allVoices: Voice[]) => {
        setVoices(allVoices);
        const emotionTags = data.emotionTags ?? [];
        const matched = matchVoicesByEmotionTags(emotionTags, allVoices, 5);
        setRecommended(matched);
        if (!selectedVoiceType && matched.length > 0) {
          setSelectedVoiceType(matched[0].voiceType);
        }
        data.onSaveRecommendedVoices(matched.map((v) => ({
          voiceType: v.voiceType,
          name: v.name,
          sampleAudioUrl: v.sampleAudioUrl,
          gender: v.gender,
          description: v.description,
          avatarUrl: v.avatarUrl,
        }))).catch(() => {});
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      clearInterval(progressTimerRef.current);
    };
  }, []);

  const autopilotCalledRef = useRef(false);
  useEffect(() => {
    if (!autopilotEnabled) { autopilotCalledRef.current = false; return; }
  }, [autopilotEnabled, status, selectedVoiceType]);

  const togglePlay = useCallback((url: string) => {
    if (playingUrl === url) {
      audioRef.current?.pause();
      setPlayingUrl(null);
      setPlayProgress(0);
      clearInterval(progressTimerRef.current);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    } else {
      audioRef.current = new Audio();
    }
    audioRef.current.src = url;
    audioRef.current.onended = () => {
      setPlayingUrl(null);
      setPlayProgress(0);
      clearInterval(progressTimerRef.current);
    };
    audioRef.current.play().catch(() => {});
    setPlayingUrl(url);
    setPlayProgress(0);
    clearInterval(progressTimerRef.current);
    progressTimerRef.current = setInterval(() => {
      if (!audioRef.current) return;
      const { duration, currentTime } = audioRef.current;
      if (duration > 0) setPlayProgress(currentTime / duration);
    }, 100);
  }, [playingUrl]);

  // 生成后直接完成（DreamXCanvas 里的 handleGenerateTTSPerSegment 内部已调 completeTTSSelection）
  const handleGenerate = useCallback(async () => {
    if (!selectedVoiceType) return;
    setIsGeneratingTTS(true);
    try {
      await data.onGenerateTTS(selectedVoiceType);
    } finally {
      setIsGeneratingTTS(false);
    }
  }, [selectedVoiceType, data]);

  const displayVoices = data.recommendedVoices && data.recommendedVoices.length > 0
    ? data.recommendedVoices
    : recommended.map((v) => ({
        voiceType: v.voiceType,
        name: v.name,
        sampleAudioUrl: v.sampleAudioUrl,
        gender: v.gender,
        description: v.description,
        avatarUrl: v.avatarUrl,
      }));

  // 字幕编辑状态（key = `${tiIdx}-${subIdx}`）
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const startEdit = (seg: SegmentInfo) => {
    setEditingKey(`${seg.tiIdx}-${seg.subIdx}`);
    setEditingText(seg.text);
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditingText("");
  };

  const confirmEdit = async (seg: SegmentInfo) => {
    const text = editingText.trim();
    if (text && text !== seg.text && data.onUpdateSubtitleText) {
      await data.onUpdateSubtitleText(seg.tiIdx, seg.subIdx, text).catch(() => {});
    }
    setEditingKey(null);
    setEditingText("");
  };

  // 各片段字幕文本（带序号）
  // segments 已在上方计算，此处直接使用

  // ─── 已完成态 ───────────────────────────────────────────────────────────────
  if (isCompleted) {
    const ns = data.nodeState as any;
    if (ns.skipped) {
      return (
        <DXNodeBase
          status={status}
          title="TTS 配音"
          icon={Mic}
          colorClass="bg-gradient-to-br from-emerald-500 to-green-600"
          nodeNum={5}
          isReadOnly
          onReset={data.onReset}
        >
          <div className="rounded-xl bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground">已跳过配音合成</p>
          </div>
        </DXNodeBase>
      );
    }
    return (
      <DXNodeBase
        status={status}
        title="TTS 配音"
        icon={Mic}
        colorClass="bg-gradient-to-br from-emerald-500 to-green-600"
        nodeNum={5}
        isReadOnly
        onReset={data.onReset}
      >
        <div className="flex items-center gap-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3 py-2">
          <Volume2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <div>
            <p className="text-xs font-medium">{ns.selectedVoiceName ?? selectedVoiceType}</p>
            <p className="text-xs text-muted-foreground">
              {ns.segmentCount ? `${ns.segmentCount} 段配音已写入分镜时间轴` : "分段配音已生成"}
            </p>
          </div>
        </div>
      </DXNodeBase>
    );
  }

  // ─── 编辑态 ──────────────────────────────────────────────────────────────────
  return (
    <DXNodeBase
      status={status}
      title="TTS 配音"
      icon={Mic}
      colorClass="bg-gradient-to-br from-emerald-500 to-green-600"
      nodeNum={5}
      isReadOnly={isCompleted}
      onReset={data.onReset}
      resetNodeType={undefined}
      resetImageCount={0}
    >
      {status === "error" && (
        <div className="space-y-2">
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
            <p className="text-xs text-destructive">{String((data.nodeState as any).errorMessage ?? data.errorMessage ?? "未知错误")}</p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {/* 音色列表 */}
        <p className="text-xs text-muted-foreground">根据情绪推荐的音色，试听后选择：</p>
        {displayVoices.length > 0 ? (
          <div className="space-y-1.5">
            {displayVoices.map((voice) => {
              const isSamplePlaying = playingUrl === voice.sampleAudioUrl;
              const isSelected = selectedVoiceType === voice.voiceType;
              return (
                <div
                  key={voice.voiceType}
                  onClick={() => !data.isReadOnly && setSelectedVoiceType(voice.voiceType)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 cursor-pointer transition-all select-none",
                    isSelected
                      ? "bg-emerald-500/15 border border-emerald-500/40"
                      : "bg-muted/50 hover:bg-muted"
                  )}
                >
                  <div className="shrink-0 relative">
                    {voice.avatarUrl ? (
                      <img
                        src={voice.avatarUrl}
                        alt={voice.name}
                        className="h-8 w-8 rounded-full object-cover border border-border/30"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-green-600 text-white text-xs font-bold">
                        {voice.gender === "female" ? "♀" : "♂"}
                      </div>
                    )}
                    {isSamplePlaying && (
                      <div className="absolute -inset-1 rounded-full border-2 border-emerald-500 animate-ping opacity-60" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <p className="text-xs font-medium truncate">{voice.name}</p>
                      <Badge variant="outline" className="text-[9px] h-3.5 px-1">
                        {voice.gender === "female" ? "女" : "男"}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{voice.description}</p>
                    {isSamplePlaying && (
                      <div className="mt-0.5 h-0.5 w-full bg-emerald-500/20 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all"
                          style={{ width: `${playProgress * 100}%` }}
                        />
                      </div>
                    )}
                  </div>

                  <button
                    onClick={(e) => { e.stopPropagation(); togglePlay(voice.sampleAudioUrl); }}
                    disabled={data.isReadOnly}
                    className={cn(
                      "shrink-0 flex h-6 w-6 items-center justify-center rounded-full transition-colors",
                      isSamplePlaying
                        ? "bg-emerald-500/30 hover:bg-emerald-500/50"
                        : "bg-muted hover:bg-muted-foreground/20"
                    )}
                  >
                    {isSamplePlaying
                      ? <Pause className="h-3 w-3 text-emerald-600" />
                      : <Play className="h-3 w-3 text-muted-foreground" />
                    }
                  </button>

                  {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl bg-muted/50 p-3 text-center">
            <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">加载音色中...</p>
          </div>
        )}

        {/* 分片字幕文本预览（按片段分行展示，节点未完成时可编辑） */}
        {segments.length > 0 && (
          <div className="rounded-lg border border-border/30 overflow-hidden">
            <div className="px-2.5 py-1.5 bg-muted/30 border-b border-border/20">
              <p className="text-[10px] text-muted-foreground/70 font-medium">
                分段预览 · 共 {segments.length} 个片段{!isCompleted && " · 点击编辑"}
              </p>
            </div>
            <div className="max-h-40 overflow-y-auto">
              {segments.map((seg, i) => {
                const key = `${seg.tiIdx}-${seg.subIdx}`;
                const isEditing = editingKey === key;
                return (
                  <div
                    key={seg.itemIdx}
                    className="flex items-start gap-2 px-2.5 py-1.5 border-b border-border/10 last:border-0 group"
                  >
                    <span className="text-[9px] text-muted-foreground/50 shrink-0 mt-0.5 w-4 text-right">
                      {i + 1}
                    </span>
                    {isEditing ? (
                      <div className="flex-1 flex items-start gap-1">
                        <textarea
                          autoFocus
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); confirmEdit(seg); }
                            if (e.key === "Escape") cancelEdit();
                          }}
                          className="flex-1 text-[11px] text-foreground/90 leading-relaxed resize-none border border-primary/40 rounded px-1.5 py-0.5 bg-background min-h-[32px]"
                          rows={2}
                        />
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <button onClick={() => confirmEdit(seg)} className="p-0.5 rounded hover:bg-emerald-500/20 text-emerald-500">
                            <Check className="h-3 w-3" />
                          </button>
                          <button onClick={cancelEdit} className="p-0.5 rounded hover:bg-destructive/20 text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex items-start gap-1">
                        <p className="text-[11px] text-foreground/70 flex-1 leading-relaxed">{seg.text}</p>
                        {!isCompleted && (
                          <button
                            onClick={() => startEdit(seg)}
                            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
                          >
                            <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 重新召回 + 跳过 + 生成配音 按钮并列一行 */}
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs h-8 border-emerald-300/60 text-emerald-600/80 hover:bg-emerald-50 hover:border-emerald-400 hover:text-emerald-700 dark:border-emerald-800/50 dark:text-emerald-400/80 dark:hover:bg-emerald-950/40 dark:hover:border-emerald-600 dark:hover:text-emerald-300"
            disabled={data.isReadOnly || isGeneratingTTS || isGenerating || !data.onReRecall}
            onClick={data.onReRecall}
          >
            <RefreshCw className="mr-1 h-3 w-3" />重新召回
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs h-8 border-green-300/60 text-green-600/70 hover:bg-green-50 hover:border-green-400 hover:text-green-700 dark:border-green-800/50 dark:text-green-400/70 dark:hover:bg-green-950/40 dark:hover:border-green-600 dark:hover:text-green-300"
            disabled={data.isReadOnly || isGeneratingTTS || isGenerating}
            onClick={() => data.onSkipTTS()}
          >
            跳过
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={!selectedVoiceType || isGeneratingTTS || isGenerating || data.isReadOnly || segments.length === 0 || insufficientCredits}
            className="flex-1 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700"
            size="sm"
          >
            {isGeneratingTTS || isGenerating ? (
              <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />生成中...</>
            ) : (
              <><Mic className="mr-1.5 h-3.5 w-3.5" />生成配音<TotalCreditsBadge cost={totalTTSCost} breakdown={subtitlesChanged && segments.length > 0 ? { tts: ttsTotalCost, storyboard: extraCost } : undefined} /></>
            )}
          </Button>
        </div>
      </div>
    </DXNodeBase>
  );
});
TTSSelectionNode.displayName = "TTSSelectionNode";

export default TTSSelectionNode;
