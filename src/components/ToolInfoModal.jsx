import React, { useState, useEffect } from 'react';
import {
  Modal,
  Box,
  SpaceBetween,
  Container,
  Header,
  Badge,
  Spinner,
  Alert
} from '@cloudscape-design/components';
import { CodeView } from '@cloudscape-design/code-view';
import { fetchToolInfoCached } from '../services/toolInfoService';

/**
 * Modal component for displaying comprehensive tool information
 */
export default function ToolInfoModal({ toolName, isOpen, onClose }) {
  const [toolInfo, setToolInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (toolName && isOpen) {
      loadToolInfo(toolName);
    }
  }, [toolName, isOpen]);

  const loadToolInfo = async (name) => {
    setLoading(true);
    setError(null);
    
    try {
      const info = await fetchToolInfoCached(name);
      setToolInfo(info);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatParameterType = (type) => {
    // Clean up type annotations for better readability
    return type
      .replace(/typing\./g, '')
      .replace(/builtins\./g, '')
      .replace(/<class '([^']+)'>/g, '$1');
  };

  const formatDescription = (description) => {
    if (!description) return 'No description available';
    
    // Split into paragraphs and format sections
    const paragraphs = description.split('\n\n');
    
    return paragraphs.map((paragraph, index) => {
      // Check if this is a section header (like "How It Works:", "Operation Modes:", etc.)
      if (paragraph.includes(':') && paragraph.split('\n').length === 1 && paragraph.length < 100) {
        return (
          <Box key={index} variant="h3" margin={{ top: index > 0 ? 'm' : 'xs', bottom: 'xs' }}>
            {paragraph}
          </Box>
        );
      }
      
      // Regular paragraph
      return (
        <Box key={index} variant="p" margin={{ bottom: 's' }} style={{ lineHeight: '1.6' }}>
          {paragraph.split('\n').map((line, lineIndex) => (
            <React.Fragment key={lineIndex}>
              {line}
              {lineIndex < paragraph.split('\n').length - 1 && <br />}
            </React.Fragment>
          ))}
        </Box>
      );
    });
  };

  const renderParameters = (parameters) => {
    if (!parameters || parameters.length === 0) {
      return <Box color="text-body-secondary">No parameters</Box>;
    }

    return (
      <SpaceBetween size="s">
        {parameters.map((param, index) => (
          <Box key={index}>
            <SpaceBetween direction="horizontal" size="xs" alignItems="center">
              <Box variant="strong">{param.name}</Box>
              {param.required ? (
                <Badge color="red">Required</Badge>
              ) : (
                <Badge color="blue">Optional</Badge>
              )}
            </SpaceBetween>
            <Box variant="small" color="text-body-secondary" margin={{ top: 'xs' }}>
              Type: {formatParameterType(param.type)}
              {param.default && param.default !== 'None' && ` (default: ${param.default})`}
            </Box>
            {param.description && (
              <Box variant="p" margin={{ top: 'xs' }} style={{ whiteSpace: 'pre-wrap' }}>
                {param.description}
              </Box>
            )}
          </Box>
        ))}
      </SpaceBetween>
    );
  };

  const renderExamples = (examples) => {
    if (!examples || examples.length === 0) {
      return <Box color="text-body-secondary">No examples available</Box>;
    }

    return (
      <SpaceBetween size="s">
        {examples.map((example, index) => (
          <CodeView key={index} content={example} />
        ))}
      </SpaceBetween>
    );
  };

  const renderUsageNotes = (usageNotes) => {
    if (!usageNotes || usageNotes.length === 0) {
      return <Box color="text-body-secondary">No usage notes available</Box>;
    }

    return (
      <SpaceBetween size="s">
        {usageNotes.map((note, index) => (
          <Box key={index} variant="p">
            {note}
          </Box>
        ))}
      </SpaceBetween>
    );
  };

  return (
    <Modal
      visible={isOpen}
      onDismiss={onClose}
      header={`Tool Information: ${toolName || 'Unknown'}`}
      size="large"
    >
      {loading && (
        <Box textAlign="center" padding="l">
          <Spinner size="large" />
          <Box variant="p" margin={{ top: 's' }}>
            Loading tool information...
          </Box>
        </Box>
      )}

      {error && (
        <Alert type="error" header="Error loading tool information">
          {error}
        </Alert>
      )}

      {toolInfo && !loading && (
        <SpaceBetween size="m">
          {/* Basic Information */}
          <Container header={<Header variant="h2">Overview</Header>}>
            <SpaceBetween size="s">
              <Box>
                <Box variant="strong">Name:</Box> {toolInfo.name}
              </Box>
              <Box>
                <Box variant="strong">Category:</Box>{' '}
                <Badge color="blue">{toolInfo.category}</Badge>
              </Box>
              <Box>
                <Box variant="strong">Return Type:</Box>{' '}
                {formatParameterType(toolInfo.return_type)}
              </Box>
              {toolInfo.module && (
                <Box>
                  <Box variant="strong">Module:</Box> {toolInfo.module}
                </Box>
              )}
            </SpaceBetween>
          </Container>

          {/* Description */}
          <Container header={<Header variant="h2">Description</Header>}>
            <SpaceBetween size="s">
              {formatDescription(toolInfo.description)}
            </SpaceBetween>
          </Container>

          {/* Function Signature */}
          <Container header={<Header variant="h2">Function Signature</Header>}>
            <CodeView
              content={toolInfo.signature || 'Signature unavailable'}
              language="python"
            />
          </Container>

          {/* Parameters */}
          <Container header={<Header variant="h2">Parameters ({toolInfo.parameters?.length || 0})</Header>}>
            {renderParameters(toolInfo.parameters)}
          </Container>

          {/* Examples */}
          {toolInfo.examples && toolInfo.examples.length > 0 && (
            <Container header={<Header variant="h2">Examples</Header>}>
              {renderExamples(toolInfo.examples)}
            </Container>
          )}

          {/* Usage Notes */}
          {toolInfo.usage_notes && toolInfo.usage_notes.length > 0 && (
            <Container header={<Header variant="h2">Usage Notes</Header>}>
              {renderUsageNotes(toolInfo.usage_notes)}
            </Container>
          )}

          {/* Full Documentation */}
          <Container header={<Header variant="h2">Full Documentation</Header>}>
            <CodeView
              content={toolInfo.docstring || 'No documentation available'}
              language="text"
            />
          </Container>

          {/* Error Information */}
          {toolInfo.error && (
            <Alert type="warning" header="Partial Information">
              Some tool information could not be loaded: {toolInfo.error}
            </Alert>
          )}
        </SpaceBetween>
      )}
    </Modal>
  );
}