<script lang="ts">
  import type { HistoryEntry } from '../lib/api';
  import { formatDate } from '../lib/utils';

  interface Props {
    entries: HistoryEntry[];
    loading: boolean;
    hasSearch: boolean;
  }

  let { entries, loading, hasSearch }: Props = $props();

  function handleClick(url: string) {
    if (url) {
      window.open(url, '_blank');
    }
  }

  function handleThumbnailError(e: Event) {
    const img = e.target as HTMLImageElement;
    img.src = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 9%22><rect fill=%22%23303030%22 width=%2216%22 height=%229%22/></svg>';
  }
</script>

<div class="history-list">
  {#if loading}
    <div class="loading">Loading...</div>
  {:else if entries.length === 0}
    <div class="empty-state">
      <h2>No videos found</h2>
      <p>{hasSearch ? 'Try a different search term.' : 'Import your Google Takeout file to get started.'}</p>
    </div>
  {:else}
    {#each entries as entry (entry.id)}
      <div
        class="history-item {entry.isAd ? 'ad' : ''}"
        onclick={() => handleClick(entry.url)}
        onkeydown={(e) => e.key === 'Enter' && handleClick(entry.url)}
        role="button"
        tabindex="0"
      >
        <img
          class="thumbnail"
          src={entry.thumbnailUrl}
          alt=""
          loading="lazy"
          onerror={handleThumbnailError}
        />
        <div class="details">
          <div class="title">{entry.title}</div>
          <div class="channel">{entry.channelName || 'Unknown channel'}</div>
          <div class="meta">
            <span>{formatDate(entry.watchedAt)}</span>
            {#if entry.isAd}
              <span class="badge ad-badge">Ad</span>
            {/if}
            <span class="badge">{entry.source}</span>
          </div>
        </div>
      </div>
    {/each}
  {/if}
</div>
