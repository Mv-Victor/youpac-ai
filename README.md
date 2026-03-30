# YouPac AI - YouTube Content Creation Assistant

An AI-powered platform that helps YouTube creators generate compelling titles, descriptions, thumbnails, and social media posts from their video content. Built with React Router v7, Convex, and OpenAI.

## Features

### Core Functionality
- 🎬 **Video Upload & Processing** - Upload videos up to 1GB with automatic transcription
- 🤖 **AI Content Generation** - Generate titles, descriptions, thumbnails, and tweets
- 🎨 **Visual Canvas Interface** - Drag-and-drop nodes for content workflow
- 💬 **Smart Chat Integration** - Chat with AI agents to refine content
- 👁️ **Content Preview** - See how content looks on YouTube and Twitter/X
- 🔗 **Share System** - Share read-only canvas views with collaborators

### AI Agents
- 📝 **Title Agent** - Creates catchy, SEO-optimized video titles
- 📄 **Description Agent** - Writes comprehensive video descriptions
- 🖼️ **Thumbnail Agent** - Generates thumbnail concepts and images with DALL-E 3
- 🐦 **Social Media Agent** - Creates Twitter/X threads for video promotion

### Technical Features
- 🚀 **React Router v7** - Modern full-stack React framework
- ⚡️ **Real-time Updates** - Live canvas synchronization with Convex
- 🔒 **TypeScript** - Full type safety throughout the codebase
- 🎨 **Beautiful UI** - Modern design with Tailwind CSS and shadcn/ui
- 🔐 **Authentication** - Secure user management with Clerk
- 📱 **Responsive Design** - Works seamlessly on all devices
- 🚢 **Vercel Ready** - Optimized for one-click deployment

## Tech Stack

### Frontend
- **React Router v7** - Full-stack React framework with SSR
- **React Flow** - Interactive canvas for visual workflows
- **TailwindCSS v4** - Utility-first CSS framework
- **shadcn/ui** - Modern component library with Radix UI
- **Lucide React** - Beautiful icon library
- **Sonner** - Toast notifications

### Backend & Services
- **Convex** - Real-time database and serverless functions
- **Clerk** - Authentication and user management
- **OpenAI** - GPT-4 for content generation, DALL-E 3 for thumbnails
- **ElevenLabs** - Advanced speech-to-text transcription
- **FFmpeg** - Video processing and audio extraction

### Development & Deployment
- **Vite** - Lightning-fast build tool
- **TypeScript** - End-to-end type safety
- **Vercel** - Deployment platform

## Getting Started

### Prerequisites

- Node.js 18+ 
- Clerk account for authentication
- Convex account for database
- OpenAI API key for content generation
- ElevenLabs API key for transcription

### Installation

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Copy the environment file and configure your credentials:

```bash
cp .env.example .env.local
```

3. Set up your environment variables in `.env.local`:

```bash
# Convex Configuration
CONVEX_DEPLOYMENT=your_convex_deployment_here
VITE_CONVEX_URL=your_convex_url_here

# Clerk Authentication
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key_here
CLERK_SECRET_KEY=your_clerk_secret_key_here

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# ElevenLabs Configuration
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# Frontend URL
FRONTEND_URL=http://localhost:5173
```

4. Initialize Convex:

```bash
npx convex dev
```

5. Set up environment variables in Convex dashboard:
   - `OPENAI_API_KEY`
   - `ELEVENLABS_API_KEY`
or run the command below
```bash
npx convex env set ELEVENLABS_API_KEY ... && npx convex env set OPENAI_API_KEY ... && npx convex env set OPENAI_BASE_URL ... && npx convex env set ANTHROPIC_API_KEY ... && npx convex env set ANTHROPIC_URL ...
```

### Development

Start the development server with HMR:

```bash
npm run dev
```

Your application will be available at `http://localhost:5173`.

## Building for Production

Create a production build:

```bash
npm run build
```

## Deployment

### Vercel Deployment (Recommended)

This starter kit is optimized for Vercel deployment with the `@vercel/react-router` preset:

1. Connect your repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

The `react-router.config.ts` includes the Vercel preset for seamless deployment.

### Docker Deployment

To build and run using Docker:

```bash
docker build -t my-app .

# Run the container
docker run -p 3000:3000 my-app
```

The containerized application can be deployed to any platform that supports Docker:

- AWS ECS
- Google Cloud Run
- Azure Container Apps
- Digital Ocean App Platform
- Fly.io
- Railway

