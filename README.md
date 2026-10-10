# Relleno Shifts

Relleno Shifts is a web application for managing work schedules in a simple, visual, and fast way. The tool helps a store or operations team turn availability, roles, weekly workloads, and operating rules into a weekly schedule ready to use.

Instead of building schedules manually in scattered spreadsheets, Relleno Shifts centralizes the team, calculates shift suggestions, and allows the schedule to be adjusted after it is generated.

## Contents

- [What It Solves](#what-it-solves)
- [Features](#features)
- [How It Works](#how-it-works)
- [Access](#access)
- [Technologies](#technologies)
- [Development](#development)
- [Scripts](#scripts)
- [Deploy](#deploy)
- [Environment Variables](#environment-variables)
- [API](#api)
- [Database](#database)

## What It Solves

- Reduces the time spent building weekly schedules.
- Avoids assigning employees outside their availability.
- Helps balance hours across the team.
- Quickly shows where people are missing by shift.
- Allows the schedule to adapt to the expected sales volume.
- Works well on desktop and mobile.

## Features

- Employee management with name, roles, and weekly target hours.
- Support for more than one role per employee, such as `Kitchen`, `Cashier`, and `Floor`.
- Weekly availability by day and shift.
- Specific availability times, including multiple intervals on the same day.
- Automatic generation of the best possible schedule based on the defined rules.
- Manual editing of times after the schedule is generated.
- Configurable store rules, including opening time, closing time, and required people per shift.
- Sales history and forecast by day.
- Dashboard with coverage, active team, open slots, and hours by role.
- Responsive interface for viewing and adjusting schedules on mobile.

## How It Works

1. Management adds employees and defines roles, weekly target hours, and availability.
2. The store configures operating rules, such as opening time, closing time, and shift requirements.
3. The system combines availability, weekly workloads, and the week's needs.
4. The suggested schedule is generated automatically.
5. Management can edit clock-in and clock-out times directly in the schedule.

## Access

The current version uses a simple administrative login:

```text
Email: admin@relleno.pt
Password: admin123
```

Employees and sales history are stored in Supabase through the `/api` functions. Any device logged in as the administrator sees the same team, the same history, and the same operational base.

## Technologies

- HTML, CSS, and JavaScript without a frontend framework.
- Vercel for hosting and serverless functions in `/api`.
- Supabase as the remote database for employees and sales history.
- Lucide Icons for interface iconography.

## Development

Requirements:

- Node.js 24.
- npm.

Install dependencies:

```bash
npm install
```

Validate syntax:

```bash
npm run check
```

Run in development:

```bash
npm run dev
```

By default, `vercel dev` opens the application locally and also serves the functions in `/api`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Starts the local environment with Vercel. |
| `npm run check` | Validates the syntax of the main JavaScript files. |
| `npm run audit` | Runs a dependency audit without development dependencies. |

## Deploy

The project is configured for Vercel.

```bash
npx vercel deploy --prod
```

In the Vercel dashboard, use:

- Framework preset: `Other`
- Build command: `echo 'No build needed'`
- Output directory: `./`

## Environment Variables

The API functions need Supabase configured in the Vercel environment:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_EMAIL=admin@relleno.pt
ADMIN_PASSWORD=admin123
ADMIN_SESSION_SECRET=change-this-long-random-secret
ADMIN_OWNER_ID=00000000-0000-0000-0000-000000000001
```

`SUPABASE_SERVICE_ROLE_KEY` must exist only on the server/Vercel. Never put this key in the browser. You can also use `SUPABASE_SECRET_KEY` instead of `SUPABASE_SERVICE_ROLE_KEY` if the project already uses the newer Supabase keys.

On the first login after an older version, the app tries to automatically migrate employees and sales history that still exist in the browser's `localStorage` to the remote database.

## API

The serverless functions are in `/api`:

| Endpoint | Use |
| --- | --- |
| `/api/auth` | Administrative login. |
| `/api/employees` | Read and write employees. |
| `/api/sales` | Read and write sales history/forecast. |

The front end does not save employees or sales directly in the browser. `localStorage` is used only to migrate legacy data created before remote persistence.

## Database

For a new Supabase database, apply `schema.sql`.

For an existing database with older policies, apply `supabase-security-migration.sql` in the Supabase SQL Editor.

## Product Note

The goal of Relleno Shifts is to be an operational tool: open, adjust, and decide quickly. The interface prioritizes clear reading, manual control when needed, and a weekly schedule that the team can understand without additional explanation.
