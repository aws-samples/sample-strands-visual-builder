// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import React, { useState } from 'react';
import {
  Alert,
  SpaceBetween,
  Button,
  Box,
  StatusIndicator,
  CopyToClipboard
} from '@cloudscape-design/components';
import { authService } from '../../services/authService.js';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

const PermissionGuide = ({ permissionCommand, gatewayId, targetId }) => {
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  const handleVerify = async () => {
    try {
      setVerifying(true);
      setVerifyResult(null);

      const token = await authService.getToken();
      const response = await fetch(
        `${apiBaseUrl}/api/gateway-management/target/verify/${gatewayId}/${targetId}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      const data = await response.json();
      if (response.ok && data.verified) {
        setVerifyResult({ success: true, message: 'Lambda connected successfully' });
      } else {
        setVerifyResult({
          success: false,
          message: data.error || 'Permission not yet granted. Please run the command above.'
        });
      }
    } catch (err) {
      setVerifyResult({ success: false, message: err.message || 'Verification failed' });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Alert
      type="warning"
      header="Action Required: Grant gateway access to your Lambda"
    >
      <SpaceBetween size="m">
        <Box variant="p">
          Your Lambda needs to allow the gateway to invoke it.
          Run this command in your terminal or AWS CloudShell:
        </Box>
        <Box
          padding="s"
          variant="code"
        >
          <SpaceBetween size="xs" direction="horizontal" alignItems="center">
            <Box variant="code" fontSize="body-s">
              {permissionCommand}
            </Box>
            <CopyToClipboard
              copyButtonAriaLabel="Copy command"
              copyErrorText="Failed to copy"
              copySuccessText="Command copied"
              textToCopy={permissionCommand}
            />
          </SpaceBetween>
        </Box>
        <SpaceBetween size="s" direction="horizontal" alignItems="center">
          <Button
            onClick={handleVerify}
            loading={verifying}
          >
            Verify Connection
          </Button>
          {verifyResult && (
            <StatusIndicator type={verifyResult.success ? 'success' : 'error'}>
              {verifyResult.message}
            </StatusIndicator>
          )}
        </SpaceBetween>
      </SpaceBetween>
    </Alert>
  );
};

export default PermissionGuide;
