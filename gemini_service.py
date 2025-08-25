"""
Gemini API service for content discovery and recommendations.
"""
import hashlib
import json
from typing import Dict, List, Tuple

import google.genai as genai
from google.genai import types
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

from config import SOURCE_CONSTRAINTS, SYSTEM_INSTRUCTIONS
from data_models import ContentItem
from content_validator import ContentValidator


class GeminiContentService:
    """Service class for Gemini API interactions"""
    
    def __init__(self):
        self.api_key = None
        self.source_constraints = self._get_source_constraints()
        self.system_instructions_for_top_level = self._get_system_instructions()
        self.validator = ContentValidator()
        # Store active chat sessions for multi-turn conversations
        self.active_chats = {}
    
    def _clean_metadata_from_text(self, text: str) -> str:
        """Remove grounding metadata patterns from text"""
        if not text:
            return text
        
        # Pattern to match [General search 2, Meta search 1, ...] style metadata
        metadata_pattern = r'\[(?:General search \d+,?\s*|Meta search \d+,?\s*)+\]'
        cleaned_text = re.sub(metadata_pattern, '', text)
        
        # Pattern to match other common metadata patterns like [Search 1], [Result 2], etc.
        simple_metadata_pattern = r'\[(?:Search|Result|Source|Reference)\s*\d+\]'
        cleaned_text = re.sub(simple_metadata_pattern, '', cleaned_text)
        
        # Clean up extra whitespace that might be left behind
        cleaned_text = re.sub(r'\s+', ' ', cleaned_text).strip()
        
        return cleaned_text
    
    def set_api_key(self, api_key: str):
        """Set the API key for Gemini"""
        self.api_key = api_key
        genai.Client(api_key=api_key)
    
    def _get_source_constraints(self) -> str:
        """Get the strict source requirements"""
        return f"""        
        {SOURCE_CONSTRAINTS}
        """

    def _get_system_instructions(self) -> str:
        """Get the system instructions"""
        return f"""        
        {SYSTEM_INSTRUCTIONS}
        """
    
    def _generate_cache_key(self, query: str, is_recommendation: bool, memory_context: str) -> str:
        """Generate a cache key for the request"""
        content = f"{'rec' if is_recommendation else 'search'}_{query}_{memory_context}"
        return hashlib.md5(content.encode()).hexdigest()
    
    def _build_prompt(self, query: str, is_recommendation: bool, memory_context: Dict) -> str:
        """Build the prompt for Gemini API"""
        memory_str = json.dumps(memory_context, indent=2)
        
        if is_recommendation:
            base_prompt = f"""
            Our goal is to stay on top of the latest AI news and content without needing to endlessly scroll news sites and X. 
            The industry is moving quickly, and it is very easy to miss critical developments. 

            Examples of recent AI news that we have missed in the past:
            - Greg Brockman announcement on X about the GPT-5 launch the next day
            - Anthropic's $5Bn fundraise announcement

            While there are critical AI developments each week, there is also significant noise in the industry. 
            We want to focus on AI news and content that is vetted, in one of these ways:
            1) The content is posted by Anthropic, OpenAI, Google DeepMind, Thinking Machines, or Meta MSL, 
            or by a company that is heavily associated with these AI labs, such as Cursor or Cognition, 
            or by an employee of one of these companies. 
            2) The content is from a reputable source (explained below) and is about one of these companies.
            3) The content has been reposted, liked, or discussed on X by someone who works at one of the 
            companies mentioned in item 1.

            Additionally, the content should be recent, which can be determined in one of two ways:
            1) The content is from the last two weeks.
            2) The content has gone viral in the last two weeks, even if it is older.

            Recommend 6 high-quality content pieces about distinct topics. Use web search to find current, relevant content.
            
            User's Preference Context (to help with personalization): {memory_str}
            
            {self.source_constraints}

            Double check that the source is one of the sources that we've outlined above.
            If there are not enough articles from these sources available from the last two weeks, you
            may look for articles from the last month. Do not deviate from these sources.

            Make sure you keep working on this task until you have a list of 6 results.
            
            """
        else:
            base_prompt = f"""
            Search for high-quality, current content related to: "{query} AI company OpenAI trends"
            
            User's Preference Context (to help with relevance): {memory_str}
            
            {self.source_constraints}
            
            Find 4 pieces of content and for each provide:
            1. Title
            2. Content type (article, video, podcast, or academic)
            3. Brief description (2-3 sentences)
            4. Source/Publisher
            5. URL
            6. Relevance to the search query
            
            Prioritize recent content and ensure variety in content types and perspectives.
            """

        # "url": "https://...",
        return base_prompt + """

        Format your response as JSON array with this structure:
        [
            {
                "title": "Content Title",
                "type": "article|video|podcast|academic",
                "description": "Brief description",
                "source": "Publisher/Source",
                "relevance": "Why this is relevant"
            }
        ]
        
        Return ONLY the JSON array, no additional text. Make sure your final response is valid JSON that can be parsed.
        """
    
    def _call_gemini_api_for_results(self, model: str, prompt: str) -> List[Dict]:  
        """Call Gemini API with web search tool using the official SDK"""
        if not self.api_key:
            raise ValueError("API key not configured")
        
        try:
            # Create the model with grounding tools
            client = genai.Client(api_key=self.api_key)
            grounding_tool = types.Tool(
                google_search=types.GoogleSearch()
            )

            config = types.GenerateContentConfig(
                tools=[grounding_tool],
                system_instruction=self.system_instructions_for_top_level,
                thinking_config=types.ThinkingConfig(
                    include_thoughts=True
                )
            )
            
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=config,
            )

            print(f"Response grounding metadata: {response.candidates[0].grounding_metadata}")

            if response.candidates[0].finish_reason:
                print(f"Finish reason: {response.candidates[0].finish_reason}")
            
            # Parse the response
            return self._parse_gemini_response_sdk(response)
            
        except Exception as e:
            print(f"Error calling Gemini API for results: {e}")
            # Return mock data for demonstration
            return self._get_mock_results()
    
    def _call_gemini_api_for_results_streaming(self, model: str, prompt: str):
        """Call Gemini API with web search tool using streaming"""
        if not self.api_key:
            print("No API key configured, using mock streaming response")
            # Use mock streaming response when no API key
            for chunk in self._create_mock_streaming_response():
                yield chunk
            return
        
        try:
            # Create the model with grounding tools
            client = genai.Client(api_key=self.api_key)
            grounding_tool = types.Tool(
                google_search=types.GoogleSearch()
            )
            url_context_tool = types.Tool(
                url_context={}
            )

            config = types.GenerateContentConfig(
                tools=[grounding_tool, url_context_tool],
                system_instruction=self.system_instructions_for_top_level,
                thinking_config=types.ThinkingConfig(
                    thinking_budget=256,
                    include_thoughts=True
                )
            )
            
            print(f"Calling Gemini API for results streaming")
            response_stream = client.models.generate_content_stream(
                model=model,
                contents=prompt,
                config=config,
            )
            
            # Yield chunks as they come in
            for chunk in response_stream:
                yield chunk
            
        except Exception as e:
            print(f"Error calling Gemini API for search results streaming: {e}")
            # Yield mock data for demonstration
            for chunk in self._create_mock_streaming_response():
                yield chunk

    def _call_gemini_api_for_url(self, model: str, prompt: str) -> str:
        """Call Gemini API with web search tool using the official SDK"""
        if not self.api_key:
            raise ValueError("API key not configured")
        
        try:
            # Create the model with grounding tools
            client = genai.Client(api_key=self.api_key)
            grounding_tool = types.Tool(
                google_search=types.GoogleSearch(),
            )

            url_context_tool = {"url_context": {}}
            config = types.GenerateContentConfig(
                tools=[grounding_tool, url_context_tool],
                system_instruction="You are focused on finding reputable and working links to the content provided by the user.",
                stop_sequences=["]"]
            )
            
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=config,
            )
            
            # Parse the response
            return response
            
        except Exception as e:
            print(f"Error calling Gemini API for URLs: {e}")
            # Return mock data for demonstration
            return self._get_mock_results()
    
    def _parse_gemini_response_sdk(self, response) -> List[Dict]:
        """Parse the response from Gemini API using SDK"""
        print(f"Parsing Gemini API Response: {response.text}")
        try:
            response_text = response.text
            
            # Strip off everything besides the list of dictionaries
            opening_list_index = response_text.find('[')
            closing_list_index = response_text.rfind(']')
            if opening_list_index != -1 and closing_list_index != -1:
                stripped_response_text = response_text[opening_list_index:closing_list_index + 1]
            else:
                stripped_response_text = response_text
            
            print("Stripped response text:")
            print(stripped_response_text)

            # Parses the string and returns the corresponding python object
            dict_list = json.loads(stripped_response_text)

            # Check if the result is a list and if its elements are dictionaries
            if isinstance(dict_list, list) and all(isinstance(item, dict) for item in dict_list):
                return dict_list
            else:
                print("Error: The string content is valid JSON, but it does not represent a list of dictionaries.")
                return []
        except json.JSONDecodeError as e:
            # Catch a specific error if the string is not valid JSON
            print(f"Error decoding JSON: {e}")
            return []
            
        except Exception as e:
            print(f"Error parsing Gemini SDK response: {e}")
            return self._get_mock_results()
    
    def _get_mock_results(self) -> List[Dict]:
        """Generate mock results for demonstration/fallback with real, valid URLs"""
        return [
            {
                "title": "Attention Is All You Need - Transformer Paper",
                "type": "academic",
                "description": "The groundbreaking paper that introduced the Transformer architecture, revolutionizing natural language processing.",
                "source": "arXiv",
                "url": "https://arxiv.org/abs/1706.03762",
                "relevance": "Foundational research in modern AI"
            }
        ]
    
    def _create_mock_streaming_response(self):
        """Create a mock streaming response for demonstration"""
        class MockPart:
            def __init__(self, text, thought=False):
                self.text = text
                self.thought = thought
        
        class MockContent:
            def __init__(self, parts):
                self.parts = parts
        
        class MockCandidate:
            def __init__(self, content):
                self.content = content
        
        class MockChunk:
            def __init__(self, text, thinking_text=None):
                parts = []
                if thinking_text:
                    parts.append(MockPart(thinking_text, thought=True))
                if text:
                    parts.append(MockPart(text, thought=False))
                
                content = MockContent(parts)
                self.candidates = [MockCandidate(content)]
                
                # Add direct text property to match real Gemini API shortcut
                self.text = text or ""
        
        # Return chunks that simulate a streaming response with multiple thinking steps
        thinking_chunks = [
            "I need to search for relevant AI content based on the user's query.",
            "Let me analyze what would be most valuable and current in the AI space.",
            "I'll look for recent developments and foundational papers that would be helpful.",
            "Now I'll compile the search results into a structured JSON format."
        ]
        
        results_text = '''[
            {
                "title": "Attention Is All You Need - Transformer Paper",
                "type": "academic", 
                "description": "The groundbreaking paper that introduced the Transformer architecture, revolutionizing natural language processing.",
                "source": "arXiv",
                "relevance": "Foundational research in modern AI"
            }
        ]'''
        
        # Yield thinking chunks progressively
        for thinking_text in thinking_chunks:
            yield MockChunk("", thinking_text)
        
        # Then yield results chunk
        yield MockChunk(results_text, None)
    
    def search_content_streaming(self, query: str, memory_context: Dict):
        """Search for content with streaming responses"""
        print(f"Gemini service starting streaming search for: {query}")
        # Build prompt and call streaming API
        prompt = self._build_prompt(query, False, memory_context)
        
        # Stream responses
        for chunk in self._call_gemini_api_for_results_streaming("gemini-2.5-pro", prompt):
            print(f"Gemini service yielding chunk: {type(chunk)}")
            yield chunk
        print(f"Gemini service finished streaming for: {query}")
    
    def get_recommendations_streaming(self, memory_context: Dict):
        """Get personalized recommendations with streaming responses"""
        print(f"Gemini service starting streaming recommendations")
        # Build prompt and call streaming API  
        prompt = self._build_prompt("", True, memory_context)
        print(f"Prompt for streaming recommendations: {prompt}")
        
        # Stream responses
        for chunk in self._call_gemini_api_for_results_streaming("gemini-2.5-pro", prompt):
            # print(f"Gemini service yielding recommendations chunk: {type(chunk)}")
            yield chunk
        print(f"Gemini service finished streaming recommendations")

    def generate_links_by_title_parallel(self, content_items: List[Dict]) -> Dict[str, List[str]]:
        """Parallel version using ThreadPoolExecutor"""
        def process_single_item(item: Dict) -> Tuple[str, List[str]]:
            """Process a single content item and return (title, links)"""
            content_item = ContentItem(**item)
            title = content_item.title
            source = content_item.source
            
            prompt = f"""
            Can you find me the right citation link for this article and this source?
            Title: {title}
            Source: {source}
            """
            
            response = self._call_gemini_api_for_url("gemini-2.5-pro", prompt)
            results_data = response.text
            grounding_metadata = response.candidates[0].grounding_metadata
            
            print(f"Gemini URL Response for {title} and {source}: {results_data}")
            print(f"Gemini URL Grounding chunks for {title} and {source}: {grounding_metadata.grounding_chunks}")
            print(f"Gemini URL Grounding supports for {title} and {source}: {grounding_metadata.grounding_supports}")
            
            if not grounding_metadata.grounding_chunks:
                print(f"No grounding chunks for {title} and {source}")
                return title, [f"https://google.com/search?q={title} {source}"]
            
            links = []
            for grounding_chunk in grounding_metadata.grounding_chunks:
                links.append(grounding_chunk.web.uri)
            
            return title, links
        
        links = {}
        
        # Use ThreadPoolExecutor to process items in parallel
        with ThreadPoolExecutor(max_workers=min(len(content_items), 10)) as executor:
            # Submit all tasks
            future_to_item = {executor.submit(process_single_item, item): item for item in content_items}
            
            # Process completed tasks
            for future in as_completed(future_to_item):
                try:
                    title, item_links = future.result()
                    links[title] = item_links
                except Exception as exc:
                    item = future_to_item[future]
                    content_item = ContentItem(**item)
                    title = content_item.title
                    print(f"Error processing {title}: {exc}")
                    links[title] = [f"https://google.com/search?q={title} {content_item.source}"]
        
        return links

    def _get_or_create_chat_session(self, chat_id: str, article: Dict):
        """Get existing chat session or create a new one for the conversation"""
        if chat_id in self.active_chats:
            return self.active_chats[chat_id]
        
        # Build system instruction with article context
        system_instruction = f"""
        You are an AI assistant helping users dive deeper into news articles and developments. 
        
        Article Information:
        Title: {article.get('title', '')}
        Description: {article.get('description', '')}
        Source: {article.get('source', '')}
        Type: {article.get('type', '')}
        URL: {article.get('url', '')}
        
        Instructions:
        - You have access to web search tools and URL context tools - use them to read the actual article content from the URL provided
        - Provide insightful, contextual information about the article
        - If asked about developments leading up to the news, research relevant background events
        - If asked about competitors, provide specific companies, metrics, market data, and information about competitorsfrom reputable articles
        - Keep responses conversational but informative
        - Reference the article content when relevant
        - If you don't have specific information, acknowledge limitations and suggest where the user might find more details
        """
        
        # Create chat client
        client = genai.Client(api_key=self.api_key)
        
        # Add grounding tools for web search and URL context
        grounding_tool = types.Tool(
            google_search=types.GoogleSearch()
        )
        url_context_tool = types.Tool(
            url_context={}
        )
        
        # Initial history with system instruction and article context
        initial_history = [
            {
                "role": "user",
                "parts": [{"text": "Please act according to these instructions: " + system_instruction}]
            },
            {
                "role": "model", 
                "parts": [{"text": "I understand. I'll help you with questions about the article according to those instructions."}]
            },
            {
                "role": "user",
                "parts": [{"text": f"""
                We are discussing this specific article:

                Title: {article.get('title', '')}
                Source: {article.get('source', '')}
                Type: {article.get('type', '')}
                Description: {article.get('description', '')}
                URL: {article.get('url', '')}

                Please use your URL context tools and web search tools to read the actual content from this specific URL and be ready to answer questions about it.
                """}]
            },
            {
                "role": "model", 
                "parts": [{"text": f"I understand. I'm ready to discuss the article '{article.get('title', '')}' from {article.get('source', '')}. I have access to URL context tools and web search to read the actual content from the provided URL and help you explore this topic in depth. What would you like to know about this article?"}]
            }
        ]
        
        # Create chat with initial history and tools
        chat = client.chats.create(
            model="gemini-2.5-pro",
            history=initial_history,
            config=types.GenerateContentConfig(
                tools=[grounding_tool, url_context_tool],
                temperature=0.7,
                max_output_tokens=4000,
                top_p=0.8,
                thinking_config=types.ThinkingConfig(
                    include_thoughts=True,
                    thinking_budget=512
                )
            )
        )
        
        # Store the chat session
        self.active_chats[chat_id] = chat
        return chat

    def clear_chat_session(self, chat_id: str):
        """Clear a specific chat session"""
        if chat_id in self.active_chats:
            del self.active_chats[chat_id]

    def clear_all_chat_sessions(self):
        """Clear all chat sessions"""
        self.active_chats.clear()

    def get_chat_history(self, chat_id: str):
        """Get the chat history for a specific chat session"""
        if chat_id in self.active_chats:
            chat = self.active_chats[chat_id]
            try:
                # Get the chat history from the Gemini chat session
                history = chat.get_history(True)  # True for structured format
                
                # Convert to frontend format
                formatted_history = []
                for message in history:
                    if hasattr(message, 'role') and hasattr(message, 'parts'):
                        role = message.role
                        # Skip system messages - only include user and model messages
                        if role in ['user', 'model']:
                            content = ''
                            if message.parts:
                                # Combine all text parts
                                content = ''.join([part.text for part in message.parts if hasattr(part, 'text')])
                            
                            # Convert model role to assistant for frontend consistency
                            frontend_role = 'assistant' if role == 'model' else role
                            
                            # Only add messages with actual content (skip system setup messages)
                            if content.strip() and not content.startswith("Please act according to these instructions") and not content.startswith("We are discussing this specific article:"):
                                formatted_history.append({
                                    'role': frontend_role,
                                    'content': content.strip()
                                })
                                print(f"Added message to history: {frontend_role} - {content[:100]}...")
                
                return formatted_history
            except Exception as e:
                print(f"Error getting chat history: {e}")
                return []
        else:
            return []

    def chat_about_article_streaming(self, message: str, article: Dict, conversation_history: List[Dict], chat_id: str = None):
        """Generate a streaming conversational response about a specific article using persistent chat session"""
        try:
            # Generate chat_id if not provided (based on article for session persistence)
            if not chat_id:
                chat_id = f"article_{hashlib.md5(str(article.get('title', '') + article.get('url', '')).encode()).hexdigest()}"
            
            print(f"Using chat session ID: {chat_id}")
            
            # Get or create persistent chat session
            chat = self._get_or_create_chat_session(chat_id, article)
            
            # Send the current message and get streaming response
            print(f"Sending message to persistent chat session: '{message}'")
            print(f"History: {chat.get_history(True)}")
            response_stream = chat.send_message_stream(message)
            
            # Yield each chunk from the stream
            for chunk in response_stream:
                # Check for finish reasons that might indicate truncation
                if hasattr(chunk, 'candidates') and chunk.candidates:
                    candidate = chunk.candidates[0]
                    if hasattr(candidate, 'finish_reason') and candidate.finish_reason:
                        finish_reason = str(candidate.finish_reason)
                        print(f"Chat finish reason: {finish_reason}")
                        if 'MAX_TOKENS' in finish_reason or 'LENGTH' in finish_reason:
                            print(f"Response may be truncated due to token limit!")
                
                yield chunk
            
        except Exception as e:
            print(f"Error in chat_about_article_streaming: {e}")
            import traceback
            print(f"Full traceback: {traceback.format_exc()}")
            
            # Return a fallback response as a mock chunk
            class MockChunk:
                def __init__(self, text):
                    self.text = text
            
            fallback_text = f"I understand you're asking about the article '{article.get('title', 'this article')}'. While I'm having trouble accessing detailed information right now, I can tell you that this appears to be {article.get('type', 'content')} from {article.get('source', 'a news source')}. Could you please rephrase your question or try asking something more specific about the article?"
            yield MockChunk(fallback_text)
