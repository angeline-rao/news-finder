// Chat Page JavaScript for Gemini Intelligence
class ChatPage {
    constructor() {
        this.apiBaseUrl = 'http://localhost:8001/api';
        this.currentArticle = null;
        this.conversationHistory = [];
        this.currentBotMessage = null;
        this.accumulatedResponse = '';
        
        // Initialize the page
        this.init();
    }

    init() {
        // Load article data from localStorage or URL parameters
        this.loadArticleData();
        
        // Initialize event listeners
        this.initializeEventListeners();
        
        // Update page with article info
        this.updatePageInfo();
        
        // Load existing conversation history if any
        this.loadExistingChatHistory();
    }

    loadArticleData() {
        // Try to get article data from localStorage first
        const storedArticle = localStorage.getItem('chatArticle');
        if (storedArticle) {
            try {
                this.currentArticle = JSON.parse(storedArticle);
                // Clear the stored data after use
                localStorage.removeItem('chatArticle');
                return;
            } catch (e) {
                console.error('Failed to parse stored article data:', e);
            }
        }

        // Fallback: try to get from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const encodedArticle = urlParams.get('article');
        if (encodedArticle) {
            try {
                this.currentArticle = JSON.parse(decodeURIComponent(encodedArticle));
                return;
            } catch (e) {
                console.error('Failed to parse URL article data:', e);
            }
        }

        // If no article data is found, redirect back to main page
        console.warn('No article data found, redirecting to main page');
        window.location.href = 'index.html';
    }

    updatePageInfo() {
        if (!this.currentArticle) return;

        // Update page title and header info
        document.title = `Chat: ${this.currentArticle.title} - Gemini Intelligence`;
        document.getElementById('chatPageArticleTitle').textContent = this.currentArticle.title;
        document.getElementById('chatPageArticleSource').textContent = `Source: ${this.currentArticle.source}`;
        
        // Update URL display if available
        const urlElement = document.getElementById('chatPageArticleUrl');
        if (this.currentArticle.url && urlElement) {
            urlElement.innerHTML = `<a href="${this.currentArticle.url}" target="_blank" rel="noopener noreferrer">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M9 3L3 9M9 3H5M9 3V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Learn more
            </a>`;
            urlElement.style.display = 'block';
        } else if (urlElement) {
            urlElement.style.display = 'none';
        }
    }

