import { memo, useState, useRef, useCallback, useEffect } from "react";
import { CheckCircle2, Image, RefreshCw, Loader2, Plus } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";
import { DXNodeBase } from "../DXNodeBase";
import type { DXNodeData } from "./pipeline.config";
import { CreditsBadge } from "~/components/credits/CreditsBadge";
import { useCredits } from "~/contexts/CreditsContext";interface MemeItem {
  url: string;
  name: string;
  mood: string;
  mediaId?: string;
  isBuiltin: boolean;
}

interface MemeRecallNodeInnerProps {
  data: DXNodeData & {
    suggestedMemes?: MemeItem[];
    selectedMemes?: Array<{ url: string; name: string; mood: string; insertAfterImageIndex: number }>;
    imageCount: number;
    imageUrls?: string[];
    onConfirmSelection: (selectedMemes: Array<{ url: string; name: string; mood: string; insertAfterImageIndex: number }>) => void;
    onUploadMeme: (file: File) => Promise<{ url: string; name: string; mood: string } | void>;
    onReRecall?: () => void;
    onSuggestInsertions?: (args: { imageUrls: string[]; memes: Array<{ url: string; name: string; mood: string }> }) => Promise<Array<{ memeUrl: string; insertAfterImageIndex: number }>>;
  };
}

