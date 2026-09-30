import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ["ML_SERVICE_TOKEN"] = "test-token"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture()
def models_dir(tmp_path, monkeypatch):
    from app import config

    monkeypatch.setattr(config, "MODELS_DIR", tmp_path)
    return tmp_path


@pytest.fixture()
def client():
    from app.main import app

    return TestClient(app)


AUTH = {"Authorization": "Bearer test-token"}
