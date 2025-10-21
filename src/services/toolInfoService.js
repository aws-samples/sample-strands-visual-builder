/**
 * Service for fetching enhanced tool information from the backend
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

/**
 * Fetch comprehensive information about a specific tool
 * @param {string} toolName - Name of the tool to get information for
 * @returns {Promise<Object>} Tool information object
 */
export const fetchToolInfo = async (toolName) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/tool-info/${toolName}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      return data.tool_info;
    } else {
      throw new Error(data.error || 'Failed to fetch tool information');
    }
  } catch (error) {
    console.error('Error fetching tool info');
    
    // Return fallback information
    return {
      name: toolName,
      description: `Unable to load information for ${toolName}`,
      category: 'Utilities',
      parameters: [],
      signature: 'Unknown',
      return_type: 'Unknown',
      error: error.message
    };
  }
};

/**
 * Cache for tool information to avoid repeated API calls
 */
const toolInfoCache = new Map();

/**
 * Fetch tool information with caching
 * @param {string} toolName - Name of the tool
 * @returns {Promise<Object>} Cached or fresh tool information
 */
export const fetchToolInfoCached = async (toolName) => {
  if (toolInfoCache.has(toolName)) {
    return toolInfoCache.get(toolName);
  }
  
  const toolInfo = await fetchToolInfo(toolName);
  toolInfoCache.set(toolName, toolInfo);
  
  return toolInfo;
};

/**
 * Clear the tool information cache
 */
export const clearToolInfoCache = () => {
  toolInfoCache.clear();
};