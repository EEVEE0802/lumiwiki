<template>
  <div class="online-data">
    <div class="page-header">
      <h1>📊 线上数据</h1>
      <p class="subtitle">{{ subtitleText }}</p>
      <p class="update-time" v-if="!noData && gameMode !== 'participation'">数据更新时间: {{ formatTime(data.updateTime) }}</p>
      <p class="update-time" v-else-if="gameMode === 'participation' && participationUpdateTime">数据更新时间: {{ formatTime(participationUpdateTime) }}</p>
    </div>

    <!-- 对内模式下的提示条：线上数据只有对外，不受版本切换影响 -->
    <div v-if="isInternal" class="external-data-notice">
      ⚠️ 当前应用切换为「对内版」，但线上数据（天梯 / 周赛 / 参与走势）只来源于对外正式服，与版本切换无关。
    </div>

    <!-- 区域切换：国内 / 海外 -->
    <div class="region-selector">
      <button
        v-for="(cfg, key) in regions"
        :key="key"
        :class="['region-btn', { active: currentRegion === key }]"
        @click="switchRegion(key)"
      >
        {{ cfg.icon }} {{ cfg.label }}
      </button>
    </div>

    <!-- 玩法切换 -->
    <div class="game-mode-selector">
      <button
        :class="['mode-btn', { active: gameMode === 'ladder' }]"
        @click="switchGameMode('ladder')"
      >
        🏔️ 天梯
      </button>
      <button
        :class="['mode-btn', { active: gameMode === 'tournament' }]"
        @click="switchGameMode('tournament')"
      >
        🏆 周赛
      </button>
      <button
        :class="['mode-btn', { active: gameMode === 'infinityGym' }]"
        @click="switchGameMode('infinityGym')"
      >
        ⚔️ 无限道馆
      </button>
      <button
        :class="['mode-btn', { active: gameMode === 'participation' }]"
        @click="switchGameMode('participation')"
      >
        📈 参与走势
      </button>
    </div>

    <!-- 参与走势独立视图 -->
    <div v-if="gameMode === 'participation'" class="participation-view">
      <div v-if="!participationAllData.size" class="no-data-box">
        <p>😅 暂无参与走势数据</p>
        <p class="no-data-desc">请等待每日 03:00 定时任务生成数据</p>
      </div>
      <template v-else>
        <div class="participation-date-picker">
          <label>
            <span class="date-label">开始日期</span>
            <input
              type="date"
              v-model="participationStartDate"
              :min="allDatesMin"
              :max="participationEndDate || allDatesMax"
            >
          </label>
          <span class="date-sep">~</span>
          <label>
            <span class="date-label">结束日期</span>
            <input
              type="date"
              v-model="participationEndDate"
              :min="participationStartDate || allDatesMin"
              :max="allDatesMax"
            >
          </label>
          <span class="date-range-hint">共 {{ filteredParticipationDates.length }} 天</span>
        </div>

        <div class="participation-view-mode" v-if="hasRetentionData">
          <span class="view-mode-label">统计口径</span>
          <button :class="['view-mode-btn', { active: !participationRetention }]" @click="participationRetention = false">全量</button>
          <button :class="['view-mode-btn', { active: participationRetention }]" @click="participationRetention = true">留存（创号≥7天）</button>
        </div>

        <div v-if="!filteredParticipationDates.length" class="no-data-box">
          <p>😅 所选日期范围无数据</p>
          <p class="no-data-desc">请调整日期范围（可选：{{ allDatesMin }} ~ {{ allDatesMax }}）</p>
        </div>

        <div v-else class="participation-section">
          <div class="participation-chart-block">
            <h3>每日参与玩家数走势</h3>
            <p class="chart-subtitle">登录 / 天梯 / 周赛 / 无限道馆 / 公会战的独立玩家数（去重）</p>
            <div class="chart-wrapper" style="min-height: 320px">
              <canvas ref="participationCountCanvas"></canvas>
            </div>
          </div>

          <div class="participation-chart-block">
            <h3>每日参与占比走势</h3>
            <p class="chart-subtitle">天梯 / 周赛 / 无限道馆 / 公会战参与玩家数 ÷ 当日登录玩家数</p>
            <div class="chart-wrapper" style="min-height: 320px">
              <canvas ref="participationRateCanvas"></canvas>
            </div>
          </div>

          <div class="participation-chart-block">
            <h3>平均每人参与场次走势</h3>
            <p class="chart-subtitle">各玩法每个参与玩家当天的平均对战场次（含人机场）</p>
            <div class="chart-wrapper" style="min-height: 320px">
              <canvas ref="participationBpuCanvas"></canvas>
            </div>
          </div>

          <!-- 玩法重合率（4 圆文氏图 + 单日数字表） -->
          <div v-if="hasOverlapData" class="participation-chart-block">
            <h3>玩法重合率</h3>
            <p class="chart-subtitle">
              选中日期登录玩家中，参与「天梯 / 周赛 / 无限道馆 / 公会战」这四种玩法的重合情况
              <span v-if="participationRetention" style="color: #764ba2;">（当前口径：留存玩家）</span>
            </p>
            <div class="overlap-day-picker">
              <label>选择日期：</label>
              <select v-model="overlapDate" class="overlap-date-select">
                <option v-for="d in availableOverlapDates" :key="d" :value="d">{{ d }}</option>
              </select>
              <span class="overlap-day-summary" v-if="currentOverlap">
                当日登录 <b>{{ formatNumber(currentOverlapLoginBase) }}</b> 人
              </span>
            </div>
            <div v-if="currentOverlap" class="overlap-body">
              <!-- 左：文氏图 -->
              <div class="venn-container" v-html="vennSvg"></div>
              <!-- 右：数字表 -->
              <div class="overlap-table-wrap">
                <table class="overlap-table">
                  <thead>
                    <tr>
                      <th>参与组合</th>
                      <th>人数</th>
                      <th>占登录 %</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in overlapRows" :key="row.key" :class="{ 'is-all': row.key === 'ltgw' }">
                      <td>
                        <span class="overlap-color-dot" :style="{ background: row.color }"></span>
                        {{ row.label }}
                      </td>
                      <td class="num">{{ formatNumber(row.count) }}</td>
                      <td class="num">{{ row.pct }}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div v-else class="overlap-empty">该日期暂无重合率数据</div>
          </div>
          <div v-else class="participation-chart-block overlap-empty-block">
            <h3>玩法重合率</h3>
            <p class="chart-subtitle">该数据周尚未生成重合率信息（需下一次每小时任务更新）</p>
          </div>

          <!-- 周重合率（按周合并去重，看整周内玩法组合分布） -->
          <div v-if="hasWeekOverlapData" class="participation-chart-block">
            <h3>周重合率（整周合并去重）</h3>
            <p class="chart-subtitle">
              选中周内至少登录一次的玩家中，参与「天梯 / 周赛 / 无限道馆 / 公会战」这四种玩法的重合情况；跨天玩过多次的玩家算一次
              <span v-if="participationRetention" style="color: #764ba2;">（当前口径：留存玩家）</span>
            </p>
            <div class="overlap-day-picker">
              <label>选择周次：</label>
              <select v-model="selectedOverlapWeek" class="overlap-date-select">
                <option v-for="w in availableOverlapWeeks" :key="w" :value="w">第 {{ w }} 周</option>
              </select>
              <span class="overlap-day-summary" v-if="currentWeekOverlap">
                整周登录 <b>{{ formatNumber(currentWeekLoginBase) }}</b> 人（去重）
              </span>
            </div>
            <div v-if="currentWeekOverlap" class="overlap-body">
              <div class="venn-container" v-html="weekVennSvg"></div>
              <div class="overlap-table-wrap">
                <table class="overlap-table">
                  <thead>
                    <tr>
                      <th>参与组合</th>
                      <th>整周人数</th>
                      <th>占登录 %</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in weekOverlapRows" :key="row.key" :class="{ 'is-all': row.key === 'ltgw' }">
                      <td>
                        <span class="overlap-color-dot" :style="{ background: row.color }"></span>
                        {{ row.label }}
                      </td>
                      <td class="num">{{ formatNumber(row.count) }}</td>
                      <td class="num">{{ row.pct }}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div v-else class="overlap-empty">该周暂无重合率数据</div>
          </div>
        </div>
      </template>
    </div>

    <!-- 周选择器（仅天梯 / 周赛） -->
    <div v-if="gameMode === 'ladder' || gameMode === 'tournament'" class="week-selector">
      <div class="week-tabs">
        <button
          v-for="week in availableWeeks"
          :key="week.value"
          :class="['week-tab', { active: selectedWeek === week.value }]"
          @click="selectWeek(week.value)"
        >
          {{ week.label }}
        </button>
      </div>

      <div class="compare-mode">
        <label class="compare-toggle">
          <input type="checkbox" v-model="compareMode" @change="onCompareModeChange">
          <span>对比模式</span>
        </label>

        <select v-if="compareMode" v-model="compareWeek" class="compare-select" @change="loadCompareData">
          <option v-for="week in availableWeeks" :key="'cmp-' + week.value" :value="week.value" :disabled="week.value === selectedWeek">
            对比第{{ week.value }}周
          </option>
        </select>
      </div>
    </div>

    <template v-if="gameMode === 'ladder' || gameMode === 'tournament'">
    <!-- 空状态：该周无数据（如首周无周赛） -->
    <div v-if="noData" class="empty-state">
      <p class="empty-icon">📭</p>
      <p class="empty-text">该周暂无{{ gameMode === 'tournament' ? '周赛' : '天梯' }}数据</p>
    </div>

    <!-- 数据展示区（无数据时整体隐藏） -->
    <template v-else>
      <!-- 筛选器（仅天梯显示） -->
      <div class="filters" v-if="gameMode === 'ladder'">
      <div class="filter-group">
        <label>段位范围:</label>
        <MultiSelect
          v-model="selectedRankGroup"
          :options="rankOptions"
          placeholder="全段位"
          @update:modelValue="updateData"
        />
      </div>

      <div class="filter-group">
        <label>是否包含人机:</label>
        <select v-model="includeBot" @change="updateData">
          <option :value="true">包含人机</option>
          <option :value="false">不含人机</option>
        </select>
      </div>
    </div>

    <!-- 周赛说明 -->
    <div class="tournament-info" v-if="gameMode === 'tournament'">
      <p>🏆 周赛是每周开放一次的高端对战玩法，仅限真人玩家参与</p>
    </div>

    <!-- 统计概览 -->
    <div class="stats-overview" v-if="currentStats">
      <div class="stat-card">
        <div class="stat-label">总战斗场次</div>
        <div class="stat-value">{{ formatNumber(currentStats.totalBattles) }}</div>
        <div v-if="compareMode && compareStats" class="stat-change" :class="getChangeClass(getBattleChange())">
          {{ formatChange(getBattleChange()) }}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">段位范围</div>
        <div class="stat-value">{{ currentStats.rankRange.min }}-{{ currentStats.rankRange.max }}段</div>
      </div>
      <div v-if="compareMode && compareStats" class="stat-card compare-info">
        <div class="stat-label">对比</div>
        <div class="stat-value small">第{{ compareWeek }}周</div>
      </div>
    </div>

    <!-- 排行榜切换 -->
    <div class="tabs">
      <button
        :class="['tab', { active: activeTab === 'appearance' }]"
        @click="activeTab = 'appearance'"
      >
        📈 出场率榜
      </button>
      <button
        :class="['tab', { active: activeTab === 'winRate' }]"
        @click="activeTab = 'winRate'"
      >
        🏆 胜率榜
      </button>
      <button
        :class="['tab', { active: activeTab === 'teams' }]"
        @click="activeTab = 'teams'"
      >
        👥 队伍列表
      </button>
      <button
        :class="['tab', { active: activeTab === 'chart' }]"
        @click="activeTab = 'chart'"
      >
        👤 玩家分布
      </button>
    </div>

    <!-- 排行榜内容 -->
    <div class="rankings">
      <!-- 出场率榜 -->
      <div v-if="activeTab === 'appearance'" class="ranking-list">
        <table>
          <thead>
            <tr>
              <th>排名</th>
              <th>噜咪</th>
              <th>出场次数</th>
              <th v-if="compareMode && compareStats">变化</th>
              <th>出场率</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in currentAppearanceData" :key="item.lumiId" class="ranking-item" @click="goToLumi(item.lumiId)">
              <td class="rank">{{ index + 1 }}</td>
              <td class="lumi-info">
                <img :src="getLumiAvatar(item.lumiId)" :alt="item.lumiName" class="lumi-avatar" @error="handleImageError">
                <span class="lumi-name">{{ item.lumiName }}</span>
              </td>
              <td class="battles">{{ formatNumber(item.uniqueBattles) }}</td>
              <td v-if="compareMode && compareStats" class="change-cell">
                <span v-if="getAppearanceChange(item.lumiId)" class="change-badge" :class="getChangeClass(getAppearanceChange(item.lumiId))">
                  {{ formatChange(getAppearanceChange(item.lumiId)) }}
                </span>
              </td>
              <td class="rate appearance-rate">{{ item.appearanceRate }}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 胜率榜 -->
      <div v-if="activeTab === 'winRate'" class="ranking-list">
        <div class="sort-options">
          <span>排序方式：</span>
          <button
            :class="['sort-btn', { active: winRateSortBy === 'winRate' }]"
            @click="winRateSortBy = 'winRate'"
          >
            按胜率
          </button>
          <button
            :class="['sort-btn', { active: winRateSortBy === 'battles' }]"
            @click="winRateSortBy = 'battles'"
          >
            按场次
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>排名</th>
              <th>噜咪</th>
              <th>战斗场次</th>
              <th>胜场</th>
              <th v-if="compareMode && compareStats">胜率变化</th>
              <th>胜率</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in currentWinRateData" :key="item.lumiId" class="ranking-item" @click="goToLumi(item.lumiId)">
              <td class="rank">{{ index + 1 }}</td>
              <td class="lumi-info">
                <img :src="getLumiAvatar(item.lumiId)" :alt="item.lumiName" class="lumi-avatar" @error="handleImageError">
                <span class="lumi-name">{{ item.lumiName }}</span>
              </td>
              <td class="battles">{{ formatNumber(item.battles) }}</td>
              <td class="wins">{{ formatNumber(item.wins) }}</td>
              <td v-if="compareMode && compareStats" class="change-cell">
                <span v-if="getWinRateChange(item.lumiId) !== null" class="change-badge" :class="getChangeClass(getWinRateChange(item.lumiId))">
                  {{ formatChange(getWinRateChange(item.lumiId)) }}
                </span>
              </td>
              <td class="rate" :class="getWinRateClass(item.winRate)">{{ item.winRate }}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 队伍列表 -->
      <div v-if="activeTab === 'teams'" class="teams-list">
        <div class="teams-toolbar">
          <span class="teams-count">显示前 {{ highRankTeams.length }} / {{ allTeams.length }} 个队伍</span>
          <button class="download-teams-btn" @click="downloadTeamsCSV" :disabled="!allTeams.length">
            📥 下载完整阵容（CSV）
          </button>
        </div>
        <div v-if="highRankTeams && highRankTeams.length > 0">
          <table>
            <thead>
              <tr>
                <th>排名</th>
                <th>队伍</th>
                <th>使用次数</th>
                <th>胜场</th>
                <th>胜率</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(team, index) in highRankTeams" :key="team.teamLumiIds.join('-')" class="team-item">
                <td class="rank">{{ index + 1 }}</td>
                <td class="team-info">
                  <div class="team-lumis">
                    <div
                      v-for="lumi in team.lumis"
                      :key="lumi.lumiId"
                      class="team-lumi"
                      @click="goToLumi(lumi.lumiId)"
                    >
                      <div class="team-lumi-header">
                        <img :src="getLumiAvatar(lumi.lumiId)" :alt="lumi.lumiName" class="team-lumi-avatar" @error="handleImageError">
                        <span class="team-lumi-name">{{ lumi.lumiName }}</span>
                      </div>
                      <div class="team-lumi-skills" v-if="getTopSecondSkills(lumi, team.battles).length">
                        <div
                          v-for="ss in getTopSecondSkills(lumi, team.battles)"
                          :key="ss.skillId"
                          class="skill-row"
                          :class="{ 'skill-none': ss.isNone }"
                        >
                          <span v-if="ss.isNone" class="skill-icon-placeholder">—</span>
                          <img
                            v-else
                            :src="skillIconUrl(ss.meta?.icon)"
                            :alt="ss.meta?.name || ''"
                            class="skill-icon"
                            @error="handleSkillIconError"
                          >
                          <span class="skill-name">{{ ss.meta?.name || `技能#${ss.skillId}` }}</span>
                          <span class="skill-rate">{{ ss.rate }}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="team-trainer" v-if="getTopTrainerSkills(team, team.battles).length">
                    <span class="trainer-label">训练家</span>
                    <div class="trainer-list">
                      <div
                        v-for="ts in getTopTrainerSkills(team, team.battles)"
                        :key="ts.trainerId"
                        class="trainer-row"
                        :class="{ 'trainer-none': ts.isNone }"
                      >
                        <span v-if="ts.isNone" class="trainer-icon-placeholder">—</span>
                        <img
                          v-else
                          :src="skillIconUrl(ts.meta?.icon)"
                          :alt="ts.meta?.name || ''"
                          class="trainer-icon"
                          @error="handleSkillIconError"
                        >
                        <span class="trainer-name">{{ ts.meta?.name || `训练家#${ts.trainerId}` }}</span>
                        <span class="trainer-rate">{{ ts.rate }}%</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td class="battles">{{ formatNumber(team.battles) }}</td>
                <td class="wins">{{ formatNumber(team.wins) }}</td>
                <td class="rate" :class="getWinRateClass(team.winRate)">{{ team.winRate }}%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="no-data">
          <p>暂无队伍数据</p>
        </div>
      </div>

      <!-- 玩家分布图 -->
      <div v-if="activeTab === 'chart'" class="chart-container">
        <!-- 天梯模式：段位分布 -->
        <template v-if="gameMode === 'ladder'">
          <div class="chart-header">
            <h3>玩家段位分布</h3>
            <p class="chart-subtitle">各段位玩家数量统计</p>
          </div>
          <div class="distribution-stats">
            <div v-for="rank in rankGroups" :key="rank.key" class="stat-card" :class="rank.key">
              <div class="stat-icon">{{ rank.icon }}</div>
              <div class="stat-info">
                <div class="stat-label">{{ rank.label }}</div>
                <div class="stat-desc">{{ rank.desc }}</div>
                <div class="stat-value">{{ formatNumber(playerDistribution[rank.key]) }}</div>
                <div class="stat-percent">{{ getDistributionPercent(rank.key) }}%</div>
                <div v-if="compareMode && comparePlayerDistribution" class="stat-change" :class="getChangeClass(getDistributionChange(rank.key))">
                  {{ formatChange(getDistributionChange(rank.key)) }}
                </div>
              </div>
            </div>
            <!-- 总人数 -->
            <div class="stat-card total-card">
              <div class="stat-icon">👥</div>
              <div class="stat-info">
                <div class="stat-label">总玩家数</div>
                <div class="stat-value">{{ formatNumber(playerDistribution.total) }}</div>
              </div>
            </div>
          </div>
        </template>

        <!-- 周赛模式：胜场分布 / 天梯段位分布 -->
        <template v-if="gameMode === 'tournament'">
          <div class="chart-header">
            <div class="chart-title-row">
              <div>
                <h3>{{ tournamentChartMode === 'wins' ? '玩家胜场分布' : '玩家天梯段位分布' }}</h3>
                <p class="chart-subtitle">{{ tournamentChartMode === 'wins' ? '各胜场玩家数量统计（3负出局，最高15胜）' : '参与周赛玩家的天梯最高段位统计' }}</p>
              </div>
              <div class="chart-mode-toggle">
                <button
                  :class="['chart-mode-btn', { active: tournamentChartMode === 'wins' }]"
                  @click="tournamentChartMode = 'wins'"
                >
                  🏆 胜场分布
                </button>
                <button
                  :class="['chart-mode-btn', { active: tournamentChartMode === 'ladder-rank' }]"
                  @click="tournamentChartMode = 'ladder-rank'"
                >
                  🏔️ 天梯段位
                </button>
              </div>
            </div>
          </div>

          <!-- 胜场分布 -->
          <div v-if="tournamentChartMode === 'wins'" class="distribution-stats tournament-stats">
            <div v-for="wins in getWinDistributionRange()" :key="wins" class="stat-card win-card" :class="getWinClass(wins)">
              <div class="stat-icon">{{ getWinIcon(wins) }}</div>
              <div class="stat-info">
                <div class="stat-label">{{ wins }}胜</div>
                <div class="stat-value">{{ formatNumber(tournamentWinDistribution[wins] || 0) }}</div>
                <div class="stat-percent">{{ getTournamentDistributionPercent(wins) }}%</div>
              </div>
            </div>
            <!-- 总人数 -->
            <div class="stat-card total-card">
              <div class="stat-icon">👥</div>
              <div class="stat-info">
                <div class="stat-label">总玩家数</div>
                <div class="stat-value">{{ formatNumber(tournamentTotalPlayers) }}</div>
              </div>
            </div>
          </div>

          <!-- 天梯段位分布 -->
          <div v-if="tournamentChartMode === 'ladder-rank'" class="distribution-stats">
            <div v-if="tournamentPlayerRankDistribution.total > 0">
              <div v-for="rank in rankGroups" :key="rank.key" class="stat-card" :class="rank.key">
                <div class="stat-icon">{{ rank.icon }}</div>
                <div class="stat-info">
                  <div class="stat-label">{{ rank.label }}</div>
                  <div class="stat-desc">{{ rank.desc }}</div>
                  <div class="stat-value">{{ formatNumber(tournamentPlayerRankDistribution[rank.key]) }}</div>
                  <div class="stat-percent">{{ getTournamentRankDistributionPercent(rank.key) }}%</div>
                </div>
              </div>
              <!-- 总人数 -->
              <div class="stat-card total-card">
                <div class="stat-icon">👥</div>
                <div class="stat-info">
                  <div class="stat-label">总玩家数</div>
                  <div class="stat-desc">有天梯段位数据</div>
                  <div class="stat-value">{{ formatNumber(tournamentPlayerRankDistribution.total) }}</div>
                </div>
              </div>
            </div>
            <div v-else class="no-data-box">
              <p>😅 暂无数据</p>
              <p class="no-data-desc">周赛数据的玩家ID与天梯数据无法匹配（科学计数法精度丢失问题）</p>
            </div>
          </div>
        </template>

        <div class="chart-wrapper" ref="chartWrapper">
          <canvas ref="chartCanvas"></canvas>
        </div>
      </div>
    </div>
    </template>
    </template>

    <!-- 无限道馆独立视图 -->
    <div v-if="gameMode === 'infinityGym'" class="infinity-gym-view">
      <div v-if="!gymData" class="no-data-box">
        <p>😅 无限道馆数据加载中或尚未生成</p>
        <p class="no-data-desc">请等待每小时任务生成数据</p>
      </div>
      <template v-else>
        <!-- 顶部概览 -->
        <div class="gym-overview">
          <div class="gym-stat-card">
            <div class="gym-stat-value">{{ formatNumber(gymData.totalChallengers) }}</div>
            <div class="gym-stat-label">总挑战玩家数</div>
          </div>
          <div class="gym-stat-card">
            <div class="gym-stat-value">{{ formatNumber(gymData.totalBattles) }}</div>
            <div class="gym-stat-label">总战斗场次</div>
          </div>
          <div class="gym-stat-card">
            <div class="gym-stat-value">{{ gymData.floors.length }}</div>
            <div class="gym-stat-label">已被挑战层数</div>
          </div>
          <div class="gym-stat-card">
            <div class="gym-stat-value">{{ maxFloorReached }}</div>
            <div class="gym-stat-label">最高层数</div>
          </div>
        </div>

        <!-- 层数分布图 -->
        <div class="gym-chart-block">
          <h3>玩家最高层数分布</h3>
          <p class="chart-subtitle">每个玩家历史挑战过的最高层（含胜负）</p>
          <div class="chart-wrapper" style="min-height: 320px">
            <canvas ref="gymFloorDistCanvas"></canvas>
          </div>
        </div>

        <!-- 全局噜咪出场率 -->
        <div class="gym-chart-block">
          <h3>玩家阵容中噜咪出场率 Top 30</h3>
          <p class="chart-subtitle">所有无限道馆战斗（含胜负）中，玩家阵容里出现最多的噜咪</p>
          <div class="gym-lumi-grid">
            <div
              v-for="l in gymData.globalLumiUsage.slice(0, 30)"
              :key="l.lumiId"
              class="gym-lumi-item"
              @click="goToLumi(l.lumiId)"
            >
              <img :src="avatarUrl(l.lumiId)" :alt="l.lumiName" @error="handleAvatarError" class="gym-lumi-avatar" />
              <div class="gym-lumi-name">{{ l.lumiName }}</div>
              <div class="gym-lumi-rate">{{ l.appearanceRate }}%</div>
              <div class="gym-lumi-count">{{ formatNumber(l.battles) }} 场</div>
            </div>
          </div>
        </div>

        <!-- 关卡列表（按 10 层分组，外层只显示卡点关的数据，展开查看组内各层） -->
        <div class="gym-floors-block">
          <div class="gym-floors-header">
            <h3>关卡数据（共 {{ gymData.floors.length }} 层有玩家挑战）</h3>
            <div class="gym-jump">
              <label>跳转到第
                <input type="number" v-model.number="gymJumpFloor" min="1" :max="maxFloorReached" @keyup.enter="jumpToFloor">
                层
              </label>
              <button class="gym-jump-btn" @click="jumpToFloor">跳转</button>
            </div>
          </div>
          <div class="gym-floor-list">
            <div
              v-for="group in gymFloorGroups"
              :key="group.key"
              :ref="el => registerGroupRef(group.key, el)"
              :class="['gym-group-card', { expanded: expandedGroups.has(group.key) }]"
            >
              <!-- 组主行：卡点关数据 -->
              <div class="gym-group-summary" @click="toggleGroup(group.key)">
                <div class="gym-floor-num">
                  第 {{ group.key }} 层
                  <span class="gym-group-badge">🎯 卡点关</span>
                </div>
                <div class="gym-floor-metrics" v-if="group.boss">
                  <span>挑战 <b>{{ formatNumber(group.boss.totalBattles) }}</b></span>
                  <span>通过率 <b>{{ group.boss.winRate }}%</b></span>
                  <span>通过玩家 <b>{{ formatNumber(group.boss.uniqueClearers) }}</b></span>
                  <span>通过玩家平均挑战次数 <b>{{ group.boss.avgAttempts }}</b></span>
                </div>
                <div class="gym-floor-metrics gym-floor-empty" v-else>
                  <span>暂无玩家挑战到本层</span>
                </div>
                <div class="gym-floor-toggle">{{ expandedGroups.has(group.key) ? '▲' : '▼' }}</div>
              </div>
              <!-- 组展开：显示组内所有已被挑战的层（含卡点关本身） -->
              <div v-if="expandedGroups.has(group.key)" class="gym-group-children">
                <div
                  v-for="floor in group.floors"
                  :key="floor.floor"
                  :ref="el => registerFloorRef(floor.floor, el)"
                  :class="['gym-floor-card', 'gym-floor-card-inner', { expanded: expandedFloors.has(floor.floor), 'is-boss': floor.floor === group.key }]"
                >
                  <div class="gym-floor-summary" @click="toggleFloor(floor.floor)">
                    <div class="gym-floor-num">第 {{ floor.floor }} 层</div>
                    <div class="gym-floor-metrics">
                      <span>挑战 <b>{{ formatNumber(floor.totalBattles) }}</b></span>
                      <span>通过率 <b>{{ floor.winRate }}%</b></span>
                      <span>通过玩家 <b>{{ formatNumber(floor.uniqueClearers) }}</b></span>
                      <span>通过玩家平均挑战次数 <b>{{ floor.avgAttempts }}</b></span>
                    </div>
                    <div class="gym-floor-toggle">{{ expandedFloors.has(floor.floor) ? '▲' : '▼' }}</div>
                  </div>
                  <div v-if="expandedFloors.has(floor.floor)" class="gym-floor-detail">
                    <!-- NPC 阵容 -->
                    <div class="gym-team-section">
                      <h4>🤖 道馆 NPC 阵容</h4>
                      <div class="gym-team-row">
                        <div v-for="lumi in floor.npcTeam" :key="'npc-' + lumi.lumiId" class="gym-team-lumi" @click="goToLumi(lumi.lumiId)">
                          <img :src="avatarUrl(lumi.lumiId)" :alt="lumi.lumiName" @error="handleAvatarError" class="gym-team-avatar" />
                          <div class="gym-team-name">{{ lumi.lumiName }}</div>
                          <div class="gym-team-info">Lv.{{ lumi.level }}<span v-if="lumi.breakthrough"> · 突破{{ lumi.breakthrough }}</span></div>
                          <div class="gym-team-info" v-if="lumi.score">评分 {{ lumi.score }}</div>
                        </div>
                      </div>
                    </div>
                    <!-- 玩家通关阵容 top 3 -->
                    <div class="gym-team-section">
                      <h4>🏆 通关玩家阵容 Top 3</h4>
                      <div v-if="!floor.topTeams.length" class="gym-empty-hint">暂无通关玩家阵容数据</div>
                      <div v-else class="gym-teams-list">
                        <div v-for="(team, idx) in floor.topTeams.slice(0, 3)" :key="idx" class="gym-player-team">
                          <div class="gym-team-rank">#{{ idx + 1 }}</div>
                          <div class="gym-team-row">
                            <div v-for="lumi in team.lumis" :key="'p-' + lumi.lumiId" class="gym-team-lumi" @click="goToLumi(lumi.lumiId)">
                              <img :src="avatarUrl(lumi.lumiId)" :alt="lumi.lumiName" @error="handleAvatarError" class="gym-team-avatar" />
                              <div class="gym-team-name">{{ lumi.lumiName }}</div>
                              <div v-if="gymTopSkill(lumi)" class="gym-team-info gym-team-skill">
                                <img v-if="gymTopSkill(lumi).icon" :src="skillIconUrl(gymTopSkill(lumi).icon)" class="gym-skill-icon" @error="e => e.target.style.display='none'" />
                                <span>{{ gymTopSkill(lumi).name }}</span>
                              </div>
                            </div>
                          </div>
                          <div class="gym-team-stats">
                            <span>{{ team.battles }} 次通关</span>
                            <span v-if="gymTopTrainer(team)">
                              训练家：<img v-if="gymTopTrainer(team).icon" :src="skillIconUrl(gymTopTrainer(team).icon)" class="gym-skill-icon" @error="e => e.target.style.display='none'" />{{ gymTopTrainer(team).name }}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import MultiSelect from '../components/MultiSelect.vue'
