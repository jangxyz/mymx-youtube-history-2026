# Product Requirements Document: YouTube Watch History Manager

**Last Updated**: 2026-01-31

## Overview

An Electron-based desktop application for managing and tracking personal YouTube watch history. The app uses browser automation to fetch watch history data and provides local storage with optional cloud sync capabilities.

## Background

### Problem
- YouTube Data API v3 does not reliably provide access to user watch history (known issue: returns empty results)
- Google Takeout requires manual export process and is not real-time
- Need a personal solution for automated watch history tracking and management

### Solution
Use Playwright browser automation within an Electron app to scrape YouTube's watch history page while the user is logged in.

## Target Users

- **Primary**: Personal use by developer
- **Scope**: Single-user application, not intended for distribution

## Technical Approach

### Core Technology Stack
- **Framework**: Electron
- **Language**: TypeScript (preferred)
- **Browser Automation**: Playwright
- **Module System**: ESM (import/export)
- **Package Manager**: pnpm

### Architecture

```
Electron App
├── Main Process (Node.js)
│   ├── Playwright automation
│   ├── Data scraping & parsing
│   └── Local database management
│
└── Renderer Process (Web UI)
    ├── Display watch history
    ├── Search/filter interface
    └── Trigger sync operations
```

## Key Features

### Phase 1: Core Functionality
1. **Browser Automation**
   - Launch browser with persistent user data (maintain login state)
   - Navigate to `youtube.com/feed/history`
   - Handle infinite scroll to load historical content
   - Extract video data from DOM

2. **Data Extraction**
   - Video ID
   - Video title
   - Channel name
   - Watch timestamp
   - Thumbnail URL
   - Video URL
   - Duration (optional)
   - View count (optional)
   - Description (optional)

3. **Local Storage**
   - Options: SQLite (structured) or JSON files (simple)
   - Store extracted watch history
   - Prevent duplicate entries

4. **Basic UI**
   - Display watch history
   - Manual sync trigger
   - Basic search/filter

### Phase 2: Enhanced Features (Future)
- Incremental sync (fetch only new videos since last sync)
- Scheduled automatic syncing
- Statistics and analytics dashboard
- Advanced search and filtering
- Export capabilities (CSV, JSON)
- Cloud sync to external database

## Storage & Sync Strategy

### Local Storage
- **Primary**: SQLite or JSON files
- **Purpose**: Fast local access, works offline

### Cloud Sync (Optional)
- **Options**: PostgreSQL, MySQL, Supabase, Firebase
- **Purpose**: Access data from web interface
- **Scope**: Personal use only, single-user access

## Technical Considerations

### Advantages
- Full control over personal data
- Works with user's actual logged-in YouTube account
- Can run on-demand or scheduled
- No API quotas or restrictions
- No dependency on unreliable YouTube API endpoints

### Limitations
- **Fragile**: Breaks if YouTube changes HTML structure (requires maintenance)
- **Performance**: Slower than API access (must render pages, handle scrolling)
- **Size**: Playwright adds ~200MB to application size
- **Distribution**: Personal use only, cannot be distributed (violates YouTube ToS)
- **Legal**: Technically violates YouTube Terms of Service (scraping)

## User Flow

1. User launches Electron app
2. App opens browser window (Playwright) or uses existing login session
3. User signs into YouTube (first time only, session persists)
4. App navigates to youtube.com/feed/history
5. App scrolls and extracts video data
6. Data is parsed and stored in local database
7. User can view/search history in app UI
8. Optional: Data syncs to cloud database for web access

## Non-Goals

- Multi-user support
- Public distribution
- Compliance with YouTube API terms (acknowledged ToS violation)
- Real-time tracking (polling-based sync only)
- Mobile app support

## Success Criteria

- Successfully extract watch history from YouTube
- Store data locally with no duplicates
- Provide searchable interface for history
- Maintain user login session across app launches
- Handle incremental updates efficiently

## Future Considerations

- Analytics and viewing patterns
- Recommendations based on watch history
- Integration with other YouTube data (liked videos, playlists)
- Data visualization (charts, graphs)
- Backup and restore functionality
