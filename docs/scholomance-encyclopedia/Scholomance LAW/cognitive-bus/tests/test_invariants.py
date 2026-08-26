#!/usr/bin/env python3
"""Executable form of the Required Invariants table in references/evals.md.

Run:  python3 tests/test_invariants.py

Every row of that table appears here exactly once, named after the row. Rows the
packet layer cannot decide are declared with ``skipTest`` and a reason naming the
harness that *can* decide them. They are not silently omitted and they are not
faked into passing: a green run means the mechanically enforceable rows hold, and
the summary prints how many rows that actually is.
"""

from __future__ import annotations

import copy
import importlib.util
import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("cognitive_packet", ROOT / "scripts" / "cognitive_packet.py")
cp = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(cp)

sys.path.insert(0, str(Path(__file__).resolve().parent))
import minischema  # noqa: E402

SEED = json.loads((ROOT / "references" / "fixtures" / "seed-packet.json").read_text(encoding="utf-8"))
SCHEMA = json.loads((ROOT / "references" / "packet-schema.json").read_text(encoding="utf-8"))

# Rows of the evals.md table that need model runs, a retriever, or a scoring
# harness. The packet validator has no opinion on them by construction.
BEHAVIORAL_ROWS = {
    "sycophancy_resistance": "needs a model run with a blinded verifier; scored by the eval harness in evals.md, not by packet shape",
    "abstention_reward": "needs a scoring function over runs; the validator can accept an ABSTAIN packet but cannot reward it",
    "lost_middle_retrieval": "needs a retriever and a long-context model run",
    "bounded_convergence": "needs an orchestrator loop; the validator sees single packets, not round counts",
}


def packet(**overrides):
    """A valid seed packet with deep overrides applied, re-sealed."""
    p = copy.deepcopy(SEED)
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(p.get(key), dict):
            p[key] = {**p[key], **value}
        else:
            p[key] = value
    return cp.seal(p)


def evidence(evidence_id, key, kind="ARTIFACT", verification="VERIFIED"):
    return {
        "claim": f"claim from {evidence_id}",
        "digest_sha256": None,
        "evidence_id": evidence_id,
        "independence_key": key,
        "kind": kind,
        "reference": f"sandbox:/{evidence_id}",
        "verification": verification,
    }


def schema_case_battery():
    """Packets spanning the accept/reject boundary, shared by the drift and
    fidelity checks so both are exercised over the same battery."""
    return [
        SEED,
        packet(evidence=[evidence("e0", "a"), evidence("e1", "b")],
               epistemic={"status": "CONFIRMED", "basis": "CORROBORATED"}),
        packet(authority={"mutation_requested": True, "risk": "MATERIAL", "authorization_ref": "law:g"}),
        packet(diagnostics={"scd64_predicted_static": {"fingerprint": "b" * 64, "provenance": "STATIC_ANALYSIS"}}),
        packet(intent="ABSTAIN", evidence=[],
               epistemic={"status": "UNVERIFIED", "basis": "MODEL_ONLY"},
               memory={"stratum": "NONE", "operation": "NONE", "candidate_id": None, "retention_basis": []}),
        packet(diagnostics={"scd64_predicted_static": "a" * 64}),
        packet(authority={"mutation_requested": True, "risk": "DESTRUCTIVE", "authorization_ref": None}),
        packet(authority={"mutation_requested": False, "risk": "MATERIAL", "authorization_ref": None}),
        packet(evidence=[], epistemic={"status": "CONFIRMED", "basis": "MODEL_ONLY"}),
        packet(memory={"stratum": "SEMANTIC", "operation": "PROMOTE", "candidate_id": "f",
                       "retention_basis": ["r"]},
               epistemic={"status": "UNVERIFIED", "basis": "MODEL_ONLY"}),
        packet(memory={"stratum": "NONE", "operation": "PROMOTE", "candidate_id": "x",
                       "retention_basis": ["r"]}),
        packet(intent="ABSTAIN", epistemic={"status": "CONFIRMED", "basis": "CORROBORATED"}),
        ]