import { loadData as loadGameData, tSync } from '../data'
import { avatarUrl, skillIconUrl, handleAvatarError } from '../data/imageUrl'
import { useVersion } from '../composables/useVersion'
import { useRegion } from '../composables/useRegion'

const { isInternal } = useVersion()
const { currentRegion, regions, setRegion } = useRegion()

const router = useRouter()

// 第二技能元数据：skillId → { name, icon }
const skillMeta = ref(new Map())
const trainerSkillMeta = ref(new Map())

// 段位配置
const rankGroups = [
  { key: 'bronze', label: '青铜', desc: '1-30 段', icon: '🥉' },
  { key: 'silver', label: '白银', desc: '31-60 段', icon: '🥈' },
  { key: 'gold', label: '黄金', desc: '61-90 段', icon: '🥇' },
  { key: 'diamond', label: '钻石', desc: '91-120 段', icon: '💎' },
  { key: 'star', label: '星耀', desc: '121-150 段', icon: '⭐' },
  { key: 'legend', label: '传说', desc: '151 段', icon: '👑' }
]

// 段位多选选项（给 MultiSelect 用）
const rankOptions = rankGroups.map(r => ({
  value: r.key,
  label: `${r.label} (${r.desc})`
}))

// 合并多个段位的统计数据
function mergeStatsObjects(statsArray) {
  if (!statsArray.length) return null
  if (statsArray.length === 1) return statsArray[0]
  const validStats = statsArray.filter(Boolean)
  if (!validStats.length) return null
  if (validStats.length === 1) return validStats[0]

  // 合并总场次
  const totalBattles = Math.round(validStats.reduce((sum, s) => sum + (s.totalBattles || 0), 0))

  // 合并段位范围
  const rankRange = {
    min: Math.min(...validStats.map(s => s.rankRange?.min || 0)),
    max: Math.max(...validStats.map(s => s.rankRange?.max || 0))
  }

  // 合并出场率数据
  const appearanceMap = new Map()
  for (const stats of validStats) {
    for (const item of (stats.appearance || [])) {
      const existing = appearanceMap.get(item.lumiId)
      if (existing) {
        existing.uniqueBattles += item.uniqueBattles
      } else {
        appearanceMap.set(item.lumiId, { ...item })
      }
    }
  }
  const appearance = [...appearanceMap.values()]
    .map(item => ({
      ...item,
      uniqueBattles: Math.round(item.uniqueBattles),
      appearanceRate: totalBattles > 0 ? (item.uniqueBattles / totalBattles * 100).toFixed(2) : '0'
    }))
    .sort((a, b) => b.uniqueBattles - a.uniqueBattles)

  // 合并胜率数据（加权平均）
  const winRateMap = new Map()
  for (const stats of validStats) {
    for (const item of (stats.winRate || [])) {
      const existing = winRateMap.get(item.lumiId)
      if (existing) {
        existing.wins += parseFloat(item.winRate) / 100 * item.battles
        existing.battles += item.battles
      } else {
        winRateMap.set(item.lumiId, {
          ...item,
          wins: parseFloat(item.winRate) / 100 * item.battles
        })
      }
    }
  }
  const winRate = [...winRateMap.values()]
    .map(item => {
      const battles = Math.round(item.battles)
      const wins = Math.round(item.wins)
      return {
        ...item,
        battles,
        wins,
        winRate: battles > 0 ? (wins / battles * 100).toFixed(2) : '0'
      }
    })
    .sort((a, b) => parseFloat(b.winRate) - parseFloat(a.winRate))

  return { totalBattles, rankRange, appearance, winRate }
}

