<template>
  <section class="panel controls-panel">
    <div class="tab-row">
      <button class="tab" :class="{ active: activeTab === 'chat' }" type="button" @click="activeTab = 'chat'">
        <MessageSquare class="icon" />
        チャット
      </button>
      <button class="tab" :class="{ active: activeTab === 'palette' }" type="button" @click="activeTab = 'palette'">
        <Palette class="icon" />
        パレット
      </button>
      <button
        v-if="kpEnabled"
        class="tab"
        :class="{ active: activeTab === 'kp' }"
        type="button"
        @click="activeTab = 'kp'"
      >
        <Settings class="icon" />
        KP設定
      </button>
    </div>

    <div v-if="activeTab === 'chat'" class="tab-panel">
      <div class="field">
        <label>名前</label>
        <input v-model="localName" placeholder="表示名" />
      </div>
      <div class="field chat-box">
        <label>メッセージ / コマンド</label>
        <div class="chat-input">
          <textarea
            v-model="localChat"
            rows="3"
            placeholder="例: CC<=50, 1d100"
            @keydown.enter.exact.prevent="handleSend"
          ></textarea>
          <div v-if="unlockReady" class="unlock-hint animate-pulse">
            <Unlock class="icon" />
          </div>
        </div>
        <div class="actions">
          <button class="ghost" type="button" @click="$emit('refresh')">再読込</button>
          <button class="primary" type="button" :disabled="!localChat.trim()" @click="handleSend">
            <Send class="icon" />送信
          </button>
        </div>
      </div>
    </div>

    <div v-else-if="activeTab === 'palette'" class="tab-panel">
      <div class="palette-actions">
        <p class="muted">ワンクリック送信または一括編集</p>
        <button class="ghost" type="button" @click="toggleEdit">{{ editing ? '一覧表示へ' : '編集モード' }}</button>
      </div>
      <div v-if="!editing" class="chips">
        <button v-for="(item, idx) in localPalette" :key="idx" class="pill" type="button" @click="$emit('send-chat', item.content)">
          <span class="label">{{ item.label || `Line ${idx + 1}` }}</span>
          <span class="muted">{{ item.content }}</span>
        </button>
      </div>
      <div v-else class="field">
        <label>一括編集</label>
        <textarea v-model="bulkText" rows="8" placeholder="{label} {content}"></textarea>
        <div class="actions">
          <button class="primary" type="button" @click="saveBulk">保存</button>
        </div>
      </div>
    </div>

    <div v-else-if="activeTab === 'kp'" class="tab-panel">
      <div class="field">
        <label>RNGモード</label>
        <div class="segmented">
          <label><input v-model="kpModeLocal" type="radio" value="system" /> 現在時刻</label>
          <label><input v-model="kpModeLocal" type="radio" value="manual" /> 手動</label>
          <label><input v-model="kpModeLocal" type="radio" value="quantum" /> 量子乱数</label>
        </div>
      </div>
      <div class="field">
        <label>手動時刻</label>
        <input v-model="manualTimeInput" type="datetime-local" />
      </div>
      <div class="field">
        <label>オフセット (ms)</label>
        <input v-model.number="offsetInput" type="number" />
      </div>
      <div class="actions">
        <button class="primary" type="button" @click="applyKp">適用</button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { MessageSquare, Palette, Send, Settings, Unlock } from 'lucide-vue-next';

type PaletteItem = { label: string; content: string };

type KpPayload = { mode: string; manualTime: number | null; offset: number };

const props = defineProps<{
  chatText: string;
  displayName: string;
  paletteItems: PaletteItem[];
  kpEnabled: boolean;
  kpPasswordHash?: string | null;
  kpMode: string;
  kpManualTime: number | null;
  kpOffset: number;
}>();

const emit = defineEmits<{
  (e: 'update:chatText', val: string): void;
  (e: 'update:displayName', val: string): void;
  (e: 'send-chat', val: string): void;
  (e: 'refresh'): void;
  (e: 'save-palette', val: PaletteItem[]): void;
  (e: 'update:palette', val: PaletteItem[]): void;
  (e: 'unlock-kp', password: string): void;
  (e: 'apply-kp', payload: KpPayload): void;
}>();

const activeTab = ref<'chat' | 'palette' | 'kp'>('chat');
const localChat = ref(props.chatText);
const localName = ref(props.displayName);
const localPalette = ref<PaletteItem[]>([...props.paletteItems]);
const editing = ref(false);
const bulkText = ref('');
const kpModeLocal = ref(props.kpMode || 'system');
const manualTimeInput = ref(props.kpManualTime ? formatDatetime(props.kpManualTime) : '');
const offsetInput = ref(props.kpOffset ?? 0);
const unlockReady = ref(false);
let lastHashCheckId = 0;

watch(
  () => props.chatText,
  (val) => {
    if (val !== localChat.value) localChat.value = val;
  }
);
watch(localChat, (val) => emit('update:chatText', val));

watch(
  () => props.displayName,
  (val) => {
    if (val !== localName.value) localName.value = val;
  }
);
watch(localName, (val) => emit('update:displayName', val));

watch(
  () => props.paletteItems,
  (val) => {
    localPalette.value = [...val];
    if (!editing.value) {
      bulkText.value = serializePalette();
    }
  },
  { deep: true }
);

watch(
  () => props.kpMode,
  (val) => {
    kpModeLocal.value = val || 'system';
  }
);

watch(
  () => props.kpManualTime,
  (val) => {
    manualTimeInput.value = val ? formatDatetime(val) : '';
  }
);

watch(
  () => props.kpOffset,
  (val) => {
    offsetInput.value = val ?? 0;
  }
);

watch(localChat, () => evaluateUnlock());
watch(
  () => props.kpPasswordHash,
  () => evaluateUnlock()
);

async function evaluateUnlock() {
  const text = localChat.value.trim();
  const targetHash = props.kpPasswordHash;
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
    emit('unlock-kp', localChat.value.trim());
    localChat.value = '';
    return;
  }
  if (!localChat.value.trim()) return;
  emit('send-chat', localChat.value.trim());
  localChat.value = '';
}

function toggleEdit() {
  editing.value = !editing.value;
  if (editing.value) {
    bulkText.value = serializePalette();
  }
}

function serializePalette() {
  return localPalette.value.map((item) => (item.label ? `${item.label} ${item.content}` : item.content)).join('\n');
}

function saveBulk() {
  const items: PaletteItem[] = [];
  const lines = bulkText.value.split('\n');
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const [label, ...rest] = trimmed.split(/\s+/);
    if (rest.length) {
      items.push({ label, content: rest.join(' ') });
    } else {
      items.push({ label: trimmed, content: trimmed });
    }
  });
  localPalette.value = items;
  emit('update:palette', items);
  emit('save-palette', items);
  editing.value = false;
}

function formatDatetime(epoch: number) {
  const date = new Date(epoch);
  const pad = (n: number) => `${n}`.padStart(2, '0');
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
}

function applyKp() {
  const manual = manualTimeInput.value ? new Date(manualTimeInput.value).getTime() : null;
  emit('apply-kp', { mode: kpModeLocal.value, manualTime: manual, offset: offsetInput.value ?? 0 });
}
</script>
