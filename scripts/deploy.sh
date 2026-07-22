#!/usr/bin/env bash
#
# One-command deploy for Scholomance.
#
# Builds the production bundle, then ships to apex https://scholomance.live:
#   • Cloudflare Pages project scholomance-v12 (Production / master) — SPA mirror
#   • Fly.io app scholomance-v12 — owns scholomance.live certs; serves SPA+API
#
# NOTE: scholomance-v13 is staging/preview only (main.scholomance-v13.pages.dev /
# scholomance-v13.fly.dev). Override FLY_APP / CF_PROJECT to target it.
#
# The local `npm run build` is what Cloudflare Pages uploads. Fly rebuilds from the
# Dockerfile independently (pass DEPLOY_CACHEBUST so the SPA layer is not stale).
#
# Usage:
#   scripts/deploy.sh                 # build, then deploy Cloudflare + Fly
#   scripts/deploy.sh --skip-build    # reuse the existing ./dist
#   scripts/deploy.sh --cf-only       # Cloudflare Pages only
#   scripts/deploy.sh --fly-only      # Fly only
#   scripts/deploy.sh --help
#
# Config (override via env):
#   CF_PROJECT  (default: scholomance-v12)  — apex Pages Production project
#   CF_BRANCH   (default: master)           — Pages Production branch
#   FLY_APP     (default: scholomance-v12)  — owns certs for scholomance.live
#   DIST_DIR    (default: ./dist)
#   DEPLOY_CACHEBUST (default: unix time)   — busts Docker SPA layer cache
#
# Staging / preview (does NOT update apex):
#   CF_PROJECT=scholomance-v13 CF_BRANCH=main FLY_APP=scholomance-v13 scripts/deploy.sh
#
set -euo pipefail

CF_PROJECT="${CF_PROJECT:-scholomance-v12}"
CF_BRANCH="${CF_BRANCH:-master}"
FLY_APP="${FLY_APP:-scholomance-v12}"
DIST_DIR="${DIST_DIR:-./dist}"
DEPLOY_CACHEBUST="${DEPLOY_CACHEBUST:-$(date +%s)}"

# Always operate from the repo root (this script lives in scripts/).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

DO_BUILD=1
DO_CF=1
DO_FLY=1

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()  { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

usage() {
  sed -n '2,45p' "$0" | sed 's/^#\{0,1\} \{0,1\}//'
  exit 0
}

for arg in "$@"; do
  case "$arg" in
    --skip-build) DO_BUILD=0 ;;
    --cf-only)    DO_FLY=0 ;;
    --fly-only)   DO_BUILD=0; DO_CF=0 ;;
    --no-cf)      DO_CF=0 ;;
    --no-fly)     DO_FLY=0 ;;
    -h|--help)    usage ;;
    *) die "Unknown option: $arg (try --help)" ;;
  esac
done

# ── Build ────────────────────────────────────────────────────────────────────
if [ "$DO_BUILD" -eq 1 ]; then
  log "Building production bundle (npm run build)…"
  npm run build || die "Build failed — not deploying."
  ok "Build complete → ${DIST_DIR}"
else
  log "Skipping build (--skip-build)."
fi

# ── Cloudflare Pages (SPA) ───────────────────────────────────────────────────
if [ "$DO_CF" -eq 1 ]; then
  [ -d "${DIST_DIR}" ] || die "${DIST_DIR} not found — run without --skip-build first."
  log "Deploying SPA → Cloudflare Pages (project: ${CF_PROJECT}, branch: ${CF_BRANCH})…"
  npx wrangler pages deploy "${DIST_DIR}" \
    --project-name "${CF_PROJECT}" \
    --branch "${CF_BRANCH}" \
    --commit-dirty=true \
    || die "Cloudflare deploy failed. If it's an auth error (code 10000), run:  npx wrangler login"
  ok "Cloudflare Pages deployed."
fi

# ── Fly.io (API) ─────────────────────────────────────────────────────────────
if [ "$DO_FLY" -eq 1 ]; then
  command -v flyctl >/dev/null 2>&1 || die "flyctl not found in PATH."
  log "Deploying API+SPA → Fly (app: ${FLY_APP}, cachebust: ${DEPLOY_CACHEBUST})… (Docker build; can take several minutes)"
  flyctl deploy --remote-only --app "${FLY_APP}" \
    --build-arg "DEPLOY_CACHEBUST=${DEPLOY_CACHEBUST}" \
    || die "Fly deploy failed. Check:  flyctl auth whoami   and   flyctl status --app ${FLY_APP}"
  ok "Fly deployed → https://scholomance.live/"
fi

log "Deploy finished."
