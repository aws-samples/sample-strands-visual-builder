# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""
S3 Code Storage Tool for Expert Agent

This tool allows the expert agent to save generated code files to S3 temporary storage.
It supports both pure Strands code and AgentCore-ready code.
"""

from strands import tool
from typing import Dict, Any
import logging
import sys
import os

# Add the backend directory to the path so we can import services
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.append(backend_dir)

from services.s3_code_storage_service import S3CodeStorageService

logger = logging.getLogger(__name__)



@tool
def s3_write_code(session_id: str, code_content: str, code_type: str, file_extension: str = '.py') -> Dict[str, Any]:
    """
    Write code content to S3 temporary storage for later retrieval by the frontend.
    
    This tool allows the expert agent to save pure Strands code, AgentCore-ready code,
    and requirements.txt files to S3 temporary storage. The frontend can then fetch 
    these files using the returned S3 URIs.
    
    Args:
        session_id: Unique session identifier (typically provided by the frontend)
        code_content: The complete code/text content to store
        code_type: Type of code - must be 'pure_strands', 'agentcore_ready', 'mcp_server', or 'requirements'
        file_extension: File extension to use (default: '.py', use '.txt' for requirements)
        
    Returns:
        Dictionary containing:
        - status: 'success' or 'error'
        - s3_uri: S3 URI for the stored file (if successful)
        - error: Error message (if failed)
        - Additional metadata about the stored file
        
    Examples:
        # Store Python code
        result = s3_write_code(
            session_id="user123_20250101_120000",
            code_content="from strands import Agent\nagent = Agent()\nresult = agent('Hello')",
            code_type="pure_strands"
        )
        
        # Store requirements.txt
        result = s3_write_code(
            session_id="user123_20250101_120000",
            code_content="bedrock-agentcore>=0.1.0\nstrands-agents>=1.0.0\nstrands-agents-tools>=0.1.0",
            code_type="requirements",
            file_extension=".txt"
        )
    """
    try:
        # Validate inputs
        if not session_id or not session_id.strip():
            return {
                "status": "error",
                "error": "session_id is required and cannot be empty"
            }
        
        if not code_content or not code_content.strip():
            return {
                "status": "error", 
                "error": "code_content is required and cannot be empty"
            }
        
        if code_type not in ['pure_strands', 'agentcore_ready', 'mcp_server', 'requirements']:
            return {
                "status": "error",
                "error": f"code_type must be 'pure_strands', 'agentcore_ready', 'mcp_server', or 'requirements', got: {code_type}"
            }
        
        # Initialize S3 service
        s3_service = S3CodeStorageService()
        
        # Store the code file
        result = s3_service.store_code_file(
            session_id=session_id,
            code_content=code_content,
            code_type=code_type,
            file_extension=file_extension
        )
        
        if result['status'] == 'success':
            logger.info("Successfully stored code")
            return {
                "status": "success",
                "content": [
                    {"text": f"✅ Successfully stored {code_type} code to S3"},
                    {"text": f"S3 URI: {result['s3_uri']}"},
                    {"text": f"Session ID: {session_id}"},
                    {"text": f"Code length: {result['content_length']} characters"}
                ],
                "s3_uri": result['s3_uri'],
                "session_id": session_id,
                "code_type": code_type
            }
        else:
            logger.error("Failed to store code")
            return {
                "status": "error",
                "content": [
                    {"text": f"❌ Failed to store {code_type} code to S3"},
                    {"text": f"Error: {result.get('error', 'Unknown error')}"}
                ],
                "error": result.get('error', 'Unknown error')
            }
            
    except Exception as e:
        logger.error("Unexpected error in s3_write_code")
        return {
            "status": "error",
            "content": [
                {"text": f"❌ Unexpected error storing code to S3"},
                {"text": f"Error: {str(e)}"}
            ],
            "error": f"Unexpected error: {str(e)}"
        }

@tool
def s3_write_all_code(
    session_id: str,
    pure_strands_code: str,
    agentcore_ready_code: str,
    mcp_server_code: str,
    requirements_txt: str
) -> Dict[str, Any]:
    """
    Save all four code files to S3 in a single call.

    Saves pure_strands.py, agentcore_ready.py, mcp_server.py, and requirements.txt
    to the temporary code S3 bucket. Returns S3 URIs for all files.

    This is the preferred tool for saving generated code — it replaces making
    four separate s3_write_code calls with one batch operation.

    Args:
        session_id: Unique session identifier (typically provided by the frontend)
        pure_strands_code: The pure Strands agent code
        agentcore_ready_code: The AgentCore-wrapped version
        mcp_server_code: The FastMCP server version
        requirements_txt: The requirements.txt content

    Returns:
        Dictionary containing:
        - status: 'success' or 'partial' or 'error'
        - files: Dict mapping code_type to its S3 URI
        - errors: List of any per-file errors
    """
    try:
        if not session_id or not session_id.strip():
            return {
                "status": "error",
                "error": "session_id is required and cannot be empty"
            }

        s3_service = S3CodeStorageService()

        files_to_save = [
            ("pure_strands", pure_strands_code, ".py"),
            ("agentcore_ready", agentcore_ready_code, ".py"),
            ("mcp_server", mcp_server_code, ".py"),
            ("requirements", requirements_txt, ".txt"),
        ]

        saved_uris = {}
        errors = []

        for code_type, content, ext in files_to_save:
            if not content or not content.strip():
                errors.append(f"{code_type}: empty content, skipped")
                continue

            result = s3_service.store_code_file(
                session_id=session_id,
                code_content=content,
                code_type=code_type,
                file_extension=ext
            )

            if result["status"] == "success":
                saved_uris[code_type] = result["s3_uri"]
            else:
                errors.append(f"{code_type}: {result.get('error', 'Unknown error')}")

        if not saved_uris:
            return {
                "status": "error",
                "content": [{"text": "❌ Failed to save any files to S3"}],
                "errors": errors,
            }

        status = "success" if not errors else "partial"
        content_lines = [{"text": f"✅ Saved {len(saved_uris)}/4 files to S3"}]
        for code_type, uri in saved_uris.items():
            content_lines.append({"text": f"  {code_type}: {uri}"})
        if errors:
            for err in errors:
                content_lines.append({"text": f"  ⚠️ {err}"})

        return {
            "status": status,
            "content": content_lines,
            "files": saved_uris,
            "session_id": session_id,
            "errors": errors,
        }

    except Exception as e:
        logger.error("Unexpected error in s3_write_all_code")
        return {
            "status": "error",
            "content": [{"text": f"❌ Unexpected error saving code to S3: {str(e)}"}],
            "error": f"Unexpected error: {str(e)}",
        }


@tool
def s3_read_code(session_id: str, code_type: str) -> Dict[str, Any]:
    """
    Read code content from S3 temporary storage.
    
    This tool allows retrieval of previously stored code files from S3.
    
    Args:
        session_id: Unique session identifier
        code_type: Type of code - must be 'pure_strands', 'agentcore_ready', 'mcp_server', or 'requirements'
        
    Returns:
        Dictionary containing:
        - status: 'success', 'not_found', or 'error'
        - code_content: The retrieved code content (if successful)
        - error: Error message (if failed)
        
    Example:
        result = s3_read_code(
            session_id="user123_20250101_120000",
            code_type="pure_strands"
        )
    """
    try:
        # Validate inputs
        if not session_id or not session_id.strip():
            return {
                "status": "error",
                "error": "session_id is required and cannot be empty"
            }
        
        if code_type not in ['pure_strands', 'agentcore_ready', 'mcp_server', 'requirements']:
            return {
                "status": "error",
                "error": f"code_type must be 'pure_strands', 'agentcore_ready', 'mcp_server', or 'requirements', got: {code_type}"
            }
        
        # Initialize S3 service
        s3_service = S3CodeStorageService()
        
        # Retrieve the code file
        result = s3_service.get_code_file(
            session_id=session_id,
            code_type=code_type
        )
        
        if result['status'] == 'success':
            logger.info("Successfully retrieved code")
            return {
                "status": "success",
                "content": [
                    {"text": f"✅ Successfully retrieved {code_type} code from S3"},
                    {"text": f"Code length: {result['content_length']} characters"},
                    {"text": f"Last modified: {result.get('last_modified', 'Unknown')}"}
                ],
                "code_content": result['code_content'],
                "session_id": session_id,
                "code_type": code_type
            }
        elif result['status'] == 'not_found':
            return {
                "status": "not_found",
                "content": [
                    {"text": f"❌ Code file not found in S3"},
                    {"text": f"Session: {session_id}, Type: {code_type}"}
                ],
                "error": result.get('error', 'File not found')
            }
        else:
            logger.error("Failed to retrieve code")
            return {
                "status": "error",
                "content": [
                    {"text": f"❌ Failed to retrieve {code_type} code from S3"},
                    {"text": f"Error: {result.get('error', 'Unknown error')}"}
                ],
                "error": result.get('error', 'Unknown error')
            }
            
    except Exception as e:
        logger.error("Unexpected error in s3_read_code")
        return {
            "status": "error",
            "content": [
                {"text": f"❌ Unexpected error retrieving code from S3"},
                {"text": f"Error: {str(e)}"}
            ],
            "error": f"Unexpected error: {str(e)}"
        }

@tool
def s3_list_session_files(session_id: str) -> Dict[str, Any]:
    """
    List all code files stored for a specific session.
    
    Args:
        session_id: Unique session identifier
        
    Returns:
        Dictionary containing:
        - status: 'success' or 'error'
        - files: List of file information (if successful)
        - count: Number of files found
        - error: Error message (if failed)
    """
    try:
        if not session_id or not session_id.strip():
            return {
                "status": "error",
                "error": "session_id is required and cannot be empty"
            }
        
        # Initialize S3 service
        s3_service = S3CodeStorageService()
        
        # List files for the session
        result = s3_service.list_session_files(session_id)
        
        if result['status'] == 'success':
            files = result['files']
            logger.info("Found session files")
            
            content = [{"text": f"✅ Found {len(files)} files for session {session_id}"}]
            for file in files:
                content.append({
                    "text": f"  - {file['code_type']}.py ({file['size']} bytes, modified: {file['last_modified']})"
                })
            
            return {
                "status": "success",
                "content": content,
                "files": files,
                "count": len(files),
                "session_id": session_id
            }
        else:
            return {
                "status": "error",
                "content": [
                    {"text": f"❌ Failed to list files for session {session_id}"},
                    {"text": f"Error: {result.get('error', 'Unknown error')}"}
                ],
                "error": result.get('error', 'Unknown error')
            }
            
    except Exception as e:
        logger.error("Unexpected error in s3_list_session_files")
        return {
            "status": "error",
            "content": [
                {"text": f"❌ Unexpected error listing session files"},
                {"text": f"Error: {str(e)}"}
            ],
            "error": f"Unexpected error: {str(e)}"
        }