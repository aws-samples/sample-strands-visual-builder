/**
 * Python Execution Utilities for Strands Visual Builder - Prototype A
 * Handles execution of generated Python code with real subprocess execution
 */

import { authService } from '../services/authService.js';

const BACKEND_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

// Global settings provider reference
let settingsProvider = null;

/**
 * Set the settings provider to get configurable timeouts
 */
export function setSettingsProvider(provider) {
  settingsProvider = provider;
}

/**
 * Get timeout value from settings or use default
 */
function getTimeout(timeoutType, defaultValue) {
  if (settingsProvider && settingsProvider.settings) {
    return settingsProvider.settings[timeoutType] || defaultValue;
  }
  return defaultValue;
}

/**
 * Get authenticated headers for API requests
 */
async function getAuthHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  };

  try {
    const token = await authService.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch (error) {
    console.warn('Failed to get auth token for Python execution');
    // Continue without auth - backend will return 403 if auth is required
  }

  return headers;
}

/**
 * Execute Python code using real subprocess execution via backend
 */
export async function executePythonCode(code, options = {}) {
  const {
    timeout = getTimeout('pythonExecutionTimeout', 60000), // Use configurable timeout
    testQuery = null,
    execution_environment = "python_repl"
  } = options;

  try {
    // First try real execution via backend
    const realResult = await executeRealPython(code, { timeout, testQuery, execution_environment });
    return realResult;
    
  } catch (error) {
    console.warn('Real Python execution failed, falling back to simulation');
    
    // Fallback to simulation with clear warning
    const simulatedResult = await simulatePythonExecution(code, { timeout });
    return {
      ...simulatedResult,
      isSimulated: true,
      error: simulatedResult.error ? 
        `${simulatedResult.error} (Backend unavailable - using simulation)` : 
        null
    };
  }
}

/**
 * Execute Python code via backend service with real subprocess
 */
