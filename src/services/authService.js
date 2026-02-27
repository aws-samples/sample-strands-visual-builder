import { Amplify } from 'aws-amplify';
import { 
  signUp, 
  signIn, 
  signOut, 
  getCurrentUser, 
  fetchAuthSession,
  confirmSignUp,
  resendSignUpCode
} from 'aws-amplify/auth';
import { configService } from './configService.js';

/**
 * AuthService handles all Cognito authentication operations
 * Provides a clean interface for user management
 */
class AuthService {
  constructor() {
    this.isConfigured = false;
    this.initializationPromise = this.initializeAmplify();
  }

  /**
   * Ensure Amplify is initialized before any auth operations
   */
  async ensureInitialized() {
    if (!this.isConfigured) {
      await this.initializationPromise;
    }
  }

  /**
   * Initialize Amplify with Cognito configuration from backend API
   * No environment variables needed - configuration is loaded dynamically
   */
  async initializeAmplify() {
    try {
      // Load configuration from backend API (SSM parameters)
      const config = await configService.getAmplifyConfig();

      Amplify.configure(config);
      this.isConfigured = true;
    } catch (error) {
      console.error('Failed to configure Amplify:', error);
      this.isConfigured = false;
    }
  }

  /**
   * Sign up a new user with email and password
   * @param {string} email - User's email address
   * @param {string} password - User's password
   * @returns {Promise<Object>} Sign up result
   */
  async signUp(email, password) {
    try {
      await this.ensureInitialized();
      
      if (!this.isConfigured) {
        throw new Error('Authentication service not configured. Please deploy CDK infrastructure first.');
      }

      const result = await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email
          }
        }
      });

      return {
        success: true,
        user: result.user,
        nextStep: result.nextStep
      };
    } catch (error) {
      console.error('Sign up failed');
      return {
        success: false,
        error: error.message || 'Sign up failed'
      };
    }
  }

  /**
   * Confirm user sign up with verification code
   * @param {string} email - User's email address
   * @param {string} code - Verification code
   * @returns {Promise<Object>} Confirmation result
   */
  async confirmSignUp(email, code) {
    try {
      await this.ensureInitialized();
      
      if (!this.isConfigured) {
        throw new Error('Authentication service not configured. Please deploy CDK infrastructure first.');
      }

      await confirmSignUp({
        username: email,
        confirmationCode: code
      });

      return {
        success: true,
        message: 'Account confirmed successfully'
      };
    } catch (error) {
      console.error('Confirmation failed');
      return {
        success: false,
        error: error.message || 'Confirmation failed'
      };
    }
  }

  /**
   * Resend verification code
   * @param {string} email - User's email address
   * @returns {Promise<Object>} Resend result
   */
  async resendSignUpCode(email) {
    try {
      await this.ensureInitialized();
      
      if (!this.isConfigured) {
        throw new Error('Authentication service not configured. Please deploy CDK infrastructure first.');
      }

      await resendSignUpCode({
        username: email
      });

      return {
        success: true,
        message: 'Verification code sent'
      };
    } catch (error) {
      console.error('Failed to resend code');
      return {
        success: false,
        error: error.message || 'Failed to resend code'
      };
    }
  }

  /**
   * Sign in user with email and password
   * @param {string} email - User's email address
   * @param {string} password - User's password
   * @returns {Promise<Object>} Sign in result
   */
  async signIn(email, password) {
    try {
      await this.ensureInitialized();
      
      if (!this.isConfigured) {
        throw new Error('Authentication service not configured. Please deploy CDK infrastructure first.');
      }

      const result = await signIn({
        username: email,
        password
      });

      return {
        success: true,
        user: result.user,
        nextStep: result.nextStep
      };
    } catch (error) {
      console.error('Sign in failed');
      return {
        success: false,
        error: error.message || 'Sign in failed'
      };
    }
  }

  /**
   * Sign out current user
   * @returns {Promise<Object>} Sign out result
   */
  async signOut() {
    try {
      await this.ensureInitialized();
      
      if (!this.isConfigured) {
        return { success: true }; // Allow sign out even if not configured
      }

      await signOut();
      return {
        success: true,
        message: 'Signed out successfully'
      };
    } catch (error) {
      console.error('Sign out failed');
      return {
        success: false,
        error: error.message || 'Sign out failed'
      };
    }
  }

  /**
   * Get current authenticated user
   * @returns {Promise<Object>} Current user or null
   */
  async getCurrentUser() {
    try {
      await this.ensureInitialized();
      
      if (!this.isConfigured) {
        return null;
      }

      const user = await getCurrentUser();
      return {
        success: true,
        user: {
          userId: user.userId,
          username: user.username,
          email: user.signInDetails?.loginId || user.username
        }
      };
    } catch (error) {
      // User not authenticated - this is normal
      return {
        success: false,
        user: null
      };
    }
  }

  /**
   * Get JWT token for API authentication
   * @returns {Promise<string|null>} JWT token or null
   */
  async getToken() {
    try {
      await this.ensureInitialized();
      
      if (!this.isConfigured) {
        return null;
      }

      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString() || null;
      
      return token;
    } catch (error) {
      console.error('Token retrieval failed');
      return null;
    }
  }

  /**
   * Check if user is authenticated
   * @returns {Promise<boolean>} Authentication status
   */
  async isAuthenticated() {
    try {
      const userResult = await this.getCurrentUser();
      return userResult.success && userResult.user !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get configuration status
   * @returns {boolean} Whether Amplify is properly configured
   */
  isConfigurationReady() {
    return this.isConfigured && 
           import.meta.env.VITE_COGNITO_USER_POOL_ID && 
           import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID;
  }
}

// Export singleton instance
export const authService = new AuthService();
export default authService;