import React, { useState, useCallback, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { 
  AppLayout, 
  Header, 
  SplitPanel,
  Button,
  SpaceBetween,
  ButtonDropdown
} from '@cloudscape-design/components';
import ReactFlow, { 
  ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';

import Canvas from './components/Canvas';
import AgentNode from './components/AgentNode';
import ToolNode from './components/ToolNode';
import PropertyPanel from './components/PropertyPanel';
import ComponentPalette from './components/ComponentPalette';
import TopBar from './components/TopBar';
import CodeGenerationPanel from './components/CodeGenerationPanel';
import AuthGuard from './components/AuthGuard';
import SettingsPage from './pages/SettingsPage';
import DeploymentsPage from './pages/DeploymentsPage';
import { SettingsProvider } from './contexts/SettingsContext';
import useBuilderStore from './store/useBuilderStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { extractFullConfiguration } from './utils/configExtraction';
import './App.css';

const nodeTypes = {
  agent: AgentNode,
  tool: ToolNode,
};

// Main Canvas Component
const MainCanvas = () => {
  const [splitPanelOpen, setSplitPanelOpen] = useState(false);
  const [codeGenerationPanelOpen, setCodeGenerationPanelOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const reactFlowWrapper = useRef(null);

  // Add canvas-specific class to body to prevent scrolling
  React.useEffect(() => {
    document.body.classList.add('canvas-page');
    return () => {
      document.body.classList.remove('canvas-page');
    };
  }, []);

  // Zustand store - must be declared before useEffect hooks that use these values
  const {
    nodes,
    edges,
    selectedNode,
    panelPosition,
    panelSize,
    onNodesChange,
    onEdgesChange,
    onConnect,
    setSelectedNode,
    updateNode,
    addNode,
    setPanelPosition,
    setPanelSize
  } = useBuilderStore();

  // Apply light theme to document
  React.useEffect(() => {
    document.documentElement.setAttribute('data-awsui-theme', 'light');
    document.body.className = 'awsui-light-mode';
  }, []);

  // Initial orphan detection
  React.useEffect(() => {
    const { detectOrphans } = useBuilderStore.getState();
    detectOrphans();
  }, [nodes, edges]);

  // Close context menu on outside click
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (contextMenu) {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);

  // Handle responsive panel sizing on window resize
  React.useEffect(() => {
    const handleResize = () => {
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
      
      // Adjust panel size if it exceeds new screen constraints
      if (panelPosition === 'side') {
        let maxWidth;
        if (screenWidth <= 768) {
          maxWidth = screenWidth * 0.9;
        } else if (screenWidth <= 1200) {
          maxWidth = 400;
        } else {
          maxWidth = 500;
        }
        
        if (panelSize > maxWidth) {
          setPanelSize(maxWidth);
        }
      } else {
        const maxHeight = screenHeight * 0.6;
        if (panelSize > maxHeight) {
          setPanelSize(maxHeight);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [panelPosition, panelSize, setPanelSize]);
  
  // Keyboard shortcuts
  useKeyboardShortcuts();

  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node);
    setSplitPanelOpen(true);
  }, [setSelectedNode]);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setSplitPanelOpen(false);
    setContextMenu(null); // Hide context menu when clicking on pane
  }, [setSelectedNode]);

  const onEdgeContextMenu = useCallback((event, edge) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      edge: edge
    });
  }, []);

  const handleDeleteEdge = useCallback((edgeId) => {
    const { edges, onEdgesChange } = useBuilderStore.getState();
    const updatedEdges = edges.filter(edge => edge.id !== edgeId);
    onEdgesChange([{ type: 'remove', id: edgeId }]);
    setContextMenu(null);
  }, []);

  const handleNodeUpdate = useCallback((nodeId, newData) => {
    updateNode(nodeId, newData);
  }, [updateNode]);

  const handleAddAgent = useCallback(() => {
    addNode({
      type: 'agent',
      data: {
        label: 'New Agent',
        model: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
        systemPrompt: 'You are a helpful assistant.'
      }
    });
  }, [addNode]);

  const handleAddTool = useCallback((toolData) => {
    addNode({
      type: 'tool',
      data: toolData
    });
  }, [addNode]);

  const handleAddTemplate = useCallback((template) => {
    // Add template logic here

  }, []);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event) => {
    event.preventDefault();

    if (!reactFlowWrapper.current) return;

    const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
    
    try {
      const dataString = event.dataTransfer.getData('application/reactflow');
      if (!dataString) {
        return;
      }
      
      const data = JSON.parse(dataString);
      if (!data || !data.nodeType) {
        return;
      }

      // Calculate position relative to the React Flow viewport
      const position = {
        x: event.clientX - reactFlowBounds.left - 100, // Offset to center the node
        y: event.clientY - reactFlowBounds.top - 50,
      };



      addNode({
        type: data.nodeType,
        position,
        data: data.data
      });
    } catch (error) {
      console.error('Error parsing drag data');
    }
  }, [addNode]);

  return (
    <ReactFlowProvider>
      <AuthGuard>
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <TopBar 
            title="Strands Canvas"
          />
      <AppLayout
        navigation={
          <ComponentPalette
            onAddAgent={handleAddAgent}
            onAddTool={handleAddTool}
            onAddTemplate={handleAddTemplate}
          />
        }
        splitPanelPreferences={{
          position: panelPosition
        }}
        onSplitPanelPreferencesChange={({ detail }) => {
          setPanelPosition(detail.position);
          
          // Adjust panel size when switching positions for optimal layout
          const screenWidth = window.innerWidth;
          const screenHeight = window.innerHeight;
          
          if (detail.position === 'side') {
            // Switch to right-side: set optimal width
            if (screenWidth <= 768) {
              setPanelSize(280);
            } else if (screenWidth <= 1200) {
              setPanelSize(350);
            } else {
              setPanelSize(380);
            }
          } else {
            // Switch to bottom: set optimal height
            setPanelSize(Math.min(300, screenHeight * 0.4));
          }
        }}
        content={
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px' }}>
              <Button 
                variant="primary"
                onClick={() => setCodeGenerationPanelOpen(true)}
                disabled={nodes.filter(n => n.type === 'agent').length === 0}
                title={nodes.filter(n => n.type === 'agent').length === 0
                  ? "Add agents to the canvas"
                  : "Generate code for entire canvas"
                }
              >
                Build All
              </Button>
            </div>
          <div ref={reactFlowWrapper} style={{ flex: 1, width: '100%', minHeight: 0 }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onEdgeContextMenu={onEdgeContextMenu}
              nodeTypes={nodeTypes}
              fitView
              deleteKeyCode={['Delete', 'Backspace']} // Enable edge deletion
              edgesUpdatable={true}
              edgesFocusable={true}
              elementsSelectable={true}
              multiSelectionKeyCode={null} // Disable multi-selection for now
            >
              <Canvas />
            </ReactFlow>
            
            {/* Edge Context Menu */}
            {contextMenu && (
              <div
                style={{
                  position: 'fixed',
                  top: contextMenu.y,
                  left: contextMenu.x,
                  zIndex: 1000,
                  backgroundColor: '#ffffff',
                  border: '1px solid #d5dbdb',
                  borderRadius: '4px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  padding: '4px 0'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  variant="inline-link"
                  onClick={() => handleDeleteEdge(contextMenu.edge.id)}
                  iconName="remove"
                  formAction="none"
                >
                  Delete Connection
                </Button>
              </div>
            )}
          </div>
        </div>
      }
      splitPanel={
        <SplitPanel
          header="Properties"
          closeBehavior="hide"
          i18nStrings={{
            preferencesTitle: "Panel preferences",
            preferencesPositionLabel: "Panel position",
            preferencesPositionDescription: "Choose where to display the panel",
            preferencesPositionSide: "Side",
            preferencesPositionBottom: "Bottom",
            preferencesConfirm: "Confirm",
            preferencesCancel: "Cancel",
            resizeHandleAriaLabel: "Resize panel"
          }}
          splitPanelSize={panelSize}
          onSplitPanelResize={({ detail }) => {
            // Apply responsive constraints based on panel position and screen size
            const newSize = detail.size;
            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;
            
            let constrainedSize = newSize;
            
            if (panelPosition === 'side') {
              // Right-side panel width constraints
              if (screenWidth <= 768) {
                constrainedSize = Math.max(280, Math.min(newSize, screenWidth * 0.9));
              } else if (screenWidth <= 1200) {
                constrainedSize = Math.max(320, Math.min(newSize, 400));
              } else {
                constrainedSize = Math.max(350, Math.min(newSize, 500));
              }
            } else {
              // Bottom panel height constraints
              constrainedSize = Math.max(200, Math.min(newSize, screenHeight * 0.6));
            }
            
            setPanelSize(constrainedSize);
          }}

        >
          <PropertyPanel
            selectedNode={selectedNode}
            onNodeUpdate={handleNodeUpdate}
          />
        </SplitPanel>
      }
      splitPanelOpen={splitPanelOpen}
      onSplitPanelToggle={({ detail }) => setSplitPanelOpen(detail.open)}
    />
    
    {/* Code Generation Panel */}
    <CodeGenerationPanel
      visible={codeGenerationPanelOpen}
      onDismiss={() => setCodeGenerationPanelOpen(false)}
    />
        </div>
      </AuthGuard>
    </ReactFlowProvider>
  );
};

// Main App Component with Routing
function App() {
  return (
    <SettingsProvider>
      <Router>
        <Routes>
          <Route path="/" element={<MainCanvas />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/deployments" element={<DeploymentsPage />} />
        </Routes>
      </Router>
    </SettingsProvider>
  );
}

export default App;
