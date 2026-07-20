import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import WatercolorDissolve from "./WatercolorDissolve.jsx";
import GrimoireTitle from "../../components/grimoire/GrimoireTitle.jsx";
import StormCanvas from "./StormCanvas.jsx";
import UpdateLedgerWindow from "./UpdateLedgerWindow.jsx";
import "./LandingPage.css";

const STORM_DEBUG = typeof window !== "undefined" && window.location.search.includes("debug");

export default function LandingPage() {
  const navigate = useNavigate();
  const [dissolving, setDissolving] = useState(false);
  const enteredRef = useRef(false);

  const handleEnter = useCallback(() => {
    if (enteredRef.current) return;
    enteredRef.current = true;
    setDissolving(true);
  }, []);

  const handleDissolveComplete = useCallback(() => {
    navigate("/read");
  }, [navigate]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleEnter();
    }
  }, [handleEnter]);

  return (
    <div className="portal-scene" aria-label="Scholomance - enter the portal">
      <StormCanvas className="portal-storm" variant="scene" intensity={1.4} debug={STORM_DEBUG} />

      <span className="portal-moon" aria-hidden="true">
        <span className="portal-moon-cloud portal-moon-cloud--slow" />
        <span className="portal-moon-cloud portal-moon-cloud--thin" />
      </span>
      <div className="landing-gates">
        <div className="landing-gate landing-gate--portal">
          <div className="portal-halo" aria-hidden="true" />
          <WatercolorDissolve dissolving={dissolving} onDissolveComplete={handleDissolveComplete}>
            <div
              className="portal-gate"
              role="button"
              tabIndex={0}
              aria-label="Enter Scholomance"
              onClick={handleEnter}
              onKeyDown={handleKeyDown}
            >
              <span className="portal-ring portal-ring--energy" aria-hidden="true" />
              <span className="portal-ring portal-ring--edge" aria-hidden="true" />
              <span className="portal-aperture" aria-hidden="true" />
              <span className="portal-glass" aria-hidden="true" />
              <span className="portal-phoneme-ring" aria-hidden="true">
                <span className="portal-phoneme-glyph">W</span>
                <span className="portal-phoneme-glyph">ER</span>
                <span className="portal-phoneme-glyph">D</span>
                <span className="portal-phoneme-glyph">Z</span>
                <span className="portal-phoneme-glyph">B</span>
                <span className="portal-phoneme-glyph">K</span>
                <span className="portal-phoneme-glyph">M</span>
                <span className="portal-phoneme-glyph">S</span>
                <span className="portal-phoneme-fragment portal-phoneme-fragment--words">WORDS</span>
                <span className="portal-phoneme-fragment portal-phoneme-fragment--weapons">WEAPONS</span>
                <span className="portal-phoneme-fragment portal-phoneme-fragment--scroll">SCROLL</span>
              </span>

              <div className="portal-content">
                <GrimoireTitle />
                <p className="portal-tagline">Where words become weapons</p>
                <span className="portal-beta" aria-label="Beta">β BETA</span>
                <p className="portal-hint" aria-hidden="true">
                  <span className="portal-hint-beacon" />
                  Step through
                </p>
              </div>
            </div>
          </WatercolorDissolve>
        </div>
        <div className="landing-gate landing-gate--ledger">
          <UpdateLedgerWindow />
        </div>
      </div>
    </div>
  );
}
