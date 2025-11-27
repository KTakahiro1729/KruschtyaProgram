<template>
  <div class="container">
    <h1>Cloudflare Dice Room</h1>
    <div class="card">
      <h2>Googleログイン</h2>
      <p>Google Identity Services等で取得した id_token を入力しないとログインできません。</p>
      <div style="display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center;">
        <input v-model="login.idToken" placeholder="id_token" />
        <button :disabled="!login.idToken" @click="loginUser">ログイン</button>
      </div>
      <p v-if="user">ログイン済み: {{ user.name }} ({{ user.email }})</p>
    </div>

    <div class="card">
      <h2>セッション作成</h2>
      <button :disabled="!user" @click="createSession">セッションを作成する</button>
      <p v-if="session.sessionId">セッションID: {{ session.sessionId }} / パスワード: {{ session.password }}</p>
    </div>

    <div class="card">
      <h2>セッション参加</h2>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 8px;">
        <input v-model="join.sessionId" placeholder="セッションID" />
        <input v-model="join.name" placeholder="名前" />
        <button @click="joinSession">参加</button>
      </div>
      <p v-if="participantId">参加ID: {{ participantId }}</p>
    </div>

    <KPControls @apply="applyKP" />

    <ChatPaletteEditor :model-value="palette" @update:modelValue="(v) => (palette = v)" @save="savePalette" />

    <div class="card">
      <h2>チャット</h2>
      <div style="display: grid; grid-template-columns: 3fr 1fr; gap: 8px; align-items: center;">
        <input v-model="chat.text" placeholder="チャット or コマンド (例: CC<=50, 1d100)" />
        <button @click="sendChat">送信</button>
      </div>
      <button style="margin-top: 8px;" @click="loadMessages">再読込</button>
      <div style="margin-top: 12px;">
        <div v-for="msg in messages" :key="msg.id" class="card">
          <div><strong>{{ new Date(msg.created_at).toLocaleString() }}</strong></div>
          <div>元チャット: {{ msg.raw_text }}</div>
          <div>結果: {{ msg.rendered_text }}</div>
        </div>
      </div>
      <button v-if="session.sessionId" @click="downloadLog">ログをダウンロード</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import axios from 'axios';
import { ref, reactive } from 'vue';
import ChatPaletteEditor from './components/ChatPaletteEditor.vue';
import KPControls from './components/KPControls.vue';

const apiBase = import.meta.env.VITE_WORKER_BASE ?? 'http://localhost:8787';

type User = { id: string; email: string; name: string; created_at: number };
type Message = { id: string; created_at: number; raw_text: string; rendered_text: string };
type PaletteItem = { label: string; content: string };

const login = reactive({ idToken: '' });
const user = ref<User | null>(null);
const session = reactive({ sessionId: '', password: '' });
const join = reactive({ sessionId: '', name: '' });
const participantId = ref('');
const chat = reactive({ text: '' });
const messages = ref<Message[]>([]);
const palette = ref<PaletteItem[]>([]);

async function loginUser() {
  if (!login.idToken) return;
  const res = await axios.post(`${apiBase}/api/login/google`, { idToken: login.idToken });
  user.value = res.data.user as User;
}

async function createSession() {
  if (!user.value) return;
  const res = await axios.post(`${apiBase}/api/sessions`, { ownerEmail: user.value?.email, ownerName: user.value?.name });
  session.sessionId = res.data.sessionId;
  session.password = res.data.password;
  join.sessionId = session.sessionId;
}

async function joinSession() {
  if (!join.sessionId) return;
  const res = await axios.post(`${apiBase}/api/sessions/${join.sessionId}/join`, { name: join.name });
  participantId.value = res.data.participantId;
  await loadMessages();
  await loadPalette();
}

async function sendChat() {
  if (!join.sessionId || !chat.text) return;
  await axios.post(`${apiBase}/api/sessions/${join.sessionId}/messages`, {
    participantId: participantId.value || null,
    text: chat.text
  });
  chat.text = '';
  await loadMessages();
}

async function loadMessages() {
  if (!join.sessionId) return;
  const res = await axios.get(`${apiBase}/api/sessions/${join.sessionId}/messages`);
  messages.value = (res.data.messages ?? []) as Message[];
}

async function savePalette(val: PaletteItem[]) {
  if (!participantId.value) return;
  await axios.post(`${apiBase}/api/sessions/${join.sessionId}/palettes`, {
    participantId: participantId.value,
    items: val
  });
}

async function loadPalette() {
  if (!participantId.value) return;
  const res = await axios.get(`${apiBase}/api/sessions/${join.sessionId}/palettes/${participantId.value}`);
  palette.value = (res.data.items ?? []) as PaletteItem[];
}

async function applyKP(payload: { password: string; mode?: string; manualTime?: number | null; offset?: number | null; confirmQuantum?: boolean }) {
  if (!session.sessionId) return;
  await axios.post(`${apiBase}/api/sessions/${session.sessionId}/kp`, payload);
}

async function downloadLog() {
  if (!session.sessionId) return;
  const res = await fetch(`${apiBase}/api/sessions/${session.sessionId}/logs`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `session-${session.sessionId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>
