import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { FoundationStack } from './01-foundation-stack';
import { StorageStack } from './02-storage-stack';
import { AuthStack } from './03-auth-stack';
import { BackendStack } from './04-backend-stack';
import { AgentCoreStack } from './05-agentcore-stack';
import { FrontendStack } from './06-frontend-stack';

export interface StrandsStacksOrchestratorProps extends cdk.StackProps {
  deploymentMode?: 'all' | 'foundation' | 'storage' | 'auth' | 'backend' | 'agentcore' | 'frontend';
}

export class StrandsStacksOrchestrator extends Construct {
  public readonly foundationStack?: FoundationStack;
  public readonly storageStack?: StorageStack;
  public readonly authStack?: AuthStack;
  public readonly backendStack?: BackendStack;
  public readonly agentCoreStack?: AgentCoreStack;
  public readonly frontendStack?: FrontendStack;

  constructor(scope: Construct, id: string, props: StrandsStacksOrchestratorProps = {}) {
    super(scope, id);

    const { deploymentMode = 'all', ...stackProps } = props;
    
    // Common configuration - get account from environment since we're not in a stack yet
    const account = stackProps.env?.account || process.env.CDK_DEFAULT_ACCOUNT;
    const parameterBasePath = `/strands-visual-builder/${account}`;

    // Deploy stacks based on mode
    if (deploymentMode === 'all' || deploymentMode === 'foundation') {
      this.foundationStack = new FoundationStack(scope, 'StrandsFoundationStack', {
        ...stackProps,
        parameterBasePath,
        stackName: 'strands-foundation-stack',
        description: 'Strands Visual Builder - Foundation Infrastructure (VPC, Security Groups)',
      });
    }

    if (deploymentMode === 'all' || deploymentMode === 'storage') {
      this.storageStack = new StorageStack(scope, 'StrandsStorageStack', {
        ...stackProps,
        parameterBasePath,
        stackName: 'strands-storage-stack',
        description: 'Strands Visual Builder - Storage Infrastructure (DynamoDB, S3)',
      });
    }

    if (deploymentMode === 'all' || deploymentMode === 'auth') {
      this.authStack = new AuthStack(scope, 'StrandsAuthStack', {
        ...stackProps,
        parameterBasePath,
        stackName: 'strands-auth-stack',
        description: 'Strands Visual Builder - Authentication Infrastructure (Cognito)',
      });
    }

    if (deploymentMode === 'all' || deploymentMode === 'backend') {
      this.backendStack = new BackendStack(scope, 'StrandsBackendStack', {
        ...stackProps,
        parameterBasePath,
        stackName: 'strands-backend-stack',
        description: 'Strands Visual Builder - Backend Infrastructure (App Runner + ECS/ALB)',
        // Pass direct resource references to avoid SSM lookup timing issues
        projectsTable: this.storageStack?.projectsTable,
        userSettingsTable: this.storageStack?.userSettingsTable,
        tempCodeBucket: this.storageStack?.tempCodeBucket,
        backendEcrRepository: this.storageStack?.backendEcrRepository,
        userPoolArn: this.authStack?.userPool.userPoolArn,
        // Pass VPC information directly from foundation stack
        vpc: this.foundationStack?.vpc,

      });

      // Add dependencies
      if (this.foundationStack) {
        this.backendStack.addDependency(this.foundationStack);
      }
      if (this.storageStack) {
        this.backendStack.addDependency(this.storageStack);
      }
      if (this.authStack) {
        this.backendStack.addDependency(this.authStack);
      }
    }

    // AgentCore deployment is handled by the starter toolkit in deploy.sh
    // No CDK stack needed for AgentCore Runtime

    if (deploymentMode === 'all' || deploymentMode === 'frontend') {
      this.frontendStack = new FrontendStack(scope, 'StrandsFrontendStack', {
        ...stackProps,
        parameterBasePath,
        frontendBucket: this.storageStack?.frontendBucket,
        stackName: 'strands-frontend-stack',
        description: 'Strands Visual Builder - Frontend Infrastructure (CloudFront)',
      });

      // Add dependencies
      if (this.storageStack) {
        this.frontendStack.addDependency(this.storageStack);
      }
      if (this.backendStack) {
        this.frontendStack.addDependency(this.backendStack);
      }
    }
  }
}