import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import LandingPage from "./pages/Landing/LandingPage.jsx";
import BytecodeVisualiserPage from "./pages/Visualiser/BytecodeVisualiserPage.tsx";
import ResonanceCardPage from "./pages/Visualiser/ResonanceCard.tsx";
import "./lib/config/zod.config.js";
import App from "./App.jsx";
import "./index.css";
import "./kits/channel-zero-ui-kit/tokens/channel-zero.tokens.css";
import "./kits/channel-zero-ui-kit/styles/channel-zero.css";
import ErrorBoundary from "./components/shared/ErrorBoundary";
import RouteErrorPage from "./components/shared/RouteErrorPage.jsx";
import { ThemeProvider } from "./hooks/useTheme.jsx";
import {
  WatchPage,
  ListenPage,
  ReadPage,
  GrimoireSpread,
  AuthPage,
  CollabPage,
  ProfilePage,
  CombatPage,
  NexusPage,
  PixelBrainPage,
  CareerPage,
  WandPage,
  DivWandPage,
  QbitWorldPage,
  PhotonicBridgeLab,
  StudioUpload,
  ActorForgeLab,
  IsoMapSandbox,
  BlogIndexPage,
  BlogArticlePage,
  VisualizerReleasePage,
  OraclePage,
  ScholoTimeLabPage,
  PAGE_COMPONENTS,
} from "./lib/routes.js";

import { AdminRoute } from "./components/AdminRoute.jsx";

// DEV-ONLY de-risking spike (PDR-2026-06-04-GODOT-WASM-COMBAT-SPIKE).
// The guard `import.meta.env.DEV` is statically false in production, so the route is
// NEVER registered in prod (devSpikeRoutes stays []) - unreachable, never rendered,
// its lazy chunk never fetched. (Vite still lists the chunk name in its dep-map array,
// but no code path loads it.) Not wired into navigation; reachable only at
// /combat-godot-spike during `npm run dev`.
let devSpikeRoutes = [];
if (import.meta.env.DEV) {
  // Godot WASM spike retained as the documented fallback path. The Phaser 4 spike was
  // retired once its verdict (uplift = go) folded into the real ResonanceScene on 2026-06-05.
  const CombatGodotSpike = React.lazy(() =>
    import("./pages/CombatGodotSpike/CombatGodotSpike.jsx")
  );
  const ImmuneHarness = React.lazy(() =>
    import("./pages/_dev/ImmuneHarness.jsx")
  );
  const LexicalHarness = React.lazy(() =>
    import("./pages/_dev/LexicalHarness.jsx")
  );
  devSpikeRoutes = [
    {
      path: "combat-godot-spike",
      element: (
        <React.Suspense fallback={null}>
          <CombatGodotSpike />
        </React.Suspense>
      ),
    },
    {
      // TrueSight Immune Probe harness (SPATIAL-IMMUNE-DIAGNOSTICS.md).
      path: "__immune/truesight",
      element: (
        <React.Suspense fallback={null}>
          <ImmuneHarness />
        </React.Suspense>
      ),
    },
    {
      // Lexical editor typing-diagnosis harness.
      path: "__immune/lexical",
      element: (
        <React.Suspense fallback={null}>
          <LexicalHarness />
        </React.Suspense>
      ),
    },
  ];
}

const router = createBrowserRouter([
  {
    path: "/",
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <LandingPage /> },
      ...devSpikeRoutes,
      {
        element: <App />,
        children: [
          { path: "watch", element: <WatchPage /> },
          { path: "listen", element: <ListenPage /> },
          { path: "grimoire/:trackId", element: <GrimoireSpread /> },
          { path: "read", element: <ReadPage /> },
          { path: "auth", element: <AuthPage /> },
          { path: "profile", element: <ProfilePage /> },
          { path: "combat", element: <CombatPage /> },
          { path: "nexus", element: <NexusPage /> },
          { path: "collab", element: <AdminRoute><CollabPage /></AdminRoute> },
          { path: "pixelbrain", element: <AdminRoute><PixelBrainPage /></AdminRoute> },
          { path: "career", element: <AdminRoute><CareerPage /></AdminRoute> },
          { path: "wand", element: <AdminRoute><WandPage /></AdminRoute> },
          { path: "div-wand", element: <AdminRoute><DivWandPage /></AdminRoute> },
          { path: "qbit-world", element: <AdminRoute><QbitWorldPage /></AdminRoute> },
          { path: "internal/photonic-bridge", element: <AdminRoute><PhotonicBridgeLab /></AdminRoute> },
          { path: "internal/studio", element: <AdminRoute><StudioUpload /></AdminRoute> },
          { path: "internal/pixel-lotus/actor-forge", element: <AdminRoute><ActorForgeLab /></AdminRoute> },
          { path: "internal/pixel-lotus/iso-map-sandbox", element: <AdminRoute><IsoMapSandbox /></AdminRoute> },
          { path: "internal/time-lab", element: <AdminRoute><ScholoTimeLabPage /></AdminRoute> },
          { path: "blog", element: <BlogIndexPage /> },
          { path: "blog/:slug", element: <BlogArticlePage /> },
          { path: "visualiser", element: <BytecodeVisualiserPage /> },
          { path: "card", element: <ResonanceCardPage /> },
          { path: "release", element: <VisualizerReleasePage /> },
          { path: "oracle", element: <OraclePage /> },
        ],
      },
    ],
  },
]);


ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <ErrorBoundary>
        <RouterProvider router={router} />
      </ErrorBoundary>
    </ThemeProvider>
  </React.StrictMode>
);
