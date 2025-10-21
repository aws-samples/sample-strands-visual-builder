import axios from 'axios';
import Logger from '../utils/logger';

// Use the same base URL pattern as other services
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

// Global auth token getter - will be set by AuthContext
let getAuthToken = () => null;

// Function to set the auth token getter
export const setNewChatAuthTokenGetter = (tokenGetter) => {
  getAuthToken = tokenGetter;
};

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor to include auth token
api.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for comprehensive error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    Logger.error('New Chat API Error:', error);
    
    // Enhanced error handling with specific error types
    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response;
      const errorMessage = data?.detail?.error || data?.detail || data?.message || error.message;
      const errorCode = data?.detail?.error_code || 'API_ERROR';
      
      Logger.error(`API Error ${status}: ${errorMessage} (Code: ${errorCode})`);
      
      // Create enhanced error object
      const enhancedError = new Error(errorMessage);
      enhancedError.status = status;
      enhancedError.code = errorCode;
      enhancedError.operation = data?.detail?.operation;
      enhancedError.isNetworkError = false;
      
      return Promise.reject(enhancedError);
    } else if (error.request) {
      // Network error - no response received
      Logger.error('Network Error:', error.request);
      const networkError = new Error('Network connection failed. Please check your internet connection.');
      networkError.status = 0;
      networkError.code = 'NETWORK_ERROR';
      networkError.isNetworkError = true;
      return Promise.reject(networkError);
    } else {
      // Request setup error
      Logger.error('Request Error:', error.message);
      const requestError = new Error(`Request failed: ${error.message}`);
      requestError.status = 0;
      requestError.code = 'REQUEST_ERROR';
      requestError.isNetworkError = false;
      return Promise.reject(requestError);
    }
  }
);

// Enhanced error handling utility
const handleServiceError = (error, operation) => {
  Logger.error(`${operation} failed:`, error);
  
  if (error.isNetworkError) {
    throw new Error(`Network error during ${operation}. Please check your connection and try again.`);
  } else if (error.status === 404) {
    throw new Error(`Resource not found during ${operation}.`);
  } else if (error.status === 403) {
    throw new Error(`Access denied during ${operation}. Please check your permissions.`);
  } else if (error.status === 429) {
    throw new Error(`Too many requests during ${operation}. Please wait a moment and try again.`);
  } else if (error.status >= 500) {
    throw new Error(`Server error during ${operation}. Please try again later.`);
  } else {
    throw new Error(`${operation} failed: ${error.message}`);
  }
};

// New Chat API functions for clean HTTP implementation with enhanced error handling
export const newChatService = {
  // Create new conversation with retry logic
  async createConversation(conversationData, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await api.post('/api/chat-clean/conversations', conversationData);
        return response.data;
      } catch (error) {
        if (attempt === retries || !error.isNetworkError) {
          handleServiceError(error, 'create conversation');
        }
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  },

  // Get all conversations for authenticated user with retry logic
  async getConversations(params = {}, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const {
          limit = 25,
          next_token = null,
          status = null
        } = params;

        const queryParams = new URLSearchParams({
          limit: limit.toString()
        });

        if (next_token) {
          queryParams.append('next_token', next_token);
        }
        
        if (status) {
          queryParams.append('status', status);
        }

        const response = await api.get(`/api/chat-clean/conversations?${queryParams}`);
        return response.data;
      } catch (error) {
        if (attempt === retries || !error.isNetworkError) {
          handleServiceError(error, 'fetch conversations');
        }
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  },

  // Get messages for a conversation with retry logic
  async getMessages(conversationId, params = {}, retries = 2) {
    if (!conversationId) {
      throw new Error('Conversation ID is required');
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const {
          limit = 50,
          next_token = null
        } = params;

        const queryParams = new URLSearchParams({
          limit: limit.toString()
        });

        if (next_token) {
          queryParams.append('next_token', next_token);
        }

        const response = await api.get(`/api/chat-clean/conversations/${conversationId}/messages?${queryParams}`);
        return response.data;
      } catch (error) {
        if (attempt === retries || !error.isNetworkError) {
          handleServiceError(error, 'fetch messages');
        }
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  },

  // Send message with streaming response handling and enhanced error handling
  async sendMessage(conversationId, messageContent, agentCoreOptions = {}) {
    if (!conversationId) {
      throw new Error('Conversation ID is required');
    }
    
    if (!messageContent || messageContent.trim().length === 0) {
      throw new Error('Message content cannot be empty');
    }

    if (messageContent.length > 10000) {
      throw new Error('Message is too long (maximum 10,000 characters)');
    }

    try {
      const messageData = {
        content: messageContent.trim(),
        agentcore_options: {
          use_web: Boolean(agentCoreOptions.use_web),
          think: Boolean(agentCoreOptions.think),
          swarm: Boolean(agentCoreOptions.swarm)
        },
        metadata: {
          agentcore_options: agentCoreOptions,
          timestamp: new Date().toISOString()
        }
      };

      // Use fetch for streaming response instead of axios
      const token = getAuthToken();
      const headers = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/api/chat-clean/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(messageData),
        // Add timeout and other fetch options
        signal: AbortSignal.timeout(3600000) // 1 hour timeout - very generous for complex AgentCore operations
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail?.error || errorData.detail || errorData.message || errorMessage;
        } catch (parseError) {
          // If we can't parse the error response, use the status text
          errorMessage = response.statusText || errorMessage;
        }
        
        const error = new Error(errorMessage);
        error.status = response.status;
        error.isNetworkError = false;
        throw error;
      }

      return response; // Return the fetch response for streaming
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Message sending timed out. Please try again.');
      } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Network connection failed. Please check your internet connection.');
      } else {
        handleServiceError(error, 'send message');
      }
    }
  },

  // Health check endpoint
  async healthCheck() {
    try {
      const response = await api.get('/api/chat-clean/health');
      return response.data;
    } catch (error) {
      Logger.warn('Health check failed:', error);
      return { status: 'unhealthy', error: error.message };
    }
  },

  // Delete conversation
  async deleteConversation(conversationId) {
    if (!conversationId) {
      throw new Error('Conversation ID is required');
    }

    try {
      const response = await api.delete(`/api/chat-clean/conversations/${conversationId}`);
      return response.data;
    } catch (error) {
      handleServiceError(error, 'delete conversation');
    }
  },

  // Update conversation
  async updateConversation(conversationId, updates) {
    if (!conversationId) {
      throw new Error('Conversation ID is required');
    }

    try {
      const response = await api.put(`/api/chat-clean/conversations/${conversationId}`, updates);
      return response.data;
    } catch (error) {
      handleServiceError(error, 'update conversation');
    }
  },

  // Expose getAuthToken for authentication
  getAuthToken() {
    return getAuthToken();
  }
};

export default newChatService;