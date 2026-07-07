import { lazyWithRetry } from "./lazyWithRetry.js";
import { isAdminUser } from "./admin.js";

export const WatchPage = lazyWithRetry(() => import("../pages/Watch/WatchPage.jsx"), "watch-page");
export const ListenPage = lazyWithRetry(() => import("../pages/Listen/ListenPage"), "listen-page");
export const ReadPage = lazyWithRetry(() => import("../pages/Read/ReadPage.jsx"), "read-page");
export const GrimoireSpread = lazyWithRetry(() => import("../pages/Grimoire/GrimoireSpread"), "grimoire-spread");
export const AuthPage = lazyWithRetry(() => import("../pages/Auth/AuthPage.jsx"), "auth-page");
export const CollabPage = lazyWithRetry(() => import("../pages/Collab/CollabPage.jsx"), "collab-page");
export const ProfilePage = lazyWithRetry(() => import("../pages/Profile/ProfilePage.jsx"), "profile-page");
export const CombatPage = lazyWithRetry(() => import("../pages/Combat/CombatPage.jsx"), "combat-page");
export const NexusPage = lazyWithRetry(() => import("../pages/Nexus/NexusPage.jsx"), "nexus-page");
export const PixelBrainPage = lazyWithRetry(() => import("../pages/PixelBrain/PixelBrainPage.jsx"), "pixelbrain-page");
export const CareerPage = lazyWithRetry(() => import("../pages/Career/CareerPage"), "career-page");
export const WandPage = lazyWithRetry(() => import("../pages/Wand/WandPage.jsx"), "wand-page");
export const WandGraphPage = lazyWithRetry(() => import("../pages/Wand/WandGraphPage.jsx"), "wand-graph-page");
export const DivWandPage = lazyWithRetry(() => import("../pages/DivWand/DivWandPage.jsx"), "div-wand-page");
export const QbitWorldPage = lazyWithRetry(() => import("../pages/QbitWorld/QbitWorldPage.jsx"), "qbit-world-page");

export const PhotonicBridgeLab = lazyWithRetry(() => import("../pages/internal/photonic-bridge/PhotonicBridgeLab.jsx"), "photonic-bridge");
export const StudioUpload = lazyWithRetry(() => import("../pages/internal/Studio/StudioUpload.jsx"), "studio-upload");
export const ActorForgeLab = lazyWithRetry(() => import("../pages/internal/pixel-lotus/ActorForgeLab.tsx"), "actor-forge-lab");
export const IsoMapSandbox = lazyWithRetry(() => import("../pages/internal/pixel-lotus/IsoMapSandbox.tsx"), "iso-map-sandbox");
export const TileForgeLab = lazyWithRetry(() => import("../pages/internal/pixel-lotus/TileForgeLab.jsx"), "tile-forge-lab");
export const ScholoTimeLabPage = lazyWithRetry(() => import("../pages/internal/ScholoTimeLab/ScholoTimeLab.jsx"), "scholo-time-lab");

export const BlogIndexPage = lazyWithRetry(() => import("../pages/Blog/BlogIndexPage"), "blog-index-page");
export const BlogArticlePage = lazyWithRetry(() => import("../pages/Blog/ArticlePage"), "blog-article-page");
export const VisualizerReleasePage = lazyWithRetry(() => import("../pages/VisualizerRelease/VisualizerReleasePage"), "visualizer-release-page");
export const OraclePage = lazyWithRetry(() => import("../pages/Oracle/OraclePage.jsx"), "oracle-page");

const IS_PROD = typeof import.meta !== "undefined" && import.meta.env.PROD;
const INTERNAL_MODULES = ["/collab", "/pixelbrain", "/career", "/wand", "/wand/graph", "/div-wand", "/qbit-world", "/internal/photonic-bridge", "/internal/studio", "/internal/pixel-lotus/actor-forge", "/internal/pixel-lotus/iso-map-sandbox", "/internal/pixel-lotus/tile-forge", "/internal/time-lab"];

export const ALL_COMPONENTS = {
  "/watch": WatchPage,
  "/listen": ListenPage,
  "/read": ReadPage,
  "/auth": AuthPage,
  "/collab": CollabPage,
  "/profile": ProfilePage,
  "/combat": CombatPage,
  "/nexus": NexusPage,
  "/pixelbrain": PixelBrainPage,
  "/career": CareerPage,
  "/wand": WandPage,
  "/wand/graph": WandGraphPage,
  "/div-wand": DivWandPage,
  "/qbit-world": QbitWorldPage,
  "/internal/photonic-bridge": PhotonicBridgeLab,
  "/internal/studio": StudioUpload,
  "/internal/pixel-lotus/actor-forge": ActorForgeLab,
  "/internal/pixel-lotus/iso-map-sandbox": IsoMapSandbox,
  "/internal/pixel-lotus/tile-forge": TileForgeLab,
  "/internal/time-lab": ScholoTimeLabPage,
  "/blog": BlogIndexPage,
  "/blog/:slug": BlogArticlePage,
  "/release": VisualizerReleasePage,
  "/oracle": OraclePage,
};

/**
 * PAGE_COMPONENTS is now a function that accepts the current user to resolve 
 * available routes dynamically based on environment and role.
 */
export function getAvailablePageComponents(user) {
  const IS_PROD = typeof import.meta !== "undefined" && import.meta.env.PROD;
  const isInternalAdmin = isAdminUser(user);
  
  return Object.fromEntries(
    Object.entries(ALL_COMPONENTS).filter(([path]) => {
      // Internal modules are gated in production for non-admins
      if (IS_PROD && INTERNAL_MODULES.includes(path)) {
        return isInternalAdmin;
      }
      return true;
    })
  );
}

// Backward compatibility for static usages (defaults to all-access if not in PROD)
const IS_PROD_STATIC = typeof import.meta !== "undefined" && import.meta.env.PROD;
export const PAGE_COMPONENTS = Object.fromEntries(
  Object.entries(ALL_COMPONENTS).filter(([path]) => {
    if (IS_PROD_STATIC && INTERNAL_MODULES.includes(path)) {
      return false; // Default to hidden in production static view
    }
    return true;
  })
);

export function preloadRoute(path) {
  // Use ALL_COMPONENTS for preloading so hover prefetch works for admins in PROD
  const component = ALL_COMPONENTS[path];
  if (component && typeof component.preload === "function") {
    return component.preload();
  }
  return Promise.resolve();
}
