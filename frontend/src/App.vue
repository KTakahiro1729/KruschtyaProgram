<template>
  <div class="app-shell">
    <div class="grid-overlay"></div>
    <div class="max-w-6xl mx-auto px-4 py-10 space-y-10">
      <header class="hero">
        <div class="hero__title">
          <p class="eyebrow">Immersive Darkroom</p>
          <h1>Cloudflare Dice Room</h1>
          <p class="subtitle">テーブルトークRPGをストレスなく進行するための、暗く静かなコントロールルーム。</p>
        </div>
        <div class="hero__status">
          <div class="pill pill--glow">Tailwind palette / Dark</div>
          <div class="pill">SPA-like Session Flow</div>
        </div>
      </header>

      <section class="card card--glass focus-card">
        <div class="card__header">
          <div>
            <p class="eyebrow">セッション作成</p>
            <h2 class="card__title">Google認証とセッション立ち上げ</h2>
          </div>
          <div class="badge">STEP 1</div>
        </div>
        <div class="card__body two-column">
          <div class="stack">
            <p class="muted">Google Identity Services等で取得した <code>id_token</code> を貼り付け、ログインを行います。</p>
            <div class="field-group">
              <label class="field">
                <span>id_token</span>
                <input v-model="login.idToken" placeholder="Google ID token" />
              </label>
              <button class="btn btn--primary" :disabled="!login.idToken" @click="loginUser">
                <span class="icon"></span>
                Googleログイン
              </button>
            </div>
            <p v-if="user" class="hint success">ログイン済み: {{ user.name }} ({{ user.email }})</p>
            <p v-else class="hint">ログイン後にセッションを作成できます。</p>
          </div>
          <div class="stack">
            <div class="field-group">
              <label class="field">
                <span>セッションID</span>
                <input v-model="join.sessionId" placeholder="作成後に自動入力" disabled />
              </label>
              <label class="field">
                <span>KPパスワード</span>
                <input v-model="session.password" placeholder="作成後に自動入力" disabled />
              </label>
            </div>
            <div class="action-row">
              <button class="btn btn--accent" :disabled="!user" @click="createSession">セッションを作成する</button>
              <button class="btn" :disabled="!user" @click="joinSession">このセッションに参加</button>
            </div>
            <div v-if="session.sessionId" class="share-panel">
              <div class="share-line">
                <div>
                  <p class="label">招待URL</p>
                  <p class="value">{{ inviteUrl }}</p>
                </div>
                <div class="share-actions">
                  <button class="icon-btn" @click="copyToClipboard(inviteUrl)">Copy</button>
                  <button class="icon-btn" @click="saveInviteDetails">Save</button>
                </div>
              </div>
              <div class="share-line">
                <div>
                  <p class="label">KPパスワード</p>
                  <p class="value">{{ session.password }}</p>
                </div>
                <div class="share-actions">
                  <button class="icon-btn" @click="copyToClipboard(session.password)">Copy</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="card card--panel">
        <div class="panel-header">
          <div class="time-block">
            <p class="eyebrow">ゲーム内時刻</p>
            <div class="clock" :class="{ 'clock--paused': kpEnabled && isPaused }">{{ formattedTime }}</div>
          </div>
          <div class="controls" v-if="kpEnabled">
            <button class="btn btn--ghost" @click="togglePause">
              {{ isPaused ? '再開' : '一時停止' }}
            </button>
            <span v-if="isPaused" class="kp-alert">KP画面のみ: 停止中</span>
          </div>
          <div class="session-meta">
            <div class="pill">Session {{ session.sessionId || '---' }}</div>
            <div class="pill pill--soft">参加ID {{ participantId || '---' }}</div>
          </div>
        </div>

        <div class="board">
          <div class="log" ref="logPane">
            <div class="log-header">
              <div>
                <p class="eyebrow">チャットログ</p>
                <h3>ダイスと会話のタイムライン</h3>
              </div>
              <div class="log-actions">
                <button class="btn btn--ghost" @click="loadMessages">再読込</button>
                <button class="btn btn--ghost" :disabled="!session.sessionId" @click="downloadLog">ログDL</button>
              </div>
            </div>
            <div class="message-list">
              <div
                v-for="msg in messages"
                :key="msg.id"
                class="message"
                :class="messageClass(msg)"
              >
                <div class="message__meta">
                  <span class="name">{{ msg.sender_name || msg.name || roleLabel(msg) }}</span>
                  <span class="time">{{ formatClock(msg.created_at) }}</span>
                  <span class="role">{{ roleLabel(msg) }}</span>
                </div>
                <div class="dice" v-if="msg.raw_text">
                  <span class="command">{{ msg.raw_text }}</span>
                  <span v-if="resultBadge(msg)" class="badge" :class="'badge--' + resultBadge(msg)">
                    {{ resultLabel(resultBadge(msg)) }}
                  </span>
                </div>
                <p class="message__body">{{ msg.rendered_text || msg.raw_text }}</p>
              </div>
            </div>
          </div>

          <aside class="side">
            <div class="info-tile">
              <p class="eyebrow">プレイ状況</p>
              <p class="muted">1画面で完結するSPAライクな体験。停滞しない暗室のようなUIで、KPもPLも集中できます。</p>
              <ul class="list">
                <li>非KPには一時停止の視覚変化を表示しません。</li>
                <li>Tailwindカラーで低彩度に整えたダークテーマ。</li>
                <li>余白と密度のバランスを取り、情報を詰め込みつつ可読性を確保。</li>
              </ul>
            </div>
            <div class="info-tile">
              <p class="eyebrow">セッション参加</p>
              <div class="field">
                <span>セッションID</span>
                <input v-model="join.sessionId" placeholder="例: abc123" />
              </div>
              <div class="field">
                <span>プレイヤー名</span>
                <input v-model="join.name" placeholder="名前" />
              </div>
              <div class="action-row">
                <button class="btn btn--primary" @click="joinSession">参加する</button>
                <button class="btn btn--ghost" @click="loadPalette">パレット読込</button>
              </div>
              <p v-if="participantId" class="hint success">参加ID: {{ participantId }}</p>
            </div>
          </aside>
        </div>

        <div class="footer">
          <nav class="tabs">
            <button :class="['tab', { active: activeTab === 'chat' }]" @click="activeTab = 'chat'">チャット</button>
            <button :class="['tab', { active: activeTab === 'palette' }]" @click="activeTab = 'palette'">パレット</button>
            <button
              v-if="kpEnabled"
              :class="['tab', { active: activeTab === 'kp' }]"
              @click="activeTab = 'kp'"
            >
              KP
            </button>
          </nav>

          <div v-if="activeTab === 'chat'" class="tab-panel">
            <div class="field-row">
              <label class="field">
                <span>名前</span>
                <input v-model="join.name" placeholder="名前を入力" />
              </label>
              <label class="field">
                <span>KPパスワード</span>
                <div class="inline-field" :data-unlocked="kpKeyMatch">
                  <input v-model="kpKey" type="password" placeholder="KPキーを入力" />
                  <span class="lock" :class="{ open: kpKeyMatch }">{{ kpKeyMatch ? '🔓' : '🔒' }}</span>
                </div>
              </label>
            </div>
            <div class="field">
              <span>メッセージ</span>
              <textarea v-model="chat.text" rows="3" placeholder="チャット or コマンド (例: CC<=50, 1d100)"></textarea>
            </div>
            <div class="action-row">
              <button class="btn btn--primary" @click="sendChat">SEND</button>
              <p class="hint">KPキー入力中に送信するとKPモードが解禁されます。</p>
            </div>
          </div>

          <div v-if="activeTab === 'palette'" class="tab-panel palette">
            <div class="palette__header">
              <div>
                <p class="eyebrow">登録コマンド</p>
                <p class="muted">クリックで即時送信。編集モードでは1行1コマンドで一括編集できます。</p>
              </div>
              <div class="action-row">
                <button class="btn btn--ghost" v-if="!paletteEditMode" @click="enterPaletteEdit">編集</button>
                <button class="btn btn--accent" v-else @click="savePaletteText">保存</button>
              </div>
            </div>
            <div v-if="!paletteEditMode" class="palette__list">
              <button
                v-for="(item, index) in palette"
                :key="index"
                class="palette__item"
                @click="sendPalette(item.content)">
                <span class="label">{{ item.label || `CMD ${index + 1}` }}</span>
                <span class="command">{{ item.content }}</span>
              </button>
              <p v-if="palette.length === 0" class="hint">まだコマンドがありません。編集で追加してください。</p>
            </div>
            <div v-else class="palette__editor">
              <textarea v-model="paletteText" rows="6" placeholder="1行1コマンドで入力してください"></textarea>
            </div>
          </div>

          <div v-if="activeTab === 'kp' && kpEnabled" class="tab-panel kp">
            <div class="field-row">
              <label class="field">
                <span>KPパスワード</span>
                <input v-model="kpSettings.password" type="password" placeholder="KPパスワード" />
              </label>
              <label class="field">
                <span>時刻シード</span>
                <input v-model="kpSettings.seedTime" type="time" step="1" />
              </label>
            </div>
            <div class="field-row">
              <label class="field">
                <span>任意日時ジャンプ</span>
                <input v-model="kpSettings.manualDate" type="datetime-local" />
              </label>
              <label class="field">
                <span>オフセット (ms)</span>
                <input v-model.number="kpSettings.offset" type="number" placeholder="0" />
              </label>
            </div>
            <div class="field-row">
              <div class="field">
                <span>時間操作</span>
                <div class="toggle-group">
                  <button :class="['chip', { active: kpSettings.mode === 'system' }]" @click="kpSettings.mode = 'system'">現在時刻</button>
                  <button :class="['chip', { active: kpSettings.mode === 'manual' }]" @click="kpSettings.mode = 'manual'">自由入力</button>
                  <button :class="['chip', { active: kpSettings.mode === 'quantum' }]" @click="kpSettings.mode = 'quantum'">量子乱数</button>
                </div>
              </div>
              <div class="field">
                <span>RNG設定</span>
                <div class="toggle-group">
                  <button :class="['chip', { active: kpSettings.rng === 'seed' }]" @click="kpSettings.rng = 'seed'">時刻シード</button>
                  <button :class="['chip', { active: kpSettings.rng === 'quantum' }]" @click="kpSettings.rng = 'quantum'">量子乱数</button>
                </div>
              </div>
            </div>
            <div class="action-row">
              <button class="btn btn--accent" @click="applyKPSettings">適用</button>
              <p class="hint">シードは「秒」までを使用します。量子乱数は明示的に切り替えてください。</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import axios from 'axios';
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';

