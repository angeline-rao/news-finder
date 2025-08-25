// Gemini Content Discovery App - Frontend
class GeminiContentApp {
    constructor() {
        this.apiKey = null;
        this.apiBaseUrl = 'http://localhost:8001/api';

        this.cacheStats = { hits: 0, misses: 0 };

        // Add thinking accumulator for progressive display
        this.thinkingText = '';
        this.thinkingDisplayed = false;
        this.thoughtHistory = []; // Store all thoughts for history display
        
        // Chat interface state
        this.currentArticle = null;
        this.conversationHistory = [];
        
        // Search results state
        this.currentResults = [];
        this.currentQuery = '';
        
        // Initialize UI
        this.initializeUI();
        
        // Clear any test data from localStorage
        this.clearTestData();
    
        // Restore previous search results if any
        this.restoreSearchState();
        
        // Check for API key
        this.checkApiKey();
        
        // Set up periodic check to prevent modal from showing unexpectedly
        this.startModalPreventionCheck();
    }

    // Clear any test data from localStorage
    clearTestData() {
        const searchState = localStorage.getItem('searchState');
        console.log('🧹 clearTestData called, searchState exists:', !!searchState);
        if (searchState) {
            try {
                const state = JSON.parse(searchState);
                // Check if it contains test/mock data or any suspicious patterns
                if (state.results && state.results.some(result => 
                    result.title === "Test Article" || 
                    result.source === "Test Source" || 
                    result.description?.includes("test article") ||
                    result.description?.includes("verify the results display") ||
                    result.url === "https://example.com" ||
                    result.title?.includes("Attention Is All You Need") ||
                    result.description?.includes("groundbreaking paper that introduced the Transformer") ||
                    (result.source === "arXiv" && result.url === "https://arxiv.org/abs/1706.03762")
                )) {
                    console.log('🧹 Clearing test data from localStorage');
                    localStorage.removeItem('searchState');
                    return;
                }
            } catch (error) {
                console.log('🧹 Clearing invalid searchState from localStorage');
                localStorage.removeItem('searchState');
                return;
            }
        }
        
        // Also clear if we're loading for the first time and there's no API key
        const hasApiKey = localStorage.getItem('gemini_api_key');
        if (!hasApiKey && searchState) {
            console.log('🧹 Clearing searchState on first visit (no API key configured)');
            localStorage.removeItem('searchState');
        }
    }