// 数据状态
const data = ref({
  updateTime: '',
  totalBattles: 0,
  rankGroups: [],
  stats: {},
  playerRankDistribution: {
    bronze: 0,
    silver: 0,
    gold: 0,
    diamond: 0,
    star: 0,
    legend: 0,
    total: 0
  }
})

const compareData = ref(null)

// 玩法选择
const gameMode = ref('ladder') // ladder | tournament | infinityGym | participation

// 周选择
const availableWeeks = ref([])
const selectedWeek = ref(1)
const compareMode = ref(false)
const compareWeek = ref(null)

// UI 状态
const selectedRankGroup = ref([])
const includeBot = ref(true)
const activeTab = ref('appearance')
const winRateSortBy = ref('winRate')
const tournamentChartMode = ref('wins') // wins | ladder-rank
const noData = ref(false) // 该周数据加载失败时置 true（如首周无周赛）

// 无限道馆状态
const gymData = ref(null)
const expandedFloors = ref(new Set())
const expandedGroups = ref(new Set())
const gymJumpFloor = ref(1)
const gymFloorRefs = new Map()
const gymGroupRefs = new Map()
const gymFloorDistCanvas = ref(null)
let gymFloorDistChart = null

// 关卡按 10 层为一组分组（1~10 → "第 10 层" 组，11~20 → "第 20 层" 组，依此类推）
// 组主行显示"卡点关"（10 倍数层）本身的数据；展开后显示组内所有已被挑战的层
const gymFloorGroups = computed(() => {
  if (!gymData.value) return []
  const groups = new Map()
  for (const floor of gymData.value.floors) {
    const key = Math.ceil(floor.floor / 10) * 10
    if (!groups.has(key)) groups.set(key, { key, floors: [], boss: null })
    const g = groups.get(key)
    g.floors.push(floor)
    if (floor.floor === key) g.boss = floor
  }
  const result = [...groups.values()]
  result.sort((a, b) => b.key - a.key)
  for (const g of result) g.floors.sort((a, b) => b.floor - a.floor)
  return result
})

// 图表相关
const chartCanvas = ref(null)
const chartWrapper = ref(null)
let chartInstance = null

// 参与走势相关（跨周合并）
const participationAllData = ref(new Map()) // date -> { ladder, tournament, login, ladderRate, tournamentRate }
const participationWeekOverlaps = ref(new Map()) // week 号 -> { weekOverlap, weekLoginBase, retentionWeekOverlap, retentionWeekLoginBase }
const participationUpdateTime = ref('')
const participationStartDate = ref('')
const participationEndDate = ref('')
const participationCountCanvas = ref(null)
const participationRateCanvas = ref(null)
const participationBpuCanvas = ref(null)
let participationCountChart = null
let participationRateChart = null
let participationBpuChart = null
const participationRetention = ref(false) // false=全量, true=留存玩家（创号≥7天）
const selectedOverlapWeek = ref(null) // 周重合率的当前选中周次（默认最近一周）

// 当前统计数据（支持多段位合并）
const currentStats = computed(() => {
  const keys = getDataKeys()
  if (keys.length === 1) {
    return data.value.stats[keys[0]]
  }
  const statsArray = keys.map(k => data.value.stats[k]).filter(Boolean)
  return mergeStatsObjects(statsArray)
})

// 对比统计数据（支持多段位合并）
const compareStats = computed(() => {
  if (!compareData.value || !compareMode.value) return null
  const keys = getDataKeys()
  if (keys.length === 1) {
    return compareData.value.stats[keys[0]]
  }
  const statsArray = keys.map(k => compareData.value.stats[k]).filter(Boolean)
  return mergeStatsObjects(statsArray)
})

// 当前出场率数据
const currentAppearanceData = computed(() => {
  return currentStats.value?.appearance || []
})

// 当前胜率数据
const currentWinRateData = computed(() => {
  const data = currentStats.value?.winRate || []
  if (winRateSortBy.value === 'battles') {
    return [...data].sort((a, b) => b.battles - a.battles)
  }
  return data
})

// 队伍数据（根据选中段位和人机筛选合并，按 battles 降序，含全部队伍）
const allTeams = computed(() => {
  if (gameMode.value === 'tournament') {
    return (data.value.popularTeams || []).map(t => ({
      ...t,
      winRate: ((t.wins / t.battles) * 100).toFixed(2)
    }))
  }
  const keys = getDataKeys()
  const merged = new Map()
  keys.forEach(key => {
    const teams = data.value.stats?.[key]?.teams || []
    teams.forEach(team => {
      // 防御性排序：用排序后的 teamLumiIds 作为合并 key，避免后端规范化失效时同组合不同顺序被当成不同队伍
      const id = [...team.teamLumiIds].sort().join('-')
      if (!merged.has(id)) {
        // 用 Map 累加 secondSkills 计数（跨段位合并）
        merged.set(id, {
          teamLumiIds: [...team.teamLumiIds].sort(),
          lumis: (team.lumis || []).map(l => ({
            lumiId: l.lumiId,
            lumiName: l.lumiName,
            secondSkillsMap: new Map()
          })),
          trainerSkillsMap: new Map(),
          battles: 0,
          wins: 0
        })
      }
      const existing = merged.get(id)
      existing.battles += team.battles
      existing.wins += team.wins
      // 按 index 对齐累加每只噜咪的第二技能计数
      ;(team.lumis || []).forEach((lumi, idx) => {
        const target = existing.lumis[idx]
        if (!target) return
        ;(lumi.secondSkills || []).forEach(ss => {
          target.secondSkillsMap.set(ss.skillId, (target.secondSkillsMap.get(ss.skillId) || 0) + ss.count)
        })
      })
      // 累加训练家技能计数
      ;(team.trainerSkills || []).forEach(ts => {
        existing.trainerSkillsMap.set(ts.trainerId, (existing.trainerSkillsMap.get(ts.trainerId) || 0) + ts.count)
      })
    })
  })
  return Array.from(merged.values())
    .sort((a, b) => b.battles - a.battles)
    .map(team => ({
      teamLumiIds: team.teamLumiIds,
      lumis: team.lumis.map(l => ({
        lumiId: l.lumiId,
        lumiName: l.lumiName,
        secondSkills: Array.from(l.secondSkillsMap.entries())
          .map(([skillId, count]) => ({ skillId, count }))
          .sort((a, b) => b.count - a.count)
      })),
      trainerSkills: Array.from(team.trainerSkillsMap.entries())
        .map(([trainerId, count]) => ({ trainerId, count }))
        .sort((a, b) => b.count - a.count),
      battles: team.battles,
      wins: team.wins,
      winRate: ((team.wins / team.battles) * 100).toFixed(2)
    }))
})