const apiBase = import.meta.env.VITE_WORKER_BASE ?? '';

interface User {
  id: string;
  email: string;
  name: string;
  created_at: number;
}

interface Message {
  id: string;
  created_at: number;
  raw_text: string;
  rendered_text: string;
  participantId?: string;
  name?: string;
  sender_name?: string;
  role?: string;
}

interface PaletteItem {
  label: string;
  content: string;
}

const login = reactive({ idToken: '' });
const user = ref<User | null>(null);
const session = reactive({ sessionId: '', password: '' });
const join = reactive({ sessionId: '', name: '' });
const participantId = ref('');
const chat = reactive({ text: '' });
const kpKey = ref('');
const kpEnabled = ref(false);
const isPaused = ref(false);
const activeTab = ref<'chat' | 'palette' | 'kp'>('chat');
const messages = ref<Message[]>([]);
const palette = ref<PaletteItem[]>([]);
const paletteEditMode = ref(false);
const paletteText = ref('');
const logPane = ref<HTMLElement | null>(null);

const gameClock = ref<number>(Date.now());
const kpSettings = reactive({
  password: '',
  mode: 'system' as 'system' | 'manual' | 'quantum',
  manualDate: '',
  seedTime: '',
  offset: 0,
  rng: 'seed' as 'seed' | 'quantum'
});

