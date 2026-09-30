"""FastAPI app for the CSV pipeline."""
from fastapi import FastAPI

app = FastAPI(title="CSV Pipeline")

@app.get("/api/health")
def health():
    # The smallest possible endpoint: proves the server runs and routing works.
    return {"status": "ok"}
