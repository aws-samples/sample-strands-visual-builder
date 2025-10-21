/**
 * Configuration service that loads settings from the backend API
 * instead of environment variables. This eliminates the need for
 * .env files and automatically works with any AWS account.
 */

class ConfigService {
    constructor() {
        this.config = null;
        this.loading = false;
        this.error = null;
    }

    /**
     * Load configuration from the backend API
     * @returns {Promise<Object>} Configuration object
     */
    async loadConfig() {
        if (this.config) {
            return this.config;
        }

        if (this.loading) {
            // Wait for existing request to complete
            while (this.loading) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return this.config;
        }

        this.loading = true;
        this.error = null;

        try {
            const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
            const response = await fetch(`${apiBaseUrl}/api/config`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`Configuration API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            
            if (!data.success) {
                throw new Error(`Configuration error: ${data.error || 'Unknown error'}`);
            }

            this.config = data.config;
            
            return this.config;

        } catch (error) {
            console.error('Failed to load configuration');
            this.error = error;
            throw error;
        } finally {
            this.loading = false;
        }
    }

    /**
     * Get Cognito configuration for Amplify
     * @returns {Promise<Object>} Amplify-compatible config
     */
    async getAmplifyConfig() {
        const config = await this.loadConfig();
        
        return {
            Auth: {
                Cognito: {
                    userPoolId: config.cognito_user_pool_id,
                    userPoolClientId: config.cognito_client_id,
                    region: config.aws_region,
                    signUpVerificationMethod: 'code',
                    loginWith: {
                        email: true,
                        username: false,
                        phone: false,
                    },
                },
            },
        };
    }

    /**
     * Get API base URL
     * @returns {Promise<string>} API base URL
     */
    async getApiBaseUrl() {
        const config = await this.loadConfig();
        return config.api_base_url || 'http://localhost:8080';
    }

    /**
     * Get current AWS account ID
     * @returns {Promise<string>} Account ID
     */
    async getAccountId() {
        const config = await this.loadConfig();
        return config.account_id;
    }

    /**
     * Check if configuration is loaded
     * @returns {boolean} True if config is loaded
     */
    isLoaded() {
        return this.config !== null;
    }

    /**
     * Get configuration synchronously (only if already loaded)
     * @returns {Object|null} Configuration object or null
     */
    getConfigSync() {
        return this.config;
    }

    /**
     * Clear cached configuration (force reload on next request)
     */
    clearCache() {
        this.config = null;
        this.error = null;
    }

    /**
     * Get configuration health status
     * @returns {Promise<Object>} Health status
     */
    async getHealthStatus() {
        try {
            const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
            const response = await fetch(`${apiBaseUrl}/api/config/health`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`Health check failed: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Configuration health check failed');
            throw error;
        }
    }
}

// Export singleton instance
export const configService = new ConfigService();
export default configService;