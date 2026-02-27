/**
 * Configuration Extractor - Converts visual components into structured data
 * This module extracts structured configuration from the visual builder's nodes and edges
 * to provide rich context for the expert agent
 */

/**
 * Extract structured configuration from visual components
 */
export function extractStructuredConfig(nodes, edges) {
  const agentNodes = nodes.filter(node => node.type === 'agent');
  const toolNodes = nodes.filter(node => node.type === 'tool');
  
  // Extract agent definitions
  const agents = agentNodes.map(node => ({
    id: node.id,
    name: node.data.name || `Agent_${node.id}`,
    model: node.data.model || 'claude-3-5-sonnet',
    systemPrompt: node.data.systemPrompt || 'You are a helpful assistant.',
    temperature: node.data.temperature,
    maxTokens: node.data.maxTokens,
    testQuery: node.data.testQuery,
    position: node.position
  }));
  
  // Extract tool definitions
  const tools = toolNodes.map(node => ({
    id: node.id,
    name: node.data.name,
    type: node.data.type || 'builtin',
    category: node.data.category || 'Other',
    description: node.data.description,
    parameters: node.data.parameters || [],
    returnType: node.data.returnType,
    returnDescription: node.data.returnDescription,
    position: node.position
  }));
  
  // Extract connections
  const connections = edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: edge.type || 'tool-connection',
    sourceNode: nodes.find(n => n.id === edge.source),
    targetNode: nodes.find(n => n.id === edge.target)
  }));
  
  // Analyze architecture
  const architecture = analyzeArchitecture(agents, tools, connections);
  
  return {
    agents,
    tools,
    connections,
    architecture,
    metadata: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      extractedAt: new Date().toISOString()
    }
  };
}

/**
 * Analyze the architecture pattern and complexity
 */
function analyzeArchitecture(agents, tools, connections) {
  const agentCount = agents.length;
  const toolCount = tools.length;
  const connectionCount = connections.length;
  
  // Determine workflow type
  let workflowType = 'unknown';
  
  if (agentCount === 0) {
    workflowType = 'no-agents';
  } else if (agentCount === 1) {
    workflowType = 'single-agent';
  } else if (agentCount > 1) {
    // Analyze connection patterns for multi-agent systems
    const agentConnections = analyzeAgentConnections(agents, connections);
    
    if (agentConnections.isSequential) {
      workflowType = 'sequential-pipeline';
    } else if (agentConnections.isParallel) {
      workflowType = 'parallel-processing';
    } else if (agentConnections.hasHub) {
      workflowType = 'hub-and-spoke';
    } else {
      workflowType = 'complex-network';
    }
  }
  
  // Determine complexity level
  let complexity = 'simple';
  
  if (agentCount > 3 || toolCount > 8 || connectionCount > 10) {
    complexity = 'complex';
  } else if (agentCount > 1 || toolCount > 4 || connectionCount > 5) {
    complexity = 'moderate';
  }
  
  // Identify patterns
  const patterns = identifyPatterns(agents, tools, connections);
  
  return {
    agentCount,
    toolCount,
    connectionCount,
    workflowType,
    complexity,
    patterns,
    insights: generateArchitectureInsights(workflowType, complexity, patterns)
  };
}

/**
 * Analyze connections between agents
 */
function analyzeAgentConnections(agents, connections) {
  const agentIds = agents.map(a => a.id);
  const agentToAgentConnections = connections.filter(conn => 
    agentIds.includes(conn.source) && agentIds.includes(conn.target)
  );
  
  // Check for sequential pattern (linear chain)
  const isSequential = agentToAgentConnections.length === agents.length - 1;
  
  // Check for parallel pattern (no agent-to-agent connections)
  const isParallel = agentToAgentConnections.length === 0 && agents.length > 1;
  
  // Check for hub pattern (one agent connected to many others)
  const connectionCounts = {};
  agentToAgentConnections.forEach(conn => {
    connectionCounts[conn.source] = (connectionCounts[conn.source] || 0) + 1;
  });
  const maxConnections = Math.max(...Object.values(connectionCounts), 0);
  const hasHub = maxConnections >= agents.length / 2;
  
  return {
    isSequential,
    isParallel,
    hasHub,
    agentToAgentConnections: agentToAgentConnections.length
  };
}

/**
 * Identify common architecture patterns
 */
function identifyPatterns(agents, tools, connections) {
  const patterns = [];
  
  // Data processing pipeline
  const hasFileTools = tools.some(t => ['file_read', 'file_write'].includes(t.name));
  const hasProcessingTools = tools.some(t => ['python_repl', 'calculator'].includes(t.name));
  if (hasFileTools && hasProcessingTools) {
    patterns.push('data-processing-pipeline');
  }
  
  // Web automation
  const hasWebTools = tools.some(t => ['http_request', 'tavily_search', 'exa_search'].includes(t.name));
  if (hasWebTools) {
    patterns.push('web-automation');
  }
  
  // AWS integration
  const hasAwsTools = tools.some(t => ['use_aws', 'retrieve', 'memory'].includes(t.name));
  if (hasAwsTools) {
    patterns.push('aws-integration');
  }
  
  // Media processing
  const hasMediaTools = tools.some(t => ['generate_image', 'image_reader', 'nova_reels'].includes(t.name));
  if (hasMediaTools) {
    patterns.push('media-processing');
  }
  
  // System administration
  const hasSystemTools = tools.some(t => ['shell', 'environment', 'editor'].includes(t.name));
  if (hasSystemTools) {
    patterns.push('system-administration');
  }
  
  // Custom tool development
  const hasCustomTools = tools.some(t => t.type === 'custom');
  if (hasCustomTools) {
    patterns.push('custom-tool-development');
  }
  
  return patterns;
}

