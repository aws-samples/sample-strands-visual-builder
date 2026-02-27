# AgentCore Security & Best Practices

## Security Architecture

### 1. Identity and Access Management

#### IAM Roles and Policies
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "bedrock-agentcore.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

#### Agent Execution Role
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "arn:aws:bedrock:*:*:foundation-model/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "bedrock-agentcore:GetMemory",
        "bedrock-agentcore:PutMemory"
      ],
      "Resource": "*"
    }
  ]
}
```

#### Caller Permissions (Visual Builder Backend)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock-agentcore-control:CreateAgentRuntime",
        "bedrock-agentcore-control:UpdateAgentRuntime",
        "bedrock-agentcore-control:DeleteAgentRuntime",
        "bedrock-agentcore-control:GetAgentRuntime",
        "bedrock-agentcore-control:ListAgentRuntimes"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "bedrock-agentcore:InvokeAgentRuntime"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "codebuild:CreateProject",
        "codebuild:StartBuild",
        "codebuild:BatchGetBuilds"
      ],
      "Resource": "*"
    }
  ]
}
```

### 2. Session Isolation

#### MicroVM Isolation
- Each user session runs in dedicated microVM
- Complete CPU, memory, and filesystem isolation
- Deterministic security with memory sanitization
- No cross-session data contamination

#### Implementation in Visual Builder
```python
class SecureAgentSession:
    def __init__(self, user_id: str, agent_arn: str):
        self.user_id = user_id
        self.agent_arn = agent_arn
        self.session_id = f"{user_id}_{uuid.uuid4()}"
        self.created_at = datetime.now()
        self.last_activity = datetime.now()
    
    def invoke_agent(self, message: str, user_context: dict = None):
        """Invoke agent with user-specific context isolation"""
        
        # Validate user permissions
        if not self.validate_user_permissions():
            raise SecurityError("User not authorized for this agent")
        
        # Sanitize input
        sanitized_message = self.sanitize_input(message)
        
        # Add user context securely
        payload = {
            "prompt": sanitized_message,
            "session_id": self.session_id,
            "user_context": {
                "user_id": self.user_id,
                "permissions": user_context.get("permissions", []),
                "organization": user_context.get("organization")
            }
        }
        
        # Invoke with session isolation
        response = runtime_client.invoke_agent_runtime(
            agentRuntimeArn=self.agent_arn,
            runtimeSessionId=self.session_id,
            payload=json.dumps(payload).encode()
        )
        
        self.last_activity = datetime.now()
        return response
    
    def validate_user_permissions(self) -> bool:
        """Validate user has permission to access this agent"""
        # Implement your authorization logic
        return True
    
    def sanitize_input(self, message: str) -> str:
        """Sanitize user input to prevent injection attacks"""
        # Remove potentially dangerous content
        sanitized = re.sub(r'<script.*?</script>', '', message, flags=re.IGNORECASE)
        sanitized = re.sub(r'javascript:', '', sanitized, flags=re.IGNORECASE)
        return sanitized.strip()
```

### 3. Data Protection

#### Input Validation
```python
from typing import Any, Dict
import re
import json

class InputValidator:
    MAX_MESSAGE_LENGTH = 10000
    MAX_PAYLOAD_SIZE = 100 * 1024 * 1024  # 100MB
    
    ALLOWED_MEDIA_TYPES = {
        'image/jpeg', 'image/png', 'image/gif',
        'application/pdf', 'text/plain'
    }
    
    @staticmethod
    def validate_message(message: str) -> str:
        """Validate and sanitize text message"""
        if not isinstance(message, str):
            raise ValueError("Message must be a string")
        
        if len(message) > InputValidator.MAX_MESSAGE_LENGTH:
            raise ValueError(f"Message too long: {len(message)} > {InputValidator.MAX_MESSAGE_LENGTH}")
        
        # Remove potentially dangerous patterns
        sanitized = re.sub(r'<script.*?</script>', '', message, flags=re.IGNORECASE | re.DOTALL)
        sanitized = re.sub(r'javascript:', '', sanitized, flags=re.IGNORECASE)
        sanitized = re.sub(r'data:text/html', '', sanitized, flags=re.IGNORECASE)
        
        return sanitized.strip()
    
    @staticmethod
    def validate_media(media_data: Dict[str, Any]) -> Dict[str, Any]:
        """Validate media attachments"""
        if not isinstance(media_data, dict):
            raise ValueError("Media data must be a dictionary")
        
        media_type = media_data.get('type')
        if media_type not in InputValidator.ALLOWED_MEDIA_TYPES:
            raise ValueError(f"Unsupported media type: {media_type}")
        
        # Validate base64 data
        data = media_data.get('data', '')
        try:
            decoded = base64.b64decode(data)
            if len(decoded) > InputValidator.MAX_PAYLOAD_SIZE:
                raise ValueError("Media file too large")
        except Exception:
            raise ValueError("Invalid base64 media data")
        
        return media_data
    
    @staticmethod
    def validate_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
        """Validate complete payload"""
        validated = {}
        
        # Validate message
        if 'prompt' in payload:
            validated['prompt'] = InputValidator.validate_message(payload['prompt'])
        
        # Validate media
        if 'media' in payload:
            validated['media'] = InputValidator.validate_media(payload['media'])
        
        # Validate session ID
        if 'session_id' in payload:
            session_id = payload['session_id']
            if not isinstance(session_id, str) or not re.match(r'^[a-zA-Z0-9_-]+$', session_id):
                raise ValueError("Invalid session ID format")
            validated['session_id'] = session_id
        
        return validated
```

