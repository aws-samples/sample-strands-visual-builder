import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface FrontendStackProps extends cdk.StackProps {
  parameterBasePath: string;
  frontendBucket?: s3.IBucket;
}

export class FrontendStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const { parameterBasePath, frontendBucket: frontendBucketProp } = props;

    // =============================================================================
    // CROSS-STACK REFERENCES VIA SSM
    // =============================================================================

    // Get ALB DNS name from Backend stack for API proxying
    const albDnsName = ssm.StringParameter.valueForStringParameter(
      this,
      `${parameterBasePath}/alb/dns-name`
    );

    // =============================================================================
    // S3 BUCKET REFERENCE
    // =============================================================================

    // Use the bucket passed as prop, or fall back to SSM parameter reference
    let frontendBucket: s3.IBucket;

    if (frontendBucketProp) {
      // Use the bucket passed as prop (when deployed via orchestrator)
      frontendBucket = frontendBucketProp;
    } else {
      // Use SSM parameter reference (resolves at deployment time, not synthesis time)
      const bucketNameParameter = ssm.StringParameter.valueForStringParameter(
        this,
        `${parameterBasePath}/s3/frontend-bucket`
      );

      // Create bucket reference using the parameter value
      frontendBucket = s3.Bucket.fromBucketName(this, 'FrontendBucket', bucketNameParameter);
    }

    // =============================================================================
    // CLOUDFRONT DISTRIBUTION
    // =============================================================================

    // CloudFront distribution for frontend
    this.distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      comment: 'Strands Visual Builder Frontend Distribution - Updated with backend routes',
      defaultBehavior: {
        origin: cloudfrontOrigins.S3BucketOrigin.withOriginAccessIdentity(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        // API endpoints
        '/api/*': {
          origin: new cloudfrontOrigins.HttpOrigin(albDnsName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            httpPort: 80,
            readTimeout: cdk.Duration.seconds(120),
            keepaliveTimeout: cdk.Duration.seconds(120),
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
        // Health and status endpoints
        '/health': {
          origin: new cloudfrontOrigins.HttpOrigin(albDnsName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            httpPort: 80,
            readTimeout: cdk.Duration.seconds(120), 
            keepaliveTimeout: cdk.Duration.seconds(120),
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
        '/ping': {
          origin: new cloudfrontOrigins.HttpOrigin(albDnsName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            httpPort: 80,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
        // Python execution endpoint
        '/execute-python': {
          origin: new cloudfrontOrigins.HttpOrigin(albDnsName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            httpPort: 80,
            readTimeout: cdk.Duration.seconds(120),
            keepaliveTimeout: cdk.Duration.seconds(120),
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
        // Model and generation endpoints
        '/available-models': {
          origin: new cloudfrontOrigins.HttpOrigin(albDnsName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            httpPort: 80,
            readTimeout: cdk.Duration.seconds(120),
            keepaliveTimeout: cdk.Duration.seconds(120),
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
        '/generate-code': {
          origin: new cloudfrontOrigins.HttpOrigin(albDnsName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            httpPort: 80,
            readTimeout: cdk.Duration.seconds(120),
            keepaliveTimeout: cdk.Duration.seconds(120),
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
        '/settings*': {
          origin: new cloudfrontOrigins.HttpOrigin(albDnsName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            httpPort: 80,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
        // Documentation endpoints
        '/docs*': {
          origin: new cloudfrontOrigins.HttpOrigin(albDnsName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            httpPort: 80,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
        '/openapi.json': {
          origin: new cloudfrontOrigins.HttpOrigin(albDnsName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            httpPort: 80,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
        '/redoc*': {
          origin: new cloudfrontOrigins.HttpOrigin(albDnsName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            httpPort: 80,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
        // AgentCore deployment endpoints
        '/api/agentcore/deployments*': {
          origin: new cloudfrontOrigins.HttpOrigin(albDnsName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            httpPort: 80,
            readTimeout: cdk.Duration.seconds(120),
            keepaliveTimeout: cdk.Duration.seconds(120),
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
        '/agentcore*': {
          origin: new cloudfrontOrigins.HttpOrigin(albDnsName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            httpPort: 80,
            readTimeout: cdk.Duration.seconds(120),
            keepaliveTimeout: cdk.Duration.seconds(120),
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
        // Additional API endpoints
        '/available-tools': {
          origin: new cloudfrontOrigins.HttpOrigin(albDnsName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            httpPort: 80,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
        '/tool-info*': {
          origin: new cloudfrontOrigins.HttpOrigin(albDnsName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            httpPort: 80,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
        '/s3-code*': {
          origin: new cloudfrontOrigins.HttpOrigin(albDnsName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            httpPort: 80,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
        '/projects*': {
          origin: new cloudfrontOrigins.HttpOrigin(albDnsName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            httpPort: 80,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
        '/config*': {
          origin: new cloudfrontOrigins.HttpOrigin(albDnsName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            httpPort: 80,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
        '/auth*': {
          origin: new cloudfrontOrigins.HttpOrigin(albDnsName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            httpPort: 80,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
      },
      defaultRootObject: 'index.html',
      // No error responses - let API errors pass through properly
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      enableIpv6: true,
    });

    // =============================================================================
    // SSM PARAMETERS FOR CROSS-STACK COMMUNICATION
    // =============================================================================

    // CloudFront Configuration Parameters
    const distributionDomainNameParameter = new ssm.StringParameter(this, 'DistributionDomainNameParameter', {
      parameterName: `${parameterBasePath}/cloudfront/domain-name`,
      stringValue: this.distribution.distributionDomainName,
      description: 'CloudFront distribution domain name',
      simpleName: false,
    });

    const distributionIdParameter = new ssm.StringParameter(this, 'DistributionIdParameter', {
      parameterName: `${parameterBasePath}/cloudfront/distribution-id`,
      stringValue: this.distribution.distributionId,
      description: 'CloudFront distribution ID',
      simpleName: false,
    });

    // Application Configuration Parameters
    const corsOriginsParameter = new ssm.StringParameter(this, 'CorsOriginsParameter', {
      parameterName: `${parameterBasePath}/app/cors-origins`,
      stringValue: `http://localhost:5173,http://localhost:3000,http://localhost:7001,https://${this.distribution.distributionDomainName}`,
      description: 'CORS origins for the application',
      simpleName: false,
    });

    const nodeEnvParameter = new ssm.StringParameter(this, 'NodeEnvParameter', {
      parameterName: `${parameterBasePath}/app/node-env`,
      stringValue: 'development',
      description: 'Node environment setting',
      simpleName: false,
    });

    const debugParameter = new ssm.StringParameter(this, 'DebugParameter', {
      parameterName: `${parameterBasePath}/app/debug`,
      stringValue: 'false',
      description: 'Debug mode setting',
      simpleName: false,
    });

    const jwtExpirationParameter = new ssm.StringParameter(this, 'JwtExpirationParameter', {
      parameterName: `${parameterBasePath}/app/jwt-expiration`,
      stringValue: '3600',
      description: 'JWT token expiration in seconds',
      simpleName: false,
    });

    // Frontend Configuration Parameters
    const apiBaseUrlParameter = new ssm.StringParameter(this, 'ApiBaseUrlParameter', {
      parameterName: `${parameterBasePath}/frontend/api-base-url`,
      stringValue: `https://${this.distribution.distributionDomainName}`,
      description: 'Backend API base URL for frontend',
      simpleName: false,
    });

    const frontendNodeEnvParameter = new ssm.StringParameter(this, 'FrontendNodeEnvParameter', {
      parameterName: `${parameterBasePath}/frontend/node-env`,
      stringValue: 'development',
      description: 'Frontend Node environment setting',
      simpleName: false,
    });

    const frontendDebugParameter = new ssm.StringParameter(this, 'FrontendDebugParameter', {
      parameterName: `${parameterBasePath}/frontend/debug`,
      stringValue: 'false',
      description: 'Frontend debug mode setting',
      simpleName: false,
    });

    // =============================================================================
    // OUTPUTS
    // =============================================================================

    new cdk.CfnOutput(this, 'CloudFrontDistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront distribution domain name for frontend',
      exportName: 'StrandsFrontend-CloudFrontDomainName',
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID',
      exportName: 'StrandsFrontend-CloudFrontDistributionId',
    });

    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'Frontend application URL',
      exportName: 'StrandsFrontend-Url',
    });
  }
}