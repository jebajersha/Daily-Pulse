# DAILY PULSE — Your Personal Daily Digest

A responsive productivity dashboard with daily briefings, RSS news, live weather, tasks, calendar events, digest history and an assistant.

## Requirements
- Node.js 18 or newer
- Internet connection for live RSS headlines and weather
- Optional AI API key for live assistant responses

## Run locally
1. Extract the ZIP.
2. Open the project folder in Terminal.
3. Run `npm install`
4. Copy `.env.example` to `.env`.
5. (Optional) Add your AI provider key to `.env` as `OPENAI_API_KEY=...`.
6. Run `npm start`
7. Open `http://localhost:3000`

## Deploy on Render
- Create a new **Web Service** and connect this project repository.
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Add environment variables from `.env.example` in Render's Environment tab.
- For live AI, add `OPENAI_API_KEY` as a secret environment variable. Never commit `.env`.

## Features and data notes
- Tasks, events, profile and theme are stored in the browser's localStorage.
- Saved digests are stored by the Node server in `data/digests.json`.
- News is fetched from configured publisher RSS feeds. If feeds are unavailable, the app reports that instead of inventing headlines.
- Weather is fetched from Open-Meteo using the configured city.
- The assistant works in clearly labeled demo mode without an AI key. With `OPENAI_API_KEY`, it calls the OpenAI Chat Completions API from the server.
- A server-side daily digest reminder is saved at `DIGEST_TIME` using `APP_TIMEZONE`. This writes a reminder entry to digest history; it does not send email or push notifications.
- Browser notifications require permission and are limited by browser/device behavior. Browser-only reminders may not run while the app is closed.
- The server uses local JSON storage for simplicity. For multi-instance production deployments, replace it with a managed database and persistent disk.

## Environment variables
See `.env.example`.
