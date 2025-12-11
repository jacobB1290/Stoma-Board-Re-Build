# Stoma Board

A modern Dental Lab Case Management System built with Next.js 14, TypeScript, and Supabase.

## Architecture

This application is built with an **Action-Driven Architecture** that enables:

1. **Unified Action System** - Every user interaction is represented as a typed action
2. **LLM Integration Ready** - The same actions can be triggered by AI assistants
3. **Type-Safe Throughout** - Full TypeScript support from database to UI

### Core Concepts

```
┌─────────────────┐     ┌─────────────────┐
│   React UI      │     │   LLM API       │
│  (buttons,      │     │  (natural       │
│   forms, etc)   │     │   language)     │
└────────┬────────┘     └────────┬────────┘
         │                       │
         │  { type, payload }    │  { type, payload }
         │                       │
         └───────────┬───────────┘
                     ▼
         ┌───────────────────────┐
         │   ACTION DISPATCHER   │
         │   (Central Hub)       │
         └───────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │   Services Layer      │
         │   (caseService, etc)  │
         └───────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │   Supabase DB         │
         └───────────────────────┘
```

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Database:** Supabase (PostgreSQL)
- **Styling:** Tailwind CSS v4
- **Animation:** Framer Motion
- **State:** React Context + Realtime subscriptions

## Project Structure

```
src/
├── actions/           # Action system (schema, dispatcher)
├── app/              # Next.js app router pages
├── components/       # React components
│   ├── common/       # Shared components (Header, etc)
│   ├── board/        # Board view components
│   ├── editor/       # Case editor components
│   └── settings/     # Settings components
├── contexts/         # React contexts
├── hooks/            # Custom React hooks
├── lib/              # Utilities (Supabase client, constants)
├── services/         # Database services
└── types/            # TypeScript types
```

## Setup

### Prerequisites

- Node.js 18+
- A Supabase project

### Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Database Setup

Run these SQL commands in your Supabase SQL editor:

```sql
-- Cases table
CREATE TABLE cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  casenumber TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT 'General',
  due TIMESTAMP WITH TIME ZONE NOT NULL,
  priority BOOLEAN DEFAULT false,
  modifiers TEXT[] DEFAULT '{}',
  completed BOOLEAN DEFAULT false,
  archived BOOLEAN DEFAULT false,
  archived_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Case history table
CREATE TABLE case_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  user_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Active devices table (for user presence)
CREATE TABLE active_devices (
  user_name TEXT PRIMARY KEY,
  app_version TEXT,
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE cases;

-- Indexes
CREATE INDEX idx_cases_archived ON cases(archived);
CREATE INDEX idx_cases_due ON cases(due);
CREATE INDEX idx_case_history_case_id ON case_history(case_id);
```

### Installation

```bash
npm install
npm run dev
```

## Available Actions

The action system supports these operations:

### Case Actions
- `case.create` - Create a new case
- `case.update` - Update case details
- `case.delete` - Delete a case
- `case.toggle_priority` - Toggle priority flag
- `case.toggle_rush` - Toggle rush flag
- `case.toggle_hold` - Toggle hold flag
- `case.toggle_complete` - Mark complete/incomplete
- `case.change_stage` - Move to different stage
- `case.archive` - Archive cases
- `case.restore` - Restore from archive

### UI Actions
- `ui.set_department` - Change department filter
- `ui.set_theme` - Change color theme
- `ui.navigate` - Navigate between views

### Query Actions
- `query.get_case` - Get case by ID
- `query.search_cases` - Search cases
- `query.get_overdue` - Get overdue cases
- `query.check_duplicates` - Check for duplicate case numbers

## Deployment

### Vercel

1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy!

## Development Roadmap

- [x] Core action system
- [x] Supabase integration
- [x] User identity & heartbeat
- [x] Basic layout shell
- [ ] Board view with day columns
- [ ] Case editor form
- [ ] Settings modal
- [ ] Overdue/Hold sidebars
- [ ] Stage management for Digital cases
- [ ] LLM API endpoint
- [ ] Statistics & metrics

## License

Private - All rights reserved
