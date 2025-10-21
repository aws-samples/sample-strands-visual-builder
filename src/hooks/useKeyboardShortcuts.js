import { useEffect } from 'react';
import useBuilderStore from '../store/useBuilderStore';

export function useKeyboardShortcuts() {
  const { 
    selectedNode, 
    clipboard
  } = useBuilderStore();

  useEffect(() => {
    const handleKeyDown = (event) => {
      // Check if user is typing in an input field
      const isTyping = event.target.tagName === 'INPUT' || 
                      event.target.tagName === 'TEXTAREA' || 
                      event.target.contentEditable === 'true' ||
                      event.target.closest('[contenteditable="true"]') ||
                      event.target.closest('input') ||
                      event.target.closest('textarea');
      
      // Get fresh store state and methods
      const store = useBuilderStore.getState();
      
      // Detect platform modifier key (Cmd on Mac, Ctrl on Windows/Linux)
      const modifierKey = event.metaKey || event.ctrlKey;
      const modifierName = event.metaKey ? 'Cmd' : 'Ctrl';
      
      // Debug logging for all key combinations
      if (modifierKey || event.key === 'Delete' || event.key === 'Backspace') {

      }
      const { 
        copyNodes, 
        pasteNodes, 
        undo, 
        redo, 
        deleteNode, 
        reset, 
        canUndo, 
        canRedo,
        setSelectedNode
      } = store;
      
      // Copy selected node with Cmd+C/Ctrl+C (only if not typing)
      if (modifierKey && event.key.toLowerCase() === 'c' && selectedNode && !isTyping) {
        event.preventDefault();

        copyNodes([selectedNode.id]);
      }
      
      // Paste nodes with Cmd+V/Ctrl+V (only if not typing)
      if (modifierKey && event.key.toLowerCase() === 'v' && clipboard && !isTyping) {
        event.preventDefault();

        pasteNodes();
      }
      
      // Undo with Cmd+Z/Ctrl+Z (only if not typing)
      if (modifierKey && !event.shiftKey && event.key.toLowerCase() === 'z' && canUndo() && !isTyping) {
        event.preventDefault();

        undo();
      }
      
      // Redo with Cmd+Y/Ctrl+Y or Cmd+Shift+Z/Ctrl+Shift+Z (only if not typing)
      if (((modifierKey && event.key.toLowerCase() === 'y') || (modifierKey && event.shiftKey && event.key.toLowerCase() === 'z')) && canRedo() && !isTyping) {
        event.preventDefault();

        redo();
      }
      
      // Delete selected node with Delete or Backspace (only if not typing)
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedNode && !isTyping) {
        event.preventDefault();
        deleteNode(selectedNode.id);
      }
      
      // Clear canvas with Cmd+Shift+C/Ctrl+Shift+C
      if (modifierKey && event.shiftKey && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        if (confirm('Clear all nodes and connections?')) {
          reset();
        }
      }
      
      // Escape to deselect (only if not typing)
      if (event.key === 'Escape' && selectedNode && !isTyping) {
        event.preventDefault();
        setSelectedNode(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedNode, clipboard]); // Only depend on state, not functions
}