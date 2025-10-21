import React, { useState, useEffect } from 'react';
import {
  Modal,
  Box,
  SpaceBetween,
  Button,
  Form,
  FormField,
  Input,
  Select,
  Popover,
  StatusIndicator,
  Alert
} from '@cloudscape-design/components';
import { useSettings } from '../contexts/SettingsContext';
import modelsService from '../services/modelsService';

const SettingsModal = ({ visible, onDismiss }) => {
  const { settings, updateSettings, resetToDefaults, defaults } = useSettings();
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});
  const [hasChanges, setHasChanges] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState(null);
  const [showRuntimeModelConfig, setShowRuntimeModelConfig] = useState(false);

  // Initialize form data when modal opens
  useEffect(() => {
    if (visible) {
      setFormData({
        codeGenerationTimeout: Math.floor(settings.codeGenerationTimeout / 1000),
        pythonExecutionTimeout: Math.floor(settings.pythonExecutionTimeout / 1000),
        backendRequestTimeout: Math.floor(settings.backendRequestTimeout / 1000),
        expertAgentModel: settings.expertAgentModel,
        enablePromptCaching: settings.enablePromptCaching || false,
        runtimeModelConfiguration: settings.runtimeModelConfiguration || false,
        runtimeSelectedModel: settings.runtimeSelectedModel || settings.expertAgentModel
      });
      setErrors({});
      setHasChanges(false);
      
      // Fetch available models from Bedrock API
      fetchAvailableModels();
    }
  }, [visible, settings]);

  // Fetch models from Bedrock API
  const fetchAvailableModels = async () => {
    try {
      setModelsLoading(true);
      setModelsError(null);
      

      const result = await modelsService.getAvailableModels(false); // Don't use cache for settings
      
      if (result.success) {
        setAvailableModels(result.models);

      } else {
        setModelsError(result.error || 'Failed to fetch models from Bedrock API');
        setAvailableModels([]);
      }
    } catch (error) {
      console.error('Error fetching Bedrock models');
      setModelsError(error.message || 'Failed to fetch models');
      setAvailableModels([]);
    } finally {
      setModelsLoading(false);
    }
  };

  // Check for changes
  useEffect(() => {
    const currentValues = {
      codeGenerationTimeout: Math.floor(settings.codeGenerationTimeout / 1000),
      pythonExecutionTimeout: Math.floor(settings.pythonExecutionTimeout / 1000),
      backendRequestTimeout: Math.floor(settings.backendRequestTimeout / 1000),
      expertAgentModel: settings.expertAgentModel,
      enablePromptCaching: settings.enablePromptCaching || false,
      runtimeModelConfiguration: settings.runtimeModelConfiguration || false,
      runtimeSelectedModel: settings.runtimeSelectedModel || settings.expertAgentModel
    };
    
    const hasChanged = Object.keys(formData).some(key => 
      formData[key] !== currentValues[key]
    );
    
    setHasChanges(hasChanged);
  }, [formData, settings]);

  const validateTimeout = (value, min = 5, max = 600) => {
    const numValue = parseInt(value);
    if (isNaN(numValue)) {
      return 'Must be a valid number';
    }
    if (numValue < min) {
      return `Must be at least ${min} seconds`;
    }
    if (numValue > max) {
      return `Must be no more than ${max} seconds`;
    }
    return null;
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Real-time validation only for timeout fields
    const timeoutFields = ['codeGenerationTimeout', 'pythonExecutionTimeout', 'backendRequestTimeout'];
    if (timeoutFields.includes(field)) {
      const error = validateTimeout(value);
      setErrors(prev => ({
        ...prev,
        [field]: error
      }));
    } else {
      // Clear any existing error for non-timeout fields
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleSave = () => {
    // Validate only timeout fields (not the model field)
    const newErrors = {};
    const timeoutFields = ['codeGenerationTimeout', 'pythonExecutionTimeout', 'backendRequestTimeout'];
    
    timeoutFields.forEach(field => {
      if (formData[field] !== undefined) {
        const error = validateTimeout(formData[field]);
        if (error) {
          newErrors[field] = error;
        }
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Convert back to milliseconds and save
    const newSettings = {
      codeGenerationTimeout: formData.codeGenerationTimeout * 1000,
      pythonExecutionTimeout: formData.pythonExecutionTimeout * 1000,
      backendRequestTimeout: formData.backendRequestTimeout * 1000,
      expertAgentModel: formData.expertAgentModel,
      // Free-form generation is now the default approach
      enableReasoning: true,      // Always enabled for better code quality
      enablePromptCaching: formData.enablePromptCaching,
      runtimeModelConfiguration: formData.runtimeModelConfiguration,
      runtimeSelectedModel: formData.runtimeSelectedModel
    };

    updateSettings(newSettings);
    onDismiss();
  };

  const handleReset = () => {
    const defaultValues = {
      codeGenerationTimeout: Math.floor(defaults.codeGenerationTimeout / 1000),
      pythonExecutionTimeout: Math.floor(defaults.pythonExecutionTimeout / 1000),
      backendRequestTimeout: Math.floor(defaults.backendRequestTimeout / 1000),
      expertAgentModel: defaults.expertAgentModel,
      enablePromptCaching: false,
      runtimeModelConfiguration: false,
      runtimeSelectedModel: defaults.expertAgentModel
    };
    
    setFormData(defaultValues);
    setErrors({});
  };

  const handleCancel = () => {
    onDismiss();
  };

  // Create model options for Select component from dynamic Bedrock models
  const createModelOptions = () => {
    if (!availableModels.length) return [];
    
    // Group models by category
    const categories = availableModels.reduce((acc, model) => {
      const category = model.category || 'Standard';
      if (!acc[category]) acc[category] = [];
      acc[category].push(model);
      return acc;
    }, {});

    const options = [];
    
    // Define category order
    const categoryOrder = ['Latest', 'Advanced', 'Standard', 'Fast'];
    
    categoryOrder.forEach(categoryName => {
      const models = categories[categoryName];
      if (models && models.length > 0) {
        // Add category header
        options.push({
          label: categoryName,
          options: models.map(model => ({
            label: `${model.name} (${model.provider})`,
            value: model.id,
            description: model.description,
            tags: model.recommended ? ['Recommended'] : []
          }))
        });
      }
    });

    return options;
  };

  const modelOptions = createModelOptions();
  const selectedModel = availableModels.find(model => model.id === formData.expertAgentModel);

  return (
    <Modal
      onDismiss={handleCancel}
      visible={visible}
      closeAriaLabel="Close settings modal"
      size="medium"
      header="Code Generation Settings (Legacy)"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button 
              variant="link" 
              onClick={handleReset}
            >
              Reset to Defaults
            </Button>
            <Button 
              variant="normal" 
              onClick={handleCancel}
            >
              Cancel
            </Button>
            <Button 
              variant="primary" 
              onClick={handleSave}
              disabled={Object.keys(errors).some(key => errors[key]) || !hasChanges}
            >
              Save Settings
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween direction="vertical" size="l">
        <Alert
          statusIconAriaLabel="Info"
          type="info"
          header="New Settings Experience Available"
        >
          A new full-page settings experience is now available with cloud storage and better organization. 
          This modal will be deprecated in a future version.
        </Alert>

        <Alert
          statusIconAriaLabel="Info"
          header="Timeout Configuration"
        >
          Configure timeout values for different operations. Higher values allow more time for complex operations but may delay error detection.
        </Alert>

        <Form>
          <SpaceBetween direction="vertical" size="l">
            <FormField
              label={
                <SpaceBetween direction="horizontal" size="xs">
                  <span>Expert Agent Model</span>
                  <Popover
                    dismissButton={false}
                    position="top"
                    size="medium"
                    triggerType="custom"
                    content={
                      <div>
                        <p><strong>Purpose:</strong> Select the Bedrock model used by the expert agent for code generation.</p>
                        <p><strong>Impact:</strong> Different models have varying capabilities, speed, and cost. Models are fetched directly from AWS Bedrock API.</p>
                        <p><strong>Recommended:</strong> Look for models marked as "Recommended" for best code generation quality.</p>
                        {selectedModel && (
                          <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
                            <strong>Current Model:</strong> {selectedModel.name}<br/>
                            <strong>Provider:</strong> {selectedModel.provider}<br/>
                            <strong>Category:</strong> {selectedModel.category}<br/>
                            <strong>Streaming:</strong> {selectedModel.responseStreamingSupported ? 'Yes' : 'No'}<br/>
                            <strong>Input:</strong> {selectedModel.inputModalities?.join(', ')}<br/>
                            <strong>Output:</strong> {selectedModel.outputModalities?.join(', ')}
                          </div>
                        )}
                      </div>
                    }
                  >
                    <Button variant="icon" iconName="status-info" />
                  </Popover>
                  {modelsLoading && (
                    <StatusIndicator type="loading">Loading models...</StatusIndicator>
                  )}
                </SpaceBetween>
              }
              description="Bedrock model used for intelligent code generation (fetched from AWS API)"
            >
              {modelsError && (
                <Alert
                  statusIconAriaLabel="Error"
                  type="error"
                  header="Failed to load Bedrock models"
                  action={
                    <Button
                      onClick={fetchAvailableModels}
                      variant="primary"
                      size="small"
                    >
                      Retry
                    </Button>
                  }
                >
                  {modelsError}
                </Alert>
              )}
              <Select
                selectedOption={
                  formData.expertAgentModel ? {
                    label: selectedModel ? `${selectedModel.name} (${selectedModel.provider})` : formData.expertAgentModel,
                    value: formData.expertAgentModel,
                    description: selectedModel?.description
                  } : null
                }
                onChange={({ detail }) => handleInputChange('expertAgentModel', detail.selectedOption.value)}
                options={modelOptions}
                placeholder={modelsLoading ? "Loading models from Bedrock API..." : "Select a Bedrock model"}
                filteringType="auto"
                expandToViewport={true}
                disabled={modelsLoading}
                loadingText="Loading models from Bedrock API..."
              />
              {selectedModel && (
                <Box variant="small" color="text-body-secondary" margin={{ top: "xs" }}>
                  {selectedModel.description}
                  {selectedModel.recommended && (
                    <Box variant="small" color="text-status-success" margin={{ left: "xs" }}>
                      • Recommended
                    </Box>
                  )}
                  <Box variant="small" color="text-body-secondary" margin={{ top: "xxs" }}>
                    Supports: {selectedModel.inputModalities?.join(', ')} → {selectedModel.outputModalities?.join(', ')}
                    {selectedModel.responseStreamingSupported && ' • Streaming'}
                  </Box>
                </Box>
              )}
            </FormField>
            <FormField
              label={
                <SpaceBetween direction="horizontal" size="xs">
                  <span>Code Generation Timeout</span>
                  <Popover
                    dismissButton={false}
                    position="top"
                    size="small"
                    triggerType="custom"
                    content={
                      <div>
                        <p><strong>Purpose:</strong> Maximum time for the expert agent to generate Strands code from your visual configuration.</p>
                        <p><strong>Impact:</strong> Complex multi-agent systems may need more time. Too low values may cause timeouts for sophisticated configurations.</p>
                        <p><strong>Recommended:</strong> 60-180 seconds depending on complexity.</p>
                      </div>
                    }
                  >
                    <Button variant="icon" iconName="status-info" />
                  </Popover>
                </SpaceBetween>
              }
              description="Time allowed for expert agent code generation"
              errorText={errors.codeGenerationTimeout}
            >
              <Input
                value={formData.codeGenerationTimeout || ''}
                onChange={({ detail }) => handleInputChange('codeGenerationTimeout', detail.value)}
                placeholder="120"
                type="number"
                inputMode="numeric"
                step={1}
                min={5}
                max={600}
              />
              <Box variant="small" color="text-body-secondary" margin={{ top: "xs" }}>
                seconds (5-600)
              </Box>
            </FormField>

            <FormField
              label={
                <SpaceBetween direction="horizontal" size="xs">
                  <span>Python Execution Timeout</span>
                  <Popover
                    dismissButton={false}
                    position="top"
                    size="small"
                    triggerType="custom"
                    content={
                      <div>
                        <p><strong>Purpose:</strong> Maximum time for testing generated Python code with real Strands agents.</p>
                        <p><strong>Impact:</strong> Agents with complex tools or large model responses may need more time. Too low values may interrupt legitimate operations.</p>
                        <p><strong>Recommended:</strong> 30-120 seconds depending on agent complexity.</p>
                      </div>
                    }
                  >
                    <Button variant="icon" iconName="status-info" />
                  </Popover>
                </SpaceBetween>
              }
              description="Time allowed for Python code execution during testing"
              errorText={errors.pythonExecutionTimeout}
            >
              <Input
                value={formData.pythonExecutionTimeout || ''}
                onChange={({ detail }) => handleInputChange('pythonExecutionTimeout', detail.value)}
                placeholder="60"
                type="number"
                inputMode="numeric"
                step={1}
                min={5}
                max={600}
              />
              <Box variant="small" color="text-body-secondary" margin={{ top: "xs" }}>
                seconds (5-600)
              </Box>
            </FormField>

            <FormField
              label={
                <SpaceBetween direction="horizontal" size="xs">
                  <span>Backend Request Timeout</span>
                  <Popover
                    dismissButton={false}
                    position="top"
                    size="small"
                    triggerType="custom"
                    content={
                      <div>
                        <p><strong>Purpose:</strong> Maximum time for HTTP requests to the backend services (expert agent, Python execution).</p>
                        <p><strong>Impact:</strong> Network latency and server load affect response times. Too low values may cause premature request cancellation.</p>
                        <p><strong>Recommended:</strong> 30-90 seconds depending on network conditions.</p>
                      </div>
                    }
                  >
                    <Button variant="icon" iconName="status-info" />
                  </Popover>
                </SpaceBetween>
              }
              description="Time allowed for backend API requests"
              errorText={errors.backendRequestTimeout}
            >
              <Input
                value={formData.backendRequestTimeout || ''}
                onChange={({ detail }) => handleInputChange('backendRequestTimeout', detail.value)}
                placeholder="45"
                type="number"
                inputMode="numeric"
                step={1}
                min={5}
                max={600}
              />
              <Box variant="small" color="text-body-secondary" margin={{ top: "xs" }}>
                seconds (5-600)
              </Box>
            </FormField>

            {/* Advanced Bedrock Features Section */}
            <FormField
              label="Advanced Bedrock Features"
            >
              <SpaceBetween direction="vertical" size="s">
                <FormField
                  label={
                    <SpaceBetween direction="horizontal" size="xs">
                      <span>Prompt Caching</span>
                      <Popover
                        dismissButton={false}
                        position="top"
                        size="medium"
                        triggerType="custom"
                        content={
                          <div>
                            <p><strong>Purpose:</strong> Cache system prompts and tools to reduce costs and improve performance.</p>
                            <p><strong>Benefits:</strong> Significant cost reduction (up to 90%), faster response times, better efficiency.</p>
                            <p><strong>Compatibility:</strong> Works with Claude 3.5+ models that support prompt caching.</p>
                            <p><strong>Note:</strong> Most effective for repeated code generation sessions with the same configuration.</p>
                          </div>
                        }
                      >
                        <Button variant="icon" iconName="status-info" />
                      </Popover>
                    </SpaceBetween>
                  }
                  description="Cache system prompts for cost optimization and performance"
                >
                  <input
                    type="checkbox"
                    checked={formData.enablePromptCaching || false}
                    onChange={(e) => handleInputChange('enablePromptCaching', e.target.checked)}
                    style={{ transform: 'scale(1.2)' }}
                  />
                </FormField>

                <FormField
                  label={
                    <SpaceBetween direction="horizontal" size="xs">
                      <span>Runtime Model Configuration</span>
                      <Popover
                        dismissButton={false}
                        position="top"
                        size="medium"
                        triggerType="custom"
                        content={
                          <div>
                            <p><strong>Purpose:</strong> Allow dynamic model switching during code generation without restarting the application.</p>
                            <p><strong>Benefits:</strong> Test different models quickly, optimize for specific use cases, compare model performance.</p>
                            <p><strong>Use Cases:</strong> A/B testing models, switching between speed vs quality, experimenting with new models.</p>
                            <p><strong>Note:</strong> When enabled, a model selector will appear in the code generation interface.</p>
                          </div>
                        }
                      >
                        <Button variant="icon" iconName="status-info" />
                      </Popover>
                    </SpaceBetween>
                  }
                  description="Enable dynamic model switching during code generation"
                >
                  <input
                    type="checkbox"
                    checked={formData.runtimeModelConfiguration || false}
                    onChange={(e) => {
                      handleInputChange('runtimeModelConfiguration', e.target.checked);
                      setShowRuntimeModelConfig(e.target.checked);
                    }}
                    style={{ transform: 'scale(1.2)' }}
                  />
                </FormField>

                {/* Runtime Model Selector - only show when runtime configuration is enabled */}
                {(formData.runtimeModelConfiguration || showRuntimeModelConfig) && (
                  <FormField
                    label="Runtime Model Selection"
                    description="Model to use when runtime configuration is enabled"
                  >
                    <Select
                      selectedOption={
                        formData.runtimeSelectedModel ? {
                          label: availableModels.find(m => m.id === formData.runtimeSelectedModel)?.name || formData.runtimeSelectedModel,
                          value: formData.runtimeSelectedModel
                        } : null
                      }
                      onChange={({ detail }) => handleInputChange('runtimeSelectedModel', detail.selectedOption.value)}
                      options={modelOptions}
                      placeholder="Select runtime model..."
                      filteringType="auto"
                      expandToViewport={true}
                      disabled={modelsLoading}
                    />
                  </FormField>
                )}
              </SpaceBetween>
            </FormField>
          </SpaceBetween>
        </Form>

        {hasChanges && (
          <Alert
            statusIconAriaLabel="Warning"
            type="warning"
          >
            You have unsaved changes. Click "Save Settings" to apply them.
          </Alert>
        )}
      </SpaceBetween>
    </Modal>
  );
};

export default SettingsModal;