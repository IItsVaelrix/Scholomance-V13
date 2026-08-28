"""
Vaelrix Cortex ForceField — Architecture Brain.

System design and structure domain specialist. Analyzes the task for
architectural concerns: layer boundaries, design patterns, coupling,
separation of concerns, and system organization — deterministic heuristics.
"""

from __future__ import annotations

from pathlib import Path

from ..types import AmplifierBrain, AmplifierResult, ResonanceScore, VaelrixCortexForceField


_ARCHITECTURAL_PATTERNS: dict[str, str] = {
    "mvc": "Model-View-Controller — separates data, UI, and logic.",
    "mvvm": "Model-View-ViewModel — data-binding oriented variant of MVC.",
    "flux": "Flux/Redux — unidirectional data flow.",
    "clean architecture": "Clean Architecture — domain-centric, dependency-inverted layers.",
    "hexagonal": "Hexagonal/Ports & Adapters — isolates domain from infrastructure.",
    "microservices": "Microservices — independently deployable service modules.",
    "monolith": "Monolith — single deployable unit; simpler but less scalable.",
    "cqrs": "CQRS — Command-Query Responsibility Segregation.",
    "event sourcing": "Event Sourcing — state derived from immutable event stream.",
    "layered": "Layered Architecture — presentation/business/data tiers.",
    "serverless": "Serverless — function-as-a-service, no persistent server.",
    "pipeline": "Pipeline/Chain — sequential processing stages.",
    "plugin": "Plugin Architecture — extensible via add-on modules.",
}

ARCHITECTURE_BRAIN = AmplifierBrain(
    id="ARCHITECTURE_BRAIN",
    domain=["architecture", "design", "structure", "pattern"],
    # Includes every pattern name this brain can actually recognize
    # (_ARCHITECTURAL_PATTERNS) so the routing gate's vocabulary never lags
    # behind the brain's own — the same gap found and fixed for
    # "typography"/"refactor" earlier applies to every pattern name here too.
    activationSignals=[
        "architecture", "design", "structure", "pattern", "system", "organize",
        "refactor", "layer", "contract", "boundary",
        *_ARCHITECTURAL_PATTERNS.keys(),
    ],
    allowedTools=["search_code", "read_file", "codebase_search"],
    defaultSearchBudget=4,
)

_COUPLING_RISK_TERMS = {
    "circular": "Circular dependency — modules mutually importing each other.",
    "god class": "God class — single class doing too many things.",
    "spaghetti": "Spaghetti code — tangled, unstructured control flow.",
    "tight coupling": "Tight coupling — modules cannot change independently.",
    "dependency hell": "Dependency hell — version conflicts and deep dependency trees.",
    "big ball of mud": "Big Ball of Mud — no discernible architecture.",
}

_SOLID_PRINCIPLES = {
    "single responsibility": "SRP — a class should have only one reason to change.",
    "open closed": "OCP — open for extension, closed for modification.",
    "liskov": "LSP — subtypes must be substitutable for their base types.",
    "interface segregation": "ISP — no client forced to depend on methods it doesn't use.",
    "dependency inversion": "DIP — depend on abstractions, not concretions.",
}

_LAYER_NAMES = {"core", "service", "runtime", "server", "ui", "surface", "infra", "domain", "application", "presentation", "data", "persistence"}


def _project_root() -> Path:
    here = Path(__file__).resolve()
    for _ in range(8):
        if here == here.parent:
            break
        if any((here / marker).exists() for marker in (".git", "package.json", "pyproject.toml")):
            return here
        here = here.parent
    return Path.cwd()


#: Known architectural roots whose direct children are the real layers, per
#: this project's own documented architecture (Scholomance LAW CLAUDE.md:
#: "CODEx has four strict layers"). Checking only the repo root missed every
#: one of them — codex/core, codex/services, codex/runtime, codex/server all
#: live one level down.
_LAYER_ROOTS = (Path("."), Path("codex"))
_LAYER_SOURCE_EXTS = (".py", ".js", ".ts", ".jsx", ".tsx")


_LAW_DIR = "docs/scholomance-encyclopedia/Scholomance LAW"


