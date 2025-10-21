/**
 * AgentCore Chat Interface
 * Clean chat interface based on the working AgentCoreChatPanel
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Container,
  Header,
  Button,
  ButtonGroup,
  SpaceBetween,
  Box,
  Alert,
  StatusIndicator,
  Spinner,
  PromptInput
} from '@cloudscape-design/components';
import ChatBubble from '@cloudscape-design/chat-components/chat-bubble';
import Avatar from '@cloudscape-design/chat-components/avatar';
import { authService } from '../services/authService.js';
import MessageRenderer from './MessageRenderer';

export default function AgentCoreChatInterface({ 
  agentRuntimeArn, 
  agentName = 'Agent',
  addNotification = () => {}
}) {
  // Chat state
  const [messages, setMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [connectionError, setConnectionError] = useState(null);
  const [chatSession, setChatSession] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Refs
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Reset state when agentRuntimeArn changes
  useEffect(() => {
    // Reset all state when agent changes
    setMessages([]);
    setCurrentMessage('');
    setIsStreaming(false);
    setSessionId(null);
    setConnectionError(null);
    setChatSession(null);
    setIsInitialized(false);
  }, [agentRuntimeArn]);

  // Initialize chat session when component mounts
  useEffect(() => {
    if (agentRuntimeArn && !isInitialized) {
      initializeChatSession();
    }
  }, [agentRuntimeArn, isInitialized]);

  const initializeChatSession = async () => {
    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
      
      // Get authentication token
      const token = await authService.getToken();
      const headers = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`${apiBaseUrl}/api/agentcore/sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          agent_runtime_arn: agentRuntimeArn
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create chat session');
      }

      const result = await response.json();
      setSessionId(result.session_id);
      setChatSession(result);
      setConnectionError(null);
      setIsInitialized(true);

    } catch (error) {
      console.error('Failed to initialize chat session');
      setConnectionError(error.message);
    }
  };

  const addMessage = (type, content, status = 'sent') => {
    const message = {
      id: Date.now() + Math.random(),
      type,
      content,
      timestamp: new Date(),
      status
    };

    setMessages(prev => [...prev, message]);
    return message.id;
  };

  const updateMessage = (messageId, updates) => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId ? { ...msg, ...updates } : msg
    ));
  };

  const sendMessage = async () => {
    if (!currentMessage.trim() || isStreaming || !sessionId) return;

    const userMessage = currentMessage.trim();
    setCurrentMessage('');

    // Add user message
    addMessage('user', userMessage);

    // Don't add assistant message yet - let the loading state show first

    setIsStreaming(true);
    setConnectionError(null);

    try {
      // Use non-streaming invocation since AgentCore doesn't actually stream
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
      
      // Get authentication token
      const token = await authService.getToken();
      const headers = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`${apiBaseUrl}/api/agentcore/invoke`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          agent_runtime_arn: agentRuntimeArn,
          message: userMessage,
          session_id: sessionId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to invoke agent');
      }

      // Handle non-streaming JSON response
      const result = await response.json();
      const assistantContent = result.response || 'No response';
      
      // Add assistant message (replaces loading state)
      addMessage('assistant', assistantContent || 'No response received', 'sent');

    } catch (error) {
      console.error('Failed to send message');
      setConnectionError(error.message);
      
      // Add error message (replaces loading state)
      addMessage('assistant', `Error: ${error.message}`, 'error');
    } finally {
      setIsStreaming(false);
    }
  };



  const formatTime = (timestamp) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(timestamp);
  };

  const getMessageStatusIcon = (status) => {
    switch (status) {
      case 'sending':
      case 'streaming':
        return <Spinner size="small" />;
      case 'error':
        return <StatusIndicator type="error">Error</StatusIndicator>;
      case 'sent':
      default:
        return null;
    }
  };

  if (!agentRuntimeArn) {
    return (
      <Container>
        <Box textAlign="center" padding="l">
          <Box variant="p" color="text-body-secondary">
            No agent selected. Please select an agent to start chatting.
          </Box>
        </Box>
      </Container>
    );
  }

  return (
    <Container>
      <SpaceBetween size="l">
        {/* Connection Status */}
        {connectionError && (
          <Alert 
            type="error" 
            header="Connection Error"
            action={
              <Button onClick={initializeChatSession}>
                Retry Connection
              </Button>
            }
          >
            {connectionError}
          </Alert>
        )}

        {/* Chat Messages */}
        <div style={{ 
          height: 'calc(80vh - 180px)', 
          minHeight: '450px',
          maxHeight: '900px',
          overflowY: 'auto', 
          padding: '16px'
        }}>
          <SpaceBetween size="m">
            {messages.map((message) => {
              // Skip system messages or show them as simple text
              if (message.type === 'system') {
                return (
                  <Box key={message.id} textAlign="center" padding="s">
                    <Box variant="small" color="text-body-secondary">
                      {message.content}
                    </Box>
                  </Box>
                );
              }

              return (
                <ChatBubble
                  key={message.id}
                  ariaLabel={`${message.type === 'user' ? 'You' : agentName} at ${formatTime(message.timestamp)}`}
                  type={message.type === 'user' ? 'outgoing' : 'incoming'}
                  avatar={
                    message.type === 'user' ? (
                      <Avatar
                        ariaLabel="You"
                        tooltipText="You"
                        initials="U"
                      />
                    ) : (
                      <Avatar
                        color="gen-ai"
                        iconName="gen-ai"
                        ariaLabel={agentName}
                        tooltipText={agentName}
                        loading={message.status === 'streaming'}
                      />
                    )
                  }
                  actions={
                    message.type === 'assistant' && message.status === 'sent' ? (
                      <ButtonGroup
                        ariaLabel="Chat bubble actions"
                        variant="icon"
                        items={[
                          {
                            type: "icon-button",
                            id: "copy",
                            iconName: "copy",
                            text: "Copy",
                            onClick: async () => {
                              try {
                                await navigator.clipboard.writeText(message.content);
                                if (addNotification) {
                                  addNotification({
                                    type: 'success',
                                    content: 'Message copied to clipboard',
                                    dismissible: true
                                  });
                                }
                              } catch (error) {
                                console.error('Failed to copy');
                                if (addNotification) {
                                  addNotification({
                                    type: 'error',
                                    content: 'Failed to copy message',
                                    dismissible: true
                                  });
                                }
                              }
                            }
                          }
                        ]}
                      />
                    ) : undefined
                  }
                >
                  {message.status === 'streaming' && message.content === '' ? (
                    <Box color="text-status-inactive">Generating response</Box>
                  ) : (
                    <MessageRenderer>{message.content}</MessageRenderer>
                  )}
                </ChatBubble>
              );
            })}
            
            {isStreaming && !messages.some(m => m.type === 'assistant' && (m.status === 'streaming' || m.status === 'sending')) && (
              <ChatBubble
                ariaLabel={`${agentName} is generating response`}
                type="incoming"
                showLoadingBar={true}
                avatar={
                  <Avatar
                    loading={true}
                    color="gen-ai"
                    iconName="gen-ai"
                    ariaLabel={agentName}
                    tooltipText={agentName}
                  />
                }
              >
                <Box color="text-status-inactive">Generating response</Box>
              </ChatBubble>
            )}
            
            <div ref={messagesEndRef} />
          </SpaceBetween>
        </div>

        {/* Message Input */}
        <PromptInput
          onChange={({ detail }) => setCurrentMessage(detail.value)}
          onAction={({ detail }) => {
            if (detail.value.trim() && !isStreaming && sessionId) {
              sendMessage();
            }
          }}
          value={currentMessage}
          actionButtonAriaLabel="Send message"
          actionButtonIconName="send"
          ariaLabel="Chat message input"
          placeholder="Ask a question..."
          disabled={isStreaming || !sessionId}
          disableActionButton={!currentMessage.trim() || isStreaming || !sessionId}
        />
      </SpaceBetween>
    </Container>
  );
}