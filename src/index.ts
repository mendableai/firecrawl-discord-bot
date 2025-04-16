import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  MessageFlags,
  AttachmentBuilder,
  Interaction,
} from 'discord.js';
import dotenv from 'dotenv';
import FirecrawlApp, {
  type ScrapeParams,
  type MapParams,
  type ExtractParams,
  type Action,
} from '@mendable/firecrawl-js';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

dotenv.config();

// Store API keys per user
const userApiKeys = new Map<string, string>();

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Define commands
const commands = [
  new SlashCommandBuilder()
    .setName('set-api-key')
    .setDescription('Set your Firecrawl API key')
    .addStringOption((option) =>
      option.setName('key').setDescription('Your Firecrawl API key').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('update-api-key')
    .setDescription('Update your existing Firecrawl API key')
    .addStringOption((option) =>
      option.setName('key').setDescription('Your new Firecrawl API key').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('scrape')
    .setDescription('Scrape a webpage')
    .addStringOption((option) =>
      option.setName('params').setDescription('JSON parameters for scraping').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('map')
    .setDescription('Map URLs from a starting point')
    .addStringOption((option) =>
      option.setName('params').setDescription('JSON parameters for mapping').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('extract')
    .setDescription('Extract structured data from webpages')
    .addStringOption((option) =>
      option.setName('params').setDescription('JSON parameters for extraction').setRequired(true)
    ),
  new SlashCommandBuilder().setName('docs').setDescription('Get the documentation URL'),
  new SlashCommandBuilder().setName('help').setDescription('Get help with using the bot'),
];

// Register commands
const rest = new REST().setToken(process.env.DISCORD_TOKEN!);

async function registerCommands() {
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID!), { body: commands });
    console.log('✅ Successfully registered application commands.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

// Helper function to validate JSON parameters
function validateAndParseJSON(jsonString: string): {
  valid: boolean;
  data?: unknown;
  error?: string;
} {
  try {
    const data = JSON.parse(jsonString);
    return { valid: true, data };
  } catch {
    return { valid: false, error: 'Invalid JSON format. Please check your input.' };
  }
}

// Helper function to check if user has API key
function checkApiKey(userId: string): boolean {
  return userApiKeys.has(userId);
}

// Helper function to handle large responses
async function handleLargeResponse(data: unknown, filename: string): Promise<AttachmentBuilder> {
  const tempDir = tmpdir();
  const tempFilePath = join(tempDir, filename);
  const jsonContent = JSON.stringify(data, null, 2);
  await writeFile(tempFilePath, jsonContent, 'utf-8');
  return new AttachmentBuilder(tempFilePath, { name: filename });
}

// Helper function to send response
async function sendResponse(interaction: Interaction, data: unknown, commandName: string) {
  const jsonString = JSON.stringify(data, null, 2);

  if (jsonString.length < 1900) {
    // @ts-expect-error editReply exists on ChatInputCommandInteraction
    await interaction.editReply(`\`\`\`json\n${jsonString}\n\`\`\``);
  } else {
    const attachment = await handleLargeResponse(data, `${commandName}-response.json`);
    // @ts-expect-error editReply exists on ChatInputCommandInteraction
    await interaction.editReply({
      content: '📎 The response was too large to display directly. Please find it attached below:',
      files: [attachment],
    });
  }
}

// Helper function to check for unsupported parameters
function checkUnsupportedParams(
  command: string,
  params: Record<string, unknown>
): { isValid: boolean; unsupportedParams: string[] } {
  const supportedParams = {
    scrape: [
      'url',
      'formats',
      'onlyMainContent',
      'includeTags',
      'excludeTags',
      'headers',
      'waitFor',
      'mobile',
      'skipTlsVerification',
      'timeout',
      'extract',
      'actions',
      'location',
      'removeBase64Images',
      'jsonOptions',
      'agent',
    ],
    map: ['url', 'search', 'ignoreSitemap', 'sitemapOnly', 'includeSubdomains', 'limit'],
    extract: ['urls', 'prompt', 'schema', 'agent'],
  };

  const unsupportedParams = Object.keys(params).filter(
    (param) => !supportedParams[command as keyof typeof supportedParams]?.includes(param)
  );

  return {
    isValid: unsupportedParams.length === 0,
    unsupportedParams,
  };
}

// Command handlers
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user } = interaction;

  // Create Firecrawl instance with user's API key
  const getFirecrawlInstance = (userId: string) => {
    const apiKey = userApiKeys.get(userId);
    return apiKey ? new FirecrawlApp({ apiKey }) : null;
  };

  try {
    switch (commandName) {
      case 'set-api-key': {
        const key = interaction.options.getString('key', true);
        if (checkApiKey(user.id)) {
          await interaction.reply({
            content: 'You already have an API key set. Use /update-api-key to change it.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        userApiKeys.set(user.id, key);
        await interaction.reply({
          content: '✅ API key set successfully!',
          flags: MessageFlags.Ephemeral,
        });
        break;
      }

      case 'update-api-key': {
        const key = interaction.options.getString('key', true);
        if (!checkApiKey(user.id)) {
          await interaction.reply({
            content:
              'You must add your API key before using these commands. To do that, use /set-api-key key value.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        userApiKeys.set(user.id, key);
        await interaction.reply({
          content: '✅ API key updated successfully!',
          flags: MessageFlags.Ephemeral,
        });
        break;
      }

      case 'scrape': {
        if (!checkApiKey(user.id)) {
          await interaction.reply({
            content:
              'You must add your API key before using these commands. To do that, use /set-api-key key value.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const paramsStr = interaction.options.getString('params', true);
        const { valid, data, error } = validateAndParseJSON(paramsStr);

        if (!valid) {
          await interaction.reply({
            content: error,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const typedData = data as Record<string, unknown>;
        const { isValid, unsupportedParams } = checkUnsupportedParams('scrape', typedData);
        if (!isValid) {
          await interaction.reply({
            content: `⚠️ The following parameters are not supported in the bot yet: \`${unsupportedParams.join('`, `')}\``,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (!typedData.url) {
          await interaction.reply({
            content: 'The "url" parameter is required for the scrape command.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const app = getFirecrawlInstance(user.id)!;
        await interaction.deferReply();

        try {
          const scrapeParams = {
            formats: (typedData.formats as Array<
              | 'markdown'
              | 'html'
              | 'rawHtml'
              | 'links'
              | 'screenshot'
              | 'screenshot@fullPage'
              | 'json'
              | 'changeTracking'
            >) || ['markdown'],
            onlyMainContent: (typedData.onlyMainContent as boolean) ?? true,
            includeTags: typedData.includeTags as string[] | undefined,
            excludeTags: typedData.excludeTags as string[] | undefined,
            headers: typedData.headers as Record<string, string> | undefined,
            waitFor: typedData.waitFor as number | undefined,
            mobile: (typedData.mobile as boolean) ?? false,
            skipTlsVerification: (typedData.skipTlsVerification as boolean) ?? false,
            timeout: (typedData.timeout as number) ?? 30000,
            extract: typedData.extract as
              | { prompt?: string; schema?: unknown; systemPrompt?: string }
              | undefined,
            actions: typedData.actions as Action[] | undefined,
            location: typedData.location as { country?: string; languages?: string[] } | undefined,
            agent: typedData.agent,
            jsonOptions: typedData.jsonOptions as Record<string, unknown> | undefined,
          } as ScrapeParams;

          const response = await app.scrapeUrl(typedData.url as string, scrapeParams);
          await sendResponse(interaction, response, 'scrape');
        } catch (error) {
          console.error('Scrape command error:', error);
          await interaction.editReply(
            '⚠️ Error executing scrape command. Please check your parameters and try again.'
          );
        }
        break;
      }

      case 'map': {
        if (!checkApiKey(user.id)) {
          await interaction.reply({
            content:
              'You must add your API key before using these commands. To do that, use /set-api-key key value.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const paramsStr = interaction.options.getString('params', true);
        const { valid, data, error } = validateAndParseJSON(paramsStr);

        if (!valid) {
          await interaction.reply({
            content: error,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const typedData = data as Record<string, unknown>;
        const { isValid, unsupportedParams } = checkUnsupportedParams('map', typedData);
        if (!isValid) {
          await interaction.reply({
            content: `⚠️ The following parameters are not supported in the bot yet: \`${unsupportedParams.join('`, `')}\``,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (!typedData.url) {
          await interaction.reply({
            content: 'The "url" parameter is required for the map command.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const app = getFirecrawlInstance(user.id)!;
        await interaction.deferReply();

        try {
          const mapParams: MapParams = {
            search: typedData.search as string | undefined,
            ignoreSitemap: (typedData.ignoreSitemap as boolean) ?? true,
            sitemapOnly: (typedData.sitemapOnly as boolean) ?? false,
            includeSubdomains: (typedData.includeSubdomains as boolean) ?? false,
            limit: (typedData.limit as number) ?? 5000,
          };

          const response = await app.mapUrl(typedData.url as string, mapParams);
          await sendResponse(interaction, response, 'map');
        } catch (error) {
          console.error('Map command error:', error);
          await interaction.editReply(
            '⚠️ Error executing map command. Please check your parameters and try again.'
          );
        }
        break;
      }

      case 'extract': {
        if (!checkApiKey(user.id)) {
          await interaction.reply({
            content:
              'You must add your API key before using these commands. To do that, use /set-api-key key value.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const paramsStr = interaction.options.getString('params', true);
        const { valid, data, error } = validateAndParseJSON(paramsStr);

        if (!valid) {
          await interaction.reply({
            content: error,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const typedData = data as Record<string, unknown>;
        const { isValid, unsupportedParams } = checkUnsupportedParams('extract', typedData);
        if (!isValid) {
          await interaction.reply({
            content: `⚠️ The following parameters are not supported in the bot yet: \`${unsupportedParams.join('`, `')}\``,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (!typedData.urls || !Array.isArray(typedData.urls) || typedData.urls.length === 0) {
          await interaction.reply({
            content: 'The "urls" parameter is required and must be a non-empty array.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (!typedData.prompt) {
          await interaction.reply({
            content: 'The "prompt" parameter is required for the extract command.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const app = getFirecrawlInstance(user.id)!;
        await interaction.deferReply();

        try {
          const extractParams: Omit<ExtractParams, 'agent'> & { agent?: Record<string, unknown> } =
            {
              prompt: typedData.prompt as string,
              schema: typedData.schema as Record<string, unknown> | undefined,
              agent: typedData.agent as Record<string, unknown> | undefined,
            };

          const response = await app.extract(typedData.urls as string[], extractParams);
          await sendResponse(interaction, response, 'extract');
        } catch (error) {
          console.error('Extract command error:', error);
          await interaction.editReply(
            '⚠️ Error executing extract command. Please check your parameters and try again.'
          );
        }
        break;
      }

      case 'docs': {
        await interaction.reply('📚 Documentation: https://docs.firecrawl.dev');
        break;
      }

      case 'help': {
        const helpMessage = `
🤖 **Firecrawl Discord Bot Help**

Before using any commands, set your API key using \`/set-api-key\`.

Available commands:
• \`/set-api-key <key>\` - Set your Firecrawl API key
• \`/update-api-key <key>\` - Update your existing API key
• \`/scrape\` - Scrape a webpage. Example:
  \`\`\`json
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
  \`\`\`
• \`/map\` - Map URLs from a starting point. Example:
  \`\`\`json
  {
    "url": "https://example.com",
    "search": "optional search term",
    "ignoreSitemap": true,
    "sitemapOnly": false,
    "includeSubdomains": false,
    "limit": 5000
  }
  \`\`\`
• \`/extract\` - Extract structured data. Example:
  \`\`\`json
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
  \`\`\`
• \`/docs\` - Get documentation URL
• \`/help\` - Show this help message

For detailed API documentation, use \`/docs\`
`;
        await interaction.reply({
          content: helpMessage,
          flags: MessageFlags.Ephemeral,
        });
        break;
      }
    }
  } catch (error) {
    console.error('Command error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '⚠️ An error occurred while processing your command. Please try again.',
        flags: MessageFlags.Ephemeral,
      });
    } else if (interaction.deferred) {
      await interaction.editReply(
        '⚠️ An error occurred while processing your command. Please try again.'
      );
    }
  }
});

client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user?.tag}`);
  registerCommands();
});

client.login(process.env.DISCORD_TOKEN);
