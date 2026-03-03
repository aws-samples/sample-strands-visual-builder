// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import React from 'react';
import { Handle, Position } from 'reactflow';
import { Box, Badge, SpaceBetween, Popover } from '@cloudscape-design/components';
import { Link, AlertTriangle } from 'lucide-react';
import useBuilderStore from '../store/useBuilderStore';

export default function MCPServerNode({ data, selected, id }) {
  const isOrphan = useBuilderStore(state => state.isOrphanNode(id));
  
  const containerStyle = {
    minWidth: '150px',
    maxWidth: '180px', 
    minHeight: '60px',
    border: isOrphan 
      ? '2px dashed #ff9900' 
      : selected 
        ? '2px solid #0073bb' 
        : '1px solid #d5dbdb',
    borderRadius: '6px',
    backgroundColor: isOrphan 
      ? '#fff7ed' 
      : selected 
        ? '#f2f8ff' 
        : '#fafbfc',
    boxShadow: selected ? '0 2px 8px rgba(0, 115, 187, 0.2)' : '0 1px 3px rgba(0, 0, 0, 0.08)',
    transition: 'all 0.2s ease-in-out'
  };
  
  return (
    <div style={containerStyle}>
      <Handle
        type="target"
        position={Position.Left}
        style={{ 
          background: '#16191f',
          border: '2px solid #ffffff',
          width: '12px',
          height: '12px'
        }}
        id="mcp-input"
      />
      
      <Box padding="xs">
        <SpaceBetween size="xs" direction="vertical">
          <SpaceBetween size="xs" direction="horizontal" alignItems="center">
            <div style={{ opacity: 0.8 }}>
              <Link size={14} />
            </div>
            <Box variant="strong" fontSize="body-s" color="text-body-secondary">
              {data.label || 'MCP Server'}
            </Box>
            <Badge color="purple" size="small">MCP</Badge>
            {isOrphan && (
              <Popover
                size="small"
                position="top"
                triggerType="custom"
                dismissButton={false}
                content={
                  <Box variant="small">
                    <strong>Unconnected MCP Server</strong><br />
                    This MCP server is not connected to any agent. Connect this server to an agent to use its tools.
                  </Box>
                }
              >
                <AlertTriangle size={14} color="#ff9900" />
              </Popover>
            )}
          </SpaceBetween>
          
          {data.configuration && (
            <Box variant="small" color="text-body-secondary">
              {data.configuration.length > 30 
                ? `${data.configuration.substring(0, 30)}...`
                : data.configuration
              }
            </Box>
          )}
        </SpaceBetween>
      </Box>
    </div>
  );
}