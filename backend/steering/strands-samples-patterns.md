---
inclusion: always
---

# Strands Samples and Patterns

## Basic Agent Example

```python
from strands import Agent, tool
from strands_tools import calculator, current_time, python_repl

@tool
def letter_counter(word: str, letter: str) -> int:
    """
    Count the occurrences of a specific letter in a word.
    """
    if not isinstance(word, str) or not isinstance(letter, str):
        return 0
    if len(letter) != 1:
        raise ValueError("The 'letter' parameter must be a single character")
    return word.lower().count(letter.lower())

agent = Agent(tools=[calculator, current_time, python_repl, letter_counter])

message = """
I have 4 requests:

1. What is the time right now?
2. Calculate 3111696 / 74088
3. Tell me how many letter R's are in the word "strawberry" 🍓
4. Output a script that does what we just spoke about!
   Use your python tools to confirm that the script works before outputting it
"""

agent(message)
```

## Installation Pattern

```bash
# Required packages
pip install strands-agents
pip install strands-agents-tools
```

## Custom Tool Pattern

```python
from strands import Agent, tool

@tool
def custom_function(param: str) -> str:
    """
    Tool description for the LLM.
    
    Args:
        param: Description of parameter
        
    Returns:
        Description of return value
    """
    # Implementation
    return result

# Use in agent
agent = Agent(tools=[custom_function])
```

## Multi-Tool Agent Pattern

```python
from strands import Agent
from strands_tools import calculator, current_time, python_repl, file_read, shell

# Combine multiple tools
agent = Agent(tools=[
    calculator,      # Math operations
    current_time,    # Time queries
    python_repl,     # Code execution
    file_read,       # File operations
    shell           # System commands
])

# Agent can use any combination of tools
response = agent("Calculate 2+2, get current time, and list files")
```

## Error Handling Pattern

```python
from strands import Agent, tool

@tool
def safe_operation(input_data: str) -> str:
    """Safe operation with error handling."""
    try:
        # Validate input
        if not isinstance(input_data, str):
            raise ValueError("Input must be a string")
        
        # Process
        result = process_data(input_data)
        return result
        
    except Exception as e:
        return f"Error: {str(e)}"

agent = Agent(tools=[safe_operation])
```

## Type Hints Pattern

```python
from strands import Agent, tool
from typing import List, Dict, Optional

@tool
def typed_function(
    text: str, 
    count: int, 
    options: Optional[List[str]] = None
) -> Dict[str, any]:
    """
    Function with proper type hints.
    
    Args:
        text: Input text to process
        count: Number of operations
        options: Optional list of configuration options
        
    Returns:
        Dictionary with results
    """
    return {
        "processed_text": text.upper(),
        "operation_count": count,
        "options_used": options or []
    }
```

## Best Practices

1. **Always include docstrings** - LLM uses them to understand tool purpose
2. **Use type hints** - Helps with validation and clarity
3. **Handle errors gracefully** - Return meaningful error messages
4. **Validate inputs** - Check parameter types and values
5. **Keep tools focused** - One tool should do one thing well
6. **Use descriptive names** - Tool and parameter names should be clear