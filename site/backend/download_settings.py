#!/usr/bin/env python3
"""
Download large settings files for the backend.
This runs on Railway, not during Cloudflare build.
"""

import gdown
from pathlib import Path


def download_large_settings():
    """Download large JSON files that are too big for Cloudflare Pages."""

    # Create settings directory
    settings_dir = Path(__file__).parent / "settings"
    settings_dir.mkdir(exist_ok=True)

    # Download half_plane_interior_triangles.json
    file_id = "1jVitc2cdeJRDSkNHvkMqvjEIwOLWckSL"
    url = f"https://drive.google.com/uc?id={file_id}"
    output_path = settings_dir / "half_plane_interior_triangles.json"

    # Skip if already exists
    if output_path.exists():
        print(f"✓ {output_path.name} already exists ({output_path.stat().st_size / (1024*1024):.1f} MB)")
        return

    print(f"Downloading {output_path.name} from Google Drive...")
    gdown.download(url, str(output_path), quiet=False)

    file_size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"✓ Download complete! {file_size_mb:.2f} MB")


if __name__ == "__main__":
    download_large_settings()