// 展示用：仅取前 50
const highRankTeams = computed(() => allTeams.value.slice(0, 50))

// 下载全部队伍（按当前筛选）为 CSV
function downloadTeamsCSV() {
  const teams = allTeams.value
  if (!teams.length) return

  const formatTop3 = (lumi, teamBattles) => {
    return getTopSecondSkills(lumi, teamBattles)
      .map(ss => {
        const name = ss.isNone ? '未携带' : (ss.meta?.name || `技能#${ss.skillId}`)
        return `${name} ${ss.rate}%`
      })
      .join('; ')
  }

  const header = [
    'rank',
    'lumi1_id', 'lumi1_name', 'lumi1_top3_skills',
    'lumi2_id', 'lumi2_name', 'lumi2_top3_skills',
    'lumi3_id', 'lumi3_name', 'lumi3_top3_skills',
    'battles', 'wins', 'winRate'
  ]
  const rows = teams.map((t, i) => {
    const lumis = t.lumis || []
    const row = [i + 1]
    for (let k = 0; k < 3; k++) {
      const l = lumis[k]
      if (l) {
        row.push(l.lumiId, l.lumiName, formatTop3(l, t.battles))
      } else {
        row.push('', '', '')
      }
    }
    row.push(t.battles, t.wins, t.winRate)
    return row
  })

  const escape = v => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [header.join(','), ...rows.map(r => r.map(escape).join(','))].join('\n')

  const mode = gameMode.value === 'tournament' ? 'tournament' : `ladder-${getDataKey()}`
  const filename = `${mode}-week${selectedWeek.value}-teams.csv`
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// 玩家段位分布
const playerDistribution = computed(() => {
  return data.value.playerRankDistribution || {
    bronze: 0,
    silver: 0,
    gold: 0,
    diamond: 0,
    star: 0,
    legend: 0,
    total: 0
  }
})

// 对比玩家分布
const comparePlayerDistribution = computed(() => {
  if (!compareData.value || !compareMode.value) return null
  return compareData.value.playerRankDistribution
})

// 周赛胜场分布
const tournamentWinDistribution = computed(() => {
  return data.value.winDistribution || {}
})

// 周赛总玩家数
const tournamentTotalPlayers = computed(() => {
  return data.value.totalPlayers || 0
})

// 周赛玩家天梯段位分布
const tournamentPlayerRankDistribution = computed(() => {
  return data.value.tournamentPlayerRankDistribution || {
    bronze: 0,
    silver: 0,
    gold: 0,
    diamond: 0,
    star: 0,
    legend: 0,
    total: 0
  }
})

// 获取数据键（支持多选段位）
function getDataKeys() {
  if (gameMode.value === 'tournament') {
    return ['all']
  }
  const botPart = includeBot.value ? 'with-bot' : 'no-bot'
  if (!selectedRankGroup.value.length) {
    return [`all-${botPart}`]
  }
  return selectedRankGroup.value.map(r => `${r}-${botPart}`)
}

// 获取单个数据键（用于兼容旧逻辑）
function getDataKey() {
  const keys = getDataKeys()
  return keys[0]
}

// 切换玩法
function switchGameMode(mode) {
  gameMode.value = mode
  // 切换玩法时重置对比模式
  compareMode.value = false
  compareData.value = null
  if (mode === 'ladder' || mode === 'tournament') {
    loadData()
  } else if (mode === 'infinityGym') {
    loadGymData()
  }
  // participation 由 watch(gameMode) 触发图表刷新
}

// 切换区域（国内 / 海外）
async function switchRegion(region) {
  if (currentRegion.value === region) return
  setRegion(region)
  // 重置对比 + 重新加载
  compareMode.value = false
  compareData.value = null
  await loadAvailableWeeks()
  if (gameMode.value === 'participation') {
    await loadAllParticipationData()
  } else if (gameMode.value === 'infinityGym') {
    await loadGymData()
  } else {
    await loadData()
  }
}

// 页面副标题
const subtitleText = computed(() => {
  if (gameMode.value === 'participation') return '玩家每日参与走势（登录 / 天梯 / 周赛 / 无限道馆 UV）'
  if (gameMode.value === 'tournament') return '周赛高端对战数据'
  if (gameMode.value === 'infinityGym') return '无限道馆爬塔玩法数据统计（累计）'
  return '天梯1v1实时统计数据'
})

// 格式化时间
function formatTime(isoString) {
  if (!isoString) return '未知'
  const date = new Date(isoString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 格式化数字
function formatNumber(num) {
  if (num === undefined || num === null) return '-'
  return num.toLocaleString('zh-CN')
}

// 格式化变化
function formatChange(change) {
  if (change === null || change === undefined) return '-'
  if (change === 0) return '持平'
  const sign = change > 0 ? '↑' : '↓'
  return `${sign} ${Math.abs(change).toFixed(1)}%`
}

// 获取变化样式类
function getChangeClass(change) {
  if (change === null || change === undefined) return 'neutral'
  if (change > 0) return 'up'
  if (change < 0) return 'down'
  return 'neutral'
}

// 获取战斗场次变化
function getBattleChange() {
  if (!compareStats.value) return null
  const current = currentStats.value?.totalBattles || 0
  const compare = compareStats.value?.totalBattles || 0
  if (compare === 0) return null
  return ((current - compare) / compare) * 100
}

// 获取出场率变化
function getAppearanceChange(lumiId) {
  if (!compareStats.value) return null
  const current = currentStats.value?.appearance.find(i => i.lumiId === lumiId)
  const compare = compareStats.value?.appearance.find(i => i.lumiId === lumiId)
  if (!current || !compare) return null

  const currentRate = parseFloat(current.appearanceRate)
  const compareRate = parseFloat(compare.appearanceRate)
  if (compareRate === 0) return null
  return ((currentRate - compareRate) / compareRate) * 100
}

// 获取胜率变化
function getWinRateChange(lumiId) {
  if (!compareStats.value) return null
  const current = currentStats.value?.winRate.find(i => i.lumiId === lumiId)
  const compare = compareStats.value?.winRate.find(i => i.lumiId === lumiId)
  if (!current || !compare) return null

  const currentRate = parseFloat(current.winRate)
  const compareRate = parseFloat(compare.winRate)
  // 只统计有足够场次的变化（至少10场）
  if (current.battles < 10 && compare.battles < 10) return null
  return currentRate - compareRate
}

// 获取分布百分比
function getDistributionPercent(key) {
  const total = playerDistribution.value.total
  if (total === 0) return 0
  return ((playerDistribution.value[key] / total) * 100).toFixed(1)
}

// 获取分布变化
function getDistributionChange(key) {
  if (!comparePlayerDistribution.value) return null
  const current = playerDistribution.value[key] || 0
  const compare = comparePlayerDistribution.value[key] || 0
  if (compare === 0) return null
  return ((current - compare) / compare) * 100
}

// 周赛：获取胜场范围（只显示有人的胜场数）
function getWinDistributionRange() {
  const distribution = tournamentWinDistribution.value
  const wins = []
  for (let i = 0; i <= 15; i++) {
    if (distribution[i] > 0) {
      wins.push(i)
    }
  }
  return wins
}

// 周赛：获取胜场样式类
function getWinClass(wins) {
  if (wins >= 12) return 'legendary'
  if (wins >= 9) return 'excellent'
  if (wins >= 6) return 'good'
  if (wins >= 3) return 'average'
  return 'beginner'
}

// 周赛：获取胜场图标
function getWinIcon(wins) {
  if (wins >= 12) return '👑'
  if (wins >= 9) return '🏆'
  if (wins >= 6) return '⭐'
  if (wins >= 3) return '👍'
  return '🎯'
}

// 周赛：获取胜场百分比
function getTournamentDistributionPercent(wins) {
  const total = tournamentTotalPlayers.value
  if (total === 0) return 0
  return (((tournamentWinDistribution.value[wins] || 0) / total) * 100).toFixed(1)
}

// 周赛：获取天梯段位百分比
function getTournamentRankDistributionPercent(key) {
  const total = tournamentPlayerRankDistribution.value.total
  if (total === 0) return 0
  return ((tournamentPlayerRankDistribution.value[key] / total) * 100).toFixed(1)
}

// 获取噜咪头像（版本感知）
function getLumiAvatar(lumiId) {
  return avatarUrl(lumiId)
}

// 获取队伍中某只噜咪的第二技能 Top 3（按携带率）
// skillId=0 视为「未携带」整体作为一种选择参与排序
function getTopSecondSkills(lumi, teamBattles) {
  const list = lumi.secondSkills || []
  return list.slice(0, 3).map(ss => {
    if (ss.skillId === 0) {
      return {
        skillId: 0,
        isNone: true,
        meta: { name: '未携带', icon: null },
        rate: teamBattles > 0 ? (ss.count / teamBattles * 100).toFixed(1) : '0.0'
      }
    }
    return {
      skillId: ss.skillId,
      meta: skillMeta.value.get(ss.skillId),
      rate: teamBattles > 0 ? (ss.count / teamBattles * 100).toFixed(1) : '0.0'
    }
  })
}

// 获取队伍的训练家技能 Top 3（按携带率）
// trainerId=0 视为「未携带」整体作为一种选择参与排序
function getTopTrainerSkills(team, teamBattles) {
  const list = team.trainerSkills || []
  return list.slice(0, 3).map(ts => {
    if (ts.trainerId === 0) {
      return {
        trainerId: 0,
        isNone: true,
        meta: { name: '未携带', icon: null },
        rate: teamBattles > 0 ? (ts.count / teamBattles * 100).toFixed(1) : '0.0'
      }
    }
    return {
      trainerId: ts.trainerId,
      meta: trainerSkillMeta.value.get(ts.trainerId),
      rate: teamBattles > 0 ? (ts.count / teamBattles * 100).toFixed(1) : '0.0'
    }
  })
}

// 技能图标加载失败时隐藏
function handleSkillIconError(e) {
  e.target.style.visibility = 'hidden'
}

// 处理图片加载失败
function handleImageError(e) {
  handleAvatarError(e)
}

// 跳转到噜咪详情
function goToLumi(lumiId) {
  router.push(`/lumi/${lumiId}`)
}

// 获取胜率样式类
function getWinRateClass(winRate) {
  const rate = parseFloat(winRate)
  if (rate >= 60) return 'high'
  if (rate >= 50) return 'medium'
  return 'low'
}

// 更新数据
function updateData() {
  console.log('切换到:', getDataKeys())
}

// 选择周
function selectWeek(week) {
  selectedWeek.value = week
  if (compareMode.value && compareWeek.value === week) {
    // 如果对比周等于当前周，切换到前一周
    const prevWeek = week > 1 ? week - 1 : null
    compareWeek.value = prevWeek
    if (prevWeek) loadCompareData()
  }
  loadData()
}

// 对比模式切换
function onCompareModeChange() {
  if (compareMode.value && !compareWeek.value) {
    // 默认对比前一周
    compareWeek.value = selectedWeek.value > 1 ? selectedWeek.value - 1 : null
  }
  if (compareMode.value) {
    loadCompareData()
  }
}

// 加载对比数据
async function loadCompareData() {
  if (!compareMode.value || !compareWeek.value) {
    compareData.value = null
    return
  }
  try {
    let url
    if (gameMode.value === 'tournament') {
      url = `/data/online/${currentRegion.value}/weekly/tournament-week${compareWeek.value}.json`
    } else {
      url = `/data/online/${currentRegion.value}/weekly/ladder-week${compareWeek.value}.json`
    }
    const response = await fetch(url, { cache: 'no-cache' })
    if (response.ok) {
      compareData.value = await response.json()
    } else {
      compareData.value = null
    }
  } catch (error) {
    console.error('加载对比数据失败:', error)
    compareData.value = null
  }
}

// 初始化图表
function initChart() {
  if (!chartCanvas.value) return

  const ctx = chartCanvas.value.getContext('2d')

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['青铜', '白银', '黄金', '钻石', '星耀', '传说'],
      datasets: [{
        label: '玩家数量',
        data: [0, 0, 0, 0, 0, 0],
        backgroundColor: [
          'rgba(205, 127, 50, 0.7)',
          'rgba(192, 192, 192, 0.7)',
          'rgba(255, 215, 0, 0.7)',
          'rgba(0, 191, 255, 0.7)',
          'rgba(138, 43, 226, 0.7)',
          'rgba(255, 69, 0, 0.7)'
        ],
        borderColor: [
          'rgba(205, 127, 50, 1)',
          'rgba(192, 192, 192, 1)',
          'rgba(255, 215, 0, 1)',
          'rgba(0, 191, 255, 1)',
          'rgba(138, 43, 226, 1)',
          'rgba(255, 69, 0, 1)'
        ],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 16 / 10,
      scales: {
        x: {
          ticks: { font: { size: 14, weight: 'bold' } },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          ticks: {
            font: { size: 12 },
            callback: value => value.toLocaleString('zh-CN')
          },
          title: {
            display: true,
            text: '玩家数量',
            font: { size: 14, weight: 'bold' },
            color: '#666'
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              const distribution = [
                playerDistribution.value.bronze,
                playerDistribution.value.silver,
                playerDistribution.value.gold,
                playerDistribution.value.diamond,
                playerDistribution.value.star,
                playerDistribution.value.legend
              ]
              const labels = ['青铜 (1-30段)', '白银 (31-60段)', '黄金 (61-90段)', '钻石 (91-120段)', '星耀 (121-150段)', '传说 (151段)']
              const total = playerDistribution.value.total
              const percent = ((distribution[context.dataIndex] / total) * 100).toFixed(1)
              return `${labels[context.dataIndex]}: ${context.raw.toLocaleString()} 人 (${percent}%)`
            }
          }
        }
      }
    }
  })
}

// 更新图表数据
function updateChart() {
  if (!chartInstance) return

  const distribution = playerDistribution.value

  chartInstance.data.datasets[0].data = [
    distribution.bronze,
    distribution.silver,
    distribution.gold,
    distribution.diamond,
    distribution.star,
    distribution.legend
  ]

  chartInstance.update()
}

// 加载可用周列表
async function loadAvailableWeeks() {
  try {
    const response = await fetch(`/data/online/${currentRegion.value}/weekly/weeks.json`, { cache: 'no-cache' })
    if (response.ok) {
      const weeks = await response.json()
      availableWeeks.value = weeks.map(w => ({
        value: w.week,
        label: w.label || `第${w.week}周`
      }))
      if (weeks.length > 0) {
        selectedWeek.value = weeks[weeks.length - 1].week
      }
    } else {
      availableWeeks.value = []
    }
  } catch (error) {
    console.log('无法加载周列表，使用默认值')
  }
}

// 加载数据
async function loadData() {
  try {
    let url
    if (gameMode.value === 'tournament') {
      // 周赛数据
      url = `/data/online/${currentRegion.value}/weekly/tournament-week${selectedWeek.value}.json`
    } else {
      // 天梯数据
      url = selectedWeek.value > 0
        ? `/data/online/${currentRegion.value}/weekly/ladder-week${selectedWeek.value}.json`
        : `/data/online/${currentRegion.value}/battle-stats.json`
    }
    const response = await fetch(url, { cache: 'no-cache' })
    if (!response.ok) {
      throw new Error(`加载失败: ${response.status}`)
    }
    const json = await response.json()
    data.value = json
    noData.value = false
  } catch (error) {
    console.error('加载数据失败:', error)
    noData.value = true
  }
}

// 加载无限道馆数据
async function loadGymData() {
  try {
    const url = `/data/online/${currentRegion.value}/infinity-gym.json`
    const resp = await fetch(url, { cache: 'no-cache' })
    if (!resp.ok) {
      console.warn('无限道馆数据加载失败:', resp.status)
      gymData.value = null
      return
    }
    gymData.value = await resp.json()
    expandedFloors.value = new Set()
    expandedGroups.value = new Set()
    // 下一轮 tick 画图
    nextTick(() => drawFloorDistChart())
  } catch (e) {
    console.error('加载无限道馆数据失败:', e)
    gymData.value = null
  }
}

// 最高层数（用于顶部展示 + jump 输入的 max）
const maxFloorReached = computed(() => {
  if (!gymData.value) return 0
  const keys = Object.keys(gymData.value.maxFloorDistribution || {}).map(Number)
  return keys.length ? Math.max(...keys) : 0
})

// 画层数分布图
function drawFloorDistChart() {
  if (!gymData.value || !gymFloorDistCanvas.value) return
  const dist = gymData.value.maxFloorDistribution || {}
  const floors = Object.keys(dist).map(Number).sort((a, b) => a - b)
  const counts = floors.map(f => dist[f])

  if (gymFloorDistChart) gymFloorDistChart.destroy()
  const ctx = gymFloorDistCanvas.value.getContext('2d')
  gymFloorDistChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: floors.map(f => `第${f}层`),
      datasets: [{
        label: '停留玩家数',
        data: counts,
        backgroundColor: 'rgba(118, 75, 162, 0.6)',
        borderColor: 'rgba(118, 75, 162, 1)',
        borderWidth: 1,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: { callbacks: { label: ctx => `${ctx.parsed.y.toLocaleString('zh-CN')} 人` } },
        legend: { display: false },
      },
      scales: {
        x: { ticks: { autoSkip: true, maxTicksLimit: 30 } },
        y: { beginAtZero: true, ticks: { callback: v => v.toLocaleString('zh-CN') } },
      }
    }
  })
}

