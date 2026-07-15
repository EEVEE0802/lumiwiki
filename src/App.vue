<script setup>
import NavBar from './components/NavBar.vue'
import FeedbackButton from './components/FeedbackButton.vue'
</script>

<template>
  <div class="app-layout">
    <NavBar />
    <main class="main-content">
      <router-view />
    </main>
    <FeedbackButton />
  </div>
</template>
