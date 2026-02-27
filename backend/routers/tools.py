"""
Tools router for managing available Strands tools
"""
from fastapi import APIRouter, HTTPException
import logging
import pkgutil
import strands_tools
import importlib
import inspect
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["tools"])

def categorize_tool(tool_name: str, docstring: str = "") -> str:
    """Categorize a tool based on its name and docstring content"""
    categories = {
        'Computation': ['calculator', 'python_repl', 'calc', 'math'],
        'File Operations': ['file_read', 'file_write', 'editor', 'file', 'read', 'write'],
        'System': ['shell', 'environment', 'current_time', 'time', 'system', 'env'],
        'Communication': ['http_request', 'slack', 'http', 'request', 'api'],
        'AI Services': ['use_aws', 'generate_image', 'nova_reels', 'image_reader', 'retrieve', 'memory', 'aws', 'generate', 'image'],
        'Multi-Agent': ['swarm', 'workflow', 'graph', 'agent', 'handoff'],
        'Search': ['tavily_search', 'exa_search', 'search'],
        'Media': ['image', 'video', 'nova', 'camera'],
        'Utilities': ['stop', 'speak', 'cron', 'load_tool', 'journal', 'think']
    }
    
    # Check tool name first
    for category, patterns in categories.items():
        if any(pattern in tool_name.lower() for pattern in patterns):
            return category
    
    # Check docstring content
    if docstring:
        docstring_lower = docstring.lower()
        for category, patterns in categories.items():
            if any(pattern in docstring_lower for pattern in patterns):
                return category
    
    return 'Utilities'

def extract_tool_info(tool_func) -> Dict[str, Any]:
    """Extract comprehensive information from a Strands tool function."""
    try:
        signature = inspect.signature(tool_func)
        docstring = inspect.getdoc(tool_func) or "No description available"
        
        # Parse parameters with detailed information
        parameters = []
        for param_name, param in signature.parameters.items():
            param_info = {
                'name': param_name,
                'type': str(param.annotation) if param.annotation != param.empty else 'Any',
                'default': str(param.default) if param.default != param.empty else None,
                'required': param.default == param.empty,
                'description': extract_param_description(docstring, param_name)
            }
            parameters.append(param_info)
        
        # Extract return type
        return_type = str(signature.return_annotation) if signature.return_annotation != signature.empty else 'Any'
        
        # Parse docstring for description and examples
        description, examples, usage_notes = parse_docstring(docstring)
        
        return {
            'name': tool_func.__name__,
            'signature': str(signature),
            'docstring': docstring,
            'description': description,
            'parameters': parameters,
            'return_type': return_type,
            'category': categorize_tool(tool_func.__name__, docstring),
            'examples': examples,
            'usage_notes': usage_notes,
            'module': getattr(tool_func, '__module__', 'unknown')
        }
    except Exception as e:
        logger.error("Error extracting tool info")
        return {
            'name': getattr(tool_func, '__name__', 'unknown'),
            'signature': 'Unable to extract signature',
            'docstring': 'Unable to extract documentation',
            'description': 'Tool information unavailable',
            'parameters': [],
            'return_type': 'Unknown',
            'category': 'Utilities',
            'examples': [],
            'usage_notes': [],
            'error': str(e)
        }

def extract_param_description(docstring: str, param_name: str) -> Optional[str]:
    """Extract parameter description from docstring."""
    if not docstring:
        return None
    
    lines = docstring.split('\n')
    in_args_section = False
    
    for line in lines:
        line = line.strip()
        if line.lower().startswith('args:') or line.lower().startswith('parameters:'):
            in_args_section = True
            continue
        elif line.lower().startswith('returns:') or line.lower().startswith('yields:'):
            in_args_section = False
            continue
        elif in_args_section and line.startswith(f'{param_name}:'):
            return line.split(':', 1)[1].strip()
        elif in_args_section and line.startswith(f'{param_name} '):
            # Handle format like "param_name (type): description"
            if ':' in line:
                return line.split(':', 1)[1].strip()
    
    return None

