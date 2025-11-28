<template>
  <div class="page">
    <div class="grid-layout">
      <section class="panel create-panel">
        <div class="panel-header">
          <div class="eyebrow">Create Session</div>
          <h1 class="title">没入感のあるダークセッション</h1>
          <p class="subtitle">Googleアカウントでログインし、セッションを発行します。</p>
        </div>
        <div class="card glass">
          <div class="card-header">
            <div class="label">認証</div>
            <p class="muted">Google Identityで取得した id_token を入力してください。</p>
          </div>
          <div class="input-row">
            <input
              v-model="login.idToken"
              placeholder="id_token"
              class="input"
            />
            <button class="btn primary" :disabled="!login.idToken" @click="loginUser">
              <span class="material">account_circle</span>
              Googleでログイン
            </button>
          </div>
          <p v-if="user" class="success">ログイン済み: {{ user.name }} ({{ user.email }})</p>
        </div>

        <div class="card glass">
          <div class="card-header">
            <div class="label">セッション作成</div>
            <p class="muted">ログイン済みのユーザーのみ作成できます。</p>
          </div>
          <button class="btn accent" :disabled="!user" @click="createSession">
            <span class="material">auto_fix_high</span>
            セッションを作成する
          </button>

          <div v-if="session.sessionId" class="result-grid">
            <div class="result">
              <div class="result-label">招待URL</div>
              <div class="result-value">{{ inviteUrl }}</div>
              <div class="result-actions">
                <button class="icon-btn" @click="copy(inviteUrl)"><span class="material">content_copy</span></button>
                <button class="icon-btn" @click="saveText('invite-url.txt', inviteUrl)"><span class="material">save</span></button>
              </div>
            </div>
            <div class="result">
              <div class="result-label">KPパスワード</div>
              <div class="result-value">{{ session.password }}</div>
              <div class="result-actions">
                <button class="icon-btn" @click="copy(session.password)"><span class="material">content_copy</span></button>
                <button class="icon-btn" @click="saveText('kp-password.txt', session.password)"><span class="material">save</span></button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="panel session-panel" v-if="session.sessionId">
        <header class="session-header">
          <div class="time-box">
            <span class="label">ゲーム内時刻</span>
            <div class="clock">{{ formattedGameTime }}</div>
          </div>
          <button v-if="kpUnlocked" class="btn ghost" @click="togglePause">
            <span class="material" :class="{ danger: isPaused }">{{ isPaused ? 'pause_circle' : 'play_circle' }}</span>
            <span :class="{ 'kp-only': isPaused }">{{ isPaused ? '再開' : '一時停止' }}</span>
          </button>
        </header>

        <div class="join-bar">
          <div>
            <div class="label">セッションID</div>
            <div class="muted">{{ session.sessionId }}</div>
          </div>
          <input v-model="join.name" class="input" placeholder="プレイヤー名" />
          <button class="btn primary" @click="joinSession">参加</button>
        </div>

        <main class="main-grid">
          <div class="chat-log" ref="chatContainer">
            <div v-for="msg in messages" :key="msg.id" class="message" :data-actor="msg.actor">
              <div class="message-meta">
                <div class="name">{{ msg.name }}</div>
                <div class="timestamp">{{ msg.time }}</div>
              </div>
              <div v-if="msg.command" class="dice">
                <span class="command">{{ msg.command }}</span>
                <span class="badge" :data-state="msg.result">{{ resultLabel(msg.result) }}</span>
              </div>
              <div class="body">{{ msg.text }}</div>
            </div>
          </div>

          <div class="side">
            <div class="pill-nav">
              <button
                v-for="tab in tabs"
                :key="tab.key"
                :class="['pill', { active: activeTab === tab.key } ]"
                v-if="tab.visible"
                @click="activeTab = tab.key"
              >
                {{ tab.label }}
              </button>
            </div>

            <div v-if="activeTab === 'chat'" class="tab-content">
              <label class="field">
                <span>名前</span>
                <input v-model="join.name" class="input" placeholder="プレイヤー名" />
              </label>
              <label class="field">
                <span>メッセージ</span>
                <textarea v-model="chat.text" class="input" rows="3" placeholder="チャット or コマンド (例: CC<=50, 1d100)"></textarea>
              </label>
              <div class="field lock-row">
                <div class="lock-indicator" :class="{ unlocked: kpUnlocked }">
                  <span class="material">{{ kpUnlocked ? 'lock_open' : 'lock' }}</span>
                  <span>{{ kpUnlocked ? 'KPモード解禁済み' : 'KPパスワードを入力' }}</span>
                </div>
                <input
                  v-model="kpInput"
                  class="input"
                  :class="{ success: kpMatches }"
                  placeholder="KPパスワード"
                />
              </div>
              <button class="btn primary full" :disabled="!chat.text" @click="handleSend">
                <span class="material">send</span>
                SEND
              </button>
            </div>

            <div v-if="activeTab === 'palette'" class="tab-content">
              <div class="palette-toolbar">
                <span class="label">パレット</span>
                <button class="btn ghost" @click="togglePaletteEdit">{{ paletteEdit ? '保存' : '編集' }}</button>
              </div>
              <div v-if="paletteEdit">
                <textarea v-model="paletteText" class="input" rows="8" placeholder="1行1コマンド"></textarea>
              </div>
              <div v-else class="palette-list">
                <button v-for="item in paletteList" :key="item" class="palette-item" @click="quickSend(item)">
                  {{ item }}
                </button>
              </div>
            </div>

            <div v-if="activeTab === 'kp'" class="tab-content">
              <div class="field">
                <span>ゲーム内時間をジャンプ</span>
                <input type="datetime-local" step="1" class="input" v-model="manualTime" />
                <button class="btn accent full" @click="jumpTime">ジャンプ</button>
              </div>
              <div class="field">
                <span>RNG設定</span>
                <div class="toggle">
                  <button :class="['toggle-btn', { active: rngMode === 'seed' }]" @click="rngMode = 'seed'">時刻シード</button>
                  <button :class="['toggle-btn', { active: rngMode === 'quantum' }]" @click="rngMode = 'quantum'">量子乱数</button>
                </div>
                <p class="muted">時刻シードは「秒」までをシード値とします。</p>
              </div>
            </div>
          </div>
        </main>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import axios from 'axios';
