from faker import Faker

fake = Faker()

def user_factory(**kwargs):
    from server_host.database import schemas
    defaults = {
        "username": fake.user_name(),
        "email": fake.email(),
        "password": "testpass123"
    }
    defaults.update(kwargs)
    return schemas.UserCreate(**defaults)

def game_session_factory(**kwargs):
    from server_host.database import schemas
    defaults = {
        "name": f"Game Session {fake.word()}"
    }
    defaults.update(kwargs)
    return schemas.GameSessionCreate(**defaults)

def character_factory(**kwargs):
    defaults = {
        "name": fake.first_name(),
        "data": {"class": "Warrior", "level": 1}
    }
    defaults.update(kwargs)
    return defaults
