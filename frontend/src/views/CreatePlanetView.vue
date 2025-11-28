<template>
  <div class="min-h-[100dvh] bg-slate-900 text-slate-100 px-4 py-8">
    <div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header class="flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-800/60 p-6 shadow-xl shadow-black/30 md:flex-row md:items-center md:justify-between">
        <div>
          <p class="text-[10px] uppercase tracking-[0.2em] text-indigo-300">セッション作成</p>
          <h1 class="text-2xl font-semibold">Cloudflare Dice Room</h1>
          <p class="text-sm text-slate-400">Googleでログインし、新しいセッションを作成します。発行されたIDとパスワードを参加者と共有してください。</p>
        </div>
        <div class="rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-300">
          <p class="text-xs text-slate-500">ログイン状態</p>
          <p v-if="user" class="font-semibold">{{ user.name }} ({{ user.email }})</p>
          <p v-else class="text-slate-500">未ログイン</p>
        </div>
      </header>

      <div class="grid gap-4 md:grid-cols-2">
        <section class="rounded-2xl border border-slate-800 bg-slate-800/60 p-6 shadow-lg shadow-black/20 space-y-4">
          <h2 class="text-lg font-semibold">ログイン</h2>
          <p class="text-sm text-slate-400">Googleのポップアップから認証します。成功するとプロフィールが保持されます。</p>
          <GoogleLogin :callback="onGoogleLogin" ux_mode="popup" type="standard" size="large" text="signin_with" />
          <p v-if="loginError" class="text-sm text-rose-400">{{ loginError }}</p>
        </section>

        <section class="rounded-2xl border border-slate-800 bg-slate-800/60 p-6 shadow-lg shadow-black/20 space-y-4">
          <h2 class="text-lg font-semibold">セッション作成</h2>
          <p class="text-sm text-slate-400">KPとして新しいセッションを立ち上げます。ログインしている必要があります。</p>
          <button
            class="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-700"
            :disabled="!user || isCreating"
            @click="createSession"
          >
            {{ isCreating ? '作成中…' : 'セッションを作成する' }}
          </button>
          <div v-if="session.sessionId" class="rounded-lg border border-slate-700 bg-slate-900/40 p-4 space-y-2 text-sm">
            <p>セッションID: <span class="font-mono">{{ session.sessionId }}</span></p>
            <p>パスワード: <span class="font-mono">{{ session.password }}</span></p>
            <p class="text-slate-400">参加者にはセッションURLを共有してください。</p>
            <RouterLink :to="`/session/${session.sessionId}`" custom v-slot="{ navigate }">
              <button class="mt-2 w-full rounded-lg border border-indigo-500 px-4 py-2 text-indigo-200 transition hover:bg-indigo-500/10" @click="navigate">
                セッションに入室する
              </button>
            </RouterLink>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import axios from 'axios';
import { GoogleLogin, type CredentialResponse } from 'vue3-google-login';
import { reactive, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';

const apiBase = import.meta.env.VITE_WORKER_BASE ?? '';

type User = { id: string; email: string; name: string; created_at: number };
type SessionInfo = { sessionId: string; password: string };

const storedUser = localStorage.getItem('kp-user');
const user = ref<User | null>(storedUser ? JSON.parse(storedUser) : null);
const session = reactive<SessionInfo>({ sessionId: '', password: '' });
const loginError = ref('');
const isCreating = ref(false);

watch(
  () => user.value,
  (val) => {
    if (val) {
      localStorage.setItem('kp-user', JSON.stringify(val));
    } else {
      localStorage.removeItem('kp-user');
    }
  },
  { deep: true }
);

async function onGoogleLogin(response: CredentialResponse) {
  loginError.value = '';
  try {
    if (!response.credential) throw new Error('認証に失敗しました');
    const res = await axios.post(`${apiBase}/api/login/google`, { idToken: response.credential });
    user.value = res.data.user as User;
  } catch (err) {
    loginError.value = (err as Error).message ?? '認証に失敗しました';
  }
}

async function createSession() {
  if (!user.value || isCreating.value) return;
  isCreating.value = true;
  loginError.value = '';
  try {
    const res = await axios.post(`${apiBase}/api/sessions`, {
      ownerEmail: user.value.email,
      ownerName: user.value.name
    });
    session.sessionId = res.data.sessionId;
    session.password = res.data.password;
    localStorage.setItem(`kp-session-password-${session.sessionId}`, session.password);
  } catch (err) {
    loginError.value = (err as Error).message ?? 'セッション作成に失敗しました';
  } finally {
    isCreating.value = false;
  }
}
</script>