// 展开/收起某层
function toggleFloor(floor) {
  if (expandedFloors.value.has(floor)) {
    expandedFloors.value.delete(floor)
  } else {
    expandedFloors.value.add(floor)
  }
  // 触发响应式更新（Set 需要重新赋值才能触发）
  expandedFloors.value = new Set(expandedFloors.value)
}

function registerFloorRef(floor, el) {
  if (el) gymFloorRefs.set(floor, el)
}

function registerGroupRef(key, el) {
  if (el) gymGroupRefs.set(key, el)
}

// 展开/收起某组
function toggleGroup(key) {
  const s = new Set(expandedGroups.value)
  if (s.has(key)) s.delete(key)
  else s.add(key)
  expandedGroups.value = s
}

// 跳转到指定层
function jumpToFloor() {
  const floor = Number(gymJumpFloor.value)
  if (!floor || floor < 1) return
  const groupKey = Math.ceil(floor / 10) * 10
  const hasFloor = gymData.value?.floors?.some(f => f.floor === floor)
  if (!hasFloor) {
    alert(`第 ${floor} 层暂无玩家挑战数据`)
    return
  }
  // 先展开组，再展开该层的阵容详情
  if (!expandedGroups.value.has(groupKey)) {
    expandedGroups.value = new Set([...expandedGroups.value, groupKey])
  }
  if (!expandedFloors.value.has(floor)) {
    expandedFloors.value = new Set([...expandedFloors.value, floor])
  }
  nextTick(() => {
    const el = gymFloorRefs.get(floor) || gymGroupRefs.get(groupKey)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

// 获取某只 lumi 的 top 技能（无限道馆通关阵容里）
function gymTopSkill(lumi) {
  const ss = lumi.secondSkills?.[0]
  if (!ss) return null
  if (ss.skillId === 0) return { name: '未携带', icon: null }
  const meta = skillMeta.value.get(ss.skillId)
  return { name: meta?.name || `技能 ${ss.skillId}`, icon: meta?.icon }
}

// 获取某队伍的 top 训练家技能
function gymTopTrainer(team) {
  const ts = team.trainerSkills?.[0]
  if (!ts) return null
  if (ts.trainerId === 0) return { name: '未携带', icon: null }
  const meta = trainerSkillMeta.value.get(ts.trainerId)
  return { name: meta?.name || `训练家 ${ts.trainerId}`, icon: meta?.icon }
}

// 加载所有周的参与走势数据并合并（同日期后写覆盖，因为跨周分界日 UV 相同）
async function loadAllParticipationData() {
  const weeks = availableWeeks.value
  if (!weeks.length) return
  const results = await Promise.all(
    weeks.map(w =>
      fetch(`/data/online/${currentRegion.value}/weekly/participation-week${w.value}.json`, { cache: 'no-cache' })
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null)
    )
  )
  const map = new Map()
  const weekMap = new Map()  // week 号 → weekOverlap / weekLoginBase / retention 版本
  let latestUpdate = ''
  for (const json of results.filter(Boolean)) {
    if (json.updateTime && json.updateTime > latestUpdate) latestUpdate = json.updateTime
    // 收集周级 overlap（脚本新版才有；老 JSON 没这些字段就跳过）
    if (json.week != null && json.weekOverlap) {
      weekMap.set(json.week, {
        week: json.week,
        weekOverlap: json.weekOverlap,
        weekLoginBase: json.weekLoginBase || 0,
        retentionWeekOverlap: json.retentionWeekOverlap || null,
        retentionWeekLoginBase: json.retentionWeekLoginBase || 0,
      })
    }
    for (const row of json.dates || []) {
      map.set(row.date, {
        ladder: row.ladder,
        tournament: row.tournament,
        infinityGym: row.infinityGym,
        guildWar: row.guildWar || 0,
        login: row.login,
        ladderRate: row.ladderRate,
        tournamentRate: row.tournamentRate,
        infinityGymRate: row.infinityGymRate,
        guildWarRate: row.guildWarRate || 0,
        ladderBattlesPerUser: row.ladderBattlesPerUser || 0,
        tournamentBattlesPerUser: row.tournamentBattlesPerUser || 0,
        infinityGymBattlesPerUser: row.infinityGymBattlesPerUser || 0,
        guildWarBattlesPerUser: row.guildWarBattlesPerUser || 0,
        overlap: row.overlap || null,
        retention: row.retention || null
      })
    }
  }
  participationAllData.value = map
  participationWeekOverlaps.value = weekMap
  participationUpdateTime.value = latestUpdate

  // 默认日期范围：最近 7 天（结束=有数据的最新日期，跳过未来 0 值日期）
  const allDates = [...map.keys()].sort()
  const validDates = allDates.filter(d => (map.get(d)?.login || 0) > 0)
  if (validDates.length) {
    const end = validDates[validDates.length - 1]
    const endDateObj = new Date(end)
    const startDateObj = new Date(endDateObj)
    startDateObj.setDate(startDateObj.getDate() - 6)
    const y = startDateObj.getFullYear()
    const m = String(startDateObj.getMonth() + 1).padStart(2, '0')
    const d = String(startDateObj.getDate()).padStart(2, '0')
    const startStr = `${y}-${m}-${d}`
    participationStartDate.value = startStr < allDates[0] ? allDates[0] : startStr
    participationEndDate.value = end
  }
}

// 按当前日期范围筛选后的数据（升序）
const filteredParticipationDates = computed(() => {
  const map = participationAllData.value
  const s = participationStartDate.value
  const e = participationEndDate.value
  if (!s || !e || !map.size) return []
  const rows = []
  for (const [date, row] of map.entries()) {
    if (date >= s && date <= e) rows.push({ date, ...row })
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : 1))
  return rows
})

const allDatesMin = computed(() => {
  const dates = [...participationAllData.value.keys()].sort()
  return dates[0] || ''
})
const allDatesMax = computed(() => {
  const dates = [...participationAllData.value.keys()].sort()
  return dates[dates.length - 1] || ''
})

// 数据集中是否含留存维度（老数据无 retention，此时隐藏切换、默认全量）
const hasRetentionData = computed(() => {
  for (const row of participationAllData.value.values()) {
    if (row.retention) return true
  }
  return false
})

// === 玩法重合率相关 ===
const overlapDate = ref('')  // 用户选中的日期（默认最近一天）

// 数据集中是否含 overlap 信息（老周次没有）
const hasOverlapData = computed(() => {
  for (const row of participationAllData.value.values()) {
    if (row.overlap) return true
  }
  return false
})

// 可选的重合率日期列表：跟参与走势大日期范围保持一致，按时间倒序（最近的在前）
// 注意：不再过滤 overlap 非空的日期 —— 让用户能自由选大范围里任意一天
// 没数据的日子文氏图会显示全 0（视觉上表明"当日没有该玩法的参与"）
const availableOverlapDates = computed(() => {
  return filteredParticipationDates.value
    .map(r => r.date)
    .sort((a, b) => (a < b ? 1 : -1))
})

// 当日 overlap（跟随全量/留存开关）
const currentOverlap = computed(() => {
  const row = participationAllData.value.get(overlapDate.value)
  if (!row) return null
  const o = participationRetention.value ? row.retention?.overlap : row.overlap
  return o || null
})

// 当日基准：登录玩家数（用于算占比）
const currentOverlapLoginBase = computed(() => {
  const row = participationAllData.value.get(overlapDate.value)
  if (!row) return 0
  return participationRetention.value ? (row.retention?.login || 0) : (row.login || 0)
})

// 重合率的 16 种分区显示配置（4 玩法：L=天梯 T=周赛 G=无限 W=公会战）
// 顺序：四玩法都玩 → 三玩法组合 → 两玩法组合 → 单玩法 → 仅登录
const OVERLAP_ROWS_CONFIG = [
  { key: 'ltgw', label: '四玩法都参与（天梯 + 周赛 + 无限 + 公会）', color: '#3a1d5a' },
  { key: 'ltg',  label: '天梯 + 周赛 + 无限道馆',                    color: '#5a3d7a' },
  { key: 'ltw',  label: '天梯 + 周赛 + 公会战',                      color: '#a04030' },
  { key: 'lgw',  label: '天梯 + 无限道馆 + 公会战',                  color: '#6a3f7f' },
  { key: 'tgw',  label: '周赛 + 无限道馆 + 公会战',                  color: '#9a5544' },
  { key: 'lt',   label: '天梯 + 周赛',                               color: '#e0834a' },
  { key: 'lg',   label: '天梯 + 无限道馆',                           color: '#5a86bd' },
  { key: 'lw',   label: '天梯 + 公会战',                             color: '#a04a5a' },
  { key: 'tg',   label: '周赛 + 无限道馆',                           color: '#a86ea0' },
  { key: 'tw',   label: '周赛 + 公会战',                             color: '#c05840' },
  { key: 'gw',   label: '无限道馆 + 公会战',                         color: '#8f4a8a' },
  { key: 'l',    label: '仅天梯',                                    color: '#667eea' },
  { key: 't',    label: '仅周赛',                                    color: '#f97316' },
  { key: 'g',    label: '仅无限道馆',                                color: '#9575cd' },
  { key: 'w',    label: '仅公会战',                                  color: '#dc2626' },
  { key: 'login_only', label: '仅登录（未参与任何战斗）',            color: '#bbbbbb' },
]

const overlapRows = computed(() => {
  const o = currentOverlap.value
  const base = currentOverlapLoginBase.value
  if (!o) return []
  return OVERLAP_ROWS_CONFIG.map(cfg => {
    const count = o[cfg.key] || 0
    const pct = base > 0 ? (count / base * 100).toFixed(1) : '0.0'
    return { ...cfg, count, pct }
  })
})

// 生成 SVG 文氏图：登录大圆包住 4 个玩法小圆（矩形四角布局）
// 4 圆文氏图数学上无法呈现所有 15 种交集的精确面积，采用近似示意：4 圆矩形排列
// 数字标注在每个区域重心附近；不追求面积精确
// 抽成独立函数：日重合率和周重合率都调用它
function renderVennSvg(o) {
  if (!o) return ''
  const fmt = n => (n || 0).toLocaleString('zh-CN')
  const W = 520, H = 460
  const CX = W / 2, CY = 230
  const R = 92                        // 4 个小圆半径
  const dx = 62, dy = 58              // 圆心相对中心的偏移
  // 4 圆矩形四角：左上=天梯 L / 右上=周赛 T / 左下=无限 G / 右下=公会 W
  const pL = { x: CX - dx, y: CY - dy }
  const pT = { x: CX + dx, y: CY - dy }
  const pG = { x: CX - dx, y: CY + dy }
  const pW = { x: CX + dx, y: CY + dy }
  const bigR = 208
  return `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${CX}" cy="${CY}" r="${bigR}" fill="rgba(180,180,180,0.10)" stroke="#999" stroke-width="1.5" stroke-dasharray="5,3"/>
  <text x="${CX}" y="${CY - bigR + 20}" text-anchor="middle" fill="#666" font-size="14" font-weight="600">登录</text>
  <text x="${CX - bigR + 22}" y="${CY + bigR - 12}" text-anchor="start" fill="#888" font-size="12">
    仅登录 ${fmt(o.login_only)}
  </text>
  <circle cx="${pL.x}" cy="${pL.y}" r="${R}" fill="rgba(102,126,234,0.30)" stroke="#667eea" stroke-width="2"/>
  <circle cx="${pT.x}" cy="${pT.y}" r="${R}" fill="rgba(249,115,22,0.28)" stroke="#f97316" stroke-width="2"/>
  <circle cx="${pG.x}" cy="${pG.y}" r="${R}" fill="rgba(149,117,205,0.30)" stroke="#9575cd" stroke-width="2"/>
  <circle cx="${pW.x}" cy="${pW.y}" r="${R}" fill="rgba(220,38,38,0.26)" stroke="#dc2626" stroke-width="2"/>
  <text x="${pL.x - R + 10}" y="${pL.y - R + 4}"  text-anchor="start" fill="#4759c4" font-size="13" font-weight="700">天梯</text>
  <text x="${pT.x + R - 10}" y="${pT.y - R + 4}"  text-anchor="end"   fill="#d15c0f" font-size="13" font-weight="700">周赛</text>
  <text x="${pG.x - R + 10}" y="${pG.y + R - 2}"  text-anchor="start" fill="#6d4dab" font-size="13" font-weight="700">无限道馆</text>
  <text x="${pW.x + R - 10}" y="${pW.y + R - 2}"  text-anchor="end"   fill="#b32020" font-size="13" font-weight="700">公会战</text>
  <text x="${pL.x - 30}" y="${pL.y - 22}" text-anchor="middle" fill="#4759c4" font-size="14" font-weight="700">${fmt(o.l)}</text>
  <text x="${pT.x + 30}" y="${pT.y - 22}" text-anchor="middle" fill="#d15c0f" font-size="14" font-weight="700">${fmt(o.t)}</text>
  <text x="${pG.x - 30}" y="${pG.y + 28}" text-anchor="middle" fill="#6d4dab" font-size="14" font-weight="700">${fmt(o.g)}</text>
  <text x="${pW.x + 30}" y="${pW.y + 28}" text-anchor="middle" fill="#b32020" font-size="14" font-weight="700">${fmt(o.w)}</text>
  <text x="${CX}"        y="${pL.y - 4}"  text-anchor="middle" fill="#883a1d" font-size="12" font-weight="700">${fmt(o.lt)}</text>
  <text x="${CX}"        y="${pG.y + 12}" text-anchor="middle" fill="#8a3a7f" font-size="12" font-weight="700">${fmt(o.gw)}</text>
  <text x="${pL.x + 4}"  y="${CY - 2}"    text-anchor="start"  fill="#3f4a97" font-size="12" font-weight="700">${fmt(o.lg)}</text>
  <text x="${pT.x - 4}"  y="${CY - 2}"    text-anchor="end"    fill="#c05840" font-size="12" font-weight="700">${fmt(o.tw)}</text>
  <text x="${CX - 22}" y="${CY + 14}" text-anchor="middle" fill="#7a3f6f" font-size="11" font-weight="700">${fmt(o.lw)}</text>
  <text x="${CX + 22}" y="${CY + 14}" text-anchor="middle" fill="#a86ea0" font-size="11" font-weight="700">${fmt(o.tg)}</text>
  <text x="${pL.x + 32}" y="${CY - 16}" text-anchor="middle" fill="#5a3d7a" font-size="11" font-weight="700">${fmt(o.ltg)}</text>
  <text x="${pT.x - 32}" y="${CY - 16}" text-anchor="middle" fill="#8a3a2d" font-size="11" font-weight="700">${fmt(o.ltw)}</text>
  <text x="${pG.x + 32}" y="${CY + 30}" text-anchor="middle" fill="#5a2d6d" font-size="11" font-weight="700">${fmt(o.lgw)}</text>
  <text x="${pW.x - 32}" y="${CY + 30}" text-anchor="middle" fill="#7a4a5a" font-size="11" font-weight="700">${fmt(o.tgw)}</text>
  <text x="${CX}" y="${CY + 6}" text-anchor="middle" fill="#3a1d5a" font-size="15" font-weight="800">${fmt(o.ltgw)}</text>
</svg>
`.trim()
}

const vennSvg = computed(() => renderVennSvg(currentOverlap.value))

// === 周重合率 ===
// 可选的周次列表（有 weekOverlap 数据的），按倒序（最近的在前）
const availableOverlapWeeks = computed(() => {
  return [...participationWeekOverlaps.value.keys()].sort((a, b) => b - a)
})

// 是否有周重合率数据
const hasWeekOverlapData = computed(() => participationWeekOverlaps.value.size > 0)

// 当前选中周的 weekOverlap（跟随全量/留存开关）
const currentWeekOverlap = computed(() => {
  const w = participationWeekOverlaps.value.get(selectedOverlapWeek.value)
  if (!w) return null
  return participationRetention.value ? w.retentionWeekOverlap : w.weekOverlap
})

// 当前选中周的登录基数
const currentWeekLoginBase = computed(() => {
  const w = participationWeekOverlaps.value.get(selectedOverlapWeek.value)
  if (!w) return 0
  return participationRetention.value ? w.retentionWeekLoginBase : w.weekLoginBase
})

// 周重合率的 SVG 文氏图
const weekVennSvg = computed(() => renderVennSvg(currentWeekOverlap.value))

// 周重合率的表格数据
const weekOverlapRows = computed(() => {
  const o = currentWeekOverlap.value
  const base = currentWeekLoginBase.value
  if (!o) return []
  return OVERLAP_ROWS_CONFIG.map(cfg => {
    const count = o[cfg.key] || 0
    const pct = base > 0 ? (count / base * 100).toFixed(1) : '0.0'
    return { ...cfg, count, pct }
  })
})

// 加载完数据后自动选中最近一周
watch(availableOverlapWeeks, (weeks) => {
  if (!weeks.length) return
  if (selectedOverlapWeek.value == null || !weeks.includes(selectedOverlapWeek.value)) {
    selectedOverlapWeek.value = weeks[0]
  }
}, { immediate: true })

// 当选中日期不在可选列表里（切换全量/留存后有可能），自动落到最近的可用日期
watch([hasOverlapData, availableOverlapDates], () => {
  const dates = availableOverlapDates.value
  if (!dates.length) return
  if (!overlapDate.value || !dates.includes(overlapDate.value)) {
    overlapDate.value = dates[0]  // 已按倒序排，第 0 个就是最近的
  }
}, { immediate: true })

function initParticipationCharts() {
  const rows = filteredParticipationDates.value
  if (!rows.length) return

  const labels = rows.map(r => r.date.slice(5)) // MM-DD
  // 留存模式下从 retention 取值（无 retention 字段时回退 0）
  const useRetention = participationRetention.value
  const pick = r => (useRetention ? (r.retention || {}) : r)
  const login = rows.map(r => pick(r).login ?? 0)
  const ladder = rows.map(r => pick(r).ladder ?? 0)
  const tournament = rows.map(r => pick(r).tournament ?? 0)
  const infinityGym = rows.map(r => pick(r).infinityGym ?? 0)
  const guildWar = rows.map(r => pick(r).guildWar ?? 0)
  const ladderRate = rows.map(r => pick(r).ladderRate ?? 0)
  const tournamentRate = rows.map(r => pick(r).tournamentRate ?? 0)
  const infinityGymRate = rows.map(r => pick(r).infinityGymRate ?? 0)
  const guildWarRate = rows.map(r => pick(r).guildWarRate ?? 0)
  const ladderBpu = rows.map(r => pick(r).ladderBattlesPerUser ?? 0)
  const tournamentBpu = rows.map(r => pick(r).tournamentBattlesPerUser ?? 0)
  const infinityGymBpu = rows.map(r => pick(r).infinityGymBattlesPerUser ?? 0)
  const guildWarBpu = rows.map(r => pick(r).guildWarBattlesPerUser ?? 0)

  // 玩家数走势
  if (participationCountCanvas.value) {
    if (participationCountChart) participationCountChart.destroy()
    const ctx = participationCountCanvas.value.getContext('2d')
    participationCountChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: '登录', data: login, borderColor: '#888', backgroundColor: 'rgba(136,136,136,0.1)', tension: 0.3, fill: true },
          { label: '天梯参与', data: ladder, borderColor: '#667eea', backgroundColor: 'rgba(102,126,234,0.15)', tension: 0.3, fill: true },
          { label: '周赛参与', data: tournament, borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.15)', tension: 0.3, fill: true },
          { label: '无限道馆参与', data: infinityGym, borderColor: '#764ba2', backgroundColor: 'rgba(118,75,162,0.15)', tension: 0.3, fill: true },
          { label: '公会战参与', data: guildWar, borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,0.15)', tension: 0.3, fill: true },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: { y: { beginAtZero: true } }
      }
    })
  }

  // 占比走势
  if (participationRateCanvas.value) {
    if (participationRateChart) participationRateChart.destroy()
    const ctx = participationRateCanvas.value.getContext('2d')
    participationRateChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: '天梯占比 %', data: ladderRate, borderColor: '#667eea', tension: 0.3 },
          { label: '周赛占比 %', data: tournamentRate, borderColor: '#f97316', tension: 0.3 },
          { label: '无限道馆占比 %', data: infinityGymRate, borderColor: '#764ba2', tension: 0.3 },
          { label: '公会战占比 %', data: guildWarRate, borderColor: '#dc2626', tension: 0.3 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.raw}%` } } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => v + '%' } } }
      }
    })
  }

  // 平均每人参与场次走势
  if (participationBpuCanvas.value) {
    if (participationBpuChart) participationBpuChart.destroy()
    const ctx = participationBpuCanvas.value.getContext('2d')
    participationBpuChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: '天梯场均', data: ladderBpu, borderColor: '#667eea', tension: 0.3 },
          { label: '周赛场均', data: tournamentBpu, borderColor: '#f97316', tension: 0.3 },
          { label: '无限道馆场均', data: infinityGymBpu, borderColor: '#764ba2', tension: 0.3 },
          { label: '公会战场均', data: guildWarBpu, borderColor: '#dc2626', tension: 0.3 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.raw} 场/人` } } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => v + ' 场' } } }
      }
    })
  }
}