#### Output Sanitization
```python
class OutputSanitizer:
    @staticmethod
    def sanitize_response(response: str) -> str:
        """Sanitize agent response before sending to client"""
        if not isinstance(response, str):
            return str(response)
        
        # Remove potential XSS vectors
        sanitized = re.sub(r'<script.*?</script>', '', response, flags=re.IGNORECASE | re.DOTALL)
        sanitized = re.sub(r'javascript:', '', sanitized, flags=re.IGNORECASE)
        sanitized = re.sub(r'on\w+\s*=', '', sanitized, flags=re.IGNORECASE)
        
        # Escape HTML entities
        sanitized = html.escape(sanitized)
        
        return sanitized
    
    @staticmethod
    def filter_sensitive_data(response: str) -> str:
        """Remove potentially sensitive information"""
        # Remove AWS ARNs
        response = re.sub(r'arn:aws:[a-zA-Z0-9-]+:[a-zA-Z0-9-]*:\d{12}:[a-zA-Z0-9-/]+', '[REDACTED-ARN]', response)
        
        # Remove IP addresses
        response = re.sub(r'\b(?:\d{1,3}\.){3}\d{1,3}\b', '[REDACTED-IP]', response)
        
        # Remove email addresses
        response = re.sub(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '[REDACTED-EMAIL]', response)
        
        # Remove phone numbers
        response = re.sub(r'\b\d{3}-\d{3}-\d{4}\b', '[REDACTED-PHONE]', response)
        
        return response
```

### 4. Authentication and Authorization

#### Multi-tenant Security
```python
class MultiTenantSecurityManager:
    def __init__(self):
        self.user_sessions = {}
        self.organization_permissions = {}
    
    def authenticate_user(self, token: str) -> Dict[str, Any]:
        """Authenticate user and return user context"""
        try:
            # Decode JWT token (implement your JWT validation)
            payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
            
            user_context = {
                'user_id': payload['sub'],
                'organization': payload.get('org'),
                'permissions': payload.get('permissions', []),
                'roles': payload.get('roles', [])
            }
            
            return user_context
        except jwt.InvalidTokenError:
            raise AuthenticationError("Invalid authentication token")
    
    def authorize_agent_access(self, user_context: Dict[str, Any], agent_arn: str) -> bool:
        """Check if user can access specific agent"""
        user_id = user_context['user_id']
        organization = user_context['organization']
        
        # Check organization-level permissions
        org_permissions = self.organization_permissions.get(organization, {})
        allowed_agents = org_permissions.get('allowed_agents', [])
        
        if agent_arn not in allowed_agents and '*' not in allowed_agents:
            return False
        
        # Check user-level permissions
        user_permissions = user_context.get('permissions', [])
        if 'agent:invoke' not in user_permissions:
            return False
        
        return True
    
    def create_secure_session(self, user_context: Dict[str, Any], agent_arn: str) -> SecureAgentSession:
        """Create secure session with proper authorization"""
        if not self.authorize_agent_access(user_context, agent_arn):
            raise AuthorizationError("User not authorized to access this agent")
        
        session = SecureAgentSession(user_context['user_id'], agent_arn)
        self.user_sessions[session.session_id] = session
        
        return session
```

### 5. Monitoring and Auditing

