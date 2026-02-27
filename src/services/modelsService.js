/**
 * Enhanced Models Service - Client for fetching available Bedrock models from backend
 * Supports caching, error handling, retry logic, and model grouping
 */

class ModelsService {
  constructor(baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080') {
    this.baseUrl = baseUrl;
    this.defaultTimeout = 30000; // 30 seconds
    this.settingsProvider = null;
    this.cachedModels = null;
    this.cacheTimestamp = null;
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    this.retryAttempts = 3;
    this.retryDelay = 1000; // 1 second
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
   * Fetch available Bedrock models from backend with retry logic
   */
  async getAvailableModels(useCache = true) {
    try {
      // Check cache first
      if (useCache && this.cachedModels && this.cacheTimestamp) {
        const now = Date.now();
        if (now - this.cacheTimestamp < this.cacheExpiry) {
          return {
            success: true,
            models: this.cachedModels,
            cached: true
          };
        }
      }

      // Try to fetch with retry logic
      const result = await this._fetchWithRetry();
      
      if (result.success) {
        // Cache the results
        this.cachedModels = result.models;
        this.cacheTimestamp = Date.now();
      } else if (useCache && this.cachedModels) {
        // Fallback to cached models if available
        return {
          success: true,
          models: this.cachedModels,
          cached: true,
          warning: 'Using cached models due to API error: ' + result.error
        };
      }

      return result;

    } catch (error) {
      console.error('Models service error:', error);
      
      // Fallback to cached models if available
      if (useCache && this.cachedModels) {
        return {
          success: true,
          models: this.cachedModels,
          cached: true,
          warning: 'Using cached models due to error: ' + error.message
        };
      }

      return {
        success: false,
        error: error.message || 'Failed to fetch available models',
        models: []
      };
    }
  }

  /**
   * Internal method to fetch models with retry logic
   */
  async _fetchWithRetry(attempt = 1) {
    try {
      const timeout = this.getTimeout('backendRequestTimeout');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`${this.baseUrl}/available-models`, {
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
      return result;

    } catch (error) {
      if (attempt < this.retryAttempts && error.name !== 'AbortError') {
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        return this._fetchWithRetry(attempt + 1);
      }

      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'Request timed out while fetching models.',
          models: []
        };
      }

      return {
        success: false,
        error: error.message || 'Failed to fetch available models',
        models: []
      };
    }
  }

  /**
   * Get detailed information about a specific model
   */
  async getModelInfo(modelId) {
    try {


      const timeout = this.getTimeout('backendRequestTimeout');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`${this.baseUrl}/model-info/${encodeURIComponent(modelId)}`, {
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
      


      return result;

    } catch (error) {
      console.error('Model info service error');
      
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'Request timed out while fetching model info.',
          model: null
        };
      }

      return {
        success: false,
        error: error.message || 'Failed to fetch model information',
        model: null
      };
    }
  }

  /**
   * Get models grouped by provider and capability for better UX
   */
  async getModelsByCategory(useCache = true) {
    const result = await this.getAvailableModels(useCache);
    
    if (!result.success) {
      return result;
    }

    const categories = {
      Latest: [],
      Premium: [], // Add Premium category from backend
      Advanced: [],
      Standard: [],
      Fast: []
    };

    // Group by provider first, then by capability
    const providerGroups = {};
    
    result.models.forEach(model => {
      const provider = model.provider || 'Unknown';
      if (!providerGroups[provider]) {
        providerGroups[provider] = [];
      }
      providerGroups[provider].push(model);
      
      // Also categorize by capability
      const category = model.category || 'Standard';
      if (categories[category]) {
        categories[category].push(model);
      }
    });

    return {
      success: true,
      categories,
      providerGroups,
      total: result.models.length,
      cached: result.cached,
      warning: result.warning
    };
  }

  /**
   * Get models formatted for Cloudscape Select component
   */
  async getModelsForSelect(useCache = true) {
    const result = await this.getModelsByCategory(useCache);
    
    if (!result.success) {
      return result;
    }

    const options = [];
    
    // Define category order for better UX (matching backend categories)
    const categoryOrder = ['Latest', 'Premium', 'Advanced', 'Standard', 'Fast'];
    
    categoryOrder.forEach(categoryName => {
      const models = result.categories[categoryName];
      if (models && models.length > 0) {
        // Add category group
        options.push({
          label: categoryName,
          options: models.map(model => ({
            label: model.name, // Use model name as-is from Bedrock API
            value: model.id,
            description: model.description,
            tags: model.recommended ? ['Recommended'] : []
            // Removed disabled property - all models should be selectable
          }))
        });
      }
    });

    return {
      success: true,
      options,
      total: result.total,
      cached: result.cached,
      warning: result.warning
    };
  }

  /**
   * Get recommended models
   */
  async getRecommendedModels(useCache = true) {
    const result = await this.getAvailableModels(useCache);
    
    if (!result.success) {
      return result;
    }

    const recommended = result.models.filter(model => model.recommended);

    return {
      success: true,
      models: recommended,
      total: recommended.length
    };
  }

  /**
   * Find model by ID
   */
  async findModelById(modelId, useCache = true) {
    const result = await this.getAvailableModels(useCache);
    
    if (!result.success) {
      return { success: false, model: null, error: result.error };
    }

    const model = result.models.find(m => m.id === modelId);

    return {
      success: true,
      model: model || null
    };
  }

  /**
   * Clear cached models (force refresh on next request)
   */
  clearCache() {
    this.cachedModels = null;
    this.cacheTimestamp = null;

  }

  /**
   * Get service status
   */
  getServiceInfo() {
    return {
      baseUrl: this.baseUrl,
      timeout: this.getTimeout('backendRequestTimeout'),
      cacheExpiry: this.cacheExpiry,
      hasCachedModels: !!this.cachedModels,
      cacheAge: this.cacheTimestamp ? Date.now() - this.cacheTimestamp : null
    };
  }
}

// Create singleton instance
const modelsService = new ModelsService();

export default modelsService;
export { ModelsService };