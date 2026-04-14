import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import { toast } from "sonner";
import { Loader2, Coins, Gift, History, Zap } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

function formatTransactionLabel(tx: {
  type: "redeem" | "consume";
  amount: number;
  description?: string;
  nodeType?: string;
}): { label: string; sign: string; colorClass: string } {
  if (tx.type === "redeem") {
    return {
      label: tx.description ?? "兑换积分",
      sign: `+${tx.amount}`,
      colorClass: "text-green-500",
    };
  }
  return {
    label: tx.description ?? "消耗积分",
    sign: `-${tx.amount}`,
    colorClass: "text-red-400",
  };
}

export default function CreditsPage() {
  const balance = useQuery(api.credits.getMyBalance);
  const transactions = useQuery(api.credits.getMyTransactions, {});
  const redeemCode = useMutation(api.credits.redeemCode);

  const [code, setCode] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);

  const handleRedeem = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;

    setIsRedeeming(true);
    try {
      const result = await redeemCode({ code: trimmed });
      toast.success(`兑换成功！获得 ${result.creditsAdded} 积分，当前余额 ${result.newBalance} 积分`);
      setCode("");
    } catch (err: any) {
      const msg = err?.message ?? "";
      if (msg.includes("CODE_NOT_FOUND")) {
        toast.error("兑换码不存在");
      } else if (msg.includes("CODE_ALREADY_USED")) {
        toast.error("兑换码已被使用");
      } else if (msg.includes("UNAUTHORIZED")) {
        toast.error("请先登录");
      } else {
        toast.error("兑换失败，请稍后重试");
      }
    } finally {
      setIsRedeeming(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-20 w-96 h-96 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-20 w-96 h-96 bg-gradient-to-tr from-primary/10 via-primary/5 to-transparent rounded-full blur-3xl" />
      </div>

      <div className="relative space-y-8 p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10">
            <Coins className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">积分中心</h1>
            <p className="text-muted-foreground">兑换积分码，查看余额与消耗记录</p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Zap className="h-4 w-4" />
                当前余额
              </CardTitle>
            </CardHeader>
            <CardContent>
              {balance === undefined || balance === null ? (
                <div className="h-10 w-24 bg-muted animate-pulse rounded" />
              ) : (
                <div className="text-4xl font-bold text-primary">{balance.balance}</div>
              )}
              <div className="text-xs text-muted-foreground mt-1">积分</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">累计兑换</CardTitle>
            </CardHeader>
            <CardContent>
              {balance === undefined || balance === null ? (
                <div className="h-8 w-16 bg-muted animate-pulse rounded" />
              ) : (
                <div className="text-2xl font-semibold text-green-500">{balance.totalRedeemed}</div>
              )}
              <div className="text-xs text-muted-foreground mt-1">积分</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">累计消耗</CardTitle>
            </CardHeader>
            <CardContent>
              {balance === undefined || balance === null ? (
                <div className="h-8 w-16 bg-muted animate-pulse rounded" />
              ) : (
                <div className="text-2xl font-semibold text-red-400">{balance.totalConsumed}</div>
              )}
              <div className="text-xs text-muted-foreground mt-1">积分</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-background/80 backdrop-blur">
                <Gift className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>兑换积分码</CardTitle>
                <CardDescription>输入兑换码获取积分（支持带连字符格式）</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                className="font-mono tracking-widest"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRedeem();
                }}
                disabled={isRedeeming}
              />
              <Button onClick={handleRedeem} disabled={isRedeeming || !code.trim()} className="shrink-0">
                {isRedeeming ? <Loader2 className="h-4 w-4 animate-spin" /> : "兑换"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-background/80 backdrop-blur">
                <History className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>积分记录</CardTitle>
                <CardDescription>最近 50 条积分变动记录</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {transactions === undefined ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">暂无积分记录</div>
            ) : (
              <div className="space-y-2">
                {transactions.map((tx) => {
                  const { label, sign, colorClass } = formatTransactionLabel(tx as any);
                  return (
                    <div
                      key={tx._id}
                      className="flex items-center justify-between rounded-lg border bg-card/50 px-4 py-3"
                    >
                      <div>
                        <div className="text-sm font-medium">{label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {formatRelativeTime(tx.createdAt)}
                        </div>
                      </div>
                      <div className={`text-sm font-semibold tabular-nums ${colorClass}`}>{sign}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