#### Security Event Logging
```python
import logging
from datetime import datetime
from typing import Dict, Any

class SecurityAuditLogger:
    def __init__(self):
        self.logger = logging.getLogger('security_audit')
        self.logger.setLevel(logging.INFO)
        
        # Configure CloudWatch handler
        handler = CloudWatchLogsHandler(log_group='agentcore-security-audit')
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        handler.setFormatter(formatter)
        self.logger.addHandler(handler)
    
    def log_authentication_attempt(self, user_id: str, success: bool, ip_address: str):
        """Log authentication attempts"""
        self.logger.info(json.dumps({
            'event_type': 'authentication',
            'user_id': user_id,
            'success': success,
            'ip_address': ip_address,
            'timestamp': datetime.now().isoformat()
        }))
    
    def log_agent_invocation(self, user_id: str, agent_arn: str, session_id: str, success: bool):
        """Log agent invocations"""
        self.logger.info(json.dumps({
            'event_type': 'agent_invocation',
            'user_id': user_id,
            'agent_arn': agent_arn,
            'session_id': session_id,
            'success': success,
            'timestamp': datetime.now().isoformat()
        }))
    
    def log_security_violation(self, user_id: str, violation_type: str, details: Dict[str, Any]):
        """Log security violations"""
        self.logger.warning(json.dumps({
            'event_type': 'security_violation',
            'user_id': user_id,
            'violation_type': violation_type,
            'details': details,
            'timestamp': datetime.now().isoformat()
        }))
```

### 6. Best Practices Implementation

#### Rate Limiting
```python
from collections import defaultdict
from time import time

class RateLimiter:
    def __init__(self):
        self.requests = defaultdict(list)
        self.limits = {
            'per_minute': 60,
            'per_hour': 1000,
            'per_day': 10000
        }
    
    def is_allowed(self, user_id: str) -> bool:
        """Check if user is within rate limits"""
        now = time()
        user_requests = self.requests[user_id]
        
        # Clean old requests
        user_requests[:] = [req_time for req_time in user_requests if now - req_time < 86400]
        
        # Check limits
        minute_requests = len([req for req in user_requests if now - req < 60])
        hour_requests = len([req for req in user_requests if now - req < 3600])
        day_requests = len(user_requests)
        
        if (minute_requests >= self.limits['per_minute'] or
            hour_requests >= self.limits['per_hour'] or
            day_requests >= self.limits['per_day']):
            return False
        
        # Add current request
        user_requests.append(now)
        return True
```

#### Secure Configuration Management
```python
class SecureConfigManager:
    def __init__(self):
        self.ssm_client = boto3.client('ssm')
    
    def get_secure_config(self, parameter_name: str) -> str:
        """Get configuration from AWS Systems Manager Parameter Store"""
        try:
            response = self.ssm_client.get_parameter(
                Name=parameter_name,
                WithDecryption=True
            )
            return response['Parameter']['Value']
        except ClientError as e:
            raise ConfigurationError(f"Failed to get parameter {parameter_name}: {e}")
    
    def validate_agent_config(self, config: Dict[str, Any]) -> bool:
        """Validate agent configuration for security"""
        required_fields = ['name', 'description', 'runtime']
        
        for field in required_fields:
            if field not in config:
                raise ValueError(f"Missing required field: {field}")
        
        # Validate runtime configuration
        runtime = config['runtime']
        if runtime.get('memory', 0) > 4096:
            raise ValueError("Memory limit exceeded")
        
        if runtime.get('timeout', 0) > 3600:
            raise ValueError("Timeout limit exceeded")
        
        return True
```

## Security Checklist for Visual Builder Integration

### Development Phase
- [ ] Implement input validation for all user inputs
- [ ] Add output sanitization for agent responses
- [ ] Set up proper authentication and authorization
- [ ] Configure rate limiting for API endpoints
- [ ] Implement secure session management

### Deployment Phase
- [ ] Use least-privilege IAM roles
- [ ] Enable CloudTrail logging
- [ ] Configure VPC endpoints for private communication
- [ ] Set up monitoring and alerting
- [ ] Implement backup and disaster recovery

### Operations Phase
- [ ] Regular security audits
- [ ] Monitor for suspicious activity
- [ ] Update dependencies regularly
- [ ] Review and rotate credentials
- [ ] Test incident response procedures

This comprehensive security framework ensures safe integration of AgentCore with the visual builder platform.