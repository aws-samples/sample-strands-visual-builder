#!/bin/bash

# Strands Visual Builder - Simple Development Server Startup
# Backend: port 8080, Frontend: port 7001

set -e

# Default AWS profile
AWS_PROFILE_NAME="default"

# Default agent mode (local agent for development)
USE_AGENTCORE_RUNTIME=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --profile)
            AWS_PROFILE_NAME="$2"
            shift 2
            ;;
        --agentcore-runtime)
            USE_AGENTCORE_RUNTIME=true
            shift
            ;;
        -h|--help)
            echo "Usage: ./start.sh [--profile PROFILE_NAME] [--agentcore-runtime]"
            echo ""
            echo "Options:"
            echo "  --profile PROFILE_NAME    AWS profile to use (default: 'default')"
            echo "  --agentcore-runtime      Use AgentCore runtime expert agent (default: local agent)"
            echo "  -h, --help               Show this help message"
            echo ""
            echo "Agent Modes:"
            echo "  Default (no flag):        Uses local expert agent (fast development)"
            echo "  --agentcore-runtime:      Uses AgentCore runtime expert agent (production testing)"
            echo ""
            echo "Examples:"
            echo "  ./start.sh                              # Use default AWS profile + local agent"
            echo "  ./start.sh --profile cline              # Use 'cline' AWS profile + local agent"
            echo "  ./start.sh --agentcore-runtime          # Use default profile + AgentCore runtime"
            echo "  ./start.sh --profile cline --agentcore-runtime  # Use 'cline' profile + AgentCore runtime"
            exit 0
            ;;
        *)
            echo "❌ Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Set AWS profile environment variable
export AWS_PROFILE="$AWS_PROFILE_NAME"

# Set agent runtime mode environment variable
export USE_AGENTCORE_RUNTIME="$USE_AGENTCORE_RUNTIME"

echo "🚀 Starting Strands Visual Builder..."
echo "🔧 Using AWS profile: $AWS_PROFILE_NAME"

# Display agent mode
if [ "$USE_AGENTCORE_RUNTIME" = "true" ]; then
    echo "🤖 Agent Mode: AgentCore Runtime (remote expert agent)"
    echo "   ⚡ Uses deployed AgentCore runtime for code generation"
    echo "   🔗 Requires AgentCore ARN in SSM parameters"
else
    echo "🏠 Agent Mode: Local Agent (development mode)"
    echo "   ⚡ Uses local expert agent for fast development"
    echo "   🚀 No AWS calls for code generation (faster iteration)"
fi

echo "📋 Configuration will be loaded automatically from SSM Parameters"
echo "💡 No .env files needed - everything is managed via AWS SSM!"

# Verify AWS credentials and SSM access
echo ""
echo "🔍 Verifying AWS credentials and SSM access..."
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo "❌ AWS credentials not configured for profile: $AWS_PROFILE_NAME"
    echo "💡 Please run: aws configure --profile $AWS_PROFILE_NAME"
    exit 1
fi

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
echo "✅ AWS credentials verified for account: $ACCOUNT_ID"

# Check if SSM parameters exist
SSM_PATH="/strands-visual-builder/$ACCOUNT_ID"
if ! aws ssm get-parameters-by-path --path "$SSM_PATH" --query "Parameters[0].Name" --output text > /dev/null 2>&1; then
    echo "❌ SSM parameters not found at path: $SSM_PATH"
    echo "💡 Please deploy infrastructure first: cd cdk && ./deploy.sh --profile $AWS_PROFILE_NAME"
    exit 1
fi

echo "✅ SSM parameters found at path: $SSM_PATH"

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "backend" ]; then
    echo "❌ Please run this script from the prototype-a directory"
    echo "Usage: cd experiments/prototype-a && ./start.sh [--profile PROFILE_NAME]"
    exit 1
fi

echo ""
echo "🔍 Checking if backend is already running..."

# Kill any existing processes on port 8080 first
echo "🧹 Cleaning up port 8080..."
if lsof -i:8080 > /dev/null 2>&1; then
    echo "Found processes on port 8080, killing them..."
    kill -9 "$(lsof -t -i:8080)" 2>/dev/null || true
    sleep 1
    echo "✅ Port 8080 cleaned up"
