import React from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import '../styles/amplify-theme.css';
import {
  Alert,
  Container,
  Header,
  Box
} from '@cloudscape-design/components';
import authService from '../services/authService';

/**
 * LoginForm component using Amplify UI Authenticator
 * Provides the standard AWS authentication experience
 */
export default function LoginForm({ onAuthSuccess }) {
  // Check if auth service is configured
  const isConfigured = authService.isConfigurationReady();

  if (!isConfigured) {
    return (
      <Container>
        <Alert
          type="warning"
          header="Authentication Not Configured"
        >
          <p>
            The authentication service is not yet configured. Please deploy the CDK infrastructure first.
          </p>
          <p>
            <strong>To deploy:</strong>
          </p>
          <ol>
            <li>Navigate to <code>experiments/prototype-a/cdk</code></li>
            <li>Run <code>./deploy.sh</code></li>
            <li>Update environment variables with the deployment outputs</li>
          </ol>
        </Alert>
      </Container>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-form-container">
        <div className="auth-form-wrapper">
          <Authenticator
            loginMechanisms={['email']}
            hideSignUp={true}
            components={{
              Header() {
                return (
                  <Box textAlign="center" padding={{ bottom: "m" }}>
                    <Header variant="h3">
                      Strands Visual Builder
                    </Header>
                  </Box>
                );
              }
            }}
            formFields={{
              signUp: {
                password: {
                  placeholder: 'Enter your password',
                  label: 'Password'
                },
                confirm_password: {
                  placeholder: 'Confirm your password',
                  label: 'Confirm Password'
                }
              }
            }}
            services={{
              async validateCustomSignUp(formData) {
                // Validate email format
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(formData.email)) {
                  throw new Error('Please enter a valid email address');
                }
              }
            }}
          >
            {({ user }) => {
              // Call success callback when user is authenticated
              if (user && onAuthSuccess) {
                const userData = {
                  userId: user.userId,
                  username: user.username,
                  email: user.signInDetails?.loginId || user.username
                };
                onAuthSuccess(userData);
              }
              
              return (
                <Box textAlign="center" padding="l">
                  <Alert
                    type="success"
                    header="Authentication Successful"
                  >
                    Welcome! You are now signed in and can access the visual builder.
                  </Alert>
                </Box>
              );
            }}
          </Authenticator>
        </div>
      </div>
    </div>
  );
}