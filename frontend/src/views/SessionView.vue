<template>
  <div v-if="sessionId" class="min-h-[100dvh] bg-slate-900 text-slate-100 flex flex-col">
    <header
      class="h-10 flex items-center justify-between px-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-20"
    >
      <div
        class="font-mono text-lg font-semibold tracking-widest"
        :class="kpState.paused ? 'text-rose-400 animate-pulse' : 'text-emerald-300'"
      >
        {{ clockText }}
      </div>
      <button
        v-if="kpState.enabled"
        type="button"
        class="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition"
        :class="kpState.paused
          ? 'border-rose-400/60 bg-rose-900/40 text-rose-100 hover:bg-rose-800/60'
          : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'"
        @click="togglePause"
      >
        <component :is="kpState.paused ? Play : Pause" class="h-4 w-4" />
        <span>{{ kpState.paused ? '再開' : '一時停止' }}</span>
      </button>
    </header>

    <main ref="logRef" class="flex-1 overflow-y-auto px-3 py-2 space-y-1 bg-slate-900/60">
      <section
        v-for="msg in messages"
        :key="msg.id"
        class="rounded-lg px-3 py-1.5 transition hover:bg-slate-800/40"
      >
        <div class="flex items-baseline gap-2 text-[11px] leading-tight text-slate-500">
          <span class="font-mono">{{ formatLogTime(msg.created_at) }}</span>
          <span :class="speakerClass(msg)">{{ msg.speaker_name || '名無しさん' }}</span>
        </div>
        <div class="mt-1 text-sm leading-tight whitespace-pre-wrap break-words text-slate-100">
          <span
            v-if="diceBadge(msg)"
            class="mr-2 inline-flex items-center gap-2 rounded border px-2 py-0.5 text-[11px] font-mono"
            :class="badgeTone(msg)"
          >
            {{ diceBadge(msg) }}
          </span>
          <span>{{ msg.rendered_text || msg.raw_text }}</span>
        </div>
      </section>
    </main>

    <footer class="bg-slate-800/90 border-t border-slate-700 flex flex-col h-64 shadow-[0_-10px_30px_rgba(0,0,0,0.35)]">
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

        <div v-show="activeTab === 'kp'" class="flex h-full flex-col gap-4 text-sm text-slate-100">
          <div class="space-y-2">
            <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">RNG Mode</p>
            <div class="grid grid-cols-3 gap-2">
              <button
                type="button"
                class="rounded border px-3 py-2 text-center text-xs font-semibold transition"
                :class="kpState.mode === 'system' ? 'border-amber-400 bg-amber-900/30 text-amber-100' : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:bg-slate-800'"
                @click="applyKp({ mode: 'system', manualTime: null, offset: kpState.offset })"
              >
                現在時刻
              </button>
              <button
                type="button"
                class="rounded border px-3 py-2 text-center text-xs font-semibold transition"
                :class="kpState.mode === 'manual' ? 'border-amber-400 bg-amber-900/30 text-amber-100' : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:bg-slate-800'"
                @click="applyKp({ mode: 'manual', manualTime: manualTimeInput ? new Date(manualTimeInput).getTime() : Date.now(), offset: kpState.offset })"
              >
                手動
              </button>
              <button
                type="button"
                class="rounded border px-3 py-2 text-center text-xs font-semibold transition"
                :class="kpState.mode === 'quantum' ? 'border-purple-400 bg-purple-900/30 text-purple-100' : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:bg-slate-800'"
                @click="applyKp({ mode: 'quantum', manualTime: null, offset: kpState.offset })"
              >
                量子乱数
              </button>
            </div>
          </div>

          <div class="space-y-2">
            <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Manual Time</p>
            <input
              v-model="manualTimeInput"
              type="datetime-local"
              step="1"
              class="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-400"
            />
          </div>

          <div class="space-y-2">
            <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Offset (ms)</p>
            <input
              v-model.number="kpState.offset"
              type="number"
              class="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-400"
            />
          </div>

          <button
            type="button"
            class="mt-auto w-full rounded-lg bg-amber-700 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-900/40 transition hover:bg-amber-600"
            @click="applyKp({ mode: kpState.mode, manualTime: manualTimeInput ? new Date(manualTimeInput).getTime() : null, offset: kpState.offset })"
          >
            設定を適用
          </button>
        </div>
      </div>
      <p v-if="chatError" class="px-4 pb-2 text-xs text-rose-400">{{ chatError }}</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import axios from 'axios';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Crown, List, MessageSquare, Pause, Play, Send, Unlock } from 'lucide-vue-next';

const apiBase = import.meta.env.VITE_WORKER_BASE ?? '';
const route = useRoute();

const sessionId = ref<string | null>((route.params.id as string) ?? null);
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
  manualTime: null as number | null,
  offset: 0,
  paused: false,
  pausedAt: null as number | null
});

const clockNow = ref(Date.now());
let timer: number | null = null;
let lastHashCheckId = 0;

