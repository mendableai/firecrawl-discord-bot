# Firecrawl Discord Bot

A Discord bot to turn websites into LLM-ready data using the Firecrawl API.

## Features

- Scrape websites with advanced options
- Map URLs from a starting point
- Extract structured data from web pages
- Support for custom actions and parameters
- Beautiful JSON responses

## Prerequisites

- Node.js 18 or higher
- pnpm
- A Discord bot token
- A Firecrawl API key (Get yours by creating an account at [Firecrawl Dashboard](https://www.firecrawl.dev/app/api-keys))

## Installation

1. Clone the repository:
```bash
git clone https://github.com/mendableai/firecrawl-discord-bot.git
cd firecrawl-discord-bot
```

2. Install dependencies:
```bash
pnpm install
```

3. Build the TypeScript code:
```bash
pnpm build
```

## Usage

1. Start the bot:
```bash
pnpm start
```

2. For development with linting and formatting:
```bash
pnpm lint      # Check for linting issues
pnpm lint:fix  # Fix linting issues
pnpm format    # Format code
```

## Available Commands

### /set-api-key
Set your Firecrawl API key (required before using other commands).
```
/set-api-key key YOUR_API_KEY
```

### /scrape
Scrape a webpage with various options. [Documentation](https://docs.firecrawl.dev/api-reference/endpoint/scrape)

Example:
```json
{
  "url": "https://example.com",
  "formats": ["markdown", "html"],
  "onlyMainContent": true,
  "waitFor": 1000,
  "includeTags": ["article", "main"],
  "excludeTags": ["nav", "footer"],
  "mobile": false,
  "removeBase64Images": true,
  "skipTlsVerification": false,
  "timeout": 30000,
  "agent": {
    "model": "FIRE-1",
    "prompt": "Your custom prompt here"
  }
}
```

### /map
Map URLs from a starting point. [Documentation](https://docs.firecrawl.dev/api-reference/endpoint/map)

Example:
```json
{
  "url": "https://example.com",
  "search": "optional search term",
  "ignoreSitemap": true,
  "sitemapOnly": false,
  "includeSubdomains": false,
  "limit": 5000
}
```

### /extract
Extract structured data from webpages. [Documentation](https://docs.firecrawl.dev/api-reference/endpoint/extract)

Example:
```json
{
  "urls": ["https://example.com"],
  "prompt": "Extract product information",
  "schema": {
    "name": "string",
    "price": "number",
    "description": "string"
  },
  "agent": {
    "model": "FIRE-1"
  }
}
```

### /docs
Get the link to the Firecrawl documentation.

### /help
Display help information about available commands and their usage.

## Configuration

The bot uses the following environment variables:

- `DISCORD_TOKEN`: Your Discord bot token
- `CLIENT_ID`: Your Discord application client ID

To set up the environment variables:

1. Copy the `.env.example` file to `.env`:
```bash
cp .env.example .env
```

2. Edit the `.env` file and replace the placeholder values with your actual tokens:
```
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_client_id
```

## License

MIT 