<template>
  <div v-if="sessionId" class="min-h-[100dvh] bg-slate-900 text-slate-100 flex flex-col">
    <header
      class="h-10 flex items-center justify-between px-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-20"
    >
      <div class="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
        <span class="font-semibold text-slate-200">Kruschtya Session</span>
        <span class="font-mono text-slate-500">#{{ sessionId }}</span>
      </div>
      <div class="flex items-center gap-2 text-[11px] font-semibold">
        <span class="rounded border border-slate-700 px-2 py-0.5 text-slate-300">{{ kpState.mode === 'quantum' ? 'QUANTUM' : 'SYSTEM' }}</span>
        <span
          class="rounded-full px-2 py-0.5 text-[10px] font-bold"
          :class="kpRunning ? 'bg-emerald-900/40 text-emerald-200 border border-emerald-500/50' : 'bg-rose-900/40 text-rose-200 border border-rose-500/50'"
        >
          {{ kpRunning ? 'RUNNING' : 'PAUSED' }}
        </span>
      </div>
    </header>

    <main ref="logRef" class="flex-1 overflow-y-auto px-3 py-2 space-y-1 bg-slate-900/60">
      <section
        v-for="msg in messages"
        :key="msg.id"
        class="rounded-lg px-3 py-1.5 transition hover:bg-slate-800/40"
      >
        <div class="flex items-baseline gap-2 text-[11px] leading-tight text-slate-500">
          <span class="font-mono">{{ formatLogTime(msg.created_at) }}</span>
          <button
            v-if="kpState.enabled"
            type="button"
            class="inline-flex items-center rounded-full border border-slate-700 bg-slate-800/60 px-1.5 py-0.5 text-[10px] text-slate-300 transition hover:border-amber-400 hover:text-amber-200"
            @click="applyLogTimestamp(msg.created_at)"
          >
            <Clock3 class="h-3 w-3" />
          </button>
          <span :class="speakerClass(msg)">{{ msg.speaker_name || '名無しさん' }}</span>
        </div>
        <div class="mt-1 flex items-start justify-between gap-3 text-sm leading-tight text-slate-100">
          <span class="flex-1 whitespace-pre-wrap break-words">{{ msg.rendered_text || msg.raw_text }}</span>
          <span
            v-if="diceBadge(msg)"
            class="inline-flex min-w-[120px] items-center justify-end gap-2 rounded border px-2 py-0.5 text-[11px] font-mono"
            :class="badgeTone(msg)"
          >
            {{ diceBadge(msg) }}
          </span>
        </div>
      </section>
    </main>

    <footer class="bg-slate-800/90 border-t border-slate-700 flex flex-col h-72 shadow-[0_-10px_30px_rgba(0,0,0,0.35)]">
      <div class="flex items-center justify-between border-b border-slate-700 px-4 py-2 text-xs">
        <div class="flex items-center gap-2 text-slate-400">
          <span class="font-semibold tracking-[0.14em] text-slate-300">GAME TIME</span>
        </div>
        <div class="flex items-center gap-3">
          <span
            class="font-mono text-sm"
            :class="kpRunning ? 'text-emerald-200' : 'text-rose-200'"
          >
            {{ gameClockText }}
          </span>
          <button
            v-if="kpState.enabled"
            type="button"
            class="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-amber-400 hover:text-amber-100"
            @click="togglePause"
          >
            <component :is="kpRunning ? Pause : Play" class="h-4 w-4" />
            <span>{{ kpRunning ? '一時停止' : '再開' }}</span>
          </button>
        </div>
      </div>
      <div class="flex border-b border-slate-700 text-xs font-semibold">
        <button
          class="flex items-center gap-2 px-5 py-2 transition"
          :class="activeTab === 'chat' ? 'text-indigo-300 border-b-2 border-indigo-400' : 'text-slate-500 hover:text-slate-200'"
          @click="activeTab = 'chat'"
        >
          <MessageSquare class="h-4 w-4" /> CHAT
        </button>
        <button
          class="flex items-center gap-2 px-5 py-2 transition"
          :class="activeTab === 'palette' ? 'text-emerald-300 border-b-2 border-emerald-400' : 'text-slate-500 hover:text-slate-200'"
          @click="activeTab = 'palette'"
        >
          <List class="h-4 w-4" /> PALETTE
        </button>
        <button
          v-if="kpState.enabled"
          class="ml-auto flex items-center gap-2 px-5 py-2 transition"
          :class="activeTab === 'kp' ? 'text-amber-300 border-b-2 border-amber-400' : 'text-amber-600 hover:text-amber-300'"
          @click="activeTab = 'kp'"
        >
          <Crown class="h-4 w-4" /> KP
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-3">
        <div v-show="activeTab === 'chat'" class="flex h-full flex-col gap-3">
          <div class="flex items-center gap-2 text-[11px] text-slate-400">
            <span class="w-16 text-right font-semibold">NAME</span>
            <input
              v-model="displayName"
              type="text"
              class="w-48 rounded-lg border border-slate-700 bg-slate-900/70 px-2 py-1 text-xs font-semibold text-slate-100 outline-none focus:border-indigo-400"
              placeholder="表示名"
            />
          </div>
          <div class="flex flex-1 gap-2">
            <div class="relative flex-1">
              <textarea
                ref="chatInputRef"
                v-model="chatText"
                class="h-full w-full min-h-[44px] resize-none rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none ring-0 focus:border-indigo-400 font-mono"
                placeholder="メッセージやコマンドを入力"
                @keydown.enter.exact.prevent="handleSend"
              ></textarea>
              <div v-if="unlockReady" class="pointer-events-none absolute right-3 top-3 text-amber-400">
                <Unlock class="h-4 w-4 animate-pulse" />
              </div>
            </div>
            <button
              type="button"
              class="flex w-24 flex-col items-center justify-center gap-1 rounded-lg bg-indigo-600 text-xs font-bold text-white shadow-lg shadow-indigo-900/40 transition hover:bg-indigo-500 active:translate-y-[1px]"
              @click="handleSend"
            >
              <Send class="h-5 w-5" />
              <span>SEND</span>
            </button>
          </div>
        </div>

        <div v-show="activeTab === 'palette'" class="flex h-full flex-col gap-3">
          <div class="flex items-center justify-between text-[11px] text-slate-400">
            <span class="font-semibold">SAVED COMMANDS</span>
            <button
              type="button"
              class="rounded border border-slate-700 px-2 py-1 text-xs text-emerald-300 transition hover:bg-slate-700/50"
              @click="togglePaletteMode"
            >
              {{ paletteMode === 'view' ? '編集' : '一覧へ' }}
            </button>
          </div>

          <div v-if="paletteMode === 'view'" class="flex-1 space-y-1 overflow-y-auto pr-1">
            <button
              v-for="(line, idx) in paletteLines"
              :key="idx"
              type="button"
              class="group flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-left text-xs text-slate-200 transition hover:border-slate-700 hover:bg-slate-700/40"
              @click="usePalette(line)">
              <span class="truncate font-mono">{{ line }}</span>
              <Send class="h-3 w-3 text-emerald-400 opacity-0 transition group-hover:opacity-100" />
            </button>
            <p v-if="paletteLines.length === 0" class="mt-6 text-center text-xs text-slate-500">コマンドがありません。</p>
          </div>

          <div v-else class="flex-1 space-y-2">
            <p class="text-[11px] text-slate-400">1行1コマンドで入力してください。</p>
            <textarea
              v-model="paletteText"
              class="h-full min-h-[160px] w-full resize-none rounded-lg border border-slate-700 bg-slate-900/70 p-3 text-xs font-mono text-slate-100 outline-none focus:border-emerald-400"
              placeholder="CC<=50 【SAN】\n1d100 【目星】"
            ></textarea>
            <div class="flex justify-end gap-2">
              <button
                type="button"
                class="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 transition hover:bg-slate-700/50"
                @click="cancelPaletteEdit"
              >
                キャンセル
              </button>
              <button
                type="button"
                class="rounded bg-emerald-600 px-4 py-1 text-xs font-semibold text-white shadow-lg shadow-emerald-900/40 transition hover:bg-emerald-500"
                @click="savePaletteText"
              >
                保存
              </button>
            </div>
          </div>
        </div>

        <div v-show="activeTab === 'kp'" class="h-full space-y-4 text-sm text-slate-100">
          <div class="grid h-full grid-cols-1 gap-4 md:grid-cols-2">
            <div class="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-900/60 p-4">
              <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">RNG MODE</p>
              <div class="space-y-2">
                <label
                  class="flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 transition"
                  :class="kpState.mode === 'system'
                    ? 'border-emerald-400/60 bg-emerald-900/20 text-emerald-100'
                    : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-emerald-300/60'"
                >
                  <div class="flex items-center gap-2 text-xs font-semibold">
                    <Shuffle class="h-4 w-4" />
                    <span>System (Time-based)</span>
                  </div>
                  <input
                    v-model="kpState.mode"
                    type="radio"
                    value="system"
                    class="h-4 w-4 accent-emerald-400"
                    @change="applyKp({ mode: 'system' })"
                  />
                </label>
                <label
                  class="flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 transition"
                  :class="kpState.mode === 'quantum'
                    ? 'border-purple-400/60 bg-purple-900/20 text-purple-100'
                    : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-purple-300/60'"
                >
                  <div class="flex items-center gap-2 text-xs font-semibold">
                    <Crown class="h-4 w-4" />
                    <span>Quantum</span>
                  </div>
                  <input
                    v-model="kpState.mode"
                    type="radio"
                    value="quantum"
                    class="h-4 w-4 accent-purple-400"
                    @change="applyKp({ mode: 'quantum' })"
                  />
                </label>
              </div>
              <p class="text-[11px] leading-relaxed text-slate-400">
                "System" はゲーム内時間の秒をシードにした決定論的な乱数を使用します。Quantum モードを選ぶと外部量子乱数を利用します。
              </p>
            </div>

            <div class="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-900/60 p-4">
              <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">TIME CONTROL</p>
              <div class="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">
                <div class="flex items-center justify-between">
                  <span class="text-slate-400">Shared Stopwatch</span>
                  <span class="font-mono text-sm" :class="kpRunning ? 'text-emerald-200' : 'text-rose-200'">{{ gameClockText }}</span>
                </div>
                <p class="mt-1 text-[11px] text-slate-500">全プレイヤー共通のゲーム時間です。必要に応じて一時停止や任意時刻の設定ができます。</p>
              </div>
              <div class="space-y-1">
                <label class="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Set Manual Time</label>
                <input
                  v-model="manualTimeInput"
                  type="datetime-local"
                  step="1"
                  class="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-400"
                />
                <p class="text-[11px] text-slate-500">設定するとその時刻で一時停止します。</p>
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="flex-1 min-w-[140px] rounded-lg border border-amber-500 bg-amber-800 px-4 py-2 text-xs font-semibold text-amber-50 shadow-lg shadow-amber-900/30 transition hover:bg-amber-700"
                  @click="applyManualTime()"
                >
                  時計を合わせる
                </button>
                <button
                  type="button"
                  class="flex-1 min-w-[140px] rounded-lg border border-emerald-500 bg-emerald-800 px-4 py-2 text-xs font-semibold text-emerald-50 shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-700"
                  @click="togglePause"
                >
                  {{ kpRunning ? '一時停止' : '再開' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p v-if="chatError" class="px-4 pb-2 text-xs text-rose-400">{{ chatError }}</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import axios from 'axios';
import { Clock3, Crown, List, MessageSquare, Pause, Play, Send, Shuffle, Unlock } from 'lucide-vue-next';
import type { RealtimeChannel, Session, User } from '@supabase/supabase-js';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { supabase } from '../lib/supabase';

const apiBase = import.meta.env.VITE_WORKER_BASE ?? '';
const route = useRoute();

const sessionId = ref<string | null>((route.params.id as string) ?? null);
const authSession = ref<Session | null>(null);
const authUser = computed<User | null>(() => authSession.value?.user ?? null);
const chatText = ref('');
const displayName = ref('');
const messages = ref<MessageWithResult[]>([]);
const palette = ref<PaletteItem[]>([]);
const chatError = ref('');
const kpPasswordHash = ref<string | null>(null);
const activeTab = ref<'chat' | 'palette' | 'kp'>('chat');
const paletteMode = ref<'view' | 'edit'>('view');
const paletteText = ref('');
const manualTimeInput = ref('');
const unlockReady = ref(false);
const chatInputRef = ref<HTMLTextAreaElement | null>(null);
const logRef = ref<HTMLElement | null>(null);

const kpState = reactive({
  enabled: false,
  password: '',
  mode: 'system',
  gameTimeElapsed: 0,
  lastResumedAt: null as number | null
});

const clockNow = ref(Date.now());
let timer: number | null = null;
let lastHashCheckId = 0;
let chatChannel: RealtimeChannel | null = null;
let sessionChannel: RealtimeChannel | null = null;
let authSubscription: (() => void) | null = null;

const effectiveName = computed(
  () => displayName.value.trim() || authUser.value?.user_metadata?.full_name || authUser.value?.email || '名無しさん'
);
const kpRunning = computed(() => kpState.lastResumedAt !== null);
const gameClockValue = computed(() => {
  const base = kpState.gameTimeElapsed ?? 0;
  if (kpState.lastResumedAt === null) return base;
  return base + (clockNow.value - kpState.lastResumedAt);
});
const gameClockText = computed(() => formatClock(gameClockValue.value));
const paletteLines = computed(() => palette.value.map((p) => p.content));

watch(
  () => route.params.id,
  (val) => {
    sessionId.value = val as string;
    hydrateFromStorage();
    cleanupRealtime();
    setupRealtime();
    loadMessages();
    loadSessionInfo();
  }
);

watch(displayName, (val) => {
  if (sessionId.value) localStorage.setItem(`kp-name-${sessionId.value}`, val);
});

watch(
  palette,
  (val) => {
    if (sessionId.value) localStorage.setItem(`kp-palette-${sessionId.value}`, JSON.stringify(val));
  },
  { deep: true }
);

watch(
  () => [kpState.enabled, kpState.mode, kpState.password],
  () => persistKpState()
);

watch(chatText, () => evaluateUnlock());
watch(
  () => kpPasswordHash.value,
  () => evaluateUnlock()
);

watch(messages, () => scrollLog(), { deep: true });

onMounted(() => {
  hydrateFromStorage();
  initializeAuth();
  loadMessages();
  loadSessionInfo();
  setupRealtime();
  startClock();
});

onBeforeUnmount(() => {
  stopClock();
  cleanupRealtime();
  if (authSubscription) authSubscription();
});

type DiceResult = {
  value?: number;
  success?: boolean;
  target?: number;
  dice?: number[];
  rolls?: number[];
  result_level?: string;
};
type ApiMessage = {
  id: string;
  created_at: number | string;
  raw_text: string;
  rendered_text: string;
  speaker_name?: string;
  result_json?: string | DiceResult | null;
  session_id?: string;
};
type MessageWithResult = ApiMessage & { parsedResult: DiceResult | null; created_at: number };
type PaletteItem = { label: string; content: string };
type KpPayload = { mode?: string; setTime?: number | null; action?: 'pause' | 'resume' };

async function initializeAuth() {
  const { data } = await supabase.auth.getSession();
  authSession.value = data.session;
  const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
    authSession.value = session;
    if (sessionId.value) {
      loadMessages();
      loadSessionInfo();
    }
  });
  authSubscription = () => subscription.subscription.unsubscribe();
}