else
    echo "✅ Port 8080 is already free"
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Ports
BACKEND_PORT=8080
FRONTEND_PORT=7001

# Function to safely kill processes on a specific port
safe_kill_port() {
    local port=$1
    local service_name=$2
    
    echo -e "${YELLOW}🔍 Checking port $port for $service_name...${NC}"
    
    # Find processes using the port
    local pids="$(lsof -ti:"$port" 2>/dev/null || true)"
    
    if [ ! -z "$pids" ]; then
        echo -e "${YELLOW}Found processes on port $port...${NC}"
        
        # Check if any of these are development server processes we can safely kill
        local killable_pids=""
        for pid in $pids; do
            local process_info=$(ps -p $pid -o comm= 2>/dev/null || echo "")
            local process_args=$(ps -p $pid -o args= 2>/dev/null || echo "")
            
            # Skip system processes and browsers
            if [[ "$process_info" == *"ControlCenter"* ]] || \
               [[ "$process_info" == *"System"* ]] || \
               [[ "$process_info" == *"Chrome"* ]] || \
               [[ "$process_info" == *"Safari"* ]] || \
               [[ "$process_info" == *"Firefox"* ]] || \
               [[ "$process_info" == *"Edge"* ]] || \
               [[ "$process_args" == *"Google Chrome"* ]] || \
               [[ "$process_args" == *"Safari"* ]] || \
               [[ "$process_args" == *"Firefox"* ]]; then
                echo -e "${RED}⚠️  Skipping protected process $pid ($process_info) on port $port${NC}"
                echo -e "${YELLOW}💡 Consider using a different port to avoid conflicts${NC}"
            # Only kill development server processes
            elif [[ "$process_args" == *"node"* ]] || \
                 [[ "$process_args" == *"npm"* ]] || \
                 [[ "$process_args" == *"vite"* ]] || \
                 [[ "$process_args" == *"uvicorn"* ]] || \
                 [[ "$process_args" == *"python"* ]] || \
                 [[ "$process_info" == "node" ]] || \
                 [[ "$process_info" == "python"* ]]; then
                killable_pids="$killable_pids $pid"
            else
                echo -e "${YELLOW}⚠️  Skipping unknown process $pid ($process_info) on port $port${NC}"
                echo -e "${YELLOW}💡 Process args: $process_args${NC}"
            fi
        done
        
        if [ ! -z "$killable_pids" ]; then
            echo -e "${YELLOW}Stopping development server processes: $killable_pids${NC}"
            
            # Send TERM signal first (graceful shutdown)
            for pid in $killable_pids; do
                if kill -0 $pid 2>/dev/null; then
                    echo "Stopping process $pid gracefully..."
                    kill -TERM $pid 2>/dev/null || true
                fi
            done
            
            # Wait a moment for graceful shutdown
            sleep 2
            
            # Check if any processes are still running and force kill only dev servers
            local remaining=$(lsof -ti:$port 2>/dev/null || true)
            local remaining_killable=""
            for pid in $remaining; do
                local process_info=$(ps -p $pid -o comm= 2>/dev/null || echo "")
                local process_args=$(ps -p $pid -o args= 2>/dev/null || echo "")
                
                # Only force kill development servers, not browsers or system processes
                if [[ "$process_args" == *"node"* ]] || \
                   [[ "$process_args" == *"npm"* ]] || \
                   [[ "$process_args" == *"vite"* ]] || \
                   [[ "$process_args" == *"uvicorn"* ]] || \
                   [[ "$process_args" == *"python"* ]] || \
                   [[ "$process_info" == "node" ]] || \
                   [[ "$process_info" == "python"* ]]; then
                    remaining_killable="$remaining_killable $pid"
                fi
            done
            
            if [ ! -z "$remaining_killable" ]; then
                echo "Force stopping remaining development processes: $remaining_killable"
                for pid in $remaining_killable; do
                    kill -KILL $pid 2>/dev/null || true
                done
            fi
        fi
        
        # Final check
        local final_pids=$(lsof -ti:$port 2>/dev/null || true)
        if [ ! -z "$final_pids" ]; then
            echo -e "${YELLOW}⚠️  Port $port still has processes running (likely protected processes)${NC}"
        else
            echo -e "${GREEN}✅ Port $port is now available${NC}"
        fi
    else
        echo -e "${GREEN}✅ Port $port is available${NC}"
    fi
}

