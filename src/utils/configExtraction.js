/**
 * Configuration extraction utilities for agent-specific and full-system code generation
 */

/**
 * Extract full system configuration (all agents and tools)
 * @param {Array} nodes - All nodes from the canvas
 * @param {Array} edges - All edges from the canvas
 * @returns {Object} Full configuration object
 */
export const extractFullConfiguration = (nodes, edges) => {
  const agents = nodes.filter(n => n.type === 'agent');
  const tools = nodes.filter(n => n.type === 'tool');
  
  return {
    agents,
    tools,
    connections: edges,
    architecture: determineArchitecture(nodes, edges),
    generationScope: 'full'
  };
};

/**
 * Extract agent-specific configuration (single agent + connected tools)
 * @param {string} selectedAgentId - ID of the selected agent
 * @param {Array} nodes - All nodes from the canvas
 * @param {Array} edges - All edges from the canvas
 * @returns {Object} Agent-specific configuration object
 */
export const extractAgentConfiguration = (selectedAgentId, nodes, edges) => {
  const selectedAgent = nodes.find(n => n.id === selectedAgentId && n.type === 'agent');
  
  if (!selectedAgent) {
    console.warn('Selected agent not found');
    return extractFullConfiguration(nodes, edges);
  }
  
  // Find tools connected to this agent
  const connectedToolIds = edges
    .filter(e => 
      (e.source === selectedAgentId || e.target === selectedAgentId) &&
      // Ensure the other end is a tool, not another agent
      nodes.find(n => 
        n.id === (e.source === selectedAgentId ? e.target : e.source) && 
        n.type === 'tool'
      )
    )
    .map(e => e.source === selectedAgentId ? e.target : e.source);
  
  const connectedTools = nodes.filter(n => connectedToolIds.includes(n.id));
  
  // Filter connections to only include agent-tool connections
  const relevantConnections = edges.filter(e =>
    (e.source === selectedAgentId && connectedToolIds.includes(e.target)) ||
    (e.target === selectedAgentId && connectedToolIds.includes(e.source))
  );
  
  return {
    agents: [selectedAgent],
    tools: connectedTools,
    connections: relevantConnections,
    architecture: {
      workflowType: 'single-agent',
      complexity: 'simple',
      patterns: ['basic-agent-tools']
    },
    generationScope: 'agent',
    scopeAgentId: selectedAgentId,
    scopeAgentName: selectedAgent.data.name || selectedAgent.data.label || 'Unnamed Agent'
  };
};

/**
 * Determine architecture type based on nodes and edges
 * @param {Array} nodes - All nodes
 * @param {Array} edges - All edges
 * @returns {Object} Architecture configuration
 */
const determineArchitecture = (nodes, edges) => {
  const agents = nodes.filter(n => n.type === 'agent');
  const tools = nodes.filter(n => n.type === 'tool');
  
  if (agents.length === 0) {
    return {
      workflowType: 'none',
      complexity: 'none',
      patterns: []
    };
  }
  
  if (agents.length === 1) {
    return {
      workflowType: 'single-agent',
      complexity: tools.length > 3 ? 'moderate' : 'simple',
      patterns: ['basic-agent-tools']
    };
  }
  
  // Multi-agent system
  const agentConnections = edges.filter(e => {
    const sourceNode = nodes.find(n => n.id === e.source);
    const targetNode = nodes.find(n => n.id === e.target);
    return sourceNode?.type === 'agent' && targetNode?.type === 'agent';
  });
  
  if (agentConnections.length === 0) {
    return {
      workflowType: 'parallel-agents',
      complexity: 'moderate',
      patterns: ['independent-agents']
    };
  }
  
  return {
    workflowType: 'multi-agent',
    complexity: 'complex',
    patterns: ['collaborative-agents', 'workflow-orchestration']
  };
};