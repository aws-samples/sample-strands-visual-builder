/**
 * AgentCore Deployment Panel
 * Handles deployment of Strands agents to Amazon Bedrock AgentCore
 */

import React, { useState, useEffect } from 'react';
import {
  Container,
  Header,
  Button,
  SpaceBetween,
  Box,
  Alert,
  FormField,
  Input,
  Textarea,
  Select,
  Slider,
  ExpandableSection,
  ProgressBar,
  StatusIndicator,
  KeyValuePairs,
  ColumnLayout,
  Popover,
  Icon
} from '@cloudscape-design/components';
import CodeView from '@cloudscape-design/code-view/code-view';
import s3CodeService from '../services/s3CodeService';
import { authService } from '../services/authService.js';

const REGIONS = [
  { label: 'US East (N. Virginia)', value: 'us-east-1' },
  { label: 'US West (Oregon)', value: 'us-west-2' },
  { label: 'Europe (Ireland)', value: 'eu-west-1' }
];

const MEMORY_OPTIONS = [
  { label: '512 MB', value: 512 },
  { label: '1024 MB (1 GB)', value: 1024 },
  { label: '2048 MB (2 GB)', value: 2048 },
  { label: '4096 MB (4 GB)', value: 4096 }
];

const PYTHON_VERSIONS = [
  { label: 'Python 3.10', value: '3.10' },
  { label: 'Python 3.11', value: '3.11' },
  { label: 'Python 3.12', value: '3.12' }
];

const LOG_LEVELS = [
  { label: 'DEBUG', value: 'DEBUG' },
  { label: 'INFO', value: 'INFO' },
  { label: 'WARN', value: 'WARN' },
  { label: 'ERROR', value: 'ERROR' }
];

// Validation functions for AgentCore requirements
const validateAgentName = (name) => {
  const errors = [];

  if (!name) {
    errors.push('Agent name is required');
    return { isValid: false, errors };
  }

  if (name.length < 1 || name.length > 48) {
    errors.push('Agent name must be 1-48 characters long');
  }

  if (!/^[a-zA-Z]/.test(name)) {
    errors.push('Agent name must start with a letter');
  }

  if (!/^[a-zA-Z0-9_]*$/.test(name)) {
    errors.push('Agent name can only contain letters, numbers, and underscores (no hyphens or spaces)');
  }

  return {
    isValid: errors.length === 0,
    errors,
    suggestion: errors.length > 0 ? sanitizeAgentName(name) : null
  };
};

const sanitizeAgentName = (name) => {
  if (!name) return 'agent';

  // Replace invalid characters with underscores
  let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');

  // Ensure it starts with a letter
  if (sanitized && !/^[a-zA-Z]/.test(sanitized)) {
    sanitized = 'agent_' + sanitized;
  }

  // Truncate to 48 characters
  if (sanitized.length > 48) {
    sanitized = sanitized.substring(0, 48);
  }

  // Remove trailing underscores
  sanitized = sanitized.replace(/_+$/, '');

  return sanitized || 'agent';
};

