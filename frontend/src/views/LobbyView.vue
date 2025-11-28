<template>
  <div class="page">
    <section class="panel hero">
      <div>
        <p class="eyebrow">クラウドで遊ぶダイス卓</p>
        <h1>Cloudflare Dice Room</h1>
        <p class="lede">
          Googleでログインし、セッションを作成または参加してください。作成したセッションはロビーからすぐに入室できます。
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

    <section class="grid">
      <div class="panel">
        <h2>セッション作成</h2>
        <p class="muted">KPとして新しいセッションを立ち上げます。ログインしている必要があります。</p>
        <button class="primary" :disabled="!user" @click="createSession">セッションを作成する</button>
        <div v-if="session.sessionId" class="info">
          <p>セッションID: {{ session.sessionId }}</p>
          <p>パスワード: {{ session.password }}</p>
          <p class="muted">セッション作成後はロビーの参加フォームから入室できます。</p>
        </div>
      </div>

      <div class="panel">
        <h2>セッション参加</h2>
        <p class="muted">セッションIDと名前を入力し、入室します。参加後はプレイ画面へ移動します。</p>
        <div class="form-grid">
          <label>
            <span>セッションID</span>
            <input v-model="join.sessionId" placeholder="例: abc123" />
          </label>
          <label>
            <span>名前</span>
            <input v-model="join.name" placeholder="名前 (任意)" />
          </label>
        </div>
        <button class="primary" :disabled="!join.sessionId" @click="joinSession">参加する</button>
        <p v-if="joinError" class="error">{{ joinError }}</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import axios from 'axios';
import { GoogleLogin, type CredentialResponse } from 'vue3-google-login';
import { reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

const apiBase = import.meta.env.VITE_WORKER_BASE ?? '';
const router = useRouter();

type User = { id: string; email: string; name: string; created_at: number };
type SessionInfo = { sessionId: string; password: string };

type ParticipantInfo = { participantId: string; name: string };

const storedUser = localStorage.getItem('kp-user');
const user = ref<User | null>(storedUser ? JSON.parse(storedUser) : null);
const session = reactive<SessionInfo>({ sessionId: '', password: '' });
const join = reactive({ sessionId: '', name: '' });
const loginError = ref('');
const joinError = ref('');

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
  if (!user.value) return;
  try {
    const res = await axios.post(`${apiBase}/api/sessions`, {
      ownerEmail: user.value.email,
      ownerName: user.value.name
    });
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
    const res = await axios.post(`${apiBase}/api/sessions/${join.sessionId}/join`, { name: join.name });
    const participant: ParticipantInfo = { participantId: res.data.participantId, name: join.name || 'ゲスト' };
    localStorage.setItem(`kp-participant-${join.sessionId}`, JSON.stringify(participant));
    await router.push({ name: 'session', params: { id: join.sessionId } });
  } catch (err) {
    joinError.value = (err as Error).message ?? '参加に失敗しました';
  }
}
</script>
