#!/bin/bash

# Gemini Content Discovery - Startup Script

echo "Starting Gemini Content Discovery App..."
echo ""

# Check if we're in the right directory
if [ ! -f "backend.py" ]; then
    echo "Error: backend.py not found. Run this script from the project root."
    exit 1
fi

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 not found. Please install Python 3."
    exit 1
fi

# Check if pip is available
if ! command -v pip3 &> /dev/null; then
    echo "Error: pip3 not found. Please install pip."
    exit 1
fi

echo "Installing Python dependencies..."
pip3 install -r requirements.txt

if [ $? -ne 0 ]; then
    echo "Error: Failed to install dependencies. Please check requirements.txt"
    exit 1
fi

echo ""
echo "Starting Python backend server..."
echo "Backend will run on: http://localhost:8001"
echo "Frontend will be accessible at: http://localhost:8001"
echo ""
echo "Make sure you have your Gemini API key ready!"
echo "Press Ctrl+C to stop both servers"
echo ""

# Start the Flask backend (which also serves the frontend)
python3 backend.py
