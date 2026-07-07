import { SCHOOLS, generateSchoolColor } from "./schools";

// Shared data constants for Scholomance

export const LIBRARY = {
  lexiconic: {
    title: "Sonic Thaumaturgy",
    yt: "9_QmbwbY0tc",
    school: "SONIC",
  },
  schism: {
    title: "Psychic Schism",
    yt: "3tmd-ClpJxA",
    school: "PSYCHIC",
  },
  void: {
    title: "VOID",
    yt: "F2yr6zQwqQk",
    school: "VOID",
  },
  alchemy: {
    title: "Verbal Alchemy",
    yt: "GtgyCnJcZRw",
    school: "ALCHEMY",
  },
  will: {
    title: "Willpower Surge",
    yt: "5iIUiYkmkw8",
    school: "WILL",
  },
  void_transmission: {
    title: "Void Transmission",
    yt: "ZdKADAEM7bo",
    school: "VOID",
  },
  sonic_harmony: {
    title: "Harmony",
    suno: "https://suno.com/song/e4570794-8296-40b0-8330-4dcd50ea62d3",
    school: "SONIC",
  },
};


export const LINKS = [
  { id: "watch",      path: "/watch",      label: "Watch" },
  { id: "listen",     path: "/listen",     label: "Listen" },
  { id: "read",       path: "/read",       label: "Scribe" },
  { id: "visualiser", path: "/visualiser", label: "Visualizer" },
  { id: "blog",       path: "/blog",       label: "Blog" },
];

export const INTERNAL_MODULES = [
  { id: "oracle", path: "/oracle", label: "Oracle" },
  { id: "pixelbrain", path: "/pixelbrain", label: "PixelBrain" },
  { id: "career", path: "/career", label: "Career" },
  { id: "collab", path: "/collab", label: "Collab" },
  { id: "wand", path: "/wand", label: "Wand Workspace" },
  { id: "qbit-world", path: "/qbit-world", label: "QBIT World" },
  { id: "photonic-bridge", path: "/internal/photonic-bridge", label: "Photonic Bridge" },
  { id: "time-lab", path: "/internal/time-lab", label: "ScholoTime Lab" },
];

// Dynamically generate COLORS from SCHOOLS source of truth
const COLORS = Object.keys(SCHOOLS).reduce((acc, schoolId) => {
  acc[schoolId] = generateSchoolColor(schoolId);
  return acc;
}, {});

// Dynamically generate ANGLES from SCHOOLS source of truth
const SCHOOL_ANGLES = Object.values(SCHOOLS).reduce((acc, school) => {
  acc[school.id] = school.angle;
  return acc;
}, {});

function schoolToBadgeClass(school) {
  return `badge--${String(school || "").toLowerCase()}`;
}
