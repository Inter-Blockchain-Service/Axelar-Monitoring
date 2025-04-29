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
cp env.example .env
nano .env
```

## Configuration

The `.env` file contains all the necessary configuration for the monitoring system. Here's a detailed explanation of each section:

### Validator Configuration
- `VALIDATOR_ADDRESS`: Your validator's hex address
- `BROADCASTER_ADDRESS`: Your broadcaster's bech32 address for heartbeats
- `AMPD_ADDRESS`: Your AMPD's bech32 address (if different from broadcaster)
- `VALIDATOR_MONIKER`: Your validator's display name
- `CHAIN_ID`: The Axelar chain ID (e.g., "axelar-dojo-1")

### RPC Node Configuration
- `RPC_ENDPOINT`: Your Axelar node's RPC endpoint
- `AXELAR_API_ENDPOINT`: API endpoint for EVM vote queries

### Chain Monitoring
- `EVM_SUPPORTED_CHAINS`: Comma-separated list of EVM chains to monitor (leave empty for all mainnet chains)
- `AMPD_SUPPORTED_CHAINS`: Comma-separated list of AMPD chains to monitor (e.g., "flow,stellar,sui")

### Alert Configuration

The monitoring system implements several types of alerts to ensure your validator's optimal performance. Alerts are triggered based on two main criteria: consecutive misses and performance rates.

#### Block and Heartbeat Alerts
- `ALERT_CONSECUTIVE_BLOCKS_THRESHOLD`: Triggers an alert if your validator misses this number of consecutive blocks.
- `ALERT_CONSECUTIVE_HEARTBEATS_THRESHOLD`: Triggers an alert if your validator misses this number of consecutive heartbeats.
- `ALERT_SIGN_RATE_THRESHOLD`: Triggers an alert if your validator's block signing rate falls below this percentage. The rate is calculated over the last 35,000 blocks.
- `ALERT_HEARTBEAT_RATE_THRESHOLD`: Triggers an alert if your validator's heartbeat success rate falls below this percentage. The rate is calculated over the last 700 heartbeats.

#### EVM and AMPD Alerts
- `ALERT_CONSECUTIVE_EVM_VOTES_THRESHOLD`: Triggers an alert if your validator misses this number of consecutive EVM votes.
- `ALERT_EVM_VOTE_RATE_THRESHOLD`: Triggers an alert if your validator's EVM vote success rate falls below this percentage. The rate is calculated over the last 200 EVM votes.
- `ALERT_CONSECUTIVE_AMPD_VOTES_THRESHOLD`: Triggers an alert if your validator misses this number of consecutive AMPD votes.
- `ALERT_AMPD_VOTE_RATE_THRESHOLD`: Triggers an alert if your validator's AMPD vote success rate falls below this percentage. The rate is calculated over the last 200 AMPD votes.
- `ALERT_CONSECUTIVE_AMPD_SIGNINGS_THRESHOLD`: Triggers an alert if your validator misses this number of consecutive AMPD signings.
- `ALERT_AMPD_SIGNING_RATE_THRESHOLD`: Triggers an alert if your validator's AMPD signing success rate falls below this percentage. The rate is calculated over the last 200 AMPD signings.

#### Alert Behavior
- Alerts are sent through configured notification channels (Discord and/or Telegram)
- Each alert includes:
  - The type of alert (block, heartbeat, EVM, or AMPD)
  - The current performance metrics
  - The threshold that was exceeded
  - Timestamp of the alert
- Alerts are sent in real-time as soon as thresholds are exceeded
- The system continues monitoring and will send new alerts if conditions persist or worsen

### Notification Configuration
- `DISCORD_ALERTS_ENABLED`: Enable/disable Discord notifications
- `DISCORD_WEBHOOK_URL`: Your Discord webhook URL
- `TELEGRAM_ALERTS_ENABLED`: Enable/disable Telegram notifications
- `TELEGRAM_BOT_TOKEN`: Your Telegram bot token
- `TELEGRAM_CHAT_ID`: Your Telegram chat ID

### Server Configuration
- `PORT`: Backend server port (default: 3001)
- `NEXT_PUBLIC_SERVER_URL`: Server URL for frontend-backend communication

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