    initializeEventListeners() {
        // Back button
        document.getElementById('chatBackBtn').addEventListener('click', () => {
            // Close this tab/window instead of reloading the homepage
            // This prevents triggering the API key check again
            if (window.opener) {
                // If opened from another window, just close this one
                window.close();
            } else {
                // If opened directly, go back to homepage
                window.location.href = 'index.html';
            }
        });

        // Send button and Enter key
        document.getElementById('chatPageSendBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('chatPageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Suggestion buttons
        document.querySelectorAll('.suggestion-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const query = e.currentTarget.dataset.query;
                this.handleQuickAction(query);
            });
        });
    }

    // Handle quick action button clicks
    async handleQuickAction(queryType) {
        let message = '';
        
        if (queryType === 'developments') {
            message = 'Find me the relevant developments from the last two years that led up to this news article';
        } else if (queryType === 'competitors') {
            message = 'Help me find interesting data points and reliable information from competitors on the same topic to help me contextualize this article';
        }

        if (message) {
            // Add user message to chat
            this.addMessage(message, 'user');
            
            // Send to backend
            await this.sendChatRequest(message);
        }
    }

    // Generate chat ID based on article (same logic as backend)
    async generateChatId() {
        if (!this.currentArticle) return null;
        
        const article = this.currentArticle;
        const content = (article.title || '') + (article.url || '');
        
        // Use Web Crypto API to generate MD5-like hash (simpler approach)
        const encoder = new TextEncoder();
        const data = encoder.encode(content);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        // Take first 32 characters to simulate MD5 length
        return `article_${hashHex.slice(0, 32)}`;
    }

    // Load existing chat history from backend
    async loadExistingChatHistory() {
        if (!this.currentArticle) return;
        
        const chatId = await this.generateChatId();
        if (!chatId) return;
        
        try {
            console.log('Loading existing chat history for:', chatId);
            const response = await fetch(`${this.apiBaseUrl}/chat/history/${chatId}`, {
                method: 'GET',
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                const history = data.history || [];
                
                console.log('Loaded chat history:', history);
                console.log('History length:', history.length);
                
                if (history.length > 0) {
                    // Clear the default welcome message
                    const messagesContainer = document.getElementById('chatPageMessages');
                    messagesContainer.innerHTML = '';
                    
                    // Load each message from history
                    history.forEach((message, index) => {
                        console.log(`Processing history message ${index + 1}:`, message.role, '-', message.content?.substring(0, 100) + '...');
                        if (message.role && message.content) {
                            this.addMessage(message.content, message.role === 'assistant' ? 'assistant' : 'user', false);
                        }
                    });
                    
                    // Update conversation history for future requests
                    this.conversationHistory = [...history];
                    
                    console.log('Successfully loaded and displayed chat history');
                } else {
                    console.log('No existing chat history found');
                }
            } else {
                console.log('Failed to load chat history:', response.status);
            }
        } catch (error) {
            console.error('Error loading chat history:', error);
        }
    }

    // Send chat message
    async sendMessage() {
        const input = document.getElementById('chatPageInput');
        const message = input.value.trim();
        
        if (!message) return;

        // Clear input
        input.value = '';

        // Add user message to chat
        this.addMessage(message, 'user');

        // Send to backend
        await this.sendChatRequest(message);
    }

    // Add message to chat display
    addMessage(content, type, addToHistory = true) {
        const messagesContainer = document.getElementById('chatPageMessages');
        const messageDiv = document.createElement('div');
        
        if (type === 'user') {
            messageDiv.className = 'chat-message user-message';
            messageDiv.innerHTML = `
                <div class="message-content">${this.escapeHtml(content)}</div>
            `;
        } else {
            messageDiv.className = 'chat-message assistant-message';
            messageDiv.innerHTML = `
                <div class="message-avatar">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="6" fill="currentColor"/>
                    </svg>
                </div>
                <div class="message-content">${this.formatChatResponse(content)}</div>
            `;
        }
        
        messagesContainer.appendChild(messageDiv);
        
        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Add to conversation history only if specified (avoid duplication when loading from backend)
        if (addToHistory) {
            this.conversationHistory.push({
                role: type === 'user' ? 'user' : 'assistant',
                content: content
            });
        }
    }

    // Send chat request to backend with streaming
    async sendChatRequest(message) {
        const loadingElement = document.getElementById('chatPageLoading');
        const sendBtn = document.getElementById('chatPageSendBtn');
        
        try {
            // Show loading state
            loadingElement.style.display = 'flex';
            sendBtn.disabled = true;

            const response = await fetch(`${this.apiBaseUrl}/chat/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    message: message,
                    article: this.currentArticle,
                    conversation_history: this.conversationHistory,
                    api_key: localStorage.getItem('gemini_api_key')
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Handle streaming response
            await this.handleStreamingResponse(response);

        } catch (error) {
            console.error('Chat error:', error);
            this.addMessage('Sorry, I encountered an error while processing your request. Please try again.', 'assistant');
        } finally {
            // Hide loading state
            loadingElement.style.display = 'none';
            sendBtn.disabled = false;
        }
    }

    // Handle streaming chat response
    async handleStreamingResponse(response) {
        console.log('Starting to handle chat streaming response');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        this.currentBotMessage = null;
        this.accumulatedResponse = '';
        
        // Clear any existing thinking display
        this.hideChatThinking();
        
        try {
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) {
                    console.log('Chat stream reading completed');
                    break;
                }
                
                const chunk = decoder.decode(value, { stream: true });
                console.log('Received chat chunk:', chunk);
                buffer += chunk;
                const lines = buffer.split('\n');
                
                // Process complete lines, keep incomplete line in buffer
                buffer = lines.pop() || '';
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const jsonData = line.slice(6);
                            console.log('Parsing chat JSON data:', jsonData);
                            const data = JSON.parse(jsonData);
                            console.log('Parsed chat data:', data);
                            await this.handleStreamChunk(data);
                        } catch (e) {
                            console.error('Error parsing chat stream chunk:', e, 'Line:', line);
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }

    // Handle individual chat stream chunks
    async handleStreamChunk(data) {
        console.log('Handling chat chunk type:', data.type, 'Data:', data);
        
        switch (data.type) {
            case 'chat_thought':
                console.log('Displaying chat thinking');
                this.displayChatThinking(data.content);
                break;
                
            case 'chat_chunk':
                console.log('Displaying chat chunk');
                this.accumulatedResponse += data.content;
                
                // Hide thinking display once we start getting real content
                this.hideChatThinking();
                
                // If this is the first chunk, create a new bot message
                if (!this.currentBotMessage) {
                    this.currentBotMessage = this.createStreamingBotMessage();
                }
                
                // Update the message content
                this.updateStreamingBotMessage(this.currentBotMessage, this.accumulatedResponse);
                break;
                
            case 'chat_complete':
                console.log('Chat stream completed');
                // Hide thinking display
                this.hideChatThinking();
                
                // Make sure the final response is added to conversation history
                if (data.full_response) {
                    this.conversationHistory.push({
                        role: 'assistant',
                        content: data.full_response
                    });
                } else if (this.accumulatedResponse) {
                    this.conversationHistory.push({
                        role: 'assistant',
                        content: this.accumulatedResponse
                    });
                }
                break;
                
            case 'error':
                console.error('Chat stream error:', data.content);
                this.hideChatThinking();
                this.addMessage('Sorry, I encountered an error while processing your request. Please try again.', 'assistant');
                break;
        }
    }

    // Create a streaming bot message element
    createStreamingBotMessage() {
        const messagesContainer = document.getElementById('chatPageMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message assistant-message';
        
        messageDiv.innerHTML = `
            <div class="message-avatar">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="6" fill="currentColor"/>
                </svg>
            </div>
            <div class="message-content"></div>
        `;
        
        const messageContent = messageDiv.querySelector('.message-content');
        messagesContainer.appendChild(messageDiv);
        
        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        return { messageDiv, messageContent };
    }

    // Update streaming bot message content
    updateStreamingBotMessage(messageElements, content) {
        messageElements.messageContent.innerHTML = this.formatChatResponse(content);
        
        // Scroll to bottom
        const messagesContainer = document.getElementById('chatPageMessages');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Display chat thinking
    displayChatThinking(thinkingText) {
        console.log('displayChatThinking called with:', thinkingText);
        
        // Check if thinking element already exists
        let thinkingElement = document.getElementById('chatPageThinking');
        
        if (!thinkingElement) {
            // Create thinking element
            const messagesContainer = document.getElementById('chatPageMessages');
            thinkingElement = document.createElement('div');
            thinkingElement.id = 'chatPageThinking';
            thinkingElement.className = 'chat-message assistant-message thinking-message';
            thinkingElement.innerHTML = `
                <div class="message-avatar">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="6" fill="currentColor"/>
                    </svg>
                </div>
                <div class="message-content thinking-content">
                    <div class="thinking-header">
                        <div class="loading-spinner">
                            <div class="spinner-ring"></div>
                        </div>
                        <span>Doing research...</span>
                    </div>
                    <div class="thinking-text" id="chatPageThinkingText"></div>
                </div>
            `;
            messagesContainer.appendChild(thinkingElement);
        }
        
        // Update thinking text (formatted)
        const thinkingTextElement = document.getElementById('chatPageThinkingText');
        if (thinkingTextElement) {
            thinkingTextElement.innerHTML = this.formatThoughts(thinkingText);
        }
        
        // Scroll to bottom
        const messagesContainer = document.getElementById('chatPageMessages');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        console.log('Updated chat thinking display');
    }

    // Hide chat thinking
    hideChatThinking() {
        const thinkingElement = document.getElementById('chatPageThinking');
        if (thinkingElement) {
            thinkingElement.remove();
            console.log('Hidden chat thinking display');
        }
    }

    // Format thoughts with proper HTML structure (similar to chat responses but simpler)
    formatThoughts(text) {
        if (!text) return '';
        
        // Escape HTML first to prevent XSS
        let formatted = this.escapeHtml(text);
        
        // Replace markdown-style formatting
        // Bold text: **text** or __text__
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/__(.*?)__/g, '<strong>$1</strong>');
        
        // Italic text: *text* or _text_ - DISABLED to prevent unwanted italics
        // formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        // formatted = formatted.replace(/_([^_]+)_/g, '<em>$1</em>');
        
        // Convert line breaks to proper HTML
        // First, split by double newlines to create paragraphs
        const paragraphs = formatted.split(/\n\n+/);
        formatted = paragraphs.map(para => para.replace(/\n/g, '<br>')).join('</p><p>');
        
        // Handle bullet points and lists
        const lines = formatted.split('<br>');
        let inList = false;
        let result = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Check if line starts with bullet point indicators
            if (line.match(/^[\*\-\+]\s+/) || line.match(/^\d+\.\s+/)) {
                if (!inList) {
                    result.push('<ul class="thinking-list">');
                    inList = true;
                }
                // Remove the bullet point and wrap in list item
                const listContent = line.replace(/^[\*\-\+]\s+/, '').replace(/^\d+\.\s+/, '');
                result.push(`<li>${listContent}</li>`);
            } else {
                if (inList) {
                    result.push('</ul>');
                    inList = false;
                }
                if (line) {
                    result.push(line);
                }
            }
        }
        
        if (inList) {
            result.push('</ul>');
        }
        
        formatted = result.join('<br>');
        
        // Handle headers (##, ###, etc.)
        formatted = formatted.replace(/^### (.*?)$/gm, '<h4 class="thinking-header">$1</h4>');
        formatted = formatted.replace(/^## (.*?)$/gm, '<h3 class="thinking-header">$1</h3>');
        formatted = formatted.replace(/^# (.*?)$/gm, '<h2 class="thinking-header">$1</h2>');
        
        // Wrap in paragraph tags if we have content and no existing paragraph structure
        if (!formatted.includes('<ul>') && !formatted.includes('<h') && formatted.trim()) {
            // If we have multiple paragraphs separated by our paragraph markers, wrap properly
            if (formatted.includes('</p><p>')) {
                formatted = `<p>${formatted}</p>`;
            } else {
                formatted = `<p>${formatted}</p>`;
            }
        }
        
        return formatted;
    }

    // Utility function to escape HTML
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Format chat response with proper HTML structure
    formatChatResponse(text) {
        if (!text) return '';
        
        // Escape HTML first to prevent XSS
        let formatted = this.escapeHtml(text);
        
        // Replace markdown-style formatting
        // Bold text: **text** or __text__
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/__(.*?)__/g, '<strong>$1</strong>');
        
        // Italic text: *text* or _text_ - DISABLED to prevent unwanted italics
        // formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        // formatted = formatted.replace(/_([^_]+)_/g, '<em>$1</em>');
        
        // Convert line breaks to proper HTML
        // First, split by double newlines to create paragraphs
        const paragraphs = formatted.split(/\n\n+/);
        formatted = paragraphs.map(para => para.replace(/\n/g, '<br>')).join('</p><p>');
        
        // Handle bullet points and lists
        const lines = formatted.split('<br>');
        let inList = false;
        let result = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Check if line starts with bullet point indicators
            if (line.match(/^[\*\-\+]\s+/) || line.match(/^\d+\.\s+/)) {
                if (!inList) {
                    result.push('<ul class="chat-list">');
                    inList = true;
                }
                // Remove the bullet point and wrap in list item
                const listContent = line.replace(/^[\*\-\+]\s+/, '').replace(/^\d+\.\s+/, '');
                result.push(`<li>${listContent}</li>`);
            } else {
                if (inList) {
                    result.push('</ul>');
                    inList = false;
                }
                if (line) {
                    result.push(line);
                }
            }
        }
        
        if (inList) {
            result.push('</ul>');
        }
        
        formatted = result.join('<br>');
        
        // Handle headers (##, ###, etc.)
        formatted = formatted.replace(/^### (.*?)$/gm, '<h4 class="chat-header">$1</h4>');
        formatted = formatted.replace(/^## (.*?)$/gm, '<h3 class="chat-header">$1</h3>');
        formatted = formatted.replace(/^# (.*?)$/gm, '<h2 class="chat-header">$1</h2>');
        
        // Wrap in paragraph tags if we have content and no existing paragraph structure
        if (!formatted.includes('<ul>') && !formatted.includes('<h') && formatted.trim()) {
            // If we have multiple paragraphs separated by our paragraph markers, wrap properly
            if (formatted.includes('</p><p>')) {
                formatted = `<p>${formatted}</p>`;
            } else {
                formatted = `<p>${formatted}</p>`;
            }
        }
        
        return formatted;
    }
}

// Initialize the chat page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ChatPage();
});
