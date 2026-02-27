import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface StorageStackProps extends cdk.StackProps {
  parameterBasePath: string;
}

export class StorageStack extends cdk.Stack {
  public readonly projectsTable: dynamodb.Table;
  public readonly userSettingsTable: dynamodb.Table;
  public readonly tempCodeBucket: s3.Bucket;
  public readonly frontendBucket: s3.Bucket;
  public readonly backendEcrRepository: ecr.Repository;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    const { parameterBasePath } = props;

    // =============================================================================
    // DYNAMODB TABLES
    // =============================================================================

    // DynamoDB table for project persistence
    this.projectsTable = new dynamodb.Table(this, 'StrandsVisualBuilderProjects', {
      tableName: `strands-visual-builder-projects-${this.account}`,
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.DEFAULT,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development - change to RETAIN for production
    });

    // Global Secondary Index for querying projects by user
    this.projectsTable.addGlobalSecondaryIndex({
      indexName: 'UserProjectsIndex',
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'created',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // DynamoDB table for user settings persistence
    this.userSettingsTable = new dynamodb.Table(this, 'UserSettingsTable', {
      tableName: `strands-user-settings-${this.account}`,
      partitionKey: {
        name: 'email',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.DEFAULT,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Retain user settings on stack deletion
    });

    // =============================================================================
    // S3 BUCKETS
    // =============================================================================

    // S3 bucket for temporary code storage
    this.tempCodeBucket = new s3.Bucket(this, 'StrandsTempCodeBucket', {
      bucketName: `strands-temp-code-${this.account}-${this.region}`,
      versioned: false,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development - change to RETAIN for production
      autoDeleteObjects: true, // Automatically delete objects when stack is destroyed
      lifecycleRules: [
        {
          id: 'DeleteTempCodeAfter1Day',
          enabled: true,
          prefix: 'temp-code/',
          expiration: cdk.Duration.days(1),
        },
      ],
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: [
            'http://localhost:5173',
            'http://localhost:3000',
            'http://localhost:7001',
            'https://*.amazonaws.com',
            'https://*.cloudfront.net',
          ],
          allowedHeaders: ['*'],
          exposedHeaders: [
            'ETag',
            'x-amz-server-side-encryption',
            'x-amz-request-id',
            'x-amz-id-2',
          ],
          maxAge: 3600,
        },
      ],
    });

    // S3 bucket for frontend static assets
    this.frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `strands-frontend-${this.account}-${this.region}`,
      versioned: true,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development
      autoDeleteObjects: true,
    });

    // S3 bucket policy will be handled automatically by CloudFront OAI in Frontend stack
    // Removed conflicting manual bucket policy to let CDK handle OAI properly

    // =============================================================================
    // ECR REPOSITORY FOR BACKEND
    // =============================================================================

    // ECR repository for backend Docker images
    this.backendEcrRepository = new ecr.Repository(this, 'BackendRepository', {
      repositoryName: 'strands-visual-builder-backend',
      imageScanOnPush: true,
      lifecycleRules: [{
        maxImageCount: 10, // Keep only 10 images
        description: 'Keep only 10 most recent images'
      }],
      removalPolicy: cdk.RemovalPolicy.DESTROY // Allow deletion during cleanup
    });

    // =============================================================================
    // SSM PARAMETERS FOR CROSS-STACK COMMUNICATION
    // =============================================================================

    // DynamoDB Configuration Parameters
    const tableNameParameter = new ssm.StringParameter(this, 'TableNameParameter', {
      parameterName: `${parameterBasePath}/dynamodb/table-name`,
      stringValue: this.projectsTable.tableName,
      description: 'DynamoDB table name for Strands Visual Builder projects',
      simpleName: false,
    });

    const userSettingsTableNameParameter = new ssm.StringParameter(this, 'UserSettingsTableNameParameter', {
      parameterName: `${parameterBasePath}/dynamodb/user-settings-table-name`,
      stringValue: this.userSettingsTable.tableName,
      description: 'DynamoDB table name for user settings storage',
      simpleName: false,
    });

    // S3 Configuration Parameters
    const tempCodeBucketParameter = new ssm.StringParameter(this, 'TempCodeBucketParameter', {
      parameterName: '/strands/temp-code-bucket',
      stringValue: this.tempCodeBucket.bucketName,
      description: 'S3 bucket name for temporary code storage',
      simpleName: false,
    });

    const tempCodeBucketParameterNew = new ssm.StringParameter(this, 'TempCodeBucketParameterNew', {
      parameterName: `${parameterBasePath}/s3/temp-code-bucket`,
      stringValue: this.tempCodeBucket.bucketName,
      description: 'S3 bucket name for temporary code storage',
      simpleName: false,
    });

    const frontendBucketParameter = new ssm.StringParameter(this, 'FrontendBucketParameter', {
      parameterName: `${parameterBasePath}/s3/frontend-bucket`,
      stringValue: this.frontendBucket.bucketName,
      description: 'S3 bucket name for frontend static assets',
      simpleName: false,
    });

    const frontendBucketArnParameter = new ssm.StringParameter(this, 'FrontendBucketArnParameter', {
      parameterName: `${parameterBasePath}/s3/frontend-bucket-arn`,
      stringValue: this.frontendBucket.bucketArn,
      description: 'S3 bucket ARN for frontend static assets',
      simpleName: false,
    });

    // ECR Configuration Parameters
    const ecrRepositoryUriParameter = new ssm.StringParameter(this, 'EcrRepositoryUriParameter', {
      parameterName: `${parameterBasePath}/ecr/backend-repository-uri`,
      stringValue: this.backendEcrRepository.repositoryUri,
      description: 'ECR repository URI for backend Docker images',
      simpleName: false,
    });

    // =============================================================================
    // OUTPUTS
    // =============================================================================

    new cdk.CfnOutput(this, 'ProjectsTableName', {
      value: this.projectsTable.tableName,
      description: 'DynamoDB table name for project storage',
      exportName: 'StrandsStorage-ProjectsTableName',
    });

    new cdk.CfnOutput(this, 'UserSettingsTableName', {
      value: this.userSettingsTable.tableName,
      description: 'DynamoDB table name for user settings storage',
      exportName: 'StrandsStorage-UserSettingsTableName',
    });

    new cdk.CfnOutput(this, 'TempCodeBucketName', {
      value: this.tempCodeBucket.bucketName,
      description: 'S3 bucket name for temporary code storage',
      exportName: 'StrandsStorage-TempCodeBucketName',
    });

    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: this.frontendBucket.bucketName,
      description: 'S3 bucket name for frontend static assets',
      exportName: 'StrandsStorage-FrontendBucketName',
    });

    new cdk.CfnOutput(this, 'FrontendBucketArn', {
      value: this.frontendBucket.bucketArn,
      description: 'S3 bucket ARN for frontend static assets',
      exportName: 'StrandsStorage-FrontendBucketArn',
    });

    new cdk.CfnOutput(this, 'BackendEcrRepositoryUri', {
      value: this.backendEcrRepository.repositoryUri,
      description: 'ECR repository URI for backend Docker images',
      exportName: 'StrandsStorage-BackendEcrRepositoryUri',
    });
  }
}