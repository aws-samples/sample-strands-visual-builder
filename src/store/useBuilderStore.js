import { create } from 'zustand';
import { addEdge, applyNodeChanges, applyEdgeChanges } from 'reactflow';
import authService from '../services/authService';

const useBuilderStore = create((set, get) => ({
  // State
  nodes: [],
  edges: [],
  selectedNode: null,
  generatedCode: null,
  executionResults: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  
  // Orphan detection state
  orphanAgents: [],
  orphanTools: [],
  
  // Copy/Paste state
  clipboard: null,
  
  // Undo/Redo state
  history: [],
  historyIndex: -1,
  
  // Authentication state
  user: null,
  isAuthenticated: false,
  authLoading: false,
  
  // UI preferences - migrate to new default (right-side panel)
  panelPosition: (() => {
    // Check if we need to migrate to new default
    const migrationKey = 'panelPositionMigrated_v1';
    const hasMigrated = localStorage.getItem(migrationKey);
    
    if (!hasMigrated) {
      // First time or migration needed - set to new default
      localStorage.setItem('panelPosition', 'side');
      localStorage.setItem('panelSize', '350');
      localStorage.setItem(migrationKey, 'true');
      return 'side';
    }
    
    // Use existing preference after migration
    return localStorage.getItem('panelPosition') || 'side';
  })(),
  panelSize: parseInt(localStorage.getItem('panelSize')) || 350,
  
  // Node operations
  setNodes: (nodes) => set({ nodes }),
  
  onNodesChange: (changes) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes),
    });
    
    // Trigger orphan detection after node changes
    get().detectOrphans();
  },
  
  addNode: (nodeData) => {
    const newNode = {
      id: `${nodeData.type}-${Date.now()}`,
      type: nodeData.type,
      position: nodeData.position || { x: Math.random() * 400, y: Math.random() * 400 },
      data: nodeData.data
    };
    
    // Use command pattern for undo/redo support
    const command = new AddNodeCommand(newNode);
    get().executeCommand(command);
    
    // Trigger orphan detection after adding node
    get().detectOrphans();
    
    return newNode.id;
  },
  
  updateNode: (nodeId, newData) => {
    const { nodes } = get();
    const currentNode = nodes.find(node => node.id === nodeId);
    
    if (currentNode) {
      const oldData = { ...currentNode.data };
      const command = new EditNodeCommand(nodeId, newData, oldData);
      get().executeCommand(command);
    }
  },
  
  deleteNode: (nodeId) => {
    const { nodes, edges } = get();
    const nodeToDelete = nodes.find(node => node.id === nodeId);
    const connectedEdges = edges.filter(edge => 
      edge.source === nodeId || edge.target === nodeId
    );
    
    if (nodeToDelete) {
      // Use command pattern for undo/redo support
      const command = new DeleteNodeCommand(nodeToDelete, connectedEdges);
      get().executeCommand(command);
      
      // Clear selection if deleted node was selected
      const { selectedNode } = get();
      if (selectedNode?.id === nodeId) {
        set({ selectedNode: null });
      }
      
      // Trigger orphan detection after deleting node
      get().detectOrphans();
    }
  },
  
  // Edge operations
  setEdges: (edges) => set({ edges }),
  
  onEdgesChange: (changes) => {
    const { edges } = get();
    
    // Handle edge deletions with command pattern
    changes.forEach(change => {
      if (change.type === 'remove') {
        const edgeToDelete = edges.find(edge => edge.id === change.id);
        if (edgeToDelete) {
          const command = new DeleteEdgeCommand(edgeToDelete);
          get().executeCommand(command);
        }
      }
    });
    
    // Apply other changes (selection, etc.) normally
    const nonDeleteChanges = changes.filter(change => change.type !== 'remove');
    if (nonDeleteChanges.length > 0) {
      const newEdges = applyEdgeChanges(nonDeleteChanges, get().edges);
      set({ edges: newEdges });
    }
    
    // Trigger orphan detection after edge changes
    get().detectOrphans();
  },
  
  onConnect: (connection) => {
    const { nodes } = get();
    
    // Validate connection
    const sourceNode = nodes.find(n => n.id === connection.source);
    const targetNode = nodes.find(n => n.id === connection.target);
    
    if (!sourceNode || !targetNode) return;
    
    // Connection validation rules
    const isValidConnection = validateConnection(sourceNode, targetNode, connection);
    
    if (isValidConnection) {
      const newEdge = {
        ...connection,
        id: `edge-${connection.source}-${connection.target}-${Date.now()}`,
        type: 'default',
        animated: true,
        style: { stroke: '#0073bb' }
      };
      
      // Use command pattern for undo/redo support
      const command = new AddEdgeCommand(newEdge);
      get().executeCommand(command);
    }
  },
  
  // Selection
  setSelectedNode: (node) => set({ selectedNode: node }),
  
  // Code generation
  setGeneratedCode: (code) => set({ generatedCode: code }),
  
  generateCode: () => {
    const { nodes, edges } = get();
    // This will be called by components that need to generate code
    return { nodes, edges };
  },
  
  // Execution results
  addExecutionResult: (result) => {
    set((state) => ({
      executionResults: [...state.executionResults, {
        ...result,
        timestamp: new Date(),
        id: Date.now()
      }]
    }));
  },
  
  clearExecutionResults: () => set({ executionResults: [] }),
  
  // Utility methods
  getAgentNodes: () => {
    const { nodes } = get();
    return nodes.filter(node => node.type === 'agent');
  },
  
  getToolNodes: () => {
    const { nodes } = get();
    return nodes.filter(node => node.type === 'tool');
  },
  
  getConnectedTools: (agentId) => {
    const { nodes, edges } = get();
    const connectedEdges = edges.filter(edge => edge.source === agentId);
    return connectedEdges.map(edge => 
      nodes.find(node => node.id === edge.target)
    ).filter(Boolean);
  },
  
  // Orphan detection
  detectOrphans: () => {
    const { nodes, edges } = get();
    
    const agentNodes = nodes.filter(n => n.type === 'agent');
    const toolNodes = nodes.filter(n => n.type === 'tool');
    
    // Smart orphan detection logic:
    // - Single agent alone = no warning
    // - Multiple agents with disconnected ones = warn about disconnected
    // - Tools without connections = always warn
    
    let orphanAgents = [];
    
    // Only check for orphan agents in multi-agent scenarios
    if (agentNodes.length > 1) {
      orphanAgents = agentNodes.filter(agent => 
        !edges.some(edge => edge.source === agent.id || edge.target === agent.id)
      );
    }
    // If there's only one agent (or no agents), no orphan warnings for agents
    
    // Find orphan tools (tools not connected to any agent)
    // Tools always need connections to be useful
    const orphanTools = toolNodes.filter(tool =>
      !edges.some(edge => edge.target === tool.id)
    );
    
    set({ orphanAgents, orphanTools });
    
    return { orphanAgents, orphanTools };
  },
  
  isOrphanNode: (nodeId) => {
    const { orphanAgents, orphanTools } = get();
    return orphanAgents.some(n => n.id === nodeId) || orphanTools.some(n => n.id === nodeId);
  },
  
  // Panel preferences
  setPanelPosition: (position) => {
    localStorage.setItem('panelPosition', position);
    set({ panelPosition: position });
  },
  
  setPanelSize: (size) => {
    localStorage.setItem('panelSize', size.toString());
    set({ panelSize: size });
  },
  
  // Authentication methods
  setUser: (user) => {
    set({ 
      user, 
      isAuthenticated: !!user,
      authLoading: false 
    });
  },
  
  setAuthLoading: (loading) => set({ authLoading: loading }),
  
  signOut: async () => {

    set({ authLoading: true });
    try {
      const result = await authService.signOut();
      
      if (result.success) {

        // Clear state first
        set({ 
          user: null, 
          isAuthenticated: false,
          authLoading: false 
        });
        
        // Clear any cached Amplify data
        try {
          localStorage.removeItem('amplify-authenticator-authState');
          localStorage.removeItem('CognitoIdentityServiceProvider.2feq5bsv0q2jacu2k5nt48fhjg.LastAuthUser');
          sessionStorage.clear();
        } catch (e) {

        }
        

        // Force complete reload
        window.location.href = window.location.origin;
      } else {
        throw new Error(result.error || 'Sign out failed');
      }
    } catch (error) {
      console.error('Sign out error');
      // Force reload even on error to clear any cached state
      set({ authLoading: false });
      window.location.href = window.location.origin;
    }
  },
  
  checkAuthStatus: async () => {
    set({ authLoading: true });
    try {
      const userResult = await authService.getCurrentUser();
      if (userResult.success && userResult.user) {
        set({ 
          user: userResult.user, 
          isAuthenticated: true,
          authLoading: false 
        });
      } else {
        set({ 
          user: null, 
          isAuthenticated: false,
          authLoading: false 
        });
      }
    } catch (error) {
      console.error('Auth check error');
      set({ 
        user: null, 
        isAuthenticated: false,
        authLoading: false 
      });
    }
  },
  
  // Viewport operations
  setViewport: (viewport) => set({ viewport }),
  
  onViewportChange: (viewport) => {
    set({ viewport });
  },

  // Copy/Paste operations
  copyNodes: (nodeIds) => {
    const { nodes } = get();
    const nodesToCopy = nodes.filter(n => nodeIds.includes(n.id));
    set({ clipboard: { type: 'nodes', data: nodesToCopy } });
  },
  
  pasteNodes: () => {
    const { clipboard, executeCommand } = get();
    if (clipboard?.type === 'nodes') {
      const pasteCommands = clipboard.data.map(node => {
        const newNode = {
          ...node,
          id: `${node.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          position: { 
            x: node.position.x + 20, 
            y: node.position.y + 20 
          }
        };
        return new AddNodeCommand(newNode);
      });
      
      // Execute all paste commands as a batch
      pasteCommands.forEach(command => executeCommand(command));
    }
  },
  
  // Undo/Redo system
  executeCommand: (command) => {
    const { history, historyIndex } = get();
    
    // Execute the command
    command.execute(get());
    
    // Add to history and truncate future commands
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(command);
    
    // Keep last 50 commands
    const trimmedHistory = newHistory.slice(-50);
    
    set({ 
      history: trimmedHistory,
      historyIndex: trimmedHistory.length - 1 
    });
  },
  
  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= 0) {
      history[historyIndex].undo(get());
      set({ historyIndex: historyIndex - 1 });
      
      // Trigger orphan detection after undo
      get().detectOrphans();
    }
  },
  
  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      history[nextIndex].execute(get());
      set({ historyIndex: nextIndex });
      
      // Trigger orphan detection after redo
      get().detectOrphans();
    }
  },
  
  canUndo: () => {
    const { historyIndex } = get();
    return historyIndex >= 0;
  },
  
  canRedo: () => {
    const { history, historyIndex } = get();
    return historyIndex < history.length - 1;
  },

  // Reset store
  reset: () => set({
    nodes: [],
    edges: [],
    selectedNode: null,
    generatedCode: null,
    executionResults: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    clipboard: null,
    history: [],
    historyIndex: -1
  }),

  // Project management actions
  saveProject: async (projectName, canvasData) => {
    const { user } = get();
    
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    try {
      const token = await authService.getToken();
      if (!token) {
        return { success: false, error: 'Authentication token not available' };
      }

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          projectName,
          canvasData: {
            nodes: canvasData.nodes,
            edges: canvasData.edges,
            viewport: get().viewport || { x: 0, y: 0, zoom: 1 }
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      const result = await response.json();
      return { success: true, projectId: result.projectId };
      
    } catch (error) {
      console.error('Save project error');
      return { 
        success: false, 
        error: error.message || 'Failed to save project' 
      };
    }
  },

  loadProject: async (projectId) => {
    const { user } = get();
    
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    try {
      const token = await authService.getToken();
      if (!token) {
        return { success: false, error: 'Authentication token not available' };
      }

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/projects/${projectId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      const project = await response.json();
      
      // Load the canvas data into the store
      set({
        nodes: project.canvasData.nodes || [],
        edges: project.canvasData.edges || [],
        viewport: project.canvasData.viewport || { x: 0, y: 0, zoom: 1 },
        selectedNode: null,
        generatedCode: null
      });

      return { success: true, project };
      
    } catch (error) {
      console.error('Load project error');
      return { 
        success: false, 
        error: error.message || 'Failed to load project' 
      };
    }
  },

  listProjects: async () => {
    const { user } = get();
    
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    try {
      const token = await authService.getToken();
      if (!token) {
        return { success: false, error: 'Authentication token not available' };
      }

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/projects`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        // Handle common scenarios gracefully
        if (response.status === 404) {
          // User has no projects yet - return empty list
          return { success: true, projects: [] };
        }
        
        if (response.status === 503) {
          // Service unavailable (DynamoDB not configured)
          return { 
            success: false, 
            error: 'Project storage is not configured. Please check your deployment.' 
          };
        }
        
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      const result = await response.json();
      return { success: true, projects: result.projects || [] };
      
    } catch (error) {
      console.error('List projects error');
      
      return { 
        success: false, 
        error: error.message || 'Failed to list projects' 
      };
    }
  },

  deleteProject: async (projectId) => {
    const { user } = get();
    
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    try {
      const token = await authService.getToken();
      if (!token) {
        return { success: false, error: 'Authentication token not available' };
      }

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      return { success: true };
      
    } catch (error) {
      console.error('Delete project error');
      return { 
        success: false, 
        error: error.message || 'Failed to delete project' 
      };
    }
  }
}));

