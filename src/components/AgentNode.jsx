import React from 'react';
import { Handle, Position } from 'reactflow';
import { Box, Badge, SpaceBetween, Popover } from '@cloudscape-design/components';
import { Bot, AlertTriangle } from 'lucide-react';
import useBuilderStore from '../store/useBuilderStore';

export default function AgentNode({ data, selected, id }) {
  const isOrphan = useBuilderStore(state => state.isOrphanNode(id));
  
  const containerStyle = {
    minWidth: '200px', // Larger than tools but not excessive
    maxWidth: '260px', // Reasonable max width
    minHeight: '80px', // Ensure adequate height for content
    border: isOrphan 
      ? '2px dashed #ff9900' 
      : selected 
        ? '2px solid #0073bb' 
        : '1px solid #d5dbdb',
    borderRadius: '8px',
    backgroundColor: isOrphan 
      ? '#fff7ed' 
      : selected 
        ? '#f2f8ff' 
        : '#ffffff',
    boxShadow: selected ? '0 4px 12px rgba(0, 115, 187, 0.25)' : '0 2px 6px rgba(0, 0, 0, 0.12)', // Enhanced shadow for prominence
    transition: 'all 0.2s ease-in-out'
  };

  return (
    <div style={containerStyle}>
      <Handle
        type="target"
        position={Position.Left}
        style={{ 
          background: '#0073bb',
          border: '2px solid #ffffff',
          width: '12px',
          height: '12px'
        }}
        id="agent-input"
      />
      
      <Box padding="s">
        <SpaceBetween size="xs" direction="vertical">
          <SpaceBetween size="xs" direction="horizontal" alignItems="center">
            <Bot size={18} color={selected ? '#0073bb' : '#232f3e'} />
            <Box variant="strong" fontSize="body-m">
              {data.label || 'Agent'}
            </Box>
            <Badge color="blue">Agent</Badge>
            {isOrphan && (
              <Popover
                size="small"
                position="top"
                triggerType="custom"
                dismissButton={false}
                content={
                  <Box variant="small">
                    <strong>Disconnected Agent</strong><br />
                    This agent is disconnected in a multi-agent setup. It will be generated as an independent Agent() instance. Consider connecting it to other agents or tools if it should be part of the workflow.
                  </Box>
                }
              >
                <AlertTriangle size={16} color="#ff9900" />
              </Popover>
            )}
          </SpaceBetween>
          
          {data.model && (
            <Box variant="small" color="text-body-secondary">
              Model: {data.modelName || 'Selected Model'}
            </Box>
          )}
          
          {data.systemPrompt && (
            <Box variant="small" color="text-body-secondary">
              {data.systemPrompt.length > 50 
                ? `${data.systemPrompt.substring(0, 50)}...`
                : data.systemPrompt
              }
            </Box>
          )}
        </SpaceBetween>
      </Box>

      <Handle
        type="source"
        position={Position.Right}
        style={{ 
          background: '#0073bb',
          border: '2px solid #ffffff',
          width: '12px',
          height: '12px'
        }}
        id="agent-output"
      />
    </div>
  );
}