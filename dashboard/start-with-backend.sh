#!/bin/bash

echo "🚀 Starting Connection Manager Dashboard"
echo ""
echo "Dashboard will be available at: http://localhost:3001"
echo "Backend API must be running at: http://localhost:3000"
echo ""
echo "Make sure to start the backend first with:"
echo "  docker compose up --build"
echo ""

npm run dev
