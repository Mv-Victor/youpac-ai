import { memo, useState, useCallback, useRef, useEffect } from "react";
import {
  Upload, Sparkles, Loader2, RefreshCw, Plus, X, MessageSquare,
  Eye, ZoomIn, CheckCircle2, Edit2, Tag,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "~/components/ui/dialog";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import { DXNodeBase } from "../DXNodeBase";
import type { DXNodeData } from "./pipeline.config";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif",
  "image/webp", "image/heic", "image/heif",
]);

interface MediaImage {
  url: string;
  fileName: string;
  storageId: string;
  aiDescription?: string;
}

interface MediaUploadNodeInnerProps {
  data: DXNodeData & {
    images?: MediaImage[];
    eventDescription?: string;
    aiAnalysis?: string;
    emotionTags?: string[];
    analysisStatus?: "idle" | "generating" | "ready" | "error";
    analysisProgress?: { stage: string; percent: number };
    onUploadFiles: (imageFiles: File[], description: string, existingImages?: MediaImage[]) => Promise<void>;
    onGenerateAnalysis?: () => Promise<void>;
    onConfirmAnalysis?: (editedAnalysis: string, emotionTags: string[]) => void;
    onOpenChat?: () => void;
  };
}

// ─── 图片上传弹窗 ────────────────────────────────────────────────────────────

