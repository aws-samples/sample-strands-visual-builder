/**
 * Streaming Generation View - Minimal chat interface for code generation progress
 * Reuses existing chat components from AgentCoreChatPanel
 */

import React, { useRef, useEffect } from 'react';
import {
  Container,
  Header,
  SpaceBetween,
  Box
} from '@cloudscape-design/components';
import ChatBubble from '@cloudscape-design/chat-components/chat-bubble';
import Avatar from '@cloudscape-design/chat-components/avatar';
import MarkdownRenderer from './MarkdownRenderer';

export default function StreamingGenerationView({
  isGenerating = false,
  streamingText = '',
  agentName = 'Code Generation Agent'
}) {
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when text updates
  useEffect(() => {
    if (streamingText) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [streamingText]);

  // Show if generating OR if we have streaming text to display
  if (!isGenerating && !streamingText) {
    return null;
  }

  return (
    <Container
      header={
        <Header variant="h4">
          {isGenerating ? 'Code Generation Progress' : 'Code Generation Complete'}
        </Header>
      }
    >
      {/* Read-only chat interface - no input box */}
      <div style={{ 
        minHeight: '150px',
        maxHeight: '300px',
        overflowY: 'auto',
        padding: '16px',
        border: '1px solid #e9ebed',
        borderRadius: '8px',
        backgroundColor: '#ffffff'
      }}>
        <SpaceBetween size="m">
          {/* Agent response bubble - reuses existing components */}
          <ChatBubble
            ariaLabel={`${agentName} generating code`}
            type="incoming"
            avatar={
              <Avatar
                loading={isGenerating && !streamingText}
                color="gen-ai"
                iconName="gen-ai"
                ariaLabel={agentName}
                tooltipText={agentName}
              />
            }
          >
            {streamingText ? (
              <MarkdownRenderer 
                content={streamingText} 
                isStreaming={isGenerating}
              />
            ) : (
              <Box color="text-status-inactive">
                Starting code generation...
              </Box>
            )}
          </ChatBubble>
          
          <div ref={messagesEndRef} />
        </SpaceBetween>
      </div>
    </Container>
  );
}