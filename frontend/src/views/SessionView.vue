<template>
  <div class="page" v-if="sessionId">
    <section class="panel hero">
      <div>
        <p class="eyebrow">セッション</p>
        <h1>セッションID: {{ sessionId }}</h1>
        <p class="muted">参加情報とチャットを管理します。チャットは日本語コマンドにも対応しています。</p>
      </div>
      <div class="panel compact">
        <h2>表示名</h2>
        <p class="muted">チャットに表示される名前を設定します。未設定の場合は「{{ anonymousName }}」として扱われます。</p>
        <label>
          <span>名前</span>
          <input v-model="displayName" placeholder="名前 (任意)" />
        </label>
        <div class="actions">
          <button class="primary" @click="saveDisplayName">保存</button>
          <p class="muted">現在: {{ effectiveName }}</p>
        </div>
      </div>
    </section>

    <section class="grid">
      <div class="panel">
        <h2>チャット送信</h2>
        <div class="form-grid">
          <label>
            <span>メッセージ / コマンド</span>
            <input v-model="chat.text" placeholder="例: CC<=50, 1d100" />
          </label>
        </div>
        <div class="actions">
          <button class="primary" :disabled="!chat.text" @click="sendChat">送信</button>
          <button class="ghost" @click="loadMessages">再読込</button>
        </div>
        <p v-if="chatError" class="error">{{ chatError }}</p>
      </div>

      <div class="panel">
        <h2>KPコントロール</h2>
        <p class="muted">判定モードやシードを設定できます。パスワードを入力して適用してください。</p>
        <KPControls @apply="applyKP" />
        <button class="ghost" :disabled="!sessionId" @click="downloadLog">ログをダウンロード</button>
      </div>
    </section>

    <section class="grid single">
      <div class="panel">
        <ChatPaletteEditor :model-value="palette" @update:modelValue="(v) => (palette = v)" @save="savePalette" />
      </div>
      <div class="panel">
        <h2>チャットログ</h2>
        <div class="log-list">
          <div v-for="msg in messages" :key="msg.id" class="log-card">
            <div class="log-header">
              <span class="timestamp">{{ formatDate(msg.created_at) }}</span>
              <span class="speaker">{{ msg.speaker_name || anonymousName }}</span>
            </div>
            <p class="muted">元チャット: {{ msg.raw_text }}</p>
            <p>結果: {{ msg.rendered_text }}</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import axios from 'axios';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import ChatPaletteEditor from '../components/ChatPaletteEditor.vue';
import KPControls from '../components/KPControls.vue';

const apiBase = import.meta.env.VITE_WORKER_BASE ?? '';

const route = useRoute();
const sessionId = ref<string | null>((route.params.id as string) ?? null);

const anonymousName = '名無しさん';
const displayName = ref('');
const effectiveName = computed(() => displayName.value.trim() || anonymousName);

type Message = { id: string; created_at: number; raw_text: string; rendered_text: string; speaker_name?: string };
type PaletteItem = { label: string; content: string };

const chat = reactive({ text: '' });
const messages = ref<Message[]>([]);
const palette = ref<PaletteItem[]>([]);
const chatError = ref('');

watch(
  () => route.params.id,
  (val) => {
    sessionId.value = val as string;
    if (sessionId.value) {
      loadMessages();
      loadPalette();
      loadDisplayName();
    }
  }
);

function formatDate(epoch: number) {
  return new Date(epoch).toLocaleString('ja-JP');
}

async function sendChat() {
  if (!sessionId.value || !chat.text) return;
  chatError.value = '';
  try {
    await axios.post(`${apiBase}/api/sessions/${sessionId.value}/messages`, {
      speakerName: effectiveName.value,
      text: chat.text
    });
    chat.text = '';
    await loadMessages();
  } catch (err) {
    chatError.value = (err as Error).message ?? '送信に失敗しました';
  }
}

async function loadMessages() {
  if (!sessionId.value) return;
  const res = await axios.get(`${apiBase}/api/sessions/${sessionId.value}/messages`);
  messages.value = (res.data.messages ?? []) as Message[];
}

async function savePalette(val: Array<{ label: string; content: string }>) {
  if (!sessionId.value) return;
  localStorage.setItem(`kp-palette-${sessionId.value}`, JSON.stringify(val));
}

async function loadPalette() {
  if (!sessionId.value) return;
  const stored = localStorage.getItem(`kp-palette-${sessionId.value}`);
  palette.value = stored ? JSON.parse(stored) : [];
}

async function applyKP(payload: {
  password: string;
  mode?: string;
  manualTime?: number | null;
  offset?: number | null;
  confirmQuantum?: boolean;
}) {
  if (!sessionId.value) return;
  await axios.post(`${apiBase}/api/sessions/${sessionId.value}/kp`, payload);
}

async function downloadLog() {
  if (!sessionId.value) return;
  const res = await fetch(`${apiBase}/api/sessions/${sessionId.value}/logs`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `session-${sessionId.value}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

onMounted(() => {
  loadMessages();
  loadPalette();
  loadDisplayName();
});

function loadDisplayName() {
  if (!sessionId.value) return;
  const stored = localStorage.getItem(`kp-name-${sessionId.value}`);
  displayName.value = stored ?? '';
}

function saveDisplayName() {
  if (!sessionId.value) return;
  localStorage.setItem(`kp-name-${sessionId.value}`, displayName.value.trim());
}
</script>
