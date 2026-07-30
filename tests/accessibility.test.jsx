import { fireEvent, render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { MemoryRouter } from "react-router-dom";
import { vi, beforeEach, afterEach } from "vitest";

import App from "../src/App.jsx";
import Navigation from "../src/components/Navigation/Navigation.jsx";
import FloatingPanel from "../src/components/shared/FloatingPanel.jsx";
import { ThemeProvider } from "../src/hooks/useTheme.jsx";
import ListenPage from "../src/pages/Listen/ListenPage";
import ScrollEditor from "../src/pages/Read/ScrollEditor.jsx";

expect.extend(toHaveNoViolations);

// Suppress Phaser loading errors in tests (Phaser is loaded dynamically)
const originalConsoleError = console.error.bind(console);
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    if (args[0]?.includes?.('Phaser is not defined')) {
      return; // Suppress Phaser errors
    }
    originalConsoleError(...args);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Handle unhandled promise rejections from Phaser
process.on('unhandledRejection', (reason) => {
  if (String(reason)?.includes('Phaser is not defined')) {
    return; // Suppress Phaser rejections
  }
  originalConsoleError('Unhandled rejection:', reason);
});

const authState = vi.hoisted(() => ({
  user: null,
}));

// Must mirror every field AuthContext.Provider supplies (AuthContext.jsx:195).
// The CSRF trio was missing, and ProgressionContext.jsx:69 destructures
// `clearCsrfToken` from useAuth() and calls it — an incomplete mock surfaced as
// "clearCsrfToken is not a function" from inside the component tree, not from
// this file. Mocking ../src/hooks/useProgression.jsx does not cover it: that is
// a different module from src/context/ProgressionContext.jsx.
vi.mock("../src/hooks/useAuth.jsx", () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => ({
    user: authState.user,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    checkMe: vi.fn(),
    csrfToken: null,
    getCsrfToken: vi.fn(async () => null),
    clearCsrfToken: vi.fn(),
  }),
}));

vi.mock("../src/hooks/useProgression.jsx", () => ({
  ProgressionProvider: ({ children }) => children,
  useProgression: () => ({
    progression: { xp: 1000, unlockedSchools: ["SONIC", "ABJURATION"] },
    checkUnlocked: (schoolId) => ["SONIC", "ABJURATION"].includes(schoolId),
    addXP: vi.fn(),
    resetProgression: vi.fn(),
    getNextUnlock: vi.fn(),
    levelInfo: { level: 1, currentXp: 1000, nextXp: 2000, progress: 0.5 },
    availableSchools: ["SONIC", "ABJURATION"],
    totalSchools: 6,
  }),
}));

vi.mock("../src/hooks/useScrolls.jsx", () => ({
  ScrollsProvider: ({ children }) => children,
  useScrolls: () => ({
    refreshScrolls: vi.fn(async () => {}),
    scrolls: [],
    addScroll: vi.fn(),
    deleteScroll: vi.fn(),
    updateScroll: vi.fn(),
  }),
}));

vi.mock("../src/hooks/useCurrentSong.jsx", () => ({
  SongProvider: ({ children }) => children,
  useCurrentSong: () => ({
    currentKey: "SONG_1",
    currentSong: { school: "ABJURATION", title: "Aegis of the Fifth Moon" },
    setCurrentKey: vi.fn(),
    library: {
      SONG_1: { school: "ABJURATION", title: "Aegis of the Fifth Moon" },
    },
  }),
}));

vi.mock("../src/hooks/useAmbientPlayer", () => ({
  useAmbientPlayer: () => ({
    status: "PAUSED",
    currentSchoolId: "SONIC",
    isPlaying: false,
    isPaused: true,
    isTuning: false,
    signalLevel: 0.6,
    volume: 0.5,
    setVolume: vi.fn(),
    autoplayAmbient: false,
    cyclingEnabled: true,
    playableSchools: ["SONIC"],
    dynamicSchools: [],
    refreshDynamicSchools: vi.fn(),
    tuneToSchool: vi.fn(async () => {}),
    tuneNextSchool: vi.fn(async () => {}),
    tunePreviousSchool: vi.fn(async () => {}),
    play: vi.fn(async () => {}),
    pause: vi.fn(async () => {}),
    togglePlayPause: vi.fn(async () => {}),
    toggleAutoplayAmbient: vi.fn(async () => {}),
    toggleCyclingEnabled: vi.fn(),
    unlockAudio: vi.fn(async () => {}),
  }),
}));

