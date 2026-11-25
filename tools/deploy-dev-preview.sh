#!/usr/bin/env bash
# Publish the current dev branch (sam-dev-1, dev-elior-1, …) to the shared dev preview:
#   API  -> Railway project "ecshape-dev", service "api"   (api-production-9d8a41c7.up.railway.app)
#   site -> Vercel project "ecshape-preview"              (https://ecshape-preview.vercel.app)
# Production (Railway "Ecshape.org" / ecshape.com) is never touched. Pushing to git does NOT deploy the preview.
#
# One-time setup on a new machine:
#   npm i -g @railway/cli vercel
#   railway login        # account with access to the "ecshape-dev" project
#   vercel login         # account with access to the "samuelgabison" team / "ecshape-preview" project
#
# Usage (from anywhere in the repo):
#   tools/deploy-dev-preview.sh            # API + site
#   tools/deploy-dev-preview.sh --site     # site only
#   tools/deploy-dev-preview.sh --api      # API only
#
# Note: both dev branches publish to the SAME preview; the last deploy wins.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DO_API=1
DO_SITE=1
case "${1:-}" in
  --site) DO_API=0 ;;
  --api) DO_SITE=0 ;;
  "") ;;
  *) echo "Unknown option: $1 (use --site or --api)" >&2; exit 2 ;;
esac

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" == "main" ]]; then
  echo "Refusing to publish 'main' to the dev preview. Switch to your dev branch (e.g. dev-elior-1)." >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "You have uncommitted changes. Commit (and push) them first so the preview matches git." >&2
  git status --short >&2
  exit 1
fi
COMMIT="$(git rev-parse --short HEAD)"
echo "Publishing $BRANCH @ $COMMIT to the dev preview…"

if [[ $DO_API == 1 ]]; then
  command -v railway >/dev/null || { echo "Railway CLI missing: npm i -g @railway/cli" >&2; exit 1; }
  railway link --project ecshape-dev --service api --environment production >/dev/null
  echo "→ API (Railway ecshape-dev / api)…"
  railway up --service api --environment production --ci
fi

if [[ $DO_SITE == 1 ]]; then
  command -v vercel >/dev/null || { echo "Vercel CLI missing: npm i -g vercel" >&2; exit 1; }
  cd "$ROOT/Frontend"
  if [[ ! -f .vercel/project.json ]]; then
    vercel link --yes --project ecshape-preview --scope samuelgabison >/dev/null
  fi
  echo "→ Site (Vercel ecshape-preview)…"
  vercel deploy --prod --yes --scope samuelgabison
fi

echo "Done: https://ecshape-preview.vercel.app ($BRANCH @ $COMMIT)"
