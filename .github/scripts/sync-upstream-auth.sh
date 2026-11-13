#!/usr/bin/env bash
set -euo pipefail

: "${CODEX_HOME:?CODEX_HOME must name the isolated sync login directory.}"

case "${1:-}" in
  prepare)
    : "${CODEX_AUTH_JSON:?Replace CODEX_AUTH_JSON with a fresh automation-only Codex login.}"
    : "${GH_TOKEN:?SYNC_TOKEN needs repository Secrets read/write to preserve refreshed credentials.}"
    umask 077
    mkdir -p "$CODEX_HOME"
    printf '%s' "$CODEX_AUTH_JSON" > "$CODEX_HOME/auth.json"
    cp "$CODEX_HOME/auth.json" "$CODEX_HOME/auth.initial.json"
    printf 'cli_auth_credentials_store = "file"\n' > "$CODEX_HOME/config.toml"
    ;;
  save)
    if [ ! -s "$CODEX_HOME/auth.json" ]; then
      echo "::error::Codex auth.json is missing or empty; CODEX_AUTH_JSON was not changed."
      exit 1
    fi
    if cmp -s "$CODEX_HOME/auth.initial.json" "$CODEX_HOME/auth.json"; then
      exit 0
    fi
    if ! gh secret set CODEX_AUTH_JSON --repo "$GITHUB_REPOSITORY" < "$CODEX_HOME/auth.json"; then
      echo "::error::Could not preserve rotated Codex credentials. Give SYNC_TOKEN repository Secrets read/write, then replace CODEX_AUTH_JSON with a fresh automation-only login."
      exit 1
    fi
    ;;
  *)
    echo "Usage: $0 prepare|save" >&2
    exit 2
    ;;
esac
