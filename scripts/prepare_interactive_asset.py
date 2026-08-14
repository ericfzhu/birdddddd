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
    parser.add_argument("--alpha-threshold", type=int, default=0)
    args = parser.parse_args()
    if not 0 <= args.alpha_threshold < 255:
        raise SystemExit("--alpha-threshold must be between 0 and 254")

    image = Image.open(args.input).convert("RGBA")
    alpha = image.getchannel("A")
    crop_mask = alpha.point(lambda value: 255 if value > args.alpha_threshold else 0)
    bounds = crop_mask.getbbox()
    if not bounds:
        raise SystemExit(f"No visible pixels in {args.input}")
    image = image.crop(bounds)
    image.thumbnail((args.max_width, args.max_height), Image.Resampling.LANCZOS)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    image.save(args.output, optimize=True)


if __name__ == "__main__":
    main()