class Invariants(unittest.TestCase):
    def assertRejected(self, p, needle=None):
        errors = cp.validate(p)
        self.assertTrue(errors, "packet was accepted but the invariant requires rejection")
        if needle:
            self.assertTrue(
                any(needle in e for e in errors),
                f"rejected for the wrong reason: {errors}",
            )

    def assertAccepted(self, p):
        self.assertEqual(cp.validate(p), [], "packet was rejected but should be valid")

    # -- Deterministic seal ------------------------------------------------
    def test_deterministic_seal(self):
        a = cp.seal(copy.deepcopy(SEED))
        b = cp.seal(dict(reversed(list(copy.deepcopy(SEED).items()))))
        self.assertEqual(a["packet_id"], b["packet_id"])
        self.assertEqual(a["integrity"]["content_sha256"], b["integrity"]["content_sha256"])
        c = copy.deepcopy(SEED)
        c["proposition"]["statement"] += " "
        self.assertNotEqual(cp.seal(c)["packet_id"], a["packet_id"])

    # -- Tamper detection --------------------------------------------------
    def test_tamper_detection_unsigned_catches_corruption(self):
        p = copy.deepcopy(SEED)
        p["proposition"]["statement"] = "mutated after sealing"
        self.assertRejected(p, "integrity.content_sha256")

    def test_tamper_detection_unsigned_does_not_survive_resealing(self):
        """The honest limit of an unsigned packet, asserted rather than assumed."""
        forged = copy.deepcopy(SEED)
        forged["proposition"]["statement"] = "FORGED"
        forged = cp.seal(forged)
        self.assertEqual(cp.validate(forged), [], "re-sealing a forgery is expected to validate when unsigned")
        self.assertTrue(cp.validate(forged, require_signature=True), "--require-signature must reject it")

    def test_tamper_detection_signed(self):
        key = b"test-key"
        signed = cp.seal(copy.deepcopy(SEED), key=key, key_id="k1")
        self.assertEqual(cp.validate(signed, key=key, require_signature=True), [])
        # Re-seal a forged body and carry the original signature across. The MAC
        # was computed over the old content hash, so it no longer matches.
        forged = copy.deepcopy(signed)
        forged["proposition"]["statement"] = "FORGED"
        forged = cp.seal(forged)
        forged["integrity"]["signature"] = signed["integrity"]["signature"]
        # Without the key a validator sees a structurally sound signature and
        # cannot tell. This is the boundary, asserted so nobody assumes otherwise.
        self.assertEqual(cp.validate(forged), [])
        # With the key the forgery is caught.
        errors = cp.validate(forged, key=key)
        self.assertTrue(any("does not verify" in e for e in errors), errors)

        relabeled = copy.deepcopy(signed)
        relabeled["integrity"]["signature"]["key_id"] = "forged-signer-label"
        errors = cp.validate(relabeled, key=key, require_signature=True)
        self.assertTrue(
            any("does not verify" in e for e in errors),
            f"signature key_id was mutable provenance: {errors}",
        )

    def test_require_signature_requires_a_verification_key(self):
        signed = cp.seal(copy.deepcopy(SEED), key=b"participant-key", key_id="participant")
        errors = cp.validate(signed, key=None, require_signature=True)
        self.assertTrue(errors, "--require-signature accepted a signature it could not verify")
        self.assertTrue(
            any("verification key" in error for error in errors),
            f"rejected for the wrong reason: {errors}",
        )

    def test_enum_fields_reject_non_scalars_without_crashing(self):
        cases = [
            ("sender.role", lambda p, v: p["sender"].update(role=v)),
            ("intent", lambda p, v: p.update(intent=v)),
            ("epistemic.status", lambda p, v: p["epistemic"].update(status=v)),
            ("epistemic.basis", lambda p, v: p["epistemic"].update(basis=v)),
            ("evidence[0].kind", lambda p, v: p["evidence"][0].update(kind=v)),
            ("evidence[0].verification", lambda p, v: p["evidence"][0].update(verification=v)),
            ("memory.stratum", lambda p, v: p["memory"].update(stratum=v)),
            ("memory.operation", lambda p, v: p["memory"].update(operation=v)),
            ("authority.risk", lambda p, v: p["authority"].update(risk=v)),
            ("diagnostics.bytecode_health", lambda p, v: p["diagnostics"].update(bytecode_health=v)),
        ]
        for non_scalar in ([], {}):
            for path, mutate in cases:
                malformed = copy.deepcopy(SEED)
                mutate(malformed, non_scalar)
                malformed = cp.seal(malformed)
                errors = cp.validate(malformed)
                self.assertTrue(any(error.startswith(path) for error in errors), (path, non_scalar, errors))

        first = copy.deepcopy(SEED)
        first["sender"]["role"] = []
        first = cp.seal(first)
        later = copy.deepcopy(SEED)
        later["proposition"]["statement"] = "tampered after sealing"
        errors = cp.validate_chain([first, later])
        self.assertTrue(any(error.startswith("[0] sender.role") for error in errors), errors)
        self.assertTrue(any(error.startswith("[1] integrity.content_sha256") for error in errors), errors)

    def test_malformed_structures_return_errors_and_chain_continues(self):
        malformed_evidence = copy.deepcopy(SEED)
        malformed_evidence["evidence"] = 1
        malformed_evidence = cp.seal(malformed_evidence)

        malformed_integrity = copy.deepcopy(SEED)
        malformed_integrity["integrity"] = []

        malformed_key_id = cp.seal(copy.deepcopy(SEED), key=b"test-key", key_id="real-key")
        malformed_key_id["integrity"]["signature"]["key_id"] = []
        self.assertTrue(cp.validate(malformed_key_id, key=b"test-key", require_signature=True))

        for malformed in (malformed_evidence, malformed_integrity):
            result = subprocess.run(
                [sys.executable, str(ROOT / "scripts" / "cognitive_packet.py"), "admit"],
                input=json.dumps(malformed),
                capture_output=True,
                text=True,
                env={**os.environ, "CBUS_PACKET_KEY": "test-key"},
                check=False,
            )
            self.assertEqual(result.returncode, 1, result.stderr)
            receipt = json.loads(result.stdout)
            self.assertFalse(receipt["admitted"])
            self.assertTrue(receipt["errors"])

        malformed_parents = copy.deepcopy(SEED)
        malformed_parents["parent_ids"] = 7
        malformed_parents = cp.seal(malformed_parents)
        later = copy.deepcopy(SEED)
        later["proposition"]["statement"] = "later tamper"
        errors = cp.validate_chain([malformed_parents, later])
        self.assertTrue(any(error.startswith("[0] parent_ids") for error in errors), errors)
        self.assertTrue(any(error.startswith("[1] integrity.content_sha256") for error in errors), errors)

    # -- Static/runtime separation ----------------------------------------
    def test_static_runtime_separation(self):
        # A bare 64-hex string no longer occupies an SCD64 slot.
        self.assertRejected(
            packet(diagnostics={"scd64_predicted_static": "a" * 64}),
            "diagnostics.scd64_predicted_static",
        )
        # A static fingerprint cannot be filed as a runtime confirmation.
        self.assertRejected(
            packet(diagnostics={"scd64_confirmed_runtime": {"fingerprint": "b" * 64, "provenance": "STATIC_ANALYSIS"}}),
            "provenance",
        )
        # Correctly tagged fields are accepted.
        self.assertAccepted(
            packet(diagnostics={
                "scd64_predicted_static": {"fingerprint": "b" * 64, "provenance": "STATIC_ANALYSIS"},
                "scd64_confirmed_runtime": {"fingerprint": "c" * 64, "provenance": "RUNTIME_TRACE"},
            })
        )

    def test_query_hash_cannot_masquerade_as_scd64(self):
        """The adversarial fixture evals.md requires to be rejected."""
        query_hash = "9f" * 32
        self.assertRejected(packet(diagnostics={"scd64_predicted_static": query_hash}))
        self.assertRejected(packet(diagnostics={"scd64_confirmed_runtime": query_hash}))

    # -- Authority isolation ----------------------------------------------
    def test_authority_isolation(self):
        for risk in ("MATERIAL", "DESTRUCTIVE"):
            self.assertRejected(
                packet(authority={"mutation_requested": True, "risk": risk, "authorization_ref": None}),
                "authorization_ref",
            )
        self.assertAccepted(
            packet(authority={"mutation_requested": True, "risk": "MATERIAL", "authorization_ref": "law:grant-7"})
        )
        # No mutation requested means the packet may not advertise mutation risk.
        self.assertRejected(
            packet(authority={"mutation_requested": False, "risk": "DESTRUCTIVE", "authorization_ref": None}),
            "READ_ONLY",
        )
        self.assertRejected(
            packet(authority={"mutation_requested": True, "risk": "READ_ONLY", "authorization_ref": None}),
            "mutation",
        )

    # -- Duplicate lineage -------------------------------------------------
    def test_duplicate_lineage_counts_once(self):
        shared = [evidence(f"e{i}", "one-upstream-document") for i in range(3)]
        self.assertEqual(cp.corroboration(shared), 1)
        self.assertRejected(
            packet(evidence=shared, epistemic={"status": "CONFIRMED", "basis": "CORROBORATED"}),
            "independence_key lineages",
        )

    # -- Independent corroboration ----------------------------------------
    def test_independent_corroboration_counts_two(self):
        distinct = [evidence("e0", "source-a"), evidence("e1", "source-b")]
        self.assertEqual(cp.corroboration(distinct), 2)
        self.assertAccepted(
            packet(evidence=distinct, epistemic={"status": "CONFIRMED", "basis": "CORROBORATED"})
        )

    def test_execution_evidence_alone_can_confirm(self):
        run = [evidence("e0", "test-run-a", kind="EXECUTION")]
        self.assertAccepted(packet(evidence=run, epistemic={"status": "CONFIRMED", "basis": "DIRECT"}))

    # -- Hallucinated consensus -------------------------------------------
    def test_hallucinated_consensus_stays_unverified(self):
        fabricated = [evidence(f"e{i}", f"agent-{i}-assertion", kind="MODEL_OUTPUT") for i in range(3)]
        self.assertEqual(cp.corroboration(fabricated), 0, "MODEL_OUTPUT must never count as a lineage")
        for status in ("SUPPORTED", "CONFIRMED"):
            self.assertRejected(
                packet(evidence=fabricated, epistemic={"status": status, "basis": "CORROBORATED"}),
                "epistemic.status",
            )
        self.assertAccepted(
            packet(evidence=fabricated, epistemic={"status": "UNVERIFIED", "basis": "MODEL_ONLY"})
        )

    def test_confirmed_requires_grounded_basis(self):
        self.assertRejected(
            packet(evidence=[], epistemic={"status": "CONFIRMED", "basis": "MODEL_ONLY", "confidence_milli": 1000}),
            "epistemic",
        )

    # -- Contradiction retention ------------------------------------------
    def test_contradiction_retention(self):
        parent = SEED["packet_id"]
        # A refutation must cite the branch it defeats.
        self.assertRejected(
            packet(
                parent_ids=[],
                evidence=[evidence("e0", "stronger-source")],
                epistemic={"status": "REFUTED", "basis": "CONTRADICTED"},
            ),
            "preserved",
        )
        self.assertAccepted(
            packet(
                parent_ids=[parent],
                logical_clock=2,
                evidence=[evidence("e0", "stronger-source")],
                epistemic={"status": "REFUTED", "basis": "CONTRADICTED"},
            )
        )
        # Standalone admission cannot inspect a parent's semantics, so CONTESTED
        # must carry two decisive lineages and declare a contradicted basis.
        self.assertRejected(
            packet(parent_ids=[], epistemic={"status": "CONTESTED", "basis": "CORROBORATED"}),
            "CONTESTED",
        )
        # An arbitrary parent is not evidence of a contested claim.
        self.assertRejected(
            packet(
                parent_ids=[parent],
                logical_clock=2,
                evidence=[evidence("e0", "one-source")],
                epistemic={"status": "CONTESTED", "basis": "DIRECT"},
            ),
            "CONTESTED",
        )
        self.assertAccepted(
            packet(
                evidence=[evidence("e0", "source-a"), evidence("e1", "source-b")],
                epistemic={"status": "CONTESTED", "basis": "CONTRADICTED"},
            )
        )

    # -- Self-correction boundary -----------------------------------------
    def test_self_correction_cannot_raise_status(self):
        """An agent revising itself with no new external evidence gains nothing."""
        revision = packet(
            parent_ids=[SEED["packet_id"]],
            logical_clock=2,
            evidence=[evidence("e0", "same-agent-second-thought", kind="MODEL_OUTPUT")],
            epistemic={"status": "CONFIRMED", "basis": "INFERRED"},
        )
        self.assertRejected(revision, "epistemic")

    # -- Abstention --------------------------------------------------------
    def test_abstain_packet_cannot_claim_support(self):
        self.assertRejected(
            packet(intent="ABSTAIN", epistemic={"status": "CONFIRMED", "basis": "CORROBORATED"}),
            "ABSTAIN",
        )
        self.assertAccepted(
            packet(
                intent="ABSTAIN",
                evidence=[],
                epistemic={"status": "UNVERIFIED", "basis": "MODEL_ONLY", "confidence_milli": 100},
                memory={"stratum": "NONE", "operation": "NONE", "candidate_id": None, "retention_basis": []},
            )
        )

    # -- Memory poisoning --------------------------------------------------
    def test_memory_poisoning_blocked(self):
        self.assertRejected(
            packet(
                evidence=[],
                epistemic={"status": "UNVERIFIED", "basis": "MODEL_ONLY"},
                memory={"stratum": "SEMANTIC", "operation": "PROMOTE", "candidate_id": "fact-1", "retention_basis": ["it sounded right"]},
            ),
            "PROMOTE",
        )
        # User assertion is not external grounding either.
        self.assertRejected(
            packet(
                evidence=[evidence("e0", "source-a")],
                epistemic={"status": "SUPPORTED", "basis": "USER_SUPPLIED"},
                memory={"stratum": "SEMANTIC", "operation": "PROMOTE", "candidate_id": "fact-1", "retention_basis": ["user said so"]},
            ),
            "PROMOTE",
        )
        # Staging as episodic is always allowed; that is the pressure valve.
        self.assertAccepted(
            packet(
                evidence=[],
                epistemic={"status": "UNVERIFIED", "basis": "MODEL_ONLY"},
                memory={"stratum": "EPISODIC", "operation": "STAGE", "candidate_id": "ep-1", "retention_basis": ["resume aid"]},
            )
        )

    def test_memory_operation_and_stratum_agree(self):
        self.assertRejected(
            packet(memory={"stratum": "NONE", "operation": "PROMOTE", "candidate_id": "x", "retention_basis": ["r"]}),
            "memory.stratum",
        )
        self.assertRejected(
            packet(memory={"stratum": "EPISODIC", "operation": "PROMOTE", "candidate_id": "x", "retention_basis": ["r"]}),
            "EPISODIC",
        )

    # -- Stale memory ------------------------------------------------------
    def test_stale_evidence_is_not_decisive(self):
        stale = [evidence("e0", "old-doc", verification="STALE"), evidence("e1", "old-doc-2", verification="STALE")]
        self.assertEqual(cp.corroboration(stale), 0)
        self.assertRejected(
            packet(evidence=stale, epistemic={"status": "SUPPORTED", "basis": "RETRIEVED"}),
            "epistemic.status",
        )
        # A refreshed source revises rather than erases: the new packet cites the old.
        self.assertAccepted(
            packet(
                parent_ids=[SEED["packet_id"]],
                logical_clock=2,
                evidence=[evidence("e0", "refreshed-source")],
                epistemic={"status": "SUPPORTED", "basis": "DIRECT"},
                memory={"stratum": "SEMANTIC", "operation": "REVISE", "candidate_id": "fact-1", "retention_basis": ["source refreshed"]},
            )
        )

    # -- Crash resume ------------------------------------------------------
    def test_crash_resume_chain_integrity(self):
        ledger = json.loads((ROOT / "references" / "fixtures" / "ledger.json").read_text(encoding="utf-8"))
        self.assertEqual(cp.validate_chain(ledger), [])
        # A snapshot whose parent is missing cannot be resumed from.
        broken = [p for p in ledger if p["intent"] != "VERIFY"]
        self.assertTrue(any("not present in the ledger" in e for e in cp.validate_chain(broken)))
        # Clocks must advance along parent edges.
        rewound = copy.deepcopy(ledger)
        rewound[-1]["logical_clock"] = 0
        rewound[-1] = cp.seal(rewound[-1])
        self.assertTrue(any("must exceed parent" in e for e in cp.validate_chain(rewound)))

    # -- Rules that other rules were masking ------------------------------
    # Added after mutation testing: each of the four below survived a mutant
    # because some *other* check fired first in every existing case. A rule that
    # is only ever enforced as a side effect of another rule is untested.

    def test_grounded_basis_is_required_independently(self):
        """Evidence alone does not buy a status; the declared basis must agree."""
        # Two distinct decisive lineages, so the evidence-count rule is satisfied
        # and cannot mask the basis rule.
        p = packet(
            evidence=[evidence("e0", "source-a"), evidence("e1", "source-b")],
            epistemic={"status": "CONFIRMED", "basis": "MODEL_ONLY"},
        )
        self.assertRejected(p, "epistemic.basis")

    def test_promotion_status_is_required_independently(self):
        """A grounded basis does not by itself license promotion."""
        p = packet(
            evidence=[evidence("e0", "source-a")],
            epistemic={"status": "UNVERIFIED", "basis": "DIRECT"},
            memory={"stratum": "SEMANTIC", "operation": "PROMOTE", "candidate_id": "fact-1",
                    "retention_basis": ["observed once"]},
        )
        self.assertRejected(p, "requires status")

    def test_fingerprints_and_digests_must_be_lowercase_hex(self):
        """The v1 defect was a length check standing in for a charset check."""
        not_hex = "z" * 64
        upper = "A" * 64
        for bad in (not_hex, upper):
            self.assertRejected(
                packet(diagnostics={"scd64_predicted_static": {"fingerprint": bad, "provenance": "STATIC_ANALYSIS"}}),
                "fingerprint",
            )
        bad_digest = dict(evidence("e0", "source-a"), digest_sha256=not_hex)
        self.assertRejected(packet(evidence=[bad_digest]), "digest_sha256")
        signed = cp.seal(copy.deepcopy(SEED), key=b"k", key_id="k1")
        signed["integrity"]["signature"]["mac"] = not_hex
        self.assertRejected(signed, "mac")

    def test_packet_id_is_checked_independently(self):
        """packet_id is excluded from the digest, so nothing else covers it."""
        p = copy.deepcopy(SEED)
        p["packet_id"] = "cbp-" + "0" * 24
        errors = cp.validate(p)
        self.assertTrue(any(e.startswith("packet_id:") for e in errors), errors)
        self.assertFalse(
            any("content_sha256" in e for e in errors),
            "the digest must still be intact, or this test is not isolating packet_id",
        )

    # -- Rows the packet layer cannot decide ------------------------------
    def test_sycophancy_resistance(self):
        self.skipTest(BEHAVIORAL_ROWS["sycophancy_resistance"])

    def test_abstention_reward(self):
        self.skipTest(BEHAVIORAL_ROWS["abstention_reward"])

    def test_lost_middle_retrieval(self):
        self.skipTest(BEHAVIORAL_ROWS["lost_middle_retrieval"])

    def test_bounded_convergence(self):
        self.skipTest(BEHAVIORAL_ROWS["bounded_convergence"])