async function executeRealPython(code, options = {}) {
  const { timeout = getTimeout('pythonExecutionTimeout', 60000), testQuery = null, execution_environment = "python_repl" } = options;
  
  // Set up request timeout
  const requestTimeout = getTimeout('backendRequestTimeout', 45000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), requestTimeout);
  
  const headers = await getAuthHeaders();
  const response = await fetch(`${BACKEND_URL}/execute-python`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      code: code,
      testQuery: testQuery,
      timeout: Math.floor(timeout / 1000), // Convert to seconds
      execution_environment: execution_environment
    }),
    signal: controller.signal
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`Backend execution failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  
  // Convert execution time to milliseconds for consistency
  return {
    ...result,
    executionTime: result.executionTime * 1000,
    isSimulated: false
  };
}

/**
 * Simulate Python execution for development/testing
 * In production, this would be replaced with actual subprocess execution
 */
async function simulatePythonExecution(code, options = {}) {
  const { timeout = 30000 } = options;
  
  return new Promise((resolve) => {
    // Simulate execution delay
    const executionTime = Math.random() * 2000 + 500; // 500ms to 2.5s
    
    setTimeout(() => {
      try {
        // Basic code analysis for simulation
        const result = analyzeAndSimulateCode(code);
        
        resolve({
          success: result.success,
          output: result.output,
          error: result.error,
          executionTime: executionTime,
          metadata: {
            codeLength: code.length,
            linesOfCode: code.split('\n').length,
            simulatedExecution: true
          }
        });
      } catch (error) {
        resolve({
          success: false,
          output: '',
          error: `Simulation error: ${error.message}`,
          executionTime: executionTime
        });
      }
    }, Math.min(executionTime, timeout));
  });
}

/**
 * Analyze code and simulate execution results
 */
function analyzeAndSimulateCode(code) {
  // Check for common patterns and simulate appropriate responses
  
  // Check for syntax errors (basic validation)
  if (hasSyntaxErrors(code)) {
    return {
      success: false,
      output: '',
      error: 'SyntaxError: invalid syntax'
    };
  }
  
  // Check for missing imports
  const missingImports = checkMissingImports(code);
  if (missingImports.length > 0) {
    return {
      success: false,
      output: '',
      error: `ModuleNotFoundError: No module named '${missingImports[0]}'`
    };
  }
  
  // Simulate successful execution
  let output = 'Testing agent...\n\nAgent Response:\n';
  
  // Analyze the test query to generate appropriate response
  const testQueryMatch = code.match(/agent\("([^"]+)"\)/);
  if (testQueryMatch) {
    const query = testQueryMatch[1];
    output += generateSimulatedResponse(query, code);
  } else {
    output += 'Hello! I\'m ready to help you with various tasks using my available tools.';
  }
  
  return {
    success: true,
    output: output,
    error: null
  };
}

/**
 * Basic syntax error detection
 */
function hasSyntaxErrors(code) {
  // Check for common syntax issues
  const lines = code.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check for unmatched quotes
    if (hasUnmatchedQuotes(line)) {
      return true;
    }
    
    // Check for unmatched parentheses in function definitions
    if (line.startsWith('def ') && !line.includes(':')) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check for unmatched quotes in a line
 */
function hasUnmatchedQuotes(line) {
  let singleQuotes = 0;
  let doubleQuotes = 0;
  let inString = false;
  let stringChar = null;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const prevChar = i > 0 ? line[i - 1] : null;
    
    if (!inString) {
      if (char === '"' && prevChar !== '\\') {
        inString = true;
        stringChar = '"';
        doubleQuotes++;
      } else if (char === "'" && prevChar !== '\\') {
        inString = true;
        stringChar = "'";
        singleQuotes++;
      }
    } else {
      if (char === stringChar && prevChar !== '\\') {
        inString = false;
        stringChar = null;
      }
    }
  }
  
  return inString || (singleQuotes % 2 !== 0) || (doubleQuotes % 2 !== 0);
}

/**
 * Check for missing imports
 */
function checkMissingImports(code) {
  const requiredModules = [];
  
  // Check if strands is imported when Agent is used
  if (code.includes('Agent(') && !code.includes('from strands import')) {
    requiredModules.push('strands');
  }
  
  // Check for tool usage without imports
  const toolPattern = /from strands_tools import ([^\\n]+)/;
  const toolImportMatch = code.match(toolPattern);
  const importedTools = toolImportMatch ? toolImportMatch[1].split(',').map(t => t.trim()) : [];
  
  // Check if tools are used in the agent definition
  const agentPattern = /tools=\[([^\]]+)\]/;
  const agentMatch = code.match(agentPattern);
  if (agentMatch) {
    const usedTools = agentMatch[1].split(',').map(t => t.trim());
    for (const tool of usedTools) {
      if (!importedTools.includes(tool) && !code.includes(`def ${tool}(`)) {
        requiredModules.push('strands_tools');
        break;
      }
    }
  }
  
  return requiredModules;
}

/**
 * Generate simulated agent response based on query and available tools
 */
function generateSimulatedResponse(query, code) {
  const lowerQuery = query.toLowerCase();
  
  // Extract tools from the code
  const tools = extractToolsFromCode(code);
  
  // Generate contextual responses based on query and available tools
  if (lowerQuery.includes('calculate') || lowerQuery.includes('math') || /\d+.*[\+\-\*\/].*\d+/.test(lowerQuery)) {
    if (tools.includes('calculator')) {
      const mathMatch = lowerQuery.match(/(\d+(?:\.\d+)?)\s*[\+\-\*\/]\s*(\d+(?:\.\d+)?)/);
      if (mathMatch) {
        const result = evaluateSimpleMath(lowerQuery);
        return `I'll help you with that calculation.\n\nUsing the calculator tool: ${result}`;
      }
    }
    return 'I can help with calculations using my calculator tool.';
  }
  
  if (lowerQuery.includes('time') || lowerQuery.includes('date')) {
    if (tools.includes('current_time')) {
      const now = new Date();
      return `The current time is ${now.toLocaleString()}.`;
    }
    return 'I can help you get the current time using my time tool.';
  }
  
  if (lowerQuery.includes('file') || lowerQuery.includes('read') || lowerQuery.includes('write')) {
    if (tools.includes('file_read') || tools.includes('file_write')) {
      return 'I can help you with file operations using my file tools.';
    }
  }
  
  if (lowerQuery.includes('search') || lowerQuery.includes('web')) {
    if (tools.includes('tavily_search') || tools.includes('exa_search')) {
      return 'I can search the web for information using my search tools.';
    }
  }
  
  if (lowerQuery.includes('image') || lowerQuery.includes('picture')) {
    if (tools.includes('generate_image')) {
      return 'I can generate images using my image generation tool.';
    }
    if (tools.includes('image_reader')) {
      return 'I can analyze images using my image reading tool.';
    }
  }
  
  // Default response
  const toolList = tools.length > 0 ? `\n\nAvailable tools: ${tools.join(', ')}` : '';
  return `Hello! I'm ready to help you with various tasks.${toolList}`;
}

/**
 * Extract tools from generated code
 */
function extractToolsFromCode(code) {
  const tools = [];
  
  // Extract from imports
  const importMatch = code.match(/from strands_tools import ([^\\n]+)/);
  if (importMatch) {
    const importedTools = importMatch[1].split(',').map(t => t.trim());
    tools.push(...importedTools);
  }
  
  // Extract custom tools
  const customToolMatches = code.matchAll(/def (\w+)\([^)]*\):/g);
  for (const match of customToolMatches) {
    if (match[1] !== '__main__') {
      tools.push(match[1]);
    }
  }
  
  return tools;
}

/**
 * Evaluate simple math expressions for simulation
 */
function evaluateSimpleMath(expression) {
  try {
    // Extract numbers and operators
    const mathMatch = expression.match(/(\d+(?:\.\d+)?)\s*([\+\-\*\/])\s*(\d+(?:\.\d+)?)/);
    if (mathMatch) {
      const [, num1, operator, num2] = mathMatch;
      const a = parseFloat(num1);
      const b = parseFloat(num2);
      
      switch (operator) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return b !== 0 ? a / b : 'Error: Division by zero';
        default: return 'Unknown operation';
      }
    }
  } catch (error) {
    return 'Calculation error';
  }
  
  return 'Could not parse expression';
}



/**
 * Save generated code to file (for real implementation)
 */
export async function saveCodeToFile(code, filename = 'generated_agent.py') {
  try {
    // In a real implementation, this would save to the file system
    // For now, we'll create a downloadable blob
    
    const blob = new Blob([code], { type: 'text/python' });
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
    
    return {
      success: true,
      filename: filename,
      path: `Downloaded as ${filename}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

export default {
  executePythonCode,
  saveCodeToFile,
  setSettingsProvider
};