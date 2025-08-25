"""
Content validation service for URL validation and accessibility checks.
"""
import re
import concurrent.futures
from datetime import datetime
from typing import Dict, List, Any
from urllib.parse import urlparse

import requests

from config import VALIDATION_TIMEOUT, MAX_VALIDATION_WORKERS


class ContentValidator:
    """Service for validating content URLs and accessibility"""
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        
    def validate_url(self, url: str, content_type: str = None) -> Dict[str, Any]:
        """Validate a single URL and return validation results"""
        validation_result = {
            'url': url,
            'is_valid': False,
            'status_code': None,
            'error': None,
            'content_type_detected': None,
            'title_verified': False
        }
        
        try:
            # Parse URL
            parsed = urlparse(url)
            if not parsed.scheme or not parsed.netloc:
                validation_result['error'] = 'Invalid URL format'
                return validation_result
            
            # Special handling for different content types
            if content_type == 'video' and 'youtube.com' in parsed.netloc:
                return self._validate_youtube_video(url, validation_result)
            elif content_type == 'video' and 'youtu.be' in parsed.netloc:
                return self._validate_youtube_video(url, validation_result)
            elif content_type == 'podcast':
                return self._validate_podcast(url, validation_result)
            else:
                return self._validate_general_url(url, validation_result)
                
        except Exception as e:
            validation_result['error'] = f'Validation error: {str(e)}'
            return validation_result
    
    def _validate_youtube_video(self, url: str, result: Dict) -> Dict:
        """Validate YouTube video specifically"""
        try:
            # Extract video ID
            video_id_match = re.search(r'(?:youtube\.com/watch\?v=|youtu\.be/)([a-zA-Z0-9_-]+)', url)
            if not video_id_match:
                result['error'] = 'Could not extract YouTube video ID'
                return result
            
            video_id = video_id_match.group(1)
            
            # Check if video exists by making a HEAD request
            response = self.session.head(url, timeout=VALIDATION_TIMEOUT, allow_redirects=True)
            result['status_code'] = response.status_code
            
            if response.status_code == 200:
                result['is_valid'] = True
                result['content_type_detected'] = 'video'
                
                # Try to get the video title for additional verification
                try:
                    page_response = self.session.get(url, timeout=VALIDATION_TIMEOUT)
                    if page_response.status_code == 200:
                        title_match = re.search(r'<title>([^<]+)</title>', page_response.text)
                        if title_match and 'YouTube' not in title_match.group(1):
                            result['title_verified'] = True
                except:
                    pass  # Title verification is optional
                    
            elif response.status_code in [404, 410]:
                result['error'] = 'YouTube video not found or removed'
            else:
                result['error'] = f'YouTube video inaccessible (status: {response.status_code})'
                
        except requests.exceptions.Timeout:
            result['error'] = 'YouTube video validation timeout'
        except requests.exceptions.RequestException as e:
            result['error'] = f'YouTube video validation failed: {str(e)}'
            
        return result
    
    def _validate_podcast(self, url: str, result: Dict) -> Dict:
        """Validate podcast URL"""
        try:
            response = self.session.head(url, timeout=VALIDATION_TIMEOUT, allow_redirects=True)
            result['status_code'] = response.status_code
            
            if response.status_code == 200:
                content_type = response.headers.get('content-type', '').lower()
                
                # Check for common podcast platforms or audio content
                if (any(platform in url.lower() for platform in ['spotify.com', 'apple.com/podcasts', 'podcasts.apple.com', 'anchor.fm', 'soundcloud.com']) or
                    'audio/' in content_type):
                    result['is_valid'] = True
                    result['content_type_detected'] = 'podcast'
                else:
                    result['error'] = 'URL does not appear to be a valid podcast'
            else:
                result['error'] = f'Podcast not accessible (status: {response.status_code})'
                
        except requests.exceptions.Timeout:
            result['error'] = 'Podcast validation timeout'
        except requests.exceptions.RequestException as e:
            result['error'] = f'Podcast validation failed: {str(e)}'
            
        return result
    
    def _validate_general_url(self, url: str, result: Dict) -> Dict:
        """Validate general URLs (articles, academic papers, etc.)"""
        try:
            #response = self.session.head(url, timeout=VALIDATION_TIMEOUT, allow_redirects=True)

            headers = {'User-Agent': 'Mozilla/5.0 (compatible; URL-Validator/1.0)'}
            try:
                response = self.session.head(url, timeout=VALIDATION_TIMEOUT, 
                                        allow_redirects=True, headers=headers)
            except requests.exceptions.RequestException:
                # Fallback to GET request
                response = self.session.get(url, timeout=VALIDATION_TIMEOUT, 
                                        allow_redirects=True, headers=headers, stream=True)

            result['status_code'] = response.status_code

            print(f"Status code result for {url}: {response.status_code}")
            result['is_valid'] = response.status_code == 200 or response.status_code == 403

        except requests.exceptions.Timeout:
            result['error'] = 'URL validation timeout'
        except requests.exceptions.RequestException as e:
            result['error'] = f'URL validation failed: {str(e)}'
            
        return result
    
    def validate_content_batch(self, content_items: List[Dict]) -> List[Dict]:
        """Validate multiple content items concurrently"""
        valid_items = []
        
        def validate_single_item(item):
            try:
                url = item.get('url', '')
                content_type = item.get('type', '')
                
                validation_result = self.validate_url(url, content_type)
                
                if validation_result['is_valid']:
                    # Add validation metadata to the item
                    item['validation'] = {
                        'validated_at': datetime.now().isoformat(),
                        'status_code': validation_result['status_code'],
                        'content_type_verified': validation_result.get('content_type_detected')
                    }
                    return item
                else:
                    print(f"Invalid content filtered: {item.get('title', 'Unknown')} - {validation_result.get('error', 'Unknown error')}")
                    return None
                    
            except Exception as e:
                print(f"Validation error for {item.get('title', 'Unknown')}: {str(e)}")
                return None
        
        # Use thread pool for concurrent validation
        with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_VALIDATION_WORKERS) as executor:
            future_to_item = {executor.submit(validate_single_item, item): item for item in content_items}
            
            for future in concurrent.futures.as_completed(future_to_item, timeout=30):
                try:
                    result = future.result()
                    if result is not None:
                        valid_items.append(result)
                except Exception as e:
                    item = future_to_item[future]
                    print(f"Validation failed for {item.get('title', 'Unknown')}: {str(e)}")
        
        print(f"Content validation: {len(valid_items)}/{len(content_items)} items passed validation")
        return valid_items