onMounted(async () => {
  await loadAvailableWeeks()
  await loadData()
  // 并发加载所有周的参与走势数据（合并去重）
  loadAllParticipationData()
  // 提前预加载无限道馆数据（切 tab 后立即能看到）
  loadGymData()
  // 加载技能元数据（用于队伍列表显示第二技能 + 训练家技能）
  try {
    const [skills, trainers, loc] = await Promise.all([
      loadGameData('ActiveSkill'),
      loadGameData('TrainerSkill'),
      loadGameData('localization')
    ])
    const meta = new Map()
    for (const sk of skills) {
      meta.set(sk.Id, {
        name: loc[sk.name] || sk.name,
        icon: sk.icon
      })
    }
    skillMeta.value = meta

    const tMeta = new Map()
    for (const ts of trainers) {
      tMeta.set(ts.Id, {
        name: loc[ts.name] || ts.name,
        icon: ts.icon
      })
    }
    trainerSkillMeta.value = tMeta
  } catch (e) {
    console.error('加载技能元数据失败:', e)
  }
  nextTick(() => {
    initChart()
  })
})

// 监听标签页切换
watch(activeTab, (newTab) => {
  if (newTab === 'chart') {
    nextTick(() => {
      if (!chartInstance) {
        initChart()
      }
      updateChart()
    })
  }
})

