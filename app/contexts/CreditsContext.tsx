import { createContext, useContext, useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { toast } from "sonner";

interface CreditsContextValue {
  balance: number | undefined;
  nodeCosts: Record<string, number>;
  isLoading: boolean;
  autopilotEnabled: boolean;
  autopilotFailed: boolean;
  setAutopilotEnabled: (enabled: boolean, error?: string) => void;
  autopilotError: string | null;
  clearAutopilotError: () => void;
}

const CreditsContext = createContext<CreditsContextValue>({
  balance: undefined,
  nodeCosts: {},
  isLoading: true,
  autopilotEnabled: false,
  autopilotFailed: false,
  setAutopilotEnabled: () => {},
  autopilotError: null,
  clearAutopilotError: () => {},
});

export function CreditsProvider({ children, projectId }: { children: React.ReactNode; projectId?: string }) {
  const balanceData = useQuery(api.credits.getMyBalance);
  const configs = useQuery(api.credits.getAllNodeCreditConfigs);

  const dxApi = api as any;
  const autopilotStatus = useQuery(
    projectId ? dxApi.autopilot.getProjectAutopilotStatus : "skip",
    projectId ? { projectId: projectId as Id<"dreamXProjects"> } : undefined
  );
  const enableAutopilotMutation = useMutation(dxApi.autopilot.enableAutopilot);
  const disableAutopilotMutation = useMutation(dxApi.autopilot.disableAutopilot);

  const [autopilotLocalOverride, setAutopilotLocalOverride] = useState<boolean | null>(null);
  const [autopilotError, setAutopilotError] = useState<string | null>(null);

  const prevFailedRef = useRef<boolean>(false);

  useEffect(() => {
    if (autopilotStatus) {
      const currentFailed = autopilotStatus.failed;
      if (currentFailed && !prevFailedRef.current) {
        toast.error("AI托管失败", {
          description: "托管过程中遇到错误，请检查项目状态后重试",
        });
      }
      prevFailedRef.current = currentFailed;
    }
  }, [autopilotStatus]);

  useEffect(() => {
    if (autopilotStatus !== undefined) {
      setAutopilotLocalOverride(null);
    }
  }, [autopilotStatus]);

  const autopilotEnabled = autopilotLocalOverride !== null
    ? autopilotLocalOverride
    : (autopilotStatus?.enabled ?? false);

  const autopilotFailed = autopilotStatus?.failed ?? false;

  const DEFAULT_NODE_COSTS: Record<string, number> = {
    mediaUpload: 2,
    memeInsert: 2,
    bgmRecall: 3,
    storyboard: 3,
    ttsSelection: 3,
    capcutBuild: 1,
  };

  const nodeCosts: Record<string, number> = {};
  if (configs && configs.length > 0) {
    for (const c of configs) {
      if (c.isEnabled) nodeCosts[c.nodeType] = c.baseCost;
    }
  } else if (configs !== undefined) {
    Object.assign(nodeCosts, DEFAULT_NODE_COSTS);
  }

  const isLoading = balanceData === undefined || configs === undefined;

  const setAutopilotEnabled = async (enabled: boolean, error?: string) => {
    setAutopilotLocalOverride(enabled);
    if (!enabled && error) {
      setAutopilotError(error);
    }
    if (enabled) {
      setAutopilotError(null);
    }
    if (projectId) {
      try {
        if (enabled) {
          await enableAutopilotMutation({ projectId: projectId as Id<"dreamXProjects"> });
        } else {
          await disableAutopilotMutation({ projectId: projectId as Id<"dreamXProjects"> });
        }
      } catch (e: any) {
        setAutopilotLocalOverride(null);
        toast.error(e?.message ?? "托管操作失败");
      }
    }
  };

  const clearAutopilotError = () => setAutopilotError(null);

  return (
    <CreditsContext.Provider
      value={{
        balance: balanceData?.balance,
        nodeCosts,
        isLoading,
        autopilotEnabled,
        autopilotFailed,
        setAutopilotEnabled,
        autopilotError,
        clearAutopilotError,
      }}
    >
      {children}
    </CreditsContext.Provider>
  );
}

export function useCredits() {
  return useContext(CreditsContext);
}