const DXMediaUploadModal = memo(({
  isOpen, onClose, initialImages, initialDescription, onUpload, isUploading = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialImages: MediaImage[];
  initialDescription: string;
  onUpload: (imageFiles: File[], description: string, existingImages: MediaImage[]) => Promise<void>;
  isUploading?: boolean;
}) => {
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [description, setDescription] = useState(initialDescription);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    previewUrls.forEach((u) => URL.revokeObjectURL(u));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 当 initialImages 更新（上传成功后数据库回写），自动从 selectedImages 中
  // 移除已经在 initialImages 里的文件（按文件名去重），避免"待上传"和"已上传"同时显示同一张图
  useEffect(() => {
    if (selectedImages.length === 0) return;
    const uploadedNames = new Set(initialImages.map((img) => img.fileName));
    const remaining = selectedImages.filter((f) => !uploadedNames.has(f.name));
    if (remaining.length === selectedImages.length) return; // 没有变化，不触发 re-render
    // 清理被移除的 ObjectURL
    const removedIndices = selectedImages
      .map((f, i) => (uploadedNames.has(f.name) ? i : -1))
      .filter((i) => i !== -1);
    removedIndices.forEach((i) => URL.revokeObjectURL(previewUrls[i]));
    setSelectedImages(remaining);
    setPreviewUrls(remaining.map((f) => URL.createObjectURL(f)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImages]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => ALLOWED_IMAGE_TYPES.has(f.type));
    if (!files.length) return;

    // 过滤掉已上传（initialImages）或已在 selectedImages 中的同名文件，避免重复展示
    const existingNames = new Set([
      ...initialImages.map((img) => img.fileName),
      ...selectedImages.map((f) => f.name),
    ]);
    const newFiles = files.filter((f) => !existingNames.has(f.name));
    if (!newFiles.length) return;

    const combined = [...selectedImages, ...newFiles].slice(0, 10 - initialImages.length);
    // 清理旧的 ObjectURL，重新为全部文件生成新的，避免索引错位导致重复展示
    previewUrls.forEach((u) => URL.revokeObjectURL(u));
    setSelectedImages(combined);
    setPreviewUrls(combined.map((f) => URL.createObjectURL(f)));
    e.target.value = "";
  };

  const removeNewImage = (index: number) => {
    URL.revokeObjectURL(previewUrls[index]);
    setSelectedImages((p) => p.filter((_, i) => i !== index));
    setPreviewUrls((p) => p.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (selectedImages.length === 0 && initialImages.length === 0) return;
    await onUpload(selectedImages, description, initialImages);
    // 提交后清空待上传列表，关闭弹窗
    previewUrls.forEach((u) => URL.revokeObjectURL(u));
    setSelectedImages([]);
    setPreviewUrls([]);
    onClose();
  };

  const handleClose = () => {
    previewUrls.forEach((u) => URL.revokeObjectURL(u));
    setSelectedImages([]);
    setPreviewUrls([]);
    onClose();
  };

  const maxNew = 10 - initialImages.length;
  const totalImages = initialImages.length + selectedImages.length;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>上传素材图片</DialogTitle>
          <DialogDescription>上传图片素材，AI 将分析内容并辅助生成文案。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* 上传区 */}
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
              "hover:border-primary hover:bg-muted/50",
              selectedImages.length >= maxNew && "opacity-50 cursor-not-allowed"
            )}
            onClick={() => selectedImages.length < maxNew && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file" multiple accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
              disabled={selectedImages.length >= maxNew}
            />
            <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium mb-1">
              {selectedImages.length === 0
                ? `点击上传图片（最多 ${maxNew} 张）`
                : selectedImages.length >= maxNew
                  ? "已达上限"
                  : `继续添加（剩余 ${maxNew - selectedImages.length} 张）`}
            </p>
            <p className="text-xs text-muted-foreground">PNG、JPG、WEBP、GIF，每张最大10MB</p>
          </div>

          {/* 图片预览区 */}
          {(initialImages.length > 0 || selectedImages.length > 0) && (
            <div className="grid grid-cols-4 gap-2">
              {initialImages.map((img, i) => (
                <div key={`e-${i}`} className="relative rounded-lg overflow-hidden border border-border/40 aspect-square">
                  <img src={img.url} alt={img.fileName} className="w-full h-full object-cover" />
                  <div className="absolute bottom-0 left-0 right-0 bg-emerald-600/80 text-white text-[9px] text-center py-0.5">已上传</div>
                </div>
              ))}
              {previewUrls.map((url, i) => (
                <div key={`n-${i}`} className="relative group rounded-lg overflow-hidden border border-border/40 aspect-square">
                  <img src={url} alt={selectedImages[i].name} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeNewImage(i)}
                    className="absolute top-1 right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-blue-600/80 text-white text-[9px] text-center py-0.5">待上传</div>
                </div>
              ))}
            </div>
          )}

          {/* 事件描述 */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              事件描述 <span className="text-muted-foreground font-normal">（可选，帮助 AI 更准确分析）</span>
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="描述这些图片的事件背景，如：婚礼、产品发布会、旅行等..."
              className="text-sm min-h-[64px] resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isUploading}>取消</Button>
          <Button onClick={handleSubmit} disabled={totalImages === 0 || isUploading}>
            {isUploading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 上传中…</>
            ) : (
              `上传图片（${totalImages}）`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
DXMediaUploadModal.displayName = "DXMediaUploadModal";

// ─── 图片全屏预览弹窗 ─────────────────────────────────────────────────────────

const ImagePreviewModal = memo(({ images, initialIndex, onClose }: {
  images: MediaImage[];
  initialIndex: number;
  onClose: () => void;
}) => {
  const [idx, setIdx] = useState(initialIndex);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl p-2">
        <div className="relative">
          <img
            src={images[idx].url}
            alt={images[idx].fileName}
            className="w-full max-h-[70vh] object-contain rounded-lg"
          />
          {images.length > 1 && (
            <div className="absolute inset-x-0 bottom-2 flex justify-center gap-2">
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === idx ? "w-4 bg-white" : "w-1.5 bg-white/50"
                  )}
                />
              ))}
            </div>
          )}
          {idx > 0 && (
            <button
              onClick={() => setIdx((p) => p - 1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-2"
            >
              ‹
            </button>
          )}
          {idx < images.length - 1 && (
            <button
              onClick={() => setIdx((p) => p + 1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-2"
            >
              ›
            </button>
          )}
        </div>
        <p className="text-xs text-center text-muted-foreground mt-1">{images[idx].fileName} ({idx + 1}/{images.length})</p>
      </DialogContent>
    </Dialog>
  );
});
ImagePreviewModal.displayName = "ImagePreviewModal";

// ─── 素材上传节点主体 ─────────────────────────────────────────────────────────

const EMOTION_TAG_OPTIONS = ["搞笑", "震惊", "励志", "伤感", "日常", "可爱", "委屈", "愤怒", "欢快"];

const MediaUploadNode = memo(({ data }: MediaUploadNodeInnerProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // 分析结果编辑态
  const [isEditingAnalysis, setIsEditingAnalysis] = useState(false);
  const [editedAnalysis, setEditedAnalysis] = useState(data.aiAnalysis ?? "");
  const [editedTags, setEditedTags] = useState<string[]>(data.emotionTags ?? []);

  // 当 aiAnalysis / emotionTags 从数据库更新时，同步本地编辑态
  useEffect(() => {
    setEditedAnalysis(data.aiAnalysis ?? "");
    setEditedTags(data.emotionTags ?? []);
  }, [data.aiAnalysis, data.emotionTags]);

  const hasImages = (data.images?.length ?? 0) > 0;
  const isCompleted = data.isReadOnly;
  const aStatus = data.analysisStatus ?? "idle";
  const aProgress = data.analysisProgress;

  const handleUpload = useCallback(async (
    imageFiles: File[],
    description: string,
    existingImages: MediaImage[] = [],
  ) => {
    setIsUploading(true);
    try {
      await data.onUploadFiles(imageFiles, description, existingImages);
    } finally {
      setIsUploading(false);
    }
  }, [data]);

  const toggleTag = (tag: string) => {
    setEditedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleConfirmAnalysis = () => {
    data.onConfirmAnalysis?.(editedAnalysis, editedTags);
    setIsEditingAnalysis(false);
  };

  return (
    <>
      <DXNodeBase
        status={(data.nodeState as any).status}
        title="素材上传与分析"
        icon={Upload}
        colorClass="bg-gradient-to-br from-blue-500 to-indigo-600"
        nodeNum={1}
        isFirst
        isReadOnly={isCompleted}
        onReset={data.onReset}
      >
        {/* 空状态：点击上传 */}
        {!hasImages && (
          <div
            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/60 p-6 cursor-pointer hover:border-primary/60 transition-colors"
            onClick={() => !isCompleted && setDialogOpen(true)}
          >
            <Upload className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm font-medium text-muted-foreground">上传图片</p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">JPG / PNG / WEBP，最多10张</p>
          </div>
        )}

        {/* 已有图片：6列网格（原3列一半大小）+ 继续上传占位符 */}
        {hasImages && (
          <div className="grid grid-cols-6 gap-1.5">
            {data.images!.map((img, i) => (
              <div
                key={i}
                className="group relative cursor-pointer rounded-lg overflow-hidden border border-border/40 hover:border-primary/50 transition-all bg-muted/20 aspect-square"
                onClick={() => setPreviewIdx(i)}
                title={img.fileName}
              >
                <img src={img.url} alt={img.fileName} className="w-full h-full object-cover" draggable={false} />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors flex items-center justify-center">
                  <ZoomIn className="h-2.5 w-2.5 text-white drop-shadow opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
            {!isCompleted && (
              <button
                className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border/50 hover:border-primary/60 hover:bg-primary/5 transition-colors text-muted-foreground/50 aspect-square"
                onClick={() => setDialogOpen(true)}
              >
                <Plus className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {/* 事件描述展示 */}
        {hasImages && data.eventDescription && (
          <div className="mt-2 rounded-lg bg-muted/30 px-3 py-2 border border-border/30">
            <p className="text-xs text-muted-foreground/60 mb-0.5">事件描述</p>
            <p className="text-xs text-foreground/80 leading-relaxed">{data.eventDescription}</p>
          </div>
        )}

        {/* 分析区 */}
        {hasImages && (
          <div className="mt-2 space-y-2">
            {/* 生成中 */}
            {aStatus === "generating" && aProgress && (
              <div className="rounded-lg bg-primary/10 p-3.5 border border-primary/20">
                <div className="flex items-center gap-2.5 mb-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <p className="text-xs font-medium">{aProgress.stage}</p>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-500"
                    style={{ width: `${aProgress.percent}%` }}
                  />
                </div>
              </div>
            )}

            {/* 分析结果展示/编辑 */}
            {aStatus !== "generating" && (
              editedAnalysis ? (
                <div className="rounded-lg bg-muted/50 p-3 border border-border/50 space-y-2">
                  {isEditingAnalysis ? (
                    <>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Edit2 className="h-3 w-3 text-primary" />
                        <span className="text-xs font-medium text-primary">编辑分析结果</span>
                      </div>
                      <Textarea
                        value={editedAnalysis}
                        onChange={(e) => setEditedAnalysis(e.target.value)}
                        className="text-xs min-h-[80px] resize-none"
                      />
                      {/* 情绪标签编辑 */}
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Tag className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">情绪标签（点击切换）</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {EMOTION_TAG_OPTIONS.map((tag) => (
                            <button
                              key={tag}
                              onClick={() => toggleTag(tag)}
                              className={cn(
                                "px-2 py-0.5 rounded-full text-xs border transition-colors",
                                editedTags.includes(tag)
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-muted/50 border-border/40 hover:border-primary/40"
                              )}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs h-7"
                          onClick={() => { setEditedAnalysis(data.aiAnalysis ?? ""); setEditedTags(data.emotionTags ?? []); setIsEditingAnalysis(false); }}
                        >
                          取消
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 text-xs h-7 bg-primary"
                          onClick={handleConfirmAnalysis}
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          确认并继续
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-4">{editedAnalysis}</p>
                      {/* 情绪标签展示 */}
                      {editedTags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {editedTags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs px-2 py-0">{tag}</Badge>
                          ))}
                        </div>
                      )}
                      {!isCompleted && (
                        <div className="flex gap-1.5 pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 text-xs h-7 px-1.5"
                            onClick={() => setIsEditingAnalysis(true)}
                          >
                            <Edit2 className="h-3 w-3 mr-1 shrink-0" />
                            修改
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1 text-xs h-7 px-1.5"
                            onClick={handleConfirmAnalysis}
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1 shrink-0" />
                            确认
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 text-xs h-7 px-1.5"
                            onClick={data.onGenerateAnalysis}
                            disabled={aStatus === "generating" || !data.onGenerateAnalysis}
                          >
                            <RefreshCw className="h-3 w-3 mr-1 shrink-0" />
                            重生成
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="rounded-lg bg-gradient-to-br from-muted/30 to-muted/10 p-5 border border-dashed border-muted-foreground/20">
                  <div className="text-center">
                    <Sparkles className="h-6 w-6 text-muted-foreground/30 mx-auto mb-1.5" />
                    <p className="text-xs text-muted-foreground">点击分析按钮，AI 将同时完成图片分析与情绪标签提取</p>
                  </div>
                </div>
              )
            )}

            {/* 操作按钮：仅在无分析结果时显示（有结果时三按钮已内联在分析结果区） */}
            {!isCompleted && !(aStatus === "ready" && editedAnalysis) && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={data.onGenerateAnalysis}
                  disabled={aStatus === "generating" || !data.onGenerateAnalysis}
                >
                  {aStatus === "generating" ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />分析中...</>
                  ) : (
                    <><Sparkles className="h-3.5 w-3.5 mr-1.5" />分析素材</>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </DXNodeBase>

      {/* 上传弹窗 */}
      <DXMediaUploadModal
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        initialImages={data.images ?? []}
        initialDescription={data.eventDescription ?? ""}
        onUpload={handleUpload}
        isUploading={isUploading}
      />

      {/* 图片预览弹窗 */}
      {previewIdx !== null && data.images && data.images.length > 0 && (
        <ImagePreviewModal
          images={data.images}
          initialIndex={previewIdx}
          onClose={() => setPreviewIdx(null)}
        />
      )}
    </>
  );
});
MediaUploadNode.displayName = "MediaUploadNode";

export default MediaUploadNode;