// 监听玩法切换到参与走势
watch(gameMode, (newMode) => {
  if (newMode === 'participation') {
    nextTick(() => initParticipationCharts())
  }
})

// 参与走势：日期范围或数据变化时重新画图
watch(filteredParticipationDates, () => {
  if (gameMode.value === 'participation') {
    nextTick(() => initParticipationCharts())
  }
})

// 参与走势：切换全量/留存统计口径时重新画图
watch(participationRetention, () => {
  if (gameMode.value === 'participation') {
    nextTick(() => initParticipationCharts())
  }
})

// 监听数据变化
watch([selectedRankGroup, includeBot], () => {
  if (activeTab.value === 'chart') {
    nextTick(() => {
      updateChart()
    })
  }
})

watch(currentStats, () => {
  if (activeTab.value === 'chart' && chartInstance) {
    updateChart()
  }
})
</script>

<style scoped>
.online-data {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.page-header {
  text-align: center;
  margin-bottom: 20px;
}

.external-data-notice {
  max-width: 900px;
  margin: 0 auto 20px;
  padding: 12px 20px;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(245, 87, 108, 0.12) 100%);
  border: 1px solid rgba(245, 158, 11, 0.5);
  border-radius: 8px;
  color: #fbbf24;
  font-size: 0.95em;
  text-align: center;
  line-height: 1.5;
}

.empty-state {
  text-align: center;
  padding: 80px 20px;
  color: #888;
}

.empty-state .empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.empty-state .empty-text {
  font-size: 16px;
}

.page-header h1 {
  font-size: 2.5rem;
  margin-bottom: 10px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  font-size: 1.1rem;
  color: #666;
  margin-bottom: 5px;
}

.update-time {
  font-size: 0.9rem;
  color: #999;
}