### DIY Deployment

If you're familiar with deploying Node applications, the built-in app server is production-ready.

Make sure to deploy the output of `npm run build`

```
├── package.json
├── package-lock.json
├── build/
│   ├── client/    # Static assets
│   └── server/    # Server-side code
```

## How It Works

### 1. Upload Video
- Upload any video file (up to 1GB)
- Automatic transcription using ElevenLabs
- Extract video metadata (duration, resolution, etc.)

### 2. Generate Content
- AI agents analyze your video and transcription
- Generate optimized titles, descriptions, thumbnails, and social posts
- Each agent can be regenerated individually

### 3. Refine with Chat
- Use @mentions to chat with specific agents
- Request changes or regenerate content
- AI understands context from your video

### 4. Preview & Export
- Preview how content looks on YouTube and Twitter/X
- Copy content to clipboard
- Export as markdown files
- Share canvas with collaborators

## Architecture

### Key Routes
- `/` - Homepage with features overview
- `/sign-in` & `/sign-up` - Authentication pages
- `/dashboard` - Projects dashboard
- `/dashboard/settings` - Profile configuration
- `/canvas/:projectId` - Interactive content canvas
- `/share/:shareId` - Read-only shared canvas

### Key Features

#### Canvas System
- Visual workflow with draggable nodes
- Real-time collaboration support
- Auto-save every 5 seconds
- Connection validation between nodes

#### AI Content Generation
- Context-aware generation using video transcription
- Profile-based personalization
- Batch generation with "Generate All"
- Individual regeneration per agent

#### Profile System
- Channel information for personalized content
- Tone and style preferences
- Target audience configuration
- Progress tracking

## Environment Variables

### Required for Production

#### Application Variables
- `VITE_CONVEX_URL` - Your Convex client URL
- `VITE_CLERK_PUBLISHABLE_KEY` - Clerk publishable key
- `CLERK_SECRET_KEY` - Clerk secret key for server-side auth
- `FRONTEND_URL` - Your production frontend URL

#### Convex Environment Variables (set in Convex dashboard)
- `OPENAI_API_KEY` - OpenAI API key for GPT-4 and DALL-E 3
- `ELEVENLABS_API_KEY` - ElevenLabs API key for transcription

## Project Structure

```
├── app/
│   ├── components/         
│   │   ├── ui/           # shadcn/ui components
│   │   ├── canvas/       # Canvas and node components
│   │   ├── homepage/     # Landing page sections
│   │   ├── dashboard/    # Dashboard layout components
│   │   └── preview/      # YouTube/Twitter preview components
│   ├── routes/           # React Router routes
│   │   ├── dashboard/    # Protected dashboard routes
│   │   └── canvas/       # Canvas route and share
│   ├── lib/              # Utility functions
│   └── styles/           # Global styles
├── convex/               # Backend functions
│   ├── schema.ts         # Database schema
│   ├── videos.ts         # Video operations
│   ├── agents.ts         # AI agent functions
│   ├── projects.ts       # Project management
│   └── aiHackathon.ts    # AI generation logic
├── public/               # Static assets
└── docs/                 # Documentation
```

## Key Dependencies

- `react` & `react-dom` v19 - Latest React
- `react-router` v7 - Full-stack React framework
- `@clerk/react-router` - Authentication
- `convex` - Real-time database
- `@xyflow/react` - Interactive canvas (React Flow)
- `openai` - GPT-4 and DALL-E 3 integration
- `@vercel/react-router` - Vercel deployment
- `tailwindcss` v4 - Styling
- `@radix-ui/*` - UI primitives
- `sonner` - Toast notifications
- `ffmpeg-wasm` - Client-side video processing

## Scripts

- `npm run dev` - Start development server with Convex
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run typecheck` - Run TypeScript checks

## Screenshots

### Dashboard
Projects dashboard with grid view and quick actions.

### Canvas
Interactive visual workflow for content generation.

### Content Preview
See how your content looks on YouTube and Twitter/X.

## Roadmap

- [ ] YouTube URL import support
- [ ] Batch export functionality
- [ ] Team collaboration features
- [ ] Analytics integration
- [ ] More social media platforms
- [ ] Custom AI prompts
- [ ] Video trimming tools

## Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

**Transform your YouTube content creation workflow with AI.** YouPac AI helps creators save hours by automatically generating optimized titles, descriptions, thumbnails, and social media posts from their video content.

Built with ❤️ using React Router v7, Convex, OpenAI, and ElevenLabs.