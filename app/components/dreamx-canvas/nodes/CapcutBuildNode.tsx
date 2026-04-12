import { memo, useState, useCallback, useEffect, useRef } from "react";
import { Film, Loader2, RefreshCw, Download, CheckCircle2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { DXNodeBase } from "../DXNodeBase";
import type { DXNodeData } from "./pipeline.config";
import { useCredits } from "~/contexts/CreditsContext";

interface CapcutBuildNodeInnerProps {
  data: DXNodeData & {
    downloadUrl?: string;
    projectName?: string;
    errorMessage?: string;
    onBuild: () => void;
    onRebuild: () => void;
  };
}

const CapcutBuildNode = memo(({ data }: CapcutBuildNodeInnerProps) => {
  const status = (data.nodeState as any).status;
  const isCompleted = data.isReadOnly;
  const isGenerating = status === "generating";
  const [isDownloading, setIsDownloading] = useState(false);
  const { autopilotEnabled } = useCredits();

  const autopilotCalledRef = useRef(false);
  useEffect(() => {
    if (!autopilotEnabled) { autopilotCalledRef.current = false; return; }
  }, [autopilotEnabled, status]);

  const handleDownload = useCallback(async () => {
    if (!data.downloadUrl) return;
    setIsDownloading(true);
    try {
      const resp = await fetch(data.downloadUrl);
      if (!resp.ok) throw new Error(`下载失败: HTTP ${resp.status}`);
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${data.projectName ?? "dreamX"}_capcut.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
    } catch (e) {
      console.error("[CapcutBuildNode] 下载失败:", e);
    } finally {
      setIsDownloading(false);
    }
  }, [data.downloadUrl, data.projectName]);

  return (
    <DXNodeBase
      status={status}
      title="CapCut 成片"
      icon={Film}
      colorClass="bg-gradient-to-br from-rose-500 to-red-600"
      nodeNum={6}
      isLast
      isReadOnly={isCompleted}
    >
      {isCompleted && data.downloadUrl ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3 py-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">工程文件已生成！</p>
              <p className="text-xs text-muted-foreground mt-0.5">下载 ZIP 后，解压到 CapCut 草稿目录即可导入</p>
            </div>
          </div>
          <Button
            onClick={handleDownload}
            disabled={isDownloading}
            className="w-full bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700"
          >
            {isDownloading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 下载中…</>
              : <><Download className="mr-2 h-4 w-4" /> 下载 CapCut 工程 ZIP</>
            }
          </Button>
          <div className="rounded-xl bg-muted/50 px-3 py-2 space-y-1">
            <p className="text-xs font-medium text-foreground">导入 CapCut 步骤：</p>
            <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal list-inside">
              <li>下载并解压 ZIP 文件</li>
              <li>将解压后的文件夹复制到 CapCut 草稿目录</li>
              <li>打开剪映全局设置即可查看草稿位置，一般以com.lveditor.draft命名</li>
              <li>打开 CapCut，在草稿箱中找到该项目，打开即可编辑</li>
            </ol>
          </div>
        </div>
      ) : status === "error" ? (
        <div className="space-y-2">
          <p className="text-xs text-destructive">{data.errorMessage as string}</p>
          <Button size="sm" className="w-full" onClick={data.onBuild}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> 重试
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            将以上所有素材和时间轴信息打包成 CapCut 工程文件（draft_info.json + draft_meta_info.json），压缩为 ZIP 供你下载导入。
          </p>
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              ⚠️ 注意：CapCut 需联网才能加载在线素材。
            </p>
          </div>
          <Button
            onClick={data.onBuild}
            disabled={isGenerating}
            className="w-full bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700"
            size="sm"
          >
            {isGenerating ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 生成工程文件...</>
            ) : (
              <><Film className="mr-2 h-4 w-4" /> 生成 CapCut 工程</>
            )}
          </Button>
        </div>
      )}
    </DXNodeBase>
  );
});
CapcutBuildNode.displayName = "CapcutBuildNode";

export default CapcutBuildNode;
