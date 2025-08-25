"""
Content item data model.
"""
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, Optional


@dataclass
class ContentItem:
    """Data class for content items"""
    title: str
    type: str  # article, video, podcast, academic
    description: str
    source: str
    relevance: str
    url: str = None  # URL for the "read more" link
    timestamp: str = None
    validation: Optional[Dict] = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now().isoformat()
