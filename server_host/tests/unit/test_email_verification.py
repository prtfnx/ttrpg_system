import pytest
from datetime import datetime, timedelta
from server_host.database import models

@pytest.mark.unit
class TestEmailVerification:
    def test_creates_verification_token_on_registration(self, client, test_db):
        """Registration creates email verification token"""
        
        response = client.post("/users/register", data={
            "username": "newuser",
            "email": "new@example.com",
            "password": "SecurePass1",
            "confirm_password": "SecurePass1"
        })
        
        assert response.status_code in [302, 200]
        
        user = test_db.query(models.User).filter(
            models.User.username == "newuser"
        ).first()
        assert user is not None
        assert user.is_verified == False
        
        token = test_db.query(models.EmailVerificationToken).filter(
            models.EmailVerificationToken.user_id == user.id
        ).first()
        assert token is not None
        assert token.expires_at > datetime.utcnow()
    
    def test_verify_email_with_valid_token(self, client, test_db, test_user):
        """Valid token marks user as verified"""
        import secrets
        
        verification_token = secrets.token_urlsafe(32)
        email_token = models.EmailVerificationToken(
            token=verification_token,
            user_id=test_user.id,
            expires_at=datetime.utcnow() + timedelta(hours=24)
        )
        test_db.add(email_token)
        test_db.commit()
        
        response = client.get(f"/users/verify?token={verification_token}")
        
        assert response.status_code in [302, 200]
        
        test_db.refresh(test_user)
        assert test_user.is_verified == True
        
        token_after = test_db.query(models.EmailVerificationToken).filter(
            models.EmailVerificationToken.token == verification_token
        ).first()
        assert token_after.used_at is not None
    
    def test_verify_email_with_expired_token(self, client, test_db, test_user):
        """Expired token does not verify user"""
        import secrets
        
        verification_token = secrets.token_urlsafe(32)
        email_token = models.EmailVerificationToken(
            token=verification_token,
            user_id=test_user.id,
            expires_at=datetime.utcnow() - timedelta(hours=1)
        )
        test_db.add(email_token)
        test_db.commit()
        
        response = client.get(f"/users/verify?token={verification_token}")
        
        assert response.status_code == 400
        
        test_db.refresh(test_user)
        assert test_user.is_verified == False
    
    def test_verify_email_with_invalid_token(self, client):
        """Invalid token returns error"""
        response = client.get("/users/verify?token=invalid_token")
        assert response.status_code == 400
