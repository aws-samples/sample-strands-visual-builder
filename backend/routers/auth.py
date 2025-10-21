"""
Authentication router for JWT verification and user management
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import logging
from models.api_models import User
from services.auth_service import AuthService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["authentication"])
security = HTTPBearer()

# Initialize auth service (will be updated by main.py on startup)
auth_service = None

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> User:
    """Dependency to get current authenticated user"""
    try:
        token = credentials.credentials
        if not auth_service:
            raise HTTPException(status_code=503, detail="Authentication service not available")
        user_claims = auth_service.verify_jwt_token(token)
        
        return User(
            user_id=user_claims['user_id'],
            email=user_claims.get('email', ''),
            username=user_claims.get('username', '')
        )
    except Exception as e:
        logger.error("Authentication failed")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )



@router.post("/auth/verify")
async def verify_token(current_user: User = Depends(get_current_user)):
    """Verify JWT token and return user information"""
    return {
        "valid": True,
        "user": {
            "user_id": current_user.user_id,
            "email": current_user.email,
            "username": current_user.username
        }
    }