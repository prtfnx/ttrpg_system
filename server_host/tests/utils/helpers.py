def assert_user_response(response_data, expected_username, expected_email):
    assert response_data["username"] == expected_username
    assert response_data["email"] == expected_email
    assert "id" in response_data

def assert_session_response(response_data, expected_name, expected_code):
    assert response_data["name"] == expected_name
    assert response_data["session_code"] == expected_code
    assert "id" in response_data
