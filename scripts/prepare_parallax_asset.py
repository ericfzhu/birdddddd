#!/usr/bin/env python3
"""Normalize authored parallax plates into source and compact runtime images."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


SOURCE_SIZE = (1672, 941)
RUNTIME_SIZE = (512, 288)
TARGET_ASPECT = SOURCE_SIZE[0] / SOURCE_SIZE[1]


def centered_crop(image: Image.Image) -> Image.Image:
    width, height = image.size
    aspect = width / height
    if aspect > TARGET_ASPECT:
        crop_width = round(height * TARGET_ASPECT)
        left = (width - crop_width) // 2
        return image.crop((left, 0, left + crop_width, height))
    crop_height = round(width / TARGET_ASPECT)
    top = (height - crop_height) // 2
    return image.crop((0, top, width, top + crop_height))


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--source-output", type=Path, required=True)
    parser.add_argument("--runtime-output", type=Path, required=True)
    args = parser.parse_args()

    with Image.open(args.input) as opened:
        mode = "RGBA" if "A" in opened.getbands() else "RGB"
        plate = centered_crop(opened.convert(mode))
        source = plate.resize(SOURCE_SIZE, Image.Resampling.LANCZOS)
        runtime = source.resize(RUNTIME_SIZE, Image.Resampling.LANCZOS)
        save_png(source, args.source_output)
        save_png(runtime, args.runtime_output)


if __name__ == "__main__":
    main()
