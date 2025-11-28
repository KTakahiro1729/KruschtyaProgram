<template>
  <section class="panel log-panel">
    <div class="panel-heading">
      <h2>チャットログ</h2>
      <p class="muted">CoC 7版の成否をバッジで表示します。</p>
    </div>
    <div class="log-list">
      <article
        v-for="msg in messages"
        :key="msg.id"
        class="log-card"
        :class="{ 'log-me': isMine(msg), 'log-gm': isGm(msg) }"
      >
        <header class="log-header">
          <div class="speaker-line">
            <span class="speaker">{{ msg.speaker_name || '名無しさん' }}</span>
            <span class="timestamp">{{ formatDate(msg.created_at) }}</span>
          </div>
          <span v-if="msg.parsedResult?.result_level" class="dice-badge" :class="badgeClass(msg.parsedResult.result_level)">
            {{ resultLabel(msg.parsedResult.result_level) }}
          </span>
        </header>
        <p class="raw-text">{{ msg.raw_text }}</p>
        <p class="rendered">{{ msg.rendered_text }}</p>
        <p v-if="msg.parsedResult?.dice?.length" class="dice-detail">{{ msg.parsedResult.dice.join(', ') }}</p>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
type DiceResult = {
  value?: number;
  success?: boolean;
  target?: number;
  dice?: number[];
  rolls?: number[];
  result_level?: string;
};

type ChatMessage = {
  id: string;
  created_at: number;
  raw_text: string;
  rendered_text: string;
  speaker_name?: string;
  parsedResult?: DiceResult | null;
};

const props = defineProps<{ messages: ChatMessage[]; currentSpeaker: string }>();

function formatDate(epoch: number) {
  return new Date(epoch).toLocaleString('ja-JP');
}

function isMine(msg: ChatMessage) {
  const name = msg.speaker_name?.trim() || '名無しさん';
  return name === props.currentSpeaker;
}

function isGm(msg: ChatMessage) {
  const name = (msg.speaker_name || '').toLowerCase();
  return name.includes('kp') || name.includes('gm');
}

function badgeClass(level: string) {
  return `dice-${level}`;
}

function resultLabel(level: string) {
  switch (level) {
    case 'critical':
      return 'クリティカル';
    case 'fumble':
      return 'ファンブル';
    case 'extreme':
      return 'イクストリーム';
    case 'hard':
      return 'ハード';
    case 'regular':
      return 'レギュラー';
    default:
      return '失敗';
  }
}
</script>
