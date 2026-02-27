/**
 * Expert Agent Service - Client for communicating with Strands expert agent backend
 * This service handles all communication with the FastAPI backend that hosts the expert agent
 */

import { authService } from './authService.js';

class ExpertAgentService {
  constructor(baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080') {
    this.baseUrl = baseUrl;
    this.defaultTimeout = 120000; // Default 2 minute timeout for code generation
    this.settingsProvider = null; // Will be set by the component using this service
  }

  /**
   * Set the settings provider to get configurable timeouts
   */
  setSettingsProvider(settingsProvider) {
    this.settingsProvider = settingsProvider;
  }

  /**
   * Get the current timeout value from settings or use default
   */
  getTimeout(timeoutType = 'codeGenerationTimeout') {
    if (this.settingsProvider && this.settingsProvider.settings) {
      return this.settingsProvider.settings[timeoutType] || this.defaultTimeout;
    }
    return this.defaultTimeout;
  }

  /**
   * Get authenticated headers for API requests
   */
  async getAuthHeaders() {
    const headers = {
      'Content-Type': 'application/json',
    };

    try {
      const token = await authService.getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } catch (error) {
      console.warn('Failed to get auth token');
      // Continue without auth - backend will return 403 if auth is required
    }

    return headers;
  }

  /**
   * Generate Strands code using the expert agent with advanced Bedrock features
   */
  async generateCode(visualConfig, expertAgentModel = null, advancedConfig = null) {
    try {
      // Prepare enhanced configuration with advanced Bedrock features
      const enhancedConfig = {
        ...visualConfig,
        expertAgentModel: expertAgentModel || visualConfig.expertAgentModel
      };

      // Add advanced Bedrock configuration if provided
      if (advancedConfig || this.settingsProvider?.settings) {
        const settings = this.settingsProvider?.settings || {};
        const bedrockConfig = advancedConfig || {
          model_id: expertAgentModel || settings.expertAgentModel || settings.runtimeSelectedModel,
          // Free-form generation is now the default approach
          enable_reasoning: true,       // Always enabled for better code quality
          enable_prompt_caching: settings.enablePromptCaching || false,
          runtime_model_switching: settings.runtimeModelConfiguration || false,
          temperature: 0.3,
          max_tokens: 4000,
          top_p: 0.9
        };

        enhancedConfig.bedrock_config = bedrockConfig;
        enhancedConfig.generation_mode = settings.generationMode || 'freeform';
      }

      // Sending configuration to expert agent

      const timeout = this.getTimeout('codeGenerationTimeout');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.baseUrl}/generate-code`, {
        method: 'POST',
        headers,
        body: JSON.stringify(enhancedConfig),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      // Ensure code is always a string
      if (result.success && result.code && typeof result.code !== 'string') {
        result.code = String(result.code);
      }

      return result;

    } catch (error) {
      console.error('Expert agent service error');
      
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'Code generation timed out. Please try with a simpler configuration.',
          metadata: { timeout: true }
        };
      }

      return {
        success: false,
        error: error.message || 'Failed to communicate with expert agent service',
        metadata: { networkError: true }
      };
    }
  }



  /**
   * Generate code with streaming support - matches backend implementation
   */
  async generateCodeStreaming(visualConfig, onProgress, expertAgentModel = null, advancedConfig = null) {
    try {
      // Prepare enhanced configuration (same as regular method)
      const enhancedConfig = {
        ...visualConfig,
        expertAgentModel: expertAgentModel || visualConfig.expertAgentModel
        // Note: stream defaults to true in backend, no need to send it
      };

      // Config prepared for streaming

      // Add advanced Bedrock configuration if provided (same as regular method)
      if (advancedConfig || this.settingsProvider?.settings) {
        const settings = this.settingsProvider?.settings || {};
        const bedrockConfig = advancedConfig || {
          model_id: expertAgentModel || settings.expertAgentModel || settings.runtimeSelectedModel,
          enable_reasoning: true,
          enable_prompt_caching: settings.enablePromptCaching || false,
          runtime_model_switching: settings.runtimeModelConfiguration || false,
          temperature: 0.3,
          max_tokens: 4000,
          top_p: 0.9
        };

        enhancedConfig.bedrock_config = bedrockConfig;
        enhancedConfig.generation_mode = settings.generationMode || 'freeform';
      }

      const timeout = this.getTimeout('codeGenerationTimeout');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.baseUrl}/generate-code`, {
        method: 'POST',
        headers,
        body: JSON.stringify(enhancedConfig),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('🚨 Backend error response:', errorData);
        console.error('🚨 Validation errors:', JSON.stringify(errorData.detail, null, 2));
        throw new Error(JSON.stringify(errorData.detail) || `HTTP error! status: ${response.status}`);
      }

      // Handle SSE streaming response - matches backend format
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Keep the last incomplete line in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const chunk = line.slice(6); // Remove "data: " prefix - DON'T TRIM to preserve spaces
            
            if (chunk === '[DONE]') {
              break;
            } else if (chunk.startsWith('[FINAL]')) {
              // Handle final metadata with real request_id
              try {
                const finalJson = chunk.slice(7); // Remove "[FINAL]" prefix
                const finalResponse = JSON.parse(finalJson);
                // Final response received with metadata
                
                // Return the final response with real metadata
                return finalResponse;
              } catch (e) {
                console.warn('Failed to parse final response:', e);
              }
            } else if (chunk) {
              // Unescape newlines that were escaped for SSE format
              const unescapedChunk = chunk.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
              
              // DEBUG: Uncomment for frontend streaming debugging
              // if (chunk.includes('CONFIGURATION') || chunk.includes('ANALYSIS')) {
              // }
              
              // Accumulate unescaped chunks
              fullResponse += unescapedChunk;
              
              onProgress(fullResponse); // Let ReactMarkdown do its job
            }
          }
        }
      }

      // If we reach here without getting [FINAL] message, return basic response
      return {
        success: true,
        code: fullResponse,
        metadata: { streaming: true }
      };

    } catch (error) {
      console.error('Streaming generation error:', error);
      
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'Code generation timed out. Please try with a simpler configuration.',
          metadata: { timeout: true }
        };
      }

      return {
        success: false,
        error: error.message || 'Failed to communicate with expert agent service',
        metadata: { networkError: true }
      };
    }
  }

  /**
   * Check if the expert agent service is healthy and ready
   */
  async checkHealth() {
    try {
      const timeout = this.getTimeout('backendRequestTimeout');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      const health = await response.json();
      return {
        success: true,
        ...health
      };

    } catch (error) {
      console.error('Health check failed');
      return {
        success: false,
        status: 'error',
        expert_agent_ready: false,
        error: error.message
      };
    }
  }

  /**
   * Get information about the expert agent capabilities
   */
  async getAgentInfo() {
    try {
      const timeout = this.getTimeout('backendRequestTimeout');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.baseUrl}/agent-info`, {
        method: 'GET',
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Agent info request failed: ${response.status}`);
      }

      const info = await response.json();
      return {
        success: true,
        ...info
      };

    } catch (error) {
      console.error('Agent info request failed');
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Test connection to the expert agent service
   */
  async testConnection() {
    const startTime = Date.now();
    
    try {
      const health = await this.checkHealth();
      const responseTime = Date.now() - startTime;
      
      return {
        success: health.success,
        responseTime,
        status: health.status,
        expertAgentReady: health.expert_agent_ready,
        error: health.error
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        success: false,
        responseTime,
        status: 'error',
        expertAgentReady: false,
        error: error.message
      };
    }
  }

  /**
   * Validate configuration before sending to expert agent
   */
  validateConfiguration(config) {
    const errors = [];
    const warnings = [];

    // Check required fields
    if (!config.agents || config.agents.length === 0) {
      errors.push('At least one agent is required');
    }

    if (!config.tools || config.tools.length === 0) {
      warnings.push('No tools configured - agent will have limited capabilities');
    }

    if (!config.architecture) {
      errors.push('Architecture configuration is missing');
    }

    // Validate agents
    config.agents?.forEach((agent, index) => {
      if (!agent.model) {
        errors.push(`Agent ${index + 1}: Model is required`);
      }
      if (!agent.systemPrompt || agent.systemPrompt.trim() === '') {
        warnings.push(`Agent ${index + 1}: System prompt is empty`);
      }
    });

    // Validate tools
    config.tools?.forEach((tool, index) => {
      if (!tool.name) {
        errors.push(`Tool ${index + 1}: Name is required`);
      }
      if (tool.type === 'custom' && !tool.description) {
        warnings.push(`Tool ${index + 1}: Custom tools should have descriptions`);
      }
    });

    return { errors, warnings };
  }

  /**
   * Get service configuration and status
   */
  getServiceInfo() {
    return {
      baseUrl: this.baseUrl,
      timeout: this.getTimeout('codeGenerationTimeout'),
      backendTimeout: this.getTimeout('backendRequestTimeout'),
      version: '1.0.0',
      capabilities: [
        'Visual configuration analysis',
        'Strands code generation',
        'Architecture pattern implementation',
        'Best practice application',
        'Error handling and validation'
      ]
    };
  }
}

// Create singleton instance
const expertAgentService = new ExpertAgentService();

export default expertAgentService;
export { ExpertAgentService };