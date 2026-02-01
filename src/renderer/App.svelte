<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type Stats, type HistoryEntry } from './lib/api';
  import Header from './components/Header.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import HistoryList from './components/HistoryList.svelte';
  import Pagination from './components/Pagination.svelte';

  // State
  let stats: Stats | null = $state(null);
  let entries: HistoryEntry[] = $state([]);
  let loading = $state(true);
  let currentPage = $state(1);
  let totalEntries = $state(0);
  const pageSize = 50;

  // Filter state
  let search = $state('');
  let sortValue = $state('watchedAt-desc');
  let dateFrom = $state('');
  let dateTo = $state('');
  let hideAds = $state(false);

  // Import state
  let importing = $state(false);
  let importStatus: { message: string; type: 'success' | 'error' | '' } | null = $state(null);

  // Debounce timer for search
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  // Computed
  let totalPages = $derived(Math.ceil(totalEntries / pageSize));

  function getQueryOptions() {
    const [orderBy, orderDir] = sortValue.split('-');
    return {
      limit: pageSize,
      offset: (currentPage - 1) * pageSize,
      orderBy,
      orderDir: orderDir as 'asc' | 'desc',
      search: search || undefined,
      dateFrom: dateFrom ? dateFrom + 'T00:00:00.000Z' : undefined,
      dateTo: dateTo ? dateTo + 'T23:59:59.999Z' : undefined,
      includeAds: !hideAds,
    };
  }

  async function loadStats() {
    try {
      stats = await api.getStats();
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }

  async function loadHistory() {
    loading = true;
    try {
      const options = getQueryOptions();
      const result = await api.getHistory(options);
      entries = result.entries;
      totalEntries = result.total;
    } catch (err) {
      console.error('Failed to load history:', err);
      entries = [];
      totalEntries = 0;
    } finally {
      loading = false;
    }
  }

  async function handleImport() {
    importing = true;
    importStatus = { message: 'Selecting file...', type: '' };

    try {
      const filePath = await api.showOpenDialog();
      if (!filePath) {
        importStatus = null;
        importing = false;
        return;
      }

      importStatus = { message: 'Importing...', type: '' };
      const result = await api.importTakeout(filePath);

      if (result.success && result.stats) {
        importStatus = {
          message: `Imported ${result.stats.inserted.toLocaleString()} videos (${result.stats.duplicatesInDb.toLocaleString()} duplicates skipped)`,
          type: 'success',
        };
        await loadStats();
        await loadHistory();
      } else {
        importStatus = {
          message: `Error: ${result.error}`,
          type: 'error',
        };
      }
    } catch (err) {
      importStatus = {
        message: `Error: ${err instanceof Error ? err.message : 'Import failed'}`,
        type: 'error',
      };
    } finally {
      importing = false;
    }
  }

  function handleSearchChange(value: string) {
    search = value;
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    searchTimeout = setTimeout(() => {
      currentPage = 1;
      loadHistory();
    }, 300);
  }

  function handleSortChange(value: string) {
    sortValue = value;
    currentPage = 1;
    loadHistory();
  }

  function handleDateFromChange(value: string) {
    dateFrom = value;
    currentPage = 1;
    loadHistory();
  }

  function handleDateToChange(value: string) {
    dateTo = value;
    currentPage = 1;
    loadHistory();
  }

  function handleHideAdsChange(value: boolean) {
    hideAds = value;
    currentPage = 1;
    loadHistory();
  }

  function handleClearFilters() {
    search = '';
    sortValue = 'watchedAt-desc';
    dateFrom = '';
    dateTo = '';
    hideAds = false;
    currentPage = 1;
    loadHistory();
  }

  function handlePrevPage() {
    if (currentPage > 1) {
      currentPage--;
      loadHistory();
    }
  }

  function handleNextPage() {
    if (currentPage < totalPages) {
      currentPage++;
      loadHistory();
    }
  }

  onMount(() => {
    loadStats();
    loadHistory();
  });
</script>

<Header {stats} />

<div class="app-container">
  <Sidebar
    {stats}
    {search}
    {sortValue}
    {dateFrom}
    {dateTo}
    {hideAds}
    {importing}
    {importStatus}
    onImport={handleImport}
    onSearchChange={handleSearchChange}
    onSortChange={handleSortChange}
    onDateFromChange={handleDateFromChange}
    onDateToChange={handleDateToChange}
    onHideAdsChange={handleHideAdsChange}
    onClearFilters={handleClearFilters}
  />

  <main class="main-content">
    <HistoryList {entries} {loading} hasSearch={!!search} />
    <Pagination
      {currentPage}
      {totalPages}
      {totalEntries}
      onPrev={handlePrevPage}
      onNext={handleNextPage}
    />
  </main>
</div>
