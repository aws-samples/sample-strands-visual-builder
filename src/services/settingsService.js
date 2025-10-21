/**
 * Settings service for DynamoDB operations
 */

import authService from './authService.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

class SettingsService {
  constructor() {
    this.baseUrl = `${API_BASE_URL}/api/settings`;
  }

  /**
   * Get user settings from DynamoDB
   * @returns {Promise<{settings: Object, source: string, lastUpdated: string|null}>}
   */
  async getUserSettings() {
    try {
      const token = await this.getAuthToken();
      if (!token) {
        throw new Error('No authentication token available. Please sign in.');
      }

      const response = await fetch(`${this.baseUrl}/user-settings`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (response.status === 401) {
        throw new Error('Authentication failed. Please sign in again.');
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
      }

      const data = await response.json();

      return data;
    } catch (error) {
      console.error('Failed to get user settings');
      throw error;
    }
  }

  /**
   * Save user settings to DynamoDB
   * @param {Object} settings - Settings object to save
   * @returns {Promise<{settings: Object, source: string, lastUpdated: string|null}>}
   */
  async saveUserSettings(settings) {
    try {
      const token = await this.getAuthToken();
      if (!token) {
        throw new Error('No authentication token available. Please sign in.');
      }

      const response = await fetch(`${this.baseUrl}/user-settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({ settings })
      });

      if (response.status === 401) {
        throw new Error('Authentication failed. Please sign in again.');
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
      }

      const data = await response.json();

      return data;
    } catch (error) {
      console.error('Failed to save user settings');
      throw error;
    }
  }

  /**
   * Delete user settings from DynamoDB
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async deleteUserSettings() {
    try {
      const token = await this.getAuthToken();
      if (!token) {
        throw new Error('No authentication token available. Please sign in.');
      }

      const response = await fetch(`${this.baseUrl}/user-settings`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (response.status === 401) {
        throw new Error('Authentication failed. Please sign in again.');
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
      }

      const data = await response.json();

      return data;
    } catch (error) {
      console.error('Failed to delete user settings');
      throw error;
    }
  }

  /**
   * Check settings service health
   * @returns {Promise<Object>}
   */
  async healthCheck() {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      return data;
    } catch (error) {
      console.error('Settings service health check failed');
      throw error;
    }
  }

  /**
   * Get authentication token using authService
   * @returns {Promise<string|null>}
   */
  async getAuthToken() {
    try {
      const token = await authService.getToken();
      if (token && token.length > 10) {
        return token;
      }
      console.warn('No valid authentication token found');
      return null;
    } catch (error) {
      console.error('Failed to get authentication token');
      return null;
    }
  }
}

export default new SettingsService();