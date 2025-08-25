"""
Config settings for an AI content recommendations app. 
"""
import os
from datetime import datetime

TODAYS_DATE = datetime.now().strftime("%B %d, %Y")

# Flask Configuration
SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-key-change-in-production')
DEBUG = os.environ.get('DEBUG', 'False').lower() == 'true'
PORT = int(os.environ.get('PORT', 8001))

# Cache Configuration
CACHE_TTL = 3600  # 1 hour cache
MAX_CACHE_SIZE = 1000

# API Configuration
API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
VALIDATION_TIMEOUT = 10  # seconds for URL validation
MAX_VALIDATION_WORKERS = 5  # concurrent validation threads

# Database Configuration removed - no longer using user preferences

# Content Source Constraints
SYSTEM_INSTRUCTIONS = """
You are a helpful assistant focused on discovering the most important AI news and content that other people 
may have missed when browsing day to day. 

Today's date is {TODAYS_DATE}.
"""

# Content Source Constraints
SOURCE_CONSTRAINTS = """
STRICT SOURCE REQUIREMENTS - Only include content from these reputable sources:

News & Articles: Axios, The Verge, Wired, Reuters, 
The New York Times, The Wall Street Journal, The Guardian, TechCrunch, Financial Times, Washington Post, NPR, Politico, The Atlantic, Harvard Business Review, MIT Technology Review, 
Bloomberg

Professional: official company blogs

DO NOT include: Personal blogs, social media posts (except verified accounts), Wikipedia, 
forum posts, unverified news sources, content farms, or sites with questionable credibility.
"""
