# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Data360 is a Next.js-based admin dashboard monorepo built with Turborepo. The application provides a comprehensive data analytics platform with various modules including governance, data source connections, workflow management, mapping, and business intelligence reporting.

## Key Architecture

### Monorepo Structure
- **Root**: Contains workspace configuration (`turbo.json`, `pnpm-workspace.yaml`)
- **apps/data360**: Main Next.js application
- **packages/**: Shared packages and configurations
- Uses Turborepo for build orchestration and caching

### Technology Stack
- **Framework**: Next.js 14.2.15 with App Router
- **Package Manager**: pnpm 9.1.4
- **Build System**: Turborepo 2.1.3
- **Styling**: Tailwind CSS with custom components
- **UI Library**: RizzUI (custom component library)
- **State Management**: Jotai
- **Database/API**: Custom services with axios
- **Authentication**: NextAuth.js
- **Charts**: Recharts and Chart.js
- **Tables**: TanStack Table (@tanstack/react-table)

### Application Structure
The main app follows Next.js App Router convention:
- **src/app/(hydrogen)**: Main dashboard layout and pages
- **src/shared**: Reusable components and business logic
- **src/layouts**: Multiple layout systems (hydrogen, carbon, boron, etc.)
- **src/config**: Application configuration and constants
- **src/services**: API service layer

## Common Development Commands

### Development
```bash
pnpm install              # Install dependencies
pnpm run dev             # Start all workspaces in development
pnpm run iso:dev         # Start only the data360 app
```

### Building and Testing
```bash
pnpm run build           # Build all workspaces
pnpm run start           # Start production build
pnpm run lint            # Lint all workspaces
pnpm run iso:lint        # Lint only the data360 app
```

### Cleanup
```bash
pnpm run clean           # Clean all build artifacts and node_modules
pnpm run cache:clean     # Clean Turborepo cache
```

## Key Application Modules

### Core Features
- **Governance**: User, role, and grant management (`src/app/(hydrogen)/gouvernance/`)
- **Data Source Connection**: S3, Azure, Snowflake integrations (`src/app/(hydrogen)/data-source-connection/`)
- **Mapping**: Database schema mapping wizard (`src/app/(hydrogen)/mapping/`)
- **Workflow**: Business process management (`src/app/(hydrogen)/workflow/`)
- **BI Reporting**: Analytics and reporting (`src/app/(hydrogen)/bi-reporting/`)

### Layout System
The application supports multiple layout themes:
- **Hydrogen**: Default layout (primary)
- **Carbon**: Alternative layout with drawer
- **Boron**: Header-focused layout
- **Beryllium**: Fixed menu layout
- **Lithium**: Minimalist layout
- **Helium**: Sidebar-heavy layout

### Component Architecture
- **Base Components**: Located in `src/components/ui/`
- **Shared Components**: Business logic components in `src/shared/`
- **Page Components**: Feature-specific components within each route

### Services Layer
API services are organized by feature:
- **Auth Services**: `src/services/auth/`
- **Governance Services**: `src/services/gouvernance/`
- **Mapping Services**: `src/services/mapping/`
- **Data Source Services**: `src/services/data-source-connection/`

## Development Guidelines

### Environment Configuration
- Copy `.env.example` to `.env` in each workspace
- Required environment variables are defined in `turbo.json`
- NextAuth configuration requires `NEXTAUTH_SECRET` and `NEXTAUTH_URL`

### Code Organization
- Use the existing service layer for API calls
- Follow the established pattern of page components + shared business logic
- Maintain the layout system structure when adding new pages
- Use the existing validation schemas in `src/validators/`

### Styling and UI
- Use RizzUI components from the `rizzui` package
- Follow Tailwind CSS conventions
- Maintain consistency with existing design patterns
- Use the theme system defined in `src/layouts/settings/`

### Data Management
- Use Jotai for state management
- API services are organized by domain
- Tables use TanStack Table with custom configurations
- Charts use Recharts with custom styling

## Testing and Quality
- Run `pnpm run lint` before commits
- Format code with `pnpm run format` (in data360 workspace)
- Ensure TypeScript type checking passes
- Test across different layout themes

## Key File Locations
- **Main Layout**: `src/layouts/hydrogen/layout.tsx`
- **Menu Configuration**: `src/layouts/hydrogen/menu-items.tsx`
- **Routes**: `src/config/routes.ts`
- **Site Configuration**: `src/config/site.config.tsx`
- **Theme Settings**: `src/layouts/settings/`