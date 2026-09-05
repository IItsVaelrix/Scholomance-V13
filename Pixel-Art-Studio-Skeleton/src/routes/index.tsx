import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <Navigate to="/studio/$tab" params={{ tab: "foundry" }} replace />;
}
