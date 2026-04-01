"""
Seed script to create a test user and an active game session for local dev.
Run from the repository root with: python server_host/scripts/seed_test_session.py
"""
from server_host.database.database import SessionLocal, init_db
from server_host.database import crud, schemas


def main():
    # Ensure tables exist
    init_db()
    db = SessionLocal()
    try:
        # Create test user if not exists
        user = crud.get_user_by_username(db, "johndoe")
        if not user:
            user_data = schemas.UserCreate(username="johndoe", email="johndoe@example.com", full_name="John Doe", password="secret")
            user = crud.create_user(db, user_data)
            print("Created user johndoe / secret")
        else:
            print("User johndoe already exists")

        # Create or reuse test session with known code
        session_code = "test_session_123"
        existing = crud.get_game_session_by_code(db, session_code)
        if existing:
            print(f"Game session {session_code} already exists: {existing.name}")
        else:
            session_create = schemas.GameSessionCreate(name="Test Session 123")
            session = crud.create_game_session(db, session_create, owner_id=int(user.id), session_code=session_code)
            print(f"Created game session with code: {session.session_code}")

    finally:
        db.close()


if __name__ == "__main__":
    main()
