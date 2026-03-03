#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { StrandsStacksOrchestrator } from '../lib/strands-stacks-orchestrator';

const app = new cdk.App();

// Get deployment mode from context or environment variable
const deploymentMode = app.node.tryGetContext('deploymentMode') || process.env.CDK_DEPLOYMENT_MODE || 'all';

// Common environment configuration
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// Use the orchestrator for all deployment modes
new StrandsStacksOrchestrator(app, 'StrandsOrchestrator', {
  env,
  deploymentMode: deploymentMode as any,
});
