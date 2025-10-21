import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  TopNavigation,
  ButtonDropdown,
  Button,
  SpaceBetween
} from '@cloudscape-design/components';
import SaveProjectModal from './SaveProjectModal';
import LoadProjectModal from './LoadProjectModal';
import useBuilderStore from '../store/useBuilderStore';

const TopBar = ({ title }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [loadModalVisible, setLoadModalVisible] = useState(false);
  const { 
    user, 
    isAuthenticated, 
    authLoading, 
    signOut,
    selectedNode,
    clipboard,
    canUndo,
    canRedo,
    copyNodes,
    pasteNodes,
    undo,
    redo,
    deleteNode
  } = useBuilderStore();

  const handleSignOut = async () => {

    try {
      await signOut();
    } catch (error) {
      console.error('TopBar: signOut error');
    }
  };

  const getUserDisplayName = () => {
    if (!user) return 'User';
    return user.email || user.username || 'User';
  };

  const handleEditAction = ({ detail }) => {
    switch (detail.id) {
      case 'copy':
        if (selectedNode) {
          copyNodes([selectedNode.id]);
        }
        break;
      case 'paste':
        if (clipboard) {
          pasteNodes();
        }
        break;
      case 'delete':
        if (selectedNode) {
          deleteNode(selectedNode.id);
        }
        break;
      case 'undo':
        if (canUndo()) {
          undo();
        }
        break;
      case 'redo':
        if (canRedo()) {
          redo();
        }
        break;
      default:
        break;
    }
  };

  const utilities = [
    // Edit menu (only show on main canvas)
    ...(location.pathname === '/' ? [
      {
        type: "menu-dropdown",
        iconName: "edit",
        ariaLabel: "Edit menu",
        items: [
          {
            id: "copy",
            text: "Copy",
            disabled: !selectedNode,
            iconName: "copy",
            description: navigator.platform.includes('Mac') ? "Cmd+C" : "Ctrl+C"
          },
          {
            id: "paste",
            text: "Paste",
            disabled: !clipboard,
            iconName: "upload",
            description: navigator.platform.includes('Mac') ? "Cmd+V" : "Ctrl+V"
          },
          {
            id: "delete",
            text: "Delete",
            disabled: !selectedNode,
            iconName: "remove",
            description: "Delete"
          },
          {
            id: "divider-1",
            itemType: "divider"
          },
          {
            id: "undo",
            text: "Undo",
            disabled: !canUndo(),
            iconName: "undo",
            description: navigator.platform.includes('Mac') ? "Cmd+Z" : "Ctrl+Z"
          },
          {
            id: "redo",
            text: "Redo",
            disabled: !canRedo(),
            iconName: "redo",
            description: navigator.platform.includes('Mac') ? "Cmd+Y" : "Ctrl+Y"
          }
        ],
        onItemClick: handleEditAction
      }
    ] : []),
    // Project management buttons (only show when authenticated)
    ...(isAuthenticated ? [
      {
        type: "button",
        iconName: "download",
        ariaLabel: "Save project",
        onClick: () => setSaveModalVisible(true)
      },
      {
        type: "button", 
        iconName: "folder-open",
        ariaLabel: "Load saved designs",
        onClick: () => setLoadModalVisible(true)
      }
    ] : []),
    // AgentCore deployments (only show when authenticated)
    ...(isAuthenticated ? [
      {
        type: "button",
        iconName: "status-positive",
        ariaLabel: "AgentCore Deployments",
        text: "Deployments",
        onClick: () => navigate('/deployments')
      }
    ] : []),
    {
      type: "button",
      iconName: "settings",
      ariaLabel: "Open settings",
      onClick: () => navigate('/settings')
    }
  ];

  // Add user menu if authenticated
  if (isAuthenticated && user) {
    utilities.push({
      type: "menu-dropdown",
      iconName: "user-profile",
      ariaLabel: "User menu",
      text: getUserDisplayName(),
      items: [
        {
          id: "user-info",
          text: `Signed in as ${getUserDisplayName()}`,
          disabled: true
        },
        {
          id: "divider-1",
          itemType: "divider"
        },
        {
          id: "sign-out",
          text: "Sign Out"
        }
      ],
      onItemClick: ({ detail }) => {

        if (detail.id === 'sign-out') {
          handleSignOut();
        }
      }
    });
  }

  return (
    <>
      <TopNavigation
        identity={{
          href: "/",
          title: title || "Strands Visual Builder",
          onClick: (e) => {
            e.preventDefault();
            navigate('/');
          }
        }}
        utilities={utilities}
      />
      
      <SaveProjectModal
        visible={saveModalVisible}
        onDismiss={() => setSaveModalVisible(false)}
      />
      
      <LoadProjectModal
        visible={loadModalVisible}
        onDismiss={() => setLoadModalVisible(false)}
      />
    </>
  );
};

export default TopBar;