const effectiveName = computed(() => displayName.value.trim() || '名無しさん');
const displayClockValue = computed(() => {
  if (kpState.paused && kpState.pausedAt) return kpState.pausedAt;
  if (kpState.mode === 'manual' && kpState.manualTime) return kpState.manualTime + (kpState.offset ?? 0);
  return clockNow.value + (kpState.offset ?? 0);
});
const clockText = computed(() => formatClock(displayClockValue.value));
const paletteLines = computed(() => palette.value.map((p) => p.content));

watch(
  () => route.params.id,
  (val) => {
    sessionId.value = val as string;
    hydrateFromStorage();
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
  () => [kpState.enabled, kpState.mode, kpState.manualTime, kpState.offset],
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
  loadMessages();
  loadSessionInfo();
  startClock();
});

onBeforeUnmount(() => stopClock());

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
  created_at: number;
  raw_text: string;
  rendered_text: string;
  speaker_name?: string;
  result_json?: string | DiceResult | null;
};
type MessageWithResult = ApiMessage & { parsedResult: DiceResult | null };
type PaletteItem = { label: string; content: string };
type KpPayload = { mode: string; manualTime: number | null; offset: number };

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
  kpState.offset = Number(localStorage.getItem(`kp-offset-${sessionId.value}`) ?? 0);
  const manualStored = localStorage.getItem(`kp-manual-${sessionId.value}`);
  kpState.manualTime = manualStored ? Number(manualStored) : null;
  manualTimeInput.value = kpState.manualTime ? formatDatetime(kpState.manualTime) : '';
}

function persistKpState() {
  if (!sessionId.value) return;
  localStorage.setItem(`kp-enabled-${sessionId.value}`, kpState.enabled ? 'true' : 'false');
  localStorage.setItem(`kp-mode-${sessionId.value}`, kpState.mode);
  localStorage.setItem(`kp-offset-${sessionId.value}`, `${kpState.offset ?? 0}`);
  if (kpState.manualTime !== null) {
    localStorage.setItem(`kp-manual-${sessionId.value}`, `${kpState.manualTime}`);
  } else {
    localStorage.removeItem(`kp-manual-${sessionId.value}`);
  }
}

async function sendChat(text: string) {
  if (!sessionId.value || !text.trim()) return;
  chatError.value = '';
  try {
    await axios.post(`${apiBase}/api/sessions/${sessionId.value}/messages`, {
      speakerName: effectiveName.value,
      text
    });
    chatText.value = '';
    await loadMessages();
  } catch (err) {
    chatError.value = (err as Error).message ?? '送信に失敗しました';
  }
}

async function loadMessages() {
  if (!sessionId.value) return;
  const res = await axios.get(`${apiBase}/api/sessions/${sessionId.value}/messages`);
  const rawMessages = (res.data.messages ?? []) as ApiMessage[];
  messages.value = rawMessages.map((msg) => ({ ...msg, parsedResult: parseResult(msg.result_json) }));
}

async function loadSessionInfo() {
  if (!sessionId.value) return;
  kpPasswordHash.value = null;
  try {
    const res = await axios.get(`${apiBase}/api/sessions/${sessionId.value}/info`);
    kpPasswordHash.value = res.data?.passwordHash ?? null;
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

async function applyKp(payload: KpPayload, options?: { maintainPause?: boolean }) {
  if (!sessionId.value) return;
  if (!kpState.password) {
    chatError.value = 'KPパスワードを設定してください。';
    return;
  }
  chatError.value = '';
  try {
    await axios.post(`${apiBase}/api/sessions/${sessionId.value}/kp`, {
      password: kpState.password,
      mode: payload.mode,
      manualTime: payload.manualTime,
      offset: payload.offset,
      confirmQuantum: payload.mode === 'quantum'
    });
    kpState.mode = payload.mode;
    kpState.manualTime = payload.manualTime;
    kpState.offset = payload.offset;
    manualTimeInput.value = payload.manualTime ? formatDatetime(payload.manualTime) : '';
    if (!options?.maintainPause) {
      kpState.paused = false;
      kpState.pausedAt = null;
    }
    persistKpState();
  } catch (err) {
    chatError.value = (err as Error).message ?? 'KP更新に失敗しました';
  }
}

function formatClock(epoch: number) {
  const d = new Date(epoch);
  const pad = (n: number) => `${n}`.padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function togglePause() {
  if (!sessionId.value || !kpState.enabled) return;
  if (!kpState.password) {
    chatError.value = 'KPパスワードを設定してください。';
    return;
  }
  if (kpState.paused) {
    kpState.paused = false;
    kpState.pausedAt = null;
    kpState.mode = 'system';
    kpState.manualTime = null;
    kpState.offset = 0;
    await applyKp({ mode: 'system', manualTime: null, offset: 0 });
    return;
  }
  const freezeTime = displayClockValue.value;
  kpState.paused = true;
  kpState.pausedAt = freezeTime;
  await applyKp({ mode: 'manual', manualTime: freezeTime, offset: kpState.offset }, { maintainPause: true });
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
</script>
