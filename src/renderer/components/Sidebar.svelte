<script lang="ts">
  import type { Stats } from '../lib/api';
  import { formatDate } from '../lib/utils';

  interface Props {
    stats: Stats | null;
    search: string;
    sortValue: string;
    dateFrom: string;
    dateTo: string;
    hideAds: boolean;
    importing: boolean;
    importStatus: { message: string; type: 'success' | 'error' | '' } | null;
    onImport: () => void;
    onSearchChange: (value: string) => void;
    onSortChange: (value: string) => void;
    onDateFromChange: (value: string) => void;
    onDateToChange: (value: string) => void;
    onHideAdsChange: (value: boolean) => void;
    onClearFilters: () => void;
  }

  let {
    stats,
    search,
    sortValue,
    dateFrom,
    dateTo,
    hideAds,
    importing,
    importStatus,
    onImport,
    onSearchChange,
    onSortChange,
    onDateFromChange,
    onDateToChange,
    onHideAdsChange,
    onClearFilters,
  }: Props = $props();

  function handleSearchInput(e: Event) {
    const target = e.target as HTMLInputElement;
    onSearchChange(target.value);
  }

  function handleSortChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    onSortChange(target.value);
  }

  function handleDateFromChange(e: Event) {
    const target = e.target as HTMLInputElement;
    onDateFromChange(target.value);
  }

  function handleDateToChange(e: Event) {
    const target = e.target as HTMLInputElement;
    onDateToChange(target.value);
  }

  function handleHideAdsChange(e: Event) {
    const target = e.target as HTMLInputElement;
    onHideAdsChange(target.checked);
  }
</script>

<aside class="sidebar">
  <div class="sidebar-section">
    <h3>Import</h3>
    <button class="btn btn-primary" onclick={onImport} disabled={importing}>
      Import Takeout
    </button>
    {#if importStatus}
      <div class="import-status visible {importStatus.type}">
        {importStatus.message}
      </div>
    {/if}
    {#if stats?.lastTakeoutImport}
      <div class="last-import">
        Last import: {formatDate(stats.lastTakeoutImport)}
      </div>
    {/if}
  </div>

  <div class="sidebar-section">
    <h3>Search</h3>
    <div class="search-box">
      <input
        type="text"
        placeholder="Search videos..."
        value={search}
        oninput={handleSearchInput}
      />
    </div>
  </div>

  <div class="sidebar-section">
    <h3>Filters</h3>
    <div class="filter-group">
      <label for="filter-sort">Sort by</label>
      <select id="filter-sort" value={sortValue} onchange={handleSortChange}>
        <option value="watchedAt-desc">Date (newest first)</option>
        <option value="watchedAt-asc">Date (oldest first)</option>
        <option value="title-asc">Title (A-Z)</option>
        <option value="title-desc">Title (Z-A)</option>
        <option value="channelName-asc">Channel (A-Z)</option>
      </select>
    </div>
    <div class="filter-group">
      <label for="filter-date-from">Date from</label>
      <input
        type="date"
        id="filter-date-from"
        value={dateFrom}
        onchange={handleDateFromChange}
      />
    </div>
    <div class="filter-group">
      <label for="filter-date-to">Date to</label>
      <input
        type="date"
        id="filter-date-to"
        value={dateTo}
        onchange={handleDateToChange}
      />
    </div>
    <div class="checkbox-group">
      <input
        type="checkbox"
        id="filter-hide-ads"
        checked={hideAds}
        onchange={handleHideAdsChange}
      />
      <label for="filter-hide-ads">Hide ads</label>
    </div>
  </div>

  <div class="sidebar-section" style="margin-top: auto;">
    <button class="btn btn-secondary" onclick={onClearFilters}>
      Clear Filters
    </button>
  </div>
</aside>
