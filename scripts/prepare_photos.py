"""Prepare the explicitly curated Lightroom exports in photos/config.yaml.

Run with uv and supply the configuration file as the sole argument.
Original exports stay outside the website. Missing sources fail the build.
"""

import json
import sys
from pathlib import Path

import yaml
from PIL import Image, ImageOps


config_path = Path(sys.argv[1]).resolve()
config = yaml.safe_load(config_path.read_text())
root = config_path.parent.parent
settings = config["images"]
Image.MAX_IMAGE_PIXELS = settings["max_source_pixels"]
destination = root / settings["output_directory"]
destination.mkdir(parents=True, exist_ok=True)
manifest = {key: config[key] for key in ("page", "labels", "interaction", "layout")}
manifest["photos"] = []
ids = [photo["id"] for photo in config["photos"]]
assert ids and len(ids) == len(set(ids)), "Photo IDs must be present and unique"
group_ids = [photo_id for group in config["layout"]["groups"] for photo_id in group["photos"]]
assert group_ids == ids, "Gallery layout must contain every photo exactly once in display order"
for group in config["layout"]["groups"]:
    expected = {"feature": 1, "quiet": 1, "pair": 2, "offset": 2}[group["kind"]]
    assert len(group["photos"]) == expected, f"Invalid gallery group: {group}"
    assert config["layout"]["image_sizes"][group["kind"]], "Image sizes must be configured"
assert set(settings["preview_filters"]).issubset(ids), "Preview filter references an unknown photo"

for photo in config["photos"]:
    source = (root / config["sources"][photo["collection"]] / photo["file"]).resolve()
    with Image.open(source) as original:
        original.load()
        icc_profile = original.info["icc_profile"]
        im = ImageOps.exif_transpose(original).convert("RGB")
        record = {key: photo[key] for key in ("id", "title", "alt")}
        record["previewFilter"] = settings["preview_filters"].get(photo["id"], settings["default_preview_filter"])
        record.update(width=im.width, height=im.height)
        for variant in settings["variants"]:
            resized = im.copy()
            width = min(variant["width"], im.width)
            height = round(im.height * width / im.width)
            resized = resized.resize((width, height), Image.Resampling.LANCZOS)
            filename = f'{photo["id"]}-{variant["width"]}.jpg'
            resized.save(
                destination / filename,
                "JPEG",
                quality=variant["quality"],
                optimize=True,
                progressive=True,
                icc_profile=icc_profile,
            )
            record[variant["key"]] = f'{settings["public_path"]}/{filename}'
        manifest["photos"].append(record)

(root / settings["manifest"]).write_text(json.dumps(manifest, indent=2) + "\n")
print(f'Prepared {len(manifest["photos"])} photographs and {len(ids) * len(settings["variants"])} web images.')
