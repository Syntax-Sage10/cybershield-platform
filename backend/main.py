"""Compatibility entry point for running the CyberShield API with ``uvicorn main:app``.

The application, authenticated agent socket, and Redis-backed dashboard broker live in
``app.main`` and ``app.routers.ws`` so API routes and WebSocket behavior stay together.
"""

from app.main import app

__all__ = ["app"]