const inviteUrl = computed(() => {
  if (!session.sessionId) return '---';
  return `${window.location.origin}/?session=${session.sessionId}`;
});

const formattedTime = computed(() => formatClock(gameClock.value));
const kpKeyMatch = computed(() => !!kpKey.value && kpKey.value === session.password);

let ticker: number | undefined;

onMounted(() => {
  ticker = window.setInterval(() => {
    if (!isPaused.value) {
      gameClock.value = gameClock.value + 1000;
    }
  }, 1000);
});

onUnmounted(() => {
  if (ticker) window.clearInterval(ticker);
});

watch(palette, () => {
  paletteText.value = palette.value.map((item) => item.content).join('\n');
});

function formatClock(time: number | string | undefined) {
  if (!time) return '--:--:--';
  const d = new Date(time);
  return d.toLocaleTimeString('ja-JP', { hour12: false });
}

function messageClass(msg: Message) {
  const base = roleLabel(msg);
  return {
    'message--self': base === '自分',
    'message--gm': base === 'KP',
    'message--other': base === '他プレイヤー'
  };
}

function roleLabel(msg: Message) {
  if (msg.role === 'kp' || msg.role === 'gm') return 'KP';
  if (participantId.value && msg.participantId === participantId.value) return '自分';
  if (msg.role === 'system') return 'システム';
  return '他プレイヤー';
}

