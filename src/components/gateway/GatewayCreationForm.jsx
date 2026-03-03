// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import React, { useState } from 'react';
import {
  Container,
  Header,
  SpaceBetween,
  FormField,
  Input,
  Textarea,
  Button,
  StatusIndicator,
  Box,
  ColumnLayout
} from '@cloudscape-design/components';
import { authService } from '../../services/authService.js';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

const GatewayCreationForm = ({ onGatewayCreated }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [createdGateway, setCreatedGateway] = useState(null);

  const validateName = (value) => {
    if (!value || value.trim() === '') return 'Gateway name is required';
    if (value.length > 100) return 'Name must be 100 characters or less';
    if (!/^[a-zA-Z0-9-]+$/.test(value)) return 'Only alphanumeric characters and hyphens allowed';
    return null;
  };

  const handleNameChange = (value) => {
    setName(value);
    setNameError(validateName(value));
  };

  const handleCreate = async () => {
    const validationError = validateName(name);
    if (validationError) {
      setNameError(validationError);
      return;
    }

    try {
      setCreating(true);
      setError(null);

      const token = await authService.getToken();
      const response = await fetch(`${apiBaseUrl}/api/gateway-management/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: name.trim(), description: description.trim() })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || `Failed to create gateway: ${response.statusText}`);
      }

      const data = await response.json();
      setCreatedGateway(data);
      setName('');
      setDescription('');
      if (onGatewayCreated) onGatewayCreated(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Container
      header={
        <Header variant="h2" description="Create a new AgentCore Gateway for your Lambda tools">
          Create Gateway
        </Header>
      }
    >
      <SpaceBetween size="l">
        <ColumnLayout columns={2}>
          <FormField
            label="Gateway Name"
            description="Alphanumeric characters and hyphens only"
            errorText={nameError}
            constraintText="Max 100 characters"
          >
            <Input
              value={name}
              onChange={({ detail }) => handleNameChange(detail.value)}
              placeholder="my-gateway"
              disabled={creating}
            />
          </FormField>
          <FormField
            label="Description"
            description="Optional description for this gateway"
          >
            <Textarea
              value={description}
              onChange={({ detail }) => setDescription(detail.value)}
              placeholder="Gateway for my Lambda tools"
              rows={1}
              disabled={creating}
            />
          </FormField>
        </ColumnLayout>

        {error && (
          <StatusIndicator type="error">{error}</StatusIndicator>
        )}

        <Button
          variant="primary"
          onClick={handleCreate}
          loading={creating}
          disabled={!name.trim() || !!nameError}
        >
          Create Gateway
        </Button>

        {createdGateway && (
          <Box padding="s">
            <SpaceBetween size="s">
              <StatusIndicator type={createdGateway.status === 'READY' ? 'success' : 'in-progress'}>
                {createdGateway.status || 'CREATING'}
              </StatusIndicator>
              <Box variant="small">
                <strong>Gateway ID:</strong> {createdGateway.gateway_id}
              </Box>
              {createdGateway.endpoint_url && (
                <Box variant="small">
                  <strong>Endpoint:</strong> {createdGateway.endpoint_url}
                </Box>
              )}
            </SpaceBetween>
          </Box>
        )}
      </SpaceBetween>
    </Container>
  );
};

export default GatewayCreationForm;
