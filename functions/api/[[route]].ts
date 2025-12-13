import { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
    createClient,
    type SupabaseClient,
    type User,
} from "@supabase/supabase-js";

export type Env = {
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
    SUPABASE_SERVICE_ROLE_KEY: string;
};

const Q_RANDOM_ENDPOINT =
    "https://qrandom.io/api/integers?length=512&min=1&max=100";

class RubyRandom {
    private static readonly N = 624;
    private static readonly M = 397;
    private static readonly MATRIX_A = 0x9908b0df;
    private static readonly UPPER_MASK = 0x80000000;
    private static readonly LOWER_MASK = 0x7fffffff;
    private mt: number[] = new Array(RubyRandom.N).fill(0);
    private mti = RubyRandom.N + 1;

    constructor(seed: number) {
        this.initGenRand(seed);
    }

    private initGenRand(s: number) {
        this.mt[0] = s >>> 0;
        for (let i = 1; i < RubyRandom.N; i++) {
            const prev = this.mt[i - 1];
            this.mt[i] = (1812433253 * (prev ^ (prev >>> 30)) + i) >>> 0;
        }
        this.mti = RubyRandom.N;
    }

    private genRandInt32(): number {
        if (this.mti >= RubyRandom.N) {
            for (let k = 0; k < RubyRandom.N; k++) {
                const y =
                    (this.mt[k] & RubyRandom.UPPER_MASK) |
                    (this.mt[(k + 1) % RubyRandom.N] & RubyRandom.LOWER_MASK);
                this.mt[k] =
                    this.mt[(k + RubyRandom.M) % RubyRandom.N] ^
                    (y >>> 1) ^
                    (y & 1 ? RubyRandom.MATRIX_A : 0);
            }
            this.mti = 0;
        }

        let y = this.mt[this.mti];
        this.mti += 1;

        y ^= y >>> 11;
        y ^= (y << 7) & 0x9d2c5680;
        y ^= (y << 15) & 0xefc60000;
        y ^= y >>> 18;
        return y >>> 0;
    }

    random(): number {
        const a = this.genRandInt32() >>> 5;
        const b = this.genRandInt32() >>> 6;
        return (a * 67108864 + b) / 9007199254740992.0;
    }

    private makeMask(limit: number): number {
        return (1 << limit.toString(2).length) - 1;
    }

    private limitedRand(limit: number): number {
        const mask = this.makeMask(limit);
        const chunks = Math.ceil(mask.toString(2).length / 32);
        while (true) {
            let v = 0;
            for (let i = 0; i < chunks; i++) {
                v |= this.genRandInt32() << (32 * i);
            }
            v &= mask;
            if (v <= limit) {
                return v;
            }
        }
    }

    rand(n?: number): number {
        if (n === undefined) return this.random();
        if (typeof n === "number" && n > 0) {
            return this.limitedRand(n - 1);
        }
        return 0;
    }
}

const app = new Hono<{ Bindings: Env }>();
app.use("*", cors());

const nowMs = () => Date.now();
const uuid = () => crypto.randomUUID();
const toIso = (ts: number) => new Date(ts).toISOString();

function createSupabaseClient(url: string, key: string, token?: string) {
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    return createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers },
    });
}

function createAdminClient(env: Env) {
    return createSupabaseClient(
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
    );
}

function getBearerToken(req: Request) {
    const authHeader =
        req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!authHeader) return null;
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : null;
}

async function getUserContext(c: Context<{ Bindings: Env }>) {
    const token = getBearerToken(c.req.raw);
    const adminClient = createAdminClient(c.env);

    if (!token) {
        const userClient = createSupabaseClient(
            c.env.SUPABASE_URL,
            c.env.SUPABASE_ANON_KEY
        );
        return { userClient, adminClient, user: null as User | null } as const;
    }

    const userClient = createSupabaseClient(
        c.env.SUPABASE_URL,
        c.env.SUPABASE_ANON_KEY,
        token
    );
    const { data, error } = await userClient.auth.getUser();
    if (error || !data.user)
        return { response: c.json({ error: "Unauthorized" }, 401) } as const;
    return { userClient, adminClient, user: data.user } as const;
}

type SessionState = {
    mode: string;
    game_time_elapsed: number;
    last_resumed_at: number | null;
};

