import pytest

@pytest.mark.unit
class TestPasswordValidation:
    def test_password_too_short(self, client):
        """Password under 8 characters fails"""
        response = client.post("/users/register", data={
            "username": "newuser",
            "email": "new@example.com",
            "password": "Short1",
            "confirm_password": "Short1"
        })
        
        assert response.status_code == 400
        assert b"at least 8 characters" in response.content.lower()
    
    def test_password_no_uppercase(self, client):
        """Password without uppercase fails"""
        response = client.post("/users/register", data={
            "username": "newuser",
            "email": "new@example.com",
            "password": "lowercase123",
            "confirm_password": "lowercase123"
        })
        
        assert response.status_code == 400
        assert b"uppercase" in response.content.lower()
    
    def test_password_no_lowercase(self, client):
        """Password without lowercase fails"""
        response = client.post("/users/register", data={
            "username": "newuser",
            "email": "new@example.com",
            "password": "UPPERCASE123",
            "confirm_password": "UPPERCASE123"
        })
        
        assert response.status_code == 400
        assert b"lowercase" in response.content.lower()
    
    def test_password_no_digit(self, client):
        """Password without digit fails"""
        response = client.post("/users/register", data={
            "username": "newuser",
            "email": "new@example.com",
            "password": "NoDigitsHere",
            "confirm_password": "NoDigitsHere"
        })
        
        assert response.status_code == 400
        assert b"number" in response.content.lower()
    
    def test_password_mismatch(self, client):
        """Mismatched passwords fail"""
        response = client.post("/users/register", data={
            "username": "newuser",
            "email": "new@example.com",
            "password": "ValidPass1",
            "confirm_password": "DifferentPass1"
        })
        
        assert response.status_code == 400
        assert b"do not match" in response.content.lower()
    
    def test_valid_password(self, client):
        """Valid password succeeds"""
        response = client.post("/users/register", data={
            "username": "newuser",
            "email": "new@example.com",
            "password": "SecurePass1",
            "confirm_password": "SecurePass1"
        }, follow_redirects=False)
        
        assert response.status_code == 302
