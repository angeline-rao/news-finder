#!/bin/bash

# Gemini Content Discovery - Simple Deployment Script

echo "Deploying Gemini Content Discovery App..."

# Check if we're in the right directory
if [ ! -f "index.html" ]; then
    echo "Error: index.html not found. Run this script from the project root."
    exit 1
fi

# Start local development server
echo "Starting local development server..."
echo "App will be available at: http://localhost:8000"
echo "Press Ctrl+C to stop the server"
echo ""

# Check if Python is available
if command -v python3 &> /dev/null; then
    echo "Using Python 3..."
    python3 -m http.server 8000
elif command -v python &> /dev/null; then
    echo "Using Python..."
    python -m http.server 8000
else
    echo "Error: Python not found. Please install Python or use another web server."
    echo "Alternative: npx serve . (requires Node.js)"
    exit 1
fi

