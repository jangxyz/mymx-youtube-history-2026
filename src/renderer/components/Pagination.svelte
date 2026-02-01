<script lang="ts">
  interface Props {
    currentPage: number;
    totalPages: number;
    totalEntries: number;
    onPrev: () => void;
    onNext: () => void;
  }

  let { currentPage, totalPages, totalEntries, onPrev, onNext }: Props = $props();
</script>

{#if totalPages > 1}
  <div class="pagination">
    <button onclick={onPrev} disabled={currentPage === 1}>Previous</button>
    <span class="page-info">Page {currentPage} of {totalPages} ({totalEntries.toLocaleString()} videos)</span>
    <button onclick={onNext} disabled={currentPage >= totalPages}>Next</button>
  </div>
{/if}
