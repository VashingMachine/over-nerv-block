from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_reports_api_status() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "api",
        "environment": "local",
        "version": "0.1.0",
        "commit": "development",
    }


def test_version_exposes_shared_schema_version() -> None:
    response = client.get("/api/version")

    assert response.status_code == 200
    assert response.json() == {
        "name": "over-nerv-block-api",
        "version": "0.1.0",
        "environment": "local",
        "commit": "development",
        "schemaVersion": 1,
    }


def test_internal_documentation_is_not_public() -> None:
    assert client.get("/docs").status_code == 404
    assert client.get("/redoc").status_code == 404