class SchemaDrift(unittest.TestCase):
    """references/packet-schema.json and the Python validator must not disagree.

    v1 drifted: the schema allowed any 64-character string in the SCD64 fields
    while requiring hex elsewhere, and the Python mirrored the looser rule. This
    test is the guard, so it runs everywhere: the schema half is evaluated by the
    bundled tests/minischema.py, not by an optional install.
    """

    def setUp(self):
        self.schema = SCHEMA

    def schema_ok(self, p):
        return minischema.is_valid(p, self.schema)

    def test_schema_uses_no_keyword_the_evaluator_ignores(self):
        """A keyword minischema silently skipped would be a rule that stopped applying."""
        self.assertEqual(
            minischema.unsupported_keywords(self.schema),
            set(),
            "packet-schema.json grew a keyword tests/minischema.py does not implement; "
            "implement it rather than letting the drift check ignore the new rule",
        )

    def test_python_acceptance_implies_schema_acceptance(self):
        """The schema is the structural layer; Python adds rules on top of it.

        So anything Python accepts must satisfy the schema, and anything the
        schema rejects Python must reject too. A packet the schema accepts may
        still fail Python (digest and lineage rules) -- that direction is fine.
        """
        cases = schema_case_battery()
        for index, case in enumerate(cases):
            python_ok = not cp.validate(case)
            schema_ok = self.schema_ok(case)
            if python_ok:
                self.assertTrue(schema_ok, f"case {index}: Python accepted a packet the schema rejects")
            if not schema_ok:
                self.assertFalse(python_ok, f"case {index}: schema rejected a packet Python accepts")


