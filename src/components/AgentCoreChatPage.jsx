import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Container,
  Header,
  SpaceBetween,
  Button,
  Box,
  Alert,
  Toggle,
  StatusIndicator,
  PromptInput
} from '@cloudscape-design/components';
import ChatBubble from '@cloudscape-design/chat-components/chat-bubble';
import Avatar from '@cloudscape-design/chat-components/avatar';
import newChatService from '../services/newChatService';
import MessageRenderer from './MessageRenderer';
import Logger from '../utils/logger.js';

const AgentCoreChatPage = ({ 
  addNotification = () => {}, 
  onConversationChange = () => {}, 
  onSelectConversationChange = () => {}, 
  selectedConversationId = null, 
  toolsOpen = false, 
  onToolsChange = () => {}, 
  onNewConversation = () => {} 
}) => {
  // State management
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isConnected, setIsConnected] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionHealth, setConnectionHealth] = useState('healthy');
  const [retryCount, setRetryCount] = useState(0);
  const [lastError, setLastError] = useState(null);
  
  // AgentCore options state with persistence
  const [agentCoreOptions, setAgentCoreOptions] = useState(() => {
    // Load from localStorage if available
    try {
      const saved = localStorage.getItem('agentcore_options');
      return saved ? JSON.parse(saved) : {
        use_web: false,
        think: true,
        swarm: false
      };
    } catch (e) {
      return {
        use_web: false,
        think: true,
        swarm: false
      };
    }
  });

  // Refs
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const currentConversationRef = useRef(null);
  const loadingConversationRef = useRef(false);
  const abortControllerRef = useRef(null);
  const healthCheckIntervalRef = useRef(null);
  const retryTimeoutRef = useRef(null);
  const performanceMetricsRef = useRef({
    messagesSent: 0,
    averageResponseTime: 0,
    errorCount: 0,
    lastHealthCheck: null
  });

  // User ID (must match backend default user)
  const userId = 'default-user';

  // Enhanced error handling utility
  const handleError = useCallback((error, operation, showNotification = true) => {
    Logger.error(`Error in ${operation}:`, error);
    
    const errorMessage = error.message || 'An unexpected error occurred';
    const isNetworkError = error.isNetworkError || error.name === 'TypeError';
    
    setLastError({
      message: errorMessage,
      operation,
      timestamp: new Date().toISOString(),
      isNetworkError,
      canRetry: isNetworkError || error.status >= 500
    });
    
    setError(errorMessage);
    performanceMetricsRef.current.errorCount++;
    
    if (showNotification && addNotification) {
      addNotification({
        type: 'error',
        content: `${operation}: ${errorMessage}`,
        dismissible: true
      });
    }
    
    // Update connection health
    if (isNetworkError) {
      setIsConnected(false);
      setConnectionHealth('unhealthy');
    } else if (error.status >= 500) {
      setConnectionHealth('degraded');
    }
  }, [addNotification]);

  // Health check functionality
  const performHealthCheck = useCallback(async () => {
    try {
      const health = await newChatService.healthCheck();
      setConnectionHealth(health.status || 'healthy');
      setIsConnected(true);
      performanceMetricsRef.current.lastHealthCheck = new Date().toISOString();
      
      if (health.status === 'unhealthy') {
        Logger.warn('Service health check indicates unhealthy status:', health);
      }
    } catch (error) {
      Logger.warn('Health check failed:', error);
      setConnectionHealth('unhealthy');
      setIsConnected(false);
    }
  }, []);

  // Retry failed operations
  const retryLastOperation = useCallback(async () => {
    if (!lastError || !lastError.canRetry) return;
    
    setRetryCount(prev => prev + 1);
    setError(null);
    setLastError(null);
    
    // Clear any existing retry timeout
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    
    // Perform health check first
    await performHealthCheck();
    
    // If still unhealthy, don't retry
    if (!isConnected) {
      setError('Connection is still unavailable. Please check your network.');
      return;
    }
    
    // Retry based on the last operation
    try {
      switch (lastError.operation) {
        case 'create conversation':
          await createConversation();
          break;
        case 'load conversation':
          if (conversationId) {
            await loadConversation(conversationId);
          }
          break;
        case 'send message':
          // Don't auto-retry message sending to avoid duplicates
          addNotification({
            type: 'info',
            content: 'Please try sending your message again.',
            dismissible: true
          });
          break;
        default:
          Logger.debug('No retry handler for operation:', lastError.operation);
      }
    } catch (retryError) {
      handleError(retryError, `retry ${lastError.operation}`);
    }
  }, [lastError, isConnected, performHealthCheck, conversationId, addNotification]);

  // Save AgentCore options to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('agentcore_options', JSON.stringify(agentCoreOptions));
    } catch (e) {
      Logger.warn('Failed to save AgentCore options to localStorage:', e);
    }
  }, [agentCoreOptions]);

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    if (messages.length > 0 && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Create new conversation with enhanced error handling
  const createConversation = useCallback(async () => {
    Logger.debug('AgentCoreChatPage: createConversation called');
    setIsLoading(true);
    setError(null);
    
    try {
      const conversationData = {
        title: 'New Chat Session',
        user_id: userId,
        agentcore_options: agentCoreOptions
      };
      
      const startTime = Date.now();
      const response = await newChatService.createConversation(conversationData);
      const duration = Date.now() - startTime;
      
      Logger.debug('AgentCoreChatPage: createConversation response:', response);
      Logger.debug(`Conversation creation took ${duration}ms`);
      
      if (response.success && response.data) {
        const newConvId = response.data.conversation_id;
        Logger.debug('AgentCoreChatPage: New conversation created with ID:', newConvId);
        setConversationId(newConvId);
        currentConversationRef.current = newConvId;
        
        // Reset error state on success
        setRetryCount(0);
        setLastError(null);
        
        // Trigger chat history refresh
        Logger.debug('AgentCoreChatPage: Calling onNewConversation callback');
        if (onNewConversation) {
          onNewConversation();
          Logger.debug('AgentCoreChatPage: onNewConversation callback called');
        } else {
          Logger.warn('AgentCoreChatPage: onNewConversation callback is missing!');
        }
        
        return newConvId;
      } else {
        Logger.error('AgentCoreChatPage: Failed to create conversation:', response.error);
        throw new Error(response.error || 'Failed to create conversation');
      }
    } catch (error) {
      handleError(error, 'create conversation');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [agentCoreOptions, onNewConversation, userId, handleError]);

  // Pass conversation state to parent for tools panel
  useEffect(() => {
    if (onConversationChange) {
      onConversationChange(conversationId);
    }
  }, [conversationId, onConversationChange]);

  // Initialize - add chat-page class to body and start health monitoring
  useEffect(() => {
    document.body.classList.add('chat-page');
    
    // Initial health check
    performHealthCheck();
    
    // Set up periodic health checks (every 2 minutes)
    healthCheckIntervalRef.current = setInterval(performHealthCheck, 120000);

    // Cleanup on unmount
    return () => {
      document.body.classList.remove('chat-page');
      
      // Abort any ongoing streaming request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // Clear intervals and timeouts
      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      
      // Clear refs
      currentConversationRef.current = null;
      loadingConversationRef.current = false;
    };
  }, [performHealthCheck]);

  // Handle streaming response with enhanced error handling and performance monitoring
  const handleStreamingResponse = async (response, startTime) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let chunkCount = 0;
    let lastActivity = Date.now();
    let totalChars = 0;
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          const duration = Date.now() - startTime;
          Logger.debug(`Streaming completed in ${duration}ms with ${chunkCount} chunks (${totalChars} chars)`);
          
          // Update performance metrics
          performanceMetricsRef.current.messagesSent++;
          const currentAvg = performanceMetricsRef.current.averageResponseTime;
          performanceMetricsRef.current.averageResponseTime = 
            (currentAvg * (performanceMetricsRef.current.messagesSent - 1) + duration) / 
            performanceMetricsRef.current.messagesSent;
          
          setIsProcessing(false);
          
          // Mark the last AI message as complete
          setMessages(prev => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
              lastMessage.isStreaming = false;
              lastMessage.metadata = {
                ...lastMessage.metadata,
                duration,
                chunkCount,
                totalChars
              };
            }
            return newMessages;
          });
          break;
        }
        
        const currentTime = Date.now();
        
        // Only check for very long timeout (1 hour) to prevent infinite hangs
        // AgentCore can take a long time for complex queries, so be very generous
        if (currentTime - startTime > 3600000) {
          Logger.error('Streaming timeout exceeded after 1 hour');
          throw new Error('Response generation timed out after 1 hour');
        }
        
        // Show progress indicator for long operations (every 30 seconds)
        if (currentTime - startTime > 30000 && (currentTime - startTime) % 30000 < 1000) {
          const elapsed = Math.round((currentTime - startTime) / 1000);
          Logger.debug(`AgentCore still processing... (${elapsed}s elapsed)`);
        }
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        chunkCount++;
        lastActivity = currentTime;
        
        for (const line of lines) {
          if (line.trim() === '' || !line.startsWith('data: ')) continue;
          
          try {
            const jsonStr = line.substring(6); // Remove 'data: ' prefix
            if (jsonStr === '[DONE]') {
              Logger.debug('Received [DONE] signal');
              continue;
            }
            
            const data = JSON.parse(jsonStr);
            Logger.debug('Streaming data received:', data.type, data.content?.substring(0, 50));
            
            switch (data.type) {
              case 'user_message_saved':
                // User message has been saved, no UI update needed
                Logger.debug('User message saved to database');
                break;
                
              case 'info':
                // System info messages - just log them, don't show as notifications
                Logger.info(`System Info: ${data.content}`);
                // Don't show info messages as notifications to keep UI clean
                break;
                
              case 'warning':
                // Fallback warnings
                Logger.warn(`System Warning: ${data.content}`);
                addNotification({
                  type: 'warning',
                  content: data.content.replace('[FALLBACK]', 'Fallback:'),
                  dismissible: true
                });
                break;
                
              case 'content':
                // Streaming AI response content
                const contentChunk = data.content || '';
                totalChars += contentChunk.length;
                
                setMessages(prev => {
                  const newMessages = [...prev];
                  const lastMessage = newMessages[newMessages.length - 1];
                  
                  if (lastMessage && lastMessage.role === 'assistant' && lastMessage.isStreaming) {
                    // Append to existing streaming message
                    lastMessage.content += contentChunk;
                    if (data.metadata?.source) {
                      lastMessage.source = data.metadata.source;
                    }
                  } else {
                    // Create new AI message
                    newMessages.push({
                      id: Date.now().toString(),
                      role: 'assistant',
                      content: contentChunk,
                      timestamp: new Date().toISOString(),
                      isStreaming: true,
                      source: data.metadata?.source || 'agentcore',
                      metadata: {
                        startTime: new Date().toISOString()
                      }
                    });
                  }
                  
                  return newMessages;
                });
                break;
                
              case 'assistant_message_saved':
                // AI message is complete and saved
                Logger.debug('AI message saved to database');
                setMessages(prev => {
                  const newMessages = [...prev];
                  const lastMessage = newMessages[newMessages.length - 1];
                  
                  if (lastMessage && lastMessage.role === 'assistant') {
                    lastMessage.isStreaming = false;
                    lastMessage.metadata = {
                      ...lastMessage.metadata,
                      ...data.metadata,
                      endTime: new Date().toISOString()
                    };
                  }
                  
                  return newMessages;
                });
                break;
                
              case 'done':
                // AI response generation completed
                Logger.debug('AI response generation completed');
                setIsProcessing(false);
                break;
                
              case 'error':
                Logger.error('Streaming error:', data);
                const errorMsg = data.content || 'An error occurred during response generation';
                setError(errorMsg);
                setIsProcessing(false);
                handleError(new Error(errorMsg), 'streaming response', false);
                break;
                
              default:
                Logger.debug('Unknown streaming message type:', data.type, data);
            }
          } catch (parseError) {
            Logger.error('Error parsing streaming data:', parseError, 'Raw line:', line);
            // Don't break the stream for parse errors, just log them
          }
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        Logger.debug('Streaming aborted by user');
        addNotification({
          type: 'info',
          content: 'Response generation was cancelled',
          dismissible: true
        });
      } else {
        Logger.error('Error reading stream:', error);
        handleError(error, 'streaming response');
      }
      setIsProcessing(false);
    } finally {
      reader.releaseLock();
    }
  };

  // Send message with comprehensive error handling and performance monitoring
  const sendMessage = useCallback(async () => {
    if (!inputMessage.trim() || isProcessing || !conversationId) {
      return;
    }

    const messageContent = inputMessage.trim();
    const startTime = Date.now();
    
    // Validate message length
    if (messageContent.length > 10000) {
      handleError(new Error('Message is too long (maximum 10,000 characters)'), 'send message');
      return;
    }
    
    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: messageContent,
      timestamp: new Date().toISOString(),
      metadata: {
        agentCoreOptions: { ...agentCoreOptions }
      }
    };

    // Add user message to UI immediately
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsProcessing(true);
    setError(null);
    
    // Create abort controller for this request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    try {
      Logger.debug(`Sending message with AgentCore options:`, agentCoreOptions);
      
      // Send message via HTTP POST with streaming enabled
      const response = await newChatService.sendMessage(conversationId, messageContent, agentCoreOptions);
      
      // Reset error state on successful request start
      setRetryCount(0);
      setLastError(null);
      
      // Handle streaming response with performance monitoring
      await handleStreamingResponse(response, startTime);
      
    } catch (error) {
      Logger.error('Error sending message:', error);
      
      // Remove the user message from UI if sending failed
      setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
      
      // Restore the input message so user can retry
      setInputMessage(messageContent);
      
      setIsProcessing(false);
      handleError(error, 'send message');
      
      // Offer retry for certain error types
      if (error.isNetworkError || (error.status && error.status >= 500)) {
        retryTimeoutRef.current = setTimeout(() => {
          if (addNotification) {
            addNotification({
              type: 'info',
              content: 'Would you like to retry sending your message?',
              dismissible: true,
              action: {
                text: 'Retry',
                onClick: () => {
                  setInputMessage(messageContent);
                  // The user can click send again
                }
              }
            });
          }
        }, 2000);
      }
    }
  }, [inputMessage, isProcessing, conversationId, agentCoreOptions, handleError, addNotification]);

  // Load conversation from history with enhanced error handling
  const loadConversation = useCallback(async (convId) => {
    // Guard against undefined/null conversation ID
    if (!convId) {
      Logger.warn('loadConversation called with undefined/null conversation ID');
      return;
    }
    
    // Don't reload if it's the same conversation or already loading
    if (convId === conversationId || convId === currentConversationRef.current || loadingConversationRef.current) {
      Logger.debug('Already loaded/loading this conversation:', convId);
      return;
    }

    Logger.debug('Loading conversation:', convId);
    loadingConversationRef.current = true;
    setIsLoading(true);
    setError(null);
    
    try {
      setMessages([]);
      setIsProcessing(false);
      
      // Abort any ongoing streaming request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // Get messages for this conversation with performance monitoring
      Logger.debug('Fetching conversation messages...');
      const startTime = Date.now();
      const messagesResponse = await newChatService.getMessages(convId);
      const duration = Date.now() - startTime;
      
      Logger.debug(`Messages response received in ${duration}ms:`, messagesResponse);
      
      if (messagesResponse.success && messagesResponse.data) {
        const loadedMessages = messagesResponse.data.messages.map(msg => ({
          id: msg.message_id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          isStreaming: false,
          source: msg.metadata?.source || 'unknown',
          metadata: msg.metadata
        }));
        
        Logger.debug(`Loaded ${loadedMessages.length} messages for conversation ${convId}`);
        setMessages(loadedMessages);
        
        // Reset error state on successful load
        setRetryCount(0);
        setLastError(null);
      } else {
        throw new Error(messagesResponse.error || 'Failed to load messages');
      }

      setConversationId(convId);
      currentConversationRef.current = convId;
      Logger.debug('Set conversation ID to:', convId);
      
    } catch (error) {
      Logger.error('Error loading conversation:', error);
      handleError(error, 'load conversation');
      
      // Reset conversation state on error
      setConversationId(null);
      currentConversationRef.current = null;
    } finally {
      loadingConversationRef.current = false;
      setIsLoading(false);
    }
  }, [conversationId, handleError]);

  // Handle conversation selection from history
  const handleSelectConversation = useCallback((convId) => {
    if (!convId) {
      Logger.warn('handleSelectConversation called with undefined/null conversation ID');
      return;
    }
    if (convId !== conversationId) {
      loadConversation(convId);
    }
  }, [conversationId, loadConversation]);

  // Pass handleSelectConversation to parent
  useEffect(() => {
    if (onSelectConversationChange) {
      onSelectConversationChange(handleSelectConversation);
    }
  }, [handleSelectConversation, onSelectConversationChange]);

  // Respond to conversation selection from parent
  useEffect(() => {
    if (selectedConversationId && selectedConversationId !== conversationId) {
      Logger.debug('AgentCoreChatPage: Loading conversation from parent:', selectedConversationId);
      loadConversation(selectedConversationId);
    }
  }, [selectedConversationId, conversationId, loadConversation]);

  // Clear chat
  const clearChat = useCallback(async () => {
    // Clear current state first
    setMessages([]);
    setIsProcessing(false);
    setError(null);
    setConversationId(null);
    currentConversationRef.current = null;
    
    // Abort any ongoing streaming request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Notify parent to clear the selected conversation to prevent conflicts
    if (onConversationChange) {
      onConversationChange(null);
    }
    
    // Create new conversation
    const convId = await createConversation();
    if (convId) {
      setConversationId(convId);
      currentConversationRef.current = convId;
      
      // Notify parent of the new conversation
      if (onConversationChange) {
        onConversationChange(convId);
      }
    }
    
    addNotification({
      type: 'info',
      content: 'Chat cleared and new conversation started',
      dismissible: true
    });
  }, [createConversation, addNotification, onConversationChange]);

  // Update AgentCore option with validation and persistence
  const updateAgentCoreOption = useCallback((key, value) => {
    // Validate the option
    if (!['use_web', 'think', 'swarm'].includes(key)) {
      Logger.warn('Invalid AgentCore option key:', key);
      return;
    }
    
    if (typeof value !== 'boolean') {
      Logger.warn('Invalid AgentCore option value (must be boolean):', value);
      return;
    }
    
    Logger.debug(`Updating AgentCore option: ${key} = ${value}`);
    
    setAgentCoreOptions(prev => {
      const newOptions = {
        ...prev,
        [key]: value
      };
      
      // Show notification about the change
      if (addNotification) {
        const optionNames = {
          use_web: 'Web Search',
          think: 'Thinking Mode',
          swarm: 'Swarm Mode'
        };
        
        addNotification({
          type: 'info',
          content: `${optionNames[key]} ${value ? 'enabled' : 'disabled'}`,
          dismissible: true
        });
      }
      
      return newOptions;
    });
  }, [addNotification]);

  // Handle prompt input action (Enter key or button click)
  const handlePromptAction = ({ detail }) => {
    if (detail.value.trim() && isConnected && !isProcessing) {
      sendMessage();
    }
  };

  return (
    <div 
      className="chat-page-container"
      style={{ 
        height: 'calc(100vh - 120px)', // Account for top navigation and any margins
        display: 'flex', 
        flexDirection: 'column', 
        overflow: 'hidden',
        backgroundColor: '#ffffff',
        margin: 0,
        padding: 0
      }}
    >
      <div style={{ flexShrink: 0, maxHeight: '100px' }}>
        <Container
          header={
            <Header
              variant="h2"
              actions={
                <SpaceBetween direction="horizontal" size="s">
                  <StatusIndicator 
                    type={
                      !isConnected ? 'error' : 
                      connectionHealth === 'degraded' ? 'warning' : 
                      'success'
                    }
                  >
                    {!isConnected ? 'Disconnected' : 
                     connectionHealth === 'degraded' ? 'Limited' : 
                     'Connected'}
                  </StatusIndicator>
                  
                  <Toggle
                    checked={agentCoreOptions.use_web}
                    onChange={({ detail }) => updateAgentCoreOption('use_web', detail.checked)}
                    disabled={isProcessing || isLoading}
                    ariaLabel="Enable web search capabilities"
                  >
                    Web
                  </Toggle>
                  
                  <Toggle
                    checked={agentCoreOptions.think}
                    onChange={({ detail }) => updateAgentCoreOption('think', detail.checked)}
                    disabled={isProcessing || isLoading}
                    ariaLabel="Enable thinking mode for detailed reasoning"
                  >
                    Think
                  </Toggle>
                  
                  <Toggle
                    checked={agentCoreOptions.swarm}
                    onChange={({ detail }) => updateAgentCoreOption('swarm', detail.checked)}
                    disabled={isProcessing || isLoading}
                    ariaLabel="Enable swarm mode for collaborative AI responses"
                  >
                    Swarm
                  </Toggle>
                  
                  <Button
                    variant="normal"
                    iconName="refresh"
                    onClick={clearChat}
                    disabled={isProcessing || isLoading}
                    ariaLabel="Clear current chat and start new conversation"
                  >
                    Clear
                  </Button>
                  
                  <Button
                    variant="normal"
                    iconName="view-vertical"
                    onClick={() => onToolsChange(!toolsOpen)}
                    ariaLabel="Toggle chat history sidebar"
                  >
                    History
                  </Button>
                </SpaceBetween>
              }
            >
              Ask Thalaiva
            </Header>
          }
        >
          {/* Enhanced Error Display */}
          {error && (
            <Alert 
              type="error" 
              dismissible 
              onDismiss={() => {
                setError(null);
                setLastError(null);
              }}
              action={lastError?.canRetry ? (
                <Button 
                  variant="primary" 
                  size="small"
                  onClick={retryLastOperation}
                  disabled={isLoading || isProcessing}
                >
                  Retry
                </Button>
              ) : null}
            >
              <SpaceBetween size="xs">
                <div>{error}</div>
                {lastError?.isNetworkError && (
                  <div style={{ fontSize: '0.9em', color: '#666' }}>
                    Please check your internet connection and try again.
                  </div>
                )}
                {retryCount > 0 && (
                  <div style={{ fontSize: '0.9em', color: '#666' }}>
                    Retry attempt: {retryCount}
                  </div>
                )}
              </SpaceBetween>
            </Alert>
          )}
          
          {/* Connection Health Indicator */}
          {connectionHealth !== 'healthy' && (
            <Alert 
              type={connectionHealth === 'degraded' ? 'warning' : 'error'}
              dismissible
              onDismiss={() => setConnectionHealth('healthy')}
            >
              Service health: {connectionHealth}. Some features may be limited.
            </Alert>
          )}
          
          {/* Loading Indicator */}
          {isLoading && (
            <Alert type="info">
              <SpaceBetween direction="horizontal" size="s" alignItems="center">
                <StatusIndicator type="loading">Loading...</StatusIndicator>
                <span>Please wait while we process your request</span>
              </SpaceBetween>
            </Alert>
          )}
        </Container>
      </div>

      {/* Chat Messages - Scrollable Area */}
      <div 
        ref={messagesContainerRef}
        style={{ 
          flex: 1, 
          overflow: 'auto', 
          padding: '16px',
          scrollBehavior: 'smooth'
        }}
      >
        {!conversationId ? (
          // Welcome screen when no conversation is selected
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '100%',
            textAlign: 'center'
          }}>
            <SpaceBetween size="l">
              <Box fontSize="heading-l" color="text-body-secondary">
                Welcome to Thalaiva AI
              </Box>
              <Box fontSize="body-m" color="text-body-secondary">
                Select a conversation from the history sidebar or start a new chat
              </Box>
              <Button 
                variant="primary" 
                onClick={async () => {
                  const convId = await createConversation();
                  if (convId) {
                    setConversationId(convId);
                    currentConversationRef.current = convId;
                  }
                }}
              >
                Start New Chat
              </Button>
            </SpaceBetween>
          </div>
        ) : (
          <SpaceBetween size="m">
            {messages.map((message) => (
              <ChatBubble
                key={message.id}
                type={message.role === 'user' ? 'outgoing' : 'incoming'}
                ariaLabel={`${message.role === 'user' ? 'You' : 'Thalaiva AI'} at ${new Date(message.timestamp).toLocaleTimeString()}`}
                showLoadingBar={message.isStreaming}
                avatar={
                  <Avatar
                    ariaLabel={message.role === 'user' ? 'Your avatar' : 'Thalaiva AI avatar'}
                    tooltipText={message.role === 'user' ? 'You' : 'Thalaiva AI'}
                    initials={message.role === 'user' ? 'U' : 'T'}
                    color={message.role === 'user' ? 'default' : 'gen-ai'}
                    iconName={message.role === 'user' ? 'user-profile' : 'gen-ai'}
                    loading={message.isStreaming}
                  />
                }
              >
                {message.role === 'assistant' ? (
                  <MessageRenderer>
                    {message.content}
                  </MessageRenderer>
                ) : (
                  message.content
                )}
              </ChatBubble>
            ))}
            
            {/* Show loading bubble when processing but no AI message started yet */}
            {isProcessing && !messages.some(m => m.role === 'assistant' && m.isStreaming) && (
              <ChatBubble
                type="incoming"
                ariaLabel="Thalaiva AI is generating response"
                avatar={
                  <Avatar
                    loading={true}
                    color="gen-ai"
                    iconName="gen-ai"
                    ariaLabel="Thalaiva AI assistant"
                    tooltipText="Thalaiva AI assistant"
                  />
                }
              >
                <SpaceBetween size="xs">
                  <Box color="text-status-inactive">
                    Generating response with AgentCore
                    {agentCoreOptions.use_web && ' + Web'}
                    {agentCoreOptions.think && ' + Think'}
                    {agentCoreOptions.swarm && ' + Swarm'}...
                  </Box>
                  <StatusIndicator type="loading" size="small">
                    Processing
                  </StatusIndicator>
                </SpaceBetween>
              </ChatBubble>
            )}
            
            {/* Show loading indicator when loading conversation */}
            {isLoading && messages.length === 0 && (
              <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                padding: '2rem' 
              }}>
                <SpaceBetween direction="horizontal" size="s" alignItems="center">
                  <StatusIndicator type="loading">Loading conversation...</StatusIndicator>
                </SpaceBetween>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </SpaceBetween>
        )}
      </div>

      {/* Input Panel - Fixed at bottom */}
      <div style={{ flexShrink: 0, padding: '16px', borderTop: '1px solid #e1e4e8', backgroundColor: '#ffffff' }}>
        <PromptInput
          value={inputMessage}
          onChange={({ detail }) => setInputMessage(detail.value)}
          onAction={handlePromptAction}
          placeholder={
            !isConnected ? "Connection lost - please check your network" :
            isProcessing ? "Generating response..." :
            isLoading ? "Loading..." :
            "Ask me anything..."
          }
          actionButtonIconName={isProcessing ? "status-pending" : "send"}
          actionButtonAriaLabel={isProcessing ? "Generating response" : "Send message"}
          disabled={!isConnected || isLoading}
          disableActionButton={isProcessing || !inputMessage.trim() || !conversationId}
          minRows={1}
          maxRows={4}
          warningText={
            inputMessage.length > 8000 ? 
            `Message is getting long (${inputMessage.length}/10000 characters)` : 
            null
          }
        />
      </div>
    </div>
  );
};

export default AgentCoreChatPage;