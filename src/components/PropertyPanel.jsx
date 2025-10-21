import React, { useState, useEffect } from 'react';
import {
  Container,
  Form,
  FormField,
  Input,
  Textarea,
  Select,
  Button,
  SpaceBetween,
  Box,
  StatusIndicator,
  Alert
} from '@cloudscape-design/components';
import CodeGenerationPanel from './CodeGenerationPanel';
import ToolInfoModal from './ToolInfoModal';
import modelsService from '../services/modelsService';

export default function PropertyPanel({ selectedNode, onNodeUpdate }) {
  const [formData, setFormData] = useState({
    label: '',
    model: '',
    modelName: '',
    systemPrompt: '',
    testQuery: '',
    name: '',
    type: '',
    description: '',
    parameters: ''
  });

  // Code generation panel state
  const [codeGenerationPanelOpen, setCodeGenerationPanelOpen] = useState(false);
  
  // Tool information modal state
  const [toolInfoModalOpen, setToolInfoModalOpen] = useState(false);

  // Dynamic model loading state
  const [modelOptions, setModelOptions] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState(null);
  const [modelsWarning, setModelsWarning] = useState(null);

  useEffect(() => {
    if (selectedNode) {
      setFormData({
        label: selectedNode.data.label || '',
        model: selectedNode.data.model || '',
        modelName: selectedNode.data.modelName || '',
        systemPrompt: selectedNode.data.systemPrompt || '',
        testQuery: selectedNode.data.testQuery || '',
        name: selectedNode.data.name || '',
        type: selectedNode.data.type || '',
        description: selectedNode.data.description || '',
        parameters: selectedNode.data.parameters ? JSON.stringify(selectedNode.data.parameters, null, 2) : ''
      });
    }
  }, [selectedNode]);

  // Load available models when component mounts or when agent is selected
  useEffect(() => {
    if (selectedNode?.type === 'agent') {
      loadAvailableModels();
    }
  }, [selectedNode?.type]);

  // Update model name when models are loaded and we have a model ID but no model name
  useEffect(() => {
    if (selectedNode?.type === 'agent' && 
        selectedNode.data.model && 
        !selectedNode.data.modelName && 
        modelOptions.length > 0) {
      
      // Find the model name for the current model ID
      for (const group of modelOptions) {
        const foundModel = group.options?.find(opt => opt.value === selectedNode.data.model);
        if (foundModel) {
          // Update the node with the model name
          const updatedData = {
            ...selectedNode.data,
            modelName: foundModel.label
          };
          onNodeUpdate(selectedNode.id, updatedData);
          break;
        }
      }
    }
  }, [modelOptions, selectedNode, onNodeUpdate]);

  const loadAvailableModels = async () => {
    try {
      setModelsLoading(true);
      setModelsError(null);
      setModelsWarning(null);

      const result = await modelsService.getModelsForSelect(true); // Use cache
      
      if (result.success) {
        setModelOptions(result.options);
        if (result.warning) {
          setModelsWarning(result.warning);
        }
      } else {
        setModelsError(result.error || 'Failed to load models');
        setModelOptions([]);
      }
    } catch (error) {
      console.error('Error loading models:', error);
      setModelsError(error.message || 'Failed to load models');
      setModelOptions([]);
    } finally {
      setModelsLoading(false);
    }
  };

  // Cleanup auto-save timeout on unmount
  useEffect(() => {
    return () => {
      if (window.autoSaveTimeout) {
        clearTimeout(window.autoSaveTimeout);
      }
    };
  }, []);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Removed auto-save to prevent accidental node deletion
    // Users must click "Save Changes" to persist changes
  };

  const handleSave = () => {
    if (selectedNode && onNodeUpdate) {
      const updatedData = { ...selectedNode.data };
      
      // Update common fields - ensure label is never empty
      const newLabel = formData.label.trim();
      updatedData.label = newLabel || selectedNode.data.label || 'Untitled';
      
      // Update agent-specific fields
      if (selectedNode.type === 'agent') {
        updatedData.model = formData.model || selectedNode.data.model;
        updatedData.modelName = formData.modelName || selectedNode.data.modelName;
        // Allow empty system prompt - this should NOT cause node deletion
        updatedData.systemPrompt = formData.systemPrompt; // Can be empty string
        updatedData.testQuery = formData.testQuery || '';
      }
      
      // Update tool-specific fields
      if (selectedNode.type === 'tool') {
        const newName = formData.name.trim();
        updatedData.name = newName || selectedNode.data.name || 'Untitled Tool';
        updatedData.type = formData.type || selectedNode.data.type || 'builtin';
        updatedData.description = formData.description || '';
        
        // Parse parameters JSON
        try {
          if (formData.parameters && formData.parameters.trim()) {
            updatedData.parameters = JSON.parse(formData.parameters);
          } else {
            updatedData.parameters = selectedNode.data.parameters || {};
          }
        } catch (e) {
          // Keep existing parameters if JSON is invalid
          updatedData.parameters = selectedNode.data.parameters || {};
          console.warn('Invalid JSON in parameters');
        }
      }
      

      onNodeUpdate(selectedNode.id, updatedData);
    }
  };





  if (!selectedNode) {
    return (
      <Container>
        <Box textAlign="center" padding="l">
          <Box variant="p" color="text-body-secondary">
            Select a node to edit its properties
          </Box>
        </Box>
      </Container>
    );
  }

  return (
    <Container>
      <Form>
        <SpaceBetween key="property-form-fields" size="m">
          <FormField key="label-field" label="Label">
            <Input
              value={formData.label}
              onChange={({ detail }) => handleInputChange('label', detail.value)}
              placeholder="Enter node label"
            />
          </FormField>

          {selectedNode.type === 'agent' && (
            <React.Fragment key="agent-fields">
              <FormField 
                key="model-field" 
                label={
                  <SpaceBetween direction="horizontal" size="xs">
                    <span>Model</span>
                    {modelsLoading && (
                      <StatusIndicator type="loading">Loading models...</StatusIndicator>
                    )}
                  </SpaceBetween>
                }
                description="Bedrock model used for this agent (fetched from AWS API)"
              >
                {modelsError && (
                  <Alert
                    statusIconAriaLabel="Error"
                    type="error"
                    header="Failed to load models"
                    action={
                      <Button
                        onClick={loadAvailableModels}
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
                {modelsWarning && (
                  <Alert
                    statusIconAriaLabel="Warning"
                    type="warning"
                    header="Using cached models"
                    dismissible
                    onDismiss={() => setModelsWarning(null)}
                  >
                    {modelsWarning}
                  </Alert>
                )}
                <Select
                  selectedOption={(() => {
                    // Find the selected model across all option groups
                    for (const group of modelOptions) {
                      const found = group.options?.find(opt => opt.value === formData.model);
                      if (found) return found;
                    }
                    return null;
                  })()}
                  onChange={({ detail }) => {
                    // Store both model ID and model name
                    handleInputChange('model', detail.selectedOption.value);
                    handleInputChange('modelName', detail.selectedOption.label);
                  }}
                  options={modelOptions}
                  placeholder={modelsLoading ? "Loading models from Bedrock API..." : "Select a model"}
                  filteringType="auto"
                  expandToViewport={true}
                  disabled={modelsLoading}
                  loadingText="Loading models from Bedrock API..."
                />
                {(() => {
                  // Show model description if available
                  for (const group of modelOptions) {
                    const selectedModel = group.options?.find(opt => opt.value === formData.model);
                    if (selectedModel && selectedModel.description) {
                      return (
                        <Box variant="small" color="text-body-secondary" margin={{ top: "xs" }}>
                          {selectedModel.description}
                          {selectedModel.tags?.includes('Recommended') && (
                            <Box variant="small" color="text-status-success" margin={{ left: "xs" }}>
                              • Recommended
                            </Box>
                          )}
                        </Box>
                      );
                    }
                  }
                  return null;
                })()}
              </FormField>

              <FormField key="system-prompt-field" label="System Prompt">
                <Textarea
                  value={formData.systemPrompt}
                  onChange={({ detail }) => handleInputChange('systemPrompt', detail.value)}
                  placeholder="Enter system prompt for the agent"
                  rows={4}
                />
              </FormField>

              <FormField key="test-query-field" label="Test Query" description="Optional test query to validate the agent">
                <Input
                  value={formData.testQuery}
                  onChange={({ detail }) => handleInputChange('testQuery', detail.value)}
                  placeholder="Enter test query"
                />
              </FormField>
            </React.Fragment>
          )}

          {selectedNode.type === 'tool' && (
            <React.Fragment key="tool-fields">
              <FormField key="tool-name-field" label="Tool Name">
                <Input
                  value={formData.name}
                  onChange={({ detail }) => handleInputChange('name', detail.value)}
                  placeholder="Enter tool name"
                />
              </FormField>

              <FormField key="tool-type-field" label="Tool Type">
                <Select
                  selectedOption={formData.type ? { label: formData.type, value: formData.type } : null}
                  onChange={({ detail }) => handleInputChange('type', detail.selectedOption.value)}
                  options={[
                    { label: 'builtin', value: 'builtin' },
                    { label: 'custom', value: 'custom' }
                  ]}
                  placeholder="Select tool type"
                />
              </FormField>

              <FormField key="tool-description-field" label="Description">
                <Textarea
                  value={formData.description}
                  onChange={({ detail }) => handleInputChange('description', detail.value)}
                  placeholder="Enter tool description"
                  rows={3}
                />
              </FormField>

              <FormField key="tool-parameters-field" label="Parameters (JSON)" description="Tool-specific configuration parameters">
                <Textarea
                  value={formData.parameters}
                  onChange={({ detail }) => handleInputChange('parameters', detail.value)}
                  placeholder='{"key": "value"}'
                  rows={4}
                />
              </FormField>
            </React.Fragment>
          )}

          <Button key="save-button" variant="primary" onClick={handleSave}>
            Save Changes
          </Button>

          {/* Tool Information Section - Only show for tools */}
          {selectedNode.type === 'tool' && (
            <Button 
              variant="normal" 
              onClick={() => setToolInfoModalOpen(true)}
              disabled={!selectedNode || selectedNode.type !== 'tool' || !selectedNode.data.name}
              title={!selectedNode || selectedNode.type !== 'tool'
                ? "Select a tool to view information"
                : "View detailed tool information"
              }
            >
              View Tool Information
            </Button>
          )}

          {/* Code Generation Section - Only show for agents */}
          {selectedNode.type === 'agent' && (
            <Button 
              variant="primary" 
              onClick={() => setCodeGenerationPanelOpen(true)}
              disabled={!selectedNode || selectedNode.type !== 'agent'}
              title={!selectedNode || selectedNode.type !== 'agent'
                ? "Select an agent"
                : "Generate code for this agent only"
              }
            >
              Build Selected
            </Button>
          )}
        </SpaceBetween>
      </Form>
      
      {/* Tool Information Modal */}
      <ToolInfoModal
        toolName={selectedNode?.data?.name}
        isOpen={toolInfoModalOpen}
        onClose={() => setToolInfoModalOpen(false)}
      />
      
      {/* Agent-Specific Code Generation Panel */}
      <CodeGenerationPanel
        visible={codeGenerationPanelOpen}
        onDismiss={() => setCodeGenerationPanelOpen(false)}
        agentSpecific={true}
        selectedAgentId={selectedNode?.id}
        agentName={selectedNode?.data?.name || selectedNode?.data?.label || 'Selected Agent'}
      />
    </Container>
  );
}