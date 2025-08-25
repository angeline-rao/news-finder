#!/usr/bin/env python3
"""
Gemini Content Discovery Backend - Simplified Structure
Flask API server for handling Gemini API calls and content recommendations
"""

import os
import uuid
import json
import re
from dataclasses import asdict
from datetime import datetime

from flask import Flask, request, jsonify, send_from_directory, Response, stream_template
from flask_cors import CORS
from cachetools import TTLCache

# Import our simplified modules
from config import SECRET_KEY, DEBUG, PORT, CACHE_TTL, MAX_CACHE_SIZE
from data_models import ContentItem
from content_validator import ContentValidator
from gemini_service import GeminiContentService

# Initialize Flask app
app = Flask(__name__, static_folder='.')
app.config['SECRET_KEY'] = SECRET_KEY
CORS(app, supports_credentials=True)

# Initialize services
gemini_service = GeminiContentService()
cache = TTLCache(maxsize=MAX_CACHE_SIZE, ttl=CACHE_TTL)
cache_stats = {"hits": 0, "misses": 0}


# Helper functions


# Routes
@app.route('/')
def serve_index():
    """Serve the main HTML page"""
    return send_from_directory('.', 'index.html')


@app.route('/<path:filename>')
def serve_static(filename):
    """Serve static files"""
    return send_from_directory('.', filename)


@app.route('/api/configure', methods=['POST'])
def configure_api():
    """Configure the API key"""
    data = request.get_json()
    api_key = data.get('api_key')
    
    if not api_key:
        return jsonify({"error": "API key is required"}), 400
    
    # Basic validation of API key format
    if not api_key.strip() or len(api_key.strip()) < 10:
        return jsonify({"error": "Invalid API key format"}), 400
    
    try:
        gemini_service.set_api_key(api_key.strip())
        print(f"API key configured successfully")
        return jsonify({"message": "API key configured successfully"})
    except Exception as e:
        print(f"Failed to configure API key: {e}")
        return jsonify({"error": f"Failed to configure API key: {str(e)}"}), 500


@app.route('/api/reset-api-key', methods=['POST'])
def reset_api_key():
    """Reset the API key - clears it from backend memory"""
    try:
        # Clear the API key from the service
        gemini_service.api_key = None
        print(f"API key reset in backend")
        return jsonify({"message": "API key reset successfully"})
    except Exception as e:
        print(f"Failed to reset API key: {e}")
        return jsonify({"error": f"Failed to reset API key: {str(e)}"}), 500

