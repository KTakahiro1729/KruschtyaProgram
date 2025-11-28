<template>
  <header class="session-header">
    <div class="header-left">
      <p class="eyebrow">セッション</p>
      <h1>Session {{ sessionId }}</h1>
      <p class="muted">高密度なKPビュー。ステータスとクロックを常に表示します。</p>
    </div>
    <div class="header-right">
      <div class="clock-tile">
        <Clock3 class="icon" />
        <div>
          <div class="clock-text">{{ clockText }}</div>
          <div class="status-pill">
            <Sparkles class="icon" />
            <span>{{ statusText }}</span>
          </div>
        </div>
      </div>
      <button
        v-if="kpEnabled"
        class="pill danger"
        :class="{ 'animate-pulse': paused }"
        type="button"
        @click="$emit('toggle-pause')"
      >
        <component :is="paused ? Play : Pause" class="icon" />
        <span>{{ paused ? '再開' : '一時停止' }}</span>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { Clock3, Pause, Play, Sparkles } from 'lucide-vue-next';

defineProps<{
  sessionId: string;
  clockText: string;
  statusText: string;
  kpEnabled?: boolean;
  paused?: boolean;
}>();

defineEmits<{ (e: 'toggle-pause'): void }>();
</script>
