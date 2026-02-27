/**
 * Professional Message Renderer
 * Renders chat messages with proper markdown formatting and streaming support
 * Uses Cloudscape components for secure, consistent styling
 */

import React from 'react';
import { Box, SpaceBetween } from '@cloudscape-design/components';

export default function MessageRenderer({ content, isStreaming = false, children }) {
  // Use content prop if provided, otherwise fall back to children
  let messageContent = content || children;

  if (!messageContent) {
    return null;
  }

  // Clean up content if it's showing raw JSON structure
  if (typeof messageContent === 'string') {

    // AGGRESSIVE: Handle the exact format you're seeing first
    if (messageContent.includes("{'role': 'assistant', 'content': [{'text':")) {
      try {
        // Extract the text content directly using regex
        const textMatch = messageContent.match(/'text':\s*"([^"]+)"/);
        if (textMatch && textMatch[1]) {
          messageContent = textMatch[1];
        } else {
          // Try with single quotes
          const textMatch2 = messageContent.match(/'text':\s*'([^']+)'/);
          if (textMatch2 && textMatch2[1]) {
            messageContent = textMatch2[1];
          }
        }
      } catch (e) {
        // Silently handle error
      }
    }

    // First, check if it's a JSON string that needs parsing
    else if (messageContent.trim().startsWith('{') || messageContent.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(messageContent);

        // Handle the exact format: {'role': 'assistant', 'content': [{'text': '...'}]}
        if (parsed.role === 'assistant' && parsed.content && Array.isArray(parsed.content)) {
          if (parsed.content[0]?.text) {
            messageContent = parsed.content[0].text;
          }
        }
        // Handle other common formats
        else if (parsed.content && Array.isArray(parsed.content) && parsed.content[0]?.text) {
          messageContent = parsed.content[0].text;
        }
        else if (parsed.content && typeof parsed.content === 'string') {
          messageContent = parsed.content;
        }
        else if (parsed.text) {
          messageContent = parsed.text;
        }
        else if (parsed.message) {
          messageContent = parsed.message;
        }
        else if (parsed.result) {
          // Handle nested result structures
          if (typeof parsed.result === 'string') {
            messageContent = parsed.result;
          } else if (parsed.result.content && Array.isArray(parsed.result.content)) {
            messageContent = parsed.result.content[0]?.text || parsed.result.content;
          } else if (parsed.result.text) {
            messageContent = parsed.result.text;
          }
        }
        else {
        }
      } catch (e) {
        // If parsing fails, try alternative parsing methods

        // Try to handle single-quoted JSON
        if (messageContent.includes("'role': 'assistant'")) {
          try {
            const fixedJson = messageContent.replace(/'/g, '"');
            const parsed = JSON.parse(fixedJson);

            if (parsed.role === 'assistant' && parsed.content && Array.isArray(parsed.content)) {
              if (parsed.content[0]?.text) {
                messageContent = parsed.content[0].text;
              }
            }
          } catch (e2) {
          }
        }
      }
    }

    // Handle cases where it might be a stringified object without proper JSON format
    else if (messageContent.includes('role') && messageContent.includes('content') && messageContent.includes('text')) {
      // Try multiple regex patterns to extract text
      const patterns = [
        /'text':\s*"([^"]+)"/,  // 'text': "content"
        /"text":\s*"([^"]+)"/,  // "text": "content"  
        /'text':\s*'([^']+)'/,  // 'text': 'content'
        /"text":\s*'([^']+)'/   // "text": 'content'
      ];

      for (const pattern of patterns) {
        const textMatch = messageContent.match(pattern);
        if (textMatch && textMatch[1]) {
          messageContent = textMatch[1];
          break;
        }
      }
    }

    // LAST RESORT: If nothing worked and we still have JSON-like content, show a clean error
    if (messageContent.includes("{'role': 'assistant'") || messageContent.includes('{"role": "assistant"')) {
      messageContent = "I apologize, but there was a formatting issue with my response. Please try asking your question again.";
    }
  }

  // Enhanced markdown formatting using React components
  const formatContent = (text) => {
    if (typeof text !== 'string') return [text];


    let content = text
      // Handle escaped characters first
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'");

    // Split into lines for processing
    const lines = content.split('\n');
    const elements = [];
    let listItems = [];
    let listType = null;

    const flushList = () => {
      if (listItems.length > 0) {
        if (listType === 'bullet') {
          elements.push(
            <Box key={`list-${elements.length}`} margin="xs">
              <SpaceBetween size="xxs">
                {listItems.map((item, idx) => (
                  <Box key={idx} paddingLeft="s">
                    • {item}
                  </Box>
                ))}
              </SpaceBetween>
            </Box>
          );
        } else if (listType === 'numbered') {
          elements.push(
            <Box key={`list-${elements.length}`} margin="xs">
              <SpaceBetween size="xxs">
                {listItems.map((item, idx) => (
                  <Box key={idx} paddingLeft="s">
                    {idx + 1}. {item}
                  </Box>
                ))}
              </SpaceBetween>
            </Box>
          );
        }
        listItems = [];
        listType = null;
      }
    };

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();

      // Empty lines - add spacing
      if (trimmedLine === '') {
        flushList();
        elements.push(<Box key={`space-${index}`} margin="xs" />);
        return;
      }

      // Headers (### Header)
      if (line.match(/^#{1,6}\s+/)) {
        flushList();
        const level = line.match(/^(#{1,6})/)[1].length;
        const headerText = line.replace(/^#{1,6}\s+/, '');

        const variant = level === 1 ? 'h1' : level === 2 ? 'h2' : level === 3 ? 'h3' : 'h4';
        elements.push(
          <Box key={`header-${index}`} variant={variant} margin="s" fontWeight="bold">
            {formatInlineText(headerText)}
          </Box>
        );
        return;
      }

      // Numbered lists (1. Item)
      if (line.match(/^\d+\.\s+/)) {
        if (listType !== 'numbered') {
          flushList();
          listType = 'numbered';
        }
        const content = line.replace(/^\d+\.\s+/, '');
        listItems.push(formatInlineText(content));
        return;
      }

      // Bullet lists (- Item or * Item)
      if (line.match(/^[-*]\s+/)) {
        if (listType !== 'bullet') {
          flushList();
          listType = 'bullet';
        }
        const content = line.replace(/^[-*]\s+/, '');
        listItems.push(formatInlineText(content));
        return;
      }

      // Code blocks (```code```)
      if (line.match(/^```/)) {
        flushList();
        // Handle multi-line code blocks
        let codeContent = '';
        let i = index + 1;
        while (i < lines.length && !lines[i].match(/^```/)) {
          codeContent += lines[i] + '\n';
          i++;
        }
        elements.push(
          <Box key={`code-${index}`} margin="s">
            <Box
              padding="s"
              backgroundColor="grey-50"
              borderRadius="s"
              borderLeft="4px solid"
              borderColor="blue-600"
            >
              <code style={{
                fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace',
                fontSize: '13px',
                whiteSpace: 'pre-wrap'
              }}>
                {codeContent.trim()}
              </code>
            </Box>
          </Box>
        );
        return;
      }

      // Regular paragraphs
      flushList();
      elements.push(
        <Box key={`para-${index}`} margin="xs">
          {formatInlineText(line)}
        </Box>
      );
    });

    // Flush any remaining list items
    flushList();

    return elements;
  };

  // Helper function to format inline text (bold, italic, code)
  const formatInlineText = (text) => {
    if (typeof text !== 'string') return text;

    // Split by formatting markers and process
    const parts = [];
    let currentText = text;
    let key = 0;

    // Handle code first (highest priority)
    const codeRegex = /`([^`]+)`/g;
    const codeParts = currentText.split(codeRegex);

    codeParts.forEach((part, index) => {
      if (index % 2 === 0) {
        // Regular text - check for bold/italic
        if (part) {
          parts.push(...formatBoldItalic(part, key));
          key += 10;
        }
      } else {
        // Code text
        parts.push(
          <code
            key={`code-${key++}`}
            style={{
              backgroundColor: '#f5f5f5',
              padding: '2px 6px',
              borderRadius: '3px',
              fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace',
              fontSize: '13px'
            }}
          >
            {part}
          </code>
        );
      }
    });

    return parts.length === 1 ? parts[0] : parts;
  };

  // Helper function to format bold and italic text
  const formatBoldItalic = (text, startKey = 0) => {
    const parts = [];
    let key = startKey;

    // Handle bold first (**text**)
    const boldRegex = /\*\*([^*]+)\*\*/g;
    const boldParts = text.split(boldRegex);

    boldParts.forEach((part, index) => {
      if (index % 2 === 0) {
        // Regular text - check for italic
        if (part) {
          const italicRegex = /\*([^*]+)\*/g;
          const italicParts = part.split(italicRegex);

          italicParts.forEach((italicPart, italicIndex) => {
            if (italicIndex % 2 === 0) {
              // Regular text
              if (italicPart) {
                parts.push(italicPart);
              }
            } else {
              // Italic text
              parts.push(<em key={`italic-${key++}`}>{italicPart}</em>);
            }
          });
        }
      } else {
        // Bold text
        parts.push(<strong key={`bold-${key++}`}>{part}</strong>);
      }
    });

    return parts.filter(part => part !== ''); // Remove empty strings
  };

  const formattedElements = formatContent(messageContent);

  return (
    <Box>
      <SpaceBetween size="xs">
        {formattedElements}
      </SpaceBetween>
      {isStreaming && (
        <Box display="inline" marginLeft="xxs">
          <span style={{
            opacity: 0.6,
            animation: 'blink 1s infinite',
            fontSize: '16px',
            color: '#0073bb'
          }}>
            ▋
          </span>
        </Box>
      )}

      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </Box>
  );
}