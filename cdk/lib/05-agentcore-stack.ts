import * as cdk from 'aws-cdk-lib';
import * as bedrockagentcore from 'aws-cdk-lib/aws-bedrockagentcore';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface AgentCoreStackProps extends cdk.StackProps {
  parameterBasePath: string;
}

export class AgentCoreStack extends cdk.Stack {
  public readonly agentCoreRuntime: bedrockagentcore.CfnRuntime;
  public readonly agentCoreExecutionRole: iam.Role;

  constructor(scope: Construct, id: string, props: AgentCoreStackProps) {
    super(scope, id, props);

    const { parameterBasePath } = props;

    // =============================================================================
    // CROSS-STACK REFERENCES VIA SSM
    // =============================================================================

    // Get storage information from Storage stack
    const projectsTableName = ssm.StringParameter.valueFromLookup(this, `${parameterBasePath}/dynamodb/table-name`);
    const userSettingsTableName = ssm.StringParameter.valueFromLookup(this, `${parameterBasePath}/dynamodb/user-settings-table-name`);
    const tempCodeBucketName = ssm.StringParameter.valueFromLookup(this, `${parameterBasePath}/s3/temp-code-bucket`);

    // =============================================================================
    // ECR REPOSITORY REFERENCE
    // =============================================================================

    // Create dedicated ECR repository for AgentCore Runtime
    const agentCoreEcrRepository = new ecr.Repository(this, 'AgentCoreRepository', {
      repositoryName: 'strands-agentcore-runtime',
      imageScanOnPush: true,
      lifecycleRules: [
        {
          description: 'Keep last 10 images',
          maxImageCount: 10,
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development
    });

    // =============================================================================
    // AGENTCORE EXECUTION ROLE
    // =============================================================================

    // IAM role for AgentCore expert agent execution
    this.agentCoreExecutionRole = new iam.Role(this, 'AgentCoreExecutionRole', {
      roleName: `strands-agentcore-execution-role-${this.account}`,
      assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
      description: 'Execution role for Strands AgentCore expert agent',
    });

    // Grant basic execution permissions
    this.agentCoreExecutionRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );

    // Grant S3 permissions for temp code storage (using bucket name from SSM)
    this.agentCoreExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
        's3:ListBucket',
        's3:GetBucketLocation',
        's3:GetBucketCors',
      ],
      resources: [
        `arn:aws:s3:::${tempCodeBucketName}`,
        `arn:aws:s3:::${tempCodeBucketName}/*`,
      ],
    }));

    // Grant DynamoDB permissions (using table names from SSM)
    this.agentCoreExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan',
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${projectsTableName}`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${projectsTableName}/index/*`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${userSettingsTableName}`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${userSettingsTableName}/index/*`,
      ],
    }));

    // Grant Bedrock permissions
    this.agentCoreExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: ['*'],
    }));

    // Grant SSM parameter access
    this.agentCoreExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ssm:GetParameter',
        'ssm:GetParameters',
        'ssm:GetParametersByPath',
      ],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter${parameterBasePath}/*`,
      ],
    }));

    // Grant ECR permissions for AgentCore
    this.agentCoreExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ecr:GetAuthorizationToken',
        'ecr:BatchCheckLayerAvailability',
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage',
      ],
      resources: ['*'],
    }));


    // X-Ray and CloudWatch observability permissions (required by AgentCore runtime)
    this.agentCoreExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'xray:PutTraceSegments',
        'xray:PutTelemetryRecords',
        'xray:GetSamplingRules',
        'xray:GetSamplingTargets',
      ],
      resources: ['*'],
    }));

    this.agentCoreExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*'],
      conditions: {
        StringEquals: {
          'cloudwatch:namespace': 'bedrock-agentcore',
        },
      },
    }));
    // =============================================================================
    // AGENTCORE RUNTIME DEPLOYMENT (HYBRID CDK + CLI APPROACH)
    // =============================================================================

    // AgentCore Runtime - Deploy in PUBLIC mode initially (CloudFormation limitation)
    // deploy.sh will update to VPC mode using AWS CLI (which supports VPC)
    this.agentCoreRuntime = new bedrockagentcore.CfnRuntime(this, 'StrandsAgentCoreRuntime', {
      agentRuntimeName: 'strandsVisualBuilderExpert',
      description: 'Strands Visual Builder Expert Agent (deployed via CDK, updated to VPC by deploy.sh)',
      
      // Container Configuration - Uses dedicated AgentCore ECR repository
      agentRuntimeArtifact: {
        containerConfiguration: {
          containerUri: `${agentCoreEcrRepository.repositoryUri}:latest`
        }
      },
      
      // Start with PUBLIC mode (CloudFormation limitation)
      // deploy.sh will update to VPC mode using AWS CLI
      networkConfiguration: {
        networkMode: 'PUBLIC'
      },
      
      // IAM Role
      roleArn: this.agentCoreExecutionRole.roleArn,
      
      // Environment Variables
      environmentVariables: {
        'AWS_REGION': this.region,
        'PARAMETER_BASE_PATH': parameterBasePath,
        'STRANDS_SYSTEM_PROMPT_S3_URI': `s3://${tempCodeBucketName}/system-prompts/expert-agent-prompt.md`,
        'STRANDS_TOOL_CONSOLE_MODE': 'disabled',
        'BYPASS_TOOL_CONSENT': 'true',
        'PYTHON_REPL_INTERACTIVE': 'false'
      },
      
      // Protocol Configuration
      protocolConfiguration: 'HTTP',
      
      // Tags
      tags: {
        'Environment': 'production',
        'Service': 'strands-visual-builder',
        'ManagedBy': 'CDK-CLI-Hybrid',
        'DeploymentMethod': 'CDK-PUBLIC-then-CLI-VPC'
      }
    });

    // =============================================================================
    // SSM PARAMETERS FOR CROSS-STACK COMMUNICATION
    // =============================================================================

    // Store AgentCore Runtime information in SSM for CLI update
    const agentCoreRuntimeIdParameter = new ssm.StringParameter(this, 'AgentCoreRuntimeIdParameter', {
      parameterName: `${parameterBasePath}/agentcore/runtime-id`,
      stringValue: this.agentCoreRuntime.attrAgentRuntimeId,
      description: 'AgentCore Runtime ID for CLI VPC update',
      simpleName: false,
    });

    const agentCoreRuntimeArnParameter = new ssm.StringParameter(this, 'AgentCoreRuntimeArnParameter', {
      parameterName: `${parameterBasePath}/agentcore/runtime-arn`,
      stringValue: this.agentCoreRuntime.attrAgentRuntimeArn,
      description: 'AgentCore Runtime ARN (stable across VPC updates)',
      simpleName: false,
    });

    const agentCoreExecutionRoleArnParameter = new ssm.StringParameter(this, 'AgentCoreExecutionRoleArnParameter', {
      parameterName: `${parameterBasePath}/iam/agentcore-execution-role-arn`,
      stringValue: this.agentCoreExecutionRole.roleArn,
      description: 'IAM role ARN for AgentCore expert agent execution',
      simpleName: false,
    });

    // Strands Tools Configuration Parameters
    const strandsToolConsoleModeParameter = new ssm.StringParameter(this, 'StrandsToolConsoleModeParameter', {
      parameterName: `${parameterBasePath}/strands/tool-console-mode`,
      stringValue: 'disabled',
      description: 'Strands tool console mode setting',
      simpleName: false,
    });

    const bypassToolConsentParameter = new ssm.StringParameter(this, 'BypassToolConsentParameter', {
      parameterName: `${parameterBasePath}/strands/bypass-tool-consent`,
      stringValue: 'true',
      description: 'Bypass tool consent for Strands tools',
      simpleName: false,
    });

    const pythonReplInteractiveParameter = new ssm.StringParameter(this, 'PythonReplInteractiveParameter', {
      parameterName: `${parameterBasePath}/strands/python-repl-interactive`,
      stringValue: 'false',
      description: 'Python REPL interactive mode setting',
      simpleName: false,
    });

    // =============================================================================
    // OUTPUTS
    // =============================================================================

    // AgentCore Runtime outputs
    new cdk.CfnOutput(this, 'AgentCoreRuntimeArn', {
      value: this.agentCoreRuntime.attrAgentRuntimeArn,
      description: 'AgentCore Runtime ARN (stable across VPC updates)',
      exportName: 'StrandsAgentCore-RuntimeArn',
    });

    new cdk.CfnOutput(this, 'AgentCoreRuntimeId', {
      value: this.agentCoreRuntime.attrAgentRuntimeId,
      description: 'AgentCore Runtime ID for CLI operations',
      exportName: 'StrandsAgentCore-RuntimeId',
    });

    new cdk.CfnOutput(this, 'AgentCoreExecutionRoleArn', {
      value: this.agentCoreExecutionRole.roleArn,
      description: 'AgentCore Execution Role ARN',
      exportName: 'StrandsAgentCore-ExecutionRoleArn',
    });
  }
}