    // Initialize UI event listeners
    initializeUI() {
        // Search functionality
        document.getElementById('searchBtn').addEventListener('click', () => this.searchContent());
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.searchContent();
        });

        // Recommendations
        document.getElementById('getRecommendationsBtn').addEventListener('click', () => this.getRecommendations());
        
        // Refresh button - check if element exists
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshRecommendations());
        }

        // API key setup
        document.getElementById('saveApiKeyBtn').addEventListener('click', () => this.saveApiKey());

        // Thought history toggle - check if element exists
        const thoughtHistoryToggle = document.getElementById('thoughtHistoryToggle');
        if (thoughtHistoryToggle) {
            thoughtHistoryToggle.addEventListener('click', () => this.toggleThoughtHistory());
        }

        // Chat modal event listeners
        this.initializeChatEventListeners();

        // Update stats
        this.updateStats();
    }

    // Check if API key exists
    async checkApiKey() {
        const savedKey = localStorage.getItem('gemini_api_key');
        console.log('checkApiKey: savedKey exists:', !!savedKey);
        console.log('checkApiKey: savedKey length:', savedKey ? savedKey.length : 0);
        console.log('checkApiKey: Current page URL:', window.location.href);
        console.log('checkApiKey: Document referrer:', document.referrer);
        
        if (savedKey) {
            console.log('Found saved API key, configuring backend...');
            this.apiKey = savedKey;
            
            // Ensure modal is hidden since we have a saved key
            const modal = document.getElementById('apiKeyModal');
            if (modal) {
                modal.style.display = 'none';
                console.log('Explicitly hiding modal since we have saved key');
            }
            
            try {
                await this.configureBackend(savedKey, true);
                console.log('Backend configuration successful with saved key');
            } catch (error) {
                console.warn('Backend configuration failed, but keeping saved key:', error.message);
                // Don't show modal - just log the error and continue
                // The user can still use the app, maybe backend was temporarily down
                
                // CRITICAL: Never show modal if we have a saved key, regardless of backend status
                if (modal) {
                    modal.style.display = 'none';
                    console.log('Modal kept hidden despite backend error - saved key exists');
                }
                
                // Show a less intrusive notification
                this.showNotification('Using saved API key. If you experience issues, try refreshing the page.', 'info');
            }
        } else {
            console.log('No saved API key found, showing modal...');
            const modal = document.getElementById('apiKeyModal');
            if (modal) {
                modal.style.display = 'flex';
            } else {
                console.error('Modal element not found in DOM!');
            }
        }
    }

    // Prevent API key modal from showing if we have a saved key
    preventModalIfSavedKey() {
        const savedKey = localStorage.getItem('gemini_api_key');
        if (savedKey) {
            const modal = document.getElementById('apiKeyModal');
            if (modal && modal.style.display === 'flex') {
                console.log('Preventing modal from showing - saved key exists');
                modal.style.display = 'none';
                return true;
            }
        }
        return false;
    }

    // Start periodic check to prevent modal from appearing unexpectedly
    startModalPreventionCheck() {
        // Check every 500ms for the first 10 seconds after page load
        let checkCount = 0;
        const maxChecks = 20; // 10 seconds / 500ms
        
        const intervalId = setInterval(() => {
            checkCount++;
            
            if (this.preventModalIfSavedKey()) {
                console.log('Modal prevention triggered during periodic check');
            }
            
            // Stop checking after maxChecks or if no saved key exists
            if (checkCount >= maxChecks || !localStorage.getItem('gemini_api_key')) {
                clearInterval(intervalId);
                console.log('Modal prevention check stopped');
            }
        }, 500);
        
        // Also set up a permanent observer to catch any attempts to show the modal
        this.setupModalObserver();
        
        console.log('Started modal prevention check');
    }

    // Set up a MutationObserver to prevent modal from being shown when saved key exists
    setupModalObserver() {
        const modal = document.getElementById('apiKeyModal');
        if (!modal) return;

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    const savedKey = localStorage.getItem('gemini_api_key');
                    if (savedKey && modal.style.display === 'flex') {
                        console.log('MutationObserver: Preventing modal from showing - saved key exists');
                        modal.style.display = 'none';
                    }
                }
            });
        });

        observer.observe(modal, { attributes: true, attributeFilter: ['style'] });
        console.log('Modal observer set up to prevent unwanted modal displays');
    }

    // Configure backend with API key
    async configureBackend(apiKey, isFromSavedKey = false) {
        try {
            console.log('Starting backend configuration with API key...');
            const response = await fetch(`${this.apiBaseUrl}/configure`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ api_key: apiKey })
            });

            console.log('Response status:', response.status);
            
            const data = await response.json();
            
            if (!response.ok) {
                // If we have an error message from the backend, use it
                const errorMessage = data.error || `HTTP error! status: ${response.status}`;
                throw new Error(errorMessage);
            }
            console.log('Backend configured:', data.message);
            
            // Hide the modal
            const modal = document.getElementById('apiKeyModal');
            console.log('Modal element found:', modal);
            console.log('Modal current display style:', modal.style.display);
            modal.style.display = 'none';
            console.log('Modal display style after setting to none:', modal.style.display);
            
            // Only save to localStorage after successful backend validation
            console.log('Saving API key to localStorage after successful validation');
            localStorage.setItem('gemini_api_key', apiKey);
            console.log('API key saved. Verification:', !!localStorage.getItem('gemini_api_key'));
            
            // Show success notification only when backend configuration succeeds
            this.showNotification('API key saved and configured successfully!', 'success');
            
        } catch (error) {
            console.error('Failed to configure backend:', error);
            
            if (isFromSavedKey) {
                // If this was called from checkApiKey with a saved key, don't show modal
                // Just rethrow the error for checkApiKey to handle
                throw error;
            } else {
                // This was called from saveApiKey, so show error and modal
                // Use the backend error message directly, or provide fallback
                let errorMessage = error.message;
                if (errorMessage.includes('Invalid API key format')) {
                    errorMessage = 'Invalid API key format. Please enter a valid Gemini API key (at least 10 characters).';
                } else if (errorMessage.includes('HTTP error! status: 400')) {
                    errorMessage = 'Invalid API key format. Please check your key and try again.';
                } else if (errorMessage.includes('HTTP error! status: 500')) {
                    errorMessage = 'API key validation failed. Please verify your key is correct.';
                } else if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
                    errorMessage = 'Could not connect to backend server. Please make sure the server is running.';
                } else if (!errorMessage || errorMessage === 'Failed to configure API key. Please try again.') {
                    errorMessage = 'Failed to configure API key. Please try again.';
                }
                
                this.showError(errorMessage);
                this.apiKey = null;
                // Don't remove from localStorage here since we never saved it
                document.getElementById('apiKeyModal').style.display = 'flex';
            }
        }
    }

    // Save API key
    async saveApiKey() {
        const keyInput = document.getElementById('apiKeyInput');
        const key = keyInput.value.trim();
        
        if (!key) {
            this.showError('Please enter a valid API key');
            return;
        }

        // Don't save to localStorage yet - wait for backend validation
        this.apiKey = key;
        
        // Configure the backend first
        await this.configureBackend(key);
        // Success notification is now shown in configureBackend() if successful
    }

    // Reset API key and force re-entry
    async resetApiKey() {
        try {
            // Clear from backend first
            await fetch(`${this.apiBaseUrl}/reset-api-key`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include'
            });
        } catch (error) {
            console.warn('Failed to reset backend API key:', error);
            // Continue with frontend reset even if backend fails
        }
        
        // Clear from memory
        this.apiKey = null;
        
        // Clear from localStorage
        localStorage.removeItem('gemini_api_key');
        
        // Clear the input field
        document.getElementById('apiKeyInput').value = '';
        
        // Show the API key modal
        document.getElementById('apiKeyModal').style.display = 'flex';
        
        // Show notification
        this.showNotification('API key cleared. Please enter a new one.', 'info');
        
        console.log('API key reset - user will be prompted for new key');
    }

    // Memory-related methods removed - no longer using preferences functionality

    // Search for content with streaming
    async searchContent() {
        const query = document.getElementById('searchInput').value.trim();
        if (!query) {
            this.showError('Please enter a search query');
            return;
        }

        // Store the current query
        this.currentQuery = query;

        this.clearPreviousResults();
        this.showLoading(true);
        
        try {
            console.log('Starting search request for query:', query);
            const response = await fetch(`${this.apiBaseUrl}/search/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    query: query,
                    api_key: this.apiKey || localStorage.getItem('gemini_api_key')
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            await this.handleStreamingResponse(response);
            
        } catch (error) {
            console.error('Search error:', error);
            this.showError('Failed to search content: ' + error.message);
            
        } finally {
            this.showLoading(false);
        }
    }
    
    // Handle streaming response
    async handleStreamingResponse(response) {
        console.log('Starting to handle streaming response');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        try {
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) {
                    console.log('Stream reading completed');
                    break;
                }
                
                const chunk = decoder.decode(value, { stream: true });
                console.log('Received raw chunk:', chunk);
                buffer += chunk;
                const lines = buffer.split('\n');
                
                // Process complete lines, keep incomplete line in buffer
                buffer = lines.pop() || '';
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const jsonData = line.slice(6);
                            console.log('Parsing JSON data:', jsonData);
                            const data = JSON.parse(jsonData);
                            console.log('Parsed data:', data);
                            await this.handleStreamChunk(data);
                        } catch (e) {
                            console.error('Error parsing stream chunk:', e, 'Line:', line);
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }
    
    // Handle individual stream chunks
    async handleStreamChunk(data) {
        console.log('Handling chunk type:', data.type, 'Data:', data);
        switch (data.type) {
            case 'thought':
                console.log('🧠 THOUGHT RECEIVED:', data.content);
                // Accumulate thinking text progressively
                this.appendThinkingText(data.content);
                // this.displayThoughtSummary(data.content);
                break;
            case 'parsing_complete':
                console.log('Parsing complete, updating status');
                this.updateThinkingTitle('Finalizing results for you');
                break;
            case 'results':
                console.log('Displaying results, count:', data.content?.length);
                this.displayResults(data.content, false);
                this.showNotification(`Found ${data.content.length} results`, 'success');
                break;
            case 'complete':
                console.log('Stream completed');
                this.finalizeThinking();
                
                // Force show thought history component for debugging
                const thoughtHistoryComponent = document.getElementById('thoughtHistory');
                if (thoughtHistoryComponent) {
                    thoughtHistoryComponent.style.display = 'block';
                    console.log('DEBUG: Forcing thought history component to be visible');
                }
                break;
            case 'error':
                console.error('Stream error:', data.content);
                throw new Error(data.content);
        }
    }

    // Replace current thought and store in history
    appendThinkingText(newThought) {
        console.log('🧠 appendThinkingText called with:', newThought);
        const thoughtSummary = document.getElementById('thoughtSummary');
        const thoughtTextElement = document.getElementById('thoughtText');
        const emptyState = document.getElementById('emptyState');

        console.log('🧠 thoughtSummary element:', thoughtSummary);
        console.log('🧠 thoughtTextElement:', thoughtTextElement);

        if (!thoughtSummary || !thoughtTextElement) {
            console.error('Required DOM elements not found!');
            return;
        }
        
        // Show the thinking section if not already visible
        if (!this.thinkingDisplayed) {
            console.log('🧠 Showing thinking section for first time');
            this.updateThinkingTitle('Doing Research...');
            thoughtSummary.style.display = 'block';
            // Hide the empty state when thinking starts
            if (emptyState) {
                emptyState.style.display = 'none';
            }
            // Also hide the entire empty state section and main content
            const emptyStateSection = document.querySelector('.empty-state-section');
            const mainContent = document.querySelector('.main-content');
            if (emptyStateSection) {
                emptyStateSection.style.display = 'none';
            }
            if (mainContent) {
                mainContent.style.display = 'none';
            }
            this.showLoading(false); // Hide main loading since we're showing thinking
            this.thinkingDisplayed = true;
        }
        
        // Store the new thought in history
        this.thoughtHistory.push(newThought);
        console.log('STORED THOUGHT IN HISTORY. Total thoughts:', this.thoughtHistory.length);
        console.log('Current thought history:', this.thoughtHistory);
        
        // Replace current thinking text instead of accumulating
        this.thinkingText = newThought;
        
        // Update the display with current thinking (formatted)
        thoughtTextElement.innerHTML = this.formatThoughts(this.thinkingText);
        
        // Add a subtle animation to show new content with CSS class
        thoughtTextElement.classList.remove('thinking-update');
        requestAnimationFrame(() => {
            thoughtTextElement.classList.add('thinking-update');
        });
        
        console.log('Updated thinking display with:', newThought);
        console.log('Thought history now contains:', this.thoughtHistory.length, 'thoughts');
    }

    // Update the thinking title text
    updateThinkingTitle(newTitle) {
        const thinkingTitleElement = document.querySelector('.thinking-title');
        if (thinkingTitleElement) {
            thinkingTitleElement.textContent = newTitle;
            console.log('Updated thinking title to:', newTitle);
        }
    }

    // Finalize thinking display and show history component
    finalizeThinking() {
        const thoughtTextElement = document.getElementById('thoughtText');
        const thoughtSummary = document.getElementById('thoughtSummary');
        const thoughtHistoryComponent = document.getElementById('thoughtHistory');
        const thoughtHistoryContent = document.getElementById('thoughtHistoryContent');
        const toggleButton = document.getElementById('thoughtHistoryToggle');
        
        if (thoughtTextElement && this.thinkingText) {
            // Keep the current thinking display visible but update title to show completion
            this.updateThinkingTitle('Research Complete');
            console.log('Finalized thinking display, keeping it visible with updated title');
            
            // Hide the thinking display after a short delay to let users see the final thought
            setTimeout(() => {
                if (thoughtSummary) {
                    thoughtSummary.style.display = 'none';
                    console.log('Auto-hiding thinking display after delay');
                }
            }, 2000); // Hide after 2 seconds
        }
        
        // Show the thought history component if we have thoughts
        if (this.thoughtHistory.length > 0 && thoughtHistoryComponent) {
            this.populateThoughtHistory();
            thoughtHistoryComponent.style.display = 'block';
            
            // Show the thought history expanded by default so users can see the AI's thought process
            if (thoughtHistoryContent && toggleButton) {
                thoughtHistoryContent.style.display = 'block';
                toggleButton.setAttribute('aria-expanded', 'true');
                console.log('Showing thought history expanded with', this.thoughtHistory.length, 'thoughts');
            } else {
                console.log('Showing thought history collapsed with', this.thoughtHistory.length, 'thoughts');
            }
            
            // Save the state now that we have complete thought history
            this.saveSearchState();
            console.log('Saved search state with thought history for persistence');
        } else {
            // Even if no thoughts in history, show a placeholder to indicate the feature exists
            console.log('No thoughts in history yet, but making component visible for debugging');
        }
    }
    
    // Display thought summary with progressive display
    displayThoughtSummary(thoughtText) {
        // Reset thinking state for new request
        this.thinkingText = '';
        this.thinkingDisplayed = false;
        this.thoughtHistory = []; // Clear previous thought history
        
        // Use the progressive append method
        this.appendThinkingText(thoughtText);
    }


    // Clear previous results
    clearPreviousResults() {
        const thoughtSummary = document.getElementById('thoughtSummary');
        const contentGrid = document.getElementById('contentGrid');
        const emptyState = document.getElementById('emptyState');
        const thoughtHistoryComponent = document.getElementById('thoughtHistory');
        
        thoughtSummary.style.display = 'none';
        contentGrid.innerHTML = '';
        emptyState.style.display = 'block'; // Show empty state when clearing
        
        // Reset thinking state
        this.thinkingDisplayed = false;
        this.thinkingText = '';
        this.thoughtHistory = [];
        
        // Show the empty state section and main content again
        const emptyStateSection = document.querySelector('.empty-state-section');
        const mainContent = document.querySelector('.main-content');
        if (emptyStateSection) {
            emptyStateSection.style.display = 'flex';
        }
        if (mainContent) {
            mainContent.style.display = 'grid';
        }
        
        // Hide and clear thought history
        if (thoughtHistoryComponent) {
            thoughtHistoryComponent.style.display = 'none';
        }
        
        // Clear stored results state
        this.currentResults = [];
        localStorage.removeItem('searchState');

        // Reset thinking state
        this.thinkingText = '';
        this.thinkingDisplayed = false;
        this.thoughtHistory = [];
    }
    
    // Populate the thought history component
    populateThoughtHistory() {
        const thoughtHistoryList = document.getElementById('thoughtHistoryList');
        const thoughtHistoryCount = document.getElementById('thoughtHistoryCount');
        
        if (!thoughtHistoryList || !thoughtHistoryCount) {
            console.error('Thought history DOM elements not found!');
            return;
        }
        
        // Clear existing content
        thoughtHistoryList.innerHTML = '';
        
        // Update count
        thoughtHistoryCount.textContent = this.thoughtHistory.length;
        
        // Add each thought as a list item
        this.thoughtHistory.forEach((thought, index) => {
            const thoughtItem = document.createElement('div');
            thoughtItem.className = 'thought-history-item';
            thoughtItem.innerHTML = `
                <div class="thought-number">Step ${index + 1}</div>
                <div class="thought-content">${this.formatThoughts(thought)}</div>
            `;
            thoughtHistoryList.appendChild(thoughtItem);
        });
        
        console.log('Populated thought history with', this.thoughtHistory.length, 'thoughts');
    }
    
    // Toggle thought history visibility
    toggleThoughtHistory() {
        const thoughtHistoryContent = document.getElementById('thoughtHistoryContent');
        const toggleButton = document.getElementById('thoughtHistoryToggle');
        const toggleChevron = toggleButton.querySelector('.toggle-chevron'); // Get the chevron container
        
        if (!thoughtHistoryContent || !toggleButton || !toggleChevron) {
            console.error('Required elements for thought history toggle not found!');
            console.log('thoughtHistoryContent:', thoughtHistoryContent);
            console.log('toggleButton:', toggleButton);
            console.log('toggleChevron:', toggleChevron);
            return;
        }
        
        const isExpanded = toggleButton.getAttribute('aria-expanded') === 'true';
        
        if (isExpanded) {
            // Close the dropdown
            thoughtHistoryContent.classList.remove('expanded');
            toggleButton.setAttribute('aria-expanded', 'false');
            console.log('Thought history dropdown closed');
        } else {
            // Open the dropdown
            thoughtHistoryContent.classList.add('expanded');
            toggleButton.setAttribute('aria-expanded', 'true');
            console.log('Thought history dropdown opened');
        }
    }
    
    // Restore thought history component when navigating back to homepage
    restoreThoughtHistory() {
        const thoughtHistoryComponent = document.getElementById('thoughtHistory');
        const thoughtHistoryContent = document.getElementById('thoughtHistoryContent');
        const toggleButton = document.getElementById('thoughtHistoryToggle');
        
        if (!thoughtHistoryComponent) {
            console.error('Thought history component not found for restoration!');
            return;
        }
        
        // Populate the thought history with restored data
        this.populateThoughtHistory();
        
        // Show the thought history component
        thoughtHistoryComponent.style.display = 'block';
        
        // Show it expanded by default since user was previously engaged with it
        if (thoughtHistoryContent && toggleButton) {
            thoughtHistoryContent.style.display = 'block';
            toggleButton.setAttribute('aria-expanded', 'true');
            console.log('Restored thought history component in expanded state with', this.thoughtHistory.length, 'thoughts');
        } else {
            console.log('Restored thought history component with', this.thoughtHistory.length, 'thoughts');
        }
    }
    
    // Get personalized recommendations with streaming
    async getRecommendations() {
        // Clear any previous query since this is recommendations, not search
        this.currentQuery = '';
        
        this.clearPreviousResults();
        this.showLoading(true);
        
        try {
            const response = await fetch(`${this.apiBaseUrl}/recommendations/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    api_key: this.apiKey || localStorage.getItem('gemini_api_key')
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            await this.handleStreamingResponse(response);
            
        } catch (error) {
            console.error('Recommendations error:', error);
            this.showError('Failed to get recommendations: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }

    // Refresh recommendations (non-streaming for cache testing)
    async refreshRecommendations() {
        this.clearPreviousResults();
        this.showLoading(true);
        
        try {
            const response = await fetch(`${this.apiBaseUrl}/recommendations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    memory_context: memoryContext
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }

            this.displayResults(data.results, data.from_cache);

            if (data.from_cache) {
                this.showNotification('Using cached recommendations (faster & cheaper!)', 'info');
            } else {
                this.showNotification('Generated fresh recommendations (non-streaming)', 'success');
            }
            
        } catch (error) {
            console.error('Refresh error:', error);
            this.showError('Failed to refresh recommendations: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }


    // Save search state to localStorage
    saveSearchState() {
        const searchState = {
            results: this.currentResults,
            query: this.currentQuery,
            thoughtHistory: this.thoughtHistory,
            thinkingText: this.thinkingText,
            timestamp: Date.now()
        };
        localStorage.setItem('searchState', JSON.stringify(searchState));
    }

    // Restore search state from localStorage
    restoreSearchState() {
        try {
            const savedState = localStorage.getItem('searchState');
            console.log('restoreSearchState called, savedState exists:', !!savedState);
            if (savedState) {
                const searchState = JSON.parse(savedState);
                console.log('Parsed searchState:', searchState);
                
                // Only restore if the data is recent (within 1 hour) AND user has API key configured
                const hourAgo = Date.now() - (60 * 60 * 1000);
                const hasApiKey = localStorage.getItem('gemini_api_key');
                
                if (searchState.timestamp > hourAgo && searchState.results && searchState.results.length > 0 && hasApiKey) {
                    console.log('Restoring search state with', searchState.results.length, 'results');
                    this.currentResults = searchState.results;
                    this.currentQuery = searchState.query;
                    
                    // Restore thought history if it exists
                    if (searchState.thoughtHistory) {
                        this.thoughtHistory = searchState.thoughtHistory;
                        console.log('🧠 Restored thought history with', this.thoughtHistory.length, 'thoughts');
                    }
                    if (searchState.thinkingText) {
                        this.thinkingText = searchState.thinkingText;
                        console.log('🧠 Restored thinking text');
                    }
                    
                    // Restore the search input if there was a query
                    if (this.currentQuery) {
                        const searchInput = document.getElementById('searchInput');
                        if (searchInput) {
                            searchInput.value = this.currentQuery;
                        }
                    }
                    
                    // Display the restored results
                    this.displayResults(this.currentResults, false);
                    
                    // Restore thought history component if we have thoughts
                    if (this.thoughtHistory && this.thoughtHistory.length > 0) {
                        setTimeout(() => {
                            this.restoreThoughtHistory();
                        }, 100); // Small delay to ensure DOM is ready
                    }
                    
                    console.log('Restored previous search results');
                } else {
                    console.log('Not restoring search state - no API key configured or data too old');
                    // Ensure empty state is shown
                    const emptyState = document.getElementById('emptyState');
                    if (emptyState) {
                        emptyState.style.display = 'block';
                    }
                }
            }
        } catch (error) {
            console.error('Failed to restore search state:', error);
            localStorage.removeItem('searchState');
        }
    }

    // Display search results
    displayResults(results, fromCache = false) {
        console.log('displayResults called with:', results?.length || 0, 'results', fromCache ? '(from cache)' : '');
        if (results && results.length > 0) {
            console.log('First result:', results[0]);
        }
        
        const contentGrid = document.getElementById('contentGrid');
        const emptyState = document.getElementById('emptyState');
        
        contentGrid.innerHTML = '';
        emptyState.style.display = 'none';
        
        if (!results || results.length === 0) {
            console.log('Showing empty state - no results to display');
            emptyState.style.display = 'block';
            return;
        }

        // Store current results for persistence
        this.currentResults = results;
        this.saveSearchState();

        results.forEach((item, index) => {
            const contentItem = this.createContentItem(item, index, fromCache);
            contentGrid.appendChild(contentItem);
        });
    }

    // Create content item element
    createContentItem(item, index, fromCache = false) {
        const div = document.createElement('div');
        div.className = 'content-item';
        div.style.animationDelay = `${index * 0.1}s`;
        
        // Check if item has validation info
        const isValidated = item.validation && item.validation.validated_at;
        const validationBadge = isValidated ? '<div class="validation-indicator">VERIFIED</div>' : '';
        
        div.innerHTML = `
            ${fromCache ? '<div class="cache-indicator">CACHED</div>' : ''}
            ${validationBadge}
            <div class="content-type ${item.type}">${item.type}</div>
            <h3 class="content-title">${item.title}</h3>
            <p class="content-description">${item.description}</p>
            <p class="content-source">Source: ${item.source}</p>
            <div class="content-actions">
                <a href="${item.url}" target="_blank" rel="noopener noreferrer" class="content-link">
                    <i class="fas fa-external-link-alt"></i> Read More
                </a>
                <button class="dive-deeper-btn" data-item='${JSON.stringify(item)}'>
                    <i class="fas fa-comments"></i> Dive Deeper
                </button>
                <!-- Rating buttons removed - no longer using preferences functionality -->
            </div>
        `;

        // Rating functionality removed - no longer using preferences functionality
        const diveDeeperBtn = div.querySelector('.dive-deeper-btn');
        diveDeeperBtn.addEventListener('click', () => this.redirectToChatPage(item));

        return div;
    }

    // Rating and memory management methods removed - no longer using preferences functionality

    // Show loading state
    showLoading(show) {
        const loading = document.getElementById('loading');
        const contentGrid = document.getElementById('contentGrid');
        const emptyState = document.getElementById('emptyState');
        
        if (show) {
            loading.style.display = 'flex';
            contentGrid.style.display = 'none';
            emptyState.style.display = 'none';
        } else {
            loading.style.display = 'none';
            contentGrid.style.display = 'grid';
        }
    }

    // Show error message
    showError(message) {
        this.showNotification(message, 'error');
    }

    // Show notification
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 1001;
            animation: slideInRight 0.3s ease;
            max-width: 300px;
            word-wrap: break-word;
        `;
        
        // Set background color based on type
        const colors = {
            success: '#48bb78',
            error: '#f56565',
            info: '#667eea',
            warning: '#ed8936'
        };
        notification.style.backgroundColor = colors[type] || colors.info;
        
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // Remove after 4 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 4000);
    }

    // Check backend health
    async checkBackendHealth() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/health`);
            if (response.ok) {
                const data = await response.json();
                console.log('Backend health:', data);
                return true;
            }
        } catch (error) {
            console.error('Backend health check failed:', error);
            this.showError('Backend server is not running. Please start the Python backend.');
            return false;
        }
        return false;
    }

    // Initialize chat event listeners
    initializeChatEventListeners() {
        // Close button
        document.getElementById('chatCloseBtn').addEventListener('click', () => this.closeChatModal());

        // Send button and Enter key
        document.getElementById('chatSendBtn').addEventListener('click', () => this.sendChatMessage());
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendChatMessage();
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

    // Redirect to chat page for an article
    redirectToChatPage(article) {
        // Store article data in localStorage for the chat page to access
        localStorage.setItem('chatArticle', JSON.stringify(article));
        
        // Navigate to chat page
        window.open('chat.html', '_blank');
    }

    // Close chat modal
    closeChatModal() {
        document.getElementById('chatModal').style.display = 'none';
        this.currentArticle = null;
        this.conversationHistory = [];
    }

    // Handle quick action button clicks
    async handleQuickAction(queryType) {
        let message = '';
        
        if (queryType === 'developments') {
            message = 'Find me the relevant developments from the last two years that led up to this news article';
        } else if (queryType === 'competitors') {
            message = 'Help me find interesting data points from competitors to help me contextualize this article, and create a visualization';
        }

        if (message) {
            // Add user message to chat
            this.addChatMessage(message, 'user');
            
            // Send to backend
            await this.sendChatRequest(message);
        }
    }

    // Send chat message
    async sendChatMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        
        if (!message) return;

        // Clear input
        input.value = '';

        // Add user message to chat
        this.addChatMessage(message, 'user');

        // Send to backend
        await this.sendChatRequest(message);
    }

    // Add message to chat display
    addChatMessage(content, type) {
        const chatMessages = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        
        if (type === 'user') {
            messageDiv.className = 'chat-message user-message';
            messageDiv.innerHTML = `
                <div class="message-content">${content}</div>
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
        
        chatMessages.appendChild(messageDiv);
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Add to conversation history
        this.conversationHistory.push({
            role: type === 'user' ? 'user' : 'assistant',
            content: content
        });
    }

    // Send chat request to backend with streaming
    async sendChatRequest(message) {
        const chatLoading = document.getElementById('chatLoading');
        const sendBtn = document.getElementById('chatSendBtn');
        
        try {
            // Show loading state
            chatLoading.style.display = 'flex';
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
                    api_key: this.apiKey || localStorage.getItem('gemini_api_key')
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Handle streaming response
            await this.handleChatStreamingResponse(response);

        } catch (error) {
            console.error('Chat error:', error);
            this.addChatMessage('Sorry, I encountered an error while processing your request. Please try again.', 'bot');
        } finally {
            // Hide loading state
            chatLoading.style.display = 'none';
            sendBtn.disabled = false;
        }
    }

    // Handle streaming chat response
    async handleChatStreamingResponse(response) {
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
                            await this.handleChatStreamChunk(data);
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
    async handleChatStreamChunk(data) {
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
                this.addChatMessage('Sorry, I encountered an error while processing your request. Please try again.', 'bot');
                break;
        }
    }

    // Create a streaming bot message element
    createStreamingBotMessage() {
        const chatMessages = document.getElementById('chatMessages');
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
        chatMessages.appendChild(messageDiv);
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        return { messageDiv, messageContent };
    }

    // Update streaming bot message content
    updateStreamingBotMessage(messageElements, content) {
        messageElements.messageContent.innerHTML = this.formatChatResponse(content);
        
        // Scroll to bottom
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Display chat thinking
    displayChatThinking(thinkingText) {
        console.log('displayChatThinking called with:', thinkingText);
        
        // Check if thinking element already exists
        let thinkingElement = document.getElementById('chatThinking');
        
        if (!thinkingElement) {
            // Create thinking element
            const chatMessages = document.getElementById('chatMessages');
            thinkingElement = document.createElement('div');
            thinkingElement.id = 'chatThinking';
            thinkingElement.className = 'chat-message assistant-message thinking-message';
            thinkingElement.innerHTML = `
                <div class="message-avatar">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="6" fill="currentColor"/>
                    </svg>
                </div>
                <div class="message-content thinking-content">
                    <div class="thinking-header">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M8 1C8 1 6.4 2.4 6.4 4.8C6.4 7.2 8 8.8 8 8.8C8 8.8 9.6 7.2 9.6 4.8C9.6 2.4 8 1 8 1Z" stroke="currentColor" stroke-width="1.2" fill="none"/>
                            <circle cx="4.8" cy="12" r="1.6" stroke="currentColor" stroke-width="1.2" fill="none"/>
                            <circle cx="11.2" cy="12" r="1.6" stroke="currentColor" stroke-width="1.2" fill="none"/>
                        </svg>
                        <span>AI is thinking...</span>
                    </div>
                    <div class="thinking-text" id="chatThinkingText"></div>
                </div>
            `;
            chatMessages.appendChild(thinkingElement);
        }
        
        // Update thinking text
        const thinkingTextElement = document.getElementById('chatThinkingText');
        if (thinkingTextElement) {
            thinkingTextElement.textContent = thinkingText;
        }
        
        // Scroll to bottom
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        console.log('Updated chat thinking display');
    }

    // Hide chat thinking
    hideChatThinking() {
        const thinkingElement = document.getElementById('chatThinking');
        if (thinkingElement) {
            thinkingElement.remove();
            console.log('Hidden chat thinking display');
        }
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
        
        // Italic text: *text* or _text_
        formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        formatted = formatted.replace(/_([^_]+)_/g, '<em>$1</em>');
        
        // Convert line breaks to proper HTML
        formatted = formatted.replace(/\n\n/g, '</p><p>');
        formatted = formatted.replace(/\n/g, '<br>');
        
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
        
        // Wrap in paragraph if no other block elements
        if (!formatted.includes('<p>') && !formatted.includes('<ul>') && !formatted.includes('<h')) {
            formatted = `<p>${formatted}</p>`;
        }
        
        return formatted;
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
        
        // Italic text: *text* or _text_
        formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        formatted = formatted.replace(/_([^_]+)_/g, '<em>$1</em>');
        
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

    // Utility function to escape HTML (to prevent XSS)
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Add notification animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }

    @keyframes fadeIn {
        from {
            opacity: 0.5;
        }
        to {
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    const app = new GeminiContentApp();
    
    // Make app available globally for debugging
    window.geminiApp = app;
    
    // Global debug function to force clear everything
    window.forceReset = function() {
        console.log('Force resetting app...');
        localStorage.clear();
        sessionStorage.clear();
        window.location.reload();
    };
    
    // Global function to clear only mock data
    window.clearMockData = function() {
        console.log('🧹 Clearing mock data...');
        const searchState = localStorage.getItem('searchState');
        if (searchState) {
            try {
                const state = JSON.parse(searchState);
                if (state.results && state.results.some(result => 
                    result.title?.includes("Attention Is All You Need") ||
                    result.description?.includes("groundbreaking paper that introduced the Transformer")
                )) {
                    localStorage.removeItem('searchState');
                    console.log('Mock data cleared!');
                    window.location.reload();
                    return;
                }
            } catch (error) {
                localStorage.removeItem('searchState');
                console.log('Invalid searchState cleared!');
                window.location.reload();
                return;
            }
        }
        console.log('ℹ️ No mock data found in localStorage');
    };
    
    // Check if backend is running
    setTimeout(async () => {
        await app.checkBackendHealth();
    }, 1000);
});