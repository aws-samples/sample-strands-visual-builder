/**
 * Code Generation Panel - Dedicated component for code generation and execution
 * This component provides a comprehensive interface for SDK code generation
 */

import React, { useState, useEffect } from 'react';
import ace from 'ace-builds';
import {
  Container,
  Header,
  Button,
  SpaceBetween,
  Box,
  Alert,
  Tabs,
  FormField,
  ProgressBar,
  Modal,
  ColumnLayout,
  CopyToClipboard,
  RadioGroup,
  Icon,
  Popover
} from '@cloudscape-design/components';
import ChatBubble from '@cloudscape-design/chat-components/chat-bubble';
import Avatar from '@cloudscape-design/chat-components/avatar';
import CodeEditor from '@cloudscape-design/components/code-editor';
import CodeView from '@cloudscape-design/code-view/code-view';
import { generateCodeWithExpertAgent } from '../generators/expertAgentGenerator';
import { executePythonCode, saveCodeToFile, setSettingsProvider } from '../utils/pythonExecutor';
import { useSettings } from '../contexts/SettingsContext';
import expertAgentService from '../services/expertAgentService';
import modelsService from '../services/modelsService';
import s3CodeService from '../services/s3CodeService';
import useBuilderStore from '../store/useBuilderStore';
import { extractFullConfiguration, extractAgentConfiguration } from '../utils/configExtraction';
import AgentCoreDeploymentPanel from './AgentCoreDeploymentPanel';
import AgentCoreChatPanel from './AgentCoreChatPanel';
import StreamingGenerationView from './StreamingGenerationView';

