import React from 'react';
import { SideNavigation, Box, SpaceBetween, Button, Icon, Popover } from '@cloudscape-design/components';
import { Bot, Calculator, Terminal, FileText, Globe, Cpu, Clock, Image, Database, Search, Cloud, Settings, Edit, Camera, Video } from 'lucide-react';
import { getAvailableTools } from '../generators/expertAgentGenerator';

const agentTemplates = [
  {
    id: 'basic-agent',
    label: 'Basic Agent',
    description: 'Simple agent with calculator tool',
    icon: <Bot size={16} />
  },
  {
    id: 'multi-tool-agent',
    label: 'Multi-tool Agent',
    description: 'Agent with multiple tools',
    icon: <Bot size={16} />
  }
];

// Icon mapping for tools - comprehensive list for all discovered tools
const getToolIcon = (toolName) => {
  const iconMap = {
    // File Operations
    file_read: <FileText size={16} />,
    file_write: <Edit size={16} />,
    editor: <Edit size={16} />,
    
    // System
    shell: <Terminal size={16} />,
    python_repl: <Cpu size={16} />,
    environment: <Settings size={16} />,
    use_browser: <Globe size={16} />,
    use_computer: <Cpu size={16} />,
    
    // Web & APIs
    http_request: <Globe size={16} />,
    slack: <Globe size={16} />,
    
    // AWS Services
    use_aws: <Cloud size={16} />,
    retrieve: <Database size={16} />,
    memory: <Database size={16} />,
    
    // Media
    generate_image: <Image size={16} />,
    generate_image_stability: <Image size={16} />,
    image_reader: <Camera size={16} />,
    nova_reels: <Video size={16} />,
    
    // Multi-Agent
    swarm: <Bot size={16} />,
    graph: <Bot size={16} />,
    workflow: <Bot size={16} />,
    use_agent: <Bot size={16} />,
    use_llm: <Bot size={16} />,
    handoff_to_user: <Bot size={16} />,
    
    // Utilities
    calculator: <Calculator size={16} />,
    current_time: <Clock size={16} />,
    journal: <FileText size={16} />,
    sleep: <Clock size={16} />,
    speak: <Settings size={16} />,
    stop: <Settings size={16} />,
    
    // Advanced
    think: <Settings size={16} />,
    load_tool: <Settings size={16} />,
    batch: <Settings size={16} />,
    
    // Extensions
    mem0_memory: <Database size={16} />,
    a2a_client: <Bot size={16} />,
    agent_graph: <Bot size={16} />,
    cron: <Clock size={16} />
  };
  
  return iconMap[toolName] || <Settings size={16} />;
};

