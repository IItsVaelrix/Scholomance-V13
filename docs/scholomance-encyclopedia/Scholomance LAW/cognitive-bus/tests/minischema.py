#!/usr/bin/env python3
"""A dependency-free evaluator for the JSON Schema subset packet-schema.json uses.

Why this exists: the schema/validator drift check is the guard for the exact
defect that broke v1, and gating it on an optional `jsonschema` install meant it
reported green by not running. This covers the keywords the packet schema
actually contains -- nothing more, so it stays small enough to audit:

    type properties required additionalProperties items minItems uniqueItems
    minLength pattern enum const minimum maximum allOf oneOf not if/then/else

`SchemaEvaluatorFidelity` in test_invariants.py cross-checks this module against
the real `jsonschema` wherever that library is present, so the fallback is not
taken on trust. If the schema ever grows a keyword this does not implement,
`unsupported_keywords()` reports it and the drift test fails loudly rather than
silently ignoring the new rule.
"""

from __future__ import annotations

import re
from typing import Any

SUPPORTED = {
    "type", "properties", "required", "additionalProperties", "items", "minItems",
    "uniqueItems", "minLength", "pattern", "enum", "const", "minimum", "maximum",
    "allOf", "oneOf", "not", "if", "then", "else",
    # annotations, no validation effect
    "$schema", "$id", "title", "description", "$comment", "examples", "default",
}

_TYPES: dict[str, Any] = {
    "object": dict,
    "array": list,
    "string": str,
    "boolean": bool,
    "null": type(None),
}


def unsupported_keywords(schema: Any, seen: set[str] | None = None) -> set[str]:
    """Every keyword in `schema` this module does not implement."""
    seen = set() if seen is None else seen
    if isinstance(schema, dict):
        for key, value in schema.items():
            if key == "properties" and isinstance(value, dict):
                for sub in value.values():
                    unsupported_keywords(sub, seen)
                continue
            if key not in SUPPORTED:
                seen.add(key)
            unsupported_keywords(value, seen)
    elif isinstance(schema, list):
        for item in schema:
            unsupported_keywords(item, seen)
    return seen


def _type_ok(instance: Any, name: str) -> bool:
    if name == "integer":
        return isinstance(instance, int) and not isinstance(instance, bool)
    if name == "number":
        return isinstance(instance, (int, float)) and not isinstance(instance, bool)
    if name == "boolean":
        return isinstance(instance, bool)
    expected = _TYPES.get(name)
    if expected is None:
        raise ValueError(f"minischema does not implement type {name!r}")
    if expected is str and isinstance(instance, bool):
        return False
    return isinstance(instance, expected)


def _canonical(value: Any) -> str:
    import json

    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def errors(instance: Any, schema: Any, path: str = "$") -> list[str]:
    """Validation errors for `instance` against `schema`; empty means valid."""
    if schema is True or schema == {}:
        return []
    if schema is False:
        return [f"{path}: schema forbids any value"]

    out: list[str] = []

    if "type" in schema:
        names = schema["type"]
        names = names if isinstance(names, list) else [names]
        if not any(_type_ok(instance, n) for n in names):
            out.append(f"{path}: expected type {'|'.join(names)}")
            return out  # further keywords assume the type held

    if "const" in schema and _canonical(instance) != _canonical(schema["const"]):
        out.append(f"{path}: must equal {schema['const']!r}")

    if "enum" in schema and not any(_canonical(instance) == _canonical(e) for e in schema["enum"]):
        out.append(f"{path}: not one of {schema['enum']!r}")

    if isinstance(instance, str):
        if "minLength" in schema and len(instance) < schema["minLength"]:
            out.append(f"{path}: shorter than minLength {schema['minLength']}")
        if "pattern" in schema and re.search(schema["pattern"], instance) is None:
            out.append(f"{path}: does not match {schema['pattern']!r}")

    if isinstance(instance, (int, float)) and not isinstance(instance, bool):
        if "minimum" in schema and instance < schema["minimum"]:
            out.append(f"{path}: below minimum {schema['minimum']}")
        if "maximum" in schema and instance > schema["maximum"]:
            out.append(f"{path}: above maximum {schema['maximum']}")

    if isinstance(instance, list):
        if "minItems" in schema and len(instance) < schema["minItems"]:
            out.append(f"{path}: fewer than minItems {schema['minItems']}")
        if schema.get("uniqueItems") and len({_canonical(i) for i in instance}) != len(instance):
            out.append(f"{path}: items are not unique")
        if "items" in schema:
            for index, item in enumerate(instance):
                out += errors(item, schema["items"], f"{path}[{index}]")

    if isinstance(instance, dict):
        for name in schema.get("required", []):
            if name not in instance:
                out.append(f"{path}: missing required property {name!r}")
        properties = schema.get("properties", {})
        for name, value in instance.items():
            if name in properties:
                out += errors(value, properties[name], f"{path}.{name}")
            elif schema.get("additionalProperties") is False:
                out.append(f"{path}: additional property {name!r} is not allowed")
            elif isinstance(schema.get("additionalProperties"), dict):
                out += errors(value, schema["additionalProperties"], f"{path}.{name}")

    for index, sub in enumerate(schema.get("allOf", [])):
        out += errors(instance, sub, f"{path}(allOf[{index}])")

    if "oneOf" in schema:
        matched = [i for i, sub in enumerate(schema["oneOf"]) if not errors(instance, sub, path)]
        if len(matched) != 1:
            out.append(f"{path}: matched {len(matched)} oneOf branches, expected exactly 1")

    if "not" in schema and not errors(instance, schema["not"], path):
        out.append(f"{path}: matched a forbidden `not` schema")

    if "if" in schema:
        branch = "then" if not errors(instance, schema["if"], path) else "else"
        if branch in schema:
            out += errors(instance, schema[branch], f"{path}({branch})")

    return out


def is_valid(instance: Any, schema: Any) -> bool:
    return not errors(instance, schema)


def pattern_manifest(schema: Any, path: str = "$") -> dict[str, str]:
    """Every `pattern` constraint in `schema`, keyed by the path that carries it.

    v1's drift was a hex `pattern` quietly becoming a bare length check on one
    field. Enumerating them lets a test pin the whole set at once, so loosening
    any single field fails rather than fitting through a gap in hand-written
    cases -- which is how `evidence[].digest_sha256` slipped a mutant through.
    """
    found: dict[str, str] = {}
    if not isinstance(schema, dict):
        return found
    if isinstance(schema.get("pattern"), str):
        found[path] = schema["pattern"]
    for key, value in schema.items():
        if key == "properties" and isinstance(value, dict):
            for name, sub in value.items():
                found.update(pattern_manifest(sub, f"{path}.{name}"))
        elif key == "items":
            found.update(pattern_manifest(value, f"{path}[]"))
        elif key in ("oneOf", "allOf", "anyOf") and isinstance(value, list):
            for index, sub in enumerate(value):
                found.update(pattern_manifest(sub, f"{path}({key}{index})"))
        elif key in ("if", "then", "else"):
            found.update(pattern_manifest(value, f"{path}({key})"))
        elif key == "additionalProperties" and isinstance(value, dict):
            found.update(pattern_manifest(value, f"{path}.*"))
    return found