function startClock() {
  stopClock();
  timer = window.setInterval(() => {
    clockNow.value = Date.now();
  }, 1000);
}

function stopClock() {
  if (timer) window.clearInterval(timer);
  timer = null;
}

function hydrateFromStorage() {
  if (!sessionId.value) return;
  const name = localStorage.getItem(`kp-name-${sessionId.value}`);
  displayName.value = name ?? '';
  const paletteJson = localStorage.getItem(`kp-palette-${sessionId.value}`);
  palette.value = paletteJson ? JSON.parse(paletteJson) : [];
  const kpEnabled = localStorage.getItem(`kp-enabled-${sessionId.value}`);
  kpState.enabled = kpEnabled === 'true';
  kpState.password = localStorage.getItem(`kp-session-password-${sessionId.value}`) ?? '';
  kpState.mode = localStorage.getItem(`kp-mode-${sessionId.value}`) ?? 'system';
  manualTimeInput.value = '';
}

function persistKpState() {
  if (!sessionId.value) return;
  localStorage.setItem(`kp-enabled-${sessionId.value}`, kpState.enabled ? 'true' : 'false');
  localStorage.setItem(`kp-mode-${sessionId.value}`, kpState.mode);
}

function normalizeMessage(msg: ApiMessage): MessageWithResult {
  const createdAt = typeof msg.created_at === 'string' ? Date.parse(msg.created_at) : Number(msg.created_at ?? Date.now());
  return { ...msg, created_at: createdAt, parsedResult: parseResult(msg.result_json) };
}