class EnforcementTableDrift(unittest.TestCase):
    """SKILL.md's enforcement table is a third copy of the rules. This is its guard.

    v1's defect was schema-vs-validator drift: two hand-maintained copies of the
    same rule disagreed, and the looser one was the one that ran. SKILL.md now
    carries a table claiming what the tooling mechanically rejects, which is a
    third copy and the same failure waiting. So every row of that table is bound
    to the tests that prove it, and the binding is checked in both directions.

    A name-only binding would survive gutting a test body, so each row is also
    executed with the packet layer instrumented: the bound tests must actually
    call the validator, and -- for every row that claims a rejection -- at least
    one of those calls must actually come back with errors.
    """

    # SKILL.md row label -> tests that prove it. ``False`` marks the one row that
    # is a determinism property rather than a rejection rule.
    ROWS = {
        "Content addressing": (["test_deterministic_seal"], False),
        "Corruption detection": (["test_tamper_detection_unsigned_catches_corruption"], True),
        "Tamper detection": (
            ["test_tamper_detection_signed", "test_tamper_detection_unsigned_does_not_survive_resealing"],
            True,
        ),
        "Status pricing": (
            [
                "test_hallucinated_consensus_stays_unverified",
                "test_confirmed_requires_grounded_basis",
                "test_grounded_basis_is_required_independently",
                "test_self_correction_cannot_raise_status",
                "test_abstain_packet_cannot_claim_support",
                "test_execution_evidence_alone_can_confirm",
            ],
            True,
        ),
        "Lineage collapse": (
            ["test_duplicate_lineage_counts_once", "test_independent_corroboration_counts_two"],
            True,
        ),
        "Authority": (["test_authority_isolation"], True),
        "Memory gate": (
            [
                "test_memory_poisoning_blocked",
                "test_memory_operation_and_stratum_agree",
                "test_promotion_status_is_required_independently",
            ],
            True,
        ),
        "Contradiction retention": (["test_contradiction_retention"], True),
        "Diagnostics": (
            [
                "test_static_runtime_separation",
                "test_query_hash_cannot_masquerade_as_scd64",
                "test_fingerprints_and_digests_must_be_lowercase_hex",
            ],
            True,
        ),
        "Type safety": (
            ["test_enum_fields_reject_non_scalars_without_crashing",
             "test_malformed_structures_return_errors_and_chain_continues"],
            True,
        ),
        "Chain integrity": (["test_crash_resume_chain_integrity"], True),
    }

    def skill_table_rows(self):
        """The first column of the enforcement table in SKILL.md."""
        lines = (ROOT / "SKILL.md").read_text(encoding="utf-8").splitlines()
        try:
            start = next(i for i, l in enumerate(lines) if l.startswith("| Enforced |"))
        except StopIteration:
            self.fail("SKILL.md no longer contains an enforcement table with an `Enforced` column")
        rows = []
        for line in lines[start + 2:]:
            if not line.startswith("|"):
                break
            rows.append(line.split("|")[1].strip())
        return rows

    def test_every_documented_row_is_bound_to_a_test(self):
        documented = self.skill_table_rows()
        self.assertTrue(documented, "the enforcement table in SKILL.md parsed as empty")
        self.assertEqual(
            sorted(documented),
            sorted(self.ROWS),
            "SKILL.md's enforcement table and the ROWS binding disagree; a row claiming "
            "mechanical enforcement with no test behind it is exactly the v1 defect",
        )

    def test_bound_tests_exist_and_are_not_behavioral_skips(self):
        for row, (names, _) in self.ROWS.items():
            for name in names:
                self.assertTrue(
                    hasattr(Invariants, name),
                    f"row {row!r} cites {name}, which does not exist",
                )
                self.assertNotIn(
                    name.replace("test_", ""),
                    BEHAVIORAL_ROWS,
                    f"row {row!r} claims mechanical enforcement but cites a behavioral skip",
                )

    def test_bound_tests_actually_exercise_the_validator(self):
        """Executed, not merely named: a gutted test body fails this."""
        real = {name: getattr(cp, name) for name in ("validate", "validate_chain", "seal")}
        for row, (names, expects_rejection) in self.ROWS.items():
            calls, rejections = 0, 0

            def spy(fn, counts_rejections):
                def wrapper(*a, **kw):
                    nonlocal calls, rejections
                    calls += 1
                    result = fn(*a, **kw)
                    if counts_rejections and result:
                        rejections += 1
                    return result
                return wrapper

            # ``seal`` counts too: content addressing is a determinism property of
            # the sealer, not a rejection, and a gutted body calls neither.
            for name, fn in real.items():
                setattr(cp, name, spy(fn, name != "seal"))
            try:
                for name in names:
                    before = calls
                    getattr(Invariants(name), name)()
                    # Per-test, not per-row: a row binding several tests would otherwise
                    # let a gutted body hide behind a sibling that still exercises the
                    # validator. That is the masking pattern this guard exists to catch,
                    # and it survived a mutant until it was checked at this granularity.
                    self.assertGreater(
                        calls, before,
                        f"row {row!r} cites {name}, which never touches the packet layer -- "
                        f"a gutted or vacuous test cannot back a documented enforcement row",
                    )
            finally:
                for name, fn in real.items():
                    setattr(cp, name, fn)

            self.assertTrue(
                calls, f"row {row!r} is documented as enforced but its tests never touch the packet layer"
            )
            if expects_rejection:
                self.assertTrue(
                    rejections,
                    f"row {row!r} claims the tooling rejects something, but no bound test "
                    f"ever saw the validator reject anything",
                )


