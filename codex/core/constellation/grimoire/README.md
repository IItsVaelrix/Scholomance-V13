# The Grimoire — Construction Registry

**BONDS are the spells the chart executes.  
The Grimoire explains what each spell means about grammar.**

## One source of truth

```
         CONSTRUCTIONS  (families/*.js)
          /      |      \
         ↓       ↓       ↓
      BONDS   anatomy   audit tooling
         ↓
      compose / compose-packed  (dumb 4-tuples only)
```

Do **not** hand-edit `BONDS` in `compose.js`. Edit a construction in the
appropriate family file; `BONDS` is a projection.

## Ontological status

| status | Meaning |
|---|---|
| `grammar` | Internal structure is intended as linguistically truthful |
| `scaffold` | Parser assembly only — **no linguistic ontology claim** |
| `approximation` | Real phenomenon; known collapsed distinctions (`limitation`) |
| `deprecated` | Known-wrong; migration target |

**Firewall for phrasing / semantics:**  
Scaffolds may help build structure, but consumers must never infer linguistic
facts merely from scaffold identity. Use `mayClaimLinguisticFact(c)`.

## Families

Each file under `families/` is a patch of English the parser currently knows —
not the Library of Alexandria.

Ask: *which families, at what fidelity?* — not *how much English is done?*

## Parser contract

The chart still only sees:

```js
[leftType, rightType, resultType, headIndex]
```

Chemistry (what can combine) is unchanged in shape.  
Audition (what wins) is separate.  
This layer says what those structures are **allowed to mean**.
