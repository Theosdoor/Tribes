#!/bin/bash
set -e
echo "=== Compiling Java ==="
javac -cp lib/json.jar -sourcepath src -d out \
    $(find src -name "*.java" | tr '\n' ' ') 2>&1 | grep -v "^Note:" || true

echo "=== Starting server on :8000 ==="
echo "In VS Code: open the Ports panel and forward port 8000, then open the browser URL."
uv run uvicorn tribes_py.web.main:app --host 0.0.0.0 --port 8000 --reload