expect.extend(toHaveNoViolations);

function renderWithThemeAndRouter(ui, route = "/") {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </ThemeProvider>
  );
}

describe("Accessibility Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = null;
  });

  it("should have no accessibility violations in App shell", async () => {
    const { container } = renderWithThemeAndRouter(<App />);
    await screen.findByRole("navigation", { name: /primary navigation/i });
    expect(await axe(container)).toHaveNoViolations();
  });

  describe("ScrollEditor", () => {
    it("should have no axe violations", async () => {
      const { container } = renderWithThemeAndRouter(<ScrollEditor onSave={() => {}} isEditable={true} />);
      expect(await axe(container)).toHaveNoViolations();
    });

    it("should expose labeled fields", () => {
      renderWithThemeAndRouter(<ScrollEditor onSave={() => {}} isEditable={true} />);
      expect(screen.getByLabelText(/scroll title/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/scroll content/i)).toBeInTheDocument();
    });
  });

  describe("Navigation", () => {
    it("should have no axe violations", async () => {
      const { container } = renderWithThemeAndRouter(<Navigation />, "/listen");
      expect(await axe(container)).toHaveNoViolations();
    });

    it("should expose a primary navigation landmark", () => {
      renderWithThemeAndRouter(<Navigation />);
      expect(screen.getByRole("navigation", { name: /primary navigation/i })).toBeInTheDocument();
    });

    it("should mark the active route with aria-current", () => {
      renderWithThemeAndRouter(<Navigation />, "/listen");
      expect(screen.getByRole("link", { name: /listen/i })).toHaveAttribute("aria-current", "page");
    });

    it("should show internal modules in development for non-admin users", () => {
      // In development (vitest), internal modules are ALWAYS visible to allow debugging
      authState.user = { username: "scribe", email: "scribe@example.com" };
      renderWithThemeAndRouter(<Navigation />);
      expect(screen.getByRole("link", { name: /collab/i })).toBeInTheDocument();
    });

    it("should show collab nav link for admin users", () => {
      authState.user = { username: "admin", email: "admin@example.com" };
      renderWithThemeAndRouter(<Navigation />);
      expect(screen.getByRole("link", { name: /collab/i })).toBeInTheDocument();
    });
  });

  describe("ListenPage", () => {
    it("should have no axe violations", async () => {
      const { container } = renderWithThemeAndRouter(<ListenPage />, "/listen");
      // Wait for page to render - look for sidebar header
      await screen.findByText(/APERTURE/i);
      expect(await axe(container)).toHaveNoViolations();
    });

    it("should include a polite live region for announcements", () => {
      renderWithThemeAndRouter(<ListenPage />, "/listen");
      // Use getAllByRole since there are multiple status regions
      const statusRegions = screen.getAllByRole("status");
      expect(statusRegions.length).toBeGreaterThan(0);
    });
  });

  describe("FloatingPanel", () => {
    it("should expose dialog semantics", () => {
      render(
        <FloatingPanel id="a11y-dialog" title="CODEx Metrics" onClose={() => {}}>
          <div>Panel content</div>
        </FloatingPanel>
      );
      expect(screen.getByRole("dialog", { name: /codex metrics/i })).toBeInTheDocument();
    });

    it("should dismiss on Escape when onClose is provided", () => {
      const onClose = vi.fn();
      render(
        <FloatingPanel id="a11y-escape" title="Rhyme Scheme" onClose={onClose}>
          <button type="button">Focusable child</button>
        </FloatingPanel>
      );
      fireEvent.keyDown(screen.getByRole("dialog", { name: /rhyme scheme/i }), { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