/* 周选择器 */
.week-selector {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 20px;
  background: linear-gradient(135deg, #f8f9ff 0%, #f0f4ff 100%);
  border-radius: 12px;
  flex-wrap: wrap;
  gap: 15px;
}

/* 玩法切换器 */
.game-mode-selector {
  display: flex;
  justify-content: center;
  gap: 15px;
  margin-bottom: 20px;
}

.region-selector {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-bottom: 16px;
}

.region-btn {
  padding: 8px 22px;
  border: 2px solid #e0d7ff;
  background: white;
  color: #7c6fb3;
  font-size: 0.95rem;
  font-weight: 600;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.25s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.region-btn:hover {
  border-color: #a493e0;
  background: #f8f5ff;
}

.region-btn.active {
  border-color: #764ba2;
  background: linear-gradient(135deg, #a493e0 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 3px 10px rgba(118, 75, 162, 0.3);
}

/* === 无限道馆样式 === */
.infinity-gym-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.gym-overview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.gym-stat-card {
  background: linear-gradient(135deg, #f5f0ff 0%, #ede4ff 100%);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  border: 2px solid #d9c8ff;
}

.gym-stat-value {
  font-size: 2rem;
  font-weight: bold;
  color: #5a3d7a;
  margin-bottom: 6px;
}

.gym-stat-label {
  font-size: 0.9rem;
  color: #7c6fb3;
}

.gym-chart-block, .gym-floors-block {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.gym-chart-block h3, .gym-floors-block h3 {
  margin: 0 0 8px 0;
  font-size: 1.1rem;
}

.gym-lumi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.gym-lumi-item {
  text-align: center;
  padding: 10px 6px;
  border-radius: 10px;
  background: #fafaff;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid #ecebff;
}

.gym-lumi-item:hover {
  transform: translateY(-2px);
  border-color: #a493e0;
}

.gym-lumi-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
  margin-bottom: 6px;
}

.gym-lumi-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gym-lumi-rate {
  font-size: 1rem;
  font-weight: bold;
  color: #764ba2;
  margin-top: 4px;
}

.gym-lumi-count {
  font-size: 0.75rem;
  color: #999;
}

.gym-floors-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}

.gym-jump {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 0.9rem;
}

.gym-jump input {
  width: 80px;
  padding: 4px 8px;
  border: 1px solid #d0c8f0;
  border-radius: 6px;
  font-size: 0.9rem;
  margin: 0 4px;
}

.gym-jump-btn {
  padding: 6px 14px;
  border: none;
  border-radius: 6px;
  background: linear-gradient(135deg, #a493e0 0%, #764ba2 100%);
  color: white;
  font-weight: 600;
  cursor: pointer;
}

.gym-floor-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gym-floor-card {
  border: 1px solid #ecebff;
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.2s;
}

.gym-floor-card.expanded {
  border-color: #a493e0;
  box-shadow: 0 2px 12px rgba(118, 75, 162, 0.15);
}

/* 组卡片：外层容器（10 层为一组） */
.gym-group-card {
  border: 1.5px solid #d9c8ff;
  border-radius: 10px;
  overflow: hidden;
  transition: all 0.2s;
  background: white;
}

.gym-group-card.expanded {
  border-color: #764ba2;
  box-shadow: 0 2px 14px rgba(118, 75, 162, 0.18);
}

.gym-group-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  cursor: pointer;
  background: linear-gradient(135deg, #f5f0ff 0%, #ede4ff 100%);
  transition: filter 0.15s;
}

.gym-group-summary:hover {
  filter: brightness(0.97);
}

.gym-group-badge {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #a493e0 0%, #764ba2 100%);
  border-radius: 10px;
  padding: 2px 8px;
  margin-left: 6px;
  vertical-align: 2px;
}

.gym-floor-empty {
  color: #a99cc0;
  font-style: italic;
}

/* 组展开区：内层层列表 */
.gym-group-children {
  padding: 10px 12px 12px;
  background: #fbfaff;
  border-top: 1px solid #ecebff;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* 内层层 card（组内的单个层，视觉稍弱） */
.gym-floor-card-inner {
  background: white;
}

.gym-floor-card-inner .gym-floor-summary {
  background: #fefeff;
  padding: 10px 14px;
}

.gym-floor-card-inner .gym-floor-summary:hover {
  background: #f6f2ff;
}

/* 卡点关自身（10 倍数层）在组内展开列表里高亮一下 */
.gym-floor-card-inner.is-boss .gym-floor-summary {
  background: #f5f0ff;
}

.gym-floor-card-inner.is-boss .gym-floor-num::after {
  content: ' 🎯';
  font-size: 0.85em;
}

.gym-floor-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  cursor: pointer;
  background: #fafaff;
  transition: background 0.15s;
}

.gym-floor-summary:hover {
  background: #f0ebff;
}

.gym-floor-num {
  font-weight: bold;
  font-size: 1rem;
  color: #5a3d7a;
  min-width: 90px;
}

.gym-floor-metrics {
  flex: 1;
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  font-size: 0.9rem;
  color: #666;
}

.gym-floor-metrics b {
  color: #333;
  font-weight: 600;
}

.gym-floor-toggle {
  color: #a493e0;
  font-size: 0.9rem;
}

.gym-floor-detail {
  padding: 16px;
  background: white;
  border-top: 1px solid #ecebff;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.gym-team-section h4 {
  margin: 0 0 8px 0;
  font-size: 0.95rem;
  color: #555;
}

.gym-team-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.gym-team-lumi {
  min-width: 90px;
  text-align: center;
  cursor: pointer;
  padding: 8px;
  border-radius: 8px;
  background: #fafaff;
  border: 1px solid #ecebff;
  transition: all 0.2s;
}

.gym-team-lumi:hover {
  transform: translateY(-2px);
  border-color: #a493e0;
}

.gym-team-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  margin-bottom: 4px;
}

.gym-team-name {
  font-size: 0.8rem;
  font-weight: 600;
  color: #333;
}

.gym-team-info {
  font-size: 0.72rem;
  color: #888;
  margin-top: 2px;
}

.gym-team-skill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: #764ba2;
}

.gym-skill-icon {
  width: 14px;
  height: 14px;
  vertical-align: middle;
}

.gym-teams-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gym-player-team {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px;
  background: #fafaff;
  border-radius: 8px;
  flex-wrap: wrap;
}

.gym-team-rank {
  font-size: 1.4rem;
  font-weight: bold;
  color: #764ba2;
  min-width: 40px;
}

.gym-team-stats {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 0.85rem;
  color: #666;
  margin-left: auto;
}

.gym-empty-hint {
  color: #999;
  font-size: 0.9rem;
  padding: 12px;
  text-align: center;
}

.no-data-box {
  padding: 40px 20px;
  text-align: center;
  background: white;
  border-radius: 12px;
  color: #999;
}

.no-data-desc {
  font-size: 0.85rem;
  color: #bbb;
}

.mode-btn {
  padding: 12px 30px;
  border: 2px solid #ddd;
  background: white;
  color: #666;
  font-size: 1.1rem;
  font-weight: bold;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.mode-btn:hover {
  border-color: #667eea;
  background: #f8f9ff;
  transform: translateY(-2px);
}

.mode-btn.active {
  border-color: #667eea;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

/* 周赛说明 */
.tournament-info {
  text-align: center;
  padding: 15px 20px;
  margin-bottom: 20px;
  background: linear-gradient(135deg, #fff9e6 0%, #fff3cd 100%);
  border: 2px solid #ffc107;
  border-radius: 10px;
  color: #856404;
}

.tournament-info p {
  margin: 0;
  font-weight: bold;
  font-size: 1rem;
}

.week-tabs {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.week-tab {
  padding: 10px 20px;
  border: 2px solid #ddd;
  background: white;
  color: #666;
  font-weight: bold;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
}

.week-tab:hover {
  border-color: #667eea;
  background: #f8f9ff;
}

.week-tab.active {
  border-color: #667eea;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);
}

.compare-mode {
  display: flex;
  align-items: center;
  gap: 15px;
}

.compare-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: bold;
  color: #666;
}

.compare-toggle input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.compare-select {
  padding: 8px 15px;
  border: 2px solid #ddd;
  border-radius: 8px;
  font-size: 0.95rem;
  cursor: pointer;
  background: white;
}

/* 筛选器 */
.filters {
  display: flex;
  gap: 20px;
  justify-content: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-group label {
  font-weight: bold;
  color: #333;
}

.filter-group select {
  padding: 8px 15px;
  border: 2px solid #ddd;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.3s;
}

.filter-group select:hover {
  border-color: #667eea;
}

/* 统计概览 */
.stats-overview {
  display: flex;
  gap: 20px;
  justify-content: center;
  margin-bottom: 30px;
  flex-wrap: wrap;
}

.stat-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 20px 30px;
  border-radius: 12px;
  text-align: center;
  min-width: 150px;
  box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);
  position: relative;
}

.stat-label {
  font-size: 0.9rem;
  opacity: 0.9;
  margin-bottom: 10px;
}

.stat-value {
  font-size: 1.8rem;
  font-weight: bold;
}

.stat-value.small {
  font-size: 1.2rem;
}

.stat-change {
  margin-top: 8px;
  font-size: 0.85rem;
  font-weight: bold;
}

.stat-change.up {
  color: #a8ff78;
}

.stat-change.down {
  color: #ff7878;
}

.stat-change.neutral {
  color: rgba(255, 255, 255, 0.7);
}

.compare-info {
  background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
}

/* 变化指示器 */
.change-cell {
  min-width: 80px;
}

.change-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: bold;
}

.change-badge.up {
  background: #d4edda;
  color: #155724;
}

.change-badge.down {
  background: #f8d7da;
  color: #721c24;
}

.change-badge.neutral {
  background: #e2e3e5;
  color: #383d41;
}

/* 标签页 */
.tabs {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-bottom: 20px;
}

.tab {
  padding: 12px 30px;
  border: none;
  background: #f5f5f5;
  color: #666;
  font-size: 1rem;
  font-weight: bold;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
}

.tab:hover {
  background: #e0e0e0;
}

.tab.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);
}

/* 排序选项 */
.sort-options {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 15px 20px;
  background: #f8f9ff;
  border-bottom: 1px solid #e0e0e0;
  font-size: 0.9rem;
  color: #666;
}

.sort-btn {
  padding: 6px 15px;
  border: 2px solid #ddd;
  background: white;
  color: #666;
  font-size: 0.85rem;
  font-weight: bold;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s;
}

.sort-btn:hover {
  border-color: #667eea;
  background: #f8f9ff;
}

.sort-btn.active {
  border-color: #667eea;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

/* 排行榜 */
.ranking-list {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

th {
  padding: 15px;
  text-align: center;
  font-weight: bold;
}

tbody tr {
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.2s;
  cursor: pointer;
}

tbody tr:hover {
  background: #f8f9ff;
}

tbody tr:last-child {
  border-bottom: none;
}

td {
  padding: 15px;
  text-align: center;
}

.rank {
  font-weight: bold;
  font-size: 1.1rem;
  width: 60px;
}

.lumi-info {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: flex-start;
  text-align: left;
  padding-left: 20px;
}

.lumi-avatar {
  width: 50px;
  height: 50px;
  border-radius: 8px;
  object-fit: cover;
  border: 2px solid #e0e0e0;
  flex-shrink: 0;
}

.lumi-name {
  font-weight: bold;
  color: #333;
}

.battles, .wins {
  width: 100px;
  color: #666;
}

.rate {
  font-weight: bold;
  width: 80px;
}

.appearance-rate {
  color: #667eea;
}

.rate.high {
  color: #4caf50;
}

.rate.medium {
  color: #ff9800;
}

.rate.low {
  color: #f44336;
}

/* 队伍列表 */
.teams-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  margin-bottom: 8px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
}

.teams-count {
  font-size: 13px;
  color: #888;
}

.download-teams-btn {
  padding: 6px 14px;
  font-size: 13px;
  background: #4caf50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.download-teams-btn:hover:not(:disabled) {
  background: #43a047;
}

.download-teams-btn:disabled {
  background: #888;
  cursor: not-allowed;
}

.team-info {
  padding: 10px 20px;
}

/* 队伍训练家技能 */
.team-trainer {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed #d8dcff;
}
.trainer-label {
  font-size: 0.75rem;
  color: #667eea;
  font-weight: bold;
  flex-shrink: 0;
  padding-top: 2px;
}
.trainer-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}
.trainer-row {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.75rem;
  line-height: 1.3;
}
.trainer-icon {
  width: 18px;
  height: 18px;
  border-radius: 3px;
  flex-shrink: 0;
}
.trainer-icon-placeholder {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #bbb;
  font-size: 0.9rem;
  flex-shrink: 0;
}
.trainer-row.trainer-none .trainer-name {
  color: #aaa;
  font-style: italic;
}
.trainer-name {
  flex: 1;
  color: #555;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.trainer-rate {
  color: #888;
  font-weight: bold;
  flex-shrink: 0;
}

.team-lumis {
  display: flex;
  gap: 15px;
  justify-content: center;
  flex-wrap: wrap;
}

.team-lumi {
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  padding: 10px 12px;
  border-radius: 8px;
  background: #f8f9ff;
  transition: all 0.2s;
  min-width: 160px;
}

.team-lumi:hover {
  background: #e9ecff;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(102, 126, 234, 0.2);
}

.team-lumi-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.team-lumi-avatar {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  object-fit: cover;
  border: 2px solid #e0e0e0;
  flex-shrink: 0;
}

.team-lumi-name {
  font-size: 0.9rem;
  font-weight: bold;
  color: #333;
}

.team-lumi-skills {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-top: 6px;
  border-top: 1px dashed #d8dcff;
}

.skill-row {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.75rem;
  line-height: 1.3;
}

.skill-icon {
  width: 18px;
  height: 18px;
  border-radius: 3px;
  flex-shrink: 0;
}

.skill-icon-placeholder {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #bbb;
  font-size: 0.9rem;
  flex-shrink: 0;
}

.skill-row.skill-none .skill-name {
  color: #aaa;
  font-style: italic;
}

.skill-name {
  flex: 1;
  color: #555;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skill-rate {
  color: #888;
  font-weight: bold;
  flex-shrink: 0;
}

.no-data {
  text-align: center;
  padding: 40px;
  color: #999;
  font-size: 1.1rem;
}

/* 图表容器 */
.chart-container {
  background: white;
  border-radius: 12px;
  padding: 25px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.distribution-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-bottom: 30px;
  padding: 20px;
  background: linear-gradient(135deg, #f8f9ff 0%, #f0f4ff 100%);
  border-radius: 10px;
}

.distribution-stats .stat-card {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 20px;
  background: white;
  border-radius: 10px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
  transition: all 0.3s;
}

.distribution-stats .stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.distribution-stats .stat-icon {
  font-size: 2.5rem;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  flex-shrink: 0;
}

.distribution-stats .stat-card.bronze .stat-icon {
  background: linear-gradient(135deg, #cd7f32 0%, #8b5a2b 100%);
}

.distribution-stats .stat-card.silver .stat-icon {
  background: linear-gradient(135deg, #c0c0c0 0%, #808080 100%);
}

.distribution-stats .stat-card.gold .stat-icon {
  background: linear-gradient(135deg, #ffd700 0%, #daa520 100%);
}

.distribution-stats .stat-card.diamond .stat-icon {
  background: linear-gradient(135deg, #00bfff 0%, #1e90ff 100%);
}

.distribution-stats .stat-card.star .stat-icon {
  background: linear-gradient(135deg, #8a2be2 0%, #4b0082 100%);
}

.distribution-stats .stat-card.legend .stat-icon {
  background: linear-gradient(135deg, #ff4500 0%, #8b0000 100%);
}

.distribution-stats .stat-info {
  flex: 1;
}

.distribution-stats .stat-label {
  font-size: 0.9rem;
  color: #666;
  margin-bottom: 2px;
}

.distribution-stats .stat-desc {
  font-size: 0.8rem;
  color: #999;
  margin-bottom: 5px;
}

.distribution-stats .stat-value {
  font-size: 1.8rem;
  font-weight: bold;
  color: #333;
  margin-bottom: 2px;
}

.distribution-stats .stat-percent {
  font-size: 0.85rem;
  color: #667eea;
  font-weight: bold;
}

.chart-header {
  text-align: center;
  margin-bottom: 20px;
}

.chart-header h3 {
  font-size: 1.3rem;
  color: #333;
  margin-bottom: 5px;
}

.chart-subtitle {
  font-size: 0.9rem;
  color: #999;
}

.chart-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 15px;
}

.chart-title-row > div:first-child {
  text-align: left;
}

.chart-mode-toggle {
  display: flex;
  gap: 10px;
}

.chart-mode-btn {
  padding: 8px 16px;
  border: 2px solid #ddd;
  background: white;
  color: #666;
  font-size: 0.9rem;
  font-weight: bold;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
}

.chart-mode-btn:hover {
  border-color: #667eea;
  background: #f8f9ff;
}

.chart-mode-btn.active {
  border-color: #667eea;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 2px 6px rgba(102, 126, 234, 0.3);
}

/* 参与走势 */
.participation-view {
  max-width: 100%;
}

.participation-date-picker {
  display: flex;
  gap: 15px;
  justify-content: center;
  align-items: center;
  margin-bottom: 20px;
  padding: 15px 20px;
  background: linear-gradient(135deg, #f8f9ff 0%, #f0f4ff 100%);
  border-radius: 12px;
  flex-wrap: wrap;
}
.participation-date-picker label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: bold;
  color: #444;
}
.participation-date-picker .date-label {
  font-size: 0.9rem;
  color: #666;
}
.participation-date-picker input[type="date"] {
  padding: 8px 12px;
  border: 2px solid #ddd;
  border-radius: 8px;
  font-size: 0.95rem;
  cursor: pointer;
  transition: border-color 0.2s;
  background: white;
}
.participation-date-picker input[type="date"]:hover,
.participation-date-picker input[type="date"]:focus {
  border-color: #667eea;
  outline: none;
}
.participation-date-picker .date-sep {
  color: #999;
  font-weight: bold;
}
.participation-date-picker .date-range-hint {
  margin-left: 8px;
  padding: 6px 12px;
  background: #667eea;
  color: white;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: bold;
}

.participation-view-mode {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 20px;
}
.participation-view-mode .view-mode-label {
  font-size: 0.9rem;
  color: #666;
  font-weight: bold;
}
.participation-view-mode .view-mode-btn {
  padding: 7px 16px;
  border: 2px solid #ddd;
  border-radius: 8px;
  background: white;
  color: #666;
  font-size: 0.9rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}
.participation-view-mode .view-mode-btn:hover {
  border-color: #667eea;
  color: #667eea;
}
.participation-view-mode .view-mode-btn.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-color: transparent;
  box-shadow: 0 2px 6px rgba(102, 126, 234, 0.3);
}

.participation-section {
  background: white;
  border-radius: 12px;
  padding: 25px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.participation-chart-block {
  margin-bottom: 32px;
}
.participation-chart-block:last-child {
  margin-bottom: 0;
}
.participation-chart-block h3 {
  font-size: 1.1rem;
  color: #333;
  margin-bottom: 5px;
}

/* 玩法重合率 */
.overlap-day-picker {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: #faf9ff;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 0.9rem;
}

.overlap-date-select {
  padding: 4px 10px;
  border: 1px solid #d0c8f0;
  border-radius: 6px;
  font-size: 0.9rem;
  background: white;
  cursor: pointer;
}

.overlap-day-summary {
  color: #666;
  margin-left: auto;
}

.overlap-day-summary b {
  color: #764ba2;
}

.overlap-body {
  display: grid;
  grid-template-columns: minmax(360px, 480px) 1fr;
  gap: 24px;
  align-items: start;
}

@media (max-width: 900px) {
  .overlap-body {
    grid-template-columns: 1fr;
  }
}

.venn-container {
  display: flex;
  justify-content: center;
  padding: 8px;
  background: #fafaff;
  border-radius: 10px;
}

.venn-container svg {
  max-width: 100%;
  height: auto;
}

.overlap-table-wrap {
  overflow-x: auto;
}

.overlap-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.overlap-table th {
  text-align: left;
  padding: 8px 10px;
  background: #f5f0ff;
  color: #5a3d7a;
  border-bottom: 2px solid #d9c8ff;
  font-weight: 600;
}

.overlap-table td {
  padding: 8px 10px;
  border-bottom: 1px solid #ecebff;
}

.overlap-table td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.overlap-table tr.is-all {
  background: #f9f5ff;
  font-weight: 600;
}

.overlap-color-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 8px;
  vertical-align: middle;
}

.overlap-empty {
  padding: 40px 20px;
  text-align: center;
  color: #999;
  background: #fafaff;
  border-radius: 10px;
}

.overlap-empty-block .chart-subtitle {
  color: #a99cc0;
  font-style: italic;
}

.no-data-box {
  text-align: center;
  padding: 60px 20px;
  background: #f8f9fa;
  border-radius: 12px;
  border: 2px dashed #dee2e6;
}

.no-data-box p {
  margin: 10px 0;
}

.no-data-box p:first-child {
  font-size: 1.2rem;
  font-weight: bold;
  color: #666;
}

.no-data-desc {
  font-size: 0.9rem !important;
  color: #999 !important;
}

.chart-wrapper {
  position: relative;
  width: 100%;
  min-height: 400px;
}

/* 周赛胜场分布样式 */
.tournament-stats {
  grid-template-columns: repeat(5, 1fr) !important;
}

.tournament-stats .stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 15px;
  min-height: 100px;
}

.tournament-stats .stat-card.win-card {
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  transition: all 0.3s;
}

.tournament-stats .stat-card.win-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.tournament-stats .stat-card.win-card.legendary {
  background: linear-gradient(135deg, #ff6b6b 0%, #ffd93d 100%);
  border-color: #ff6b6b;
}

.tournament-stats .stat-card.win-card.excellent {
  background: linear-gradient(135deg, #ffd93d 0%, #ff9f1c 100%);
  border-color: #ffd93d;
}

.tournament-stats .stat-card.win-card.good {
  background: linear-gradient(135deg, #a8e6cf 0%, #88d8b0 100%);
  border-color: #a8e6cf;
}

.tournament-stats .stat-card.win-card.average {
  background: linear-gradient(135deg, #e0e0e0 0%, #c0c0c0 100%);
  border-color: #c0c0c0;
}

.tournament-stats .stat-card.win-card.beginner {
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  border-color: #dee2e6;
}

.tournament-stats .stat-icon {
  font-size: 2rem;
  margin-bottom: 8px;
}

.tournament-stats .stat-label {
  font-size: 0.9rem;
  font-weight: bold;
  color: #666;
  margin-bottom: 5px;
}

.tournament-stats .stat-value {
  font-size: 1.5rem;
  font-weight: bold;
  color: #333;
  margin-bottom: 3px;
}

.tournament-stats .stat-percent {
  font-size: 0.8rem;
  color: #888;
}

/* 总人数卡片 */
.total-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
  border: none !important;
}

.total-card .stat-icon {
  font-size: 2.5rem;
  margin-bottom: 5px;
}

.total-card .stat-label {
  color: rgba(255, 255, 255, 0.9) !important;
  font-weight: bold;
}

.total-card .stat-desc {
  color: rgba(255, 255, 255, 0.7) !important;
  font-size: 0.8rem;
}

.total-card .stat-value {
  color: white !important;
  font-size: 2rem !important;
}

/* 响应式 */
@media (max-width: 768px) {
  .page-header h1 {
    font-size: 1.8rem;
  }

  .week-selector {
    flex-direction: column;
    align-items: stretch;
  }

  .filters {
    flex-direction: column;
    align-items: center;
  }

  .stats-overview {
    flex-direction: column;
    align-items: center;
  }

  .distribution-stats {
    grid-template-columns: repeat(2, 1fr);
    gap: 15px;
  }

  table {
    font-size: 0.9rem;
  }

  .lumi-avatar {
    width: 40px;
    height: 40px;
  }
}
</style>
