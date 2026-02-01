<script lang="ts">
  import type { Stats } from '../lib/api';
  import { formatRelativeTime } from '../lib/utils';

  interface Props {
    stats: Stats | null;
  }

  let { stats }: Props = $props();
</script>

<header>
  <h1>YouTube History</h1>
  <div class="header-stats">
    <span>Videos: <strong>{stats?.total?.toLocaleString() ?? '-'}</strong></span>
    <span>Non-ads: <strong>{stats?.nonAds?.toLocaleString() ?? '-'}</strong></span>
    <span>Latest: <strong>{stats?.latestWatched ? formatRelativeTime(stats.latestWatched) : '-'}</strong></span>
  </div>
</header>
