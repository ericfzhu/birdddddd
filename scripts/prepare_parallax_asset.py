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


def remove_neutral_checkerboard(image: Image.Image) -> Image.Image:
    """Clear bright neutral preview pixels while preserving saturated authored art."""
    rgba = image.convert("RGBA")
    pixels = []
    for red, green, blue, alpha in rgba.getdata():
        neutral = max(red, green, blue) - min(red, green, blue) <= 18
        if neutral and min(red, green, blue) >= 180:
            pixels.append((red, green, blue, 0))
        else:
            pixels.append((red, green, blue, alpha))
    rgba.putdata(pixels)
    return rgba


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--source-output", type=Path, required=True)
    parser.add_argument("--runtime-output", type=Path, required=True)
    parser.add_argument("--remove-neutral-checkerboard", action="store_true")
    args = parser.parse_args()

    with Image.open(args.input) as opened:
        mode = "RGBA" if "A" in opened.getbands() else "RGB"
        plate = centered_crop(opened.convert(mode))
        if args.remove_neutral_checkerboard:
            plate = remove_neutral_checkerboard(plate)
        source = plate.resize(SOURCE_SIZE, Image.Resampling.LANCZOS)
        runtime = source.resize(RUNTIME_SIZE, Image.Resampling.LANCZOS)
        save_png(source, args.source_output)
        save_png(runtime, args.runtime_output)


if __name__ == "__main__":
    main()