import { computed, onMounted, reactive, ref, watch } from 'vue';

const apiBase = import.meta.env.VITE_WORKER_BASE ?? '';

type User = { id: string; email: string; name: string; created_at: number };
type Message = {
  id: string;
  created_at: number;
  raw_text: string;
  rendered_text: string;
};

const login = reactive({ idToken: '' });
const user = ref<User | null>(null);
const session = reactive({ sessionId: '', password: '' });
const join = reactive({ sessionId: '', name: '' });
const participantId = ref('');
const chat = reactive({ text: '' });
const messages = ref<({
  id: string;
  name: string;
  time: string;
  actor: 'self' | 'other' | 'gm';
  command?: string;
  result?: string;
  text: string;
})[]>([]);

const kpInput = ref('');
const kpUnlocked = ref(false);
const kpMatches = computed(() => !!kpInput.value && kpInput.value === session.password);

const paletteList = ref<string[]>(['CC<=50', '1d100', '1d6+1', 'POW*5']);
const paletteEdit = ref(false);
const paletteText = ref(paletteList.value.join('\n'));

const activeTab = ref<'chat' | 'palette' | 'kp'>('chat');
const manualTime = ref('');
const rngMode = ref<'seed' | 'quantum'>('seed');

const gameTime = ref<Date>(new Date());
const isPaused = ref(false);

const tabs = computed(() => [
  { key: 'chat', label: 'チャット', visible: true },
  { key: 'palette', label: 'パレット', visible: true },
  { key: 'kp', label: 'KP', visible: kpUnlocked.value }
]);