# Safely clear the ports
safe_kill_port $BACKEND_PORT "backend"
safe_kill_port $FRONTEND_PORT "frontend"

echo ""
echo -e "${BLUE}📦 Installing dependencies...${NC}"

# Backend dependencies
echo -e "${YELLOW}Installing Python backend dependencies...${NC}"
if [ -d "backend" ]; then
    cd backend
    python3 -m pip install -r requirements.txt --quiet
    cd ..
else
    echo -e "${RED}❌ Backend directory not found. Make sure you're in the prototype-a directory${NC}"
    exit 1
fi

# Frontend dependencies  
echo -e "${YELLOW}Installing Node.js frontend dependencies...${NC}"
npm install --silent

echo ""
echo -e "${GREEN}🚀 Starting servers...${NC}"

# Start backend
echo -e "${BLUE}🐍 Starting backend on port $BACKEND_PORT...${NC}"
if [ -d "backend" ]; then
    cd backend
    # Ensure AWS_PROFILE is passed to the backend process
    AWS_PROFILE="$AWS_PROFILE_NAME" python3 -m uvicorn main:app --host 0.0.0.0 --port $BACKEND_PORT --reload &
    BACKEND_PID=$!
    cd ..
else
    echo -e "${RED}❌ Backend directory not found${NC}"
    exit 1
fi

# Wait for backend to start and check health with retries
echo -e "${YELLOW}⏳ Waiting for backend to initialize...${NC}"
for i in {1..10}; do
    sleep 2
    if curl -s http://localhost:$BACKEND_PORT/health > /dev/null 2>&1; then
        # Check if expert agent is ready
        health_status=$(curl -s http://localhost:$BACKEND_PORT/health | grep -o '"expert_agent_ready":[^,]*' | cut -d':' -f2)
        if [[ "$health_status" == "true" ]]; then
            echo -e "${GREEN}✅ Backend and expert agent started successfully${NC}"
            break
        else
            echo -e "${YELLOW}⏳ Expert agent still initializing... (attempt $i/10)${NC}"
        fi
    else
        echo -e "${YELLOW}⏳ Backend starting... (attempt $i/10)${NC}"
    fi
    
    if [ $i -eq 10 ]; then
        echo -e "${RED}❌ Backend failed to start after 20 seconds${NC}"
        kill $BACKEND_PID 2>/dev/null || true
        exit 1
    fi
done

# Start frontend
echo -e "${BLUE}⚛️ Starting frontend on port $FRONTEND_PORT...${NC}"
npm run dev &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}🎉 Strands Visual Builder is running!${NC}"
echo -e "${BLUE}   Frontend: http://localhost:$FRONTEND_PORT${NC}"
echo -e "${BLUE}   Backend:  http://localhost:$BACKEND_PORT${NC}"
echo -e "${BLUE}   Using AWS Profile: $AWS_PROFILE_NAME${NC}"
echo -e "${BLUE}   Account ID: $ACCOUNT_ID${NC}"
echo -e "${BLUE}   User Pool: $(aws ssm get-parameter --name "$SSM_PATH/cognito/user-pool-id" --query "Parameter.Value" --output text 2>/dev/null || echo "Loading...")${NC}"
echo ""
echo -e "${GREEN}Press Ctrl+C to stop all servers.${NC}"

# Cleanup function
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Stopping servers...${NC}"
    
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
    fi
    
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
    fi
    
    # Clean up any remaining processes on our ports
    safe_kill_port $BACKEND_PORT "backend"
    safe_kill_port $FRONTEND_PORT "frontend"
    
    echo -e "${GREEN}✅ Servers stopped${NC}"
    exit 0
}

# Handle Ctrl+C
trap cleanup SIGINT SIGTERM

# Wait for user to stop
wait