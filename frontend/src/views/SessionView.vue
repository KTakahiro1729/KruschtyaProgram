<template>
  <div v-if="sessionId" class="session-shell">
    <SessionHeader
      :session-id="sessionId"
      :clock-text="clockText"
      :status-text="statusText"
      :kp-enabled="kpState.enabled"
      :paused="kpState.paused"
      @toggle-pause="togglePause"
    />

    <div class="session-body">
      <SessionLog :messages="messages" :current-speaker="effectiveName" />
    </div>

    <SessionControls
      :chat-text="chatText"
      :display-name="displayName"
      :palette-items="palette"
      :kp-enabled="kpState.enabled"
      :kp-password="kpState.password"
      :kp-mode="kpState.mode"
      :kp-manual-time="kpState.manualTime"
      :kp-offset="kpState.offset"
      @update:chatText="(v) => (chatText = v)"
      @update:displayName="(v) => (displayName = v)"
      @send-chat="sendChat"
      @refresh="loadMessages"
      @save-palette="savePalette"
      @update:palette="(v) => (palette = v)"
      @unlock-kp="unlockKp"
      @apply-kp="applyKp"
    />

    <p v-if="chatError" class="error">{{ chatError }}</p>
  </div>
</template>

<script setup lang="ts">
import axios from 'axios';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import SessionControls from '../components/SessionControls.vue';
import SessionHeader from '../components/SessionHeader.vue';
import SessionLog from '../components/SessionLog.vue';

const apiBase = import.meta.env.VITE_WORKER_BASE ?? '';
const route = useRoute();

const sessionId = ref<string | null>((route.params.id as string) ?? null);
const chatText = ref('');
const displayName = ref('');
const messages = ref<MessageWithResult[]>([]);
const palette = ref<PaletteItem[]>([]);
const chatError = ref('');

const kpState = reactive({
  enabled: false,
  password: '',
  mode: 'system',
  manualTime: null as number | null,
  offset: 0,
  paused: false,
  pausedAt: null as number | null
});

const clock = ref(new Date());
let timer: number | null = null;

const effectiveName = computed(() => displayName.value.trim() || '名無しさん');
const clockText = computed(() => formatTime(kpState.paused && kpState.pausedAt ? kpState.pausedAt : kpState.manualTime ?? clock.value));
const statusText = computed(() => {
  if (kpState.mode === 'quantum') return '量子乱数で同期';
  if (kpState.mode === 'manual') return '手動シード';
  return '現在時刻で同期';
});

watch(
  () => route.params.id,
  (val) => {
    sessionId.value = val as string;
    hydrateFromStorage();
    loadMessages();
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

onMounted(() => {
  hydrateFromStorage();
  loadMessages();
  startClock();
});

onBeforeUnmount(() => stopClock());

type DiceResult = { value?: number; success?: boolean; target?: number; dice?: number[]; rolls?: number[]; result_level?: string };
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
    if (!kpState.paused) {
      clock.value = new Date();
    }
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

function unlockKp() {
  if (!sessionId.value) return;
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
    kpState.paused = false;
    kpState.pausedAt = null;
    persistKpState();
  } catch (err) {
    chatError.value = (err as Error).message ?? 'KP更新に失敗しました';
  }
}

function formatTime(input: number | Date) {
  const d = input instanceof Date ? input : new Date(input);
  const pad = (n: number) => `${n}`.padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function togglePause() {
  if (!sessionId.value || !kpState.enabled) return;
  if (kpState.paused) {
    kpState.paused = false;
    kpState.pausedAt = null;
    await applyKp({ mode: kpState.mode, manualTime: kpState.manualTime, offset: kpState.offset });
    return;
  }
  const freezeTime = kpState.manualTime ?? Date.now();
  kpState.paused = true;
  kpState.pausedAt = freezeTime;
  await applyKp({ mode: kpState.mode === 'manual' ? 'manual' : 'system', manualTime: freezeTime, offset: kpState.offset });
}
</script>
