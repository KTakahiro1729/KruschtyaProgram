<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="brand">Kruschtya Program</div>
      <nav class="app-nav">
        <RouterLink to="/">ロビー</RouterLink>
      </nav>
    </header>
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
</script>
