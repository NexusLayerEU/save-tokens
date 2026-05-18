# SaveTokens 🪙

> CLI proxy that compresses AI tool command output to save LLM tokens, with a live web dashboard.

Inspired by [rtk](https://github.com/rtk-ai/rtk) — same concept, built in Node.js with a real-time web UI.

## What it does

Wraps shell commands and filters/compresses their output before it reaches your AI coding tool's context window. Saves **60–90%** of tokens on common commands like `git`, `ls`, `grep`, `cat`, and test runners.

| Command | Typical Savings |
|---------|----------------|
| `cat` (large file) | 85% |
| `grep -r ...` | 80% |
| `find ...` | 20–60% |
| `git log` | 70% |
| `git diff` | 50–75% |
| `npm test / pytest` | 60–90% |
| `npm install` | 90% |

## Dashboard

Live web UI at **http://localhost:4044** — shows a real-time stream of every command, token savings, daily chart, and per-command breakdown.

## Usage

```bash
# Wrap any command
savetokens git status
savetokens ls -la src/
savetokens grep -r "TODO" .
savetokens cat src/main.rs
savetokens npm test

# Install Claude Code hook (auto-intercepts commands)
savetokens --install-hook

# View stats in terminal
savetokens --stats

# Open dashboard
savetokens --dashboard
```

## Install

```bash
cd /Users/admin/Documents/Thomas-SRC/SaveTokens
npm install
# savetokens is already symlinked to /opt/homebrew/bin/savetokens
```

Service auto-starts via launchd:
```bash
launchctl start com.savetokens.web   # start
launchctl stop com.savetokens.web    # stop
```

## How it works

1. `savetokens <cmd>` runs the real command and captures stdout+stderr
2. Output passes through per-command filters (strip ANSI, truncate, remove noise)
3. Compressed output is printed to stdout (what the AI sees)
4. Event is POSTed to the local web server for tracking
5. Dashboard shows the live stream + cumulative stats

## Project Structure

```
SaveTokens/
├── server.js          # Express web server (port 4044)
├── bin/savetokens     # CLI wrapper
├── lib/
│   ├── filters.js     # Per-command compression rules
│   ├── db.js          # SQLite storage (node:sqlite built-in)
│   └── events.js      # SSE broadcast
└── public/
    └── index.html     # Dashboard (Chart.js)
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Dashboard | 4044 | Live web UI |