const formattedGameTime = computed(() => {
  const h = gameTime.value.getHours().toString().padStart(2, '0');
  const m = gameTime.value.getMinutes().toString().padStart(2, '0');
  const s = gameTime.value.getSeconds().toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
});

onMounted(() => {
  const timer = setInterval(() => {
    if (!isPaused.value) {
      gameTime.value = new Date(gameTime.value.getTime() + 1000);
    }
  }, 1000);
  return () => clearInterval(timer);
});

watch(kpMatches, (val) => {
  if (val) {
    kpUnlocked.value = true;
    activeTab.value = 'kp';
  }
});

watch(paletteText, (val) => {
  paletteList.value = val
    .split('\n')
    .map((v) => v.trim())
    .filter(Boolean);
});

const inviteUrl = computed(() => (session.sessionId ? `${window.location.origin}/session/${session.sessionId}` : ''));

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

async function loadMessages() {
  if (!join.sessionId) return;
  const res = await axios.get(`${apiBase}/api/sessions/${join.sessionId}/messages`);
  const rawMessages = (res.data.messages ?? []) as Message[];
  messages.value = rawMessages.map((msg, index) => ({
    id: msg.id ?? `msg-${index}`,
    name: msg.rendered_text.split('：')[0] || 'プレイヤー',
    time: new Date(msg.created_at).toLocaleTimeString('ja-JP', { hour12: false }),
    actor: index % 3 === 0 ? 'gm' : index % 2 === 0 ? 'self' : 'other',
    command: msg.raw_text,
    result: parseResult(msg.rendered_text),
    text: msg.rendered_text
  }));
}

function parseResult(text: string) {
  const lowered = text.toLowerCase();
  if (lowered.includes('クリティカル')) return 'critical';
  if (lowered.includes('ファンブル')) return 'fumble';
  if (lowered.includes('エクストリーム')) return 'extreme';
  if (lowered.includes('ハード')) return 'hard';
  if (lowered.includes('成功')) return 'success';
  if (lowered.includes('失敗')) return 'fail';
  return 'info';
}

async function handleSend() {
  if (!join.sessionId || !chat.text) return;
  await axios.post(`${apiBase}/api/sessions/${join.sessionId}/messages`, {
    participantId: participantId.value || null,
    text: chat.text
  });
  chat.text = '';
  await loadMessages();
}

function quickSend(text: string) {
  chat.text = text;
  handleSend();
}

async function togglePaletteEdit() {
  if (paletteEdit.value) {
    if (!participantId.value) return;
    await axios.post(`${apiBase}/api/sessions/${join.sessionId}/palettes`, {
      participantId: participantId.value,
      items: paletteList.value.map((content) => ({ label: content, content }))
    });
  }
  paletteEdit.value = !paletteEdit.value;
}

async function jumpTime() {
  if (!kpUnlocked.value) return;
  const date = manualTime.value ? new Date(manualTime.value) : null;
  await applyKP({ password: kpInput.value, manualTime: date ? date.getTime() : null });
  if (date) gameTime.value = date;
}

async function applyKP(payload: { password: string; mode?: string; manualTime?: number | null; offset?: number | null; confirmQuantum?: boolean }) {
  if (!session.sessionId) return;
  await axios.post(`${apiBase}/api/sessions/${session.sessionId}/kp`, payload);
}

function togglePause() {
  isPaused.value = !isPaused.value;
}

function resultLabel(state?: string) {
  switch (state) {
    case 'critical':
      return 'クリティカル';
    case 'fumble':
      return 'ファンブル';
    case 'extreme':
      return 'エクストリーム成功';
    case 'hard':
      return 'ハード成功';
    case 'success':
      return '成功';
    case 'fail':
      return '失敗';
    default:
      return 'INFO';
  }
}

async function copy(text: string) {
  await navigator.clipboard.writeText(text);
}

function saveText(name: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function joinSession() {
  if (!join.sessionId) return;
  const res = await axios.post(`${apiBase}/api/sessions/${join.sessionId}/join`, { name: join.name });
  participantId.value = res.data.participantId;
  await loadMessages();
}
</script>
