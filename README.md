# Little Plains Archive

A content capture and archival system that automatically extracts, analyzes, and catalogs content from social media platforms and web sources using AI-powered categorization.

## Overview

Little Plains Archive captures URLs from various sources (Twitter, Instagram, LinkedIn, Pinterest, web pages, and Slack), extracts content, downloads media, analyzes with Claude AI, and makes everything searchable through an intuitive web interface.

## Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS 4, TypeScript 5.7
- **Backend**: Next.js API Routes, Google Cloud Functions (Gen2)
- **Database**: Supabase (PostgreSQL)
- **Storage**: Google Cloud Storage
- **AI**: Anthropic Claude API
- **Scraping**: Apify API
- **Messaging**: Google Cloud Pub/Sub
- **Integration**: Slack Bolt SDK

## Project Structure

```
little-plains-archive/
├── apps/
│   └── web/                    # Next.js web application
│       ├── src/
│       │   ├── app/            # App Router pages & API routes
│       │   ├── components/     # React components
│       │   ├── lib/            # Utilities (Supabase, Pub/Sub)
│       │   └── types/          # TypeScript types
│       └── .env.example        # Environment template
│
├── packages/
│   ├── core/                   # Shared types & Zod schemas
│   ├── analyzer/               # Claude AI content analyzer
│   ├── scrapers/               # Platform-specific content extraction
│   └── storage/                # Storage utilities
│
├── functions/
│   └── process-capture/        # Google Cloud Function for async processing
│
├── supabase/
│   └── schema.sql              # PostgreSQL schema definition
│
├── scripts/                    # Utility scripts
├── turbo.json                  # Turbo task pipeline
└── tsconfig.json               # TypeScript configuration
```

## Features

### Content Capture Pipeline

1. **URL Submission** via web form, API, or Slack bot
2. **Asynchronous Processing** through Cloud Functions
3. **Multi-source Scraping**: Twitter, Instagram, LinkedIn, Pinterest, generic web
4. **Media Processing**: Downloads images/videos to Google Cloud Storage
5. **AI Analysis**: Claude generates summaries, topics, disciplines, and use cases

### AI-Powered Analysis

- Automatic summarization (500 char max)
- Topic categorization: AI, Design, Technology, Business, Culture, etc.
- Discipline classification
- Use case tagging: Reference, Inspiration, Tutorial, etc.
- Content type detection: post, article, thread, image, video

### Intelligent Search

- Natural language queries processed by Claude
- Keyword extraction with synonyms
- Topic and use case matching
- Relevance scoring

### Slack Integration

- Automatic URL detection in messages
- One-click capture with context preservation
- User attribution
- Optional channel filtering

### User Interface

- Responsive grid layout (2-5 columns)
- Fixed search bar with AI-powered queries
- Filter sidebar by source, topic, date range
- Detail modal for full content viewing
- Infinite scroll pagination

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10.2.0+
- Supabase project
- Google Cloud project with Pub/Sub & Cloud Functions
- Anthropic API key
- Apify API token (for social media scraping)
- Slack app (optional, for bot integration)

### Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd little-plains-archive
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   cp apps/web/.env.example apps/web/.env.local
   ```

   Edit `apps/web/.env.local` with your credentials (see [Environment Variables](#environment-variables)).

4. **Setup database**:
   - Run the SQL in `supabase/schema.sql` in your Supabase SQL editor
   - Create a storage bucket in Google Cloud Storage

5. **Start development server**:
   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:3000`.

### Building for Production

```bash
npm run build
```

### Deploy Cloud Function

```bash
cd functions/process-capture
cp .env.example .env.deploy
# Edit .env.deploy with your credentials
npm run deploy
```

## Environment Variables

### Web Application (`apps/web/.env.local`)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase API key |
| `SUPABASE_SERVICE_ROLE_KEY` | Private Supabase service role key |
| `GOOGLE_CLOUD_PROJECT_ID` | GCP project ID |
| `GOOGLE_CLOUD_PUBSUB_TOPIC` | Pub/Sub topic name for processing |
| `ANTHROPIC_API_KEY` | Claude API key |
| `APIFY_API_TOKEN` | Apify API token |
| `SLACK_SIGNING_SECRET` | Slack app signing secret |
| `SLACK_BOT_TOKEN` | Slack bot OAuth token |
| `SLACK_ALLOWED_CHANNELS` | Comma-separated channel IDs (optional) |

### Cloud Function (`functions/process-capture/.env.deploy`)

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `GCS_BUCKET_NAME` | Google Cloud Storage bucket name |
| `ANTHROPIC_API_KEY` | Claude API key |
| `APIFY_API_TOKEN` | Apify API token |

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/capture` | POST | Submit a URL for processing |
| `/api/status/[id]` | GET | Check capture processing status |
| `/api/search` | POST/GET | AI-powered search |
| `/api/items` | GET | Fetch items with filters & pagination |
| `/api/filters` | GET | Get available filter options |
| `/api/slack/events` | POST | Slack bot webhook |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |
| `npm run status` | Check processing pipeline status |
| `npm run process:pending` | Manually process pending captures |
| `npm run retry:failed` | Retry failed captures |
| `npm run logs:function` | View Cloud Function logs |

## Architecture

### Capture Flow

1. URL submitted via web form, API, or Slack
2. URL validated and checked for duplicates
3. Message queued to Pub/Sub
4. Cloud Function triggered
5. Content scraped using platform-specific scrapers
6. Media downloaded to Google Cloud Storage
7. Content analyzed by Claude AI
8. Results saved to Supabase database

### Monorepo Structure

The project uses npm workspaces and Turbo for monorepo management:

- **apps/web**: Main Next.js application
- **packages/core**: Shared TypeScript types and Zod schemas
- **packages/analyzer**: Claude AI integration for content analysis
- **packages/scrapers**: Platform-specific content extractors
- **functions/process-capture**: Serverless processing function

## Database Schema

The main `content_items` table stores:

- **Content**: URL, title, description, body text
- **Source metadata**: Author, platform, published date
- **Media**: Images and videos (JSONB arrays with GCS URLs)
- **AI analysis**: Summary, topics, disciplines, use cases, content type
- **Slack context**: Channel, user, message metadata
- **Status tracking**: Processing state and error messages

See `supabase/schema.sql` for the complete schema definition.

## License

Private project - all rights reserved.
