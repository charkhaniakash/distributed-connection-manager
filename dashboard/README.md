# Connection Manager Dashboard

React-based real-time monitoring dashboard for the distributed connection management system.

## Features

- 📊 **Real-time Stats**: Live connection counts, active nodes, and organization metrics
- 🖥️ **Node Monitoring**: View status, health, and capacity of all nodes
- 🏢 **Organization Limits**: Track per-organization connection usage and limits
- ⚡ **Global Capacity**: Monitor system-wide capacity utilization
- 🚪 **Node Draining**: Trigger graceful node shutdown directly from UI
- 🔄 **Auto-refresh**: Dashboard updates every 2 seconds

## Setup

```bash
# Install dependencies
cd dashboard
npm install

# Start development server
npm run dev
```

The dashboard will be available at `http://localhost:3001`

**Important**: The backend API must be running on `http://localhost:3000` for the dashboard to work.

## Build for Production

```bash
npm run build
npm run preview
```

## Tech Stack

- React 18
- TypeScript
- Vite
- CSS Modules

No external UI libraries - pure React with modern CSS!
