import React, { useState } from 'react';
import {
  Modal,
  Box,
  SpaceBetween,
  Button,
  FormField,
  Input,
  Alert
} from '@cloudscape-design/components';
import useBuilderStore from '../store/useBuilderStore';

const SaveProjectModal = ({ visible, onDismiss }) => {
  const [projectName, setProjectName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const { saveProject, nodes, edges, viewport } = useBuilderStore();

  const handleSave = async () => {
    if (!projectName.trim()) {
      setError('Project name is required');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await saveProject(projectName.trim(), { nodes, edges, viewport });
      
      if (result.success) {
        setSuccess(`Design "${projectName}" saved successfully!`);
        setProjectName('');
        
        // Auto-close after success
        setTimeout(() => {
          setSuccess('');
          onDismiss();
        }, 2000);
      } else {
        setError(result.error || 'Failed to save design');
      }
    } catch (err) {
      console.error('Save project error');
      setError('Failed to save design. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    if (!loading) {
      setProjectName('');
      setError('');
      setSuccess('');
      onDismiss();
    }
  };

  return (
    <Modal
      onDismiss={handleDismiss}
      visible={visible}
      closeAriaLabel="Close save design modal"
      size="medium"
      header="Save Design"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button 
              variant="link" 
              onClick={handleDismiss}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button 
              variant="primary" 
              onClick={handleSave}
              loading={loading}
              disabled={!projectName.trim()}
            >
              Save Design
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween direction="vertical" size="l">
        {error && (
          <Alert type="error" dismissible onDismiss={() => setError('')}>
            {error}
          </Alert>
        )}
        
        {success && (
          <Alert type="success" dismissible onDismiss={() => setSuccess('')}>
            {success}
          </Alert>
        )}

        <FormField
          label="Design Name"
          description="Enter a name for your agent design"
        >
          <Input
            value={projectName}
            onChange={({ detail }) => setProjectName(detail.value)}
            placeholder="My Agent Design"
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && projectName.trim() && !loading) {
                handleSave();
              }
            }}
          />
        </FormField>

        <Box>
          <strong>What will be saved:</strong>
          <ul>
            <li>All agents and their configurations ({nodes.filter(n => n.type === 'agent').length} agents)</li>
            <li>All tools and connections ({nodes.filter(n => n.type === 'tool').length} tools, {edges.length} connections)</li>
            <li>Canvas layout and positioning</li>
            <li>Generated code (if any)</li>
          </ul>
        </Box>
      </SpaceBetween>
    </Modal>
  );
};

export default SaveProjectModal;