import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Eye,
  Headphones,
  BookOpen,
  Activity,
  Menu,
  ChevronRight,
  User,
  LogOut,
  MessageSquare,
} from "lucide-react";
import { LINKS, INTERNAL_MODULES } from "../../data/library";
import { useAuth } from "../../hooks/useAuth.jsx";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion.js";
import { preloadRoute } from "../../lib/routes.js";
import { triggerHapticPulse, UI_HAPTICS } from "../../lib/platform/haptics.js";
import { isAdminUser } from "../../lib/admin.js";

const ICON_MAP = {
  watch: Eye,
  listen: Headphones,
  read: BookOpen,
  visualiser: Activity,
  oracle: MessageSquare,
};

const ROUTE_COPY = {
  watch: "Witness the live arena and current ritual signal.",
  listen: "Tune stations, broadcasts, and ambient transmission.",
  read: "Compose scrolls and inspect their hidden anatomy.",
  visualiser: "Kinetic lyric visualiser - phoneme school colors, beat sync.",
  oracle: "Consult the Oracle for Lyrical Analysis.",
  blog: "Read transmissions, skills, verdicts, and whitepapers.",
  pixelbrain: "Neural network visualization and metadata mapping.",
  career: "Transmute professional experience into high-acuity sigils.",
  collab: "Coordinate agent work and active pipelines.",
  wand: "Wield the Fairly Odd Wand formula system & designer.",
  "qbit-world": "Enter the Level 5 QBIT world loop.",
  profile: "Review account standing and inner-sanctum access.",
  auth: "Enter the portal and secure your chamber.",
  "photonic-bridge": "Diagnostic interface for the Photonic Quantization Bridge.",
  "time-lab": "Experiment with video rendering and timeline muxing.",
};

