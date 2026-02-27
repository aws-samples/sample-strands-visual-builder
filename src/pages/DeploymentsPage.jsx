/**
 * AgentCore Deployments Page
 * Clean chat interface with agent selection
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AgentCoreChatInterface from '../components/AgentCoreChatInterface';
import { 
  AppLayout,
  BreadcrumbGroup,
  Container, 
  Header,
  Box,
  Select, 
  SpaceBetween,
  Alert,
  StatusIndicator
} from '@cloudscape-design/components';
import { authService } from '../services/authService.js';
import '../styles/layout.css';

export default function DeploymentsPage() {
  const navigate = useNavigate();
  const [deployments, setDeployments] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const addNotification = (notification) => {

  };

  const breadcrumbs = [
    { text: 'Home', href: '/' },
    { text: 'Deployed Agents', href: '/deployments' }
  ];

  // Load deployments from backend
  useEffect(() => {
    const loadDeployments = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
        
        // Get authentication token
        const token = await authService.getToken();
        const headers = {};
        
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        
        const response = await fetch(`${apiBaseUrl}/api/agentcore/deployments`, {
          method: 'GET',
          headers
        });
        if (!response.ok) {
          throw new Error(`Failed to load deployments: ${response.statusText}`);
        }
        
        const data = await response.json();
        const deploymentOptions = data.deployments.map(deployment => ({
          label: deployment.agentRuntimeName || deployment.agent_runtime_arn.split('/').pop(),
          value: deployment.agent_runtime_arn
        }));
        
        setDeployments(deploymentOptions);
        
        // Auto-select first deployment if available
        if (deploymentOptions.length > 0) {
          setSelectedAgent(deploymentOptions[0]);
        }
        
      } catch (err) {
        console.error('Failed to load deployments');
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadDeployments();
  }, []);

  return (
    <AppLayout
      breadcrumbs={<BreadcrumbGroup items={breadcrumbs} />}
      content={
        <SpaceBetween size="l">
          {/* Agent Selection */}
          <Container
            header={
              <Header variant="h1">
                Deployed Agents
              </Header>
            }
          >
            <SpaceBetween size="m">
              {loading && (
                <StatusIndicator type="loading">Loading deployments...</StatusIndicator>
              )}
              
              {error && (
                <Alert type="error" dismissible onDismiss={() => setError(null)}>
                  {error}
                </Alert>
              )}
              
              {!loading && !error && (
                <Select
                  selectedOption={selectedAgent}
                  onChange={({ detail }) => setSelectedAgent(detail.selectedOption)}
                  options={deployments}
                  placeholder="Choose a deployed agent"
                  empty="No deployed agents found"
                  disabled={loading || deployments.length === 0}
                />
              )}
              

            </SpaceBetween>
          </Container>

          {/* Chat Interface */}
          {selectedAgent ? (
            <AgentCoreChatInterface 
              key={selectedAgent.value} // Force remount when agent changes
              agentRuntimeArn={selectedAgent.value}
              agentName={selectedAgent.label}
              addNotification={addNotification}
            />
          ) : !loading && deployments.length === 0 ? (
            <Container>
              <Box textAlign="center" padding="l">
                <Box variant="p" color="text-body-secondary">
                  No deployed agents found. Deploy an agent from the canvas first.
                </Box>
              </Box>
            </Container>
          ) : null}
        </SpaceBetween>
      }
      navigationHide={true}
      toolsHide={true}
    />
  );
}