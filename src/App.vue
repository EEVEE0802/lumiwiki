<script setup>
import NavBar from './components/NavBar.vue'
</script>

<template>
  <div class="app-layout">
    <NavBar />
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>
