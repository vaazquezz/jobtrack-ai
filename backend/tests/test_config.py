from app.config import Settings


def test_cors_origins_are_split_and_trimmed():
    settings = Settings(cors_origins="http://localhost:5173, http://127.0.0.1:5173 ,")

    assert settings.cors_origins_list == ["http://localhost:5173", "http://127.0.0.1:5173"]
