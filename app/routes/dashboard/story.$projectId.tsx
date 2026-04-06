import { useParams } from "react-router";

export default function StoryCanvas() {
  const { projectId } = useParams();

  return (
    <div className="flex h-screen items-center justify-center text-muted-foreground">
      <p>Story Canvas — 敬请期待 ({projectId})</p>
    </div>
  );
}
