# Axelar Validator Monitoring Dashboard

Real-time monitoring application for Axelar validators built with Next.js and Socket.io.

## Features

- Real-time WebSocket connection to a Tendermint node
- Monitoring of signed, missed, and proposed blocks 
- Monitoring of heartbeat
- Detailed statistics on signing performance for vald and ampd
- Alerting on discord and/or telegram

## Project Structure

```
axelar-monitoring/
├── src/
│   ├── app/             # Next.js pages (App Router)
│   ├── components/      # Reusable React components
│   ├── hooks/           # Custom hooks
│   └── server/          # Tendermint WebSocket client and Socket.io server
├── public/              # Static files
└── ...
```

## Prerequisites

- Node.js 18+
- A Axelar node with RPC API enabled

## Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Configure your validator in the `.env` file:
```bash
cp .env.example .env
nano .env
```

## Development

To start the application in development mode:

```bash
npm run dev
```

## Production

To build the application for production:

```bash
npm run build
npm start
```

## Security

This application is designed for internal/private use. If you expose it on the Internet, please implement additional security measures (authentication, HTTPS, etc.).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

