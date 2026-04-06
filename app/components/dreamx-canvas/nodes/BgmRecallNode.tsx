import { memo, useState, useRef, useCallback } from "react";
import { Music, Upload, CheckCircle2, Play, Pause, RefreshCw } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";
import { DXNodeBase } from "../DXNodeBase";
import type { DXNodeData } from "./pipeline.config";

const MOOD_OPTIONS = ["搞笑", "励志", "伤感", "震惊", "日常", "愤怒", "可爱", "委屈"];

interface BgmItem {
  url: string;
  name: string;
  mood: string;
  durationMs?: number;
  mediaId?: string;
  isBuiltin: boolean;
}

interface BgmRecallNodeInnerProps {
  data: DXNodeData & {
    suggestedBgms?: BgmItem[];
    selectedBgm?: { url: string; name: string; durationMs?: number; volume: number };
    onConfirmBgm: (bgm: { url: string; name: string; durationMs?: number; volume: number }) => void;
    onUploadBgm: (file: File, mood: string) => Promise<void>;
    onSkipBgm: () => void;
    onReRecall?: () => void;
  };
}

const BgmRecallNode = memo(({ data }: BgmRecallNodeInnerProps) => {
  const [selectedBgmUrl, setSelectedBgmUrl] = useState(data.selectedBgm?.url ?? "");
  const [volume, setVolume] = useState(data.selectedBgm?.volume ?? -30);
  const [uploadMood, setUploadMood] = useState("励志");
  const [isUploading, setIsUploading] = useState(false);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  // 额外追踪自定义上传的 BGM（不依赖 query 刷新，直接 append 到 UI）
  const [customBgms, setCustomBgms] = useState<BgmItem[]>([]);
  const status = (data.nodeState as any).status;
  const isCompleted = data.isReadOnly;

  const handleConfirm = () => {
    if (!selectedBgmUrl) {
      data.onSkipBgm();
      return;
    }
    const allBgms = [...(data.suggestedBgms ?? []), ...customBgms];
    const bgm = allBgms.find((b) => b.url === selectedBgmUrl);
    data.onConfirmBgm({
      url: selectedBgmUrl,
      name: bgm?.name ?? "自定义BGM",
      durationMs: bgm?.durationMs,
      volume,
    });
  };

  const togglePlay = (url: string) => {
    if (playingUrl === url) {
      audioRef.current?.pause();
      setPlayingUrl(null);
    } else {
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play().catch(() => {});
      }
      setPlayingUrl(url);
    }
  };

  const handleUploadFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      await data.onUploadBgm(file, uploadMood);
      // 注意：BGM 上传后 URL 需要从 query 刷新获得
      // 此处通过 suggestedBgms 的变化来感知（query 会刷新）
      // 暂时不做乐观更新，因为 BGM 的 URL 需要异步获取
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  }, [data, uploadMood]);

  // 合并 suggestedBgms + customBgms（去重）
  const suggestedUrls = new Set((data.suggestedBgms ?? []).map((b) => b.url));
  const allBgms: BgmItem[] = [
    ...(data.suggestedBgms ?? []),
    ...customBgms.filter((b) => !suggestedUrls.has(b.url)),
  ];

  return (
    <DXNodeBase
      status={status}
      title="BGM 素材召回"
      icon={Music}
      colorClass="bg-gradient-to-br from-teal-500 to-cyan-600"
      nodeNum={3}
      isReadOnly={isCompleted}
      onReset={data.onReset}
    >
      <audio
        ref={audioRef}
        onEnded={() => setPlayingUrl(null)}
        onPause={() => setPlayingUrl(null)}
      />

      {isCompleted && data.selectedBgm ? (
        <div className="space-y-2">
          <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2">
            <Music className="h-4 w-4 text-teal-500" />
            <div>
              <p className="text-xs font-medium">{data.selectedBgm.name}</p>
              <p className="text-xs text-muted-foreground">音量：{data.selectedBgm.volume}dB</p>
            </div>
            {data.selectedBgm.url && (
              <button
                className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-teal-500/20 hover:bg-teal-500/40 transition-colors shrink-0"
                onClick={() => togglePlay(data.selectedBgm!.url)}
              >
                {playingUrl === data.selectedBgm.url ? (
                  <Pause className="h-3 w-3 text-teal-600" />
                ) : (
                  <Play className="h-3 w-3 text-teal-600" />
                )}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">根据情绪匹配 BGM，点击播放按钮试听，可跳过：</p>
          {allBgms.length > 0 ? (
            <div className="space-y-1.5">
              {allBgms.map((bgm, i) => (
                <div
                  key={i}
                  onClick={() => !data.isReadOnly && setSelectedBgmUrl(bgm.url)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3 py-2 cursor-pointer transition-all",
                    selectedBgmUrl === bgm.url
                      ? "bg-teal-500/15 border border-teal-500/40"
                      : "bg-muted/50 hover:bg-muted"
                  )}
                >
                  {/* 播放按钮 — 独立，不影响选中 */}
                  <button
                    onClick={(e) => { e.stopPropagation(); togglePlay(bgm.url); }}
                    disabled={data.isReadOnly}
                    className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-teal-500/20 hover:bg-teal-500/40 transition-colors"
                  >
                    {playingUrl === bgm.url ? (
                      <Pause className="h-3 w-3 text-teal-600" />
                    ) : (
                      <Play className="h-3 w-3 text-teal-600" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{bgm.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {bgm.mood} · {bgm.durationMs ? `${Math.round(bgm.durationMs / 1000)}s` : "—"}
                      {!bgm.isBuiltin && <span className="ml-1 text-teal-500">（自定义）</span>}
                    </p>
                  </div>
                  {selectedBgmUrl === bgm.url && (
                    <CheckCircle2 className="h-4 w-4 text-teal-500 shrink-0" />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-muted/50 p-3 text-center">
              <p className="text-xs text-muted-foreground">暂无推荐 BGM，可上传自定义或跳过</p>
            </div>
          )}

          {selectedBgmUrl && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">音量：{volume}dB</label>
              <input
                type="range" min={-60} max={0} step={1} value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                disabled={data.isReadOnly}
                className="w-full accent-teal-500"
              />
            </div>
          )}

          {/* 上传自定义 BGM */}
          <div className="border-t border-border/40 pt-2 space-y-1.5">
            <p className="text-xs text-muted-foreground">上传自定义 BGM（上传后将新增到列表）：</p>
            <div className="flex gap-2">
              <Select value={uploadMood} onValueChange={setUploadMood} disabled={data.isReadOnly}>
                <SelectTrigger className="text-xs h-7 flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MOOD_OPTIONS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => fileInputRef.current?.click()}
                disabled={data.isReadOnly || isUploading}
              >
                <Upload className="mr-1 h-3 w-3" />
                {isUploading ? "上传中..." : "选择音频"}
              </Button>
              <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleUploadFile} />
            </div>
          </div>

          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs h-7 border-teal-300/60 text-teal-600/80 hover:bg-teal-50 hover:border-teal-400 hover:text-teal-700 dark:border-teal-800/50 dark:text-teal-400/80 dark:hover:bg-teal-950/40 dark:hover:border-teal-600 dark:hover:text-teal-300"
              onClick={data.onReRecall}
              disabled={data.isReadOnly || !data.onReRecall}
            >
              <RefreshCw className="mr-1 h-3 w-3" />重新召回
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs h-7 border-cyan-300/60 text-cyan-600/70 hover:bg-cyan-50 hover:border-cyan-400 hover:text-cyan-700 dark:border-cyan-800/50 dark:text-cyan-400/70 dark:hover:bg-cyan-950/40 dark:hover:border-cyan-600 dark:hover:text-cyan-300"
              onClick={data.onSkipBgm}
              disabled={data.isReadOnly}
            >
              跳过
            </Button>
            <Button size="sm" className="flex-1 text-xs h-7" onClick={handleConfirm} disabled={data.isReadOnly}>
              <CheckCircle2 className="mr-1 h-3 w-3" /> 确认
            </Button>
          </div>
        </div>
      )}
    </DXNodeBase>
  );
});
BgmRecallNode.displayName = "BgmRecallNode";

export default BgmRecallNode;