// Command pattern for undo/redo
class CanvasCommand {
  constructor(type, data) {
    this.type = type;
    this.data = data;
  }
  
  execute(store) {
    throw new Error('Execute method must be implemented');
  }
  
  undo(store) {
    throw new Error('Undo method must be implemented');
  }
}

class AddNodeCommand extends CanvasCommand {
  constructor(nodeData) {
    super('addNode', nodeData);
  }
  
  execute(store) {
    const { nodes } = store;
    store.setNodes([...nodes, this.data]);
  }
  
  undo(store) {
    const { nodes } = store;
    store.setNodes(nodes.filter(node => node.id !== this.data.id));
  }
}

class DeleteNodeCommand extends CanvasCommand {
  constructor(nodeData, connectedEdges) {
    super('deleteNode', nodeData);
    this.connectedEdges = connectedEdges;
  }
  
  execute(store) {
    const { nodes, edges } = store;
    store.setNodes(nodes.filter(node => node.id !== this.data.id));
    store.setEdges(edges.filter(edge => 
      edge.source !== this.data.id && edge.target !== this.data.id
    ));
  }
  
  undo(store) {
    const { nodes, edges } = store;
    store.setNodes([...nodes, this.data]);
    store.setEdges([...edges, ...this.connectedEdges]);
  }
}