export default function ComponentPalette({ onAddAgent, onAddTool, onAddTemplate }) {
  const [availableTools, setAvailableTools] = React.useState([]);
  const [toolsLoading, setToolsLoading] = React.useState(true);

  // Load tools dynamically on component mount
  React.useEffect(() => {
    const loadTools = async () => {
      try {
        setToolsLoading(true);
        const tools = await getAvailableTools();
        
        if (Array.isArray(tools)) {
          const formattedTools = tools.map(tool => ({
            id: tool.name || 'unknown',
            name: tool.name || 'unknown',
            label: (tool.name || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            description: tool.description || 'No description available',
            icon: getToolIcon(tool.name),
            type: tool.type || 'builtin',
            category: tool.category || 'Utilities'
          }));
          setAvailableTools(formattedTools);
        } else {
          console.warn('getAvailableTools did not return an array');
          setAvailableTools([]);
        }
      } catch (error) {
        console.error('Error loading tools');
        setAvailableTools([]);
      } finally {
        setToolsLoading(false);
      }
    };

    loadTools();
  }, []);

  // Group tools by category
  const toolsByCategory = availableTools.reduce((acc, tool) => {
    if (!acc[tool.category]) {
      acc[tool.category] = [];
    }
    acc[tool.category].push(tool);
    return acc;
  }, {});

  const handleDragStart = (event, nodeType, data) => {

    event.dataTransfer.setData('application/reactflow', JSON.stringify({ nodeType, data }));
    event.dataTransfer.effectAllowed = 'move';
  };

  const DraggableNavItem = ({ nodeType, data, icon, text, onClick, description, category }) => {
    const content = (
      <div
        draggable
        onClick={onClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 16px',
          cursor: 'grab',
          borderRadius: '4px',
          margin: '2px 8px',
          transition: 'background-color 0.2s',
          width: 'calc(100% - 16px)', // Ensure full width minus margins
          boxSizing: 'border-box'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.backgroundColor = '#f2f8ff';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
        onDragStart={(e) => {
          e.currentTarget.style.cursor = 'grabbing';
          handleDragStart(e, nodeType, data);
        }}
        onDragEnd={(e) => {
          e.currentTarget.style.cursor = 'grab';
        }}
      >
        {icon}
        <span style={{ fontSize: '14px', flex: 1 }}>{text}</span>
      </div>
    );

    // Add tooltip for tools with enhanced information
    if (nodeType === 'tool' && description) {
      return (
        <Popover
          size="medium"
          position="right"
          triggerType="hover"
          content={
            <Box>
              <Box variant="strong" margin={{ bottom: 'xs' }}>
                {text}
              </Box>
              {category && (
                <Box variant="small" color="text-body-secondary" margin={{ bottom: 'xs' }}>
                  Category: {category}
                </Box>
              )}
              <Box variant="p" fontSize="body-s">
                {description}
              </Box>
            </Box>
          }
        >
          {content}
        </Popover>
      );
    }

    return content;
  };

  return (
    <div style={{ width: '100%', height: '100%', backgroundColor: '#fafafa', borderRight: '1px solid #d5dbdb' }}>
      <div style={{ padding: '16px', borderBottom: '1px solid #d5dbdb', backgroundColor: '#ffffff' }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Component Palette</h3>
      </div>
      
      <div style={{ padding: '8px 0' }}>
        <div style={{ padding: '8px 16px', fontSize: '12px', fontWeight: '600', color: '#687078', textTransform: 'uppercase' }}>
          Components
        </div>
        
        <DraggableNavItem
          nodeType="agent"
          data={{
            label: 'New Agent',
            model: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
            systemPrompt: 'You are a helpful assistant.'
          }}
          icon={<Bot size={16} />}
          text="Agent"
          onClick={() => onAddAgent && onAddAgent()}
        />
        
        {/* Render tools by category */}
        {toolsLoading ? (
          <div style={{ padding: '16px', textAlign: 'center', color: '#687078' }}>
            Loading tools...
          </div>
        ) : (
          Object.entries(toolsByCategory).map(([category, tools]) => (
            <div key={category} style={{ width: '100%' }}>
              <div style={{ padding: '16px 16px 8px 16px', fontSize: '12px', fontWeight: '600', color: '#687078', textTransform: 'uppercase' }}>
                {category}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                {tools.map(tool => (
                  <DraggableNavItem
                    key={tool.id}
                    nodeType="tool"
                    data={{
                      name: tool.name,
                      label: tool.label,
                      description: tool.description,
                      type: tool.type
                    }}
                    icon={tool.icon}
                    text={tool.label}
                    description={tool.description}
                    category={tool.category}
                    onClick={() => onAddTool && onAddTool(tool)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
        
        <div style={{ padding: '16px 16px 8px 16px', fontSize: '12px', fontWeight: '600', color: '#687078', textTransform: 'uppercase' }}>
          Templates
        </div>
        
        {agentTemplates.map(template => (
          <DraggableNavItem
            key={template.id}
            nodeType="template"
            data={{
              templateId: template.id,
              label: template.label,
              description: template.description
            }}
            icon={template.icon}
            text={template.label}
            onClick={() => onAddTemplate && onAddTemplate(template)}
          />
        ))}
      </div>
    </div>
  );
}