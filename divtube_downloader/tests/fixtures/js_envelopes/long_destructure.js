// AnalyzePanel idiom: a destructured parameter list longer than the old
// 7-line bailout, so the body brace was never reached.
export default function AnalyzePanel({
  initialQuery = '',
  onCraftAction,
  onDismiss,
  telemetry,
  registry,
  seed = 0,
  verbose = false,
  labels = {},
}) {
  const state = { initialQuery, seed };
  if (verbose) {
    return { state, labels, telemetry, registry };
  }
  return state;
}