function resultBadge(msg: Message) {
  const text = (msg.rendered_text || msg.raw_text || '').toLowerCase();
  if (/クリティカル|critical/.test(text)) return 'critical';
  if (/ファンブル|fumble/.test(text)) return 'fumble';
  if (/エクストリーム|extreme/.test(text)) return 'extreme';
  if (/ハード|hard/.test(text)) return 'hard';
  if (/失敗|fail/.test(text)) return 'fail';
  if (/成功|success/.test(text)) return 'success';
  return '';
}

function resultLabel(key: string) {
  switch (key) {
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
      return '';
  }
}

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
  kpSettings.password = session.password;
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
  if (!kpEnabled.value && kpKeyMatch.value) {
    kpEnabled.value = true;
    activeTab.value = 'kp';
  }
  await axios.post(`${apiBase}/api/sessions/${join.sessionId}/messages`, {
    participantId: participantId.value || null,
    text: chat.text
  });
  chat.text = '';
  await loadMessages();
  scrollLog();
}

async function sendPalette(command: string) {
  chat.text = command;
  await sendChat();
}

async function loadMessages() {
  if (!join.sessionId) return;
  const res = await axios.get(`${apiBase}/api/sessions/${join.sessionId}/messages`);
  messages.value = (res.data.messages ?? []) as Message[];
  scrollLog();
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

function togglePause() {
  isPaused.value = !isPaused.value;
}

function enterPaletteEdit() {
  paletteEditMode.value = true;
  paletteText.value = palette.value.map((item) => item.content).join('\n');
}

async function savePaletteText() {
  paletteEditMode.value = false;
  const lines = paletteText.value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const items = lines.map((line, index) => ({ label: `CMD ${index + 1}`, content: line }));
  palette.value = items;
  await savePalette(items);
}

async function applyKPSettings() {
  if (!session.sessionId || !kpSettings.password) return;
  const payload: any = {
    password: kpSettings.password,
    mode: kpSettings.mode,
    offset: kpSettings.offset,
    confirmQuantum: kpSettings.mode === 'quantum'
  };

  if (kpSettings.mode === 'manual' && kpSettings.manualDate) {
    payload.manualTime = new Date(kpSettings.manualDate).getTime();
    gameClock.value = payload.manualTime;
  }

  if (kpSettings.rng === 'quantum') {
    payload.mode = 'quantum';
    payload.confirmQuantum = true;
  }

  if (kpSettings.seedTime) {
    const now = new Date();
    const [h, m, s] = kpSettings.seedTime.split(':');
    now.setHours(Number(h || 0), Number(m || 0), Number(s || 0), 0);
    payload.manualTime = now.getTime();
    gameClock.value = payload.manualTime;
  }

  await applyKP(payload);
  kpEnabled.value = true;
}

function copyToClipboard(text: string) {
  navigator.clipboard?.writeText(text);
}

function saveInviteDetails() {
  if (!session.sessionId) return;
  const content = `Invite URL: ${inviteUrl.value}\nKP Password: ${session.password}`;
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `session-${session.sessionId}.txt`;
  a.click();
  URL.revokeObjectURL(url);
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

function scrollLog() {
  if (!logPane.value) return;
  requestAnimationFrame(() => {
    logPane.value!.scrollTop = logPane.value!.scrollHeight;
  });
}
</script>
