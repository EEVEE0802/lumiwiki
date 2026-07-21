import { ref, onMounted, onUnmounted } from 'vue'
import DOMPurify from 'dompurify'
import { loadData, getKeywordMap } from '../data'

// 配置 DOMPurify：限制 onclick 只允许 window.showKeyword(数字) 格式
// 防止 v-html 渲染时被注入任意 JS（即使 replacePlaceholders 输出被污染也安全）
let domPurifyConfigured = false
function ensureDomPurifyConfigured() {
  if (domPurifyConfigured) return
  domPurifyConfigured = true
  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName === 'onclick') {
      if (!/^window\.showKeyword\(\d+\)$/.test(data.attrValue)) {
        data.keepAttr = false
      }
    }
  })
}

/**
 * 战斗文本格式化（buff/技能描述共用）
 *
 * 处理 5 种占位符：
 *   1. [Battle_Target_Self]  → 多语言 key 引用，从 locMap 查找
 *   2. {0} {1}               → 数值参数，从 desParam 数组替换
 *   3. <link=24>暴击</link>  → 关键字链接（可点击，调用 window.showKeyword(id) 弹 tooltip）
 *   4. <color=red>文字</color> → 颜色标签转 span style
 *   5. 残留 </link> 等        → 清理
 *
 * 最终输出经 DOMPurify 净化，仅允许 <span> + style/onclick 属性，
 * 且 onclick 必须匹配 window.showKeyword(N) 严格格式。
 *
 * @param {Ref<object>} locMapRef - 多语言映射的 ref（locMap.value 是 key→文案对象）
 */
export function useBattleText(locMapRef) {
  const keywordMap = ref([])
  const selectedKeyword = ref(null)
  const showKeywordTooltip = ref(false)

  function replacePlaceholders(text, desParam = []) {
    if (!text) return ''
    const loc = locMapRef.value || {}
    let result = text
    // 1. [xxx] 多语言引用
    result = result.replace(/\[([^\]]+)\]/g, (_, key) => loc[key] || key)
    // 2. {N} 参数
    if (desParam && desParam.length) {
      result = result.replace(/\{(\d+)\}/g, (_, index) => {
        const v = desParam[parseInt(index)]
        return v !== undefined ? v : _
      })
    }
    // 3. <link=N><color=xxx>文字</color></link> → 可点击 span
    result = result.replace(/<link=(\d+)><color=([^>]+)>([^<]+)<\/color><\/link>/gi,
      (_, linkId, color, content) =>
        `<span class="keyword-link" style="color: ${color}; text-decoration: underline; cursor: pointer;" onclick="window.showKeyword(${linkId})">${content}</span>`
    )
    // 4. 独立 <color=xxx>
    result = result.replace(/<color=([^>]+)>/gi, '<span style="color: $1">')
    result = result.replace(/<\/color>/gi, '</span>')
    // 5. 残留 link 标签
    result = result.replace(/<\/?link=\d+>/gi, '')

    // 6. DOMPurify 净化：仅允许 span + style/onclick，且 onclick 必须是 window.showKeyword(N)
    ensureDomPurifyConfigured()
    return DOMPurify.sanitize(result, {
      ALLOWED_TAGS: ['span'],
      ALLOWED_ATTR: ['style', 'onclick', 'class'],
    })
  }

  // 加载关键字表 + 注册全局点击回调
  let mounted = false
  onMounted(async () => {
    if (mounted) return
    mounted = true
    keywordMap.value = await getKeywordMap()
    window.showKeyword = (id) => {
      const kw = keywordMap.value.find(k => k.Id === parseInt(id))
      if (kw) {
        selectedKeyword.value = kw
        showKeywordTooltip.value = true
      }
    }
  })

  onUnmounted(() => {
    if (window.showKeyword && mounted) {
      delete window.showKeyword
    }
  })

  return {
    keywordMap,
    selectedKeyword,
    showKeywordTooltip,
    replacePlaceholders
  }
}
