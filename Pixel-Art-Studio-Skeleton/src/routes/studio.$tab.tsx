import { createFileRoute, Navigate } from "@tanstack/react-router";
import { PixelBrainStudio } from "@/components/studio/pixelbrain/PixelBrainStudio";
import { isStudioTab } from "@/components/studio/pixelbrain/studio-tabs.js";

export const Route = createFileRoute("/studio/$tab")({ component: StudioTabRoute });

function StudioTabRoute() {
  const { tab } = Route.useParams();
  const navigate = Route.useNavigate();
  if (!isStudioTab(tab)) {
    return <Navigate to="/studio/$tab" params={{ tab: "foundry" }} replace />;
  }
  return (
    <PixelBrainStudio
      activeTab={tab}
      onTabChange={(next) => navigate({ to: "/studio/$tab", params: { tab: next } })}
    />
  );
}