/**
 * Generate architecture insights for the expert agent
 */
function generateArchitectureInsights(workflowType, complexity, patterns) {
  const insights = [];
  
  // Workflow-specific insights
  switch (workflowType) {
    case 'single-agent':
      insights.push('This is a single-agent system focused on unified task execution');
      break;
    case 'sequential-pipeline':
      insights.push('This is a sequential pipeline where agents process data in stages');
      break;
    case 'parallel-processing':
      insights.push('This is a parallel processing system with independent agent workflows');
      break;
    case 'hub-and-spoke':
      insights.push('This is a hub-and-spoke architecture with a central coordinator agent');
      break;
    case 'complex-network':
      insights.push('This is a complex network requiring sophisticated coordination patterns');
      break;
  }
  
  // Complexity insights
  if (complexity === 'complex') {
    insights.push('High complexity system requiring advanced error handling and coordination');
  } else if (complexity === 'moderate') {
    insights.push('Moderate complexity system with multiple components to coordinate');
  } else {
    insights.push('Simple system suitable for straightforward implementation');
  }
  
  // Pattern-specific insights
  if (patterns.includes('data-processing-pipeline')) {
    insights.push('Includes data processing capabilities with file I/O and computation');
  }
  if (patterns.includes('web-automation')) {
    insights.push('Includes web automation and search capabilities');
  }
  if (patterns.includes('aws-integration')) {
    insights.push('Integrates with AWS services and cloud capabilities');
  }
  if (patterns.includes('media-processing')) {
    insights.push('Includes media generation and processing capabilities');
  }
  if (patterns.includes('system-administration')) {
    insights.push('Includes system administration and environment management');
  }
  if (patterns.includes('custom-tool-development')) {
    insights.push('Includes custom tool development requiring @tool decorator patterns');
  }
  
  return insights;
}

/**
 * Get connected tools for a specific agent
 */
export function getConnectedTools(agentId, tools, connections) {
  const connectedToolIds = connections
    .filter(conn => conn.source === agentId)
    .map(conn => conn.target);
  
  return tools.filter(tool => connectedToolIds.includes(tool.id));
}

/**
 * Validate the extracted configuration
 */
export function validateConfiguration(config) {
  const errors = [];
  const warnings = [];
  
  // Validate agents
  if (config.agents.length === 0) {
    errors.push('At least one agent is required');
  }
  
  config.agents.forEach((agent, index) => {
    if (!agent.model) {
      errors.push(`Agent ${index + 1}: Model is required`);
    }
    if (!agent.systemPrompt || agent.systemPrompt.trim() === '') {
      warnings.push(`Agent ${index + 1}: System prompt is empty`);
    }
  });
  
  // Validate tools
  config.tools.forEach((tool, index) => {
    if (!tool.name) {
      errors.push(`Tool ${index + 1}: Name is required`);
    }
    if (tool.type === 'custom' && !tool.description) {
      warnings.push(`Tool ${index + 1}: Custom tools should have descriptions`);
    }
  });
  
  // Check for unconnected tools
  const connectedToolIds = new Set(config.connections.map(conn => conn.target));
  const unconnectedTools = config.tools.filter(tool => !connectedToolIds.has(tool.id));
  
  if (unconnectedTools.length > 0) {
    warnings.push(`${unconnectedTools.length} tool(s) are not connected to any agent`);
  }
  
  return { errors, warnings };
}

/**
 * Generate architecture requirements based on workflow type
 */
export function getArchitectureRequirements(workflowType) {
  const requirements = {
    'single-agent': [
      'Create a single Agent instance with all connected tools',
      'Use simple tool configuration and direct agent calls',
      'Include basic error handling and response formatting',
      'Provide a test execution example'
    ],
    'sequential-pipeline': [
      'Create multiple Agent instances with specialized roles',
      'Implement data passing between agents in sequence',
      'Add coordination logic to manage the pipeline flow',
      'Include error handling for pipeline failures',
      'Provide pipeline execution orchestration'
    ],
    'parallel-processing': [
      'Create multiple independent Agent instances',
      'Implement parallel execution using async/await or threading',
      'Add result aggregation and coordination logic',
      'Include error handling for individual agent failures',
      'Provide parallel execution management'
    ],
    'hub-and-spoke': [
      'Create a central coordinator Agent with specialized worker agents',
      'Implement task distribution and result collection',
      'Add coordination protocols between hub and spokes',
      'Include load balancing and error recovery',
      'Provide centralized execution management'
    ],
    'complex-network': [
      'Create multiple Agent instances with complex interconnections',
      'Implement sophisticated coordination and communication patterns',
      'Add state management and synchronization mechanisms',
      'Include comprehensive error handling and recovery',
      'Provide advanced execution orchestration'
    ]
  };
  
  return requirements[workflowType] || requirements['single-agent'];
}

export default {
  extractStructuredConfig,
  getConnectedTools,
  validateConfiguration,
  getArchitectureRequirements
};