function normalizeSessionState(row: Record<string, unknown>): SessionState {
    const parseTimestamp = (value: unknown) => {
        if (value === null || value === undefined) return null;
        if (typeof value === "number") return value;
        if (typeof value === "string") {
            const parsed = Date.parse(value);
            return Number.isNaN(parsed) ? null : parsed;
        }
        return null;
    };
    return {
        mode: String(row.mode ?? "system"),
        game_time_elapsed: Number(row.game_time_elapsed ?? 0),
        last_resumed_at: parseTimestamp(row.last_resumed_at),
    };
}

function computeGameTime(state: SessionState, reference = nowMs()) {
    if (state.last_resumed_at === null) return state.game_time_elapsed;
    return state.game_time_elapsed + (reference - state.last_resumed_at);
}

async function fetchQuantumNumbers(): Promise<number[] | null> {
    try {
        const res = await fetch(Q_RANDOM_ENDPOINT);
        if (!res.ok) return null;
        const json = await res.json();
        if (Array.isArray(json?.data)) {
            const numbers: number[] = json.data
                .map((v: unknown) =>
                    typeof v === "number" ? Math.abs(Math.floor(v)) : null
                )
                .filter((v: number | null): v is number => v !== null)
                .slice(0, 512);
            if (numbers.length >= 512) return numbers;
        }
        return null;
    } catch (err) {
        console.error("Quantum fetch failed", (err as Error).message);
        return null;
    }
}

function fallbackCryptoNumbers(count = 512): number[] {
    return Array.from(
        { length: count },
        () => (crypto.getRandomValues(new Uint32Array(1))[0] % 100) + 1
    );
}

async function ensureUserRecord(client: SupabaseClient, user: User) {
    const now = nowMs();
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const payload = {
        id: user.id,
        email: user.email ?? "",
        name:
            (meta.name as string | undefined) ??
            (meta.full_name as string | undefined) ??
            user.email ??
            "Unknown",
        created_at: toIso(now),
    };
    const { error } = await client
        .from("profiles")
        .upsert(payload, { onConflict: "id" });
    if (error) throw new Error("Failed to sync user");
    return payload;
}

async function removeOldSessions(
    client: SupabaseClient,
    adminClient: SupabaseClient,
    ownerId: string
) {
    const { data, error } = await client
        .from("sessions")
        .select("id")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: true });
    if (error || !data) throw new Error("Failed to query sessions");
    if (data.length < 10) return;
    const toRemove = data.slice(0, data.length - 9).map((row) => row.id);
    if (toRemove.length === 0) return;

    await adminClient.from("chat_messages").delete().in("session_id", toRemove);
    await adminClient
        .from("quantum_numbers")
        .delete()
        .in("session_id", toRemove);
    await adminClient.from("sessions").delete().in("id", toRemove);
}

async function storeQuantumBatch(
    client: SupabaseClient,
    sessionId: string,
    numbers: number[]
) {
    const rows = numbers.map((value) => ({
        session_id: sessionId,
        value,
        consumed: false,
    }));
    const { error } = await client.from("quantum_numbers").insert(rows);
    if (error) throw new Error("Failed to store quantum numbers");
    const ts = nowMs();
    await client
        .from("sessions")
        .update({ last_updated: toIso(ts) })
        .eq("id", sessionId);
}

async function nextQuantumNumber(
    client: SupabaseClient,
    sessionId: string
): Promise<number | null> {
    const { data, error } = await client
        .from("quantum_numbers")
        .select("id, value")
        .eq("session_id", sessionId)
        .eq("consumed", false)
        .order("id", { ascending: true })
        .limit(1);
    if (error) throw new Error("Failed to query quantum numbers");
    const next = data?.[0];
    if (!next) return null;
    const { error: updateError } = await client
        .from("quantum_numbers")
        .update({ consumed: true })
        .eq("id", next.id);
    if (updateError) throw new Error("Failed to consume quantum number");
    return Number(next.value);
}

async function getSessionState(
    client: SupabaseClient,
    sessionId: string
): Promise<SessionState | null> {
    const { data, error } = await client
        .from("sessions")
        .select("mode, game_time_elapsed, last_resumed_at")
        .eq("id", sessionId)
        .maybeSingle();
    if (error) throw new Error("Failed to fetch session state");
    if (!data) return null;
    return normalizeSessionState(data as Record<string, unknown>);
}