export default function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [navigatingPath, setNavigatingPath] = useState(null);
  const navTimeoutRef = useRef(null);
  const hoverTimeoutRef = useRef(null);
  const { user, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  const IS_PROD = typeof import.meta !== "undefined" && import.meta.env.PROD === true;
  const isInternalAdmin = isAdminUser(user);

  const allNavLinks = useMemo(() => [
    ...LINKS,
    ...(!IS_PROD || isInternalAdmin ? INTERNAL_MODULES : []),
  ], [IS_PROD, isInternalAdmin]);

  const primaryLinks = useMemo(
    () => LINKS.filter((l) => ICON_MAP[l.id]),
    [],
  );

  const allLinks = useMemo(() => [
    ...allNavLinks,
    {
      id: user ? "profile" : "auth",
      path: user ? "/profile" : "/auth",
      label: user ? user.username : "Portal",
    },
  ], [allNavLinks, user]);

  const currentPage = useMemo(
    () => allLinks.find((l) => location.pathname === l.path || location.pathname.startsWith(l.path + "/")),
    [allLinks, location.pathname],
  );

  const isActiveLink = useCallback(
    (path) => location.pathname === path || location.pathname.startsWith(path + "/"),
    [location.pathname],
  );

  const handlePrefetchStart = useCallback((path) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      preloadRoute(path);
    }, 75);
  }, []);

  const handlePrefetchCancel = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  }, []);

  const handleNav = useCallback(async (path) => {
    if (location.pathname === path) {
      setIsMenuOpen(false);
      setNavigatingPath(null);
      return;
    }
    setNavigatingPath(path);
    try {
      await preloadRoute(path);
    } catch (error) {
      console.error("Failed to preload route:", error);
    }
    if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
    navigate(path);
  }, [navigate, location.pathname]);

  useEffect(() => {
    if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
    setNavigatingPath(null);
    setIsMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isMenuOpen]);

  useEffect(() => {
    const navTimeout = navTimeoutRef.current;
    const hoverTimeout = hoverTimeoutRef.current;
    return () => {
      if (navTimeout) clearTimeout(navTimeout);
      if (hoverTimeout) clearTimeout(hoverTimeout);
    };
  }, []);

  const handleToggle = useCallback(() => {
    triggerHapticPulse(UI_HAPTICS.MEDIUM);
    setIsMenuOpen((prev) => !prev);
    setNavigatingPath(null);
  }, []);

  const handleRailNavClick = useCallback((e, linkPath) => {
    e.preventDefault();
    triggerHapticPulse(UI_HAPTICS.TICK);
    if (navigatingPath) return;
    handleNav(linkPath);
  }, [navigatingPath, handleNav]);

  const handleMobileNavClick = useCallback((e, linkPath) => {
    e.preventDefault();
    triggerHapticPulse(UI_HAPTICS.TICK);
    if (navigatingPath) return;
    handleNav(linkPath);
  }, [navigatingPath, handleNav]);

  const handleLogout = useCallback(async () => {
    if (!user || isLoggingOut) return;
    triggerHapticPulse(UI_HAPTICS.MEDIUM);
    setIsLoggingOut(true);
    setNavigatingPath(null);
    try {
      await logout();
      setIsMenuOpen(false);
      navigate("/auth");
    } finally {
      setIsLoggingOut(false);
    }
  }, [isLoggingOut, logout, navigate, user]);

  const overlayTransition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.26, ease: "easeOut" };

  return (
    <>
      <nav className="scholomance-rail" role="navigation" aria-label="Primary navigation">
        <div className="rail-left">
          <button
            className="rail-brand"
            onClick={handleToggle}
            aria-label={isMenuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={isMenuOpen}
            aria-controls="nav-mobile-menu"
            type="button"
          >
            <span className="rail-brand-glyph" aria-hidden="true">S</span>
            <span className="rail-brand-label">Scholomance</span>
          </button>

          {currentPage && (
            <div className="rail-breadcrumb" aria-label="Current page">
              <ChevronRight size={12} aria-hidden="true" className="rail-breadcrumb-sep" />
              <span className="rail-breadcrumb-label">{currentPage.label}</span>
            </div>
          )}
        </div>

        <div className="rail-center">
          {primaryLinks.map((link) => {
            const Icon = ICON_MAP[link.id];
            const active = isActiveLink(link.path);
            const isSelected = navigatingPath === link.path;
            return (
              <NavLink
                key={link.id}
                to={link.path}
                onClick={(e) => handleRailNavClick(e, link.path)}
                onMouseEnter={() => handlePrefetchStart(link.path)}
                onMouseLeave={handlePrefetchCancel}
                className={`rail-link${active ? " rail-link--active" : ""}${isSelected ? " rail-link--loading" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={15} aria-hidden="true" />
                <span className="rail-link-label">{link.label}</span>
              </NavLink>
            );
          })}
        </div>

        <div className="rail-right">
          {user && (
            <button
              className="rail-link rail-link--user rail-link--logout"
              onClick={handleLogout}
              disabled={isLoggingOut}
              aria-label={isLoggingOut ? "Signing out" : "Sign out"}
              title={isLoggingOut ? "Signing out" : "Sign out"}
              type="button"
            >
              <LogOut size={15} aria-hidden="true" />
            </button>
          )}

          <NavLink
            to={user ? "/profile" : "/auth"}
            onClick={(e) => handleRailNavClick(e, user ? "/profile" : "/auth")}
            className={`rail-link rail-link--user${isActiveLink(user ? "/profile" : "/auth") ? " rail-link--active" : ""}`}
            aria-label={user ? `Profile: ${user.username}` : "Sign in"}
          >
            <User size={15} aria-hidden="true" />
          </NavLink>

          <button
            className="rail-menu-btn"
            onClick={handleToggle}
            aria-label={isMenuOpen ? "Close navigation" : "Open all chambers"}
            aria-expanded={isMenuOpen}
            aria-controls="nav-mobile-menu"
            type="button"
          >
            <Menu size={16} aria-hidden="true" />
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            id="nav-mobile-menu"
            className="nav-mobile-overlay"
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0 }}
            transition={overlayTransition}
          >
            <motion.div
              className="nav-mobile-shell"
              initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
              transition={overlayTransition}
            >
              <div className="nav-mobile-header">
                <p className="nav-mobile-eyebrow">Wayfinding</p>
                <h2 className="nav-mobile-title">Traverse the Scholomance</h2>
                <p className="nav-mobile-copy">
                  Move between chambers without dropping the ritual thread or losing your place.
                </p>
              </div>

              <div className="nav-mobile-links">
                {allLinks.map((l, i) => {
                  const isSelected = navigatingPath === l.path;
                  const isOther = navigatingPath && !isSelected;
                  const isActive = isActiveLink(l.path);
                  return (
                    <motion.div
                      key={l.id}
                      initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
                      animate={{
                        opacity: isOther ? 0.35 : 1,
                        y: 0,
                        scale: isSelected && !prefersReducedMotion ? 1.02 : 1,
                      }}
                      transition={{
                        delay: navigatingPath || prefersReducedMotion ? 0 : i * 0.04,
                        duration: prefersReducedMotion ? 0 : 0.24,
                        ease: "easeOut",
                      }}
                    >
                      <NavLink
                        to={l.path}
                        onClick={(e) => handleMobileNavClick(e, l.path)}
                        onTouchStart={() => handlePrefetchStart(l.path)}
                        onTouchMove={handlePrefetchCancel}
                        onTouchEnd={handlePrefetchCancel}
                        onTouchCancel={handlePrefetchCancel}
                        onMouseEnter={() => handlePrefetchStart(l.path)}
                        onMouseLeave={handlePrefetchCancel}
                        className={`nav-mobile-link${isActive ? " active" : ""}${isSelected ? " nav-mobile-link--selected" : ""}`}
                      >
                        <span className="nav-mobile-link-copy">
                          <span className="nav-mobile-link-label">{l.label}</span>
                          <span className="nav-mobile-link-meta">
                            {ROUTE_COPY[l.id] || "Open chamber."}
                          </span>
                        </span>
                        <span className="nav-mobile-link-state">
                          {isSelected ? "Opening" : isActive ? "Current" : "Open"}
                        </span>
                        {isSelected && (
                          <motion.span
                            className="nav-mobile-link__glow"
                            initial={{ opacity: 0, scale: 0.75 }}
                            animate={{ opacity: 1, scale: 1.2 }}
                            transition={overlayTransition}
                            aria-hidden="true"
                          />
                        )}
                      </NavLink>
                    </motion.div>
                  );
                })}
                {user && (
                  <motion.button
                    type="button"
                    className="nav-mobile-link nav-mobile-link--button nav-mobile-link--logout"
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
                    animate={{ opacity: isLoggingOut ? 0.7 : 1, y: 0 }}
                    transition={{
                      delay: navigatingPath || prefersReducedMotion ? 0 : allLinks.length * 0.04,
                      duration: prefersReducedMotion ? 0 : 0.24,
                      ease: "easeOut",
                    }}
                  >
                    <span className="nav-mobile-link-copy">
                      <span className="nav-mobile-link-label">Sign Out</span>
                      <span className="nav-mobile-link-meta">{user.email}</span>
                    </span>
                    <span className="nav-mobile-link-state">
                      {isLoggingOut ? "Leaving" : "Exit"}
                    </span>
                  </motion.button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