function addMessage(msg: ApiMessage) {
  const normalized = normalizeMessage(msg);
  if (messages.value.some((m) => m.id === normalized.id)) return;
  messages.value = [...messages.value, normalized].sort((a, b) => a.created_at - b.created_at);
}

async function sendChat(text: string) {
  if (!sessionId.value || !text.trim()) return;
  chatError.value = '';
  const trimmed = text.trim();

  if (isCommand(trimmed)) {
    try {
      await axios.post(
        `${apiBase}/api/sessions/${sessionId.value}/messages`,
        {
          speakerName: effectiveName.value,
          text: trimmed
        }
      );
      chatText.value = '';
    } catch (err) {
      chatError.value = (err as Error).message ?? '送信に失敗しました';
    }
    return;
  }

  const messageId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const { error } = await supabase.from('chat_messages').insert({
    id: messageId,
    session_id: sessionId.value,
    speaker_name: effectiveName.value,
    raw_text: trimmed,
    rendered_text: trimmed,
    created_at: createdAt
  });
  if (error) {
    chatError.value = error.message ?? '送信に失敗しました';
    return;
  }
  chatText.value = '';
  addMessage({
    id: messageId,
    session_id: sessionId.value,
    raw_text: trimmed,
    rendered_text: trimmed,
    created_at: createdAt,
    result_json: null,
    speaker_name: effectiveName.value
  });
}