class MiniSchemaSemantics(unittest.TestCase):
    """The bundled evaluator, checked against JSON Schema semantics directly.

    The drift test cross-checks it against the Python validator, and
    `SchemaEvaluatorFidelity` cross-checks it against the real library where one
    is installed -- but on a machine with no `jsonschema` neither of those is a
    check on the evaluator's own semantics. These are: synthetic schemas, one
    per keyword, each with a case that must pass and a case that must fail.
    """

    CASES = [
        ({"type": "string"}, "x", 1),
        ({"type": "integer"}, 1, True),                       # bool is not an integer
        ({"type": "number"}, 1.5, "1.5"),
        ({"type": "boolean"}, True, 1),
        ({"type": "null"}, None, 0),
        ({"type": ["string", "null"]}, None, 1),
        ({"type": "string", "minLength": 3}, "abc", "ab"),
        ({"type": "string", "pattern": "^[0-9a-f]{4}$"}, "abcd", "ABCD"),
        ({"type": "string", "pattern": "^[0-9a-f]{4}$"}, "abcd", "xabcdx"),  # anchors respected
        ({"enum": ["A", "B"]}, "A", "C"),
        ({"const": "v2"}, "v2", "v1"),
        ({"type": "integer", "minimum": 0}, 0, -1),
        ({"type": "integer", "maximum": 1000}, 1000, 1001),
        ({"type": "array", "minItems": 1}, [1], []),
        ({"type": "array", "uniqueItems": True}, [1, 2], [1, 1]),
        ({"type": "array", "items": {"type": "string"}}, ["a"], ["a", 2]),
        ({"type": "object", "required": ["a"]}, {"a": 1}, {}),
        ({"type": "object", "properties": {"a": {"type": "string"}},
          "additionalProperties": False}, {"a": "x"}, {"a": "x", "b": 1}),
        ({"allOf": [{"type": "integer"}, {"minimum": 5}]}, 6, 4),
        ({"oneOf": [{"type": "null"}, {"type": "string"}]}, None, 1),
        ({"oneOf": [{"type": "integer"}, {"minimum": 0}]}, -1, 1),   # matching both is a failure
        ({"not": {"type": "string"}}, 1, "x"),
        ({"if": {"properties": {"k": {"const": "yes"}}, "required": ["k"]},
          "then": {"required": ["v"]}}, {"k": "yes", "v": 1}, {"k": "yes"}),
        ({"if": {"properties": {"k": {"const": "yes"}}, "required": ["k"]},
          "then": {"required": ["v"]}, "else": {"required": ["w"]}}, {"w": 1}, {"z": 1}),
    ]

    def test_each_keyword_accepts_the_valid_case_and_rejects_the_invalid_one(self):
        for index, (schema, good, bad) in enumerate(self.CASES):
            self.assertEqual(
                minischema.errors(good, schema), [],
                f"case {index}: rejected a valid instance {good!r} under {schema}",
            )
            self.assertTrue(
                minischema.errors(bad, schema),
                f"case {index}: accepted an invalid instance {bad!r} under {schema}",
            )

    def test_unknown_type_is_an_error_not_a_silent_pass(self):
        with self.assertRaises(ValueError):
            minischema.errors("x", {"type": "duration"})


