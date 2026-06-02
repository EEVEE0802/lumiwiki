<script setup>
import { ref } from 'vue'

const props = defineProps({
  keyword: {
    type: Object,
    default: null
  },
  locMap: {
    type: Object,
    required: true
  }
})

const show = defineModel('show', { type: Boolean, default: false })

function getName(key) {
  return props.locMap[key] || key || '???'
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="tooltip-overlay" @click="show = false">
      <div class="tooltip-card" @click.stop>
        <div class="tooltip-header">
          <h3>{{ keyword ? getName(keyword.Name) : '???' }}</h3>
          <button class="tooltip-close" @click="show = false">✕</button>
        </div>
        <div class="tooltip-body">
          {{ keyword ? getName(keyword.Des) : '' }}
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tooltip-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.tooltip-card {
  background: #1a1a2e;
  border: 2px solid #e94560;
  border-radius: 12px;
  padding: 20px;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.tooltip-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e94560;
}

.tooltip-header h3 {
  color: #e94560;
  font-size: 1.3em;
  margin: 0;
}

.tooltip-close {
  background: none;
  border: none;
  color: #888;
  font-size: 1.5em;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tooltip-close:hover {
  color: #e94560;
}

.tooltip-body {
  color: #e0e0e0;
  line-height: 1.6;
  font-size: 0.95em;
}
</style>
