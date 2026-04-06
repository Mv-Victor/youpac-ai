import { memo } from "react";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { DXNodeBase } from "../DXNodeBase";
import type { DXNodeData } from "./pipeline.config";

interface CopywritingNodeInnerProps {
  data: DXNodeData & {
    emotionTags?: string[];
    errorMessage?: string;
    onGenerate: () => void;
    onRegenerate: () => void;
  };
}

const CopywritingNode = memo(({ data }: CopywritingNodeInnerProps) => {
  const status = (data.nodeState as any).status;
  const isCompleted = data.isReadOnly;
  const isGenerating = status === "generating";

  return (
    <DXNodeBase
      status={status}
      title="文案情绪分析"
      icon={Sparkles}
      colorClass="bg-gradient-to-br from-violet-500 to-purple-600"
      nodeNum={2}
      isReadOnly={isCompleted}
      onReset={data.onReset}
    >
      {isCompleted && data.emotionTags && data.emotionTags.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">已提炼情绪标签，将用于表情包和 BGM 推荐：</p>
          <div className="flex flex-wrap gap-1.5">
            {data.emotionTags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-sm px-3 py-1">{tag}</Badge>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full mt-2"
            onClick={data.onRegenerate}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> 重新分析
          </Button>
        </div>
      ) : status === "error" ? (
        <div className="space-y-2">
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
            <p className="text-xs text-destructive">{String(data.errorMessage ?? "未知错误")}</p>
          </div>
          <Button size="sm" className="w-full" onClick={data.onGenerate} disabled={data.isReadOnly}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> 重试
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            AI 将分析图片情绪，提炼 2-4 个情绪标签，用于后续表情包和 BGM 智能推荐。
          </p>
          <Button onClick={data.onGenerate} disabled={isGenerating || data.isReadOnly} className="w-full" size="sm">
            {isGenerating ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 分析中...</>
            ) : (
              <><Sparkles className="mr-2 h-4 w-4" /> 分析情绪</>
            )}
          </Button>
        </div>
      )}
    </DXNodeBase>
  );
});
CopywritingNode.displayName = "CopywritingNode";

export default CopywritingNode;