async function pauseSession(
    client: SupabaseClient,
    sessionId: string,
    now = nowMs()
) {
    const state = await getSessionState(client, sessionId);
    if (!state) throw new Error("Session not found");
    if (state.last_resumed_at === null) return state;
    const updatedElapsed =
        state.game_time_elapsed + (now - state.last_resumed_at);
    const { error } = await client
        .from("sessions")
        .update({
            game_time_elapsed: updatedElapsed,
            last_resumed_at: null,
            last_updated: toIso(now),
        })
        .eq("id", sessionId);
    if (error) throw new Error("Failed to pause session");
    return {
        ...state,
        game_time_elapsed: updatedElapsed,
        last_resumed_at: null,
    } satisfies SessionState;
}

async function resumeSession(
    client: SupabaseClient,
    sessionId: string,
    now = nowMs()
) {
    const state = await getSessionState(client, sessionId);
    if (!state) throw new Error("Session not found");
    if (state.last_resumed_at !== null) return state;
    const { error } = await client
        .from("sessions")
        .update({ last_resumed_at: now, last_updated: toIso(now) })
        .eq("id", sessionId);
    if (error) throw new Error("Failed to resume session");
    return { ...state, last_resumed_at: now } satisfies SessionState;
}

async function setGameTime(
    client: SupabaseClient,
    sessionId: string,
    gameTime: number,
    now = nowMs()
) {
    const state = await getSessionState(client, sessionId);
    if (!state) throw new Error("Session not found");
    const { error } = await client
        .from("sessions")
        .update({
            game_time_elapsed: gameTime,
            last_resumed_at: null,
            last_updated: toIso(now),
        })
        .eq("id", sessionId);
    if (error) throw new Error("Failed to set game time");
    return {
        ...state,
        game_time_elapsed: gameTime,
        last_resumed_at: null,
    } satisfies SessionState;
}

function parseDiceCommand(text: string) {
    const trimmed = text.trim();
    const ccMatch = /^CC\s*([+-]?\d+)?\s*<=\s*(\d+)/i.exec(trimmed);
    if (ccMatch) {
        const bonus = parseInt(ccMatch[1] ?? "0", 10) || 0;
        const target = parseInt(ccMatch[2], 10);
        return { type: "cc", bonus, target } as const;
    }
    const oneMatch = /^1d(\d+)/i.exec(trimmed);
    if (oneMatch) {
        const faces = parseInt(oneMatch[1], 10);
        return { type: "die", faces } as const;
    }
    return { type: "chat" as const };
}

function ccResultLevel(value: number, target: number) {
    if (value === 1) return "critical";
    const fumble = target < 50 ? value >= 96 : value === 100;
    if (fumble) return "fumble";
    if (value <= Math.floor(target / 5)) return "extreme";
    if (value <= Math.floor(target / 2)) return "hard";
    if (value <= target) return "regular";
    return "failure";
}

async function rollCC(
    rng: () => Promise<number>,
    bonus: number,
    target: number
) {
    const tens: number[] = [];
    for (let i = 0; i < Math.abs(bonus) + 2; i++) {
        tens.push(Math.floor((await rng()) * 10));
    }
    const one = tens[tens.length - 1];
    const dice = tens.map((t) => t * 10 + one).map((d) => (d === 0 ? 100 : d));
    const value = bonus < 0 ? Math.max(...dice) : Math.min(...dice);
    const result_level = ccResultLevel(value, target);
    const success = ["critical", "extreme", "hard", "regular"].includes(
        result_level
    );
    return { value, success, target, dice, result_level };
}

async function rollDie(rng: () => Promise<number>, faces: number) {
    const results: number[] = [];
    for (let i = 0; i < 1; i++) {
        results.push(Math.floor((await rng()) * faces) + 1);
    }
    return results;
}

async function getRng(
    client: SupabaseClient,
    sessionId: string,
    mode: string,
    gameTimeMs: number
) {
    if (mode === "quantum") {
        return async () => {
            const q = await nextQuantumNumber(client, sessionId);
            if (q !== null) return (q % 100) / 100;
            const fallback =
                crypto.getRandomValues(new Uint32Array(1))[0] % 100;
            return fallback / 100;
        };
    }
    const baseSeed = Math.floor(gameTimeMs / 1000);
    const rng = new RubyRandom(baseSeed);
    return async () => rng.rand(100) / 100;
}

