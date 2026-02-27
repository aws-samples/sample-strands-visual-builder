"""
AgentCore Invocation Service

Handles invocation of deployed AgentCore agents for chat interactions.
"""

import asyncio
import json
import logging
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, AsyncGenerator
import boto3
from botocore.exceptions import ClientError
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class ChatMessage(BaseModel):
    """Chat message structure"""
    id: str
    type: str  # 'user' | 'assistant' | 'system'
    content: str
    timestamp: datetime
    status: str = 'sent'  # 'sending' | 'sent' | 'error'


class ChatSession(BaseModel):
    """Chat session with deployed agent"""
    session_id: str
    agent_runtime_arn: str
    messages: list[ChatMessage] = []
    is_active: bool = True
    created_at: datetime
    last_activity: datetime


class AgentCoreInvocationService:
    """Service for invoking deployed AgentCore agents"""
    
    def __init__(self):
        self.runtime_client = None
        self.sessions: Dict[str, ChatSession] = {}
        
    def _initialize_client(self, region: str = "us-west-2"):
        """Initialize AgentCore runtime client"""
        logger.info("Initializing AgentCore client")
        self.runtime_client = boto3.client('bedrock-agentcore', region_name=region)
    
    def generate_user_session_id(self, user_email: str, agent_runtime_arn: str) -> str:
        """Generate consistent session ID for user + agent combination"""
        import hashlib
        
        # Create deterministic hash from user + agent
        session_key = f"{user_email}:{agent_runtime_arn}"
        session_hash = hashlib.sha256(session_key.encode()).hexdigest()[:24]  # Use 24 chars for longer hash
        
        # Format: session-{hash}-chat (meets ≥33 char requirement)
        session_id = f"session-{session_hash}-chat"
        return session_id
    
    async def create_chat_session(self, agent_runtime_arn: str, user_email: str = None) -> str:
        """Create user-specific chat session"""
        if not user_email:
            # Fallback to old behavior for backward compatibility
            session_id = str(uuid.uuid4())
            # Using random session ID
        else:
            # Generate consistent session ID for this user + agent
            session_id = self.generate_user_session_id(user_email, agent_runtime_arn)
            
            # Check if session already exists
            if session_id in self.sessions:
                logger.info("Resuming existing session")
                self.sessions[session_id].last_activity = datetime.now()
                return session_id
        
        # Create new session
        session = ChatSession(
            session_id=session_id,
            agent_runtime_arn=agent_runtime_arn,
            created_at=datetime.now(),
            last_activity=datetime.now()
        )
        
        self.sessions[session_id] = session
        
        logger.info("Created new chat session")
        
        return session_id
    
    async def get_chat_session(self, session_id: str) -> Optional[ChatSession]:
        """Get chat session by ID"""
        return self.sessions.get(session_id)
    
    async def invoke_agent(
        self, 
        agent_runtime_arn: str, 
        message: str, 
        session_id: str = None,
        user_email: str = None
    ) -> Dict[str, Any]:
        """Invoke agent with a message"""
        try:
            # Initialize client if needed
            if not self.runtime_client:
                # Extract region from ARN for client initialization
                arn_parts = agent_runtime_arn.split(':')
                region = arn_parts[3] if len(arn_parts) > 3 else 'us-west-2'
                self._initialize_client(region)
            
            # Create session if not provided
            if not session_id:
                session_id = await self.create_chat_session(agent_runtime_arn, user_email)
            
            # Get or create session
            session = self.sessions.get(session_id)
            if not session:
                session_id = await self.create_chat_session(agent_runtime_arn, user_email)
                session = self.sessions[session_id]
            
            # Add user message to session
            user_message = ChatMessage(
                id=str(uuid.uuid4()),
                type='user',
                content=message,
                timestamp=datetime.now()
            )
            session.messages.append(user_message)
            
            # Prepare payload
            payload = json.dumps({
                "prompt": message,
                "session_id": session_id,
                "user_email": user_email  # Pass user email to deployed agent
            }).encode()
            
            # Check agent status first
            try:
                # Extract agent runtime ID and region from ARN
                # ARN format: arn:aws:bedrock-agentcore:region:account:runtime/agent-id
                agent_runtime_id = agent_runtime_arn.split('/')[-1] if '/' in agent_runtime_arn else agent_runtime_arn
                
                # Extract region from ARN
                arn_parts = agent_runtime_arn.split(':')
                region = arn_parts[3] if len(arn_parts) > 3 else 'us-west-2'  # fallback to us-west-2
                
                # Try to get agent runtime status before invoking
                control_client = boto3.client('bedrock-agentcore-control', region_name=region)
                status_response = control_client.get_agent_runtime(agentRuntimeId=agent_runtime_id)
                agent_runtime_info = status_response.get('agentRuntime', {})
                agent_status = agent_runtime_info.get('status', 'UNKNOWN')
                
                logger.info("Checking agent runtime status")
                
                if agent_status == 'FAILED':
                    error_msg = "Agent runtime is in FAILED state"
                    logger.error(error_msg)
                    raise Exception(error_msg)
                elif agent_status == 'CREATING':
                    error_msg = "Agent runtime is still being created"
                    logger.warning(error_msg)
                    raise Exception(error_msg)
                elif agent_status not in ['ACTIVE', 'READY']:
                    error_msg = "Agent runtime is not ready"
                    logger.warning(error_msg)
                    # Don't fail immediately for UNKNOWN status, but log it
                    if agent_status == 'UNKNOWN':
                        logger.warning("Proceeding with invocation despite unknown status")
                    else:
                        raise Exception(error_msg)
                    
            except ClientError as status_error:
                error_code = status_error.response.get('Error', {}).get('Code', 'Unknown')
                if error_code == 'ResourceNotFoundException':
                    error_msg = "Agent runtime does not exist"
                    logger.error(error_msg)
                    raise Exception(error_msg)
                else:
                    logger.warning("Could not check agent status")
                    # If we can't check status for other reasons, proceed with invocation attempt
            except Exception as status_error:
                logger.warning("Could not check agent status")
                # If we can't check status, proceed with invocation attempt
            
            # Invoke agent
            logger.info("Invoking AgentCore runtime")
            
            response = self.runtime_client.invoke_agent_runtime(
                agentRuntimeArn=agent_runtime_arn,
                runtimeSessionId=session_id,
                payload=payload
            )
            
            # Process response
            result = await self._process_response(response)
            
            # Add assistant message to session
            assistant_message = ChatMessage(
                id=str(uuid.uuid4()),
                type='assistant',
                content=result.get('result', 'No response'),
                timestamp=datetime.now()
            )
            session.messages.append(assistant_message)
            session.last_activity = datetime.now()
            
            return {
                'session_id': session_id,
                'response': result.get('result', 'No response'),
                'metadata': result.get('metadata', {}),
                'timestamp': datetime.now().isoformat()
            }
            
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            error_message = e.response.get('Error', {}).get('Message', str(e))
            
            # Provide specific error messages based on error type
            if error_code == 'RuntimeClientError':
                if 'starting the runtime' in error_message:
                    error_msg = "Agent runtime failed to start"
                else:
                    error_msg = "AgentCore runtime error"
            else:
                error_msg = "AgentCore invocation failed"
            
            logger.error(error_msg)
            
            # Add error message to session if we have one
            if session_id and session_id in self.sessions:
                error_message = ChatMessage(
                    id=str(uuid.uuid4()),
                    type='system',
                    content=error_msg,
                    timestamp=datetime.now(),
                    status='error'
                )
                self.sessions[session_id].messages.append(error_message)
            
            raise Exception(error_msg)
    
    async def invoke_agent_streaming(
        self, 
        agent_runtime_arn: str, 
        message: str, 
        session_id: str = None,
        user_email: str = None
    ) -> AsyncGenerator[str, None]:
        """Invoke agent with streaming response"""
        try:
            # Initialize client if needed
            if not self.runtime_client:
                # Extract region from ARN for client initialization
                arn_parts = agent_runtime_arn.split(':')
                region = arn_parts[3] if len(arn_parts) > 3 else 'us-west-2'
                self._initialize_client(region)
            
            # Create session if not provided
            if not session_id:
                session_id = await self.create_chat_session(agent_runtime_arn, user_email)
            
            # Get or create session
            session = self.sessions.get(session_id)
            if not session:
                session_id = await self.create_chat_session(agent_runtime_arn, user_email)
                session = self.sessions[session_id]
            
            # Add user message to session
            user_message = ChatMessage(
                id=str(uuid.uuid4()),
                type='user',
                content=message,
                timestamp=datetime.now()
            )
            session.messages.append(user_message)
            
            # Prepare payload
            payload = json.dumps({
                "prompt": message,
                "session_id": session_id,
                "user_email": user_email  # Pass user email to deployed agent
            }).encode()
            
            # Invoke agent
            response = self.runtime_client.invoke_agent_runtime(
                agentRuntimeArn=agent_runtime_arn,
                runtimeSessionId=session_id,
                payload=payload
            )
            
            # Handle streaming response
            if "text/event-stream" in response.get("contentType", ""):
                content_chunks = []
                
                for line in response["response"].iter_lines():
                    if line:
                        line = line.decode("utf-8")
                        if line.startswith("data: "):
                            chunk = line[6:]  # Remove "data: " prefix
                            content_chunks.append(chunk)
                            yield chunk
                
                # Add complete assistant message to session
                complete_response = "".join(content_chunks)
                assistant_message = ChatMessage(
                    id=str(uuid.uuid4()),
                    type='assistant',
                    content=complete_response,
                    timestamp=datetime.now()
                )
                session.messages.append(assistant_message)
                session.last_activity = datetime.now()
                
            else:
                # Handle non-streaming response - return immediately
                result = await self._process_response(response)
                response_text = result.get('result', 'No response')
                
                # Return the full response at once
                yield response_text
                
                # Add assistant message to session
                assistant_message = ChatMessage(
                    id=str(uuid.uuid4()),
                    type='assistant',
                    content=response_text,
                    timestamp=datetime.now()
                )
                session.messages.append(assistant_message)
                session.last_activity = datetime.now()
                
        except ClientError as e:
            error_msg = "AgentCore streaming invocation failed"
            logger.error(error_msg)
            
            # Add error message to session if we have one
            if session_id and session_id in self.sessions:
                error_message = ChatMessage(
                    id=str(uuid.uuid4()),
                    type='system',
                    content=error_msg,
                    timestamp=datetime.now(),
                    status='error'
                )
                self.sessions[session_id].messages.append(error_message)
            
            yield "Error: Invocation failed"
    
    async def _process_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Process AgentCore response"""
        try:
            if response.get("contentType") == "application/json":
                content = []
                for chunk in response.get("response", []):
                    content.append(chunk.decode('utf-8'))
                
                result = json.loads(''.join(content))
                
                # Extract clean text from the result
                def extract_text_from_any_format(data):
                    """Extract text from various response formats"""
                    if isinstance(data, str):
                        # If it's a string that looks like JSON, try to parse it
                        if data.strip().startswith('{'):
                            try:
                                # Handle single quotes in JSON
                                json_str = data.replace("'", '"')
                                parsed = json.loads(json_str)
                                return extract_text_from_any_format(parsed)
                            except json.JSONDecodeError:
                                pass
                        return data
                    
                    if isinstance(data, dict):
                        # Handle Bedrock format: {'role': 'assistant', 'content': [{'text': '...'}]}
                        if 'content' in data and isinstance(data['content'], list):
                            if len(data['content']) > 0 and 'text' in data['content'][0]:
                                return data['content'][0]['text']
                        
                        # Handle other formats
                        for key in ['result', 'response', 'text', 'message', 'content']:
                            if key in data:
                                return extract_text_from_any_format(data[key])
                    
                    return str(data)
                
                # Try to extract clean text
                if 'result' in result:
                    clean_text = extract_text_from_any_format(result['result'])
                    result['result'] = clean_text
                else:
                    # If no 'result' field, try to extract from the whole response
                    clean_text = extract_text_from_any_format(result)
                    result = {'result': clean_text}
                
                return result
            else:
                # Handle other content types
                content = []
                for chunk in response.get("response", []):
                    content.append(chunk.decode('utf-8'))
                
                return {
                    'result': ''.join(content),
                    'metadata': {'content_type': response.get("contentType")}
                }
                
        except Exception as e:
            logger.error("Failed to process response")
            return {
                'result': 'Error processing response',
                'error': 'Processing error'
            }
    
    async def get_session_history(self, session_id: str) -> list[ChatMessage]:
        """Get chat history for a session"""
        session = self.sessions.get(session_id)
        if not session:
            return []
        
        return session.messages
    
    async def list_active_sessions(self) -> list[ChatSession]:
        """List all active chat sessions"""
        return [session for session in self.sessions.values() if session.is_active]
    
    async def close_session(self, session_id: str) -> bool:
        """Close a chat session"""
        if session_id in self.sessions:
            self.sessions[session_id].is_active = False
            logger.info("Closed chat session")
            return True
        return False
    
    async def delete_session(self, session_id: str) -> bool:
        """Delete a chat session"""
        if session_id in self.sessions:
            del self.sessions[session_id]
            logger.info("Deleted chat session")
            return True
        return False


# Global service instance
agentcore_invocation_service = AgentCoreInvocationService()