def parse_docstring(docstring: str) -> tuple[str, List[str], List[str]]:
    """Parse docstring to extract description, examples, and usage notes."""
    if not docstring:
        return "No description available", [], []
    
    lines = docstring.split('\n')
    description_lines = []
    examples = []
    usage_notes = []
    
    current_section = 'description'
    
    for line in lines:
        original_line = line
        line = line.strip()
        
        # Check for section headers
        if line.lower().startswith('example'):
            current_section = 'examples'
            continue
        elif line.lower().startswith('usage'):
            current_section = 'usage'
            continue
        elif line.lower().startswith('args:') or line.lower().startswith('parameters:'):
            current_section = 'args'
            continue
        elif line.lower().startswith('returns:'):
            current_section = 'returns'
            continue
        
        # Add content to appropriate section
        if current_section == 'description' and not line.lower().startswith(('args:', 'parameters:', 'returns:', 'example', 'usage')):
            if line:  # Only add non-empty lines
                description_lines.append(line)
            elif description_lines and description_lines[-1] != '':  # Add empty line for paragraph breaks, but avoid duplicates
                description_lines.append('')
        elif current_section == 'examples' and line:
            examples.append(line)
        elif current_section == 'usage' and line:
            usage_notes.append(line)
    
    # Clean up description: remove trailing empty lines and format sections
    while description_lines and description_lines[-1] == '':
        description_lines.pop()
    
    # Join description lines with newlines to preserve formatting
    if description_lines:
        # Add double newlines between sections that look like headers
        formatted_lines = []
        for i, line in enumerate(description_lines):
            if (line.endswith(':') and len(line) < 100 and 
                i > 0 and description_lines[i-1] != ''):
                # This looks like a section header, add extra spacing before it
                formatted_lines.append('')
                formatted_lines.append(line)
            else:
                formatted_lines.append(line)
        
        description = '\n'.join(formatted_lines).strip()
    else:
        description = "No description available"
    
    return description, examples, usage_notes

@router.get("/available-tools")
async def get_available_tools():
    """Get all available tools from strands_tools package dynamically"""
    try:
        tools = []
        
        # Discover all tools in the strands_tools package
        for importer, modname, ispkg in pkgutil.iter_modules(strands_tools.__path__):
            if not ispkg:  # Only include modules, not packages
                try:
                    # Try to import the module to get more info
                    # ruleid: python.lang.security.audit.non-literal-import.non-literal-import
                    # This imports from trusted AWS strands_tools package, not user input
                    module = importlib.import_module(f'strands_tools.{modname}')  # nosemgrep
                    
                    # Try to get description from module docstring or function docstring
                    description = "Strands tool"
                    if hasattr(module, '__doc__') and module.__doc__:
                        description = module.__doc__.strip().split('\n')[0]
                    
                    # Categorize tools based on name patterns
                    category = categorize_tool(modname)
                    
                    tools.append({
                        "name": modname,
                        "type": "builtin",
                        "description": description,
                        "category": category
                    })
                except ImportError:
                    # Skip tools that can't be imported
                    continue
        
        return {
            "success": True,
            "tools": tools,
            "count": len(tools)
        }
        
    except Exception as e:
        logger.error("Failed to get available tools")
        return {
            "success": False,
            "error": "Failed to get available tools",
            "tools": []
        }

@router.get("/tool-info/{tool_name}")
async def get_tool_info(tool_name: str):
    """Get comprehensive information about a specific Strands tool"""
    try:
        # Import the tool module
        # ruleid: python.lang.security.audit.non-literal-import.non-literal-import
        # This imports from trusted AWS strands_tools package, not user input
        module = importlib.import_module(f'strands_tools.{tool_name}')  # nosemgrep
        
        # Try to get the tool function - it might be the module itself or a function within
        tool_func = None
        
        # First, try to get a function with the same name as the module
        if hasattr(module, tool_name):
            tool_func = getattr(module, tool_name)
        # If not found, look for common function names
        elif hasattr(module, 'main'):
            tool_func = getattr(module, 'main')
        elif hasattr(module, 'run'):
            tool_func = getattr(module, 'run')
        else:
            # Get the first callable that's not a built-in
            for attr_name in dir(module):
                attr = getattr(module, attr_name)
                if callable(attr) and not attr_name.startswith('_') and hasattr(attr, '__module__'):
                    if attr.__module__ == module.__name__:
                        tool_func = attr
                        break
        
        if not tool_func:
            raise ValueError(f"Could not find callable function in tool module {tool_name}")
        
        # Extract comprehensive tool information
        tool_info = extract_tool_info(tool_func)
        
        return {
            "success": True,
            "tool_info": tool_info
        }
        
    except ImportError as e:
        logger.error("Tool not found")
        raise HTTPException(status_code=404, detail="Tool not found")
    except Exception as e:
        logger.error("Failed to get tool info")
        return {
            "success": False,
            "error": "Failed to get tool info",
            "tool_info": {
                "name": tool_name,
                "description": "Unable to load tool information",
                "category": "Utilities",
                "parameters": [],
                "signature": "Unknown",
                "return_type": "Unknown"
            }
        }