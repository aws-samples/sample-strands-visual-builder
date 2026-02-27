import React, { createContext, useContext, useState, useEffect } from 'react';
import settingsService from '../services/settingsService';

// Default settings values
const DEFAULT_SETTINGS = {
  // Timeout values (in milliseconds)
  codeGenerationTimeout: 600000,    // 10 minutes
  pythonExecutionTimeout: 600000,   // 10 minutes
  backendRequestTimeout: 600000,    // 10 minutes
  
  // Expert agent model configuration
  expertAgentModel: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',  // Default to Claude 3.7 Sonnet with regional prefix
  
  // Advanced Bedrock features (enabled by default for better performance)
  // Free-form generation is now the default approach for better flexibility
  enableReasoning: true,            // Enable reasoning token support (always on for better code quality)
  enablePromptCaching: false,       // Enable prompt caching for cost optimization
  runtimeModelConfiguration: false, // Enable runtime model switching
  runtimeSelectedModel: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0'  // Model for runtime switching
};

const SettingsContext = createContext();

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState('default'); // 'dynamodb', 'localStorage', 'default'
  const [error, setError] = useState(null);

  // Load settings on mount with progressive fallback
  useEffect(() => {
    loadUserSettings();
  }, []);

  const loadUserSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      // Try to load from DynamoDB first
      try {

        const response = await settingsService.getUserSettings();
        
        if (response.source === 'dynamodb') {

          setSettings({ ...DEFAULT_SETTINGS, ...response.settings });
          setSource('dynamodb');
          setError(null); // Clear any previous errors
          return;
        } else if (response.source === 'default') {

          setSettings(DEFAULT_SETTINGS);
          setSource('default');
          setError(null); // Clear any previous errors
          return;
        }
      } catch (dynamoError) {
        console.warn('DynamoDB unavailable, falling back to localStorage');
        
        // Check if it's an authentication error vs infrastructure error
        if (dynamoError.message.includes('Authentication failed') || dynamoError.message.includes('No authentication token')) {
          setError(`Authentication required for cloud storage`);
        } else if (dynamoError.message.includes('503') || dynamoError.message.includes('Service Unavailable')) {
          setError(`Cloud storage service unavailable`);
        } else {
          setError(`Cloud storage unavailable`);
        }
      }

      // Fallback to localStorage
      try {
        const savedSettings = localStorage.getItem('strands-visual-builder-settings');
        if (savedSettings) {
          const parsed = JSON.parse(savedSettings);

          setSettings({ ...DEFAULT_SETTINGS, ...parsed });
          setSource('localStorage');
          return;
        }
      } catch (localError) {
        console.warn('Failed to load from localStorage');
      }

      // Use defaults

      setSettings(DEFAULT_SETTINGS);
      setSource('default');

    } catch (error) {
      console.error('Failed to load settings');
      setError(error.message);
      setSettings(DEFAULT_SETTINGS);
      setSource('default');
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (newSettings) => {
    const originalSettings = settings; // Store original state for potential revert
    const updatedSettings = {
      ...settings,
      ...newSettings
    };

    try {
      // Update local state immediately for responsive UI
      setSettings(updatedSettings);

      // Try to save to DynamoDB
      try {

        await settingsService.saveUserSettings(updatedSettings);

        setSource('dynamodb');
        setError(null);

        // Migrate from localStorage to DynamoDB if this is the first save
        if (source === 'localStorage') {

          try {
            localStorage.removeItem('strands-visual-builder-settings');

          } catch (e) {
            console.warn('Failed to remove localStorage settings');
          }
        }
      } catch (dynamoError) {
        console.warn('Failed to save to DynamoDB, falling back to localStorage');
        
        // Check if it's an authentication error
        if (dynamoError.message.includes('Authentication failed') || dynamoError.message.includes('No authentication token')) {
          setError(`Authentication required: ${dynamoError.message}`);
        } else {
          setError(`Cloud storage unavailable: ${dynamoError.message}`);
        }
        
        // Fallback to localStorage
        try {
          localStorage.setItem('strands-visual-builder-settings', JSON.stringify(updatedSettings));

          setSource('localStorage');
        } catch (localError) {
          console.error('Failed to save to localStorage');
          throw new Error('Failed to save settings to both cloud and local storage');
        }
      }
    } catch (error) {
      console.error('Failed to update settings');
      // Revert local state on failure
      setSettings(originalSettings);
      throw error;
    }
  };

  const resetToDefaults = async () => {
    try {
      await updateSettings(DEFAULT_SETTINGS);
    } catch (error) {
      console.error('Failed to reset settings');
      throw error;
    }
  };

  const getTimeoutInSeconds = (timeoutKey) => {
    return Math.floor(settings[timeoutKey] / 1000);
  };

  const value = {
    settings,
    updateSettings,
    resetToDefaults,
    getTimeoutInSeconds,
    defaults: DEFAULT_SETTINGS,
    loading,
    source,
    error,
    reload: loadUserSettings
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

export default SettingsContext;