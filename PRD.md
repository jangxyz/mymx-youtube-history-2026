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
Hybrid approach combining Google Takeout for initial data seeding and Playwright browser automation for incremental updates:
1. **Initial Seed**: Import historical watch history from Google Takeout export
2. **Incremental Updates**: Use Playwright to fetch new watch history entries going forward

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

1. **Google Takeout Import (Initial Seed)**
   - Parse Google Takeout watch history JSON/HTML files
   - Import historical watch data into local database
   - Handle Google Takeout data format
   - Provide import UI/workflow

2. **Browser Automation (Incremental Updates)**
   - Launch browser with persistent user data (maintain login state)
   - Navigate to `youtube.com/feed/history`
   - Fetch only new entries since last sync
   - Extract video data from DOM

3. **Data Extraction**
   - Video ID
   - Video title
   - Channel name
   - Watch timestamp
   - Thumbnail URL
   - Video URL
   - Duration (optional)
   - View count (optional)
   - Description (optional)

4. **Local Storage**
   - Options: SQLite (structured) or JSON files (simple)
   - Store extracted watch history
   - Prevent duplicate entries
   - Track last sync timestamp

5. **Basic UI**
   - Display watch history
   - Import from Google Takeout
   - Manual incremental sync trigger
   - Basic search/filter

### Phase 2: Enhanced Features (Future)
- Scheduled automatic syncing
- Re-import from updated Google Takeout (for data verification/recovery)
- Statistics and analytics dashboard
- Advanced search and filtering
- Export capabilities (CSV, JSON)
- Cloud sync to external database

## Google Takeout Data Format

### Expected Format
Google Takeout provides YouTube watch history in the following format:
- **File**: `watch-history.json` or `watch-history.html`
- **Structure**: Array of watch events with video metadata
- **Fields**: Video title, video ID, channel name, watch timestamp, URL

### Parsing Requirements
- Handle both JSON and HTML formats
- Extract video ID from YouTube URL
- Parse timestamp into standardized format
- Handle missing or incomplete data gracefully
- Detect and skip duplicate entries

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
- **Hybrid Approach**: Combines official data source (Takeout) with automation (Playwright)
- **Complete History**: Google Takeout provides full historical data from account creation
- **Efficient Updates**: Playwright only needs to fetch recent entries incrementally
- **Reduced Scraping**: Minimizes browser automation usage, making it more maintainable
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

### Initial Setup
1. User launches Electron app (first time)
2. User exports YouTube watch history via Google Takeout
3. User imports Takeout data file into app
4. App parses and stores historical data in local database

### Incremental Updates
1. User triggers sync (manual or scheduled)
2. App opens browser window (Playwright) with persistent login session
3. User signs into YouTube (first time only, session persists)
4. App navigates to youtube.com/feed/history
5. App fetches only new entries since last sync timestamp
6. Data is parsed and stored in local database
7. User can view/search complete history in app UI
8. Optional: Data syncs to cloud database for web access

## Non-Goals

- Multi-user support
- Public distribution
- Compliance with YouTube API terms (acknowledged ToS violation)
- Real-time tracking (polling-based sync only)
- Mobile app support

## Success Criteria

- Successfully import and parse Google Takeout watch history data
- Successfully extract incremental watch history from YouTube via Playwright
- Store data locally with no duplicates
- Provide searchable interface for complete history
- Maintain user login session across app launches
- Handle incremental updates efficiently (only fetch new entries)
- Seamlessly merge Takeout data with Playwright-scraped data

## Future Considerations

- Analytics and viewing patterns
- Recommendations based on watch history
- Integration with other YouTube data (liked videos, playlists)
- Data visualization (charts, graphs)
- Backup and restore functionality
