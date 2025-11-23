#!/bin/bash
# Railway startup script

echo "Installing caustic package from parent directory..."
pip install -e ../..

echo "Starting FastAPI server..."
uvicorn test:app --host 0.0.0.0 --port ${PORT:-8000}
