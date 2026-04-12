import { memo, useState } from "react";
import { Lock, Loader2, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { Handle, Position } from "@xyflow/react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { CreditsBadge } from "~/components/credits/CreditsBadge";

export type DXNodeStatus = "idle" | "locked" | "generating" | "completed" | "error";

interface BaseNodeProps {
  status: DXNodeStatus;
  title: string;
  icon: React.ElementType;
  colorClass: string;
  nodeNum: number;
  children?: React.ReactNode;
  isFirst?: boolean;
  isLast?: boolean;
  isReadOnly?: boolean;
  onReset?: () => void;
  /** 重置后会触发的节点类型（用于显示积分标识） */
  resetNodeType?: string;
  /** 重置后会触发的节点涉及图片数（用于计算附加积分） */
  resetImageCount?: number;
  /** 是否禁用重置按钮（如积分不足） */
  resetDisabled?: boolean;
}

export const DXNodeBase = memo(
  ({
    status,
    title,
    icon: Icon,
    colorClass,
    nodeNum,
    children,
    isFirst = false,
    isLast = false,
    isReadOnly = false,
    onReset,
    resetNodeType,
    resetImageCount = 0,
    resetDisabled = false,
  }: BaseNodeProps) => {
    const [expanded, setExpanded] = useState(status !== "locked");

    const isLocked = status === "locked";
    const isGenerating = status === "generating";
    const isCompleted = status === "completed";
    const isError = status === "error";

    const statusBadge = isLocked
      ? { label: "锁定", variant: "secondary" as const, icon: Lock }
      : isGenerating
        ? { label: "生成中…", variant: "default" as const, icon: Loader2 }
        : isCompleted
          ? { label: "已完成", variant: "default" as const, icon: CheckCircle2 }
          : isError
            ? { label: "出错", variant: "destructive" as const, icon: AlertCircle }
            : { label: "就绪", variant: "outline" as const, icon: null };

    return (
      <div
        className={cn(
          "relative w-full rounded-2xl border shadow-lg transition-all duration-300",
          isLocked
            ? "border-border/30 bg-muted/30 opacity-55"
            : isCompleted
              ? "border-emerald-500/40 bg-background shadow-emerald-500/10"
              : isError
                ? "border-destructive/40 bg-background"
                : isGenerating
                  ? "border-violet-500/60 bg-background shadow-violet-500/20 ring-1 ring-violet-500/30"
                  : "border-border/60 bg-background hover:border-border"
        )}
      >
        {!isFirst && (
          <Handle
            type="target"
            position={Position.Top}
            id="dx-in"
            className="!w-3 !h-3 !bg-violet-500/60 !border-2 !border-background"
          />
        )}

        <div
          className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
          onClick={() => !isLocked && setExpanded((v) => !v)}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white",
                isLocked ? "bg-muted-foreground/30" : colorClass
              )}
            >
              {nodeNum}
            </div>
            <div>
              <p className={cn("text-sm font-semibold", isLocked ? "text-muted-foreground" : "text-foreground")}>
                {title}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isLast && onReset && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground ml-4"
                onClick={(e) => {
                  e.stopPropagation();
                  onReset();
                }}
                disabled={resetDisabled}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                重置
                {resetNodeType && <CreditsBadge nodeType={resetNodeType} imageCount={resetImageCount} />}
              </Button>
            )}
            <Badge variant={statusBadge.variant} className="text-xs">
              {statusBadge.icon && (
                <statusBadge.icon className={cn("mr-1 h-3 w-3", isGenerating && "animate-spin")} />
              )}
              {statusBadge.label}
            </Badge>
            {!isLocked && (
              expanded
                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {expanded && !isLocked && (
          <div className="px-4 pb-4 pt-0 space-y-3">
            {children}
          </div>
        )}

        {isLocked && (
          <div className="px-4 pb-3 pt-0">
            <p className="text-xs text-muted-foreground/60">完成上一个节点后解锁</p>
          </div>
        )}

        {!isLast && (
          <Handle
            type="source"
            position={Position.Bottom}
            id="dx-out"
            className="!w-3 !h-3 !bg-violet-500/60 !border-2 !border-background"
          />
        )}
      </div>
    );
  }
);
DXNodeBase.displayName = "DXNodeBase";
