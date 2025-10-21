#!/bin/bash

# Strands Visual Builder - Streamlined Deployment Script
# Based on the refactor plan: Infrastructure → Services → Frontend

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_PROFILE="${AWS_PROFILE:-staging}"
AGENTCORE_RUNTIME_ONLY=false

# =============================================================================
# PHASE 0: PREREQUISITES & SETUP
# =============================================================================

check_cdk_version_compatibility() {
    print_status "Checking CDK CLI version compatibility..."
    
    # Get user's current CDK CLI version
    USER_CDK_VERSION=$(cdk --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    REQUIRED_CDK_VERSION="2.100.0"
    RECOMMENDED_CDK_VERSION="2.1029.3"
    
    if [[ -z "$USER_CDK_VERSION" ]]; then
        print_error "Could not determine CDK CLI version"
        exit 1
    fi
    
    # Simple version comparison (assumes semantic versioning)
    version_compare() {
        local version1="$1"
        local version2="$2"
        
        # Convert versions to comparable numbers
        local v1_major=$(echo "$version1" | cut -d. -f1)
        local v1_minor=$(echo "$version1" | cut -d. -f2)
        local v1_patch=$(echo "$version1" | cut -d. -f3)
        
        local v2_major=$(echo "$version2" | cut -d. -f1)
        local v2_minor=$(echo "$version2" | cut -d. -f2)
        local v2_patch=$(echo "$version2" | cut -d. -f3)
        
        # Compare major version
        if [[ $v1_major -lt $v2_major ]]; then
            return 1  # version1 < version2
        elif [[ $v1_major -gt $v2_major ]]; then
            return 0  # version1 >= version2
        fi
        
        # Compare minor version
        if [[ $v1_minor -lt $v2_minor ]]; then
            return 1  # version1 < version2
        elif [[ $v1_minor -gt $v2_minor ]]; then
            return 0  # version1 >= version2
        fi
        
        # Compare patch version
        if [[ $v1_patch -lt $v2_patch ]]; then
            return 1  # version1 < version2
        else
            return 0  # version1 >= version2
        fi
    }
    
    # Check if user's version is older than required
    if ! version_compare "$USER_CDK_VERSION" "$REQUIRED_CDK_VERSION"; then
        print_warning "CDK CLI version compatibility issue:"
        echo "  Current CDK CLI: $USER_CDK_VERSION"
        echo "  Required minimum: $REQUIRED_CDK_VERSION"
        echo "  Recommended: $RECOMMENDED_CDK_VERSION"
        echo ""
        echo "Please upgrade your CDK CLI:"
        echo "  npm install -g aws-cdk@latest"
        echo ""
        print_status "Run the script again after upgrading"
        exit 0
    fi
    
    print_success "CDK CLI version $USER_CDK_VERSION is compatible"
}

check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check AWS CLI and credentials
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI not installed"
        exit 1
    fi
    
    if ! aws sts get-caller-identity --profile "$AWS_PROFILE" &> /dev/null; then
        print_error "AWS credentials not configured for profile '$AWS_PROFILE'"
        exit 1
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker not installed"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker daemon not running"
        exit 1
    fi
    
    # Check Node.js and CDK
    if ! command -v node &> /dev/null; then
        print_error "Node.js not installed"
        exit 1
    fi
    
    if ! command -v cdk &> /dev/null; then
        print_error "AWS CDK not installed. Run: npm install -g aws-cdk"
        exit 1
    fi
    
    # Check CDK version compatibility
    check_cdk_version_compatibility
    
    # Check Python and pip
    if ! command -v python3 &> /dev/null; then
        print_error "Python 3 not installed"
        exit 1
    fi
    
    if ! command -v pip &> /dev/null && ! command -v pip3 &> /dev/null; then
        print_error "pip not installed"
        exit 1
    fi
    
    # Check jq for JSON processing
    if ! command -v jq &> /dev/null; then
        print_error "jq not installed. Required for processing CDK outputs."
        print_error "Install with: brew install jq (macOS) or apt-get install jq (Ubuntu)"
        exit 1
    fi
    
    print_success "All prerequisites met"
}

check_and_bootstrap_cdk() {
    print_status "Checking CDK bootstrap status..."
    
    # Get account ID for bootstrap check
    ACCOUNT_ID=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query Account --output text)
    
    # Navigate to CDK directory for bootstrap operations
    cd "$SCRIPT_DIR/cdk"
    
    # Install CDK dependencies (Fix for aws-cdk-lib missing issue)
    print_status "Installing CDK dependencies for bootstrap..."
    npm install
    
    # Set CDK environment variables
    export CDK_DEFAULT_REGION="$AWS_REGION"
    export CDK_DEFAULT_ACCOUNT="$ACCOUNT_ID"
    
    # Check if CDK is properly bootstrapped
    if aws ssm get-parameter --profile "$AWS_PROFILE" --region "$AWS_REGION" --name "/cdk-bootstrap/hnb659fds/version" &> /dev/null; then
        print_success "CDK is already bootstrapped in $AWS_REGION"
        cd "$SCRIPT_DIR"
        return 0
    fi
    
    # CDK not properly bootstrapped, let's bootstrap it
    print_warning "CDK not properly bootstrapped in region $AWS_REGION"
    print_status "Bootstrapping CDK (this is a one-time setup)..."
    
    # Bootstrap CDK
    if npx cdk bootstrap --profile "$AWS_PROFILE" aws://$ACCOUNT_ID/$AWS_REGION; then
        print_success "CDK bootstrap completed successfully"
    else
        print_error "CDK bootstrap failed"
        cd "$SCRIPT_DIR"
        exit 1
    fi
    
    # Return to script directory
    cd "$SCRIPT_DIR"
}

