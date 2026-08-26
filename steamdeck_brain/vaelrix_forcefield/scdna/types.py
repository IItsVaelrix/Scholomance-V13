"""
SCDNA — core data model.

Python translation of the types defined in
scholomance-encyclopedia/PDR-archive/SCDNA.pdr.md
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

GeneVersion = Literal["SCDNA-v1"]

SourceKind = Literal[
    "file",
    "memory",
    "test",
    "bug",
    "lyric",
    "sprite",
    "tool",
    "rule",
    "architecture",
    "workflow",
]

PrimaryDomain = Literal[
    "code",
    "rhyme",
    "phoneme",
    "pixel",
    "lore",
    "audio",
    "seo",
    "memory",
    "testing",
    "architecture",
    "risk",
]

LookupMode = Literal["exact", "semantic", "hybrid", "symbolic"]

GeneAction = Literal[
    "recall",
    "warn",
    "route",
    "compare",
    "block",
    "test",
    "critique",
    "summarize",
    "patch",
    "audit",
]

RiskClass = Literal["low", "medium", "high", "critical"]
BlastRadius = Literal["local", "module", "cross_system", "global"]

LifecycleStatus = Literal[
    "active",
    "degraded",
    "deprecated",
    "conflicted",
    "quarantined",
]


@dataclass
class GeneIdentity:
    stableId: str = ""
    contentHash: str = ""
    sourceKind: SourceKind = "rule"


@dataclass
class GeneDomain:
    primary: PrimaryDomain = "code"
    secondary: list[str] = field(default_factory=list)
    activationBrains: list[str] = field(default_factory=list)
    # The code this gene governs, as fnmatch globs -- the same shape a
    # capability packet's `surfaces` uses, so the same machinery can date it.
    #
    # Without this the gene named no code, so `retrieval.freshness` could only
    # ever be the literal written in registry.py and inject.py's MIN_FRESHNESS
    # gate could never fire. Declaring surfaces is what makes that gate real.
    # Empty is legitimate and means "cannot be dated", never "fresh".
    surfaces: list[str] = field(default_factory=list)


@dataclass
class GeneRetrieval:
    lookupMode: LookupMode = "hybrid"
    priority: float = 0.5
    confidence: float = 0.5
    originalConfidence: float = 0.5
    freshness: float = 0.5
    canonical: bool = False
    minConfidence: float = 0.45


@dataclass
class GeneInstruction:
    action: GeneAction = "recall"
    imperative: str = ""
    forbiddenDrift: list[str] = field(default_factory=list)
    requiredChecks: list[str] = field(default_factory=list)


@dataclass
class GeneRisk:
    riskClass: RiskClass = "low"
    blastRadius: BlastRadius = "local"
    staleRisk: float = 0.0
    misuseRisk: float = 0.0


@dataclass
class GeneEnglish:
    shortMeaning: str = ""
    expandedMeaning: str = ""
    operatorInstruction: str = ""


@dataclass
class GeneLifecycle:
    status: LifecycleStatus = "active"
    contradictionCount: int = 0
    lastContradictionAtIndex: int | None = None
    degradationFactor: float = 0.85
    recoveryIncrement: float = 0.02
    deprecationThreshold: float = 0.45
    supersededBy: str | None = None
    quarantineReason: str | None = None


@dataclass
class TurboQuantGenomeChunk:
    """A TurboQuant memory chunk with an attached SCDNA retrieval gene."""

    gene: RetrievalGene
    compressedPayloadRef: str
    summary: str
    createdAtIndex: int
    updatedAtIndex: int


@dataclass
class RetrievalGene:
    version: GeneVersion = "SCDNA-v1"
    identity: GeneIdentity = field(default_factory=GeneIdentity)
    domain: GeneDomain = field(default_factory=GeneDomain)
    retrieval: GeneRetrieval = field(default_factory=GeneRetrieval)
    instruction: GeneInstruction = field(default_factory=GeneInstruction)
    risk: GeneRisk = field(default_factory=GeneRisk)
    english: GeneEnglish = field(default_factory=GeneEnglish)
    lifecycle: GeneLifecycle = field(default_factory=GeneLifecycle)

    def to_dict(self) -> dict:
        return {
            "version": self.version,
            "identity": {
                "stableId": self.identity.stableId,
                "contentHash": self.identity.contentHash,
                "sourceKind": self.identity.sourceKind,
            },
            "domain": {
                "primary": self.domain.primary,
                "secondary": list(self.domain.secondary),
                "activationBrains": list(self.domain.activationBrains),
                "surfaces": list(self.domain.surfaces),
            },
            "retrieval": {
                "lookupMode": self.retrieval.lookupMode,
                "priority": self.retrieval.priority,
                "confidence": self.retrieval.confidence,
                "originalConfidence": self.retrieval.originalConfidence,
                "freshness": self.retrieval.freshness,
                "canonical": self.retrieval.canonical,
                "minConfidence": self.retrieval.minConfidence,
            },
            "instruction": {
                "action": self.instruction.action,
                "imperative": self.instruction.imperative,
                "forbiddenDrift": list(self.instruction.forbiddenDrift),
                "requiredChecks": list(self.instruction.requiredChecks),
            },
            "risk": {
                "riskClass": self.risk.riskClass,
                "blastRadius": self.risk.blastRadius,
                "staleRisk": self.risk.staleRisk,
                "misuseRisk": self.risk.misuseRisk,
            },
            "english": {
                "shortMeaning": self.english.shortMeaning,
                "expandedMeaning": self.english.expandedMeaning,
                "operatorInstruction": self.english.operatorInstruction,
            },
            "lifecycle": {
                "status": self.lifecycle.status,
                "contradictionCount": self.lifecycle.contradictionCount,
                "lastContradictionAtIndex": self.lifecycle.lastContradictionAtIndex,
                "degradationFactor": self.lifecycle.degradationFactor,
                "recoveryIncrement": self.lifecycle.recoveryIncrement,
                "deprecationThreshold": self.lifecycle.deprecationThreshold,
                "supersededBy": self.lifecycle.supersededBy,
                "quarantineReason": self.lifecycle.quarantineReason,
            },
        }

    @classmethod
    def from_dict(cls, data: dict) -> "RetrievalGene":
        return cls(
            version=data.get("version", "SCDNA-v1"),
            identity=GeneIdentity(
                stableId=data["identity"]["stableId"],
                contentHash=data["identity"]["contentHash"],
                sourceKind=data["identity"].get("sourceKind", "rule"),
            ),
            domain=GeneDomain(
                primary=data["domain"]["primary"],
                secondary=list(data["domain"].get("secondary", [])),
                activationBrains=list(data["domain"].get("activationBrains", [])),
                # .get, not [] -- every gene serialized before this field
                # existed must still load rather than raising.
                surfaces=list(data["domain"].get("surfaces", [])),
            ),
            retrieval=GeneRetrieval(
                lookupMode=data["retrieval"]["lookupMode"],
                priority=float(data["retrieval"]["priority"]),
                confidence=float(data["retrieval"]["confidence"]),
                originalConfidence=float(data["retrieval"]["originalConfidence"]),
                freshness=float(data["retrieval"]["freshness"]),
                canonical=bool(data["retrieval"]["canonical"]),
                minConfidence=float(data["retrieval"]["minConfidence"]),
            ),
            instruction=GeneInstruction(
                action=data["instruction"]["action"],
                imperative=data["instruction"]["imperative"],
                forbiddenDrift=list(data["instruction"].get("forbiddenDrift", [])),
                requiredChecks=list(data["instruction"].get("requiredChecks", [])),
            ),
            risk=GeneRisk(
                riskClass=data["risk"]["riskClass"],
                blastRadius=data["risk"]["blastRadius"],
                staleRisk=float(data["risk"]["staleRisk"]),
                misuseRisk=float(data["risk"]["misuseRisk"]),
            ),
            english=GeneEnglish(
                shortMeaning=data["english"]["shortMeaning"],
                expandedMeaning=data["english"]["expandedMeaning"],
                operatorInstruction=data["english"]["operatorInstruction"],
            ),
            lifecycle=GeneLifecycle(
                status=data["lifecycle"]["status"],
                contradictionCount=int(data["lifecycle"]["contradictionCount"]),
                lastContradictionAtIndex=data["lifecycle"].get("lastContradictionAtIndex"),
                degradationFactor=float(data["lifecycle"]["degradationFactor"]),
                recoveryIncrement=float(data["lifecycle"]["recoveryIncrement"]),
                deprecationThreshold=float(data["lifecycle"]["deprecationThreshold"]),
                supersededBy=data["lifecycle"].get("supersededBy"),
                quarantineReason=data["lifecycle"].get("quarantineReason"),
            ),
        )
