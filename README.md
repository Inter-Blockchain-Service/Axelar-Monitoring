# Axelar Validator Monitoring Dashboard

Real-time monitoring application for Axelar validators built with Next.js and Socket.io.

## Features

- Real-time WebSocket connection to a Tendermint node
- Monitoring of signed, missed, and proposed blocks 
- Monitoring of heartbeat
- Detailed statistics on signing performance for vald and ampd
- Alerting on discord and/or telegram

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
cp env.example .env
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

You can now check the metrics on http://server_ip:3002 (replace server_ip with your actual server IP address)

## Security

This application is designed for internal/private use. If you expose it on the Internet, please implement additional security measures (authentication, HTTPS, etc.).

## Todo
- `Add data persistence`
- `Add external RPC monitoring`