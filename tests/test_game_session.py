import pytest
import json
from unittest.mock import AsyncMock, MagicMock


@pytest.fixture
def mock_process():
    proc = MagicMock()
    proc.stdin = MagicMock()
    proc.stdin.write = MagicMock()
    proc.stdin.drain = AsyncMock()
    proc.stdout = MagicMock()
    proc.kill = MagicMock()
    proc.wait = AsyncMock()
    return proc


@pytest.mark.asyncio
async def test_send_writes_json_and_parses_response(mock_process):
    from tribes_py.web.game_session import GameSession

    expected = {"status": "ok", "state": {"tick": 0}}
    mock_process.stdout.readline = AsyncMock(
        return_value=(json.dumps(expected) + "\n").encode()
    )

    session = GameSession()
    session._process = mock_process

    result = await session._send({"cmd": "actions"})

    written = mock_process.stdin.write.call_args[0][0].decode()
    assert json.loads(written) == {"cmd": "actions"}
    assert result == expected


@pytest.mark.asyncio
async def test_stop_kills_process(mock_process):
    from tribes_py.web.game_session import GameSession

    session = GameSession()
    session._process = mock_process
    session.is_running = True

    await session.stop()

    mock_process.kill.assert_called_once()
    mock_process.wait.assert_awaited_once()
    assert session._process is None
    assert not session.is_running
