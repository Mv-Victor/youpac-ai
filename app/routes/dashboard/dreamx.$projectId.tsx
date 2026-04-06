import { lazy, Suspense } from "react";
import { useParams } from "react-router";
import type { Id } from "convex/_generated/dataModel";

const DreamXCanvas = lazy(() => import("~/components/dreamx-canvas/DreamXCanvas"));

export function meta() {
  return [
    { title: "DreamX · 剪映工程生成" },
    { name: "description", content: "AI 驱动的剪映工程生成流水线" },
  ];
}

export default function DreamXRoute() {
  const { projectId } = useParams();

  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            加载画布中…
          </div>
        </div>
      }
    >
      <DreamXCanvas projectId={projectId as Id<"dreamXProjects">} />
    </Suspense>
  );
}
