import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { Coins } from "lucide-react";

export function CreditsBalanceBadge() {
  const balance = useQuery(api.credits.getMyBalance);

  if (balance === undefined) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Coins className="h-3 w-3" />
        <span className="h-3 w-6 bg-muted animate-pulse rounded" />
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-500 font-medium">
      <Coins className="h-3 w-3" />
      {balance.balance}
    </span>
  );
}