function isCommand(text: string) {
  const pattern = /^\s*((\d+d\d+)|(cc<=?\d+)|\/)/i;
  return pattern.test(text);
}

async function loadMessages() {
  if (!sessionId.value) return;
  chatError.value = '';
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId.value)
    .order('created_at', { ascending: true });
  if (error) {
    chatError.value = error.message ?? 'メッセージの取得に失敗しました';
    return;
  }
  const rawMessages = (data ?? []) as ApiMessage[];
  messages.value = rawMessages.map((msg) => normalizeMessage(msg));
}

async function loadSessionInfo() {
  if (!sessionId.value) return;
  kpPasswordHash.value = null;
  try {
    const res = await axios.get(`${apiBase}/api/sessions/${sessionId.value}/info`);
    kpPasswordHash.value = res.data?.passwordHash ?? null;
    if (res.data?.state) {
      syncStateFromServer(res.data.state);
    }
  } catch (err) {
    console.error('Failed to load session info', err);
    kpPasswordHash.value = null;
  }
}

function parseResult(result: ApiMessage['result_json']): DiceResult | null {
  if (!result) return null;
  if (typeof result === 'string') {
    try {
      return JSON.parse(result) as DiceResult;
    } catch (err) {
      console.warn('Failed to parse dice result', err);
      return null;
    }
  }
  return result as DiceResult;
}

