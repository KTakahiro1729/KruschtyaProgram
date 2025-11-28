<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="brand">Kruschtya Program</div>
    </header>
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router';
</script>
