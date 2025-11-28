<template>
  <div>
    <h3>チャットパレット</h3>
    <div class="palette-grid" v-for="(item, index) in localItems" :key="index">
      <input v-model="item.label" placeholder="ラベル" />
      <input v-model="item.content" placeholder="内容" />
      <button class="ghost" @click="remove(index)">削除</button>
    </div>
    <div class="actions">
      <button class="primary" @click="add">追加</button>
      <button class="ghost" @click="save">保存</button>
    </div>
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
