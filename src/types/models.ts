/**
 * TypeScript interfaces for model-related data structures
 */

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  category?: string;
  description?: string;
  capabilities?: string[];
  inputModalities?: string[];
  outputModalities?: string[];
  responseStreamingSupported?: boolean;
  recommended?: boolean;
  available?: boolean;
}

export interface ModelCacheEntry {
  models: ModelOption[];
  timestamp: number;
  expiresAt: number;
}

export interface ModelServiceResponse {
  success: boolean;
  models: ModelOption[];
  cached?: boolean;
  warning?: string;
  error?: string;
}

export interface ModelCategoryResponse {
  success: boolean;
  categories: Record<string, ModelOption[]>;
  providerGroups: Record<string, ModelOption[]>;
  total: number;
  cached?: boolean;
  warning?: string;
  error?: string;
}

export interface ModelSelectOption {
  label: string;
  value: string;
  description?: string;
  tags?: string[];
  disabled?: boolean;
}

export interface ModelSelectGroup {
  label: string;
  options: ModelSelectOption[];
}

export interface ModelSelectResponse {
  success: boolean;
  options: ModelSelectGroup[];
  total: number;
  cached?: boolean;
  warning?: string;
  error?: string;
}