import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { useCredits } from "~/contexts/CreditsContext";

interface CreditsBadgeProps {
  nodeType: string;
  imageCount?: number;
  /** TTS 节点：传入总字数，积分 = 3 + max(0, ceil((chars-50)/20)) */
  charCount?: number;
}

export function CreditsBadge({ nodeType, imageCount = 0, charCount }: CreditsBadgeProps) {
  const { nodeCosts, isLoading } = useCredits();

  if (isLoading) {
    return <span className="inline-block h-4 w-12 bg-muted animate-pulse rounded" />;
  }

  const baseCost = nodeCosts[nodeType];
  if (baseCost === undefined) return null;

  const imageBonus = imageCount > 4 ? Math.ceil((imageCount - 4) / 2) : 0;
  const charBonus = charCount !== undefined && charCount > 50
    ? Math.ceil((charCount - 50) / 20) : 0;
  const totalCost = baseCost + imageBonus + charBonus;
  const hasImageBonus = imageBonus > 0;
  const hasCharBonus = charBonus > 0;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center text-xs font-medium text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5 ml-1 cursor-default select-none">
            {totalCost} 积分
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-0.5">
            <div>基础积分：{baseCost}</div>
            {hasImageBonus && <div>图片附加：{imageBonus}（{imageCount} 张，超出 {imageCount - 4} 张）</div>}
            {hasCharBonus && charCount !== undefined && (
              <div>字数附加：{charBonus}（{charCount} 字，超出 {charCount - 50} 字）</div>
            )}
            <div className="font-semibold">合计：{totalCost} 积分</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