async function handleMessage(
    userClient: SupabaseClient,
    adminClient: SupabaseClient,
    sessionId: string,
    speakerName: string,
    raw: string
) {
    // [LOG] 処理開始
    console.log(
        `[handleMessage] Start: sessionId=${sessionId}, speaker=${speakerName}, raw="${raw}"`
    );

    // ★前回のパッチ適用済み前提: session取得は adminClient
    const session = await getSessionState(adminClient, sessionId);
    if (!session) {
        console.error(`[handleMessage] Session not found: ${sessionId}`);
        throw new Error("Session not found");
    }

    const mode = session.mode;
    const gameTime = computeGameTime(session);
    // [LOG] セッション状態
    console.log(
        `[handleMessage] Session State: mode=${mode}, gameTime=${gameTime}`
    );

    const rng = await getRng(adminClient, sessionId, mode, gameTime);
    const parsed = parseDiceCommand(raw.split(" ")[0]);

    // [LOG] コマンド解析結果
    console.log(`[handleMessage] Parsed Command:`, JSON.stringify(parsed));

    let rendered = raw;
    let result: Record<string, unknown> | null = null;
    let messageType: "chat" | "dice" = "chat";

    try {
        if (parsed.type === "cc") {
            console.log(`[handleMessage] Rolling CC...`);
            const roll = await rollCC(rng, parsed.bonus, parsed.target);
            rendered = `CC<=${parsed.target} (${roll.value}) ${
                roll.success ? "SUCCESS" : "FAILURE"
            }`;
            result = roll;
            messageType = "dice";
            console.log(`[handleMessage] CC Result:`, JSON.stringify(result));
        } else if (parsed.type === "die") {
            console.log(`[handleMessage] Rolling Die...`);
            const roll = await rollDie(rng, parsed.faces);
            rendered = `1d${parsed.faces}: ${roll.join(", ")}`;
            result = { rolls: roll };
            messageType = "dice";
            console.log(`[handleMessage] Die Result:`, JSON.stringify(result));
        } else {
            console.log(`[handleMessage] Treating as normal chat`);
        }
    } catch (err) {
        console.error(`[handleMessage] Error during dice roll:`, err);
        throw err;
    }

    const ts = nowMs();
    const id = uuid();

    // [LOG] DB保存開始
    console.log(`[handleMessage] Inserting message to DB... ID=${id}`);

    // ★前回のパッチ適用済み前提: insertは userClient (RLSポリシーで許可)
    const { error } = await userClient.from("chat_messages").insert({
        id,
        session_id: sessionId,
        speaker_name: speakerName || "名無しさん",
        raw_text: raw,
        rendered_text: rendered,
        result_json: result ? JSON.stringify(result) : null,
        created_at: toIso(ts),
        type: messageType,
    });

    if (error) {
        console.error(
            `[handleMessage] DB Insert Error:`,
            error.message,
            error.details
        );
        throw new Error("Failed to store message");
    }

    console.log(`[handleMessage] Success.`);
    return {
        id,
        rendered_text: rendered,
        created_at: ts,
        raw_text: raw,
        speaker_name: speakerName || "名無しさん",
    };
}

const createSessionSchema = z.object({});
const messageSchema = z.object({
    speakerName: z.string().optional(),
    text: z.string().min(1, "text is required"),
});
const kpSchema = z.object({
    password: z.string().min(1),
    mode: z.string().optional(),
    setTime: z.number().optional(),
    action: z.enum(["pause", "resume"]).optional(),
    confirmQuantum: z.boolean().optional(),
});

// メッセージ受信APIエンドポイント部分
app.post(
    "/api/sessions/:id/messages",
    zValidator("json", messageSchema),
    async (c) => {
        const sessionId = c.req.param("id");
        console.log(`[API] POST messages called. SessionID=${sessionId}`); // [LOG]

        const auth = await getUserContext(c);
        if ("response" in auth) {
            console.warn(
                `[API] Auth check failed or returned response directly.`
            ); // [LOG]
            return auth.response;
        }

        const { userClient, adminClient } = auth;
        const { speakerName, text } = c.req.valid("json");

        console.log(`[API] Payload: speaker="${speakerName}", text="${text}"`); // [LOG]

        try {
            const message = await handleMessage(
                userClient,
                adminClient,
                sessionId,
                speakerName ?? "名無しさん",
                text
            );
            console.log(`[API] Response 200 OK`); // [LOG]
            return c.json({ message });
        } catch (err) {
            console.error(`[API] Error 400:`, err); // [LOG]
            return c.json({ error: (err as Error).message }, 400);
        }
    }
);

