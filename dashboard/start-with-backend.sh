#!/bin/bash
set -e

echo "🚀 Starting Connection Manager Dashboard"
echo ""
echo "Dashboard will be available at: http://localhost:5173"
echo "Backend must be running (Nginx) at: http://localhost:8080"
echo ""
echo "If the backend is not up yet, start it from the repo root with:"
echo "  docker compose up --build"
echo ""

npm run dev