const validateDescription = (description) => {
  const errors = [];

  if (description && description.length > 1000) {
    errors.push('Description must be less than 1000 characters');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

const validateEnvironmentVariable = (key, value) => {
  const errors = [];

  if (!key) {
    errors.push('Environment variable key is required');
  } else {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
      errors.push('Environment variable key must start with a letter or underscore and contain only letters, numbers, and underscores');
    }
    if (key.length > 128) {
      errors.push('Environment variable key must be less than 128 characters');
    }
  }

  if (value && value.length > 4096) {
    errors.push('Environment variable value must be less than 4096 characters');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

const validateTag = (key, value) => {
  const errors = [];

  if (!key) {
    errors.push('Tag key is required');
  } else {
    if (key.length > 128) {
      errors.push('Tag key must be less than 128 characters');
    }
    if (!/^[a-zA-Z0-9\s._:/=+\-@]*$/.test(key)) {
      errors.push('Tag key contains invalid characters');
    }
  }

  if (!value) {
    errors.push('Tag value is required');
  } else {
    if (value.length > 256) {
      errors.push('Tag value must be less than 256 characters');
    }
    if (!/^[a-zA-Z0-9\s._:/=+\-@]*$/.test(value)) {
      errors.push('Tag value contains invalid characters');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export default function AgentCoreDeploymentPanel({
  generatedCode,
  agentName = 'My Agent',
  requirementsTxtUri = null,
  requestId = null,
  onDeploymentComplete
}) {
  // Deployment configuration state
  const [config, setConfig] = useState({
    agent_name: sanitizeAgentName(agentName),
    description: `Strands agent: ${agentName}`,
    region: 'us-west-2',
    memory: 1024,
    timeout: 600,
    python_version: '3.11',
    environment_variables: {},
    observability_enabled: true,
    log_level: 'INFO',
    tags: {}
  });

  // Validation state
  const [validationErrors, setValidationErrors] = useState({
    agent_name: null,
    description: null,
    environment_variables: {},
    tags: {}
  });

  // Deployment state
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentSuccess, setDeploymentSuccess] = useState(null);
  const [deploymentError, setDeploymentError] = useState(null);

  // Environment variables state
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvValue, setNewEnvValue] = useState('');

  // Tags state
  const [newTagKey, setNewTagKey] = useState('');
  const [newTagValue, setNewTagValue] = useState('');

  // AgentCore code preview state
  const [agentCoreCode, setAgentCoreCode] = useState('');
  const [isLoadingAgentCoreCode, setIsLoadingAgentCoreCode] = useState(false);
  const [agentCoreCodeError, setAgentCoreCodeError] = useState(null);

  // Requirements.txt preview state
  const [requirementsContent, setRequirementsContent] = useState('');
  const [isLoadingRequirements, setIsLoadingRequirements] = useState(false);
  const [requirementsError, setRequirementsError] = useState(null);

  // Update agent name when prop changes
  useEffect(() => {
    const sanitizedName = sanitizeAgentName(agentName);
    setConfig(prev => ({
      ...prev,
      agent_name: sanitizedName,
      description: `Strands agent: ${agentName}`
    }));

    // Validate the new agent name
    const validation = validateAgentName(sanitizedName);
    setValidationErrors(prev => ({
      ...prev,
      agent_name: validation.isValid ? null : validation
    }));
  }, [agentName]);

  // No cleanup needed for synchronous deployment

  // Load AgentCore code and requirements when requestId is available
  useEffect(() => {
    if (requestId) {
      loadAgentCoreCode();
      loadRequirements();
    }
  }, [requestId]);

  const loadAgentCoreCode = async () => {
    if (!requestId) {
      console.warn('No request ID available');
      return;
    }

    setIsLoadingAgentCoreCode(true);
    setAgentCoreCodeError(null);

    try {


      const result = await s3CodeService.fetchCodeFile(requestId, 'agentcore_ready');

      if (result.success) {
        setAgentCoreCode(result.code);

      } else if (result.notFound) {
        setAgentCoreCodeError('No AgentCore-ready code found. Please generate code first.');
      } else {
        setAgentCoreCodeError(result.error || 'Failed to load AgentCore code from S3');
      }
    } catch (error) {
      console.error('Error loading AgentCore code from S3');
      setAgentCoreCodeError('Unexpected error loading AgentCore code from S3');
    } finally {
      setIsLoadingAgentCoreCode(false);
    }
  };

  const loadRequirements = async () => {
    if (!requestId) {
      console.warn('No request ID available');
      return;
    }

    setIsLoadingRequirements(true);
    setRequirementsError(null);

    try {


      const result = await s3CodeService.fetchCodeFile(requestId, 'requirements');

      if (result.success) {
        setRequirementsContent(result.code);

      } else if (result.notFound) {
        setRequirementsError('No requirements.txt found. Please generate code first.');
      } else {
        setRequirementsError(result.error || 'Failed to load requirements.txt from S3');
      }
    } catch (error) {
      console.error('Error loading requirements.txt from S3');
      setRequirementsError('Unexpected error loading requirements.txt from S3');
    } finally {
      setIsLoadingRequirements(false);
    }
  };

  const handleConfigChange = (field, value) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));

    // Real-time validation
    let validation = null;
    switch (field) {
      case 'agent_name':
        validation = validateAgentName(value);
        break;
      case 'description':
        validation = validateDescription(value);
        break;
      default:
        break;
    }

    if (validation !== null) {
      setValidationErrors(prev => ({
        ...prev,
        [field]: validation.isValid ? null : validation
      }));
    }
  };

  const addEnvironmentVariable = () => {
    const validation = validateEnvironmentVariable(newEnvKey, newEnvValue);

    if (validation.isValid) {
      setConfig(prev => ({
        ...prev,
        environment_variables: {
          ...prev.environment_variables,
          [newEnvKey]: newEnvValue
        }
      }));
      setNewEnvKey('');
      setNewEnvValue('');

      // Clear any validation errors for this key
      setValidationErrors(prev => ({
        ...prev,
        environment_variables: {
          ...prev.environment_variables,
          [newEnvKey]: null
        }
      }));
    } else {
      // Set validation error
      setValidationErrors(prev => ({
        ...prev,
        environment_variables: {
          ...prev.environment_variables,
          [`${newEnvKey}_new`]: validation
        }
      }));
    }
  };

  const removeEnvironmentVariable = (key) => {
    setConfig(prev => {
      const newEnvVars = { ...prev.environment_variables };
      delete newEnvVars[key];
      return {
        ...prev,
        environment_variables: newEnvVars
      };
    });
  };

  const addTag = () => {
    const validation = validateTag(newTagKey, newTagValue);

    if (validation.isValid) {
      setConfig(prev => ({
        ...prev,
        tags: {
          ...prev.tags,
          [newTagKey]: newTagValue
        }
      }));
      setNewTagKey('');
      setNewTagValue('');

      // Clear any validation errors for this key
      setValidationErrors(prev => ({
        ...prev,
        tags: {
          ...prev.tags,
          [newTagKey]: null
        }
      }));
    } else {
      // Set validation error
      setValidationErrors(prev => ({
        ...prev,
        tags: {
          ...prev.tags,
          [`${newTagKey}_new`]: validation
        }
      }));
    }
  };

  const removeTag = (key) => {
    setConfig(prev => {
      const newTags = { ...prev.tags };
      delete newTags[key];
      return {
        ...prev,
        tags: newTags
      };
    });
  };

  const startDeployment = async () => {
    // Use AgentCore code if available, otherwise fall back to generated code
    const codeTodeploy = agentCoreCode || generatedCode;

    if (!codeTodeploy) {
      setDeploymentError('No code available for deployment. Please generate code first.');
      return;
    }

    setIsDeploying(true);
    setDeploymentError(null);
    setDeploymentSuccess(null);

    try {


      // Deploy synchronously - this waits for completion
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

      // Get authentication token
      const token = await authService.getToken();
      const headers = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${apiBaseUrl}/api/agentcore/deploy`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          strands_code: codeTodeploy,
          config: config,
          requirements_txt: requirementsContent || null
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Deployment failed');
      }

      const result = await response.json();

      if (result.success) {
        // Deployment is complete!
        const successData = {
          agent_runtime_arn: result.agent_runtime_arn,
          message: result.message
        };


        setDeploymentSuccess(successData);



        // Notify parent component (this might switch tabs)
        if (onDeploymentComplete) {

          onDeploymentComplete(result.agent_runtime_arn);
        }
      } else {
        throw new Error(result.message || 'Deployment failed');
      }

    } catch (error) {
      console.error('Deployment failed');
      setDeploymentError(error.message);
    } finally {
      setIsDeploying(false);
    }
  };

  // No status functions needed for synchronous deployment

  // Check if the form is valid for deployment
  const isFormValid = () => {
    // Check agent name
    if (validationErrors.agent_name && !validationErrors.agent_name.isValid) {
      return false;
    }

    // Check description
    if (validationErrors.description && !validationErrors.description.isValid) {
      return false;
    }

    // Check environment variables
    const envErrors = Object.values(validationErrors.environment_variables || {});
    if (envErrors.some(error => error && !error.isValid)) {
      return false;
    }

    // Check tags
    const tagErrors = Object.values(validationErrors.tags || {});
    if (tagErrors.some(error => error && !error.isValid)) {
      return false;
    }

    // Check required fields
    if (!config.agent_name) {
      return false;
    }

    return true;
  };

  // Get validation status for environment variable inputs
  const getEnvValidationStatus = () => {
    const validation = validateEnvironmentVariable(newEnvKey, newEnvValue);
    return validation.isValid ? null : validation;
  };

  // Get validation status for tag inputs
  const getTagValidationStatus = () => {
    const validation = validateTag(newTagKey, newTagValue);
    return validation.isValid ? null : validation;
  };

  return (
    <SpaceBetween size="l">
      {/* Deployment Status */}
      {isDeploying && (
        <Container>
          <SpaceBetween size="m">
            <Box>
              <StatusIndicator type="in-progress">
                Deploying to AgentCore...
              </StatusIndicator>
            </Box>

            <ProgressBar
              status="in-progress"
              label="Deploying agent to AgentCore (this may take 30-60 seconds)..."
            />

            <Box variant="p" color="text-body-secondary">
              Please wait while your agent is being deployed. This process includes building the container,
              configuring the runtime, and making your agent available for invocation.
            </Box>
          </SpaceBetween>
        </Container>
      )}

      {/* Deployment Success */}
      {deploymentSuccess && (() => {

        return true;
      })() && (
          <Container>
            <Alert type="success" header="🎉 AgentCore Deployment Successful!">
              <SpaceBetween size="m">
                <Box variant="h3" color="text-status-success">
                  Your agent is now deployed and ready for testing!
                </Box>

                <Box variant="p">
                  Your Strands agent has been successfully deployed to Amazon Bedrock AgentCore.
                  You can now test it using the chat interface or invoke it programmatically using the ARN below.
                </Box>

                <KeyValuePairs
                  columns={1}
                  items={[
                    {
                      label: 'Agent Runtime ARN',
                      value: (
                        <Box>
                          <code style={{
                            backgroundColor: '#f3f3f3',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            wordBreak: 'break-all'
                          }}>
                            {deploymentSuccess.agent_runtime_arn}
                          </code>
                        </Box>
                      )
                    },
                    {
                      label: 'Deployment Status',
                      value: deploymentSuccess.message
                    },
                    {
                      label: 'Region',
                      value: config.region
                    },
                    {
                      label: 'Agent Name',
                      value: config.agent_name
                    }
                  ]}
                />

                <Box variant="small" color="text-body-secondary">
                  <SpaceBetween size="xs">
                    <Box>✅ Container built and deployed to AgentCore</Box>
                    <Box>✅ Runtime environment configured</Box>
                    <Box>✅ Agent ready for invocation</Box>
                  </SpaceBetween>
                </Box>

                <Box>
                  <SpaceBetween size="s" direction="horizontal">
                    <Button
                      variant="primary"
                      onClick={() => {
                        // Copy ARN to clipboard
                        navigator.clipboard.writeText(deploymentSuccess.agent_runtime_arn);
                      }}
                    >
                      📋 Copy ARN
                    </Button>
                    <Button
                      variant="normal"
                      onClick={() => {
                        // Open AWS Console (optional)
                        const consoleUrl = `https://console.aws.amazon.com/bedrock/home?region=${config.region}#/agentcore/runtimes`;
                        window.open(consoleUrl, '_blank');
                      }}
                    >
                      🔗 View in AWS Console
                    </Button>
                  </SpaceBetween>
                </Box>
              </SpaceBetween>
            </Alert>
          </Container>
        )}

      {/* Deployment Error */}
      {deploymentError && (
        <Alert type="error" header="Deployment Failed">
          {deploymentError}
        </Alert>
      )}

      {/* Validation Summary */}
      {!isFormValid() && (
        <Alert type="warning" header="Configuration Issues">
          <SpaceBetween size="s">
            <Box>Please fix the following issues before deploying:</Box>
            <ul>
              {validationErrors.agent_name && !validationErrors.agent_name.isValid && (
                <li>Agent Name: {validationErrors.agent_name.errors.join(', ')}</li>
              )}
              {validationErrors.description && !validationErrors.description.isValid && (
                <li>Description: {validationErrors.description.errors.join(', ')}</li>
              )}
              {Object.entries(validationErrors.environment_variables || {}).map(([key, error]) =>
                error && !error.isValid && (
                  <li key={key}>Environment Variable ({key}): {error.errors.join(', ')}</li>
                )
              )}
              {Object.entries(validationErrors.tags || {}).map(([key, error]) =>
                error && !error.isValid && (
                  <li key={key}>Tag ({key}): {error.errors.join(', ')}</li>
                )
              )}
            </ul>
          </SpaceBetween>
        </Alert>
      )}

      {/* Configuration Form */}
      <Container header={<Header variant="h3">Deployment Configuration</Header>}>
        <SpaceBetween size="l">
          {/* Basic Settings */}
          <ColumnLayout columns={2}>
            <FormField
              label="Agent Name"
              description="Unique name for your agent deployment"
              errorText={validationErrors.agent_name?.errors?.join(', ')}
              info={
                <Popover
                  dismissButton={false}
                  position="top"
                  size="medium"
                  triggerType="custom"
                  content={
                    <SpaceBetween size="s">
                      <Box>
                        <strong>Requirements:</strong>
                        <ul>
                          <li>Must start with a letter</li>
                          <li>1-48 characters long</li>
                          <li>Only letters, numbers, and underscores</li>
                          <li>No hyphens or spaces allowed</li>
                        </ul>
                      </Box>
                      {validationErrors.agent_name?.suggestion && (
                        <Box>
                          <strong>Suggested:</strong> {validationErrors.agent_name.suggestion}
                        </Box>
                      )}
                    </SpaceBetween>
                  }
                >
                  <Button variant="icon" iconName="status-info" />
                </Popover>
              }
            >
              <SpaceBetween size="xs">
                <Input
                  value={config.agent_name}
                  onChange={({ detail }) => handleConfigChange('agent_name', detail.value)}
                  placeholder="my_strands_agent"
                  invalid={validationErrors.agent_name && !validationErrors.agent_name.isValid}
                />
                {validationErrors.agent_name?.suggestion && (
                  <Box>
                    <Button
                      variant="inline-link"
                      onClick={() => handleConfigChange('agent_name', validationErrors.agent_name.suggestion)}
                    >
                      <Icon name="status-info" /> Use suggested name: {validationErrors.agent_name.suggestion}
                    </Button>
                  </Box>
                )}
              </SpaceBetween>
            </FormField>

            <FormField
              label="Region"
              description="AWS region for deployment"
              info={
                <Popover
                  dismissButton={false}
                  position="top"
                  size="small"
                  triggerType="custom"
                  content="Choose the region closest to your users for better performance."
                >
                  <Button variant="icon" iconName="status-info" />
                </Popover>
              }
            >
              <Select
                selectedOption={REGIONS.find(r => r.value === config.region)}
                onChange={({ detail }) => handleConfigChange('region', detail.selectedOption.value)}
                options={REGIONS}
              />
            </FormField>
          </ColumnLayout>

          <FormField
            label="Description"
            description={`Optional description for your agent (${config.description?.length || 0}/1000 characters)`}
            errorText={validationErrors.description?.errors?.join(', ')}
          >
            <Textarea
              value={config.description}
              onChange={({ detail }) => handleConfigChange('description', detail.value)}
              placeholder="Describe what this agent does..."
              rows={3}
              invalid={validationErrors.description && !validationErrors.description.isValid}
            />
          </FormField>

          {/* Runtime Settings */}
          <ExpandableSection headerText="Runtime Configuration" defaultExpanded>
            <SpaceBetween size="m">
              <ColumnLayout columns={2}>
                <FormField
                  label="Memory"
                  description="Memory allocated to your agent runtime"
                  info={
                    <Popover
                      dismissButton={false}
                      position="top"
                      size="medium"
                      triggerType="custom"
                      content="Higher memory supports more complex operations and larger tool outputs. Most agents work well with 1GB."
                    >
                      <Button variant="icon" iconName="status-info" />
                    </Popover>
                  }
                >
                  <Select
                    selectedOption={MEMORY_OPTIONS.find(m => m.value === config.memory)}
                    onChange={({ detail }) => handleConfigChange('memory', detail.selectedOption.value)}
                    options={MEMORY_OPTIONS}
                  />
                </FormField>

                <FormField
                  label="Python Version"
                  description="Python runtime version"
                >
                  <Select
                    selectedOption={PYTHON_VERSIONS.find(p => p.value === config.python_version)}
                    onChange={({ detail }) => handleConfigChange('python_version', detail.selectedOption.value)}
                    options={PYTHON_VERSIONS}
                  />
                </FormField>
              </ColumnLayout>

              <FormField
                label={`Timeout: ${config.timeout} seconds`}
                description="Maximum execution time for a single agent invocation"
                info={
                  <Popover
                    dismissButton={false}
                    position="top"
                    size="medium"
                    triggerType="custom"
                    content="Longer timeouts support complex multi-step reasoning. Most agents complete within 10 minutes."
                  >
                    <Button variant="icon" iconName="status-info" />
                  </Popover>
                }
              >
                <Slider
                  value={config.timeout}
                  onChange={({ detail }) => handleConfigChange('timeout', detail.value)}
                  min={60}
                  max={3600}
                  step={60}
                />
              </FormField>
            </SpaceBetween>
          </ExpandableSection>

          {/* Advanced Settings */}
          <ExpandableSection headerText="Advanced Configuration">
            <SpaceBetween size="m">
              {/* Environment Variables */}
              <FormField
                label="Environment Variables"
                description="Custom environment variables for your agent"
                errorText={getEnvValidationStatus()?.errors?.join(', ')}
              >
                <SpaceBetween size="s">
                  {Object.entries(config.environment_variables).map(([key, value]) => (
                    <Box key={key}>
                      <ColumnLayout columns={3}>
                        <Box>
                          <strong>{key}</strong>
                        </Box>
                        <Box style={{ wordBreak: 'break-all' }}>
                          {value.length > 50 ? `${value.substring(0, 50)}...` : value}
                        </Box>
                        <Button
                          variant="icon"
                          iconName="remove"
                          onClick={() => removeEnvironmentVariable(key)}
                          ariaLabel={`Remove environment variable ${key}`}
                        />
                      </ColumnLayout>
                    </Box>
                  ))}

                  <ColumnLayout columns={3}>
                    <FormField
                      label="Key"
                      errorText={getEnvValidationStatus()?.errors?.filter(e => e.includes('key'))?.join(', ')}
                    >
                      <Input
                        value={newEnvKey}
                        onChange={({ detail }) => setNewEnvKey(detail.value)}
                        placeholder="VARIABLE_NAME"
                        invalid={getEnvValidationStatus()?.errors?.some(e => e.includes('key'))}
                      />
                    </FormField>
                    <FormField
                      label="Value"
                      errorText={getEnvValidationStatus()?.errors?.filter(e => e.includes('value'))?.join(', ')}
                    >
                      <Input
                        value={newEnvValue}
                        onChange={({ detail }) => setNewEnvValue(detail.value)}
                        placeholder="variable_value"
                        invalid={getEnvValidationStatus()?.errors?.some(e => e.includes('value'))}
                      />
                    </FormField>
                    <Box paddingTop="l">
                      <Button
                        onClick={addEnvironmentVariable}
                        disabled={!newEnvKey || !newEnvValue || (getEnvValidationStatus() && !getEnvValidationStatus().isValid)}
                      >
                        Add
                      </Button>
                    </Box>
                  </ColumnLayout>
                </SpaceBetween>
              </FormField>

              {/* Observability */}
              <ColumnLayout columns={2}>
                <FormField
                  label="Observability"
                  description="Enable detailed logging and tracing"
                >
                  <Select
                    selectedOption={{ label: config.observability_enabled ? 'Enabled' : 'Disabled', value: config.observability_enabled }}
                    onChange={({ detail }) => handleConfigChange('observability_enabled', detail.selectedOption.value)}
                    options={[
                      { label: 'Enabled', value: true },
                      { label: 'Disabled', value: false }
                    ]}
                  />
                </FormField>

                <FormField
                  label="Log Level"
                  description="Logging verbosity level"
                >
                  <Select
                    selectedOption={LOG_LEVELS.find(l => l.value === config.log_level)}
                    onChange={({ detail }) => handleConfigChange('log_level', detail.selectedOption.value)}
                    options={LOG_LEVELS}
                  />
                </FormField>
              </ColumnLayout>

              {/* Tags */}
              <FormField
                label="Tags"
                description="Resource tags for organization and billing (AWS standard tag format)"
                errorText={getTagValidationStatus()?.errors?.join(', ')}
              >
                <SpaceBetween size="s">
                  {Object.entries(config.tags).map(([key, value]) => (
                    <Box key={key}>
                      <ColumnLayout columns={3}>
                        <Box>
                          <strong>{key}</strong>
                        </Box>
                        <Box style={{ wordBreak: 'break-all' }}>
                          {value.length > 50 ? `${value.substring(0, 50)}...` : value}
                        </Box>
                        <Button
                          variant="icon"
                          iconName="remove"
                          onClick={() => removeTag(key)}
                          ariaLabel={`Remove tag ${key}`}
                        />
                      </ColumnLayout>
                    </Box>
                  ))}

                  <ColumnLayout columns={3}>
                    <FormField
                      label="Key"
                      errorText={getTagValidationStatus()?.errors?.filter(e => e.includes('key'))?.join(', ')}
                    >
                      <Input
                        value={newTagKey}
                        onChange={({ detail }) => setNewTagKey(detail.value)}
                        placeholder="Environment"
                        invalid={getTagValidationStatus()?.errors?.some(e => e.includes('key'))}
                      />
                    </FormField>
                    <FormField
                      label="Value"
                      errorText={getTagValidationStatus()?.errors?.filter(e => e.includes('value'))?.join(', ')}
                    >
                      <Input
                        value={newTagValue}
                        onChange={({ detail }) => setNewTagValue(detail.value)}
                        placeholder="Production"
                        invalid={getTagValidationStatus()?.errors?.some(e => e.includes('value'))}
                      />
                    </FormField>
                    <Box paddingTop="l">
                      <Button
                        onClick={addTag}
                        disabled={!newTagKey || !newTagValue || (getTagValidationStatus() && !getTagValidationStatus().isValid)}
                      >
                        Add
                      </Button>
                    </Box>
                  </ColumnLayout>
                </SpaceBetween>
              </FormField>
            </SpaceBetween>
          </ExpandableSection>

          {/* AgentCore Code Preview */}
          <ExpandableSection headerText="AgentCore Code Preview" defaultExpanded={false}>
            <SpaceBetween size="m">
              <Box variant="p" color="text-body-secondary">
                Preview of the AgentCore-ready code that will be deployed. This code includes the necessary wrappers and entry points for AgentCore runtime.
              </Box>

              {isLoadingAgentCoreCode && (
                <Box textAlign="center" padding="m">
                  <ProgressBar
                    status="in-progress"
                    value={50}
                    label="Loading AgentCore code..."
                  />
                </Box>
              )}

              {agentCoreCodeError && (
                <Alert type="warning" header="AgentCore Code Not Available">
                  <SpaceBetween size="s">
                    <Box>{agentCoreCodeError}</Box>
                    <Button
                      onClick={loadAgentCoreCode}
                      disabled={!requestId || isLoadingAgentCoreCode}
                    >
                      Retry Loading
                    </Button>
                  </SpaceBetween>
                </Alert>
              )}

              {agentCoreCode && !isLoadingAgentCoreCode && (
                <FormField
                  label="AgentCore-Ready Code (Read-Only)"
                  description="This code will be deployed to AgentCore runtime"
                >
                  <CodeView
                    content={agentCoreCode}
                    lineNumbers
                    wrapLines
                    actions={
                      <Button
                        onClick={loadAgentCoreCode}
                        disabled={!requestId || isLoadingAgentCoreCode}
                      >
                        Refresh
                      </Button>
                    }
                  />
                </FormField>
              )}

              {!agentCoreCode && !isLoadingAgentCoreCode && !agentCoreCodeError && (
                <Box textAlign="center" padding="m">
                  <SpaceBetween size="s">
                    <Box variant="p" color="text-body-secondary">
                      No AgentCore code available. Generate code first to see the preview.
                    </Box>
                    <Button
                      onClick={loadAgentCoreCode}
                      disabled={!requestId}
                    >
                      Load AgentCore Code
                    </Button>
                  </SpaceBetween>
                </Box>
              )}
            </SpaceBetween>
          </ExpandableSection>

          {/* Requirements.txt Preview */}
          <ExpandableSection headerText="Dependencies (requirements.txt)" defaultExpanded={false}>
            <SpaceBetween size="m">
              <Box variant="p" color="text-body-secondary">
                Python package dependencies that will be installed in the AgentCore runtime environment.
              </Box>

              {isLoadingRequirements && (
                <Box textAlign="center" padding="m">
                  <ProgressBar
                    status="in-progress"
                    value={50}
                    label="Loading requirements.txt..."
                  />
                </Box>
              )}

              {requirementsError && (
                <Alert type="warning" header="Requirements.txt Not Available">
                  <SpaceBetween size="s">
                    <Box>{requirementsError}</Box>
                    <Button
                      onClick={loadRequirements}
                      disabled={!requestId || isLoadingRequirements}
                    >
                      Retry Loading
                    </Button>
                  </SpaceBetween>
                </Alert>
              )}

              {requirementsContent && !isLoadingRequirements && (
                <FormField
                  label="Requirements.txt (Read-Only)"
                  description="Dependencies for AgentCore deployment"
                >
                  <CodeView
                    content={requirementsContent}
                    lineNumbers
                    wrapLines
                    actions={
                      <Button
                        onClick={loadRequirements}
                        disabled={!requestId || isLoadingRequirements}
                      >
                        Refresh
                      </Button>
                    }
                  />
                </FormField>
              )}

              {!requirementsContent && !isLoadingRequirements && !requirementsError && (
                <Box textAlign="center" padding="m">
                  <SpaceBetween size="s">
                    <Box variant="p" color="text-body-secondary">
                      No requirements.txt available. Generate code first to see dependencies.
                    </Box>
                    <Button
                      onClick={loadRequirements}
                      disabled={!requestId}
                    >
                      Load Requirements.txt
                    </Button>
                  </SpaceBetween>
                </Box>
              )}
            </SpaceBetween>
          </ExpandableSection>

          {/* Deploy Button */}
          <Box>
            <SpaceBetween size="s">
              <Button
                variant="primary"
                onClick={startDeployment}
                loading={isDeploying}
                disabled={(!agentCoreCode && !generatedCode) || !config.agent_name || !isFormValid() || isDeploying}
              >
                {isDeploying ? 'Deploying...' : 'Deploy to AgentCore'}
              </Button>

              {/* Status messages */}
              <SpaceBetween size="xs">
                {!isDeploying && !deploymentSuccess && (
                  <Box variant="small" color="text-body-secondary">
                    <Icon name="status-info" /> Deployment typically takes 30-60 seconds to complete
                  </Box>
                )}

                {!agentCoreCode && generatedCode && (
                  <Box variant="small" color="text-status-warning">
                    <Icon name="status-warning" /> Using fallback code (AgentCore code not available)
                  </Box>
                )}
                {!isFormValid() && (
                  <Box variant="small" color="text-status-error">
                    <Icon name="status-negative" /> Please fix validation errors before deploying
                  </Box>
                )}
                {(!agentCoreCode && !generatedCode) && (
                  <Box variant="small" color="text-status-error">
                    <Icon name="status-negative" /> No code available for deployment. Please generate code first.
                  </Box>
                )}
              </SpaceBetween>
            </SpaceBetween>
          </Box>
        </SpaceBetween>
      </Container>
    </SpaceBetween>
  );
}