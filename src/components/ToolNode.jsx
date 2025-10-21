import React from 'react';
import { Handle, Position } from 'reactflow';
import { Box, Badge, SpaceBetween, Popover } from '@cloudscape-design/components';
import { Wrench, Calculator, Terminal, FileText, Globe, Cpu, AlertTriangle } from 'lucide-react';
import useBuilderStore from '../store/useBuilderStore';

const getToolIcon = (toolType) => {
  const iconMap = {
    calculator: Calculator,
    shell: Terminal,
    python_repl: Cpu,
    file_read: FileText,
    file_write: FileText,
    http_request: Globe,
    default: Wrench
  };
  
  const IconComponent = iconMap[toolType] || iconMap.default;
  return <IconComponent size={14} />; // Reduced from 16 to 14 for more compact appearance
};

const getToolColor = (toolData) => {
  // Determine if tool is built-in or custom based on type field
  const toolType = toolData.type || 'builtin';
  
  if (toolType === 'custom') {
    return 'orange'; // Custom tools created by users
  } else {
    return 'green';  // Built-in tools (calculator, shell, python_repl, etc.)
  }
};

export default function ToolNode({ data, selected, id }) {
  const toolType = data.name || data.type || 'default';
  const isOrphan = useBuilderStore(state => state.isOrphanNode(id));
  
  const containerStyle = {
    minWidth: '150px', // More compact than agents
    maxWidth: '180px', // Smaller max width than agents
    minHeight: '60px', // Ensure compact height
    border: isOrphan 
      ? '2px dashed #ff9900' 
      : selected 
        ? '2px solid #0073bb' 
        : '1px solid #d5dbdb',
    borderRadius: '6px', // Slightly smaller border radius for secondary appearance
    backgroundColor: isOrphan 
      ? '#fff7ed' 
      : selected 
        ? '#f2f8ff' 
        : '#fafbfc', // Slightly different background for hierarchy
    boxShadow: selected ? '0 2px 8px rgba(0, 115, 187, 0.2)' : '0 1px 3px rgba(0, 0, 0, 0.08)', // Lighter shadow for secondary appearance
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
        id="tool-input"
      />
      
      <Box padding="xs">
        <SpaceBetween size="xs" direction="vertical">
          <SpaceBetween size="xs" direction="horizontal" alignItems="center">
            <div style={{ opacity: 0.8 }}>{getToolIcon(toolType)}</div>
            <Box variant="strong" fontSize="body-s" color="text-body-secondary">
              {data.label || data.name || 'Tool'}
            </Box>
            <Badge color={getToolColor(data)} size="small">Tool</Badge>
            {isOrphan && (
              <Popover
                size="small"
                position="top"
                triggerType="custom"
                dismissButton={false}
                content={
                  <Box variant="small">
                    <strong>Unconnected Tool</strong><br />
                    This tool is not connected to any agent. Tools must be connected to agents to be included in code generation. Connect this tool to an agent to use it.
                  </Box>
                }
              >
                <AlertTriangle size={14} color="#ff9900" />
              </Popover>
            )}
          </SpaceBetween>
          
          {data.type && (
            <Box variant="small" color="text-body-secondary">
              Type: {data.type}
            </Box>
          )}
          
          {data.description && (
            <Box variant="small" color="text-body-secondary">
              {data.description.length > 30 
                ? `${data.description.substring(0, 30)}...`
                : data.description
              }
            </Box>
          )}
        </SpaceBetween>
      </Box>
    </div>
  );
}