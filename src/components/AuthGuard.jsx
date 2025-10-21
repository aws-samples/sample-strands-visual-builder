import React, { useEffect } from 'react';
import { 
  Container, 
  Spinner, 
  Box,
  SpaceBetween 
} from '@cloudscape-design/components';
import LoginForm from './LoginForm';
import useBuilderStore from '../store/useBuilderStore';

/**
 * AuthGuard component protects routes and shows login form for unauthenticated users
 * Automatically checks authentication status on mount
 */
export default function AuthGuard({ children }) {
  const { 
    user, 
    isAuthenticated, 
    authLoading, 
    setUser, 
    checkAuthStatus 
  } = useBuilderStore();

  useEffect(() => {
    // Check authentication status on component mount
    checkAuthStatus();
  }, [checkAuthStatus]);

  const handleAuthSuccess = (authenticatedUser) => {
    setUser(authenticatedUser);
  };

  // Show loading spinner while checking authentication
  if (authLoading) {
    return (
      <Container>
        <Box textAlign="center" padding="xxl">
          <SpaceBetween direction="vertical" size="m">
            <Spinner size="large" />
            <Box variant="p" color="text-body-secondary">
              Checking authentication status...
            </Box>
          </SpaceBetween>
        </Box>
      </Container>
    );
  }

  // Show login form if not authenticated
  if (!isAuthenticated) {
    return (
      <Box padding="l">
        <LoginForm onAuthSuccess={handleAuthSuccess} />
      </Box>
    );
  }

  // Render protected content if authenticated
  return children;
}