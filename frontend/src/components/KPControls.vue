<template>
  <div>
    <h3>KPモード</h3>
    <div class="form-grid">
      <label>パスワード<input v-model="form.password" type="password" /></label>
      <label>モード
        <select v-model="form.mode">
          <option value="system">現在時刻</option>
          <option value="manual">自由入力</option>
          <option value="quantum">量子乱数</option>
        </select>
      </label>
      <label v-if="form.mode === 'manual'">日時(ms)<input v-model.number="form.manualTime" type="number" /></label>
      <label>オフセット(ms)<input v-model.number="form.offset" type="number" /></label>
    </div>
    <div style="margin-top: 8px;">
      <label><input type="checkbox" v-model="form.confirmQuantum" /> 量子乱数で判定する</label>
    </div>
    <button class="primary" style="margin-top: 8px;" @click="submit">適用</button>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';

const emit = defineEmits<{ (e: 'apply', value: any): void }>();

const form = reactive({
  password: '',
  mode: 'system',
  manualTime: undefined as number | undefined,
  offset: 0,
  confirmQuantum: false
});

function submit() {
  if (form.mode === 'quantum' && !form.confirmQuantum) {
    if (!confirm('量子乱数で判定すると、以降の乱数は取得済みの量子乱数から消費します。続行しますか？')) {
      return;
    }
    form.confirmQuantum = true;
  }
  emit('apply', { ...form });
}
</script>