@app.route('/api/search/stream', methods=['POST'])
def search_content_streaming():
    """Search for content with streaming responses"""
    data = request.get_json()
    query = data.get('query', '').strip()
    api_key = data.get('api_key')  # Get API key from request
    
    if not query:
        return jsonify({"error": "Query is required"}), 400
    
    if not api_key:
        return jsonify({"error": "API key is required"}), 400
    
    def generate_stream():
        try:
            print(f"Starting streaming search for query: {query}")
            
            # Configure API key for this request
            gemini_service.set_api_key(api_key)
            
            # Simplified memory context for streaming (avoid session dependencies)
            memory_context = {
                'liked': [],
                'disliked': [],
                'topics': []
            }
            
            accumulated_content = ""
            results_sent = False
            thinking_sent = False
            
            # Send initial thinking message
            if not thinking_sent:
                initial_thought = f'Analyzing your query "{query}" to find the most relevant and current content...'
                yield f"data: {json.dumps({'type': 'thought', 'content': initial_thought})}\n\n"
                thinking_sent = True
            
            # Stream responses from Gemini
            print(f"Starting streaming from Gemini service...")
            for chunk in gemini_service.search_content_streaming(query, memory_context):
                print(f"Received chunk: {type(chunk)}")

                # Extract thinking content first
                thinking_text = None
                content_text = None
                
                # According to Gemini API docs, response has candidates[] with content.parts[]
                if hasattr(chunk, 'candidates') and chunk.candidates:
                    candidate = chunk.candidates[0]  # Use first candidate
                    if hasattr(candidate, 'content') and candidate.content:
                        if hasattr(candidate.content, 'parts') and candidate.content.parts:
                            # Separate thinking and regular content parts
                            thinking_parts = []
                            text_parts = []
                            for part in candidate.content.parts:
                                if hasattr(part, 'text') and part.text:
                                    # Check if this is a thinking part
                                    if hasattr(part, 'thought') and part.thought:
                                        thinking_parts.append(part.text)
                                    else:
                                        text_parts.append(part.text)
                            
                            thinking_text = ''.join(thinking_parts) if thinking_parts else None
                            content_text = ''.join(text_parts) if text_parts else None
                
                # Fallback: try direct text access (for compatibility)
                if not content_text and hasattr(chunk, 'text'):
                    content_text = chunk.text

                # Send thinking content if available
                if thinking_text:
                    print(f"Found thinking content, sending: {thinking_text[:100]}...")
                    yield f"data: {json.dumps({'type': 'thought', 'content': thinking_text})}\n\n"
                else:
                    print(f"No thinking content found in this chunk")

                if content_text:
                    accumulated_content += str(content_text)
                    # print(f"Accumulated content length: {len(accumulated_content)}")
                    # print(f"Latest content: {str(content_text)[:100]}...")
                    
                    # Try to parse complete JSON if we have enough content
                    try:
                        json_match = re.search(r'\[[\s\S]*\]', accumulated_content)
                        if json_match and not results_sent:
                            results_data = json.loads(json_match.group(0))
                            print(f"Parsed {len(results_data)} results from accumulated content")
                            
                            # Send parsing complete event to update UI
                            yield f"data: {json.dumps({'type': 'parsing_complete', 'content': len(results_data)})}\n\n"
                            
                            # Validate content URLs
                            print(f"Validating {len(results_data)} search results...")
                            validated_data = gemini_service.validator.validate_content_batch(results_data)
                            
                            if not validated_data and results_data:
                                print("Using mock results as fallback")
                                validated_data = gemini_service._get_mock_results()
                            
                            # Convert to ContentItem objects
                            results = []
                            for item in validated_data:
                                filtered_item = {
                                    'title': item.get('title', ''),
                                    'type': item.get('type', ''),
                                    'description': gemini_service._clean_metadata_from_text(item.get('description', '')),
                                    'source': item.get('source', ''),
                                    'relevance': item.get('relevance', ''),
                                    'url': item.get('url', ''),
                                    'validation': item.get('validation')
                                }
                                results.append(ContentItem(**filtered_item))
                            
                            print(f"Sending {len(results)} results to frontend")
                            # Send results
                            yield f"data: {json.dumps({'type': 'results', 'content': [asdict(item) for item in results]})}\n\n"
                            results_sent = True
                            break
                    except (json.JSONDecodeError, KeyError) as e:
                        print(f"JSON parse error: {e}")
                        # Continue accumulating content
                        continue
            

            
            # If no results were sent (maybe API failed), send mock results
            if not results_sent:
                print("No results sent yet, sending mock results")
                mock_results = gemini_service._get_mock_results()
                results = []
                for item in mock_results:
                    filtered_item = {
                        'title': item.get('title', ''),
                        'type': item.get('type', ''),
                        'description': gemini_service._clean_metadata_from_text(item.get('description', '')),
                        'source': item.get('source', ''),
                        'url': item.get('url', ''),
                        'relevance': item.get('relevance', ''),
                        'validation': item.get('validation')
                    }
                    results.append(ContentItem(**filtered_item))
                
                yield f"data: {json.dumps({'type': 'results', 'content': [asdict(item) for item in results]})}\n\n"
            
            # Send completion signal
            print("Sending completion signal")
            yield f"data: {json.dumps({'type': 'complete'})}\n\n"
            
        except Exception as e:
            print(f"Streaming error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
    
    return Response(generate_stream(), mimetype='text/event-stream', headers={
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    })

@app.route('/api/recommendations/stream', methods=['POST'])
def get_recommendations_streaming():
    """Get personalized recommendations with streaming responses"""
    data = request.get_json()
    api_key = data.get('api_key')  # Get API key from request
    
    if not api_key:
        return jsonify({"error": "API key is required"}), 400
        
    def generate_stream_attempt():
        try:
            print(f"Starting streaming recommendations")
            
            # Configure API key for this request
            gemini_service.set_api_key(api_key)
            
            # Simplified memory context for streaming (avoid session dependencies)
            memory_context = {
                'liked': [],
                'disliked': [],
                'topics': []
            }
            
            accumulated_content = ""
            results_sent = False
            thinking_sent = False
            
            # Send initial thinking message
            if not thinking_sent:
                initial_thought = 'Analyzing current AI trends and developments to provide you with the most relevant recommendations...'
                yield f"data: {json.dumps({'type': 'thought', 'content': initial_thought})}\n\n"
                thinking_sent = True
            
            # Stream responses from Gemini
            print(f"Starting streaming from Gemini service...")
            try:
                chunk_count = 0
                for chunk in gemini_service.get_recommendations_streaming(memory_context):
                    chunk_count += 1

                    # Extract thinking content first
                    thinking_text = None
                    content_text = None
                    
                    # According to Gemini API docs, response has candidates[] with content.parts[]
                    if hasattr(chunk, 'candidates') and chunk.candidates:
                        candidate = chunk.candidates[0]  # Use first candidate
                        if hasattr(candidate, 'grounding_metadata') and candidate.grounding_metadata:
                            print(f"Grounding metadata: {candidate.grounding_metadata}")
                        if hasattr(candidate, 'content') and candidate.content:
                            if hasattr(candidate.content, 'parts') and candidate.content.parts:
                                # Separate thinking and regular content parts
                                thinking_parts = []
                                text_parts = []
                                for part in candidate.content.parts:
                                    if hasattr(part, 'text') and part.text:
                                        # Check if this is a thinking part
                                        if hasattr(part, 'thought') and part.thought:
                                            thinking_parts.append(part.text)
                                        else:
                                            text_parts.append(part.text)
                                
                                thinking_text = ''.join(thinking_parts) if thinking_parts else None
                                content_text = ''.join(text_parts) if text_parts else None
                    
                    # Fallback: try direct text access (for compatibility)
                    if not content_text and hasattr(chunk, 'text'):
                        content_text = chunk.text

                    # Send thinking content if available
                    if thinking_text:
                        print(f"Found thinking content, sending: {thinking_text[:100]}...")
                        yield f"data: {json.dumps({'type': 'thought', 'content': thinking_text})}\n\n"
                    else:
                        print(f"🤔 No thinking content found in this chunk")
                    
                    # Process the content text
                    if content_text:
                        accumulated_content += str(content_text)
                        print(f"Accumulated content length: {len(accumulated_content)}")
                        print(f"Latest content: {str(content_text)[:100]}...")

                print(f"Last content_text: {content_text}")
                
                print(f"Accumulated content: {accumulated_content}")
                # Try to parse complete JSON now that we have all of the chunks
                try:
                    json_match = re.search(r'\[[\s\S]*\]', accumulated_content)
                    if json_match and not results_sent:
                        results_data = json.loads(json_match.group(0))
                        print(f"Parsed {len(results_data)} results from accumulated content")
                        
                        # Send parsing complete event to update UI
                        yield f"data: {json.dumps({'type': 'parsing_complete', 'content': len(results_data)})}\n\n"
                        
                        # Generate links by title (like in original recommendations)
                        print(f"Generating links for {len(results_data)} results...")
                        links_dict = gemini_service.generate_links_by_title_parallel(results_data)
                        
                        validated_data = results_data
                        for item in validated_data:
                            if item['title'] in links_dict and len(links_dict[item['title']]) > 0:
                                item['url'] = links_dict[item['title']][0]
                            else:
                                item['url'] = f"https://www.google.com/search?q={item['title']}+{item['source']}"
                        
                        if not validated_data and results_data:
                            print("Using mock results as fallback")
                            validated_data = gemini_service._get_mock_results()
                        
                        # Convert to ContentItem objects
                        results = []
                        for item in validated_data:
                            filtered_item = {
                                'title': item.get('title', ''),
                                'type': item.get('type', ''),
                                'description': gemini_service._clean_metadata_from_text(item.get('description', '')),
                                'source': item.get('source', ''),
                                'url': item.get('url', ''),
                                'relevance': item.get('relevance', ''),
                                'validation': item.get('validation')
                            }
                            results.append(ContentItem(**filtered_item))
                        
                        print(f"Sending {len(results)} results to frontend")
                        # Send results
                        yield f"data: {json.dumps({'type': 'results', 'content': [asdict(item) for item in results]})}\n\n"
                        results_sent = True
                except (json.JSONDecodeError, KeyError) as e:
                    print(f"JSON parse error: {e}")    
                print(f"Processed {chunk_count} chunks from Gemini service")
                
            except Exception as api_error:
                print(f"Gemini streaming failed: {api_error}, using fallback")
                # If the API fails completely, we'll fall through to the fallback logic below
            

            
            # If no results were sent (maybe API failed), send mock results
            if not results_sent:
                print("No results sent yet, sending mock results")
                mock_results = gemini_service._get_mock_results()
                results = []
                for item in mock_results:
                    filtered_item = {
                        'title': item.get('title', ''),
                        'type': item.get('type', ''),
                        'description': gemini_service._clean_metadata_from_text(item.get('description', '')),
                        'source': item.get('source', ''),
                        'url': item.get('url', ''),
                        'relevance': item.get('relevance', ''),
                        'validation': item.get('validation')
                    }
                    results.append(ContentItem(**filtered_item))
                
                yield f"data: {json.dumps({'type': 'results', 'content': [asdict(item) for item in results]})}\n\n"
            
            # Send completion signal
            print("Sending completion signal")
            yield f"data: {json.dumps({'type': 'complete'})}\n\n"
            
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return Response(generate_stream_attempt(), mimetype='text/event-stream', headers={
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    })


# Preferences endpoints removed - no longer using memory functionality


@app.route('/api/cache/clear', methods=['POST'])
def clear_cache():
    """Clear the cache"""
    cache.clear()
    cache_stats["hits"] = 0
    cache_stats["misses"] = 0
    return jsonify({"message": "Cache cleared successfully"})


@app.route('/api/chat/clear', methods=['POST'])
def clear_chat_sessions():
    """Clear all chat sessions"""
    try:
        gemini_service.clear_all_chat_sessions()
        return jsonify({"message": "All chat sessions cleared successfully"})
    except Exception as e:
        return jsonify({"error": f"Failed to clear chat sessions: {str(e)}"}), 500


@app.route('/api/chat/clear/<chat_id>', methods=['POST'])
def clear_specific_chat_session(chat_id):
    """Clear a specific chat session"""
    try:
        gemini_service.clear_chat_session(chat_id)
        return jsonify({"message": f"Chat session {chat_id} cleared successfully"})
    except Exception as e:
        return jsonify({"error": f"Failed to clear chat session: {str(e)}"}), 500


@app.route('/api/chat/history/<chat_id>', methods=['GET'])
def get_chat_history(chat_id):
    """Get chat history for a specific chat session"""
    try:
        history = gemini_service.get_chat_history(chat_id)
        return jsonify({"history": history})
    except Exception as e:
        print(f"Failed to get chat history: {e}")
        return jsonify({"error": f"Failed to get chat history: {str(e)}"}), 500

@app.route('/api/chat/stream', methods=['POST'])
def chat_with_article_streaming():
    """Multi-turn conversation about an article with streaming response"""
    data = request.get_json()
    message = data.get('message', '').strip()
    article = data.get('article', {})
    conversation_history = data.get('conversation_history', [])
    api_key = data.get('api_key')  # Get API key from request
    print(f"Initial request: {request}")
    print(f"Initial data: {data}")
    
    # DEBUG: Log the incoming streaming request
    print(f"Streaming chat request received:")
    print(f"   Message: {message}")
    print(f"   Article keys: {list(article.keys()) if article else 'None'}")
    print(f"   Article title: {article.get('title', 'Missing') if article else 'No article'}")
    print(f"   Article URL: {article.get('url', 'Missing') if article else 'No article'}")
    print(f"   Conversation history length: {len(conversation_history)} (will be managed by persistent chat session)")
    
    if not message:
        return jsonify({"error": "Message is required"}), 400
    
    if not api_key:
        return jsonify({"error": "API key is required"}), 400
    
    if not article:
        print("No article provided in streaming request")
        return jsonify({"error": "Article context is required"}), 400
    
    def generate_chat_stream():
        try:
            message_augmented_with_context = \
            f"{message} with the article context: \
            Title: {article.get('title', '')} \
            Description: {article.get('description', '')} \
            URL: {article.get('url', '')}"
            
            print(f"Starting streaming chat for message: {message}")
            
            # Configure API key for this request
            gemini_service.set_api_key(api_key)
            
            accumulated_content = ""
            
            # Generate chat_id based on article to maintain session persistence
            import hashlib
            chat_id = f"article_{hashlib.md5(str(article.get('title', '') + article.get('url', '')).encode()).hexdigest()}"
            
            # Stream responses from Gemini chat API using persistent session
            for chunk in gemini_service.chat_about_article_streaming(message, article, conversation_history, chat_id):
                print(f"Received chat chunk: {type(chunk)}")
                
                # Extract thinking content and regular content separately
                thinking_text = None
                content_text = None
                
                # According to Gemini API docs, response has candidates[] with content.parts[]
                if hasattr(chunk, 'candidates') and chunk.candidates:
                    candidate = chunk.candidates[0]  # Use first candidate
                    if hasattr(candidate, 'content') and candidate.content:
                        if hasattr(candidate.content, 'parts') and candidate.content.parts:
                            # Separate thinking and regular content parts
                            thinking_parts = []
                            text_parts = []
                            for part in candidate.content.parts:
                                if hasattr(part, 'text') and part.text:
                                    # Check if this is a thinking part
                                    if hasattr(part, 'thought') and part.thought:
                                        thinking_parts.append(part.text)
                                    else:
                                        text_parts.append(part.text)
                            
                            thinking_text = ''.join(thinking_parts) if thinking_parts else None
                            content_text = ''.join(text_parts) if text_parts else None
                
                # Fallback: try direct text access (for compatibility)
                if not content_text and hasattr(chunk, 'text'):
                    content_text = chunk.text

                # Send thinking content if available
                if thinking_text:
                    print(f"Found thinking content in chat, sending: {thinking_text}")
                    yield f"data: {json.dumps({'type': 'chat_thought', 'content': thinking_text})}\n\n"

                if content_text:
                    accumulated_content += content_text
                    print(f"Sending chat chunk: {content_text}...")
                    
                    # Send the chunk as streaming data
                    yield f"data: {json.dumps({'type': 'chat_chunk', 'content': content_text})}\n\n"
            
            # Send completion signal
            print("Chat streaming completed")
            yield f"data: {json.dumps({'type': 'chat_complete', 'full_response': accumulated_content})}\n\n"
            
        except Exception as e:
            print(f"Chat streaming error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
    
    return Response(generate_chat_stream(), mimetype='text/event-stream', headers={
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    })


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "cache_size": len(cache),
        "cache_stats": cache_stats
    })


if __name__ == '__main__':
    print(f"Starting Gemini Content Discovery Backend on port {PORT}")
    print(f"Debug mode: {DEBUG}")
    print(f"Frontend will be accessible at: http://localhost:{PORT}")
    
    app.run(host='0.0.0.0', port=PORT, debug=DEBUG)
