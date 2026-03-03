// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import React, { useState } from 'react';
import {
  SpaceBetween,
  Textarea,
  Button,
  FormField,
  Box
} from '@cloudscape-design/components';

const EXAMPLE_SCHEMA = JSON.stringify([
  {
    toolSchema: {
      name: "my_tool",
      description: "Describe what this tool does",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            input: {
              type: "string",
              description: "The input parameter"
            }
          },
          required: ["input"]
        }
      }
    }
  }
], null, 2);

const ToolSchemaEditor = ({ value, onChange, disabled }) => {
  const [jsonError, setJsonError] = useState(null);

  const handleChange = (newValue) => {
    onChange(newValue);
    // Clear error while typing
    if (jsonError) setJsonError(null);
  };

  const handleBlur = () => {
    if (!value || value.trim() === '') {
      setJsonError(null);
      return;
    }
    try {
      JSON.parse(value);
      setJsonError(null);
    } catch (e) {
      setJsonError(`Invalid JSON: ${e.message}`);
    }
  };

  const handleLoadExample = () => {
    onChange(EXAMPLE_SCHEMA);
    setJsonError(null);
  };

  return (
    <FormField
      label="Tool Schema (JSON)"
      description="Define the tool schemas for this Lambda target"
      errorText={jsonError}
    >
      <SpaceBetween size="xs">
        <Textarea
          value={value || ''}
          onChange={({ detail }) => handleChange(detail.value)}
          onBlur={handleBlur}
          placeholder='[{"toolSchema": {"name": "...", "description": "...", "inputSchema": {...}}}]'
          rows={10}
          disabled={disabled}
        />
        <Box>
          <Button
            variant="inline-link"
            onClick={handleLoadExample}
            disabled={disabled}
          >
            Load Example Schema
          </Button>
        </Box>
      </SpaceBetween>
    </FormField>
  );
};

export default ToolSchemaEditor;
