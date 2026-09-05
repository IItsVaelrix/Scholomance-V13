import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/studio/")({ component: StudioIndex });

function StudioIndex() {
  return <Navigate to="/studio/$tab" params={{ tab: "foundry" }} replace />;
}
