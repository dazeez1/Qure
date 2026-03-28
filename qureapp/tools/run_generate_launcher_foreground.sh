#!/usr/bin/env bash
# Run from anywhere; installs Pillow in qureapp/.venv-tools if needed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VENV="$ROOT/.venv-tools"
if [[ ! -d "$VENV" ]]; then
  python3 -m venv "$VENV"
fi
"$VENV/bin/pip" install -q -r "$ROOT/tools/requirements.txt"
"$VENV/bin/python" "$ROOT/tools/generate_launcher_foreground.py"