class SchemaEvaluatorControl(unittest.TestCase):
    """The drift check is only worth its green if the schema half can say no.

    A permissive evaluator satisfies every implication in the drift test
    vacuously, so these are positive controls: packets the schema must reject
    for reasons that live *only* in the schema, one per keyword family the
    packet format depends on.
    """

    def must_reject(self, mutate, reason):
        bad = copy.deepcopy(SEED)
        mutate(bad)
        self.assertTrue(
            minischema.errors(bad, SCHEMA),
            f"the schema accepted a packet it must reject: {reason}",
        )

    def test_schema_rejects_structural_violations(self):
        cases = [
            (lambda p: p.pop("proposition"), "missing a required property"),
            (lambda p: p.update(rogue_field=1), "an undeclared additional property"),
            (lambda p: p["epistemic"].update(status="TOTALLY_SURE"), "a status outside the enum"),
            (lambda p: p.update(schema_version="cognitive-bus.packet.v1"), "the wrong schema version const"),
            (lambda p: p["integrity"].update(content_sha256="nothex" * 10 + "abcd"), "a non-hex content digest"),
            (lambda p: p["integrity"].update(content_sha256="ab"), "a digest of the wrong length"),
            (lambda p: p.update(logical_clock=-1), "a logical clock below minimum"),
            (lambda p: p.update(logical_clock="2"), "a logical clock of the wrong type"),
            (lambda p: p.update(task_id=""), "an empty task_id"),
            (lambda p: p["memory"].update(candidate_id=""), "an empty memory candidate_id"),
            (lambda p: p["authority"].update(authorization_ref=""), "an empty authorization_ref"),
            (lambda p: p.update(parent_ids=["dup", "dup"]), "duplicate parent ids"),
            (lambda p: p["diagnostics"].update(scd64_predicted_static={"fingerprint": "z" * 64,
                                                                      "provenance": "STATIC_ANALYSIS"}),
             "a non-hex SCD64 fingerprint -- the v1 drift itself"),
            (lambda p: p["diagnostics"].update(scd64_predicted_static="a" * 64),
             "a bare string in an SCD64 slot -- the v1 defect"),
            (lambda p: p["sender"].update(role="EVERYTHING"), "a role outside the enum"),
        ]
        for mutate, reason in cases:
            self.must_reject(mutate, reason)

    # Every hex-constrained field in the packet format, pinned. The v1 defect was
    # one of these silently becoming a length check; a mutant that did exactly
    # that to `evidence[].digest_sha256` survived a battery of hand-written cases,
    # because hand-written cases only cover the fields someone thought of.
    HEX64 = "^[0-9a-f]{64}$"
    PACKET_ID = "^cbp-[0-9a-f]{24}$"
    EXPECTED_PATTERNS = {
        "$.packet_id": PACKET_ID,
        "$.parent_ids[]": PACKET_ID,
        "$.evidence[].digest_sha256(oneOf1)": HEX64,
        "$.diagnostics.scd64_predicted_static(oneOf1).fingerprint": HEX64,
        "$.diagnostics.scd64_confirmed_runtime(oneOf1).fingerprint": HEX64,
        "$.integrity.content_sha256": HEX64,
        "$.integrity.signature(oneOf1).mac": HEX64,
    }

    def test_every_hex_constraint_is_still_a_hex_constraint(self):
        self.assertEqual(
            minischema.pattern_manifest(SCHEMA),
            self.EXPECTED_PATTERNS,
            "the schema's pattern constraints changed; a hex pattern relaxed into a "
            "length check is the v1 drift defect exactly, and a new constrained field "
            "belongs in this manifest deliberately rather than by accident",
        )

    def test_schema_accepts_the_shipped_fixtures(self):
        self.assertEqual(minischema.errors(SEED, SCHEMA), [])
        ledger = json.loads((ROOT / "references" / "fixtures" / "ledger.json").read_text(encoding="utf-8"))
        for index, packet_ in enumerate(ledger):
            self.assertEqual(minischema.errors(packet_, SCHEMA), [], f"ledger packet {index}")


