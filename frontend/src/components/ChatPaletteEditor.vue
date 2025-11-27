<template>
  <div class="card">
    <h3>チャットパレット</h3>
    <div v-for="(item, index) in localItems" :key="index" style="display: grid; grid-template-columns: 1fr 2fr auto; gap: 8px; align-items: center; margin-bottom: 8px;">
      <input v-model="item.label" placeholder="ラベル" />
      <input v-model="item.content" placeholder="内容" />
      <button @click="remove(index)">削除</button>
    </div>
    <button @click="add">追加</button>
    <button style="margin-left: 8px" @click="save">保存</button>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue';

interface PaletteItem { label: string; content: string }

const props = defineProps<{
  modelValue: PaletteItem[];
}>();
const emit = defineEmits<{ (e: 'update:modelValue', value: PaletteItem[]): void; (e: 'save', value: PaletteItem[]): void }>();

const localItems = reactive<PaletteItem[]>([...props.modelValue]);

watch(
  () => props.modelValue,
  (val) => {
    localItems.splice(0, localItems.length, ...val);
  }
);

function add() {
  localItems.push({ label: '', content: '' });
}

function remove(index: number) {
  localItems.splice(index, 1);
}

function save() {
  emit('update:modelValue', [...localItems]);
  emit('save', [...localItems]);
}
</script>
