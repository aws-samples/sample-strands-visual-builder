// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import React, { useState, useEffect } from 'react';
import {
  Container,
  Header,
  SpaceBetween,
  FormField,
  Input,
  Select,
  Button,
  StatusIndicator,
  Alert
} from '@cloudscape-design/components';
import { authService } from '../../services/authService.js';
import ToolSchemaEditor from './ToolSchemaEditor';
import PermissionGuide from './PermissionGuide';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

const LambdaTargetForm = ({ gateways, onTargetCreated }) => {
  const [selectedGateway, setSelectedGateway] = useState(null);
  const [lambdaFunctions, setLambdaFunctions] = useState([]);
  const [selectedLambda, setSelectedLambda] = useState(null);
  const [toolSchema, setToolSchema] = useState('');
  const [targetName, setTargetName] = useState('');
  const [loadingLambdas, setLoadingLambdas] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [createdTarget, setCreatedTarget] = useState(null);

  // Load Lambda functions on mount
  useEffect(() => {
    loadLambdaFunctions();
  }, []);

  const loadLambdaFunctions = async () => {
    try {
      setLoadingLambdas(true);
      const token = await authService.getToken();
      const response = await fetch(`${apiBaseUrl}/api/gateway-management/lambda/list`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('Failed to load Lambda functions');

      const data = await response.json();
      const functions = (data.functions || []).map(fn => ({
        label: fn.FunctionName || fn.function_name,
        value: fn.FunctionArn || fn.function_arn,
        description: fn.Description || fn.description || ''
      }));
      setLambdaFunctions(functions);
    } catch (err) {
      console.error('Failed to load Lambda functions');
    } finally {
      setLoadingLambdas(false);
    }
  };

  const gatewayOptions = (gateways || []).map(gw => ({
    label: gw.name || gw.gateway_id,
    value: gw.gateway_id,
    description: gw.status || ''
  }));

  const handleCreate = async () => {
    if (!selectedGateway || !selectedLambda) return;

    // Validate tool schema JSON if provided
    if (toolSchema.trim()) {
      try {
        JSON.parse(toolSchema);
      } catch (e) {
        setError('Tool schema must be valid JSON');
        return;
      }
    }

    try {
      setCreating(true);
      setError(null);
      setCreatedTarget(null);

      const token = await authService.getToken();
      const body = {
        gateway_id: selectedGateway.value,
        lambda_arn: selectedLambda.value,
        tool_schemas: toolSchema.trim() || undefined,
        target_name: targetName.trim() || undefined
      };

      const response = await fetch(`${apiBaseUrl}/api/gateway-management/target/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || `Failed to add target: ${response.statusText}`);
      }

      const data = await response.json();
      setCreatedTarget(data);
      setToolSchema('');
      setTargetName('');
      if (onTargetCreated) onTargetCreated(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Container
      header={
        <Header variant="h2" description="Attach a Lambda function as a gateway target">
          Add Lambda Target
        </Header>
      }
    >
      <SpaceBetween size="l">
        <FormField label="Gateway" description="Select the gateway to add a target to">
          <Select
            selectedOption={selectedGateway}
            onChange={({ detail }) => setSelectedGateway(detail.selectedOption)}
            options={gatewayOptions}
            placeholder="Select a gateway"
            empty="No gateways available. Create one first."
            disabled={creating}
          />
        </FormField>

        <FormField label="Lambda Function" description="Select the Lambda function to attach">
          <Select
            selectedOption={selectedLambda}
            onChange={({ detail }) => setSelectedLambda(detail.selectedOption)}
            options={lambdaFunctions}
            placeholder={loadingLambdas ? 'Loading Lambda functions...' : 'Select a Lambda function'}
            filteringType="auto"
            empty="No Lambda functions found in this region"
            disabled={creating || loadingLambdas}
            loadingText="Loading Lambda functions..."
            statusType={loadingLambdas ? 'loading' : 'finished'}
          />
        </FormField>

        <ToolSchemaEditor
          value={toolSchema}
          onChange={setToolSchema}
          disabled={creating}
        />

        <FormField
          label="Target Name"
          description="Optional name for this target"
        >
          <Input
            value={targetName}
            onChange={({ detail }) => setTargetName(detail.value)}
            placeholder="my-lambda-target"
            disabled={creating}
          />
        </FormField>

        {error && (
          <Alert type="error" dismissible onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Button
          variant="primary"
          onClick={handleCreate}
          loading={creating}
          disabled={!selectedGateway || !selectedLambda}
        >
          Add Target
        </Button>

        {createdTarget && (
          <SpaceBetween size="m">
            <StatusIndicator type={createdTarget.status === 'READY' ? 'success' : 'in-progress'}>
              Target: {createdTarget.status || 'CREATING'}
            </StatusIndicator>

            {createdTarget.permission_command && (
              <PermissionGuide
                permissionCommand={createdTarget.permission_command}
                gatewayId={selectedGateway?.value}
                targetId={createdTarget.target_id}
              />
            )}
          </SpaceBetween>
        )}
      </SpaceBetween>
    </Container>
  );
};

export default LambdaTargetForm;