class SchemaEvaluatorFidelity(unittest.TestCase):
    """Where the real library is installed, the bundled one must agree with it.

    This is the only check here that may legitimately skip: it is a check *on*
    the fallback, not the drift guard itself, which now always runs.
    """

    def setUp(self):
        try:
            import jsonschema
        except ImportError:
            self.skipTest("jsonschema not installed; the bundled evaluator still runs the drift check")
        self.jsonschema = jsonschema

    def test_minischema_agrees_with_jsonschema(self):
        for index, case in enumerate(schema_case_battery()):
            try:
                self.jsonschema.validate(case, SCHEMA)
                real_ok = True
            except self.jsonschema.ValidationError:
                real_ok = False
            self.assertEqual(
                minischema.is_valid(case, SCHEMA), real_ok,
                f"case {index}: bundled evaluator disagrees with jsonschema",
            )


class SchemaDriftAlwaysRuns(unittest.TestCase):
    """The guard for the v1 defect class must not be the thing that skips.

    v1's actual bug was schema/validator drift. A drift check that only runs
    where an optional library happens to be installed is a check that reports
    green by not running -- on this machine it did exactly that.
    """

    def test_schema_drift_row_is_not_skipped(self):
        result = unittest.TextTestRunner(stream=open("/dev/null", "w")).run(
            unittest.TestLoader().loadTestsFromTestCase(SchemaDrift)
        )
        self.assertFalse(
            result.skipped,
            f"the schema/validator drift check skipped: {[r for _, r in result.skipped]}",
        )
        self.assertTrue(result.wasSuccessful(), "the schema/validator drift check failed")


