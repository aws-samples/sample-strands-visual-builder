// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppLayout,
  BreadcrumbGroup,
  SpaceBetween,
  Container,
  Header,
  Table,
  StatusIndicator,
  Box,
  Alert,
  Badge,
  ExpandableSection
} from '@cloudscape-design/components';
import { authService } from '../services/authService.js';
import GatewayCreationForm from '../components/gateway/GatewayCreationForm';
import LambdaTargetForm from '../components/gateway/LambdaTargetForm';
import '../styles/layout.css';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

export default function GatewayManagementPage() {
  const navigate = useNavigate();
  const [gateways, setGateways] = useState([]);
  const [targets, setTargets] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const breadcrumbs = [
    { text: 'Home', href: '/' },
    { text: 'Gateway Management', href: '/gateway' }
  ];

  const loadGateways = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const token = await authService.getToken();
      const response = await fetch(`${apiBaseUrl}/api/gateway-management/list`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error(`Failed to load gateways: ${response.statusText}`);

      const data = await response.json();
      setGateways(data.gateways || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTargets = useCallback(async (gatewayId) => {
    try {
      const token = await authService.getToken();
      const response = await fetch(`${apiBaseUrl}/api/gateway-management/targets/${gatewayId}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) return;

      const data = await response.json();
      setTargets(prev => ({ ...prev, [gatewayId]: data.targets || [] }));
    } catch (err) {
      console.error('Failed to load targets for gateway', gatewayId);
    }
  }, []);

  useEffect(() => {
    loadGateways();
  }, [loadGateways]);

  // Load targets for each gateway
  useEffect(() => {
    gateways.forEach(gw => {
      if (gw.gateway_id && !targets[gw.gateway_id]) {
        loadTargets(gw.gateway_id);
      }
    });
  }, [gateways, loadTargets, targets]);

  const handleGatewayCreated = () => {
    loadGateways();
  };

  const handleTargetCreated = () => {
    // Reload targets for all gateways
    gateways.forEach(gw => {
      if (gw.gateway_id) loadTargets(gw.gateway_id);
    });
  };

  const getStatusType = (status) => {
    switch (status?.toUpperCase()) {
      case 'READY': return 'success';
      case 'CREATING': return 'in-progress';
      case 'UPDATING': return 'in-progress';
      case 'FAILED': return 'error';
      default: return 'info';
    }
  };

  return (
    <AppLayout
      breadcrumbs={<BreadcrumbGroup items={breadcrumbs} />}
      content={
        <SpaceBetween size="l">
          {error && (
            <Alert type="error" dismissible onDismiss={() => setError(null)}>
              {error}
            </Alert>
          )}

          <GatewayCreationForm onGatewayCreated={handleGatewayCreated} />

          <LambdaTargetForm
            gateways={gateways}
            onTargetCreated={handleTargetCreated}
          />

          {/* Existing Gateways */}
          <Container
            header={
              <Header
                variant="h2"
                counter={`(${gateways.length})`}
                description="Your AgentCore Gateways and their targets"
              >
                Gateways
              </Header>
            }
          >
            <Table
              items={gateways}
              loading={loading}
              loadingText="Loading gateways..."
              empty={
                <Box textAlign="center" padding="l">
                  <Box variant="p" color="text-body-secondary">
                    No gateways found. Create one above to get started.
                  </Box>
                </Box>
              }
              columnDefinitions={[
                {
                  id: 'name',
                  header: 'Name',
                  cell: item => item.name || item.gateway_id,
                  sortingField: 'name'
                },
                {
                  id: 'status',
                  header: 'Status',
                  cell: item => (
                    <StatusIndicator type={getStatusType(item.status)}>
                      {item.status || 'UNKNOWN'}
                    </StatusIndicator>
                  )
                },
                {
                  id: 'gateway_id',
                  header: 'Gateway ID',
                  cell: item => <Box variant="code">{item.gateway_id}</Box>
                },
                {
                  id: 'targets',
                  header: 'Targets',
                  cell: item => {
                    const gwTargets = targets[item.gateway_id] || [];
                    return <Badge>{gwTargets.length}</Badge>;
                  }
                },
                {
                  id: 'endpoint',
                  header: 'Endpoint',
                  cell: item => item.endpoint_url
                    ? <Box variant="small">{item.endpoint_url}</Box>
                    : '-'
                }
              ]}
              variant="embedded"
            />

            {/* Expandable target details per gateway */}
            {gateways.map(gw => {
              const gwTargets = targets[gw.gateway_id] || [];
              if (gwTargets.length === 0) return null;
              return (
                <ExpandableSection
                  key={gw.gateway_id}
                  headerText={`Targets for ${gw.name || gw.gateway_id} (${gwTargets.length})`}
                  variant="footer"
                >
                  <Table
                    items={gwTargets}
                    columnDefinitions={[
                      {
                        id: 'name',
                        header: 'Target Name',
                        cell: item => item.name || item.target_id
                      },
                      {
                        id: 'status',
                        header: 'Status',
                        cell: item => (
                          <StatusIndicator type={getStatusType(item.status)}>
                            {item.status || 'UNKNOWN'}
                          </StatusIndicator>
                        )
                      },
                      {
                        id: 'lambda_arn',
                        header: 'Lambda ARN',
                        cell: item => <Box variant="code">{item.lambda_arn || '-'}</Box>
                      }
                    ]}
                    variant="embedded"
                  />
                </ExpandableSection>
              );
            })}
          </Container>
        </SpaceBetween>
      }
      navigationHide={true}
      toolsHide={true}
    />
  );
}
