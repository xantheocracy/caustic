#!/bin/bash
# Cloudflare Pages build script

echo "Starting build process..."

# Install gdown for downloading from Google Drive
pip install gdown

# Download large data files
echo "Downloading large JSON files from Google Drive..."
python download_data.py

echo "Build complete!"
