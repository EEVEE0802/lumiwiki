import { ref, computed } from 'vue'
import { clearLanguageCache } from '../data'

// 语言配置
export const LANGUAGES = {
  'zh-CN': { name: '简体中文', flag: '🇨🇳' },
  'zh-TW': { name: '繁體中文', flag: '🇹🇼' },
  'en': { name: 'English', flag: '🇺🇸' },
  'ja': { name: '日本語', flag: '🇯🇵' },
  'ko': { name: '한국어', flag: '🇰🇷' },
}

// 当前语言（从 localStorage 读取或使用默认值）
const savedLang = localStorage.getItem('lumiwiki-lang') || 'zh-CN'
const currentLang = ref(savedLang)

// 切换语言
export function setLanguage(lang) {
  if (LANGUAGES[lang]) {
    currentLang.value = lang
    localStorage.setItem('lumiwiki-lang', lang)
    // 清除数据缓存
    clearLanguageCache()
    // 触发页面重新加载以应用新语言
    window.location.reload()
  }
}

// 获取当前语言
export function useLanguage() {
  return {
    currentLang: computed(() => currentLang.value),
    languages: LANGUAGES,
    setLanguage,
  }
}
