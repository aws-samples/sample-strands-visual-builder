import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface FoundationStackProps extends cdk.StackProps {
  parameterBasePath: string;
}

export class FoundationStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly agentCoreSecurityGroup: ec2.SecurityGroup;
  public readonly appRunnerSecurityGroup: ec2.SecurityGroup;
  public readonly agentCoreExecutionRole: iam.Role;

  constructor(scope: Construct, id: string, props: FoundationStackProps) {
    super(scope, id, props);

    const { parameterBasePath } = props;

    // =============================================================================
    // VPC INFRASTRUCTURE
    // =============================================================================

    // Create VPC for AgentCore Runtime and App Runner connectivity
    this.vpc = new ec2.Vpc(this, 'StrandsVPC', {
      vpcName: 'strands-visual-builder-vpc',
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2, // Use 2 AZs for high availability
      natGateways: 1, // Single NAT Gateway for cost optimization
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    // =============================================================================
    // SECURITY GROUPS
    // =============================================================================

    // Security Group for AgentCore Runtime
    this.agentCoreSecurityGroup = new ec2.SecurityGroup(this, 'AgentCoreSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: 'strands-agentcore-sg',
      description: 'Security group for AgentCore Runtime',
      allowAllOutbound: true,
    });

    // Security Group for App Runner VPC Connector
    this.appRunnerSecurityGroup = new ec2.SecurityGroup(this, 'AppRunnerSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: 'strands-apprunner-sg',
      description: 'Security group for App Runner VPC Connector',
      allowAllOutbound: true,
    });

    // Allow App Runner to communicate with AgentCore
    this.agentCoreSecurityGroup.addIngressRule(
      this.appRunnerSecurityGroup,
      ec2.Port.tcp(443),
      'Allow HTTPS from App Runner'
    );

    this.agentCoreSecurityGroup.addIngressRule(
      this.appRunnerSecurityGroup,
      ec2.Port.tcp(80),
      'Allow HTTP from App Runner'
    );

    // =============================================================================
    // VPC ENDPOINTS
    // =============================================================================

    // VPC Endpoints for AWS Services (cost-effective private connectivity)
    const dynamoDbEndpoint = this.vpc.addGatewayEndpoint('DynamoDbEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
    });

    const s3Endpoint = this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
    });

    // Interface VPC Endpoints for other AWS services
    const ssmEndpoint = this.vpc.addInterfaceEndpoint('SSMEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [this.appRunnerSecurityGroup],
    });

    // =============================================================================
    // AGENTCORE IAM EXECUTION ROLE
    // =============================================================================

    // IAM role for AgentCore Runtime execution (used by starter toolkit)
    this.agentCoreExecutionRole = new iam.Role(this, 'AgentCoreExecutionRole', {
      roleName: `strands-agentcore-execution-role-${this.account}`,
      assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
      description: 'Execution role for Strands AgentCore Runtime (used by starter toolkit)',
    });

    // Grant basic execution permissions
    this.agentCoreExecutionRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );

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

    // Grant DynamoDB permissions (using wildcard since tables are created in Storage stack)
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
        `arn:aws:dynamodb:${this.region}:${this.account}:table/strands-visual-builder-projects-*`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/strands-visual-builder-projects-*/index/*`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/strands-user-settings-*`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/strands-user-settings-*/index/*`,
      ],
    }));

    // Grant S3 permissions (using wildcard since buckets are created in Storage stack)
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
        `arn:aws:s3:::strands-temp-code-${this.account}-${this.region}`,
        `arn:aws:s3:::strands-temp-code-${this.account}-${this.region}/*`,
        `arn:aws:s3:::strands-frontend-${this.account}-${this.region}`,
        `arn:aws:s3:::strands-frontend-${this.account}-${this.region}/*`,
      ],
    }));

    // Grant Custom Code Interpreter permissions for AgentCore Runtime
    this.agentCoreExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock-agentcore:StartCodeInterpreterSession',
        'bedrock-agentcore:InvokeCodeInterpreter',
        'bedrock-agentcore:StopCodeInterpreterSession',
        'bedrock-agentcore:GetCodeInterpreterSession',
      ],
      resources: ['*'],
    }));

    // Security: Deny access to unauthorized code interpreters (only allow Strands Visual Builder interpreter)
    this.agentCoreExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.DENY,
      actions: [
        'bedrock-agentcore:StartCodeInterpreterSession',
        'bedrock-agentcore:InvokeCodeInterpreter',
        'bedrock-agentcore:StopCodeInterpreterSession',
        'bedrock-agentcore:GetCodeInterpreterSession',
        'bedrock-agentcore-control:GetCodeInterpreter',
        'bedrock-agentcore-control:UpdateCodeInterpreter',
        'bedrock-agentcore-control:DeleteCodeInterpreter',
      ],
      resources: [`arn:aws:bedrock-agentcore:*:${this.account}:code-interpreter/*`],
      conditions: {
        StringNotEquals: {
          'bedrock-agentcore:CodeInterpreterName': 'strands_visual_builder_shared_interpreter'
        }
      }
    }));

    // =============================================================================
    // CUSTOM CODE INTERPRETER EXECUTION ROLE
    // =============================================================================

    // IAM role for custom code interpreter execution
    const codeInterpreterExecutionRole = new iam.Role(this, 'CodeInterpreterExecutionRole', {
      roleName: `strands-code-interpreter-execution-role-${this.account}`,
      assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
      description: 'Execution role for custom AgentCore Code Interpreter',
    });

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

    // Grant basic execution permissions for code interpreter
    codeInterpreterExecutionRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );

    // Grant S3 access for code interpreter (read-only for safety)
    codeInterpreterExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:ListBucket',
        's3:GetBucketLocation',
      ],
      resources: [
        `arn:aws:s3:::strands-temp-code-${this.account}-${this.region}`,
        `arn:aws:s3:::strands-temp-code-${this.account}-${this.region}/temp-code/*`,
      ],
    }));

    // Grant Bedrock permissions for code interpreter (for Strands agent testing)
    codeInterpreterExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
        'bedrock:ListFoundationModels',
        'bedrock:GetFoundationModel',
      ],
      resources: ['*'], // Bedrock models require wildcard permissions
    }));

    // =============================================================================
    // SSM PARAMETERS FOR CROSS-STACK COMMUNICATION
    // =============================================================================

    // VPC Configuration Parameters
    const vpcIdParameter = new ssm.StringParameter(this, 'VpcIdParameter', {
      parameterName: `${parameterBasePath}/vpc/vpc-id`,
      stringValue: this.vpc.vpcId,
      description: 'VPC ID for AgentCore connectivity',
      simpleName: false,
    });

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

    const privateSubnetIdsParameter = new ssm.StringParameter(this, 'PrivateSubnetIdsParameter', {
      parameterName: `${parameterBasePath}/vpc/private-subnet-ids`,
      stringValue: this.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnetIds.join(','),
      description: 'Private subnet IDs for AgentCore deployment',
      simpleName: false,
    });

    const publicSubnetIdsParameter = new ssm.StringParameter(this, 'PublicSubnetIdsParameter', {
      parameterName: `${parameterBasePath}/vpc/public-subnet-ids`,
      stringValue: this.vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC }).subnetIds.join(','),
      description: 'Public subnet IDs for load balancers',
      simpleName: false,
    });

    const agentCoreSecurityGroupIdParameter = new ssm.StringParameter(this, 'AgentCoreSecurityGroupIdParameter', {
      parameterName: `${parameterBasePath}/vpc/agentcore-security-group-id`,
      stringValue: this.agentCoreSecurityGroup.securityGroupId,
      description: 'Security group ID for AgentCore Runtime',
      simpleName: false,
    });

    const appRunnerSecurityGroupIdParameter = new ssm.StringParameter(this, 'AppRunnerSecurityGroupIdParameter', {
      parameterName: `${parameterBasePath}/vpc/apprunner-security-group-id`,
      stringValue: this.appRunnerSecurityGroup.securityGroupId,
      description: 'Security group ID for App Runner VPC Connector',
      simpleName: false,
    });

    // AgentCore IAM Role Parameter
    const agentCoreExecutionRoleArnParameter = new ssm.StringParameter(this, 'AgentCoreExecutionRoleArnParameter', {
      parameterName: `${parameterBasePath}/iam/agentcore-execution-role-arn`,
      stringValue: this.agentCoreExecutionRole.roleArn,
      description: 'IAM role ARN for AgentCore Runtime execution (used by starter toolkit)',
      simpleName: false,
    });

    // Code Interpreter Execution Role Parameter
    const codeInterpreterExecutionRoleArnParameter = new ssm.StringParameter(this, 'CodeInterpreterExecutionRoleArnParameter', {
      parameterName: `${parameterBasePath}/iam/code-interpreter-execution-role-arn`,
      stringValue: codeInterpreterExecutionRole.roleArn,
      description: 'IAM role ARN for custom AgentCore Code Interpreter execution',
      simpleName: false,
    });

    // Region Configuration Parameter
    const regionParameter = new ssm.StringParameter(this, 'RegionParameter', {
      parameterName: `${parameterBasePath}/region`,
      stringValue: this.region,
      description: 'AWS region for Strands Visual Builder resources',
      simpleName: false,
    });

    // =============================================================================
    // OUTPUTS
    // =============================================================================

    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID for AgentCore connectivity',
      exportName: 'StrandsFoundation-VpcId',
    });

    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      value: this.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnetIds.join(','),
      description: 'Private subnet IDs for AgentCore deployment',
      exportName: 'StrandsFoundation-PrivateSubnetIds',
    });

    new cdk.CfnOutput(this, 'AgentCoreSecurityGroupId', {
      value: this.agentCoreSecurityGroup.securityGroupId,
      description: 'Security group ID for AgentCore Runtime',
      exportName: 'StrandsFoundation-AgentCoreSecurityGroupId',
    });

    new cdk.CfnOutput(this, 'AppRunnerSecurityGroupId', {
      value: this.appRunnerSecurityGroup.securityGroupId,
      description: 'Security group ID for App Runner VPC Connector',
      exportName: 'StrandsFoundation-AppRunnerSecurityGroupId',
    });

    new cdk.CfnOutput(this, 'AgentCoreExecutionRoleArn', {
      value: this.agentCoreExecutionRole.roleArn,
      description: 'IAM role ARN for AgentCore Runtime execution',
      exportName: 'StrandsFoundation-AgentCoreExecutionRoleArn',
    });
  }
}