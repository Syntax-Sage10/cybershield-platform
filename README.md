# 🚨 CyberShield

---

**See network activity and file changes as they happen — with real scan results and integrity alerts.**

CyberShield is a local-first security dashboard. A Python agent scans authorized network targets and watches files on the machine where it runs; a FastAPI hub streams its events to a Next.js dashboard. PostgreSQL and Redis run locally through Docker Compose.

[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![Backend](https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Frontend](https://img.shields.io/badge/Frontend-Next.js-111111?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Database](https://img.shields.io/badge/Database-PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Cache](https://img.shields.io/badge/Cache-Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)
[![Download ZIP](https://img.shields.io/badge/Download-ZIP-2ea44f?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Syntax-Sage10/cybershield-platform/archive/refs/heads/main.zip)

## Download the project

- **Download the whole source as a ZIP:** [CyberShield source ZIP](https://github.com/Syntax-Sage10/cybershield-platform/archive/refs/heads/main.zip)
- Or open the [GitHub repository](https://github.com/Syntax-Sage10/cybershield-platform), select **Code → Download ZIP**, and extract the archive.
- To clone it with Git, run:

  ```bash
  git clone https://github.com/Syntax-Sage10/cybershield-platform.git
  cd cybershield-platform
  ```

After extracting the ZIP, open the extracted `cybershield-platform-main` folder in VS Code. The ZIP contains the tracked project source; it does not contain your `.env` secrets, Python environments, or installed frontend dependencies.

## What is included

- **Frontend:** Next.js App Router, React, and Tailwind CSS. The dashboard shows agent status, scan controls, network metrics, open ports, file-integrity alerts, and a live terminal.
- **Backend:** FastAPI REST and WebSocket APIs. PostgreSQL stores agents, jobs, and events; Redis carries agent commands and broadcasts live dashboard events.
- **Local agent:** A Python process that connects to the API, reports host metrics, performs TCP port scans, and monitors file integrity with SHA-256 and `watchdog`.
- **Docker Compose:** Starts PostgreSQL, Redis, the API, and its background worker. Host ports are bound to loopback for local development.

## Requirements

Install and start these before setup:

1. [Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/) (Docker Engine and Compose). Wait until Docker Desktop reports that it is running.
2. [Node.js LTS](https://nodejs.org/en/download/) (includes `npm`). Confirm with `node -v` and `npm -v` in a new terminal.
3. Python 3.11 or newer for the local agent. Confirm with `python3 --version`.
4. Git, if cloning instead of downloading the ZIP.

On macOS, if a command returns `command not found`, install the corresponding tool and open a new terminal so your `PATH` refreshes. The Python `(venv)` prompt does not install or enable Node.js or Docker.

## Setup and start

Run setup from the project root—the directory containing `docker-compose.yml`:

```bash
bash scripts/init.sh
```

The script creates a local `.env` with fresh random database and agent secrets if one does not exist, starts the Docker Compose services, creates `agent/.venv`, installs the agent requirements, and installs the frontend packages. Keep `.env` private; it is ignored by Git.

If Docker is unavailable, setup stops at `docker compose`. Install and start Docker Desktop, then run `bash scripts/init.sh` again.

### Start the dashboard and agent

After setup completes, use two terminals from the project folder:

**Terminal 1 — local agent:**

```bash
cd ~/Desktop/PROJECTS/cybershield
bash scripts/run-agent.sh
```

The agent reads `AGENT_TOKEN` from `.env` and connects to the local API. Leave this terminal running while using the dashboard.

**Terminal 2 — Next.js dashboard:**

```bash
cd ~/Desktop/PROJECTS/cybershield/frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The API health endpoint is [http://localhost:8000/health](http://localhost:8000/health). The API does not serve the dashboard at `/`, so a `404` at `http://localhost:8000/` is expected.

The API, PostgreSQL, Redis, and worker run in Docker from the setup step. To start them later without reinstalling dependencies, run this from the project root:

```bash
docker compose up -d
```

To stop the frontend and agent, press **Ctrl+C** in their terminals. Stop the containers with:

```bash
docker compose down
```

This keeps the PostgreSQL data volume. `docker compose down -v` also deletes that stored database data.

## Try a local port scan

Make sure the dashboard says the agent is online. In **Port scanner**, use:

| Field | Value |
| --- | --- |
| Target host or IP | `127.0.0.1` |
| Ports | `3000,8000` |
| Method | TCP connect |
| Concurrency | `10` |

Start the scan. Port `3000` should be open while Next.js is running, and port `8000` while the API is running. If PostgreSQL and Redis are also running, you can scan `5432,6379` as a separate range. Results and agent events appear in the dashboard’s live terminal.

The agent restricts scans to loopback, private, and link-local addresses by default. Only scan systems you own or have permission to test. To explicitly allow a public target, start the agent with `--allow-public`:

```bash
bash scripts/run-agent.sh --allow-public
```

The **SYN half-open** scan method requires administrator/root privileges. TCP connect is the recommended local test method.

## Try file-integrity monitoring

Create a real test directory and baseline file inside your home directory:

```bash
mkdir -p ~/cybershield-fim-test
printf 'baseline\n' > ~/cybershield-fim-test/watch.txt
```

In **File integrity monitor**, enter `~/cybershield-fim-test` and start monitoring. Then, in a terminal, modify the file:

```bash
printf 'changed\n' >> ~/cybershield-fim-test/watch.txt
```

The dashboard should report a modified-file alert. The agent’s default monitoring scope is your home directory. To monitor another approved directory, restart the agent with an additional `--fim-root /path/to/directory` option.

## Project layout

```text
cybershield-platform/
├── agent/                 # Local Python security agent and scanner
├── backend/               # FastAPI application and Dockerfile
│   └── app/               # REST, WebSocket, database, and Redis code
├── frontend/              # Next.js dashboard
│   ├── app/                # App Router page, layout, and global styles
│   ├── components/         # Live terminal
│   └── src/                # Dashboard components, hooks, and API client
├── scripts/                # Setup and agent launch scripts
├── docker-compose.yml      # PostgreSQL, Redis, API, and worker
└── .env.example            # Environment variable names and sample values
```

## Useful endpoints

- `GET /health` — API health check.
- `GET /api/agents`, `/api/jobs`, `/api/events` — dashboard REST data.
- `POST /api/jobs` — queue a port scan or file-integrity job.
- `WS /ws/agent` — authenticated agent connection.
- `WS /ws/dashboard` — live dashboard event stream.

## Troubleshooting

### `docker: command not found`

Install Docker Desktop, open it, wait for it to finish starting, open a new terminal, and verify `docker --version` and `docker compose version`. Then rerun `bash scripts/init.sh`.

### `npm: command not found`

Install Node.js LTS, open a new terminal, and verify `node -v` and `npm -v`. Then run `npm install` from `frontend/` and start it with `npm run dev`.

### The dashboard loads but scan controls are disabled

The controls need a connected agent. Confirm the Docker services are up with `docker compose ps`, then start the agent with `bash scripts/run-agent.sh` from the project root. Check the agent terminal for connection or token errors.

### The API responds with `404` at `/`

That is expected. Open the Next.js dashboard at `http://localhost:3000`; use `http://localhost:8000/health` to check the API.

### The agent cannot connect

Confirm Docker services are running, `.env` exists at the project root, and the agent was started with `bash scripts/run-agent.sh` so it can read the same `AGENT_TOKEN` used by the API. If `agent/.venv` is missing, rerun `bash scripts/init.sh` after Docker Desktop is available.

## Security notes

- Keep `.env` private and never commit it. The setup script generates it automatically.
- The API, PostgreSQL, and Redis host ports in Compose are bound to `127.0.0.1` for local development.
- The agent limits network scans and monitored directories by default. Use expanded scope only for systems and directories you are authorized to assess.
