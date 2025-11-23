#!/bin/bash
# Railway startup script

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "Working directory: $(pwd)"

echo "Installing caustic package from parent directory..."
pip install -e ../..

echo "Downloading large settings files..."
python download_settings.py

echo "Starting FastAPI server..."
uvicorn test:app --host 0.0.0.0 --port ${PORT:-8000}
