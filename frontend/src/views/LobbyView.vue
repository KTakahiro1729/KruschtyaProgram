<template>
  <div class="min-h-[100dvh] bg-slate-900 px-4 py-8 text-slate-100">
    <div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header class="space-y-4 rounded-2xl border border-slate-800 bg-slate-800/60 p-6 shadow-xl shadow-black/30">
        <div class="space-y-2">
          <p class="text-[10px] uppercase tracking-[0.2em] text-indigo-300">クラウドで遊ぶダイス卓</p>
          <h1 class="text-2xl font-semibold">Cloudflare Dice Room</h1>
          <p class="text-sm text-slate-400">
            Googleでログインし、セッションを作成または参加してください。作成したセッションはロビーからすぐに入室できます。
          </p>
        </div>
        <div
          class="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-300 md:flex-row md:items-center md:justify-between"
        >
          <div class="space-y-1">
            <p class="text-xs text-slate-500">Googleログイン</p>
            <p class="text-sm text-slate-400">Supabase Auth を使用してポップアップで認証します。</p>
          </div>
          <div class="flex flex-col gap-2 md:w-72">
            <button
              class="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:bg-indigo-500"
              @click="signInWithGoogle"
            >
              Googleでログイン
            </button>
            <button
              v-if="user"
              class="w-full rounded-lg border border-slate-600 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-rose-400 hover:text-rose-200"
              @click="signOut"
            >
              ログアウト
            </button>
            <p v-if="user" class="rounded border border-emerald-500/40 bg-emerald-900/30 px-3 py-2 text-xs text-emerald-100">
              ログイン済み: {{ userName }} ({{ userEmail }})
            </p>
            <p v-if="loginError" class="text-xs text-rose-400">{{ loginError }}</p>
          </div>
        </div>
      </header>

      <div class="grid gap-4 md:grid-cols-2">
        <section class="space-y-4 rounded-2xl border border-slate-800 bg-slate-800/60 p-6 shadow-lg shadow-black/20">
          <h2 class="text-lg font-semibold">セッション作成</h2>
          <p class="text-sm text-slate-400">KPとして新しいセッションを立ち上げます。ログインしている必要があります。</p>
          <button
            class="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-700"
            :disabled="!user"
            @click="createSession"
          >
            セッションを作成する
          </button>
          <div v-if="session.sessionId" class="space-y-2 rounded-lg border border-slate-700 bg-slate-900/40 p-4 text-sm">
            <p>セッションID: <span class="font-mono">{{ session.sessionId }}</span></p>
            <p>パスワード: <span class="font-mono">{{ session.password }}</span></p>
            <p class="text-slate-400">セッション作成後は参加フォームから入室できます。</p>
          </div>
        </section>

        <section class="space-y-4 rounded-2xl border border-slate-800 bg-slate-800/60 p-6 shadow-lg shadow-black/20">
          <h2 class="text-lg font-semibold">セッション参加</h2>
          <p class="text-sm text-slate-400">セッションIDと名前を入力し、入室します。参加後はプレイ画面へ移動します。</p>
          <div class="grid gap-3 md:grid-cols-2">
            <label class="space-y-1 text-sm text-slate-300">
              <span class="text-xs text-slate-400">セッションID</span>
              <input
                v-model="join.sessionId"
                class="w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400"
                placeholder="例: abc123"
              />
            </label>
            <label class="space-y-1 text-sm text-slate-300">
              <span class="text-xs text-slate-400">名前</span>
              <input
                v-model="join.name"
                class="w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400"
                placeholder="名前 (任意)"
              />
            </label>
          </div>
          <button
            class="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/40 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700"
            :disabled="!join.sessionId"
            @click="joinSession"
          >
            参加する
          </button>
          <p v-if="joinError" class="text-sm text-rose-400">{{ joinError }}</p>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import axios from 'axios';
import type { Session } from '@supabase/supabase-js';
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { supabase } from '../lib/supabase';

const apiBase = import.meta.env.VITE_WORKER_BASE ?? '';
const router = useRouter();

type SessionInfo = { sessionId: string; password: string };

type ParticipantInfo = { participantId: string; name: string };

const authSession = ref<Session | null>(null);
const session = reactive<SessionInfo>({ sessionId: '', password: '' });
const join = reactive({ sessionId: '', name: '' });
const loginError = ref('');
const joinError = ref('');

const user = computed(() => authSession.value?.user ?? null);
const accessToken = computed(() => authSession.value?.access_token ?? null);
const userName = computed(() => user.value?.user_metadata?.full_name ?? user.value?.email ?? '');
const userEmail = computed(() => user.value?.email ?? '');

let authSubscription: (() => void) | null = null;

onMounted(async () => {
  await refreshSession();
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    authSession.value = session;
  });
  authSubscription = () => data.subscription.unsubscribe();
});

onBeforeUnmount(() => {
  if (authSubscription) authSubscription();
});

async function refreshSession() {
  const { data, error } = await supabase.auth.getSession();
  if (!error) {
    authSession.value = data.session;
  }
}

async function signInWithGoogle() {
  loginError.value = '';
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
  if (error) {
    loginError.value = error.message ?? '認証に失敗しました';
  }
}

async function signOut() {
  await supabase.auth.signOut();
  authSession.value = null;
}

function authHeaders() {
  return accessToken.value ? { Authorization: `Bearer ${accessToken.value}` } : undefined;
}

async function createSession() {
  if (!user.value) {
    loginError.value = 'セッションを作成するにはログインが必要です。';
    return;
  }
  try {
    const res = await axios.post(
      `${apiBase}/api/sessions`,
      {
        ownerEmail: userEmail.value,
        ownerName: userName.value
      },
      { headers: authHeaders() }
    );
    session.sessionId = res.data.sessionId;
    session.password = res.data.password;
    join.sessionId = session.sessionId;
  } catch (err) {
    loginError.value = (err as Error).message ?? 'セッション作成に失敗しました';
  }
}

async function joinSession() {
  if (!join.sessionId) return;
  joinError.value = '';
  try {
    const res = await axios.post(
      `${apiBase}/api/sessions/${join.sessionId}/join`,
      { name: join.name },
      { headers: authHeaders() }
    );
    const participant: ParticipantInfo = { participantId: res.data.participantId, name: join.name || 'ゲスト' };
    localStorage.setItem(`kp-participant-${join.sessionId}`, JSON.stringify(participant));
    await router.push({ name: 'session', params: { id: join.sessionId } });
  } catch (err) {
    joinError.value = (err as Error).message ?? '参加に失敗しました';
  }
}
</script>