function syncStateFromServer(state: Partial<{ mode: string; game_time_elapsed: number; last_resumed_at: number | null; gameTime: number }>) {
  if (state.mode) {
    kpState.mode = state.mode;
  }
  if (typeof state.game_time_elapsed === 'number') {
    kpState.gameTimeElapsed = state.game_time_elapsed;
  }
  if ('last_resumed_at' in state) {
    kpState.lastResumedAt = state.last_resumed_at ?? null;
  }
  if (kpState.lastResumedAt === null && typeof state.gameTime === 'number') {
    manualTimeInput.value = formatDatetime(state.gameTime);
  }
}

function savePalette(val: PaletteItem[]) {
  palette.value = val;
  if (sessionId.value) localStorage.setItem(`kp-palette-${sessionId.value}`, JSON.stringify(val));
}

function unlockKp(passwordInput: string) {
  if (!sessionId.value) return;
  kpState.password = passwordInput;
  localStorage.setItem(`kp-session-password-${sessionId.value}`, passwordInput);
  kpState.enabled = true;
  localStorage.setItem(`kp-enabled-${sessionId.value}`, 'true');
  chatText.value = '';
}

async function applyKp(payload: KpPayload) {
  if (!sessionId.value) return;
  if (!kpState.password) {
    chatError.value = 'KPパスワードを設定してください。';
    return;
  }
  chatError.value = '';
  try {
    const res = await axios.post(
      `${apiBase}/api/sessions/${sessionId.value}/kp`,
      {
        password: kpState.password,
        mode: payload.mode ?? kpState.mode,
        setTime: payload.setTime ?? null,
        action: payload.action,
        confirmQuantum: (payload.mode ?? kpState.mode) === 'quantum'
      }
    );
    if (res.data?.state) {
      syncStateFromServer(res.data.state);
    } else if (payload.mode) {
      kpState.mode = payload.mode;
    }
    persistKpState();
  } catch (err) {
    chatError.value = (err as Error).message ?? 'KP更新に失敗しました';
  }
}

