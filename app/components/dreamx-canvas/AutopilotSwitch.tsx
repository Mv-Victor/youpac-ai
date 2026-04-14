import { useEffect } from "react";
import { Bot, Loader2, AlertCircle } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { useCredits } from "~/contexts/CreditsContext";
import { toast } from "sonner";

export function AutopilotSwitch({ hasMedia }: { hasMedia?: boolean }) {
  const { autopilotEnabled, autopilotFailed, setAutopilotEnabled, autopilotError, clearAutopilotError } = useCredits();

  useEffect(() => {
    if (autopilotError) {
      toast.error(`AI 托管已暂停：${autopilotError}`);
      clearAutopilotError();
    }
  }, [autopilotError, clearAutopilotError]);

  return (
    <div className="flex items-center gap-2">
      {autopilotFailed && (
        <Badge variant="destructive" className="text-xs gap-1">
          <AlertCircle className="h-3 w-3" />
          失败
        </Badge>
      )}
      {autopilotEnabled && (
        <Badge variant="secondary" className="text-xs gap-1 bg-violet-500/15 text-violet-600 border-violet-500/20">
          <Loader2 className="h-3 w-3 animate-spin" />
          托管中
        </Badge>
      )}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={autopilotEnabled ? "destructive" : "outline"}
              size="sm"
              className="gap-1.5 text-xs h-8"
              onClick={() => {
                if (autopilotEnabled) {
                  // 关闭托管
                  setAutopilotEnabled(false);
                  toast.success("已关闭 AI 托管");
                } else {
                  // 开启托管
                  if (!hasMedia) {
                    toast.error("请先上传素材图片，再开启 AI 托管模式");
                    return;
                  }
                  setAutopilotEnabled(true);
                }
              }}
            >
              <Bot className="h-3.5 w-3.5" />
              {autopilotEnabled ? "关闭托管" : "AI 托管"}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-56 text-xs leading-relaxed">
            {autopilotEnabled
              ? "点击关闭 AI 托管，当前正在执行的操作会完成，但不会继续推进后续节点"
              : "开启后自动完成每个节点的默认操作：自动确认素材分析、自动选择表情包、自动选择 BGM、自动生成配音。遇到积分不足或错误时自动暂停。"
            }
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
