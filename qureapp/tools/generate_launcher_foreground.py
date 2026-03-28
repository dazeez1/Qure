#!/usr/bin/env python3
"""Build a 1024×1024 adaptive-icon foreground with safe-zone padding from Vector.png.

Requires: pip install Pillow (use a venv).

Android adaptive icons use a circular/squircle mask; keep important artwork in
the center ~66dp of the 108dp layer (~61% of width). This script scales the
source into ~58% of the canvas so edges are not clipped.

Usage (easiest — works even when system python3 ≠ pip’s python):
  ./tools/run_generate_launcher_foreground.sh

Manual (same interpreter for pip + script):
  python3 -m venv .venv-tools && . .venv-tools/bin/activate
  pip install -r tools/requirements.txt
  python tools/generate_launcher_foreground.py

Then: dart run flutter_launcher_icons
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    exe = sys.executable
    raise SystemExit(
        "Pillow is not installed for the Python that ran this script.\n"
        f"  Interpreter: {exe}\n\n"
        "Fix (pick one):\n"
        "  1) From qureapp/:  ./tools/run_generate_launcher_foreground.sh\n"
        f"  2) Same interpreter:  {exe} -m pip install --user Pillow\n"
        "     (If that fails with “externally-managed-environment”, use option 1.)\n"
    ) from None

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets/images/Vector.png"
OUT = ROOT / "assets/images/launcher_icon_foreground.png"
CANVAS = 1024
TARGET_RATIO = 0.58


def main() -> None:
    fg = Image.open(SRC).convert("RGBA")
    w, h = fg.size
    max_side = int(CANVAS * TARGET_RATIO)
    scale = min(max_side / w, max_side / h)
    nw, nh = int(w * scale), int(h * scale)
    fg = fg.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(fg, ((CANVAS - nw) // 2, (CANVAS - nh) // 2), fg)
    canvas.save(OUT, "PNG")
    print(f"Wrote {OUT} (source was {w}×{h})")


if __name__ == "__main__":
    main()