export default function CodeGenerationPanel({
  visible,
  onDismiss,
  agentSpecific = false,
  selectedAgentId = null,
  agentName = 'Selected Agent'
}) {
  const { nodes, edges, orphanAgents, orphanTools, detectOrphans } = useBuilderStore();

  // Debug: Log orphan state changes
  useEffect(() => {
    // Orphan state tracking
  }, [orphanAgents, orphanTools]);

  // Ensure orphan detection runs when the panel opens
  useEffect(() => {
    if (visible) {
      detectOrphans();
    }
  }, [visible, detectOrphans]);
  const settingsContext = useSettings();

  // State management
  const [activeTab, setActiveTab] = useState('generate');
  const [generatedCode, setGeneratedCode] = useState('');
  const [codeGenerationResult, setCodeGenerationResult] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);
  const [preferences, setPreferences] = useState(undefined);
  const [aceLoaded, setAceLoaded] = useState(false);
  const [showOrphanWarning, setShowOrphanWarning] = useState(false);

  // Streaming generation state - minimal addition
  const [useStreaming, setUseStreaming] = useState(true); // Backward compatibility toggle
  const [streamingText, setStreamingText] = useState('');

  // S3 code storage state
  const [requestId, setRequestId] = useState(null);
  const [isLoadingCode, setIsLoadingCode] = useState(false);
  const [codeLoadError, setCodeLoadError] = useState(null);
  const [requirementsTxtUri, setRequirementsTxtUri] = useState(null);

  // Execution environment selection
  const [executionEnvironment, setExecutionEnvironment] = useState("python_repl");


  // AgentCore deployment state
  const [deployedAgentArn, setDeployedAgentArn] = useState(null);
  const [deploymentId, setDeploymentId] = useState(null);

  // Set up settings providers for services
  useEffect(() => {
    expertAgentService.setSettingsProvider(settingsContext);
    modelsService.setSettingsProvider(settingsContext);
    s3CodeService.setSettingsProvider(settingsContext);
    setSettingsProvider(settingsContext);
  }, [settingsContext]);

  // Auto-load code when switching to code tab (if we have a request ID)
  useEffect(() => {
    if (activeTab === 'code' && requestId && !generatedCode && !isLoadingCode && !codeLoadError) {

      loadCodeFromS3('pure_strands');
    }
  }, [activeTab, requestId, generatedCode, isLoadingCode, codeLoadError]);



  // Load Ace editor immediately
  useEffect(() => {
    const loadAce = async () => {
      try {
        // Import required Ace modules
        await import('ace-builds/src-noconflict/mode-python');
        await import('ace-builds/src-noconflict/theme-cloud_editor');
        await import('ace-builds/src-noconflict/theme-cloud_editor_dark');
        // Small delay to ensure modules are fully loaded
        setTimeout(() => setAceLoaded(true), 100);
      } catch (error) {
        console.error('Failed to load Ace editor');
        setAceLoaded(true); // Set to true anyway to show error state
      }
    };

    loadAce();
  }, []); // Load immediately, not dependent on visible

  const checkForOrphans = () => {


    // For full system generation, check all orphans
    if (!agentSpecific) {
      const hasOrphans = (orphanAgents?.length > 0) || (orphanTools?.length > 0);

      return hasOrphans;
    }

    // For agent-specific generation, check if the selected agent is orphaned
    if (selectedAgentId) {
      const isSelectedOrphan = orphanAgents?.some(agent => agent.id === selectedAgentId);

      return isSelectedOrphan;
    }

    return false;
  };

  const handleGenerateCode = async (skipOrphanCheck = false) => {


    // Check for orphans before proceeding (unless explicitly skipped)
    if (!skipOrphanCheck && checkForOrphans()) {

      setShowOrphanWarning(true);
      return;
    }



    setIsGenerating(true);
    setCodeGenerationResult(null);
    setGeneratedCode('');
    setStreamingText(''); // Reset streaming text

    try {
      let config;
      let configNodes, configEdges;

      if (agentSpecific && selectedAgentId) {
        config = extractAgentConfiguration(selectedAgentId, nodes, edges);
        configNodes = config.agents;
        configEdges = config.connections;
      } else {
        config = extractFullConfiguration(nodes, edges);
        configNodes = config.agents;
        configEdges = config.connections;
      }

      let result;

      // Always use streaming generation
      result = await generateCodeWithExpertAgent(
        nodes, 
        edges, 
        settingsContext.settings, 
        config, 
        true, // enableStreaming
        (progressText) => setStreamingText(progressText) // onProgress callback
      );



      setCodeGenerationResult(result);

      if (result.success) {
        // Ensure code is a string, handle potential object responses
        let codeString = '';
        if (typeof result.code === 'string') {
          codeString = result.code;
        } else if (result.code && typeof result.code === 'object') {
          // If it's an object, try to extract code from common properties
          if (result.code.code) {
            codeString = result.code.code;
          } else if (result.code.content) {
            codeString = result.code.content;
          } else {
            codeString = JSON.stringify(result.code, null, 2);
          }
        } else {
          codeString = String(result.code || 'No code generated');
        }

        // Backend should now provide properly formatted code with root cause fix
        if (codeString.includes('\\n')) {
          console.error('Backend formatting issue detected');
          // Don't fix it - let it display broken so we can identify the issue
        }



        // Extract request ID from result metadata
        const newRequestId = result.metadata?.request_id;
        if (newRequestId) {
          setRequestId(newRequestId);

        }

        // Extract S3 URIs from metadata
        if (result.metadata?.s3_uris) {
          const s3Uris = result.metadata.s3_uris;
          if (s3Uris.requirements) {
            setRequirementsTxtUri(s3Uris.requirements);

          }
        }

        // Clear existing code to force reload from S3
        setGeneratedCode('');
        setCodeLoadError(null);
        setActiveTab('code');

        // Track advanced features used
        if (result.metadata?.advanced_features) {
          // Advanced features tracking
        }

        // Track reasoning process if available
        if (result.metadata?.reasoning_process) {
          // Reasoning process tracking
        }
      }
    } catch (error) {
      const scope = agentSpecific ? 'Agent-specific' : 'Full system';
      setCodeGenerationResult({
        success: false,
        errors: [`${scope} code generation failed: ${error.message}`],
        warnings: ['Please ensure the backend service is running and accessible'],
        approach: 'expert-agent'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExecuteCode = async () => {
    if (!generatedCode) return;

    setIsExecuting(true);
    setExecutionResult(null);

    try {
      // Execute the code exactly as it appears in the editor
      const result = await executePythonCode(generatedCode, {
        timeout: settingsContext.settings.pythonExecutionTimeout,
        execution_environment: executionEnvironment
      });
      setExecutionResult(result);
      setActiveTab('execution');
    } catch (error) {
      setExecutionResult({
        success: false,
        error: error.message,
        output: '',
        executionTime: 0
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleSaveCode = async () => {
    if (!generatedCode) return;

    try {
      const result = await saveCodeToFile(generatedCode, 'strands_agent.py');
      if (result.success) {
        // Show success feedback

      }
    } catch (error) {
      console.error('Failed to save code');
    }
  };

  const loadCodeFromS3 = async (codeType = 'pure_strands') => {
    if (!requestId) {
      console.warn('No request ID available');
      return;
    }

    setIsLoadingCode(true);
    setCodeLoadError(null);

    try {


      const result = await s3CodeService.fetchCodeFile(requestId, codeType);

      if (result.success) {
        setGeneratedCode(result.code);

      } else if (result.notFound) {
        setCodeLoadError(`No ${codeType} code found for this request. Please generate code first.`);
      } else {
        setCodeLoadError(result.error || 'Failed to load code from S3');
      }
    } catch (error) {
      console.error('Error loading code from S3');
      setCodeLoadError('Unexpected error loading code from S3');
    } finally {
      setIsLoadingCode(false);
    }
  };



  const handleDeploymentComplete = (agentRuntimeArn, deploymentId) => {
    setDeployedAgentArn(agentRuntimeArn);
    setDeploymentId(deploymentId);
    setActiveTab('chat'); // Switch to chat tab when deployment completes
  };



  const tabs = [
    {
      id: 'generate',
      label: 'Generate',
      content: (
        <SpaceBetween size="l">


          {/* Generation Controls */}
          <Container header={
            <Header variant="h3">
              {agentSpecific ? `Build Selected - ${agentName}` : 'Build All - Complete System'}
            </Header>
          }>
            <SpaceBetween size="m">
              {agentSpecific && selectedAgentId ? (
                // Agent-specific view
                (() => {
                  const config = extractAgentConfiguration(selectedAgentId, nodes, edges);
                  return (
                    <ColumnLayout columns={3}>
                      <Box>
                        <Box variant="awsui-key-label">Agent</Box>
                        <Box>{config.agents.length}</Box>
                      </Box>
                      <Box>
                        <Box variant="awsui-key-label">Connected Tools</Box>
                        <Box>{config.tools.length}</Box>
                      </Box>
                      <Box>
                        <Box variant="awsui-key-label">Connections</Box>
                        <Box>{config.connections.length}</Box>
                      </Box>
                    </ColumnLayout>
                  );
                })()
              ) : (
                // Full system view
                <ColumnLayout columns={3}>
                  <Box>
                    <Box variant="awsui-key-label">Agents</Box>
                    <Box>{nodes.filter(n => n.type === 'agent').length}</Box>
                  </Box>
                  <Box>
                    <Box variant="awsui-key-label">Tools</Box>
                    <Box>{nodes.filter(n => n.type === 'tool').length}</Box>
                  </Box>
                  <Box>
                    <Box variant="awsui-key-label">Connections</Box>
                    <Box>{edges.length}</Box>
                  </Box>
                </ColumnLayout>
              )}

              <Button
                variant="primary"
                onClick={() => handleGenerateCode()}
                loading={isGenerating}
                disabled={
                  agentSpecific
                    ? !selectedAgentId
                    : nodes.filter(n => n.type === 'agent').length === 0
                }
              >
                {agentSpecific ? 'Build Selected' : 'Build All'}
              </Button>

              {/* Streaming generation view - show during generation or when we have streaming text */}
              {(isGenerating || streamingText) && (
                <StreamingGenerationView
                  isGenerating={isGenerating}
                  streamingText={streamingText}
                  agentName="Code Generation Agent"
                />
              )}

              {/* Generation Results */}
              {codeGenerationResult && (
                <Box>
                  {codeGenerationResult.success ? (
                    <Alert type="success" header="Code Generated Successfully">
                      <SpaceBetween size="s">
                        {codeGenerationResult.metadata && (
                          <Box>
                            Code Generated Successfully
                            {codeGenerationResult.metadata.customToolCount > 0 &&
                              ` (${codeGenerationResult.metadata.customToolCount} custom)`
                            }
                            {codeGenerationResult.metadata.expertAgentModel && (
                              <Box variant="small" color="text-body-secondary" margin={{ top: "xs" }}>
                                Generated using: {codeGenerationResult.metadata.expertAgentModel}
                              </Box>
                            )}
                          </Box>
                        )}
                      </SpaceBetween>
                    </Alert>
                  ) : (
                    <Alert type="error" header="Code Generation Failed">
                      {codeGenerationResult.errors ? 
                        codeGenerationResult.errors.join(', ') : 
                        codeGenerationResult.error || 'Unknown error occurred'
                      }
                    </Alert>
                  )}
                </Box>
              )}
            </SpaceBetween>
          </Container>
        </SpaceBetween>
      )
    },
    {
      id: 'code',
      label: 'Generated Code',
      disabled: !requestId,
      content: (
        <SpaceBetween size="l">
          <Container
            header={
              <Header
                variant="h3"
                actions={
                  <SpaceBetween direction="horizontal" size="s">
                    <Button
                      onClick={() => loadCodeFromS3('pure_strands')}
                      disabled={!requestId || isLoadingCode}
                      loading={isLoadingCode}
                    >
                      Refresh Code
                    </Button>
                    <Button onClick={handleSaveCode} disabled={!generatedCode}>
                      Download Code
                    </Button>
                    <Button
                      variant="primary"
                      onClick={handleExecuteCode}
                      disabled={!generatedCode || isExecuting}
                      loading={isExecuting}
                    >
                      Test Code
                    </Button>
                  </SpaceBetween>
                }
              >
                Python Code
              </Header>
            }
          >
            {/* Execution Environment Selection - Below Test Code button */}
            <FormField
              label="Testing Environment"
              description="Choose where to test your code"
            >
              <RadioGroup
                value={executionEnvironment}
                onChange={({ detail }) => setExecutionEnvironment(detail.value)}
                items={[
                  {
                    value: 'python_repl',
                    label: (
                      <Box display="flex" alignItems="center">
                        <Box marginRight="xs">Python REPL</Box>
                        <Popover
                          dismissButton={false}
                          position="top"
                          size="small"
                          triggerType="custom"
                          content={<Box variant="small">Local Python execution environment</Box>}
                        >
                          <Icon name="status-info" size="small" />
                        </Popover>
                      </Box>
                    )
                  },
                  {
                    value: 'code_interpreter',
                    label: (
                      <Box display="flex" alignItems="center">
                        <Box marginRight="xs">Code Interpreter</Box>
                        <Popover
                          dismissButton={false}
                          position="top"
                          size="small"
                          triggerType="custom"
                          content={<Box variant="small">AWS AgentCore Code Interpreter sandbox</Box>}
                        >
                          <Icon name="status-info" size="small" />
                        </Popover>
                      </Box>
                    )
                  }
                ]}
              />
            </FormField>

            {/* Loading state */}
            {isLoadingCode && (
              <Box textAlign="center" padding="l">
                <ProgressBar
                  status="in-progress"
                  value={50}
                  label="Loading code from S3..."
                />
              </Box>
            )}

            {/* Error state */}
            {codeLoadError && (
              <Alert type="error" header="Failed to Load Code">
                <SpaceBetween size="s">
                  <Box>{codeLoadError}</Box>
                  <Button
                    onClick={() => loadCodeFromS3('pure_strands')}
                    disabled={isLoadingCode}
                  >
                    Retry
                  </Button>
                </SpaceBetween>
              </Alert>
            )}

            {/* Code editor */}
            {generatedCode && !isLoadingCode ? (
              <SpaceBetween size="s">
                <FormField
                  label="Python Code (Editable)"
                  description="You can edit the generated code before testing. Code is loaded from S3 temporary storage."
                >
                  <CodeEditor
                    ace={aceLoaded ? ace : undefined}
                    language="python"
                    value={generatedCode}
                    onDelayedChange={({ detail }) => setGeneratedCode(detail.value)}
                    preferences={preferences}
                    onPreferencesChange={({ detail }) => setPreferences(detail)}
                    loading={!aceLoaded}
                    themes={{
                      light: ["cloud_editor"],
                      dark: ["cloud_editor_dark"]
                    }}
                    i18nStrings={{
                      loadingState: "Loading code editor",
                      errorState: "There was an error loading the code editor.",
                      errorStateRecovery: "Retry"
                    }}
                  />
                </FormField>
                <Box>
                  <CopyToClipboard
                    copyButtonAriaLabel="Copy code"
                    copyErrorText="Code failed to copy"
                    copySuccessText="Code copied"
                    textToCopy={generatedCode}
                  />
                </Box>
              </SpaceBetween>
            ) : !isLoadingCode && !codeLoadError ? (
              <Box textAlign="center" padding="l">
                <SpaceBetween size="m">
                  <Box variant="p" color="text-body-secondary">
                    No code loaded yet. Generate code first, then click "Refresh Code" to load from S3.
                  </Box>
                  <Button
                    onClick={() => loadCodeFromS3('pure_strands')}
                    disabled={!requestId}
                  >
                    Load Code from S3
                  </Button>
                </SpaceBetween>
              </Box>
            ) : null}
          </Container>
        </SpaceBetween>
      )
    },
    {
      id: 'execution',
      label: 'Execution Results',
      disabled: !executionResult,
      content: (
        <SpaceBetween size="l">
          <Container header={<Header variant="h3">Execution Results</Header>}>
            {executionResult ? (
              <SpaceBetween size="m">
                {executionResult.success ? (
                  <Alert type="success" header="Code Executed Successfully">
                    <SpaceBetween size="s">
                      <Box>
                        Execution completed in {executionResult.executionTime.toFixed(0)}ms
                      </Box>
                      {executionResult.metadata?.simulatedExecution && (
                        <Box variant="small" color="text-status-info">
                          Note: This is a simulated execution for development purposes
                        </Box>
                      )}
                    </SpaceBetween>
                  </Alert>
                ) : (
                  <Alert type="error" header="Execution Failed">
                    {executionResult.error}
                  </Alert>
                )}

                {executionResult.output && (
                  <Container header={<Header variant="h4">Output</Header>}>
                    <CodeView
                      content={(() => {
                        let output = executionResult.output;
                        
                        // Handle JSON responses from both python_repl and code_interpreter
                        if (typeof output === 'string' && (output.includes('{"content":') || output.includes('"structuredContent"'))) {
                          try {
                            const parsed = JSON.parse(output);
                            
                            // Priority 1: Extract from structuredContent.stdout (cleanest)
                            if (parsed.structuredContent && parsed.structuredContent.stdout) {
                              let cleanText = parsed.structuredContent.stdout;
                              
                              // Clean up escape sequences
                              cleanText = cleanText
                                .replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => String.fromCharCode(parseInt(code, 16))) // Unicode
                                .replace(/\u001b\[[0-9;]*m/g, '') // ANSI colors
                                .replace(/\\n/g, '\n') // Newlines
                                .replace(/\\t/g, '\t') // Tabs
                                .replace(/\\"/g, '"') // Quotes
                                .replace(/\\'/g, "'"); // Single quotes
                              
                              return cleanText;
                            }
                            
                            // Priority 2: Extract from content array
                            if (parsed.content && Array.isArray(parsed.content)) {
                              const textContent = parsed.content
                                .filter(item => item && item.text)
                                .map(item => {
                                  let text = item.text;
                                  // Same cleanup
                                  text = text
                                    .replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => String.fromCharCode(parseInt(code, 16)))
                                    .replace(/\u001b\[[0-9;]*m/g, '')
                                    .replace(/\\n/g, '\n')
                                    .replace(/\\t/g, '\t')
                                    .replace(/\\"/g, '"')
                                    .replace(/\\'/g, "'");
                                  return text;
                                })
                                .join('\n');
                              if (textContent) return textContent;
                            }
                            
                            // Fallback: return original if we can't parse it
                            return output;
                          } catch (e) {
                            console.error('Failed to parse execution result JSON:', e);
                            return output;
                          }
                        }
                        
                        // For non-JSON responses, return as-is
                        return typeof output === 'string' ? output : JSON.stringify(output, null, 2);
                      })()}
                      actions={
                        <CopyToClipboard
                          copyButtonAriaLabel="Copy output"
                          copyErrorText="Output failed to copy"
                          copySuccessText="Output copied"
                          textToCopy={typeof executionResult.output === 'string'
                            ? executionResult.output.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\'/g, "'")
                            : JSON.stringify(executionResult.output, null, 2)}
                        />
                      }
                    />
                  </Container>
                )}
              </SpaceBetween>
            ) : (
              <Box textAlign="center" padding="l">
                <Box variant="p" color="text-body-secondary">
                  No execution results yet. Generate and test code first.
                </Box>
              </Box>
            )}
          </Container>
        </SpaceBetween>
      )
    },
    {
      id: 'deploy',
      label: 'Deploy to AgentCore',
      disabled: !requestId,
      content: (
        <AgentCoreDeploymentPanel
          generatedCode={generatedCode}
          requestId={requestId}
          requirementsTxtUri={requirementsTxtUri}
          agentName={agentSpecific ? agentName : 'Agent System'}
          onDeploymentComplete={handleDeploymentComplete}
        />
      )
    },
    {
      id: 'chat',
      label: 'Chat with your Agent',
      disabled: !deployedAgentArn,
      content: (
        <AgentCoreChatPanel
          agentRuntimeArn={deployedAgentArn}
          deploymentId={deploymentId}
          agentName={agentSpecific ? agentName : 'Agent System'}
        />
      )
    }
  ];

  return (
    <>
      {/* Orphan Warning Modal */}
      {showOrphanWarning && (
        <Modal
          visible={showOrphanWarning}
          onDismiss={() => setShowOrphanWarning(false)}
          header="Orphaned Resources Detected"
          size="medium"
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button onClick={() => setShowOrphanWarning(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    setShowOrphanWarning(false);
                    handleGenerateCode(true); // Skip orphan check on retry
                  }}
                >
                  Proceed Anyway
                </Button>
              </SpaceBetween>
            </Box>
          }
        >
          <SpaceBetween size="m">
            {!agentSpecific && (
              <Box>
                {(orphanAgents?.length > 0) && (
                  <Box>• {orphanAgents.length} orphaned agent{orphanAgents.length > 1 ? 's' : ''}</Box>
                )}
                {(orphanTools?.length > 0) && (
                  <Box>• {orphanTools.length} orphaned tool{orphanTools.length > 1 ? 's' : ''}</Box>
                )}
              </Box>
            )}
            {agentSpecific && selectedAgentId && orphanAgents?.some(agent => agent.id === selectedAgentId) && (
              <Box>• Selected agent is orphaned</Box>
            )}
            <Box variant="p">
              Do you want to proceed with code generation?
            </Box>
          </SpaceBetween>
        </Modal>
      )}

      {/* Main Code Generation Modal */}
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        header={agentSpecific ? `Build Selected - ${agentName}` : "Build All - Complete System"}
        size="max"
        footer={
          <Box float="right">
            <Button onClick={onDismiss}>Close</Button>
          </Box>
        }
      >
        <Tabs
          activeTabId={activeTab}
          onChange={({ detail }) => setActiveTab(detail.activeTabId)}
          tabs={tabs}
        />
      </Modal>
    </>
  );
}