app.get("/api/sessions/:id/info", async (c) => {
    const { adminClient } = await getUserContext(c);
    const sessionId = c.req.param("id");
    const { data, error } = await adminClient
        .from("sessions")
        .select("password, mode, game_time_elapsed, last_resumed_at")
        .eq("id", sessionId)
        .maybeSingle();
    if (error) return c.json({ error: "Session lookup failed" }, 500);
    if (!data || typeof data.password !== "string")
        return c.json({ error: "Session not found" }, 404);

    const msgBuffer = new TextEncoder().encode(data.password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    const state = normalizeSessionState(data as Record<string, unknown>);
    const gameTime = computeGameTime(state);

    return c.json({
        passwordHash: hashHex,
        state: { ...state, gameTime, running: state.last_resumed_at !== null },
    });
});

app.post(
    "/api/sessions/:id/messages",
    zValidator("json", messageSchema),
    async (c) => {
        const auth = await getUserContext(c);
        if ("response" in auth) return auth.response;
        const { userClient, adminClient } = auth;
        const sessionId = c.req.param("id");
        const { speakerName, text } = c.req.valid("json");
        try {
            const message = await handleMessage(
                userClient,
                adminClient,
                sessionId,
                speakerName ?? "名無しさん",
                text
            );
            return c.json({ message });
        } catch (err) {
            return c.json({ error: (err as Error).message }, 400);
        }
    }
);

app.post("/api/sessions/:id/kp", zValidator("json", kpSchema), async (c) => {
    const auth = await getUserContext(c);
    if ("response" in auth) return auth.response;
    const { adminClient } = auth;
    const sessionId = c.req.param("id");
    const { password, mode, setTime, action, confirmQuantum } =
        c.req.valid("json");
    const { data, error } = await adminClient
        .from("sessions")
        .select("password")
        .eq("id", sessionId)
        .maybeSingle();
    if (error) return c.json({ error: "Session lookup failed" }, 500);
    if (!data) return c.json({ error: "Session not found" }, 404);
    if (data.password !== password) return c.json({ error: "Forbidden" }, 403);
    if (mode === "quantum" && !confirmQuantum) {
        return c.json({ error: "Quantum mode requires confirmation" }, 400);
    }

    const now = nowMs();
    let state = await getSessionState(adminClient, sessionId);
    if (!state) return c.json({ error: "Session not found" }, 404);
    const desiredMode = typeof mode === "string" ? mode : state.mode;

    try {
        if (typeof setTime === "number" && !Number.isNaN(setTime)) {
            state = await setGameTime(adminClient, sessionId, setTime, now);
        }

        if (action === "pause") {
            state = await pauseSession(adminClient, sessionId, now);
        } else if (action === "resume") {
            state = await resumeSession(adminClient, sessionId, now);
        }

        const { error: updateError } = await adminClient
            .from("sessions")
            .update({ mode: desiredMode ?? "system", last_updated: toIso(now) })
            .eq("id", sessionId);
        if (updateError) throw new Error("Failed to update session");
    } catch (err) {
        return c.json({ error: (err as Error).message }, 500);
    }

    state = (await getSessionState(adminClient, sessionId)) ?? state;
    const gameTime = computeGameTime(state);

    return c.json({
        ok: true,
        state: { ...state, mode: desiredMode, gameTime },
    });
});

app.get("/api/sessions/:id/logs", async (c) => {
    const auth = await getUserContext(c);
    if ("response" in auth) return auth.response;
    const { userClient } = auth;
    const sessionId = c.req.param("id");
    const { data, error } = await userClient
        .from("chat_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
    if (error) return c.json({ error: "Failed to fetch logs" }, 500);
    const payload = JSON.stringify(data ?? [], null, 2);
    return new Response(payload, {
        headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="session-${sessionId}.json"`,
        },
    });
});

export const onRequest = async (context: {
    request: Request;
    env: Env;
    context: unknown;
}) => app.fetch(context.request, context.env, context);
export { app };