function applyManualTime() {
  if (!manualTimeInput.value) {
    chatError.value = '設定する時刻を入力してください。';
    return;
  }
  const ts = new Date(manualTimeInput.value).getTime();
  if (Number.isNaN(ts)) {
    chatError.value = '時刻の形式が正しくありません。';
    return;
  }
  applyKp({ mode: kpState.mode, setTime: ts, action: 'pause' });
}

function applyLogTimestamp(epoch: number) {
  manualTimeInput.value = formatDatetime(epoch);
  applyKp({ mode: kpState.mode, setTime: epoch, action: 'pause' });
}

function formatClock(epoch: number) {
  const d = new Date(epoch);
  const pad = (n: number) => `${n}`.padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function togglePause() {
  if (!sessionId.value || !kpState.enabled) return;
  if (!kpState.password) {
    chatError.value = 'KPパスワードを設定してください。';
    return;
  }
  const action: KpPayload['action'] = kpRunning.value ? 'pause' : 'resume';
  await applyKp({ mode: kpState.mode, action });
}

function formatLogTime(epoch: number) {
  const d = new Date(epoch);
  const pad = (n: number) => `${n}`.padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function speakerClass(msg: MessageWithResult) {
  const name = (msg.speaker_name || '').toLowerCase();
  if (name.includes('kp') || name.includes('gm')) return 'text-amber-300 font-semibold';
  if (name === effectiveName.value.toLowerCase()) return 'text-indigo-300 font-semibold';
  return 'text-slate-300 font-semibold';
}

function diceBadge(msg: MessageWithResult) {
  const res = msg.parsedResult;
  if (!res) return '';
  const value = typeof res.value === 'number' ? res.value : res.rolls?.[0];
  const target = typeof res.target === 'number' ? res.target : undefined;
  const base = target !== undefined ? `CC<=${target}` : msg.raw_text.split(' ')[0] || 'ROLL';
  const status = res.result_level ? resultLabel(res.result_level) : res.success === true ? '成功' : res.success === false ? '失敗' : '';
  const summary = value !== undefined ? `${base} → ${value}` : base;
  return status ? `${summary} ${status}` : summary;
}

function badgeTone(msg: MessageWithResult) {
  const res = msg.parsedResult;
  if (!res) return 'border-slate-700 text-slate-300';
  const level = res.result_level;
  if (level === 'critical' || level === 'extreme') return 'border-emerald-400/60 text-emerald-200 bg-emerald-900/20';
  if (level === 'fumble') return 'border-rose-400/60 text-rose-200 bg-rose-900/20';
  if (res.success === true) return 'border-emerald-400/60 text-emerald-200 bg-emerald-900/20';
  if (res.success === false) return 'border-rose-400/60 text-rose-200 bg-rose-900/20';
  return 'border-slate-700 text-slate-300 bg-slate-800/30';
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
      return '';
  }
}

function togglePaletteMode() {
  if (paletteMode.value === 'view') {
    paletteText.value = paletteLines.value.join('\n');
    paletteMode.value = 'edit';
  } else {
    paletteMode.value = 'view';
  }
}

function cancelPaletteEdit() {
  paletteText.value = paletteLines.value.join('\n');
  paletteMode.value = 'view';
}

function savePaletteText() {
  const lines = paletteText.value
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((content) => ({ label: content, content }));
  savePalette(lines);
  paletteMode.value = 'view';
}

function usePalette(text: string) {
  chatText.value = text;
  activeTab.value = 'chat';
  nextTick(() => chatInputRef.value?.focus());
}

function formatDatetime(epoch: number) {
  const date = new Date(epoch);
  const pad = (n: number) => `${n}`.padStart(2, '0');
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}:${ss}`;
}

async function evaluateUnlock() {
  const text = chatText.value.trim();
  const targetHash = kpPasswordHash.value;
  if (!text || !targetHash) {
    unlockReady.value = false;
    return;
  }
  const checkId = ++lastHashCheckId;
  try {
    const hash = await hashText(text);
    if (checkId !== lastHashCheckId) return;
    unlockReady.value = hash === targetHash;
  } catch (err) {
    console.error('Failed to hash password input', err);
    if (checkId === lastHashCheckId) {
      unlockReady.value = false;
    }
  }
}

async function hashText(text: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function handleSend() {
  if (unlockReady.value) {
    unlockKp(chatText.value.trim());
    return;
  }
  if (!chatText.value.trim()) return;
  sendChat(chatText.value.trim());
}

function scrollLog() {
  nextTick(() => {
    if (logRef.value) {
      logRef.value.scrollTop = logRef.value.scrollHeight;
    }
  });
}

function setupRealtime() {
  cleanupRealtime();
  if (!sessionId.value) return;
  chatChannel = supabase
    .channel(`chat:${sessionId.value}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `session_id=eq.${sessionId.value}` },
      (payload) => {
        addMessage(payload.new as ApiMessage);
      }
    )
    .subscribe();

  sessionChannel = supabase
    .channel(`session:${sessionId.value}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId.value}` },
      (payload) => {
        syncStateFromServer(payload.new as Record<string, unknown>);
      }
    )
    .subscribe();
}

function cleanupRealtime() {
  if (chatChannel) {
    supabase.removeChannel(chatChannel);
    chatChannel = null;
  }
  if (sessionChannel) {
    supabase.removeChannel(sessionChannel);
    sessionChannel = null;
  }
}
</script>
