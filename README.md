# Blanket Plan

Horse blanket planner: a week of blanket decisions from the forecast, shared barns,
shifts, check-offs, feed tracking and push reminders.

- `public/` – the app (installable web app)
- `netlify/functions/` – server: barn sync (`/api/barn`), reminders sign-up (`/api/push`), and a scheduled job every 15 minutes that sends reminders
- Data is stored in Netlify Blobs. No database or keys to set up.
