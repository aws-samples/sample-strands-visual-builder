"""
Authentication service for Cognito JWT verification
"""
import boto3
import logging
from typing import Dict, Any
from jose import JWTError, jwt, jwk
from fastapi import HTTPException, status
from services.config_service import config_service
import requests
import json
from functools import lru_cache
import time

logger = logging.getLogger(__name__)

# Cache for JWKS keys (1 hour TTL)
_jwks_cache = {}
_jwks_cache_expiry = 0
JWKS_CACHE_TTL = 3600  # 1 hour

@lru_cache(maxsize=128)
def get_jwks_keys(region: str, user_pool_id: str) -> Dict[str, Any]:
    """Fetch and cache JWKS keys from Cognito"""
    global _jwks_cache, _jwks_cache_expiry
    
    current_time = time.time()
    cache_key = f"{region}:{user_pool_id}"
    
    # Check if we have valid cached keys
    if (cache_key in _jwks_cache and 
        current_time < _jwks_cache_expiry):
        # Using cached JWKS keys
        return _jwks_cache[cache_key]
    
    try:
        # Fetch JWKS from Cognito
        jwks_url = f"https://cognito-idp.{region}.amazonaws.com/{user_pool_id}/.well-known/jwks.json"
        logger.info("Fetching JWKS keys")
        
        response = requests.get(jwks_url, timeout=10)
        response.raise_for_status()
        
        jwks_data = response.json()
        
        # Cache the keys
        _jwks_cache[cache_key] = jwks_data
        _jwks_cache_expiry = current_time + JWKS_CACHE_TTL
        
        logger.info("Successfully cached JWKS keys")
        return jwks_data
        
    except Exception as e:
        logger.error("Failed to fetch JWKS keys")
        # Return cached keys if available, even if expired
        if cache_key in _jwks_cache:
            logger.warning("Using expired JWKS keys")
            return _jwks_cache[cache_key]
        raise

def get_signing_key(token: str, jwks_data: Dict[str, Any]) -> str:
    """Extract the signing key for token verification"""
    try:
        # Get the key ID from token header
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get('kid')
        
        if not kid:
            raise ValueError("Token missing 'kid' in header")
        
        # Find the matching key in JWKS
        for key_data in jwks_data.get('keys', []):
            if key_data.get('kid') == kid:
                # Convert JWK to PEM format
                key = jwk.construct(key_data)
                return key.to_pem().decode('utf-8')
        
        raise ValueError(f"Unable to find signing key with kid: {kid}")
        
    except Exception as e:
        logger.error("Failed to get signing key")
        raise

class AuthService:
    """Service for handling Cognito JWT verification"""
    
    def __init__(self):
        self.cognito_client = None
        self.jwks_client = None
        
        # Load configuration from SSM instead of .env files
        cognito_config = config_service.get_cognito_config()
        self.user_pool_id = cognito_config['user_pool_id']
        self.client_id = cognito_config['client_id']
        self.region = cognito_config['region']
        
        logger.info("AuthService initialized")
        
    async def initialize(self):
        """Initialize AWS clients"""
        try:
            self.cognito_client = boto3.client('cognito-idp', region_name=self.region)
            logger.info("Cognito client initialized")
        except Exception as e:
            logger.error("Failed to initialize Cognito client")
            raise
    
    def verify_jwt_token(self, token: str) -> Dict[str, Any]:
        """Verify Cognito JWT token and return user claims"""
        try:
            logger.info("Verifying JWT token")
            
            # Get unverified header to extract kid (key ID)
            unverified_header = jwt.get_unverified_header(token)
            
            # PROPER JWT VERIFICATION with JWKS signature validation
            
            # Get unverified claims to extract user pool info
            unverified_claims = jwt.get_unverified_claims(token)
            
            # Extract user pool ID from the 'iss' claim
            iss = unverified_claims.get('iss', '')
            if not iss or 'cognito-idp' not in iss:
                raise JWTError("Invalid token issuer")
                
            # Extract user pool ID from issuer URL
            # Format: https://cognito-idp.{region}.amazonaws.com/{user_pool_id}
            try:
                user_pool_id = iss.split('/')[-1]
            except:
                raise JWTError("Could not extract user pool ID from token")
            
            # Get JWKS keys for signature verification
            jwks_data = get_jwks_keys(self.region, user_pool_id)
            
            # Get the signing key
            signing_key = get_signing_key(token, jwks_data)
            
            # Verify token signature and decode claims
            verified_claims = jwt.decode(
                token,
                signing_key,
                algorithms=['RS256'],
                audience=unverified_claims.get('aud'),  # Client ID
                issuer=iss
            )
            
            # Token claims verified
            
            # Additional validation
            if not verified_claims.get('sub'):
                raise JWTError("Invalid token: missing subject")
            
            if verified_claims.get('token_use') != 'id':
                raise JWTError("Invalid token: not an ID token")
            
            # Validate client ID (for ID tokens, client ID is in 'aud' field)
            token_client_id = verified_claims.get('aud') or verified_claims.get('client_id')
            if token_client_id != self.client_id:
                raise JWTError(f"Invalid token: incorrect client ID. Expected {self.client_id}, got {token_client_id}")
            
            # Check token expiration (jwt.decode already validates this, but double-check)
            current_time = time.time()
            exp = verified_claims.get('exp', 0)
            if current_time >= exp:
                raise JWTError("Token has expired")
            
            # Extract user information
            email = verified_claims.get('email', '')
            if not email:
                raise JWTError("Invalid token: missing email claim")
            
            user_info = {
                'user_id': verified_claims['sub'],  # Keep for compatibility
                'email': email,  # Primary identifier for cross-account compatibility
                'username': verified_claims.get('username', verified_claims.get('cognito:username', '')),
                'token_use': verified_claims.get('token_use'),
                'client_id': token_client_id,
                'exp': verified_claims.get('exp'),
                'iss': verified_claims.get('iss')
            }
            
            logger.info("Token successfully verified")
            
            return user_info
            
        except JWTError as e:
            logger.error("JWT verification failed")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except Exception as e:
            logger.error("Token verification error")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication failed",
                headers={"WWW-Authenticate": "Bearer"},
            )

# Global auth service instance
auth_service = AuthService()

# FastAPI dependency for getting current user
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from models.api_models import User

security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> User:
    """
    FastAPI dependency to get current authenticated user from JWT token
    """
    try:
        # Initialize auth service if needed
        if not auth_service.cognito_client:
            await auth_service.initialize()
        
        # Verify the JWT token
        user_info = auth_service.verify_jwt_token(credentials.credentials)
        
        # Create User model from token claims
        user = User(
            user_id=user_info['user_id'],
            email=user_info['email'],
            username=user_info.get('username', ''),
            is_authenticated=True
        )
        
        logger.info("User authenticated successfully")
        return user
        
    except HTTPException:
        # Re-raise HTTP exceptions from token verification
        raise
    except Exception as e:
        logger.error("Authentication error")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed",
            headers={"WWW-Authenticate": "Bearer"},
        )