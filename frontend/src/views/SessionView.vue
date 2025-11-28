<template>
  <div class="page" v-if="sessionId">
    <section class="panel hero">
      <div>
        <p class="eyebrow">セッション</p>
        <h1>セッションID: {{ sessionId }}</h1>
        <p class="muted">参加情報とチャットを管理します。チャットは日本語コマンドにも対応しています。</p>
      </div>
      <div class="panel compact">
        <h2>セッション参加</h2>
        <p class="muted">このセッションに参加します。名前を入力して参加してください。</p>
        <label>
          <span>名前</span>
          <input v-model="join.name" placeholder="名前 (任意)" />
        </label>
        <div class="actions">
          <button class="primary" :disabled="isJoining" @click="joinSession">
            {{ isJoining ? '参加中…' : '参加する' }}
          </button>
          <p v-if="joinError" class="error">{{ joinError }}</p>
        </div>
        <div v-if="participant" class="status">
          {{ participant.name }} として参加中 (ID: {{ participant.participantId }})
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
import { onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import ChatPaletteEditor from '../components/ChatPaletteEditor.vue';
import KPControls from '../components/KPControls.vue';

const apiBase = import.meta.env.VITE_WORKER_BASE ?? '';

const route = useRoute();
const sessionId = ref<string | null>((route.params.id as string) ?? null);

const participantRaw = sessionId.value ? localStorage.getItem(`kp-participant-${sessionId.value}`) : null;
const participant = ref<{ participantId: string; name: string } | null>(participantRaw ? JSON.parse(participantRaw) : null);
const join = reactive({ name: '' });
const isJoining = ref(false);
const joinError = ref('');

type Message = { id: string; created_at: number; raw_text: string; rendered_text: string };
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
      const storedParticipant = localStorage.getItem(`kp-participant-${sessionId.value}`);
      participant.value = storedParticipant ? JSON.parse(storedParticipant) : null;
      loadMessages();
      loadPalette();
    }
  }
);

watch(
  () => participant.value,
  () => {
    loadPalette();
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
      participantId: participant.value?.participantId ?? null,
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
  if (!participant.value || !sessionId.value) return;
  await axios.post(`${apiBase}/api/sessions/${sessionId.value}/palettes`, {
    participantId: participant.value.participantId,
    items: val
  });
}

async function loadPalette() {
  if (!participant.value || !sessionId.value) return;
  const res = await axios.get(`${apiBase}/api/sessions/${sessionId.value}/palettes/${participant.value.participantId}`);
  palette.value = (res.data.items ?? []) as PaletteItem[];
}

async function joinSession() {
  if (!sessionId.value || isJoining.value) return;
  joinError.value = '';
  isJoining.value = true;
  try {
    const res = await axios.post(`${apiBase}/api/sessions/${sessionId.value}/join`, { name: join.name });
    participant.value = {
      participantId: res.data.participantId,
      name: join.name || 'ゲスト'
    };
    localStorage.setItem(`kp-participant-${sessionId.value}`, JSON.stringify(participant.value));
  } catch (err) {
    joinError.value = (err as Error).message ?? '参加に失敗しました';
  } finally {
    isJoining.value = false;
  }
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
});
</script>
