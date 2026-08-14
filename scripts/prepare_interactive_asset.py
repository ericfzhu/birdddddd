#!/usr/bin/env python3
"""Crop an authored alpha PNG and create a compact nearest-neighbour runtime copy."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--max-width", type=int, required=True)
    parser.add_argument("--max-height", type=int, required=True)
    args = parser.parse_args()

    image = Image.open(args.input).convert("RGBA")
    bounds = image.getchannel("A").getbbox()
    if not bounds:
        raise SystemExit(f"No visible pixels in {args.input}")
    image = image.crop(bounds)
    image.thumbnail((args.max_width, args.max_height), Image.Resampling.LANCZOS)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    image.save(args.output, optimize=True)


if __name__ == "__main__":
    main()
