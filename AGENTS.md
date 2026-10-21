# GLASS SHUFFLE — Project Instructions

## Project shape

- Vanilla HTML, CSS, and browser JavaScript in `public/`.
- Small Express server in `server.js` serving the frontend and API routes.
- Frontend state is currently persisted in `localStorage`; do not present it as authoritative financial state.
- Preserve the existing game rules, API contracts, and visible user flows unless the task explicitly changes them.

## Common commands

- `npm ci` — reproducible dependency install. Keep `package.json` and `package-lock.json` synchronized.
- `npm start` — run the local server on port 3000, or `PORT=<port> npm start`.
- `node --check server.js`
- `node --check public/game.js`
- `npm test` — add and maintain the project test suite as part of feature work.

## Development rules

- Use the existing vanilla frontend stack; do not introduce a framework for visual work alone.
- Keep game state transitions, payouts, persistence, and API behavior explicit and testable.
- Clean up timers, event listeners, and asynchronous work when a round is cancelled or reset.
- Make interactive controls keyboard accessible and support reduced-motion preferences.
- Do not replace real API responses with mocks in the application.
- Do not add credentials, secrets, or real-money integrations to the repository.
- Run the smallest relevant checks after each focused change, then run the full available verification before handoff.
