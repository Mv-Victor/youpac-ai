import { useEffect } from "react";
import { Bot, Loader2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { useCredits } from "~/contexts/CreditsContext";
import { toast } from "sonner";

export function AutopilotSwitch({ hasMedia }: { hasMedia?: boolean }) {
  const { autopilotEnabled, setAutopilotEnabled, autopilotError, clearAutopilotError } = useCredits();

  useEffect(() => {
    if (autopilotError) {
      toast.error(`AI 托管已暂停：${autopilotError}`);
      clearAutopilotError();
    }
  }, [autopilotError, clearAutopilotError]);

  return (
    <div className="flex items-center gap-2">
      {autopilotEnabled && (
        <Badge variant="secondary" className="text-xs gap-1 bg-primary/10 text-primary border-primary/20">
          <Loader2 className="h-3 w-3 animate-spin" />
          自动运行中...
        </Badge>
      )}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={autopilotEnabled ? "default" : "outline"}
              size="sm"
              className="gap-1.5 text-xs h-8"
              onClick={() => {
                if (!hasMedia) {
                  toast.error("请先上传素材图片，再开启 AI 托管模式");
                  return;
                }
                setAutopilotEnabled(!autopilotEnabled);
              }}
            >
              <Bot className="h-3.5 w-3.5" />
              AI 托管
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-56 text-xs leading-relaxed">
            开启后自动完成每个节点的默认操作：自动确认素材分析、自动选择表情包、自动选择 BGM、自动生成配音。遇到积分不足或错误时自动暂停。
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
