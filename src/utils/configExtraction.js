// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

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
  const mcpServers = nodes.filter(n => n.type === 'mcpServer');
  const gateways = nodes.filter(n => n.type === 'gateway');
  
  return {
    agents,
    tools,
    mcpServers,
    gateways: gateways.map(gw => ({
      id: gw.id,
      label: gw.data.label || '',
      gatewayId: gw.data.gatewayId || '',
      gatewayEndpoint: gw.data.endpoint || '',
      region: gw.data.region || 'us-west-2',
      position: gw.position
    })),
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
  
  // Find all nodes connected to this agent (tools, MCP servers)
  const connectedNodeIds = edges
    .filter(e => e.source === selectedAgentId || e.target === selectedAgentId)
    .map(e => e.source === selectedAgentId ? e.target : e.source);
  
  const connectedNodes = nodes.filter(n => connectedNodeIds.includes(n.id));
  
  // Separate by type
  const connectedTools = connectedNodes.filter(n => n.type === 'tool');
  const connectedMCPServers = connectedNodes.filter(n => n.type === 'mcpServer');
  const connectedGateways = connectedNodes.filter(n => n.type === 'gateway');
  
  // Filter connections to only include relevant ones
  const relevantConnections = edges.filter(e =>
    e.source === selectedAgentId || e.target === selectedAgentId
  );
  
  return {
    agents: [selectedAgent],
    tools: connectedTools,
    mcpServers: connectedMCPServers,
    gateways: connectedGateways.map(gw => ({
      id: gw.id,
      label: gw.data.label || '',
      gatewayId: gw.data.gatewayId || '',
      gatewayEndpoint: gw.data.endpoint || '',
      region: gw.data.region || 'us-west-2',
      position: gw.position
    })),
    connections: relevantConnections,
    architecture: {
      workflowType: 'single-agent',
      complexity: connectedTools.length + connectedMCPServers.length > 3 ? 'moderate' : 'simple',
      patterns: determinePatternsForAgent(connectedTools, connectedMCPServers)
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
  const mcpServers = nodes.filter(n => n.type === 'mcpServer');
  
  if (agents.length === 0) {
    return {
      workflowType: 'none',
      complexity: 'none',
      patterns: []
    };
  }
  
  const patterns = determinePatternsForAgent(tools, mcpServers);
  
  if (agents.length === 1) {
    return {
      workflowType: 'single-agent',
      complexity: (tools.length + mcpServers.length) > 3 ? 'moderate' : 'simple',
      patterns
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
      patterns: ['independent-agents', ...patterns]
    };
  }
  
  return {
    workflowType: 'multi-agent',
    complexity: 'complex',
    patterns: ['collaborative-agents', 'workflow-orchestration', ...patterns]
  };
};

/**
 * Determine patterns based on connected components
 */
const determinePatternsForAgent = (tools, mcpServers) => {
  const patterns = [];
  if (tools.length > 0) patterns.push('basic-agent-tools');
  if (mcpServers.length > 0) patterns.push('mcp-integration');
  // Note: gateway patterns are detected from the gateways array in the config
  return patterns.length > 0 ? patterns : ['basic-agent'];
};