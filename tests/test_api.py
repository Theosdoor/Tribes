import pytest
from unittest.mock import AsyncMock, MagicMock


FAKE_STATE = {
    "tick": 0,
    "active_tribe": 0,
    "game_over": False,
    "game_mode": "CAPITALS",
    "board": [],
    "tribes": [
        {"id": 0, "name": "XIN_XI", "stars": 5, "num_cities": 1,
         "is_human": True, "winner": "INCOMPLETE", "score": 0, "num_techs": 0},
        {"id": 1, "name": "IMPERIUS", "stars": 5, "num_cities": 1,
         "is_human": False, "winner": "INCOMPLETE", "score": 0, "num_techs": 0},
    ],
}


@pytest.fixture
def client():
    from unittest.mock import patch
    mock_session = MagicMock()
    mock_session.is_running = True
    mock_session.stop = AsyncMock()
    mock_session.start = AsyncMock(return_value={"status": "ok", "state": FAKE_STATE})
    mock_session.get_actions = AsyncMock(return_value={
        "status": "ok",
        "actions": [{"id": 0, "type": "END_TURN", "description": "END_TURN by tribe 0"}],
    })

    mock_loop = MagicMock()
    mock_loop.stop = AsyncMock()
    mock_loop.last_state = FAKE_STATE
    mock_loop.submit_action = AsyncMock()

    with patch("tribes_py.web.main.session", mock_session), patch("tribes_py.web.main.game_loop", mock_loop):
        from fastapi.testclient import TestClient
        from tribes_py.web.main import app
        yield TestClient(app)


def test_start_game(client):
    r = client.post("/game/start", json={
        "players": ["HUMAN", "MCTS"],
        "tribes": ["Xin Xi", "Imperius"],
    })
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_get_actions(client):
    r = client.get("/game/actions")
    assert r.status_code == 200
    assert "actions" in r.json()


def test_submit_action(client):
    r = client.post("/game/action", json={"action_id": 0})
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_stop_game(client):
    r = client.post("/game/stop")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


@pytest.fixture
def client_with_controls():
    from unittest.mock import patch
    mock_session = MagicMock()
    mock_session.is_running = True
    mock_session.stop = AsyncMock()
    mock_loop = MagicMock()
    mock_loop.stop = AsyncMock()
    mock_loop.last_state = FAKE_STATE
    mock_loop.submit_action = AsyncMock()
    mock_loop.pause = MagicMock()
    mock_loop.resume = MagicMock()
    mock_loop.play_turn = MagicMock()
    mock_loop.play_tick = MagicMock()
    with patch("tribes_py.web.main.session", mock_session), \
         patch("tribes_py.web.main.game_loop", mock_loop):
        from fastapi.testclient import TestClient
        from tribes_py.web.main import app
        yield TestClient(app), mock_loop


def test_pause(client_with_controls):
    client, loop = client_with_controls
    r = client.post("/game/pause")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
    loop.pause.assert_called_once()


def test_resume(client_with_controls):
    client, loop = client_with_controls
    r = client.post("/game/resume")
    assert r.status_code == 200
    loop.resume.assert_called_once()


def test_play_turn(client_with_controls):
    client, loop = client_with_controls
    r = client.post("/game/play-turn")
    assert r.status_code == 200
    loop.play_turn.assert_called_once()


def test_play_tick(client_with_controls):
    client, loop = client_with_controls
    r = client.post("/game/play-tick")
    assert r.status_code == 200
    loop.play_tick.assert_called_once()