class AddEdgeCommand extends CanvasCommand {
  constructor(edgeData) {
    super('addEdge', edgeData);
  }
  
  execute(store) {
    const { edges } = store;
    store.setEdges([...edges, this.data]);
  }
  
  undo(store) {
    const { edges } = store;
    store.setEdges(edges.filter(edge => edge.id !== this.data.id));
  }
}

class DeleteEdgeCommand extends CanvasCommand {
  constructor(edgeData) {
    super('deleteEdge', edgeData);
  }
  
  execute(store) {
    const { edges } = store;
    store.setEdges(edges.filter(edge => edge.id !== this.data.id));
  }
  
  undo(store) {
    const { edges } = store;
    store.setEdges([...edges, this.data]);
  }
}

class EditNodeCommand extends CanvasCommand {
  constructor(nodeId, newData, oldData) {
    super('editNode', { nodeId, newData, oldData });
  }
  
  execute(store) {
    const { nodes } = store;
    store.setNodes(nodes.map(node =>
      node.id === this.data.nodeId 
        ? { ...node, data: { ...node.data, ...this.data.newData } }
        : node
    ));
  }
  
  undo(store) {
    const { nodes } = store;
    store.setNodes(nodes.map(node =>
      node.id === this.data.nodeId 
        ? { ...node, data: { ...node.data, ...this.data.oldData } }
        : node
    ));
  }
}

// Connection validation logic
function validateConnection(sourceNode, targetNode, connection) {
  // Rule 1: Prevent self-connections
  if (connection.source === connection.target) {
    console.warn('Cannot connect node to itself');
    return false;
  }
  
  // Rule 2: Prevent duplicate connections
  const { edges } = useBuilderStore.getState();
  const existingConnection = edges.find(edge => 
    edge.source === connection.source && edge.target === connection.target
  );
  
  if (existingConnection) {
    console.warn('Connection already exists');
    return false;
  }
  
  // Rule 3: Validate connection types
  if (sourceNode.type === 'agent' && targetNode.type === 'tool') {
    // Agent-to-Tool: Standard tool usage

    return true;
  }
  
  if (sourceNode.type === 'agent' && targetNode.type === 'agent') {
    // Agent-to-Agent: Multi-agent patterns (Swarm, Graph, Sequential, Agents as Tools)

    return true;
  }
  
  // Block unsupported connection types
  if (sourceNode.type === 'tool') {
    console.warn('Tools cannot be connection sources');
    return false;
  }
  
  console.warn('Unsupported connection type');
  return false;
}

export default useBuilderStore;