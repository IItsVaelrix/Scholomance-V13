import React, { Suspense, useEffect } from "react";
import { useOutlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Navigation from "./components/Navigation/Navigation.jsx";
import AtmosphereSync from "./components/AtmosphereSync.jsx";
import GameBackgroundMusicSync from "./components/GameBackgroundMusicSync.jsx";
import GameAudioForgeSync from "./components/GameAudioForgeSync.jsx";
import GameObeliskElectricSync from "./components/GameObeliskElectricSync.jsx";
import { SongProvider } from "./hooks/useCurrentSong.jsx";
import { CODExProvider } from "./hooks/useCODExPipeline.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { useAuth } from "./hooks/useAuth.jsx";
import { ProgressionProvider } from "./context/ProgressionContext.jsx";
import { ScrollsProvider } from "./context/ScrollsContext.jsx";
import { PredictorProvider } from "./hooks/usePredictor.jsx";
import { usePrefersReducedMotion } from "./hooks/usePrefersReducedMotion.js";
import { MotionInspector } from "./ui/animation/components/MotionInspector";
import { MotionDebugBadge } from "./ui/animation/components/MotionDebugBadge";
import { InventoryOverlay } from "./ui/inventory/InventoryOverlay.jsx";
import { CharacterCompendiumOverlay } from "./ui/character/CharacterCompendiumOverlay.jsx";

const fullMotionVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

const reducedMotionVariants = {
  initial: {},
  animate: {},
  exit: {},
};

function AuthScopedProviders({ children }) {
  const { user, isLoading } = useAuth();
  const authReady = !isLoading;
  const isAuthenticated = Boolean(user);

  return (
    <ProgressionProvider authReady={authReady} isAuthenticated={isAuthenticated}>
      <ScrollsProvider>
        {children}
      </ScrollsProvider>
    </ProgressionProvider>
  );
}

export default function App() {
  const location = useLocation();
  const currentOutlet = useOutlet();
  const prefersReducedMotion = usePrefersReducedMotion();
  const shouldReduceMotion = prefersReducedMotion;
  const pageVariants = shouldReduceMotion ? reducedMotionVariants : fullMotionVariants;

  // Remove navigation bar only on the battle/combat page so the grid can fill the full viewport.
  const isBattlePage = location.pathname === '/combat' || location.pathname.startsWith('/combat/');

  useEffect(() => {
    const main = document.getElementById("main-content");
    if (main) {
      if (!main.hasAttribute("tabindex")) {
        main.setAttribute("tabindex", "-1");
      }
      main.focus({ preventScroll: true });
    }
  }, [location.pathname]);

  return (
    <CODExProvider>
      <PredictorProvider>
        <AuthProvider>
          <AuthScopedProviders>
            <SongProvider>
              <AtmosphereSync />
              <GameBackgroundMusicSync />
              <GameAudioForgeSync />
              <GameObeliskElectricSync />
              {/* Hide global decorative layers on battle page so only the pure grid is visible */}
              {!isBattlePage && (
                <>
                  <div className="aurora-background" aria-hidden="true" />
                  <div className="vignette" aria-hidden="true" />
                  <div className="scanlines" aria-hidden="true" />
                </>
              )}
              
              {/* Animation AMP Debug Tooling (Phase 4) */}
              {import.meta.env.DEV && !isBattlePage && (
                <>
                  <MotionInspector />
                  <MotionDebugBadge />
                </>
              )}

              <InventoryOverlay />
              <CharacterCompendiumOverlay />

              <div className="page-container">
                {!isBattlePage && (
                  <a href="#main-content" className="skip-link">
                    Skip to main content
                  </a>
                )}
                {!isBattlePage && <Navigation />}
                <div className="page-body">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.main
                      key={location.pathname}
                      id="main-content"
                      className="page-content"
                      variants={pageVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.12, ease: [0.23, 1, 0.32, 1] }}
                    >
                      <Suspense fallback={null}>
                        {currentOutlet && React.cloneElement(currentOutlet, { key: location.pathname })}
                      </Suspense>
                    </motion.main>
                  </AnimatePresence>
                </div>
              </div>
            </SongProvider>
          </AuthScopedProviders>
        </AuthProvider>
      </PredictorProvider>
    </CODExProvider>
  );
}
