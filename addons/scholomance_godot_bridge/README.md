# Scholomance Godot Bridge Addon

## Bytecode Search Code
`SCHOL-ENC-BYKE-SEARCH-GODOT-BRIDGE-ADDON`

Phase 4 prototype for importing Scholomance Godot artifacts in shadow mode or strict validation mode.

## Supported Artifacts
- `.pbrain` files with `scholomance.pixelbrain.godot.v1` import as a `PackedScene` containing a `Sprite2D` with a generated `ImageTexture`.
- `.wand` files with `scholomance.wand.godot.v1` import as a metadata-only `PackedScene`; formula evaluation is deferred.
- `.divwand` files with `scholomance.divwand.godot.v1` import as a best-effort `Control` tree.

## Shadow Mode
Unsupported fields and roles call `push_warning()` and fall back to safe placeholder nodes. Importers do not enforce strict failure semantics in Phase 3.

## Strict Validation
Each importer exposes a `Strict Validation` preset and a `strict_validation` import option. Strict mode returns `ERR_INVALID_DATA` before scene creation when:

- artifact `kind` or `version` is unsupported.
- PixelBrain canvas fields are missing, non-numeric, or non-positive.
- PixelBrain coordinates are malformed or outside canvas bounds.
- Wand proposal formulas use an unsupported formula type.
- DivWand layout nodes use unsupported roles, malformed child arrays, or unsupported fields.

Shadow mode remains the default so existing local artifacts continue to import with warnings.
