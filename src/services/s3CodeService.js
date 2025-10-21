/**
 * S3 Code Service - Client for fetching code files from S3 temporary storage
 * This service handles fetching both pure Strands code and AgentCore-ready code
 */

class S3CodeService {
  constructor(baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080') {
    this.baseUrl = baseUrl;
    this.defaultTimeout = 30000; // 30 second timeout for S3 operations
    this.settingsProvider = null;
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
  getTimeout(timeoutType = 'backendRequestTimeout') {
    if (this.settingsProvider && this.settingsProvider.settings) {
      return this.settingsProvider.settings[timeoutType] || this.defaultTimeout;
    }
    return this.defaultTimeout;
  }

  /**
   * Fetch code file from S3 temporary storage
   * @param {string} sessionId - Session identifier
   * @param {string} codeType - Type of code ('pure_strands', 'agentcore_ready', or 'requirements')
   * @returns {Promise<Object>} Code content and metadata
   */
  async fetchCodeFile(sessionId, codeType) {
    try {
      if (!sessionId || !sessionId.trim()) {
        throw new Error('Session ID is required');
      }

      if (!['pure_strands', 'agentcore_ready', 'requirements'].includes(codeType)) {
        throw new Error('Code type must be "pure_strands", "agentcore_ready", or "requirements"');
      }



      const timeout = this.getTimeout('backendRequestTimeout');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`${this.baseUrl}/api/s3-code/${sessionId}/${codeType}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 404) {
          return {
            success: false,
            error: 'Code file not found',
            notFound: true
          };
        }
        
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      


      return {
        success: true,
        code: result.code_content,
        metadata: {
          sessionId: result.session_id,
          codeType: result.code_type,
          lastModified: result.last_modified,
          contentLength: result.content_length,
          s3Uri: result.s3_uri
        }
      };

    } catch (error) {
      console.error('S3 code fetch error');
      
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'Request timed out. Please try again.',
          timeout: true
        };
      }

      return {
        success: false,
        error: error.message || 'Failed to fetch code from S3',
        networkError: true
      };
    }
  }

  /**
   * List all code files for a session
   * @param {string} sessionId - Session identifier
   * @returns {Promise<Object>} List of files and metadata
   */
  async listSessionFiles(sessionId) {
    try {
      if (!sessionId || !sessionId.trim()) {
        throw new Error('Session ID is required');
      }



      const timeout = this.getTimeout('backendRequestTimeout');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`${this.baseUrl}/api/s3-code/${sessionId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      


      return {
        success: true,
        files: result.files,
        count: result.count,
        sessionId: result.session_id
      };

    } catch (error) {
      console.error('S3 file listing error');
      
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'Request timed out. Please try again.',
          timeout: true
        };
      }

      return {
        success: false,
        error: error.message || 'Failed to list session files',
        networkError: true
      };
    }
  }

  /**
   * Check if code files exist for a session
   * @param {string} sessionId - Session identifier
   * @returns {Promise<Object>} Availability status
   */
  async checkCodeAvailability(sessionId) {
    try {
      const listResult = await this.listSessionFiles(sessionId);
      
      if (!listResult.success) {
        return listResult;
      }

      const files = listResult.files || [];
      const pureStrandsAvailable = files.some(f => f.code_type === 'pure_strands');
      const agentCoreAvailable = files.some(f => f.code_type === 'agentcore_ready');

      return {
        success: true,
        sessionId,
        pureStrandsAvailable,
        agentCoreAvailable,
        totalFiles: files.length,
        files
      };

    } catch (error) {
      console.error('Code availability check error');
      return {
        success: false,
        error: error.message || 'Failed to check code availability'
      };
    }
  }

  /**
   * Generate a request ID for code generation requests
   * @returns {string} Request ID
   */
  generateRequestId() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const random = Math.random().toString(36).substring(2, 8);
    return `req_${timestamp}_${random}`;
  }

  /**
   * Test connection to the S3 code service
   * @returns {Promise<Object>} Connection test result
   */
  async testConnection() {
    const startTime = Date.now();
    
    try {
      // Test with a dummy session ID
      const testSessionId = 'test_connection_' + Date.now();
      const result = await this.listSessionFiles(testSessionId);
      const responseTime = Date.now() - startTime;
      
      return {
        success: true,
        responseTime,
        status: 'connected',
        message: 'S3 code service is accessible'
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        success: false,
        responseTime,
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Get service information
   * @returns {Object} Service configuration and status
   */
  getServiceInfo() {
    return {
      baseUrl: this.baseUrl,
      timeout: this.getTimeout('backendRequestTimeout'),
      version: '1.0.0',
      supportedCodeTypes: ['pure_strands', 'agentcore_ready', 'requirements'],
      capabilities: [
        'Fetch code files from S3 temporary storage',
        'List session files',
        'Check code availability',
        'Error handling and retry logic'
      ]
    };
  }
}

// Create singleton instance
const s3CodeService = new S3CodeService();

export default s3CodeService;
export { S3CodeService };