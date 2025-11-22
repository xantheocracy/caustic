#!/usr/bin/env python3
"""
Script to download large data files from Google Drive.

This script downloads half_plane_interior_triangles.json from Google Drive
to the frontend/settings directory. The file is too large to commit to git.
"""

import gdown
import os
from pathlib import Path


def download_half_plane_triangles():
    """Download the half_plane_interior_triangles.json file from Google Drive."""

    # You need to get the file ID from Google Drive
    # To get it: Right-click the file -> Get link -> Share link
    # The file ID is the part after /d/ and before /view
    # Example: https://drive.google.com/file/d/FILE_ID_HERE/view?usp=sharing

    file_id = "1clgwknd1vSkORCYDqzDfcLOVVTMA0BOy"

    # Construct the download URL
    url = f"https://drive.google.com/uc?id={file_id}"

    # Set the output path
    output_dir = Path("frontend/settings")
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "half_plane_interior_triangles.json"

    print(f"Downloading half_plane_interior_triangles.json to {output_path}...")

    # Download the file
    gdown.download(url, str(output_path), quiet=False)

    print(f"Download complete! File saved to {output_path}")

    # Check file size
    file_size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"File size: {file_size_mb:.2f} MB")


if __name__ == "__main__":
    download_half_plane_triangles()