# =============================================================================
# PHASE 1: DEPLOY CDK INFRASTRUCTURE
# =============================================================================

deploy_cdk_infrastructure() {
    print_status "=== PHASE 1: DEPLOYING CDK INFRASTRUCTURE ==="
    
    cd "$SCRIPT_DIR/cdk"
    
    # Install CDK dependencies (Fix for aws-cdk-lib missing issue)
    print_status "Installing CDK dependencies..."
    npm install
    
    # Set CDK environment variables
    export CDK_DEFAULT_REGION="$AWS_REGION"
    export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query Account --output text)
    
    # Clean up any stale CDK processes or lock files
    rm -f cdk.out/*.lock
    
    print_status "Deploying infrastructure stacks individually for better control..."
    
    # Deploy stacks one by one with timeout and retry logic
    deploy_single_stack() {
        local stack_name="$1"
        local max_attempts=3
        local attempt=1
        
        while [ $attempt -le $max_attempts ]; do
            print_status "Deploying $stack_name (attempt $attempt/$max_attempts)..."
            
            # Deploy stack (CDK has built-in timeouts)
            if npx cdk deploy "$stack_name" --profile "$AWS_PROFILE" --require-approval never --outputs-file outputs.json; then
                print_success "$stack_name deployed successfully"
                return 0
            else
                print_warning "$stack_name deployment failed on attempt $attempt"
                if [ $attempt -eq $max_attempts ]; then
                    print_error "$stack_name deployment failed after $max_attempts attempts"
                    return 1
                fi
                attempt=$((attempt + 1))
                sleep 30
            fi
        done
    }
    
    # Deploy foundation stack
    if ! deploy_single_stack "StrandsFoundationStack"; then
        cd "$SCRIPT_DIR"
        exit 1
    fi
    
    # Deploy storage stack
    if ! deploy_single_stack "StrandsStorageStack"; then
        cd "$SCRIPT_DIR"
        exit 1
    fi
    
    # Deploy auth stack
    if ! deploy_single_stack "StrandsAuthStack"; then
        cd "$SCRIPT_DIR"
        exit 1
    fi
    
    # Verify outputs file exists
    if [[ ! -f "outputs.json" ]]; then
        print_error "CDK outputs file not found"
        cd "$SCRIPT_DIR"
        exit 1
    fi
    
    cd "$SCRIPT_DIR"
    print_success "Phase 1 completed: Infrastructure stacks deployed"
}

deploy_backend_stack() {
    print_status "=== PHASE 1B: DEPLOYING BACKEND STACK ==="
    
    cd "$SCRIPT_DIR/cdk"
    
    # Ensure CDK dependencies are installed (may be called separately)
    if [[ ! -d "node_modules" ]]; then
        print_status "Installing CDK dependencies..."
        npm install
    fi
    
    print_status "Deploying backend stack (now that Docker image AND SSM parameters are available)..."
    
    # Deploy backend stack with timeout and retry
    local max_attempts=3
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        print_status "Deploying backend stack (attempt $attempt/$max_attempts)..."
        
        if npx cdk deploy StrandsBackendStack --profile "$AWS_PROFILE" --require-approval never --outputs-file outputs.json; then
            print_success "Backend stack deployed successfully"
            cd "$SCRIPT_DIR"
            return 0
        else
            print_warning "Backend stack deployment failed on attempt $attempt"
            if [ $attempt -eq $max_attempts ]; then
                print_error "Backend stack deployment failed after $max_attempts attempts"
                cd "$SCRIPT_DIR"
                exit 1
            fi
            attempt=$((attempt + 1))
            sleep 30
        fi
    done
    
    cd "$SCRIPT_DIR"
    print_success "Phase 1B completed: Backend stack deployed with correct SSM configuration"
}

# =============================================================================
# PHASE 2: BUILD AND PUSH BACKEND DOCKER IMAGE
# =============================================================================

build_and_push_backend() {
    print_status "=== PHASE 2: BUILDING AND PUSHING BACKEND ==="
    
    # Get account ID for ECR repository URI
    ACCOUNT_ID=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query Account --output text)
    ECR_REPOSITORY_URI="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/strands-visual-builder-backend"
    
    print_status "Using ECR repository: $ECR_REPOSITORY_URI"
    
    # Navigate to backend directory
    cd "$SCRIPT_DIR/backend"
    
    # Login to ECR
    print_status "Logging in to ECR..."
    aws ecr get-login-password --profile "$AWS_PROFILE" --region "$AWS_REGION" | docker login --username AWS --password-stdin $(echo "$ECR_REPOSITORY_URI" | cut -d'/' -f1)
    
    # Build Docker image with AMD64 architecture
    print_status "Building Docker image with AMD64 architecture..."
    docker build --platform=linux/amd64 -f Dockerfile.backend -t strands-backend .
    
    # Tag and push image to ECR
    print_status "Tagging and pushing image to ECR..."
    docker tag strands-backend:latest "$ECR_REPOSITORY_URI:latest"
    docker push "$ECR_REPOSITORY_URI:latest"
    
    # Verify image exists in ECR
    print_status "Verifying image in ECR..."
    if aws ecr describe-images --profile "$AWS_PROFILE" --region "$AWS_REGION" --repository-name strands-visual-builder-backend --image-ids imageTag=latest &> /dev/null; then
        print_success "Image verified in ECR"
    else
        print_error "Failed to verify image in ECR"
        cd "$SCRIPT_DIR"
        exit 1
    fi
    
    cd "$SCRIPT_DIR"
    print_success "Phase 2 completed: Backend Docker image built and pushed"
}

# =============================================================================
# PHASE 3: AGENTCORE SETUP
# =============================================================================

install_agentcore_toolkit() {
    print_status "Installing AgentCore toolkit and dependencies..."
    
    # Use pip3 if available, otherwise pip
    PIP_CMD="pip3"
    if ! command -v pip3 &> /dev/null; then
        PIP_CMD="pip"
    fi
    
    # Install required packages
    print_status "Installing bedrock-agentcore, strands-agents, and bedrock-agentcore-starter-toolkit..."
    $PIP_CMD install --upgrade bedrock-agentcore strands-agents bedrock-agentcore-starter-toolkit
    
    # Verify installation
    if ! command -v agentcore &> /dev/null; then
        print_error "AgentCore toolkit installation failed - 'agentcore' command not found"
        exit 1
    fi
    
    print_success "AgentCore toolkit installed successfully"
}

prepare_agentcore_deployment() {
    print_status "Preparing AgentCore deployment directory..."
    
    # Create clean deployment directory
    AGENTCORE_DEPLOY_DIR="$SCRIPT_DIR/agentcore-deployment"
    rm -rf "$AGENTCORE_DEPLOY_DIR"
    mkdir -p "$AGENTCORE_DEPLOY_DIR"
    
    # Copy agent file
    cp "$SCRIPT_DIR/expert_agent.py" "$AGENTCORE_DEPLOY_DIR/"
    
    # Copy model_utils.py dependency
    cp "$SCRIPT_DIR/model_utils.py" "$AGENTCORE_DEPLOY_DIR/"
    
    # Copy system prompt markdown file
    cp "$SCRIPT_DIR/backend/strands-visual-builder-system-prompt.md" "$AGENTCORE_DEPLOY_DIR/"
    
    # Copy entire steering directory
    cp -r "$SCRIPT_DIR/backend/steering" "$AGENTCORE_DEPLOY_DIR/"
    
    # Copy tools directory for S3 code storage functionality
    cp -r "$SCRIPT_DIR/backend/tools" "$AGENTCORE_DEPLOY_DIR/"
    
    # Copy services directory for S3 code storage service
    cp -r "$SCRIPT_DIR/backend/services" "$AGENTCORE_DEPLOY_DIR/"
    
    # Create __init__.py to make it a Python package
    touch "$AGENTCORE_DEPLOY_DIR/__init__.py"
    
    # Create requirements.txt with all necessary dependencies
    cat > "$AGENTCORE_DEPLOY_DIR/requirements.txt" << EOF
# Core AgentCore and Strands packages - ALWAYS REQUIRED
bedrock-agentcore>=0.1.0
strands-agents>=1.0.0
strands-agents-tools>=0.1.0

# AWS SDK for Bedrock and other AWS services - ALWAYS REQUIRED
boto3>=1.34.0
botocore>=1.34.0
EOF
    
    print_success "AgentCore deployment directory prepared"
}

create_custom_code_interpreter() {
    print_status "Creating custom AgentCore Code Interpreter with pre-installed Strands packages..."
    
    # Get account ID and parameter base path
    ACCOUNT_ID=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query Account --output text)
    PARAMETER_BASE_PATH="/strands-visual-builder/$ACCOUNT_ID"
    
    # Check if custom code interpreter already exists
    EXISTING_INTERPRETER_ID=$(aws bedrock-agentcore-control list-code-interpreters \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --query "codeInterpreterSummaries[?contains(name, 'strands_visual_builder_shared_interpreter')].codeInterpreterId | [0]" \
        --output text 2>/dev/null)
    
    if [[ -n "$EXISTING_INTERPRETER_ID" && "$EXISTING_INTERPRETER_ID" != "None" ]]; then
        print_success "Custom code interpreter already exists: $EXISTING_INTERPRETER_ID"
        export AGENTCORE_CODE_INTERPRETER_ID="$EXISTING_INTERPRETER_ID"
        return 0
    fi
    
    # Construct the code interpreter execution role ARN
    CODE_INTERPRETER_EXECUTION_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/strands-code-interpreter-execution-role-${ACCOUNT_ID}"
    
    # Verify the role exists
    if ! aws iam get-role --profile "$AWS_PROFILE" --role-name "strands-code-interpreter-execution-role-${ACCOUNT_ID}" &>/dev/null; then
        print_warning "Code interpreter execution role not found. Skipping custom code interpreter creation."
        return 0
    fi
    
    print_status "Using code interpreter execution role: $CODE_INTERPRETER_EXECUTION_ROLE_ARN"
    
    # Create custom code interpreter
    INTERPRETER_ID=$(aws bedrock-agentcore-control create-code-interpreter \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --name "strands_visual_builder_shared_interpreter" \
        --description "Shared Strands testing environment with pre-installed packages" \
        --execution-role-arn "$CODE_INTERPRETER_EXECUTION_ROLE_ARN" \
        --network-configuration '{"networkMode": "PUBLIC"}' \
        --query 'codeInterpreterId' \
        --output text 2>/dev/null)
    
    if [[ -z "$INTERPRETER_ID" || "$INTERPRETER_ID" == "None" ]]; then
        print_warning "Failed to create custom code interpreter. Will use default code interpreter."
        return 0
    fi
    
    print_success "Created custom code interpreter: $INTERPRETER_ID"
    
    # Store interpreter ID in SSM
    aws ssm put-parameter \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --name "$PARAMETER_BASE_PATH/agentcore/code-interpreter-id" \
        --value "$INTERPRETER_ID" \
        --type "String" \
        --description "Custom AgentCore Code Interpreter ID with pre-installed Strands packages" \
        --overwrite > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        print_success "Stored code interpreter ID in SSM"
    else
        print_warning "Failed to store code interpreter ID in SSM"
    fi
    
    # Install Strands packages in the custom interpreter
    print_status "Installing Strands packages in custom code interpreter..."
    
    # Install packages using Python script
    python3 << EOF
import boto3
import json
import time
import sys

try:
    session = boto3.Session(profile_name='$AWS_PROFILE')
    client = session.client('bedrock-agentcore', region_name='$AWS_REGION')
    
    # Start session with 8-hour timeout
    resp = client.start_code_interpreter_session(
        codeInterpreterIdentifier='$INTERPRETER_ID',
        name='strands-setup-session',
        sessionTimeoutSeconds=28800
    )
    session_id = resp['sessionId']
    print('✅ Started setup session:', session_id)
    
    # Install packages
    packages = ['strands-agents', 'strands-agents-tools', 'boto3']
    for pkg in packages:
        print(f'📦 Installing {pkg}...')
        response = client.invoke_code_interpreter(
            codeInterpreterIdentifier='$INTERPRETER_ID',
            sessionId=session_id,
            name='executeCode',
            arguments={
                'code': f'import subprocess; subprocess.check_call(["pip", "install", "{pkg}", "--quiet"])',
                'language': 'python'
            }
        )
        
        # Process response stream
        success = False
        for event in response['stream']:
            if 'result' in event:
                result = event['result']
                if not result.get('isError', False):
                    success = True
                    break
        
        if success:
            print(f'✅ {pkg} installed successfully')
        else:
            print(f'❌ Failed to install {pkg}')
    
    # Test installation
    print('🧪 Testing Strands installation...')
    response = client.invoke_code_interpreter(
        codeInterpreterIdentifier='$INTERPRETER_ID',
        sessionId=session_id,
        name='executeCode',
        arguments={
            'code': '''
try:
    from strands import Agent
    from strands_tools import calculator
    print("✅ Strands packages imported successfully")
    print("✅ Custom code interpreter ready for Strands testing")
except ImportError as e:
    print(f"❌ Import error: {e}")
''',
            'language': 'python'
        }
    )
    
    # Process test results
    for event in response['stream']:
        if 'result' in event:
            result = event['result']
            if 'content' in result:
                for content in result['content']:
                    if content.get('type') == 'text':
                        print(content.get('text', ''))
    
    # Cleanup session
    try:
        client.stop_code_interpreter_session(
            codeInterpreterIdentifier='$INTERPRETER_ID',
            sessionId=session_id
        )
        print('✅ Setup session cleaned up')
    except Exception as e:
        print(f'⚠️  Session cleanup warning: {e}')
    
    print('✅ Custom code interpreter setup completed successfully')
    
except Exception as e:
    print(f'❌ Setup failed: {e}')
    sys.exit(1)
EOF
    
    if [ $? -eq 0 ]; then
        print_success "Custom code interpreter setup completed with pre-installed Strands packages"
    else
        print_warning "Package installation may have failed, but interpreter is created"
    fi
    
    # Export interpreter ID for use in AgentCore Runtime update
    export AGENTCORE_CODE_INTERPRETER_ID="$INTERPRETER_ID"
}

deploy_agentcore_runtime() {
    print_status "Deploying/updating AgentCore Runtime..."
    
    # Get account ID and parameter base path
    ACCOUNT_ID=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query Account --output text)
    PARAMETER_BASE_PATH="/strands-visual-builder/$ACCOUNT_ID"
    
    # Navigate to AgentCore deployment directory
    cd "$AGENTCORE_DEPLOY_DIR"
    
    # Configure AgentCore if not already configured
    if [[ ! -f ".bedrock_agentcore.yaml" ]]; then
        print_status "Configuring AgentCore..."
        
        # Get the AgentCore execution role ARN directly from CloudFormation (more reliable than outputs.json)
        AGENTCORE_EXECUTION_ROLE_ARN=$(aws cloudformation describe-stacks \
            --profile "$AWS_PROFILE" \
            --region "$AWS_REGION" \
            --stack-name strands-foundation-stack \
            --query "Stacks[0].Outputs[?OutputKey=='AgentCoreExecutionRoleArn'].OutputValue" \
            --output text 2>/dev/null)
        
        if [[ -z "$AGENTCORE_EXECUTION_ROLE_ARN" || "$AGENTCORE_EXECUTION_ROLE_ARN" == "None" ]]; then
            print_error "Could not find AgentCore execution role ARN in CloudFormation stack outputs"
            print_error "Make sure strands-foundation-stack deployed successfully"
            cd "$SCRIPT_DIR"
            exit 1
        fi
        
        AWS_PROFILE="$AWS_PROFILE" agentcore configure \
            --entrypoint expert_agent.py \
            --name expert_agent_svbui_a7f3 \
            --execution-role "$AGENTCORE_EXECUTION_ROLE_ARN" \
            --region "$AWS_REGION" \
            --non-interactive
        
        if [ $? -ne 0 ]; then
            print_error "AgentCore configure failed"
            cd "$SCRIPT_DIR"
            exit 1
        fi
        
        # Create custom .dockerignore to include system prompt and steering files
        print_status "Creating custom .dockerignore to include system prompt and steering files..."
        
        # Always overwrite with our custom .dockerignore (this comes after agentcore configure)
        cat > .dockerignore << 'EOF'
# Build artifacts
build/
dist/
*.egg-info/
*.egg

# Python cache
__pycache__/
__pycache__*
*.py[cod]
*$py.class
*.so
.Python

# Virtual environments
.venv/
.env
venv/
env/
ENV/

# Testing
.pytest_cache/
.coverage
.coverage*
htmlcov/
.tox/
*.cover
.hypothesis/
.mypy_cache/
.ruff_cache/

# Development
*.log
*.bak
*.swp
*.swo
*~
.DS_Store

# IDEs
.vscode/
.idea/

# Version control
.git/
.gitignore
.gitattributes

# Documentation - CUSTOM: Allow system prompt and steering files
docs/
# *.md  # Commented out to allow system prompt and steering files
!README.md
!strands-visual-builder-system-prompt.md
!steering/*.md

# CI/CD
.github/
.gitlab-ci.yml
.travis.yml

# Project specific
tests/

# Bedrock AgentCore specific - keep config but exclude runtime files
.bedrock_agentcore.yaml
.dockerignore
.bedrock_agentcore/

# Keep wheelhouse for offline installations
# wheelhouse/
EOF
        
        print_success "Created custom .dockerignore with system prompt and steering files included"
    fi
    
    # Launch AgentCore (handles create/update automatically)
    if [[ "$AGENTCORE_RUNTIME_ONLY" == "true" ]]; then
        print_status "Updating existing AgentCore Runtime with latest code..."
    else
        print_status "Deploying AgentCore Runtime using starter toolkit..."
    fi
    
    # Set AWS credentials explicitly for AgentCore
    export AWS_PROFILE="$AWS_PROFILE"
    export AWS_REGION="$AWS_REGION"
    
    # Prepare environment variables for AgentCore launch
    ENV_ARGS=""
    
    # Add code interpreter ID if available (from create_custom_code_interpreter or SSM)
    if [[ -n "$AGENTCORE_CODE_INTERPRETER_ID" ]]; then
        ENV_ARGS="$ENV_ARGS --env AGENTCORE_CODE_INTERPRETER_ID=$AGENTCORE_CODE_INTERPRETER_ID"
        print_status "Will set AGENTCORE_CODE_INTERPRETER_ID=$AGENTCORE_CODE_INTERPRETER_ID"
    else
        # Check if there's an existing code interpreter ID in SSM
        EXISTING_CODE_INTERPRETER_ID=$(aws ssm get-parameter --profile "$AWS_PROFILE" --region "$AWS_REGION" \
            --name "$PARAMETER_BASE_PATH/agentcore/code-interpreter-id" \
            --query "Parameter.Value" --output text 2>/dev/null || echo "")
        
        if [[ -n "$EXISTING_CODE_INTERPRETER_ID" ]]; then
            ENV_ARGS="$ENV_ARGS --env AGENTCORE_CODE_INTERPRETER_ID=$EXISTING_CODE_INTERPRETER_ID"
            print_status "Will set AGENTCORE_CODE_INTERPRETER_ID=$EXISTING_CODE_INTERPRETER_ID (from SSM)"
        fi
    fi
    
    # Get S3 bucket name from SSM parameter
    TEMP_CODE_BUCKET_NAME=$(aws ssm get-parameter --profile "$AWS_PROFILE" --region "$AWS_REGION" \
        --name "$PARAMETER_BASE_PATH/s3/temp-code-bucket" \
        --query "Parameter.Value" --output text 2>/dev/null || echo "")
    
    if [[ -n "$TEMP_CODE_BUCKET_NAME" ]]; then
        ENV_ARGS="$ENV_ARGS --env TEMP_CODE_BUCKET=$TEMP_CODE_BUCKET_NAME"
        print_status "Will set TEMP_CODE_BUCKET=$TEMP_CODE_BUCKET_NAME"
    fi
    
    # Use local-build to respect our custom .dockerignore and pass environment variables
    print_status "Using local-build mode with environment variables..."
    agentcore launch --local-build --auto-update-on-conflict $ENV_ARGS
    
    if [ $? -ne 0 ]; then
        print_error "AgentCore launch failed"
        cd "$SCRIPT_DIR"
        exit 1
    fi
    
    # Get the AgentCore Runtime ARN
    print_status "Retrieving AgentCore Runtime ARN..."
    sleep 5  # Give AWS a moment to propagate
    
    AGENTCORE_RUNTIME_ARN=$(aws bedrock-agentcore-control list-agent-runtimes \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --query "agentRuntimes[?contains(agentRuntimeName, 'expert_agent') || contains(agentRuntimeName, 'expert-agent')].agentRuntimeArn | [0]" \
        --output text 2>/dev/null)
    
    if [[ -z "$AGENTCORE_RUNTIME_ARN" || "$AGENTCORE_RUNTIME_ARN" == "None" ]]; then
        print_error "Could not retrieve AgentCore Runtime ARN"
        cd "$SCRIPT_DIR"
        exit 1
    fi
    
    print_success "AgentCore Runtime ARN: $AGENTCORE_RUNTIME_ARN"
    
    # Store AgentCore Runtime ARN in SSM (always do this to ensure consistency)
    print_status "Storing AgentCore Runtime ARN in SSM for backend access..."
    
    aws ssm put-parameter \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --name "$PARAMETER_BASE_PATH/agentcore/runtime-arn" \
        --value "$AGENTCORE_RUNTIME_ARN" \
        --type "String" \
        --description "AgentCore Runtime ARN for backend access" \
        --overwrite > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        print_success "AgentCore Runtime ARN stored in SSM: $PARAMETER_BASE_PATH/agentcore/runtime-arn"
    else
        print_warning "Failed to store AgentCore Runtime ARN in SSM"
    fi
    

    
    cd "$SCRIPT_DIR"
    
    if [[ "$AGENTCORE_RUNTIME_ONLY" == "true" ]]; then
        print_success "AgentCore Runtime updated successfully with latest code"
    else
        print_success "AgentCore Runtime deployed successfully"
    fi
}



setup_agentcore() {
    if [[ "$AGENTCORE_RUNTIME_ONLY" == "true" ]]; then
        print_status "=== AGENTCORE RUNTIME UPDATE ==="
        print_status "Updating existing AgentCore Runtime with latest code changes..."
        
        install_agentcore_toolkit
        prepare_agentcore_deployment
        deploy_agentcore_runtime
        # Skip: create_custom_code_interpreter (don't modify existing interpreter)
        
        print_success "AgentCore Runtime update completed"
    else
        print_status "=== PHASE 3: AGENTCORE SETUP ==="
        
        install_agentcore_toolkit
        prepare_agentcore_deployment
        create_custom_code_interpreter
        deploy_agentcore_runtime
        
        print_success "Phase 3 completed: AgentCore setup finished"
    fi
}

# =============================================================================
# PHASE 4: DEPLOY FRONTEND
# =============================================================================

deploy_frontend() {
    print_status "=== PHASE 4: DEPLOYING FRONTEND ==="
    
    # First deploy the frontend stack
    cd "$SCRIPT_DIR/cdk"
    
    # Ensure CDK dependencies are installed (may be called separately)
    if [[ ! -d "node_modules" ]]; then
        print_status "Installing CDK dependencies..."
        npm install
    fi
    
    print_status "Deploying frontend stack..."
    
    if npx cdk deploy StrandsFrontendStack --profile "$AWS_PROFILE" --require-approval never --outputs-file outputs.json; then
        print_success "Frontend stack deployed successfully"
    else
        print_error "Frontend stack deployment failed"
        cd "$SCRIPT_DIR"
        exit 1
    fi
    
    cd "$SCRIPT_DIR"
    
    # Create frontend environment file from CDK outputs
    print_status "Creating frontend environment configuration..."
    
    if [[ ! -f "cdk/outputs.json" ]]; then
        print_error "CDK outputs not found"
        exit 1
    fi
    
    # Extract values from CDK outputs
    USER_POOL_ID=$(jq -r '."strands-auth-stack".UserPoolId // ."StrandsAuthStack".UserPoolId // empty' cdk/outputs.json 2>/dev/null)
    USER_POOL_CLIENT_ID=$(jq -r '."strands-auth-stack".UserPoolClientId // ."StrandsAuthStack".UserPoolClientId // empty' cdk/outputs.json 2>/dev/null)
    CLOUDFRONT_DOMAIN=$(jq -r '."strands-frontend-stack".CloudFrontDistributionDomainName // ."StrandsFrontendStack".CloudFrontDistributionDomainName // empty' cdk/outputs.json 2>/dev/null)
    CLOUDFRONT_ID=$(jq -r '."strands-frontend-stack".CloudFrontDistributionId // ."StrandsFrontendStack".CloudFrontDistributionId // empty' cdk/outputs.json 2>/dev/null)
    FRONTEND_BUCKET=$(jq -r '."strands-storage-stack".FrontendBucketName // ."StrandsStorageStack".FrontendBucketName // empty' cdk/outputs.json 2>/dev/null)
    
    # Validate required values
    if [[ -z "$USER_POOL_ID" || -z "$USER_POOL_CLIENT_ID" || -z "$CLOUDFRONT_DOMAIN" ]]; then
        print_error "Missing required CDK outputs for frontend configuration"
        print_error "USER_POOL_ID: $USER_POOL_ID"
        print_error "USER_POOL_CLIENT_ID: $USER_POOL_CLIENT_ID"
        print_error "CLOUDFRONT_DOMAIN: $CLOUDFRONT_DOMAIN"
        exit 1
    fi
    
    # Create .env file
    cat > ".env" << EOF
# Frontend Configuration - Generated by deployment script
# Generated on $(date)

# AWS Cognito Configuration
VITE_AWS_REGION=$AWS_REGION
VITE_COGNITO_USER_POOL_ID=$USER_POOL_ID
VITE_COGNITO_USER_POOL_CLIENT_ID=$USER_POOL_CLIENT_ID

# Backend API Configuration - Use CloudFront for API proxy
VITE_API_BASE_URL=https://$CLOUDFRONT_DOMAIN

# Production Configuration
VITE_NODE_ENV=production
VITE_DEBUG=false
EOF
    
    print_success "Created frontend environment file: .env"
    
    # Install frontend dependencies
    print_status "Installing frontend dependencies..."
    npm install
    
    # Build frontend
    print_status "Building frontend..."
    VITE_AWS_REGION=$AWS_REGION \
    VITE_COGNITO_USER_POOL_ID=$USER_POOL_ID \
    VITE_COGNITO_USER_POOL_CLIENT_ID=$USER_POOL_CLIENT_ID \
    VITE_API_BASE_URL=https://$CLOUDFRONT_DOMAIN \
    VITE_NODE_ENV=production \
    VITE_DEBUG=false \
    npm run build
    
    if [[ ! -d "dist" ]]; then
        print_error "Frontend build failed - no dist directory"
        exit 1
    fi
    
    # Upload to S3
    print_status "Uploading to S3 bucket: $FRONTEND_BUCKET"
    aws s3 sync dist/ "s3://$FRONTEND_BUCKET" --delete --profile "$AWS_PROFILE" --region "$AWS_REGION"
    
    # Invalidate CloudFront cache
    print_status "Invalidating CloudFront cache: $CLOUDFRONT_ID"
    aws cloudfront create-invalidation --distribution-id "$CLOUDFRONT_ID" --paths "/*" --profile "$AWS_PROFILE" --region "$AWS_REGION"
    
    print_success "Phase 4 completed: Frontend deployed successfully"
}

# =============================================================================
# PHASE 5: CREATE ADMIN USER
# =============================================================================

validate_email() {
    local email="$1"
    if [[ ! "$email" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
        return 1
    fi
    return 0
}

# No password generation needed - Cognito will auto-generate and email to user

create_admin_user() {
    print_status "=== PHASE 5: CREATING ADMIN USER ==="
    
    if [[ -z "$ADMIN_EMAIL" ]]; then
        print_error "Admin email is required for user creation"
        print_error "Use: $0 --email admin@company.com"
        exit 1
    fi
    
    # Validate email format
    if ! validate_email "$ADMIN_EMAIL"; then
        print_error "Invalid email format: $ADMIN_EMAIL"
        print_error "Please provide a valid email address"
        exit 1
    fi
    
    print_status "Creating admin user: $ADMIN_EMAIL"
    
    # Get User Pool ID from CDK outputs
    USER_POOL_ID=$(jq -r '."strands-auth-stack".UserPoolId // ."StrandsAuthStack".UserPoolId // empty' cdk/outputs.json 2>/dev/null)
    
    if [[ -z "$USER_POOL_ID" ]]; then
        print_error "Could not find User Pool ID in CDK outputs"
        exit 1
    fi
    
    print_status "Using User Pool: $USER_POOL_ID"
    
    # Check if user already exists
    if aws cognito-idp admin-get-user \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --user-pool-id "$USER_POOL_ID" \
        --username "$ADMIN_EMAIL" &>/dev/null; then
        
        print_warning "User $ADMIN_EMAIL already exists in User Pool"
        print_status "Skipping user creation"
        return 0
    fi
    
    print_status "Creating user in Cognito User Pool (password will be emailed)..."
    
    CREATE_USER_OUTPUT=$(aws cognito-idp admin-create-user \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --user-pool-id "$USER_POOL_ID" \
        --username "$ADMIN_EMAIL" \
        --user-attributes Name=email,Value="$ADMIN_EMAIL" Name=email_verified,Value=true \
        --force-alias-creation \
        --output json 2>&1)
    
    if [ $? -eq 0 ]; then
        print_success "Admin user created successfully!"
        echo "$CREATE_USER_OUTPUT"
        
        print_success "Temporary password has been sent to: $ADMIN_EMAIL"
        print_warning "Check your email for the temporary password"
        
        # Store credentials for display in summary
        export CREATED_ADMIN_EMAIL="$ADMIN_EMAIL"
        export CREATED_TEMP_PASSWORD="Check email for temporary password"
        
        print_success "Phase 5 completed: Admin user created"
    else
        print_error "Failed to create admin user"
        echo "$CREATE_USER_OUTPUT"
        exit 1
    fi
}

# =============================================================================
# VERIFICATION & SUMMARY
# =============================================================================

verify_deployment() {
    print_status "Verifying deployment..."
    
    if [[ -f "cdk/outputs.json" ]]; then
        # Get backend URL from CDK outputs
        BACKEND_URL=$(jq -r '."strands-backend-stack".ApplicationLoadBalancerUrl // ."StrandsBackendStack".ApplicationLoadBalancerUrl // empty' cdk/outputs.json 2>/dev/null)
        CLOUDFRONT_DOMAIN=$(jq -r '."strands-frontend-stack".CloudFrontDistributionDomainName // ."StrandsFrontendStack".CloudFrontDistributionDomainName // empty' cdk/outputs.json 2>/dev/null)
        
        # Test backend
        if [[ -n "$BACKEND_URL" ]]; then
            print_status "Testing backend at: $BACKEND_URL"
            if curl -s "$BACKEND_URL/ping" | grep -q "ok"; then
                print_success "Backend is responding"
            else
                print_warning "Backend may not be ready yet"
            fi
        fi
        
        # Test frontend
        if [[ -n "$CLOUDFRONT_DOMAIN" ]]; then
            print_status "Testing frontend at: https://$CLOUDFRONT_DOMAIN"
            if curl -s -o /dev/null -w "%{http_code}" "https://$CLOUDFRONT_DOMAIN" | grep -q "200"; then
                print_success "Frontend is accessible"
            else
                print_warning "Frontend may not be immediately accessible (CloudFront propagation)"
            fi
        fi
    fi
}

display_summary() {
    print_status "=== DEPLOYMENT SUMMARY ==="
    
    if [[ -f "cdk/outputs.json" ]]; then
        BACKEND_URL=$(jq -r '."strands-backend-stack".ApplicationLoadBalancerUrl // ."StrandsBackendStack".ApplicationLoadBalancerUrl // empty' cdk/outputs.json 2>/dev/null)
        CLOUDFRONT_DOMAIN=$(jq -r '."strands-frontend-stack".CloudFrontDistributionDomainName // ."StrandsFrontendStack".CloudFrontDistributionDomainName // empty' cdk/outputs.json 2>/dev/null)
        FRONTEND_BUCKET=$(jq -r '."strands-storage-stack".FrontendBucketName // ."StrandsStorageStack".FrontendBucketName // empty' cdk/outputs.json 2>/dev/null)
        
        echo "Backend URL: $BACKEND_URL"
        echo "Frontend URL: https://$CLOUDFRONT_DOMAIN"
        echo "S3 Bucket: $FRONTEND_BUCKET"
        echo "AWS Region: $AWS_REGION"
        echo "AWS Profile: $AWS_PROFILE"
        echo "AgentCore Runtime: $AGENTCORE_RUNTIME_ARN"
    fi
    
    # Display admin user credentials if they were created
    if [[ -n "$CREATED_ADMIN_EMAIL" && -n "$CREATED_TEMP_PASSWORD" ]]; then
        echo ""
        print_status "=== ADMIN USER CREDENTIALS ==="
        echo "📧 Email: $CREATED_ADMIN_EMAIL"
        echo "🔐 Temporary Password: $CREATED_TEMP_PASSWORD"
        echo ""
        print_warning "IMPORTANT: Save these credentials securely!"
        print_warning "You will be prompted to change the password on first login."
        echo ""
    fi
    
    print_success "Deployment completed successfully!"
    echo ""
    print_status "Next steps:"
    echo "1. Test the backend: curl $BACKEND_URL/ping"
    echo "2. Access the frontend: https://$CLOUDFRONT_DOMAIN"
    echo "3. Login with the admin credentials shown above"
    echo "4. Frontend environment is configured in: .env"
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    if [[ "$AGENTCORE_RUNTIME_ONLY" == "true" ]]; then
        print_status "Starting AgentCore Runtime update..."
        print_status "Region: $AWS_REGION"
        print_status "AWS Profile: $AWS_PROFILE"
        echo "AgentCore Runtime update started at $(date)"
        
        # Phase 0: Prerequisites (minimal)
        check_prerequisites
        
        # Phase 3: AgentCore Runtime Update Only
        setup_agentcore
        
        print_success "AgentCore Runtime update completed successfully!"
        print_status "Updated files: expert_agent.py, system prompt, steering files, tools, services"
        return 0
    else
        # Validate required parameters for full deployment
        if [[ -z "$ADMIN_EMAIL" ]]; then
            print_error "Admin email is required for full deployment"
            print_error "Usage: $0 --email admin@company.com"
            print_error "Run '$0 --help' for more information"
            exit 1
        fi
        
        # Validate email format early
        if ! validate_email "$ADMIN_EMAIL"; then
            print_error "Invalid email format: $ADMIN_EMAIL"
            print_error "Please provide a valid email address"
            exit 1
        fi
        
        print_status "Starting Strands Visual Builder streamlined deployment..."
        print_status "Region: $AWS_REGION"
        print_status "AWS Profile: $AWS_PROFILE"
        print_status "Admin Email: $ADMIN_EMAIL"
        echo "Deployment started at $(date)"
        
        # Phase 0: Prerequisites
        check_prerequisites
        check_and_bootstrap_cdk
        
        # Phase 1: Deploy CDK Infrastructure (Foundation, Storage, Auth only)
        deploy_cdk_infrastructure
        
        # Phase 2: Build and Push Backend
        build_and_push_backend
        
        # Phase 3: AgentCore Setup (BEFORE backend deployment so SSM params exist)
        setup_agentcore
        
        # Phase 1B: Deploy Backend Stack (now that image AND SSM params exist)
        deploy_backend_stack
        
        # Phase 4: Deploy Frontend
        deploy_frontend
        
        # Phase 5: Create Admin User
        create_admin_user
        
        # Verification and Summary
        verify_deployment
        display_summary
    fi
}

# Parse command line arguments
ADMIN_EMAIL=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --region)
            AWS_REGION="$2"
            shift 2
            ;;
        --profile)
            AWS_PROFILE="$2"
            shift 2
            ;;
        --agentcore-runtime)
            AGENTCORE_RUNTIME_ONLY=true
            shift
            ;;
        --email)
            ADMIN_EMAIL="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "OPTIONS:"
            echo "  --region REGION        AWS region (default: us-east-1)"
            echo "  --profile PROFILE      AWS profile (default: staging)"
            echo "  --agentcore-runtime    Update only AgentCore Runtime with latest code"
            echo "  --email EMAIL          Admin email for user creation (required for full deployment)"
            echo ""
            echo "DEPLOYMENT MODES:"
            echo "  Full Deployment        Deploy all infrastructure + services + frontend"
            echo "                         Creates admin user with temporary password"
            echo "  AgentCore Runtime Only Update existing AgentCore Runtime with latest:"
            echo "                         - expert_agent.py"
            echo "                         - system prompt"
            echo "                         - steering files"
            echo "                         - tools and services"
            echo ""
            echo "EXAMPLES:"
            echo "  $0 --email admin@company.com          # Full deployment with admin user"
            echo "  $0 --agentcore-runtime               # Update AgentCore Runtime only"
            echo "  $0 --profile prod --region us-west-2 --email admin@company.com # Deploy with specific profile/region"
            echo "  $0 --agentcore-runtime --profile prod # Update runtime with specific profile"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Run main function
main "$@"