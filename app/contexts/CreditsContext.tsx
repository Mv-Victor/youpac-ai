import { createContext, useContext, useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";

interface CreditsContextValue {
  balance: number | undefined;
  nodeCosts: Record<string, number>;
  isLoading: boolean;
  autopilotEnabled: boolean;
  setAutopilotEnabled: (enabled: boolean, error?: string) => void;
  autopilotError: string | null;
  clearAutopilotError: () => void;
}

const CreditsContext = createContext<CreditsContextValue>({
  balance: undefined,
  nodeCosts: {},
  isLoading: true,
  autopilotEnabled: false,
  setAutopilotEnabled: () => {},
  autopilotError: null,
  clearAutopilotError: () => {},
});

export function CreditsProvider({ children, projectId }: { children: React.ReactNode; projectId?: string }) {
  const balanceData = useQuery(api.credits.getMyBalance);
  const configs = useQuery(api.credits.getAllNodeCreditConfigs);

  const dxApi = api as any;
  const dbAutopilot = useQuery(
    projectId ? dxApi.autopilot.getProjectAutopilot : "skip",
    projectId ? { projectId: projectId as Id<"dreamXProjects"> } : undefined
  );
  const setAutopilotMutation = useMutation(dxApi.autopilot.setAutopilot);

  const [autopilotLocalOverride, setAutopilotLocalOverride] = useState<boolean | null>(null);
  const [autopilotError, setAutopilotError] = useState<string | null>(null);

  // DB 值变化后清除乐观更新
  useEffect(() => {
    if (dbAutopilot !== undefined) {
      setAutopilotLocalOverride(null);
    }
  }, [dbAutopilot]);

  const autopilotEnabled = autopilotLocalOverride !== null
    ? autopilotLocalOverride
    : (dbAutopilot === true);

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

  const setAutopilotEnabled = (enabled: boolean, error?: string) => {
    setAutopilotLocalOverride(enabled);
    if (!enabled && error) {
      setAutopilotError(error);
    }
    if (enabled) {
      setAutopilotError(null);
    }
    if (projectId) {
      setAutopilotMutation({ projectId: projectId as Id<"dreamXProjects">, enabled }).catch(() => {
        setAutopilotLocalOverride(null);
      });
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