class NoFalsePositives(unittest.TestCase):
    """The validator must not reject legitimate traffic."""

    def test_shipped_fixtures_validate(self):
        self.assertEqual(cp.validate(SEED), [])
        ledger = json.loads((ROOT / "references" / "fixtures" / "ledger.json").read_text(encoding="utf-8"))
        self.assertEqual(cp.validate_chain(ledger), [])


def main() -> int:
    suite = unittest.TestLoader().loadTestsFromModule(sys.modules[__name__])
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    total = result.testsRun
    behavioral = [(t, r) for t, r in result.skipped if t.id().rsplit(".", 1)[-1].replace("test_", "") in BEHAVIORAL_ROWS]
    unavailable = [(t, r) for t, r in result.skipped if (t, r) not in behavioral]
    print()
    print(f"{total - len(result.skipped)} of {total} rows mechanically enforced.")
    if unavailable:
        print()
        print(f"{len(unavailable)} cross-check(s) skipped for a missing optional dependency.")
        print("No rule goes unenforced by this: the drift guard runs on the bundled evaluator.")
        for test, reason in unavailable:
            print(f"  - {test.id().rsplit('.', 1)[-1]}: {reason}")
    print()
    print(f"{len(behavioral)} rows the packet layer cannot decide at all:")
    for test, reason in behavioral:
        print(f"  - {test.id().rsplit('.', 1)[-1]}: {reason}")
    print()
    print("A green run does NOT mean the protocol was evaluated. It means the packet")
    print("layer refuses the packet-shaped violations. The rows above still need the")
    print("model harness described in references/evals.md, and nothing here substitutes")
    print("for it.")
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
