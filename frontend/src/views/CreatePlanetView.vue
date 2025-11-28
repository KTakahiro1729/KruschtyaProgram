<template>
  <div class="page">
    <section class="panel hero">
      <div>
        <p class="eyebrow">セッション作成</p>
        <h1>Cloudflare Dice Room</h1>
        <p class="lede">
          Googleでログインし、新しいセッションを作成します。作成後に発行されるIDとパスワードを共有してください。
        </p>
      </div>
      <div class="panel compact">
        <h2>ログイン</h2>
        <p class="muted">Googleのポップアップから認証します。成功するとプロフィールが保持されます。</p>
        <GoogleLogin :callback="onGoogleLogin" ux_mode="popup" type="standard" size="large" text="signin_with" />
        <p v-if="user" class="status">ログイン済み: {{ user.name }} ({{ user.email }})</p>
        <p v-if="loginError" class="error">{{ loginError }}</p>
      </div>
    </section>

    <section class="grid single">
      <div class="panel">
        <h2>セッション作成</h2>
        <p class="muted">KPとして新しいセッションを立ち上げます。ログインしている必要があります。</p>
        <button class="primary" :disabled="!user || isCreating" @click="createSession">
          {{ isCreating ? '作成中…' : 'セッションを作成する' }}
        </button>
        <div v-if="session.sessionId" class="info">
          <p>セッションID: {{ session.sessionId }}</p>
          <p>パスワード: {{ session.password }}</p>
          <p class="muted">参加者にはセッションURLを共有してください。</p>
        <div style="margin-top: 12px;">
          <RouterLink :to="`/session/${session.sessionId}`" custom v-slot="{ navigate }">
            <button class="primary" @click="navigate">セッションに入室する</button>
          </RouterLink>
          </div>
        </div>
      </div>
    </section>
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
