# Gemini-powered News Finder

A web app that uses the Gemini Python SDK for personalized news discovery on AI topics.

## Features

### Core Gemini API Demonstrations

1. **Tool Use & Grounding**
   - Integrates Google Search tool with strict source constraints
   - Only surfaces content from reputable sources (major news outlets, verified channels)
   - Demonstrates grounded generation with real-world data

3. **Multi-turn Conversations**
   - Persistent chat sessions using Gemini's Chat API
   - Automatic conversation history management
   - Session-based article context preservation
   - Chat session management endpoints

### User Experience

- **Intelligent Search**: Find relevant content across articles, videos, podcasts, and blog posts
- **Source Quality Control**: Only content from verified, reputable sources
- **Content Validation**: Automatic verification that all URLs are accessible and content is available
- **Visual Feedback**: Modern, responsive UI

## Tech Stack

- **Backend**: Python 3.9+ with Flask
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **API**: Google Gemini 2.5 Pro with Search grounding
- **Styling**: Custom CSS with modern design patterns

## Project Structure

This project uses a clean, simple structure that's easy to understand and maintain:

```
project1/
├── backend.py              # Main Flask backend server
├── config.py              # Configuration settings  
├── models.py               # Data models (ContentItem)
├── content_validator.py    # URL validation service
├── gemini_service.py       # Gemini API integration
├── app.js                  # Frontend JavaScript
├── index.html              # Web interface
├── styles.css              # Styling
└── requirements.txt        # Python dependencies
```

Clean and organized without unnecessary complexity!

## Prerequisites

- Python 3.7 or higher
- pip (Python package installer)
- Google AI API key (Gemini API access)
- Modern web browser with JavaScript enabled

## Quick Start

1. **Clone or download this repository**
   ```bash
   git clone <repository-url>
   cd <folder-name>
   ```

2. **Install Python dependencies**
   ```bash
   pip3 install -r requirements.txt
   ```

3. **Start the application**
   ```bash
   # Option 1: Use the startup script (recommended)
   ./start.sh
   
   # Option 2: Start manually
   python3 backend.py
   ```

4. **Open your browser**
   Navigate to `http://localhost:8001`

5. **Enter your Gemini API key**
   - The app will prompt you for your API key on first launch
   - Get your key from [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Your key is securely configured in the backend

6. **Start discovering content!**
   - Use "Brief me on AI" for curated content on the biggest happenings in AI
   - Search for specific topics in the search bar

## Support

For questions about this demo or Gemini API implementation patterns, please refer to:
- [Gemini API Reference](https://ai.google.dev/gemini-api/docs)


