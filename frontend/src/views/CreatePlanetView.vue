<template>
    <div class="min-h-[100dvh] bg-slate-900 text-slate-100 px-4 py-8">
        <div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
            <header
                class="flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-800/60 p-6 shadow-xl shadow-black/30 md:flex-row md:items-center md:justify-between"
            >
                <div>
                    <p
                        class="text-[10px] uppercase tracking-[0.2em] text-indigo-300"
                    >
                        セッション作成
                    </p>
                    <h1 class="text-2xl font-semibold">Cloudflare Dice Room</h1>
                    <p class="text-sm text-slate-400">
                        Googleでログインし、新しいセッションを作成します。発行されたIDとパスワードを参加者と共有してください。
                    </p>
                </div>
                <div
                    class="rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-300"
                >
                    <p class="text-xs text-slate-500">ログイン状態</p>
                    <p v-if="user" class="font-semibold">
                        {{ userName }} ({{ userEmail }})
                    </p>
                    <p v-else class="text-slate-500">未ログイン</p>
                </div>
            </header>

            <div class="grid gap-4 md:grid-cols-2">
                <section
                    class="rounded-2xl border border-slate-800 bg-slate-800/60 p-6 shadow-lg shadow-black/20 space-y-4"
                >
                    <h2 class="text-lg font-semibold">ログイン</h2>
                    <p class="text-sm text-slate-400">
                        Googleのポップアップから認証します。成功するとプロフィールが保持されます。
                    </p>
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
                    <p v-if="loginError" class="text-sm text-rose-400">
                        {{ loginError }}
                    </p>
                </section>

                <section
                    class="rounded-2xl border border-slate-800 bg-slate-800/60 p-6 shadow-lg shadow-black/20 space-y-4"
                >
                    <h2 class="text-lg font-semibold">セッション作成</h2>
                    <p class="text-sm text-slate-400">
                        KPとして新しいセッションを立ち上げます。ログインしている必要があります。
                    </p>
                    <button
                        class="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-700"
                        :disabled="!user || isCreating"
                        @click="createSession"
                    >
                        {{ isCreating ? "作成中…" : "セッションを作成する" }}
                    </button>
                    <div
                        v-if="session.sessionId"
                        class="rounded-lg border border-slate-700 bg-slate-900/40 p-4 space-y-2 text-sm"
                    >
                        <p>
                            セッションID:
                            <span class="font-mono">{{
                                session.sessionId
                            }}</span>
                        </p>
                        <p>
                            セッションID:
                            <span class="font-mono">{{
                                session.sessionId
                            }}</span>
                        </p>
                        <p class="text-slate-400">
                            参加者にはセッションURLを共有してください。
                        </p>
                        <RouterLink
                            :to="`/session/${session.sessionId}`"
                            custom
                            v-slot="{ navigate }"
                        >
                            <button
                                class="mt-2 w-full rounded-lg border border-indigo-500 px-4 py-2 text-indigo-200 transition hover:bg-indigo-500/10"
                                @click="navigate"
                            >
                                セッションに入室する
                            </button>
                        </RouterLink>
                    </div>
                </section>
            </div>

            <section
                v-if="user && mySessions.length > 0"
                class="rounded-2xl border border-slate-800 bg-slate-800/60 p-6 shadow-lg shadow-black/20 space-y-4"
            >
                <h2 class="text-lg font-semibold">作成したセッション</h2>
                <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    <div
                        v-for="s in mySessions"
                        :key="s.id"
                        class="rounded-lg border border-slate-700 bg-slate-900/40 p-4 space-y-2"
                    >
                        <h3 class="font-semibold text-indigo-300 truncate">
                            {{ s.id }}
                        </h3>
                        <p class="text-xs text-slate-500">
                            {{ new Date(s.created_at).toLocaleString() }}
                        </p>
                        <div class="flex gap-2 pt-2">
                            <RouterLink
                                :to="`/session/${s.id}`"
                                class="flex-1 rounded border border-indigo-500/50 bg-indigo-500/10 px-3 py-1 text-center text-xs text-indigo-200 hover:bg-indigo-500/20"
                                >入室</RouterLink
                            >
                            <a
                                :href="`${apiBase}/api/sessions/${s.id}/logs`"
                                target="_blank"
                                class="flex-1 rounded border border-slate-600 bg-slate-800 px-3 py-1 text-center text-xs text-slate-300 hover:bg-slate-700"
                                >ログDL</a
                            >
                        </div>
                    </div>
                </div>
            </section>
        </div>
    </div>
</template>

<script setup lang="ts">
import axios from "axios";
import type { Session } from "@supabase/supabase-js";
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { RouterLink } from "vue-router";
import { supabase } from "../lib/supabase";

const apiBase = import.meta.env.VITE_WORKER_BASE ?? "";

type SessionInfo = { sessionId: string; password: string };

const authSession = ref<Session | null>(null);
const session = reactive<SessionInfo>({ sessionId: "", password: "" });
const mySessions = ref<any[]>([]);
const loginError = ref("");
const isCreating = ref(false);

const user = computed(() => authSession.value?.user ?? null);
const accessToken = computed(() => authSession.value?.access_token ?? null);
const userName = computed(
    () => user.value?.user_metadata?.full_name ?? user.value?.email ?? ""
);
const userEmail = computed(() => user.value?.email ?? "");

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
        if (data.session) fetchMySessions();
    }
}

async function signInWithGoogle() {
    loginError.value = "";
    const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.href },
    });
    if (error) {
        loginError.value = error.message ?? "認証に失敗しました";
    }
}

async function signOut() {
    await supabase.auth.signOut();
    authSession.value = null;
}

function authHeaders() {
    return accessToken.value
        ? { Authorization: `Bearer ${accessToken.value}` }
        : undefined;
}

async function createSession() {
    if (!user.value || isCreating.value) return;
    isCreating.value = true;
    loginError.value = "";
    try {
        const res = await axios.post(
            `${apiBase}/api/sessions`,
            {
                ownerEmail: userEmail.value,
                ownerName: userName.value,
            },
            { headers: authHeaders() }
        );
        session.sessionId = res.data.sessionId;
        session.password = res.data.password;
        localStorage.setItem(
            `kp-session-password-${session.sessionId}`,
            session.password
        );
        fetchMySessions();
    } catch (err) {
        loginError.value =
            (err as Error).message ?? "セッション作成に失敗しました";
    } finally {
        isCreating.value = false;
    }
}

async function fetchMySessions() {
    if (!user.value) return;
    try {
        const res = await axios.get(`${apiBase}/api/sessions/mine`, {
            headers: authHeaders(),
        });
        mySessions.value = res.data.sessions;
    } catch (err) {
        console.error("Failed to fetch sessions", err);
    }
}
</script>