const MemeRecallNode = memo(({ data }: MemeRecallNodeInnerProps) => {
  const [selections, setSelections] = useState<Array<{ meme: MemeItem; insertAfterImageIndex: number }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [customMemes, setCustomMemes] = useState<MemeItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const status = (data.nodeState as any).status;
  const isCompleted = data.isReadOnly;
  const { balance, nodeCosts, autopilotEnabled } = useCredits();
  const memeInsertCost = nodeCosts["memeInsert"] ?? 2;
  const reRecallInsufficient = balance !== undefined && balance < memeInsertCost;

  const autopilotCalledRef = useRef(false);
  useEffect(() => {
    if (!autopilotEnabled) { autopilotCalledRef.current = false; return; }
  }, [autopilotEnabled, status, data.suggestedMemes]);

  // 当 suggestedMemes 变化（首次加载或重新召回）时，调用 AI 分析默认插入位置
  // 但在 autopilot 模式下不触发，避免与后端重复执行
  const suggestCalledRef = useRef(false);
  const prevSuggestedMemesKeyRef = useRef<string>("");
  useEffect(() => {
    const memes = data.suggestedMemes;
    const imageUrls = data.imageUrls ?? [];
    const memesKey = memes ? memes.map((m) => m.url).join(",") : "";

    // 检测到新数据（内容变化），先清空旧选择并允许重新触发
    if (memesKey !== prevSuggestedMemesKeyRef.current) {
      prevSuggestedMemesKeyRef.current = memesKey;
      suggestCalledRef.current = false;
      setSelections([]);
    }

    // 如果 DB 中已有 selectedMemes（AI 已分析过），直接用 DB 数据初始化，不重新触发
    if (data.selectedMemes && data.selectedMemes.length > 0 && memes) {
      suggestCalledRef.current = true;
      setSelections(
        data.selectedMemes
          .map((s) => {
            const meme = memes.find((m) => m.url === s.url);
            if (!meme) return null;
            return { meme, insertAfterImageIndex: s.insertAfterImageIndex };
          })
          .filter(Boolean) as Array<{ meme: MemeItem; insertAfterImageIndex: number }>
      );
      return;
    }

    // ✅ Autopilot模式下不触发前端AI分析，完全由后端控制
    if (autopilotEnabled) {
      return;
    }

    if (
      !suggestCalledRef.current &&
      memes && memes.length > 0 &&
      imageUrls.length > 0 &&
      data.onSuggestInsertions &&
      !isCompleted &&
      status === "idle"
    ) {
      suggestCalledRef.current = true;
      setIsSuggesting(true);
      data.onSuggestInsertions({
        imageUrls,
        memes: memes.map((m) => ({ url: m.url, name: m.name, mood: m.mood })),
      }).then((suggestions) => {
        if (suggestions && suggestions.length > 0) {
          setSelections(
            suggestions
              .map((s) => {
                const meme = memes.find((m) => m.url === s.memeUrl);
                if (!meme) return null;
                return { meme, insertAfterImageIndex: s.insertAfterImageIndex };
              })
              .filter(Boolean) as Array<{ meme: MemeItem; insertAfterImageIndex: number }>
          );
        }
      }).catch(() => {
        // AI 分析失败，静默，不影响手动选择
      }).finally(() => setIsSuggesting(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.suggestedMemes, data.selectedMemes, status, autopilotEnabled]);

  const toggleMeme = (meme: MemeItem) => {
    setSelections((prev) => {
      const exists = prev.find((s) => s.meme.url === meme.url);
      if (exists) return prev.filter((s) => s.meme.url !== meme.url);
      return [...prev, { meme, insertAfterImageIndex: 0 }];
    });
  };

  const updateInsertPosition = (memeUrl: string, pos: number) => {
    setSelections((prev) =>
      prev.map((s) => s.meme.url === memeUrl ? { ...s, insertAfterImageIndex: pos } : s)
    );
  };

  const handleConfirm = () => {
    data.onConfirmSelection(
      selections.map((s) => ({
        url: s.meme.url,
        name: s.meme.name,
        mood: s.meme.mood,
        insertAfterImageIndex: s.insertAfterImageIndex,
      }))
    );
  };

  const handleSkip = () => {
    data.onConfirmSelection([]);
  };

  const handleUploadFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      // onUploadMeme 内部会调用 AI 分析 mood，无需前端传 mood
      const result = await data.onUploadMeme(file);
      if (result) {
        const newMeme: MemeItem = {
          url: result.url,
          name: result.name,
          mood: result.mood,
          isBuiltin: false,
        };
        setCustomMemes((prev) => {
          if (prev.some((m) => m.url === newMeme.url)) return prev;
          return [...prev, newMeme];
        });
        // 自动选中，插入到最后一张图片之后
        setSelections((prev) => {
          if (prev.some((s) => s.meme.url === newMeme.url)) return prev;
          return [...prev, { meme: newMeme, insertAfterImageIndex: Math.max(0, (data.imageCount ?? 1) - 1) }];
        });
      }
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  }, [data]);

  // 合并 suggestedMemes + customMemes（去重），自定义上传的排在末尾
  const suggestedUrls = new Set((data.suggestedMemes ?? []).map((m) => m.url));
  const allMemes: MemeItem[] = [
    ...(data.suggestedMemes ?? []),
    ...customMemes.filter((m) => !suggestedUrls.has(m.url)),
  ];

  return (
    <DXNodeBase
      status={status}
      title="表情包召回"
      icon={Image}
      colorClass="bg-gradient-to-br from-pink-500 to-rose-600"
      nodeNum={2}
      isReadOnly={isCompleted}
      onReset={data.onReset}
      resetNodeType={undefined}
      resetImageCount={0}
    >
      {isCompleted && data.selectedMemes ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            已选 {data.selectedMemes.length} 个表情包{data.selectedMemes.length === 0 ? "（已跳过）" : ""}
          </p>
          {data.selectedMemes.length > 0 && (
            <div className="grid grid-cols-6 gap-1.5">
              {data.selectedMemes.map((m, i) => (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  <div className="w-full aspect-square rounded-lg overflow-hidden bg-muted border border-border/30">
                    <img src={m.url} alt={m.name} className="h-full w-full object-cover" />
                  </div>
                  <Badge variant="outline" className="text-[7px] px-0.5 py-0 h-3 border-violet-400/50 text-violet-400 w-full justify-center truncate">
                    {m.insertAfterImageIndex === -1 ? "开始" : `图${m.insertAfterImageIndex + 1}后`}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            根据情绪匹配的表情包推荐（选0-3个，AI已自动标注插入位置）：
            {isSuggesting && (
              <span className="ml-1 text-violet-400 inline-flex items-center gap-0.5">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />AI分析中…
              </span>
            )}
          </p>

          {/* 表情包网格 + 末尾"+"上传格子 */}
          <div className="grid grid-cols-6 gap-1.5">
            {allMemes.map((meme, i) => {
              const selected = selections.some((s) => s.meme.url === meme.url);
              const selection = selections.find((s) => s.meme.url === meme.url);
              return (
                <div key={i} className="flex flex-col gap-0.5">
                  <button
                    onClick={() => toggleMeme(meme)}
                    disabled={isCompleted}
                    className={cn(
                      "relative w-full aspect-square rounded-lg overflow-hidden border-2 transition-all",
                      selected ? "border-violet-500 ring-1 ring-violet-500/50" : "border-border/40 hover:border-border",
                      !meme.isBuiltin && "ring-offset-1"
                    )}
                  >
                    <img src={meme.url} alt={meme.name} className="h-full w-full object-cover" />
                    {selected && (
                      <div className="absolute inset-0 bg-violet-500/20 flex items-center justify-center">
                        <CheckCircle2 className="h-4 w-4 text-white drop-shadow" />
                      </div>
                    )}
                    {!meme.isBuiltin && (
                      <div className="absolute top-0.5 left-0.5 bg-violet-600/80 text-white text-[7px] px-0.5 rounded leading-tight">自定义</div>
                    )}
                  </button>
                  {/* 已选中时显示位置下拉，宽度与图片等宽 */}
                  {selected && (
                    <Select
                      value={String(selection?.insertAfterImageIndex ?? 0)}
                      onValueChange={(v) => updateInsertPosition(meme.url, Number(v))}
                      disabled={isCompleted}
                    >
                      <SelectTrigger className="h-5 text-[9px] px-1 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="-1" className="text-xs">最开始</SelectItem>
                        {Array.from({ length: data.imageCount }, (_, j) => (
                          <SelectItem key={j} value={String(j)} className="text-xs">图{j + 1}后</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              );
            })}

            {/* 上传自定义表情包：与图片同尺寸的"+"格子，AI 自动分析 mood */}
            {!isCompleted && (
              <button
                className={cn(
                  "flex flex-col items-center justify-center rounded-lg border-2 border-dashed aspect-square transition-colors",
                  isUploading
                    ? "border-violet-400/50 bg-violet-500/5 cursor-wait"
                    : "border-border/50 hover:border-violet-400/60 hover:bg-violet-500/5 text-muted-foreground/50"
                )}
                onClick={() => !isUploading && fileInputRef.current?.click()}
                disabled={isUploading}
                title="上传自定义表情包（AI自动识别情绪）"
              >
                {isUploading ? (
                  <Loader2 className="h-3 w-3 animate-spin text-violet-400" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUploadFile}
            />
          </div>

          {allMemes.length === 0 && !isUploading && (
            <p className="text-xs text-muted-foreground/60 text-center -mt-1">点击"+"上传自定义表情包</p>
          )}

          {/* 底部操作：重新召回 + 跳过 + 确认 */}
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs h-7"
              onClick={data.onReRecall}
              disabled={isCompleted || !data.onReRecall || reRecallInsufficient}
            >
              <RefreshCw className="mr-1 h-3 w-3" />重新召回
              <CreditsBadge nodeType="memeInsert" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs h-7 border-rose-300/60 text-rose-600/70 hover:bg-rose-50 hover:border-rose-400 hover:text-rose-700 dark:border-rose-800/50 dark:text-rose-400/70 dark:hover:bg-rose-950/40 dark:hover:border-rose-600 dark:hover:text-rose-300"
              onClick={handleSkip}
              disabled={isCompleted}
            >
              跳过
            </Button>
            <Button onClick={handleConfirm} size="sm" className="flex-1 text-xs h-7" disabled={isCompleted}>
              <CheckCircle2 className="mr-1 h-3 w-3" />确认（{selections.length}）
            </Button>
          </div>
        </div>
      )}
    </DXNodeBase>
  );
});
MemeRecallNode.displayName = "MemeRecallNode";

export default MemeRecallNode;
