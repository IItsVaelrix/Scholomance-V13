"""Aether Reserve — token + spend tracking for the cockpit.

Tokens are counted exactly from each API response's ``usage`` block. Cost is a
best-effort estimate derived from a tunable price table (USD per million
tokens), because providers don't agree on how — or whether — they report price.
State persists to ``.aether_meter.json`` beside ``.env`` so the gauge reflects
true cumulative spend across restarts, not just the current session.
"""

import json
import os
import threading

# USD per 1,000,000 tokens → (input, output). Matched by longest-prefix on the
# lowercased model id. Override any of these (and the budget) in .env via
# AETHER_BUDGET_USD / AETHER_PRICE_<MODELKEY>_IN / _OUT if you want exact billing.
PRICE_TABLE = {
    "grok-build":   (3.0, 9.0),
    "grok-4.20":    (5.0, 15.0),
    "grok-4":       (5.0, 15.0),
    "grok":         (5.0, 15.0),
    "gpt-4o":       (2.5, 10.0),
    "gpt-4":        (5.0, 15.0),
    "gemini-2.5-pro":   (1.25, 10.0),
    "gemini":       (0.30, 2.50),
    "llama":        (0.59, 0.79),
    "blackboxai":   (0.0, 0.0),
}
_DEFAULT_PRICE = (1.0, 3.0)
_DEFAULT_BUDGET = 20.0


def _state_path():
    base = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    return os.path.join(base, ".aether_meter.json")


def _as_int(v):
    """Coerce a usage value to int, tolerating ints, floats, and numeric
    strings like "1234" or "1234.0". Anything else counts as zero."""
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def _price_for(model):
    mid = (model or "").lower()
    best = None
    for prefix, price in PRICE_TABLE.items():
        if prefix in mid and (best is None or len(prefix) > len(best[0])):
            best = (prefix, price)
    return best[1] if best else _DEFAULT_PRICE


class TokenMeterService:
    def __init__(self):
        self._lock = threading.Lock()
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.calls = 0
        self.cost_usd = 0.0
        self.last_model = None
        self.last_call_cost = 0.0
        self.budget_usd = self._env_budget()
        # UI hook: set by the app to schedule a thread-safe widget refresh.
        self.on_update = None
        self._load()

    # ── budget ──────────────────────────────────────────────────────
    def _env_budget(self):
        raw = os.environ.get("AETHER_BUDGET_USD")
        try:
            return float(raw) if raw else _DEFAULT_BUDGET
        except ValueError:
            return _DEFAULT_BUDGET

    def set_budget(self, amount):
        with self._lock:
            self.budget_usd = max(0.0, float(amount))
            self._save()
        self._notify()

    def reset_spend(self):
        with self._lock:
            self.prompt_tokens = self.completion_tokens = self.calls = 0
            self.cost_usd = self.last_call_cost = 0.0
            self._save()
        self._notify()

    # ── recording ───────────────────────────────────────────────────
    def record(self, model, usage):
        """Fold one API response's ``usage`` dict into the running totals.

        This sits in the API critical path, so it must NEVER raise into the
        caller — a malformed ``usage`` payload can't be allowed to abort an
        AI turn. All failures are swallowed; telemetry is best-effort.
        """
        try:
            if not isinstance(usage, dict):
                return
            p = _as_int(usage.get("prompt_tokens"))
            c = _as_int(usage.get("completion_tokens"))
            if p == 0 and c == 0:
                return
            in_rate, out_rate = _price_for(model)
            cost = (p / 1_000_000) * in_rate + (c / 1_000_000) * out_rate
            with self._lock:
                self.prompt_tokens += p
                self.completion_tokens += c
                self.calls += 1
                self.cost_usd += cost
                self.last_model = model
                self.last_call_cost = cost
                self._save()
            self._notify()
        except Exception:
            return

    # ── derived snapshot for the widget ─────────────────────────────
    def snapshot(self):
        with self._lock:
            total = self.prompt_tokens + self.completion_tokens
            remaining = max(0.0, self.budget_usd - self.cost_usd)
            ratio = remaining / self.budget_usd if self.budget_usd > 0 else 0.0
            avg = self.cost_usd / self.calls if self.calls else 0.0
            return {
                "tokens": total,
                "calls": self.calls,
                "cost": self.cost_usd,
                "budget": self.budget_usd,
                "remaining": remaining,
                "ratio": max(0.0, min(1.0, ratio)),
                "avg_cost": avg,
                "model": self.last_model,
            }

    # ── plumbing ────────────────────────────────────────────────────
    def _notify(self):
        cb = self.on_update
        if cb:
            try:
                cb()
            except Exception:
                pass

    def _load(self):
        try:
            with open(_state_path(), "r") as f:
                d = json.load(f)
            self.prompt_tokens = int(d.get("prompt_tokens", 0))
            self.completion_tokens = int(d.get("completion_tokens", 0))
            self.calls = int(d.get("calls", 0))
            self.cost_usd = float(d.get("cost_usd", 0.0))
            self.last_model = d.get("last_model")
            if "budget_usd" in d and not os.environ.get("AETHER_BUDGET_USD"):
                self.budget_usd = float(d["budget_usd"])
        except (FileNotFoundError, ValueError, json.JSONDecodeError):
            pass

    def _save(self):
        try:
            with open(_state_path(), "w") as f:
                json.dump({
                    "prompt_tokens": self.prompt_tokens,
                    "completion_tokens": self.completion_tokens,
                    "calls": self.calls,
                    "cost_usd": round(self.cost_usd, 6),
                    "budget_usd": self.budget_usd,
                    "last_model": self.last_model,
                }, f, indent=2)
        except OSError:
            pass


# Shared singleton — both API services feed it, the widget reads it.
meter = TokenMeterService()
