# FC SBC Optimizer

A modern React web application to help optimize your FIFA Ultimate Team Squad Building Challenges (SBCs).

## Features

- 📊 **Player Overview**: View all players from your Trade Pile, Storage, and Duplicates in one unified table
- 🔍 **Advanced Filtering**: Filter players by rating, position, nation, league, team, and type
- 🔄 **Auto-Refresh**: Automatically refreshes data every minute
- 📱 **Modern UI**: Built with Mantine UI for a clean, modern look
- 🔐 **Session-Based Auth**: Enter your X-UT-SID to connect to your FUT account

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- A FIFA Ultimate Team account with Web App access

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/fc-sbc-optimizer.git

# Navigate to the project directory
cd fc-sbc-optimizer

# Install dependencies
npm install

# Start the development server
npm run dev
```

### Getting Your Session ID (X-UT-SID)

1. Open the [FUT Web App](https://www.ea.com/ea-sports-fc/ultimate-team/web-app/)
2. Open your browser's Developer Tools (F12)
3. Go to the Network tab
4. Make any action in the Web App (like searching the transfer market)
5. Look for requests to `utas.mob.v4.prd.futc-ext.gcp.ea.com`
6. In the request headers, find the `X-UT-SID` value
7. Copy and paste this value into the app

## Deployment

### Deploy to Heroku

1. Install the [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)
2. Create a Heroku app: `heroku create your-app-name`
3. Set environment variables:
   ```bash
   export GITHUB_REPO=your-username/fc-sbc-optimizer
   export HEROKU_APP=your-heroku-app-name
   ```
4. Run the deploy script: `./deploy.sh`

## Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Mantine 7** - UI component library
- **Tabler Icons** - Icon set

## API Endpoints Used

| Endpoint | Description |
|----------|-------------|
| `/tradepile` | Players listed on the transfer market |
| `/storagepile` | Players in storage |
| `/purchased/items` | Duplicate players |
| `/players.json` | Full player database |

## License

MIT
