#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { StrandsStacksOrchestrator } from '../lib/strands-stacks-orchestrator';
import { StrandsVisualBuilderStack } from '../lib/strands-visual-builder-stack';

const app = new cdk.App();

// Get deployment mode from context or environment variable
const deploymentMode = app.node.tryGetContext('deploymentMode') || process.env.CDK_DEPLOYMENT_MODE || 'all';

// Common environment configuration
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// Deploy based on mode
if (deploymentMode === 'legacy') {
  // Keep the old monolithic stack for backward compatibility
  new StrandsVisualBuilderStack(app, 'StrandsVisualBuilderStack', {
    env,
    description: 'Infrastructure for Strands Visual Builder - Monolithic Stack (Legacy)'
  });
} else {
  // Use the orchestrator for all other modes (including individual stacks)
  const orchestrator = new StrandsStacksOrchestrator(app, 'StrandsOrchestrator', {
    env,
    deploymentMode: deploymentMode as any,
  });
}