import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface AuthStackProps extends cdk.StackProps {
  parameterBasePath: string;
}

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const { parameterBasePath } = props;

    // =============================================================================
    // COGNITO USER POOL
    // =============================================================================

    // Cognito User Pool for authentication (email/password only)
    this.userPool = new cognito.UserPool(this, 'StrandsVisualBuilderUserPool', {
      userPoolName: 'strands-visual-builder-users',
      selfSignUpEnabled: false, // Disable public signup - admin creates users only
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development - change to RETAIN for production
      
      // Admin-only user creation - no additional config needed
      // selfSignUpEnabled: false already handles this
    });

    // Cognito User Pool Client
    this.userPoolClient = new cognito.UserPoolClient(this, 'StrandsVisualBuilderUserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: 'strands-visual-builder-client',
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false, // Required for frontend applications
      preventUserExistenceErrors: true,
    });

    // =============================================================================
    // SSM PARAMETERS FOR CROSS-STACK COMMUNICATION
    // =============================================================================

    // AWS Configuration Parameters
    const userPoolIdParameter = new ssm.StringParameter(this, 'UserPoolIdParameter', {
      parameterName: `${parameterBasePath}/cognito/user-pool-id`,
      stringValue: this.userPool.userPoolId,
      description: 'Cognito User Pool ID for Strands Visual Builder',
      simpleName: false,
    });

    const userPoolClientIdParameter = new ssm.StringParameter(this, 'UserPoolClientIdParameter', {
      parameterName: `${parameterBasePath}/cognito/client-id`,
      stringValue: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID for Strands Visual Builder',
      simpleName: false,
    });

    const userPoolArnParameter = new ssm.StringParameter(this, 'UserPoolArnParameter', {
      parameterName: `${parameterBasePath}/cognito/user-pool-arn`,
      stringValue: this.userPool.userPoolArn,
      description: 'Cognito User Pool ARN for IAM policies',
      simpleName: false,
    });

    // =============================================================================
    // OUTPUTS
    // =============================================================================

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID for authentication',
      exportName: 'StrandsAuth-UserPoolId',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID for frontend',
      exportName: 'StrandsAuth-UserPoolClientId',
    });

    new cdk.CfnOutput(this, 'UserPoolArn', {
      value: this.userPool.userPoolArn,
      description: 'Cognito User Pool ARN for IAM policies',
      exportName: 'StrandsAuth-UserPoolArn',
    });
  }
}