def _quote_law(root: Path, phrase: str) -> str | None:
    """Find the first real line in this project's own LAW docs mentioning
    `phrase`, so a citation like "per CODEx contract" is a real quote
    instead of a name with nothing behind it."""
    law_dir = root / _LAW_DIR
    if not law_dir.is_dir():
        return None
    for path in law_dir.rglob("*.md"):
        if not path.is_file():
            continue
        try:
            for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
                if phrase in line.lower():
                    return line.strip()
        except Exception:
            continue
    return None


def _scan_layer_dirs(root: Path) -> dict[str, list[str]]:
    """Identify real project directories that match architectural layer names,
    at the repo root and under known architectural roots (codex/)."""
    layers: dict[str, list[str]] = {}
    for layer_root in _LAYER_ROOTS:
        base = root / layer_root
        if not base.is_dir():
            continue
        for item in base.iterdir():
            if item.is_dir() and item.name.lower() in _LAYER_NAMES:
                key = str(item.relative_to(root))
                files = [
                    str(p.relative_to(root))
                    for p in item.rglob("*")
                    if p.is_file() and p.suffix.lower() in _LAYER_SOURCE_EXTS
                ]
                layers[key] = sorted(files)[:5]
    return layers


def run_architecture_brain(
    field: VaelrixCortexForceField,
    query: str | None = None,
) -> AmplifierResult:
    text = (query or field.task.rawUserRequest).lower()
    findings: list[str] = []
    root = _project_root()

    # Pattern detection
    pattern_hits = {name: desc for name, desc in _ARCHITECTURAL_PATTERNS.items() if name in text}
    if pattern_hits:
        findings.append(f"Architectural pattern(s): {', '.join(pattern_hits.keys())}")
    else:
        findings.append("No explicit architectural pattern detected — verify design intent.")

    # SOLID principles
    solid_hits = {name: desc for name, desc in _SOLID_PRINCIPLES.items() if name in text}
    if solid_hits:
        findings.append(f"SOLID principle(s) referenced: {', '.join(solid_hits.keys())}")

    # Coupling risks
    risk_hits = {name: desc for name, desc in _COUPLING_RISK_TERMS.items() if name in text}
    if risk_hits:
        findings.append(f"WARNING — coupling risk flagged: {', '.join(risk_hits.keys())}")

    # Layer scan
    layers = _scan_layer_dirs(root)
    if layers:
        layer_summary = ", ".join(f"{name}({len(files)} files)" for name, files in layers.items())
        findings.append(f"Detected layers: {layer_summary}")
    else:
        findings.append("No architectural layer directories detected (e.g. core/, service/, ui/).")

    # Cross-layer analysis
    if "refactor" in text and len(layers) >= 3:
        law_quote = _quote_law(root, "four strict layers")
        if law_quote:
            findings.append(f'Multi-layer project — this project\'s own law states: "{law_quote}"')
        else:
            findings.append("Multi-layer project — refactors should preserve layer boundaries per CODEx contract.")
    if "import" in text and len(layers) >= 2:
        findings.append("Check import direction — inner layers should not import from outer layers.")

    # Structure keywords
    if "modular" in text or "module" in text:
        findings.append("Modularity referenced — verify clear public APIs and minimal cross-module coupling.")
    if "interface" in text or "contract" in text:
        findings.append("Interface/contract referenced — define explicit abstractions and test against them.")
    if "migration" in text or "migrate" in text:
        findings.append("Migration referenced — plan rollback and backward compatibility strategy.")
    if "scale" in text or "scalable" in text:
        findings.append("Scalability referenced — identify bottleneck and measure before optimizing.")

    # Task classification aware
    if field.task.classification == "architectural":
        findings.append("Task classified as ARCHITECTURAL — full design review recommended.")
    elif field.task.classification in ("structural", "behavioral"):
        findings.append(f"Task is {field.task.classification.upper()} — verify alignment with existing architecture.")

    if not findings:
        findings.append("Architecture Brain standing by — no structural concerns detected.")

    return AmplifierResult(
        brainId=ARCHITECTURE_BRAIN.id,
        summary="Architecture/design heuristic analysis.",
        findings=findings,
        recommendedAction="Review architectural decisions against CODEx layer contracts and SOLID principles.",
        resonance=ResonanceScore(
            intentMatch=0.7, evidenceStrength=0.6, novelty=0.5,
            conflictRisk=0.3, actionability=0.7,
        ),
    )
