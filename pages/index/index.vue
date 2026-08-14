<template>
<view class="page-shell" :style="'height: ' + (pageShellHeight) + 'px;'">
  <view class="workspace" :style="'padding-top: ' + (workspaceTopPadding) + 'px; padding-bottom: ' + (workspaceBottomPadding) + 'px;'">
    <template v-if="currentTab !== 'settings'">
    <view :class="'sidebar ' + (sidebarCollapsed ? 'sidebar--collapsed' : '')">
      <template v-if="sidebarCollapsed">
        <view class="sidebar__expand" @tap="onToggleSidebar">
          <text>展</text>
          <text>开</text>
          <text>列</text>
          <text>表</text>
        </view>
      </template>
      <template v-else>
        <view class="sidebar__header">
          <view class="sidebar__title">卡组</view>
          <view class="sidebar__toggle" @tap="onToggleSidebar">◀</view>
        </view>
        <scroll-view class="sidebar__list" scroll-y>
          <view v-for="(item, index) in sidebarDecks" :key="item.id" :class="'deck-item ' + (selectedDeckId === item.id ? 'is-active' : '')" :data-id="item.id" @tap="onSelectDeck">
            <view class="deck-item__row">
              <view class="deck-item__name">{{item.deckName}}</view>
            </view>
            <view class="deck-item__meta">{{item.totalGames || 0}} 场</view>
          </view>
        </scroll-view>
        <view class="sidebar__add" @tap="openCreateRecord">
          <view class="sidebar__add-icon">+</view>
          <view class="sidebar__add-text">新增战绩</view>
        </view>
      </template>
    </view>

    <view class="content">
      <view class="content__hero">
        <view v-if="currentStreakLabel" class="content__hero-streak">{{currentStreakLabel}}</view>
        <view class="content__hero-collapse" @tap="toggleHeroCollapsed">{{heroCollapsed ? '展开' : '折叠'}}</view>
        <view class="content__hero-head">
          <view class="content__hero-tag">{{selectedDeckName}}</view>
          <view v-if="!heroCollapsed && currentTab === 'stats' && selectedDeckId === 'all'" class="content__hero-inline-stat">
            卡组数 {{statistics.overall.deckCount}}
          </view>
          <view v-if="!liteEdition && !heroCollapsed && currentMatchFormat === 'md' && currentMdAccountName && (currentTab === 'records' || currentTab === 'stats')" class="content__hero-account">
            账号 · {{currentMdAccountName}}
          </view>
        </view>
        <view v-if="!heroCollapsed && currentTab === 'stats'" class="stats-toggles">
          <view v-if="!liteEdition" class="stats-toggle" @tap="onToggleOpponentDeckStats">
            <view :class="'stats-toggle__box ' + (opponentDeckStatsEnabled ? 'is-active' : '')">
              <view v-if="opponentDeckStatsEnabled" class="stats-toggle__dot"></view>
            </view>
            <view class="stats-toggle__label">对手卡组占比</view>
          </view>
          <view class="stats-toggle" @tap="onToggleStatsTodayOnly">
            <view :class="'stats-toggle__box ' + (statsTodayOnly ? 'is-active' : '')">
              <view v-if="statsTodayOnly" class="stats-toggle__dot"></view>
            </view>
            <view class="stats-toggle__label">只看今日</view>
          </view>
          <view v-if="!liteEdition && opponentDeckStatsEnabled" class="stats-toggle" @tap="onTogglePieChart">
            <view :class="'stats-toggle__box ' + (pieChartEnabled ? 'is-active' : '')">
              <view v-if="pieChartEnabled" class="stats-toggle__dot"></view>
            </view>
            <view class="stats-toggle__label">查看饼图</view>
          </view>
        </view>
        <view v-if="!heroCollapsed" class="format-switcher">
          <view v-for="(item, index) in matchFormats" :key="item.key" :class="'format-switcher__item ' + (currentMatchFormat === item.key ? 'is-active' : '')" :data-format="item.key" @tap="onSwitchMatchFormat">
            {{item.label}}
          </view>
        </view>
        <view v-if="!heroCollapsed" class="content__hero-main">
          <view class="content__hero-title">{{currentTabTitle}}</view>
          <view class="content__hero-filters">
            <view v-if="currentTab === 'records' || currentTab === 'stats'" class="content__hero-filter" @tap="openStatsMatchTypePicker">对战类型 · {{currentMatchTypeFilterLabel}}</view>
            <picker v-if="currentTab === 'records' || (currentTab === 'stats' && (liteEdition || (!opponentDeckStatsEnabled && !statsTodayOnly)))" mode="selector" :range="monthFilterOptions" range-key="itemLabel" :value="monthFilterIndex" @change="onMonthFilterChange">
              <view class="content__hero-filter">{{currentMonthFilterLabel}}</view>
            </picker>
          </view>
        </view>
      </view>

      <view v-if="errorMessage" class="feedback feedback--error">{{errorMessage}}</view>
      <view v-if="pageLoading || contentLoading" class="feedback">正在加载数据...</view>

      <scroll-view v-if="!pageLoading && !contentLoading" class="content__scroll" scroll-y :refresher-enabled="currentTab === 'records'" :refresher-triggered="recordsRefreshing" @refresherrefresh="onRecordsRefresherRefresh">
        <template v-if="currentTab === 'records'">
          <view v-if="records.length" class="record-list">
            <view v-for="(item, index) in records" :key="item.id" :class="'record-card ' + (item.cardClass)">
              <view class="record-card__top">
                <view class="record-card__title-group">
                  <view class="record-card__title">{{item.deckName}}</view>
                  <view class="record-card__badge">{{item.resultLabel}}</view>
                </view>
                <view class="record-card__actions">
                  <view class="record-card__edit" :data-id="item.id" @tap.stop="openEditRecord">
                    修改
                  </view>
                  <view class="record-card__delete" :data-id="item.id" :data-name="item.metaText" @tap.stop="deleteRecord">
                    删除
                  </view>
                </view>
              </view>
              <view class="record-card__meta">{{item.metaText}}</view>
              <view class="record-card__chips">
                <view :class="'record-chip ' + (item.coinClass)">{{item.coinLabel}}</view>
                <view v-if="item.matchFormat === 'ocg'" class="record-chip">三局：{{item.ocgGameSummary}}</view>
                <view v-if="!liteEdition" v-for="(metricChip, index) in item.metricChips" :key="metricChip" class="record-chip">
                  {{metricChip}}
                </view>
                <view v-if="!liteEdition && item.mdAccount" class="record-chip">账号：{{item.mdAccount}}</view>
              </view>
              <view v-if="!liteEdition && item.opponentDeck" class="record-card__opponent">
                <view class="record-card__opponent-bar"></view>
                <view class="record-card__opponent-label">对手</view>
                <view class="record-card__opponent-name">{{item.opponentDeck}}</view>
              </view>
              <view v-if="!liteEdition && item.failureReasons && item.failureReasons.length" class="record-card__failure">
                <view class="record-card__failure-label">失败原因</view>
                <view class="record-card__failure-list">
                  <view v-for="(reason, reasonIndex) in (item.failureReasonsExpanded ? item.failureReasons : item.failureReasons.slice(0, 1))" :key="reason + reasonIndex" class="record-chip record-chip--failure">{{reason}}</view>
                </view>
                <view v-if="item.failureReasons.length > 1" class="record-card__failure-toggle" :data-id="item.id" @tap.stop="toggleRecordFailureReasons">{{item.failureReasonsExpanded ? '收起' : `+${item.failureReasons.length - 1}`}}</view>
              </view>
              <view v-if="item.remark" class="record-card__remark">{{item.remark}}</view>
              <view class="record-card__footer">
                <view class="record-card__time">{{item.hasEdited ? '修改于 ' : ''}}{{item.timeLabel}}</view>
                <view v-if="item.hasEdited" class="record-card__history" :data-id="item.id" @tap.stop="showEditHistory">
                  修改记录
                </view>
              </view>
            </view>
            <view v-if="recordsHasMore" class="records-load-more" @tap="onLoadMoreRecords">
              加载更多（已显示 {{records.length}} 条）
            </view>
          </view>
          <view v-else class="empty-state">
            <view class="empty-state__title">还没有战绩</view>
            <view class="empty-state__desc">先从左下角录入一场对局，列表会显示在这里。</view>
          </view>
        </template>

        <template v-if="currentTab === 'stats'">
          <view v-if="!liteEdition && opponentDeckStatsEnabled" class="stats-controls">
            <template v-if="opponentDeckStatsEnabled">
              <picker v-if="!statsTodayOnly" mode="multiSelector" :range="statsMonthRangeColumns" :value="statsMonthRangeIndices" @change="onStatsMonthRangeChange">
                <view class="content__hero-filter content__hero-filter--range stats-controls__range-picker">
                  月份范围 · {{statsMonthRangeLabel}}
                </view>
              </picker>
              <view class="stats-mode-switcher">
                <view v-for="(item, index) in statsOpponentDeckModeOptions" :key="item.key" :class="'stats-mode-switcher__item ' + (statsOpponentDeckMode === item.key ? 'is-active' : '')" :data-mode="item.key" @tap="onSwitchStatsOpponentDeckMode">
                  {{item.label}}
                </view>
              </view>
            </template>
          </view>

          <view class="stats-grid">
            <view class="stats-card">
              <view class="stats-card__label">总场次</view>
              <view class="stats-card__value">{{statistics.overall.totalGames}}</view>
            </view>
            <view class="stats-card">
              <view class="stats-card__label">胜场</view>
              <view class="stats-card__value">{{statistics.overall.winCount}}</view>
            </view>
            <view v-if="currentMatchFormat === 'ocg'" class="stats-card">
              <view class="stats-card__label">平局</view>
              <view class="stats-card__value">{{statistics.overall.drawCount}}</view>
            </view>
            <view class="stats-card">
              <view class="stats-card__label">胜率</view>
              <view :class="'stats-card__value ' + (statistics.overall.winRateClass)">{{statistics.overall.winRate}}</view>
              <view class="stats-card__ratio">{{statistics.overall.winRateRatio}}</view>
            </view>
            <view class="stats-card">
              <view class="stats-card__label">赢骰率</view>
              <view :class="'stats-card__value ' + (statistics.overall.coinWinRateClass)">{{statistics.overall.coinWinRate}}</view>
              <view class="stats-card__ratio">{{statistics.overall.coinWinRateRatio}}</view>
            </view>
            <view class="stats-card">
              <view class="stats-card__label">胜率（赢骰）</view>
              <view :class="'stats-card__value ' + (statistics.overall.winRateWhenCoinWinClass)">{{statistics.overall.winRateWhenCoinWin}}</view>
              <view class="stats-card__ratio">{{statistics.overall.winRateWhenCoinWinRatio}}</view>
            </view>
            <view class="stats-card">
              <view class="stats-card__label">胜率（输骰）</view>
              <view :class="'stats-card__value ' + (statistics.overall.winRateWhenCoinLossClass)">{{statistics.overall.winRateWhenCoinLoss}}</view>
              <view class="stats-card__ratio">{{statistics.overall.winRateWhenCoinLossRatio}}</view>
            </view>
            <view v-if="!liteEdition && selectedDeckId !== 'all'" class="stats-card">
              <view class="stats-card__label">动点率</view>
              <view :class="'stats-card__value ' + (statistics.overall.hasStarterRateClass)">{{statistics.overall.hasStarterRate}}</view>
              <view class="stats-card__ratio">{{statistics.overall.hasStarterRateRatio}}</view>
            </view>
            <view v-if="!liteEdition && selectedDeckId !== 'all'" class="stats-card">
              <view class="stats-card__label">平均动点数</view>
              <view class="stats-card__value">{{statistics.overall.averageStarterCount}}</view>
              <view class="stats-card__ratio">{{statistics.overall.averageStarterCountRatio}}</view>
            </view>
            <view v-if="!liteEdition && selectedDeckId !== 'all'" class="stats-card">
              <view class="stats-card__label">平均手坑数</view>
              <view class="stats-card__value">{{statistics.overall.averageHandTrapCount}}</view>
              <view class="stats-card__ratio">{{statistics.overall.averageHandTrapCountRatio}}</view>
            </view>
            <view v-if="!liteEdition && selectedDeckId !== 'all'" class="stats-card">
              <view class="stats-card__label">平均废件数</view>
              <view class="stats-card__value">{{statistics.overall.averageBrickCount}}</view>
              <view class="stats-card__ratio">{{statistics.overall.averageBrickCountRatio}}</view>
            </view>
          </view>

          <view class="section-panel">
            <view class="section-panel__title">
              {{!liteEdition && opponentDeckStatsEnabled ? currentStatsOpponentDeckModeLabel : '卡组胜率'}}
            </view>
            <template v-if="!liteEdition && opponentDeckStatsEnabled">
              <template v-if="pieChartEnabled">
                <view v-if="pieChartLegend.length" class="pie-chart__wrap">
                  <view class="pie-chart__total-row">
                    <view class="pie-chart__total">共 {{pieChartTotalGames}} 场对局</view>
                    <view class="pie-chart__help" aria-label="查看饼图统计规则" @tap="openPieChartRules">?</view>
                  </view>
                  <view class="pie-chart__canvas" :style="'background: ' + (pieChartGradient) + ';'">
                  </view>
                  <view class="pie-chart__legend">
                    <view v-for="(item, index) in pieChartLegend" :key="item.opponentDeck" class="pie-chart__legend-item">
                      <view :class="'pie-chart__legend-color ' + (item.customizable ? 'is-editable' : '')" :style="'background: ' + (item.color) + ';'" :data-index="index" @tap="onPieChartColorTap"></view>
                      <view class="pie-chart__legend-name">{{item.opponentDeck}}</view>
                      <view class="pie-chart__legend-share">{{item.shareRate}}</view>
                      <view v-if="item.customizable" class="pie-chart__legend-action" :data-index="index" @tap="onPieChartColorTap">换色</view>
                    </view>
                  </view>
                </view>
                <view v-else class="empty-state empty-state--small">
                  <view class="empty-state__title">暂无统计数据</view>
                  <view class="empty-state__desc">录入并填写对手卡组后，这里会显示对应占比。</view>
                </view>
              </template>
              <template v-else>
                <view v-if="statsOpponentDeckList.length" class="stats-list">
                  <view v-for="(item, index) in statsOpponentDeckList" :key="item.opponentDeck" class="stats-list__item">
                    <view class="stats-list__content">
                      <view class="stats-list__name">{{item.opponentDeck}}</view>
                      <view class="stats-list__sub">{{item.matchCount}} 场 · {{item.coinSummary}}</view>
                    </view>
                    <view class="stats-list__metrics">
                      <view class="stats-list__metric-label">占比</view>
                      <view :class="'stats-list__metric-value ' + (item.shareClass)">{{item.shareRate}}</view>
                      <view class="stats-list__metric-label">胜率</view>
                      <view :class="'stats-list__metric-value ' + (item.winRateClass)">{{item.winRate}}</view>
                    </view>
                  </view>
                </view>
                <view v-else class="empty-state empty-state--small">
                  <view class="empty-state__title">暂无统计数据</view>
                  <view class="empty-state__desc">录入并填写对手卡组后，这里会显示对应占比。</view>
                </view>
              </template>
            </template>
            <template v-else>
              <view v-if="statistics.byDeck.length" class="stats-list">
                <view v-for="(item, index) in statistics.byDeck" :key="item.deckId" class="stats-list__item">
                  <view>
                    <view class="stats-list__name">{{item.deckName}}</view>
                    <view class="stats-list__sub">{{item.totalGames}} 场 · {{item.winCount}} 胜</view>
                  </view>
                  <view :class="'stats-list__value ' + (item.winRateClass)">{{item.winRate}}</view>
                </view>
              </view>
              <view v-else class="empty-state empty-state--small">
                <view class="empty-state__title">暂无统计数据</view>
                <view class="empty-state__desc">录入战绩后，这里会自动生成统计结果。</view>
              </view>
            </template>
          </view>
          <view v-if="!liteEdition" class="section-panel failure-stats-panel">
            <view class="section-panel__title">失败原因占比</view>
            <view v-if="failureReasonStats.length" class="stats-list">
              <view v-for="item in failureReasonStats" :key="item.name" class="stats-list__item">
                <view><view class="stats-list__name">{{item.name}}</view><view class="stats-list__sub">{{item.count}} 次</view></view>
                <view class="stats-list__value">{{item.shareRate}}</view>
              </view>
            </view>
            <view v-else class="empty-state empty-state--small"><view class="empty-state__desc">暂无失败原因记录</view></view>
          </view>
        </template>

      </scroll-view>
    </view>
    </template>

    <view v-if="currentTab === 'settings'" class="content content--full">
      <view v-if="errorMessage" class="feedback feedback--error">{{errorMessage}}</view>
      <view v-if="pageLoading || contentLoading || settingsLoading" class="feedback">正在加载数据...</view>

      <view v-if="!pageLoading && !contentLoading && !settingsLoading" class="format-switcher format-switcher--top">
        <view v-for="(item, index) in matchFormats" :key="item.key" :class="'format-switcher__item ' + (currentMatchFormat === item.key ? 'is-active' : '')" :data-format="item.key" @tap="onSwitchMatchFormat">
          {{item.label}}
        </view>
      </view>

      <view v-if="!pageLoading && !contentLoading && !settingsLoading" class="settings-switcher settings-switcher--floating">
        <view v-for="(item, index) in settingSections" :key="item.key" :class="'settings-switcher__item ' + (currentSettingSection === item.key ? 'is-active' : '')" :data-section="item.key" @tap="onSwitchSettingSection">
          {{item.label}}
        </view>
      </view>

      <scroll-view v-if="!pageLoading && !contentLoading && !settingsLoading" class="content__scroll content__scroll--settings" scroll-y>
        <template v-if="currentSettingSection === 'decks'">
          <view class="section-panel section-panel--action">
            <view>
              <view class="section-panel__title">卡组管理</view>
              <view class="section-panel__desc">维护你当前常用的卡组，右侧会显示累计场次。</view>
            </view>
            <button class="section-panel__button" @tap="openCreateDeck">新增卡组</button>
          </view>

          <view v-if="decks.length" class="deck-manage-list">
            <view v-for="(item, index) in decks" :key="item.id" class="deck-manage-card">
              <view class="settings-item__content">
                <view class="deck-manage-card__name">{{item.deckName}}</view>
                <view class="deck-manage-card__meta">累计 {{item.totalGames || 0}} 场</view>
              </view>
              <view class="settings-item__actions">
                <view class="settings-item__edit settings-item__edit--wide" :data-id="item.id" :data-name="item.deckName" @tap.stop="openDeckBuilder">
                  构成
                </view>
                <view class="settings-item__edit" :data-id="item.id" :data-name="item.deckName" @tap.stop="updateDeck">
                  修改
                </view>
                <view class="settings-item__delete" :data-id="item.id" :data-name="item.deckName" @tap.stop="deleteDeck">
                  删除
                </view>
              </view>
            </view>
          </view>
        </template>

        <template v-if="currentSettingSection === 'matchTypes'">
          <view class="section-panel section-panel--action">
            <view>
              <view class="section-panel__title">对战类型管理</view>
              <view class="section-panel__desc">这里维护新增战绩时可用的对战类型。</view>
            </view>
            <button class="section-panel__button" @tap="createMatchType">新增类型</button>
          </view>

          <view v-if="matchTypes.length" class="settings-list">
            <view v-for="(item, index) in matchTypes" :key="item.id" class="settings-item">
              <view class="settings-item__content">
                <view class="settings-item__name">{{item.itemLabel}}</view>
                <view class="settings-item__meta">{{item.itemValue}}</view>
              </view>
              <view class="settings-item__actions">
                <view class="settings-item__edit" :data-id="item.id" :data-name="item.itemLabel" :data-sort="item.sortOrder" @tap.stop="updateMatchType">
                  修改
                </view>
                <view class="settings-item__delete" :data-id="item.id" :data-name="item.itemLabel" @tap.stop="deleteMatchType">
                  删除
                </view>
              </view>
            </view>
          </view>
        </template>

        <template v-if="currentSettingSection === 'months'">
          <view class="section-panel section-panel--action">
            <view>
              <view class="section-panel__title">月份管理</view>
              <view class="section-panel__desc">这里维护筛选用月份，也可以清理不再需要的月份项。</view>
            </view>
            <button class="section-panel__button" @tap="createMonth">新增月份</button>
          </view>

          <view v-if="monthItems.length" class="settings-list">
            <view v-for="(item, index) in monthItems" :key="item.id" class="settings-item">
              <view class="settings-item__content">
                <view class="settings-item__name">{{item.itemLabel}}</view>
                <view class="settings-item__meta">{{item.itemValue}}</view>
              </view>
              <view class="settings-item__actions">
                <view class="settings-item__edit" :data-id="item.id" :data-name="item.itemValue" :data-sort="item.sortOrder" @tap.stop="updateMonth">
                  修改
                </view>
                <view class="settings-item__delete" :data-id="item.id" :data-name="item.itemLabel" @tap.stop="deleteMonth">
                  删除
                </view>
              </view>
            </view>
          </view>
        </template>

        <template v-if="!liteEdition && currentSettingSection === 'mdAccounts'">
          <view class="section-panel section-panel--action">
            <view>
              <view class="section-panel__title">MD账号管理</view>
              <view class="section-panel__desc">多账号玩家可在这里维护账号并选择“使用中”账号：新战绩自动记录到使用中的账号，战绩与统计也按该账号展示。仅 MD 赛制可用。</view>
            </view>
            <button class="section-panel__button" @tap="createMdAccount">新增账号</button>
          </view>

          <view v-if="mdAccounts.length" class="settings-list">
            <view v-for="(item, index) in mdAccounts" :key="item.id" class="settings-item">
              <view class="settings-item__content">
                <view class="settings-item__name">
                  {{item.itemLabel}}
                  <text v-if="item.id === currentMdAccountId" class="settings-item__badge">使用中</text>
                </view>
                <view class="settings-item__meta">{{item.id === currentMdAccountId ? '新战绩将记录到该账号' : '点“使用”切换到该账号'}}</view>
              </view>
              <view class="settings-item__actions">
                <view v-if="item.id !== currentMdAccountId" class="settings-item__edit" :data-id="item.id" :data-name="item.itemLabel" @tap.stop="onSelectMdAccount">
                  使用
                </view>
                <view class="settings-item__edit" :data-id="item.id" :data-name="item.itemLabel" @tap.stop="openMdAccountMigrate">
                  迁移数据
                </view>
                <view class="settings-item__edit" :data-id="item.id" :data-name="item.itemLabel" :data-sort="item.sortOrder" @tap.stop="updateMdAccount">
                  修改
                </view>
                <view class="settings-item__delete" :data-id="item.id" :data-name="item.itemLabel" @tap.stop="deleteMdAccount">
                  删除
                </view>
              </view>
            </view>
          </view>

          <view v-else class="empty-state">
            <view class="empty-state__title">暂无账号</view>
            <view class="empty-state__desc">新增账号后会自动设为使用中，新战绩将归属该账号；还可通过“迁移数据”把历史无归属战绩迁入账号。</view>
          </view>
        </template>

        <template v-if="!liteEdition && currentSettingSection === 'recordFields'">
          <view class="section-panel">
            <view class="section-panel__title">新增战绩默认录入项</view>
            <view class="section-panel__desc">
              这里控制新增战绩页默认显示哪些额外记录项，同时作用于 MD 和 OCG。固定必填项始终显示：当前模式、卡组、月份、对战类型、骰子结果、胜负结果；新增战绩页里也可以临时展开全部选项。
            </view>
          </view>

          <view class="settings-list">
            <view v-for="(item, index) in recordFieldSettingItems" :key="item.key" class="settings-item settings-item--switch">
              <view class="settings-item__content">
                <view class="settings-item__name">{{item.label}}</view>
                <view class="settings-item__meta">{{item.description}}</view>
              </view>
              <switch :checked="item.checked" color="#c65d2e" :data-key="item.key" @change="onToggleRecordFieldVisibility" />
            </view>
          </view>
        </template>

        <template v-if="!liteEdition && currentSettingSection === 'opponentDeckCategories'">
          <view class="section-panel section-panel--action">
            <view>
              <view class="section-panel__title">对手卡组归类</view>
              <view class="section-panel__desc">将名称相近的对手卡组归为一类，统计时会自动合并计算占比。</view>
            </view>
            <button class="section-panel__button" @tap="openCreateOpponentDeckCategory">新增归类</button>
          </view>

          <view v-if="opponentDeckCategories.length" class="settings-list">
            <view v-for="(item, index) in opponentDeckCategories" :key="item.id" class="settings-item">
              <view class="settings-item__content">
                <view class="settings-item__name">{{item.categoryName}}</view>
                <view class="settings-item__meta">
                  关联 {{item.deckNames.length || 0}} 个卡组
                  <template v-if="item.deckNames.length">：{{item.deckNames[0]}}<text v-if="item.deckNames.length > 1">、{{item.deckNames[1]}}<text v-if="item.deckNames.length > 2">、{{item.deckNames[2]}}<text v-if="item.deckNames.length > 3"> 等</text></text></text></template>
                </view>
              </view>
              <view class="settings-item__actions">
                <view class="settings-item__edit" :data-id="item.id" @tap.stop="openEditOpponentDeckCategory">
                  编辑
                </view>
                <view class="settings-item__delete" :data-id="item.id" :data-name="item.categoryName" @tap.stop="deleteOpponentDeckCategory">
                  删除
                </view>
              </view>
            </view>
          </view>

          <view v-else class="empty-state">
            <view class="empty-state__title">暂无归类</view>
            <view class="empty-state__desc">添加归类后，统计时相近的对手卡组会自动归并计算。</view>
          </view>
        </template>

        <template v-if="!liteEdition && currentSettingSection === 'failureReasons'">
          <view class="section-panel section-panel--action"><view><view class="section-panel__title">失败原因归类</view><view class="section-panel__desc">将相近的失败原因归为一类，统计时会自动合并计算占比。</view></view><button class="section-panel__button" @tap="openCreateFailureReasonCategory">新增归类</button></view>
          <view v-if="failureReasonCategories.length" class="settings-list">
            <view v-for="item in failureReasonCategories" :key="item.id" class="settings-item"><view class="settings-item__content"><view class="settings-item__name">{{item.categoryName}}</view><view class="settings-item__meta">{{(item.reasonNames || []).join('、') || '暂无原因'}}</view></view><view class="settings-item__actions"><view class="settings-item__edit" :data-id="item.id" @tap.stop="openEditFailureReasonCategory">编辑</view><view class="settings-item__delete" :data-id="item.id" :data-name="item.categoryName" @tap.stop="deleteFailureReasonCategory">删除</view></view></view>
          </view>
          <view v-else class="empty-state"><view class="empty-state__title">暂无归类</view><view class="empty-state__desc">录入失败原因后，可在这里把相近原因归为一类。</view></view>
        </template>

        <template v-if="currentSettingSection === 'data'">
          <view class="section-panel">
            <view class="section-panel__title">数据导入</view>
            <view class="section-panel__desc">可导入完整版或旧设备导出的 JSON 备份，或导入 CSV 合并历史战绩。JSON 将覆盖当前数据，CSV 仅合并新增记录。</view>
            <view class="section-panel__buttons section-panel__buttons--below">
              <button class="section-panel__button" :loading="backupImporting" @tap="openBackupImport">选择并导入文件</button>
            </view>
            <view v-if="backupSummaryText" class="section-panel__result">
              <text class="section-panel__desc section-panel__result-text" selectable>{{backupSummaryText}}</text>
              <button class="section-panel__copy" @tap="copyBackupSummaryText">复制提示</button>
            </view>
          </view>

          <view v-if="!liteEdition" class="section-panel section-panel--action">
            <view>
              <view class="section-panel__title">战绩导出 CSV</view>
              <view class="section-panel__desc">导出当前赛制（{{currentMatchFormatLabel}}）下的全部战绩为 CSV 文件，生成后保存到系统「下载」目录，可在文件管理器中查看。</view>
            </view>
            <button class="section-panel__button" :loading="recordExporting" @tap="exportCurrentFormatRecords">
              导出战绩
            </button>
            <view v-if="csvExportText" class="section-panel__result">
              <text class="section-panel__desc section-panel__result-text" selectable>{{csvExportText}}</text>
              <button class="section-panel__copy" @tap="copyCsvExportText">复制提示</button>
            </view>
          </view>
        </template>

      <template v-if="currentSettingSection === 'about'">
          <view class="section-panel">
            <view class="section-panel__title">关于本应用</view>
            <view class="section-panel__desc">
              精简版用于记录 MD / OCG 对局的基本战绩与胜负统计。数据仅保存在本机，不上传云端。
            </view>
          </view>
        </template>

      </scroll-view>
    </view>
  </view>

  <view class="bottom-tabs" :style="safeAreaBottom ? 'bottom:' + safeAreaBottom + 'px;' : ''">
    <view v-for="(item, index) in tabs" :key="item.key" :class="'bottom-tabs__item ' + (currentTab === item.key ? 'is-active' : '')" :data-tab="item.key" @tap="onSwitchTab">
      <view class="bottom-tabs__label">{{item.label}}</view>
    </view>
  </view>

  <view v-if="deckNameDialogVisible" class="overlay" @tap="closeDeckNameDialog">
    <view class="sheet sheet--compact" @tap.stop="noop">
      <view class="sheet__header">
        <view class="sheet__title">{{deckNameDialogTitle}}</view>
        <view class="sheet__close" @tap="closeDeckNameDialog">关闭</view>
      </view>

      <input class="sheet__input deck-name-dialog__input" :value="deckNameDialogValue" :maxlength="deckNameMaxLength" :focus="deckNameDialogVisible" :placeholder="deckNameDialogPlaceholder" confirm-type="done" @input="onDeckNameDialogInput" @confirm="confirmDeckNameDialog" />

      <button class="sheet__submit" @tap="confirmDeckNameDialog">确定</button>
    </view>
  </view>

  <view v-if="mdMigrateVisible" class="overlay" @tap="closeMdMigratePopup">
    <view class="sheet" @tap.stop="noop">
      <view class="sheet__header">
        <view class="sheet__title">迁移数据到「{{mdMigrateAccountName}}」</view>
        <view class="sheet__close" @tap="closeMdMigratePopup">关闭</view>
      </view>

      <view class="md-migrate__hint">仅可迁移未归属账号的 MD 战绩，迁移后将归入该账号。</view>

      <view class="stats-mode-switcher md-migrate__modes">
        <view v-for="(item, index) in mdMigrateModeOptions" :key="item.key" :class="'stats-mode-switcher__item ' + (mdMigrateMode === item.key ? 'is-active' : '')" :data-mode="item.key" @tap="onMdMigrateModeChange">
          {{item.label}}
        </view>
      </view>

      <view v-if="mdMigrateLoading" class="feedback">正在加载无归属战绩...</view>

      <template v-else>
        <scroll-view v-if="mdMigrateMode !== 'record' && mdMigrateGroups.length" class="md-migrate__list" scroll-y>
          <view v-for="(item, index) in mdMigrateGroups" :key="item.key" :class="'md-migrate__item ' + (item.checked ? 'is-active' : '')" :data-key="item.key" @tap="onToggleMdMigrateGroup">
            <view class="md-migrate__item-name">{{item.label}}</view>
            <view class="md-migrate__item-meta">{{item.count}} 条</view>
          </view>
        </scroll-view>

        <scroll-view v-if="mdMigrateMode === 'record' && mdMigrateRecords.length" class="md-migrate__list" scroll-y>
          <view v-for="(item, index) in mdMigrateRecords" :key="item.id" :class="'md-migrate__item ' + (item.checked ? 'is-active' : '')" :data-id="item.id" @tap="onToggleMdMigrateRecord">
            <view class="md-migrate__item-name">{{item.label}}</view>
            <view class="md-migrate__item-meta">{{item.timeLabel}}</view>
          </view>
        </scroll-view>

        <view v-if="(mdMigrateMode === 'record' && !mdMigrateRecords.length) || (mdMigrateMode !== 'record' && !mdMigrateGroups.length)" class="empty-state">
          <view class="empty-state__title">没有可迁移的战绩</view>
          <view class="empty-state__desc">当前没有未归属账号的 MD 战绩。</view>
        </view>

        <view v-if="(mdMigrateMode === 'record' && mdMigrateRecords.length) || (mdMigrateMode !== 'record' && mdMigrateGroups.length)" class="md-migrate__footer">
          <view class="sheet__side-button" @tap="onMdMigrateSelectAll">全选/取消</view>
          <button class="sheet__submit md-migrate__submit" :loading="mdMigrateSubmitting" @tap="confirmMdAccountMigrate">
            迁移选中（{{mdMigrateSelectedCount}} 条）
          </button>
        </view>
      </template>
    </view>
  </view>

  <view v-if="recordPopupVisible" class="overlay overlay--record" @tap="closeCreateRecord">
    <view class="sheet sheet--record" @tap.stop="noop" @touchmove="onPageTouchMove">
      <view class="sheet__header">
        <view class="sheet__title" @tap="closeCreateRecord">{{recordPopupMode === 'edit' ? '修改战绩' : '新增战绩'}}</view>
        <view class="sheet__close" @tap="closeCreateRecord">关闭</view>
      </view>

      <view class="sheet__label">当前模式 <text class="sheet__label-required">必填</text></view>
      <view class="sheet__picker">{{currentMatchFormatLabel}}</view>

      <view class="sheet__label">选择卡组 <text class="sheet__label-required">必填</text></view>
      <view class="choice-row-wrap">
        <view id="record-deck-choice-row" :class="'choice-row ' + (recordDeckListOverflow && recordDeckListCollapsed ? 'choice-row--collapsed' : '')">
          <view v-for="(item, index) in decks" :key="item.id" :class="'choice-pill record-deck-choice-pill ' + (recordDeckId === item.id ? 'is-active' : '')" :data-id="item.id" @tap="onRecordDeckChange">
            {{item.deckName}}
          </view>
        </view>
        <view v-if="recordDeckListOverflow" class="choice-row__toggle" @tap="toggleRecordDeckListCollapsed">
          {{recordDeckListCollapsed ? '展开全部卡组' : '收起卡组'}}
        </view>
      </view>

      <view class="sheet__label">对局月份 <text class="sheet__label-required">必填</text></view>
      <picker mode="selector" :range="monthItems" range-key="itemLabel" :value="recordMonthIndex" @change="onRecordMonthChange">
        <view class="sheet__picker">{{currentRecordMonthLabel}}</view>
      </picker>

      <template v-if="recordShowAllOptionalFields || recordFieldVisibility.dayOfWeek">
      <view class="sheet__label">日期</view>
      <view :class="'sheet__picker ' + (recordDayIndex === 0 ? 'is-empty' : '')" @tap="openRecordDayCalendar">
        {{currentRecordDayLabel}}
      </view>
      </template>

      <view class="sheet__label">对战类型 <text class="sheet__label-required">必填</text></view>
      <view class="sheet__picker" @tap="openRecordMatchTypePicker">{{currentRecordMatchTypeLabel}}</view>

      <view class="sheet__label">骰子结果 <text class="sheet__label-required">必填</text></view>
      <view class="segment">
        <view :class="'segment__item ' + (recordCoinResult === 1 ? 'is-active' : '')" data-field="recordCoinResult" data-value="1" @tap="onToggleRecordField">赢骰</view>
        <view :class="'segment__item ' + (recordCoinResult === 0 ? 'is-active' : '')" data-field="recordCoinResult" data-value="0" @tap="onToggleRecordField">输骰</view>
      </view>

      <view v-if="recordHasHiddenOptionalFields" class="sheet__toggle-all" @tap="toggleRecordOptionalFieldsExpanded">
        {{recordShowAllOptionalFields ? '收起额外记录项' : '展开全部记录项'}}
      </view>

      <template v-if="!liteEdition && (recordShowAllOptionalFields || recordFieldVisibility.opponentDeck)">
      <view class="sheet__label">对手卡组</view>
      <view class="sheet__inline-field">
        <input class="sheet__input sheet__input--flex" :maxlength="recordOpponentDeckMaxLength" :value="recordOpponentDeck" :focus="recordOpponentDeckInputFocused" placeholder="输入对手卡组（最多 15 字）" @focus="onRecordOpponentDeckFocus" @blur="onRecordOpponentDeckBlur" @input="onRecordOpponentDeckInput" />
        <view :class="'sheet__side-button ' + (recordOpponentDeckPickerLoading ? 'is-disabled' : '')" @tap="openRecordOpponentDeckPicker">
          {{recordOpponentDeckPickerLoading ? '加载中' : '历史输入'}}
        </view>
      </view>
      </template>
      <template v-if="currentMatchFormat === 'md'">
        <template v-if="!liteEdition && (recordShowAllOptionalFields || recordFieldVisibility.starterCount)">
        <view class="sheet__label">动点数</view>
        <view :class="'sheet__picker ' + (recordStarterCount === null ? 'is-empty' : '')" data-field="recordStarterCount" @tap="openRecordMetricPicker">
          {{recordStarterCount === null ? '未记录' : recordStarterCount}}
        </view>
        </template>

        <template v-if="!liteEdition && (recordShowAllOptionalFields || recordFieldVisibility.handTrapCount)">
        <view class="sheet__label">手坑数</view>
        <view :class="'sheet__picker ' + (recordHandTrapCount === null ? 'is-empty' : '')" data-field="recordHandTrapCount" @tap="openRecordMetricPicker">
          {{recordHandTrapCount === null ? '未记录' : recordHandTrapCount}}
        </view>
        </template>

        <template v-if="!liteEdition && (recordShowAllOptionalFields || recordFieldVisibility.brickCount)">
        <view class="sheet__label">废件数</view>
        <view :class="'sheet__picker ' + (recordBrickCount === null ? 'is-empty' : '')" data-field="recordBrickCount" @tap="openRecordMetricPicker">
          {{recordBrickCount === null ? '未记录' : recordBrickCount}}
        </view>
        </template>

        <view class="sheet__label">胜负结果 <text class="sheet__label-required">必填</text></view>
        <view class="segment">
          <view :class="'segment__item ' + (recordMatchResult === 1 ? 'is-active' : '')" data-field="recordMatchResult" data-value="1" @tap="onToggleRecordField">胜</view>
          <view :class="'segment__item ' + (recordMatchResult === 0 ? 'is-active' : '')" data-field="recordMatchResult" data-value="0" @tap="onToggleRecordField">负</view>
          <view :class="'segment__item ' + (recordMatchResult === 4 ? 'is-active' : '')" data-field="recordMatchResult" data-value="4" @tap="onToggleRecordField">平</view>
          <view :class="'segment__item ' + (recordMatchResult === 2 ? 'is-active' : '')" data-field="recordMatchResult" data-value="2" @tap="onToggleRecordField">掉线</view>
          <view :class="'segment__item ' + (recordMatchResult === 3 ? 'is-active' : '')" data-field="recordMatchResult" data-value="3" @tap="onToggleRecordField">拔线</view>
        </view>
      </template>

      <template v-else>
        <view class="sheet__label">三局结果 <text class="sheet__label-required">必填</text></view>
        <view class="ocg-rounds">
          <view v-for="(game, gameIndex) in recordOcgGames" :key="game.label" class="ocg-round">
            <view class="ocg-round__label">{{game.label}}</view>
            <view class="segment segment--compact">
              <view v-for="(option, index) in recordOcgGameOptions" :key="option.key" :class="'segment__item segment__item--small ' + (game.value === option.key ? 'is-active' : '')" :data-index="gameIndex" :data-value="option.key" @tap="onSelectOcgGameResult">
                {{option.label}}
              </view>
            </view>
            <view v-if="!liteEdition && (recordShowAllOptionalFields || recordFieldVisibility.starterCount)" class="metric-row">
              <view class="metric-row__label">动点数</view>
              <view class="metric-row__picker" :class="'sheet__picker ' + (game.starterCount === null ? 'is-empty' : '')" :data-index="gameIndex" data-field="starterCount" @tap="openRecordMetricPicker">
                {{game.starterCount === null ? '未记录' : game.starterCount}}
              </view>
            </view>
            <view v-if="!liteEdition && (recordShowAllOptionalFields || recordFieldVisibility.handTrapCount)" class="metric-row">
              <view class="metric-row__label">手坑数</view>
              <view class="metric-row__picker" :class="'sheet__picker ' + (game.handTrapCount === null ? 'is-empty' : '')" :data-index="gameIndex" data-field="handTrapCount" @tap="openRecordMetricPicker">
                {{game.handTrapCount === null ? '未记录' : game.handTrapCount}}
              </view>
            </view>
            <view v-if="!liteEdition && (recordShowAllOptionalFields || recordFieldVisibility.brickCount)" class="metric-row">
              <view class="metric-row__label">废件数</view>
              <view class="metric-row__picker" :class="'sheet__picker ' + (game.brickCount === null ? 'is-empty' : '')" :data-index="gameIndex" data-field="brickCount" @tap="openRecordMetricPicker">
                {{game.brickCount === null ? '未记录' : game.brickCount}}
              </view>
            </view>
          </view>
        </view>
        <view class="sheet__hint">最终结果：{{recordOcgSummaryLabel}}</view>
      </template>

      <template v-if="!liteEdition && (recordShowAllOptionalFields || recordFieldVisibility.failureReasons) && recordFailureReasonVisible">
        <view class="sheet__label">失败原因（可多选） <view class="sheet__help" aria-label="查看失败原因规则" @tap="showFailureReasonRules">?</view></view>
        <view class="sheet__inline-field">
          <input class="sheet__input sheet__input--flex" :maxlength="failureReasonMaxLength" :value="recordFailureReason" :focus="recordFailureReasonInputFocused" placeholder="输入失败原因（最多 10 字）" @focus="onRecordFailureReasonFocus" @blur="onRecordFailureReasonBlur" @input="onRecordFailureReasonInput" />
          <view :class="'sheet__side-button ' + (recordFailureReasonPickerLoading ? 'is-disabled' : '')" @tap="openRecordFailureReasonPicker">{{recordFailureReasonPickerLoading ? '加载中' : '历史输入'}}</view>
          <view class="sheet__side-button sheet__side-button--short" @tap="addRecordFailureReason">添加</view>
        </view>
        <view v-if="recordFailureReasons.length" class="failure-reason-options"><view v-for="reason in recordFailureReasons" :key="reason" class="segment__item segment__item--small is-active" :data-name="reason" @tap="toggleRecordFailureReason">{{reason}} · 删除</view></view>
      </template>

      <template v-if="recordShowAllOptionalFields || recordFieldVisibility.remark">
      <view class="sheet__label">备注</view>
      <textarea class="sheet__textarea" maxlength="200" :value="recordRemark" @input="onRecordRemarkInput"></textarea>
      </template>

      <button class="sheet__submit" :loading="recordSaving" @tap="saveRecord">{{recordPopupMode === 'edit' ? '保存修改' : '保存战绩'}}</button>
    </view>
  </view>

  <view v-if="!liteEdition && recordOpponentDeckPickerVisible" class="overlay overlay--nested" @tap="closeRecordOpponentDeckPicker">
    <view class="sheet sheet--compact" @tap.stop="noop">
      <view class="sheet__header">
        <view class="sheet__title">历史输入</view>
        <view class="sheet__close" @tap="closeRecordOpponentDeckPicker">关闭</view>
      </view>

      <view v-if="recordOpponentDeckHistoryItems.length" class="sheet__label">历史对手卡组</view>
      <scroll-view v-if="recordOpponentDeckHistoryItems.length" class="history-picker__list" scroll-y>
        <view v-for="(item, index) in recordOpponentDeckHistoryItems" :key="item.key" class="settings-item history-picker__item" :data-value="item.value" @tap="onSelectRecordOpponentDeckSuggestion">
          <view class="settings-item__content">
            <view class="settings-item__name">{{item.value}}</view>
            <view v-if="item.meta" class="settings-item__meta">{{item.meta}}</view>
          </view>
          <view class="history-picker__action">填入</view>
        </view>
      </scroll-view>
      <view v-else class="empty-state empty-state--small history-picker__empty">
        <view class="empty-state__desc">还没有保存过带“对手卡组”的战绩。</view>
      </view>

      <view v-if="recordOpponentDeckDeckItems.length" class="sheet__label">我的卡组</view>
      <scroll-view v-if="recordOpponentDeckDeckItems.length" class="history-picker__list" scroll-y>
        <view v-for="(item, index) in recordOpponentDeckDeckItems" :key="item.key" class="settings-item history-picker__item" :data-value="item.value" @tap="onSelectRecordOpponentDeckSuggestion">
          <view class="settings-item__content">
            <view class="settings-item__name">{{item.value}}</view>
            <view v-if="item.meta" class="settings-item__meta">{{item.meta}}</view>
          </view>
          <view class="history-picker__action">填入</view>
        </view>
      </scroll-view>
    </view>
  </view>

  <view v-if="!liteEdition && recordFailureReasonPickerVisible" class="overlay overlay--nested" @tap="closeRecordFailureReasonPicker">
    <view class="sheet sheet--compact" @tap.stop="noop">
      <view class="sheet__header">
        <view class="sheet__title">历史输入</view>
        <view class="sheet__close" @tap="closeRecordFailureReasonPicker">关闭</view>
      </view>
      <view v-if="recordFailureReasonHistoryItems.length" class="sheet__label">历史失败原因</view>
      <scroll-view v-if="recordFailureReasonHistoryItems.length" class="history-picker__list" scroll-y>
        <view v-for="item in recordFailureReasonHistoryItems" :key="item.key" class="settings-item history-picker__item" :data-value="item.value" @tap="onSelectRecordFailureReasonSuggestion">
          <view class="settings-item__content"><view class="settings-item__name">{{item.value}}</view><view v-if="item.meta" class="settings-item__meta">{{item.meta}}</view></view>
          <view class="history-picker__action">添加</view>
        </view>
      </scroll-view>
      <view v-else class="empty-state empty-state--small history-picker__empty"><view class="empty-state__desc">还没有保存过失败原因。</view></view>
    </view>
  </view>

  <view v-if="recordDayCalendarVisible" class="overlay overlay--nested" @tap="closeRecordDayCalendar">
    <view class="sheet sheet--compact" @tap.stop="noop">
      <view class="sheet__header">
        <view class="sheet__title">{{recordDayCalendarMonth}} 日期</view>
        <view class="sheet__close" @tap="closeRecordDayCalendar">关闭</view>
      </view>

      <view class="day-calendar">
        <view v-for="(weekday, index) in recordDayCalendarWeekdayHeaders" :key="index" class="day-calendar__weekday">{{weekday}}</view>
        <view v-for="(cell, index) in recordDayCalendarDays" :key="index" class="day-calendar__cell-wrap">
          <view v-if="cell.empty" class="day-calendar__cell day-calendar__cell--empty"></view>
          <view v-else :class="'day-calendar__cell ' + (cell.isToday ? 'is-today ' : '') + (cell.isSelected ? 'is-selected' : '')" :data-value="cell.value" @tap="onSelectRecordDayCalendarDay">
            {{cell.label}}
          </view>
        </view>
      </view>

      <view class="day-calendar__clear" @tap="onClearRecordDayCalendar">未记录</view>
    </view>
  </view>

  <view v-if="recordMetricPickerVisible" class="overlay overlay--nested" @tap="closeRecordMetricPicker">
    <view class="sheet sheet--compact" @tap.stop="noop">
      <view class="sheet__header">
        <view class="sheet__title">{{recordMetricPickerTitle}}</view>
        <view class="sheet__close" @tap="closeRecordMetricPicker">关闭</view>
      </view>

      <view class="metric-options">
        <view v-for="(option, index) in recordMetricPickerOptions" :key="index" :class="'metric-option ' + (option.isSelected ? 'is-selected' : '')" :data-value="option.itemValue" @tap="onSelectRecordMetricOption">
          {{option.itemLabel}}
        </view>
      </view>
    </view>
  </view>

  <view v-if="recordMatchTypePickerVisible" class="overlay overlay--nested" @tap="closeRecordMatchTypePicker">
    <view class="sheet sheet--compact" @tap.stop="noop">
      <view class="sheet__header">
        <view class="sheet__title">对战类型</view>
        <view class="sheet__close" @tap="closeRecordMatchTypePicker">关闭</view>
      </view>
      <view class="metric-options">
        <view v-for="(option, index) in recordMatchTypePickerOptions" :key="option.id || index" :class="'metric-option ' + (index === recordMatchTypeIndex ? 'is-selected' : '')" :data-index="index" @tap="onSelectRecordMatchTypeOption">
          {{option.itemLabel}}
        </view>
      </view>
    </view>
  </view>

  <view v-if="statsMatchTypePickerVisible" class="overlay overlay--nested" @tap="closeStatsMatchTypePicker">
    <view class="sheet sheet--compact" @tap.stop="noop">
      <view class="sheet__header">
        <view class="sheet__title">对战类型筛选</view>
        <view class="sheet__close" @tap="closeStatsMatchTypePicker">关闭</view>
      </view>
      <view class="metric-options">
        <view v-for="(option, index) in matchTypeFilterOptions" :key="option.id || index" :class="'metric-option ' + (index === matchTypeFilterIndex ? 'is-selected' : '')" :data-index="index" @tap="onSelectStatsMatchTypeOption">
          {{option.itemLabel}}
        </view>
      </view>
    </view>
  </view>

  <view v-if="pieColorPickerVisible" class="overlay overlay--nested" @tap="closePieColorPicker">
    <view class="sheet sheet--compact pie-color-picker" @tap.stop="noop">
      <view class="sheet__header">
        <view class="sheet__title">{{pieColorPickerDeck}} 颜色</view>
        <view class="sheet__close" @tap="closePieColorPicker">关闭</view>
      </view>
      <view class="pie-color-options">
        <view v-for="(color, index) in pieColorOptions" :key="color" :class="'pie-color-option ' + (color === pieColorPickerValue ? 'is-selected' : '')" :style="'background: ' + color + ';'" :data-color="color" @tap="onSelectPieChartColor"></view>
      </view>
    </view>
  </view>

  <view v-if="pieRulesVisible" class="overlay overlay--nested" @tap="closePieChartRules">
    <view class="sheet sheet--compact pie-rules" @tap.stop="noop">
      <view class="sheet__header">
        <view class="sheet__title">饼图统计规则</view>
        <view class="sheet__close" @tap="closePieChartRules">关闭</view>
      </view>
      <view class="pie-rules__body">
        <view>1. 只统计填写了对手卡组的战绩。</view>
        <view>2. 占比按对局数除以当前范围内有效对局总数计算。</view>
        <view>3. 可按对战类型、月份范围、卡组、MD 账号和今日等条件筛选，也支持全部、胜局、败局模式。</view>
        <view>4. 配置了对手卡组归类时，会先合并归类后再统计。</view>
        <view>5. 饼图只展示占比不低于 5% 的卡组，最多展示 10 个，其余合并为“其他”。</view>
        <view>6. 饼图颜色按当前排序位置保存，不与具体卡组绑定；“其他”固定为灰色。</view>
      </view>
    </view>
  </view>

  <view v-if="deckBuilderVisible" class="overlay" @tap="closeDeckBuilder">
    <view class="sheet sheet--deck-builder" @tap.stop="noop">
      <view class="sheet__header">
        <view class="sheet__title">{{deckBuilderDeckName}} 构成</view>
        <view class="sheet__header-actions">
          <view class="sheet__action" @tap="onRefreshDeckBuilder">
            {{deckBuilderRefreshing ? '刷新中...' : '刷新'}}
          </view>
          <view class="sheet__close" @tap="closeDeckBuilder">关闭</view>
        </view>
      </view>

      <view v-if="deckBuilderLoading" class="feedback">正在加载卡组图片...</view>

      <template v-else>
        <view class="sheet__label">卡组图片（{{deckBuilderImages.length}}/3）</view>
        <view class="deck-images-grid">
          <view v-for="(image, index) in deckBuilderImages" :key="image.path || index" class="deck-image-item" @tap="previewDeckImage" :data-index="index">
            <image class="deck-image-item__image" mode="aspectFill" :src="image.url"></image>
            <view class="deck-image-item__remove" @tap.stop="removeDeckImage" :data-index="index">删除</view>
          </view>
          <view v-if="deckBuilderImages.length < 3" class="deck-image-add" @tap="chooseDeckImages">＋ 添加图片</view>
        </view>
        <view class="section-panel__desc">每个卡组最多保存 3 张图片，单张不能超过 7MB。点击图片可预览并保存到相册。</view>
        <button class="sheet__submit" :loading="deckBuilderSaving" @tap="saveDeckBuilder">保存卡组图片</button>
      </template>
    </view>
  </view>

  <view v-if="deckBuilderActionVisible" class="overlay" @tap="closeDeckBuilderCardAction">
    <view class="sheet sheet--compact" @tap.stop="noop">
      <view class="sheet__header">
        <view class="sheet__title">{{deckBuilderActionCard.displayName}}</view>
        <view class="sheet__close" @tap="closeDeckBuilderCardAction">关闭</view>
      </view>

      <view class="builder-action-card">
        <image class="builder-action-card__image" mode="aspectFill" :src="deckBuilderActionCard.imageSrc"></image>
        <view class="builder-action-card__meta">{{deckBuilderActionCard.typeText}}</view>
      </view>

      <view class="builder-action-row builder-action-row--button" @tap="onPreviewDeckBuilderActionCard">
        <view class="builder-action-row__label">查看卡牌</view>
      </view>

      <view class="builder-action-row">
        <view class="builder-action-row__label">{{currentMatchFormat === 'md' ? '添加卡牌' : (deckBuilderActionPrimarySection === 'extra' ? '额外' : '主卡')}}</view>
        <view class="builder-action-stepper">
          <view class="stepper__button" data-field="main" data-delta="-1" @tap="changeDeckBuilderActionCount">-</view>
          <view class="stepper__value">{{deckBuilderActionMainCount}}</view>
          <view class="stepper__button" data-field="main" data-delta="1" @tap="changeDeckBuilderActionCount">+</view>
        </view>
      </view>

      <view v-if="currentMatchFormat === 'ocg'" class="builder-action-row">
        <view class="builder-action-row__label">副卡</view>
        <view class="builder-action-stepper">
          <view class="stepper__button" data-field="side" data-delta="-1" @tap="changeDeckBuilderActionCount">-</view>
          <view class="stepper__value">{{deckBuilderActionSideCount}}</view>
          <view class="stepper__button" data-field="side" data-delta="1" @tap="changeDeckBuilderActionCount">+</view>
        </view>
      </view>

      <view class="builder-action-buttons">
        <view class="builder-action-buttons__item" @tap="closeDeckBuilderCardAction">取消</view>
        <view class="builder-action-buttons__item builder-action-buttons__item--primary" @tap="confirmDeckBuilderCardAction">确定</view>
      </view>
    </view>
  </view>

  <view v-if="deckImagePreviewVisible" class="overlay" @tap="closeDeckImagePreview">
    <view class="sheet sheet--compact" @tap.stop="noop">
      <view class="sheet__header">
        <view class="sheet__title">图片预览</view>
        <view class="sheet__close" @tap="closeDeckImagePreview">关闭</view>
      </view>
      <image v-if="deckImagePreview" class="deck-image-preview" mode="aspectFit" :src="deckImagePreview.url"></image>
      <button class="section-panel__button" @tap="saveDeckImageToAlbum">保存到相册</button>
    </view>
  </view>

  <view v-if="cardDetailVisible" class="overlay" @tap="closeCardDetail">
    <view class="sheet sheet--card-detail" @tap.stop="noop">
      <view class="sheet__header">
        <view class="sheet__title">{{cardDetailData ? cardDetailData.displayName : '卡牌详情'}}</view>
        <view class="sheet__close" @tap="closeCardDetail">关闭</view>
      </view>

      <view v-if="cardDetailLoading" class="feedback">正在加载卡牌详情...</view>

      <view v-else-if="cardDetailData" class="card-detail">
        <image class="card-detail__image" mode="aspectFill" :src="cardDetailData.imageSrc" @tap="onPreviewCardDetailImage"></image>
        <view class="card-detail__line">{{cardDetailData.typeText}}</view>
        <view v-if="cardDetailData.metaText" class="card-detail__line">{{cardDetailData.metaText}}</view>
        <view v-if="cardDetailData.statText" class="card-detail__line">{{cardDetailData.statText}}</view>
        <view v-if="cardDetailData.extraText" class="card-detail__line">{{cardDetailData.extraText}}</view>
        <view v-if="cardDetailData.desc" class="card-detail__desc">{{cardDetailData.desc}}</view>
      </view>
    </view>
  </view>

  <!-- 修改记录弹窗 -->
  <view v-if="editHistoryVisible" class="overlay" @tap="closeEditHistory">
    <view class="sheet sheet--edit-history" @tap.stop="noop">
      <view class="sheet__header">
        <view class="sheet__title">修改记录</view>
        <view class="sheet__close" @tap="closeEditHistory">关闭</view>
      </view>
      <view v-if="editHistoryRecordMeta" class="edit-history__meta">{{editHistoryRecordMeta}}</view>
      <view v-if="editHistoryLoading" class="feedback">正在加载...</view>
      <view v-else-if="editHistoryItems.length" class="edit-history__list">
        <view v-for="(item, index) in editHistoryItems" :key="index" class="edit-history__item">
          <view class="edit-history__item-time">{{item.createdAt}}</view>
          <view v-for="(field, index) in item.changedFields" :key="field" class="edit-history__field">
            {{field}}
          </view>
        </view>
      </view>
      <view v-else class="empty-state empty-state--small">
        <view class="empty-state__desc">暂无修改记录</view>
      </view>
    </view>
  </view>

  <!-- 对手卡组归类编辑弹窗 -->
  <view v-if="!liteEdition && opponentDeckCategoryDialogVisible" class="overlay" @tap="closeOpponentDeckCategoryDialog">
    <view class="sheet" @tap.stop="noop">
      <view class="sheet__header">
        <view class="sheet__title">编辑归类</view>
        <view class="sheet__close" @tap="closeOpponentDeckCategoryDialog">关闭</view>
      </view>

      <view class="settings-item settings-item--stack">
        <view class="settings-item__content">
          <view class="settings-item__name">归类名称</view>
        </view>
        <input class="settings-item__input" :value="opponentDeckCategoryEditingName" placeholder="输入归类名称" :maxlength="opponentDeckCategoryNameMaxLength" @input="onOpponentDeckCategoryNameChange" />
      </view>

      <view v-if="opponentDeckCategoryAvailableDeckNames.length" class="section-panel">
        <view class="section-panel__title">
          选择卡组（{{opponentDeckCategoryEditingDeckNames.length}}/{{opponentDeckCategoryDeckLimit}}）
        </view>
        <view class="stats-mode-switcher">
          <view v-for="(item, index) in opponentDeckCategoryAvailableDeckNames" :key="item.name" :class="'stats-mode-switcher__item ' + (item.isActive ? 'is-active' : '') + ' ' + (item.isDisabled ? 'is-disabled' : '')" :data-name="item.name" @tap="onToggleOpponentDeckCategoryDeckName">
            {{item.name}}
          </view>
        </view>
      </view>
      <view v-else class="empty-state empty-state--small">
        <view class="empty-state__desc">暂无可选卡组，请先在统计页查看对手卡组占比。</view>
      </view>

      <view class="builder-action-buttons">
        <view class="builder-action-buttons__item" @tap="closeOpponentDeckCategoryDialog">取消</view>
        <view class="builder-action-buttons__item builder-action-buttons__item--primary" @tap="saveOpponentDeckCategoryFromDialog">保存</view>
      </view>
    </view>
  </view>

  <view v-if="!liteEdition && failureReasonCategoryDialogVisible" class="overlay" @tap="closeFailureReasonCategoryDialog">
    <view class="sheet" @tap.stop="noop">
      <view class="sheet__header"><view class="sheet__title">编辑归类</view><view class="sheet__close" @tap="closeFailureReasonCategoryDialog">关闭</view></view>
      <view class="settings-item settings-item--stack"><view class="settings-item__content"><view class="settings-item__name">归类名称</view></view><input class="settings-item__input" :value="failureReasonCategoryEditingName" placeholder="输入归类名称" :maxlength="failureReasonCategoryNameMaxLength" @input="onFailureReasonCategoryNameChange" /></view>
      <view v-if="failureReasonCategoryAvailableReasons.length" class="section-panel">
        <view class="section-panel__title">选择失败原因（{{failureReasonCategoryEditingReasonNames.length}}/{{failureReasonCategoryReasonLimit}}）</view>
        <view class="stats-mode-switcher"><view v-for="item in failureReasonCategoryAvailableReasons" :key="item.name" :class="'stats-mode-switcher__item ' + (item.isActive ? 'is-active' : '') + ' ' + (item.isDisabled ? 'is-disabled' : '')" :data-name="item.name" @tap="onToggleFailureReasonCategoryReason">{{item.name}}</view></view>
      </view>
      <view v-else class="empty-state empty-state--small"><view class="empty-state__desc">暂无历史失败原因，请先在新增战绩时填写。</view></view>
      <view class="builder-action-buttons"><view class="builder-action-buttons__item" @tap="closeFailureReasonCategoryDialog">取消</view><view class="builder-action-buttons__item builder-action-buttons__item--primary" @tap="saveFailureReasonCategoryFromDialog">保存</view></view>
    </view>
  </view>

</view>
</template>

<script>
import { wx, pageMixin } from "../../services/wx-compat.js";
import { callLocalApi } from "../../services/local-api.js";
import {
  isH5,
  saveTextToPublicDownloads,
  chooseSaveFile,
  chooseOpenFile,
  writeTextToContentUri,
  toAbsoluteUrl,
  writeTextFile,
  readTextFile,
  downloadTextFile,
  fileExists as fileIoFileExists,
  copyFile as fileIoCopyFile,
  statFile as fileIoStatFile,
} from "../../services/file-io.js";
import {
  exportBackup,
  listBackupFiles,
  importBackup,
  importBackupFromText,
  autoBackupBeforeImportWithTimeout,
} from "../../services/backup.js";

const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31];
const RECORD_DAY_OPTION_EMPTY = {
  itemLabel: "未记录",
  itemValue: "",
};
const RECORD_METRIC_OPTIONS = [RECORD_DAY_OPTION_EMPTY].concat(
  [0, 1, 2, 3, 4, 5, 6, 7].map((value) => ({
    itemLabel: String(value),
    itemValue: String(value),
  }))
);
const MAX_DECK_IMAGES = 3;
const MAX_DECK_IMAGE_BYTES = 7 * 1024 * 1024;
const LITE_EDITION = true;

const TAB_OPTIONS = [
  { key: "stats", label: "数据统计" },
  { key: "records", label: "战绩列表" },
  { key: "settings", label: "设置" },
];

const TAB_TITLE_MAP = {
  stats: "数据统计",
  records: "战绩列表",
  settings: "设置",
};

const MATCH_FORMAT_OPTIONS = [
  { key: "md", label: "MD" },
  { key: "ocg", label: "OCG" },
];

const MATCH_FORMAT_LABEL_MAP = {
  md: "MD",
  ocg: "OCG",
};

const DEFAULT_MATCH_TYPE_HINT_MAP = {
  md: "排位",
  ocg: "练牌",
};

const MATCH_RESULT_LABEL_MAP = {
  0: "失利",
  1: "胜利",
  2: "掉线",
  3: "拔线",
  4: "平局",
};
const MATCH_RESULT_DRAW = 4;

const OCG_GAME_RESULT_OPTIONS = [
  { key: "win", label: "○" },
  { key: "loss", label: "×" },
  { key: "draw", label: "-" },
];

const OCG_GAME_RESULT_LABEL_MAP = {
  win: "○",
  loss: "×",
  draw: "-",
};

const STATS_OPPONENT_DECK_MODE_OPTIONS = [
  { key: "all", label: "对手卡组占比" },
  { key: "win", label: "胜局对手卡组占比" },
  { key: "loss", label: "败局对手卡组占比" },
];
const ADMIN_OVERVIEW_SCOPE_OPTIONS = [
  { key: "month", label: "指定月份" },
  { key: "all", label: "全部数据" },
];

const STATS_OPPONENT_DECK_MODE_LABEL_MAP = STATS_OPPONENT_DECK_MODE_OPTIONS.reduce(
  (result, item) => ({
    ...result,
    [item.key]: item.label,
  }),
  {}
);

const SETTING_SECTIONS = [
  { key: "decks", label: "卡组管理" },
  { key: "matchTypes", label: "对战类型管理" },
  { key: "months", label: "月份管理" },
  { key: "data", label: "数据导入" },
  { key: "about", label: "关于" },
];
const EXTRA_DECK_TYPE_KEYWORDS = ["融合", "连接", "超量", "同步"];
const RECORD_DRAFT_STORAGE_KEY_PREFIX = "ygo_record_draft:";
const RECORD_FIELD_VISIBILITY_STORAGE_KEY = "ygo_record_field_visibility:v1";
const MD_CURRENT_ACCOUNT_STORAGE_KEY = "ygo_md_current_account:v1";
const OPPONENT_DECK_CATEGORIES_STORAGE_KEY = "ygo_opponent_deck_categories:v1";
const FAILURE_REASON_CATEGORIES_STORAGE_KEY = "ygo_failure_reason_categories:v1";
const LOCAL_CACHE_STORAGE_KEY_PREFIX = "ygo_local_cache:v20260730:";
const RECORD_LIST_PAGE_SIZE = 50;
const REMOTE_SYNC_INTERVAL_MS = 30 * 60 * 1000;
const LOCAL_PERSISTENT_CACHE_RESOURCES = new Set([
  "months",
  "matchTypes",
  "mdAccounts",
  "decks",
  "records",
  "statistics",
  "allRecords",
  "decksBase",
  "cardImage",
]);
// 调试日志会在每次缓存命中/未命中时同步写控制台，生产环境关闭以减少 I/O。
const CACHE_DEBUG_LOG_ENABLED = false;
const LOCAL_CARD_IMAGE_FILE_PREFIX = "ygo_card_img_";
const LOCAL_CACHE_MAX_AGE_MS = {
  adminStatus: 6 * 60 * 60 * 1000,
  adminOverviewStats: 5 * 60 * 1000,
  adminMatchTypes: 5 * 60 * 1000,
  cardSearch: 24 * 60 * 60 * 1000,
  cardDetail: 24 * 60 * 60 * 1000,
  cardEntity: 30 * 24 * 60 * 60 * 1000,
  appConfig: 10 * 60 * 1000,
};
// 高频搜索缓存只保留最近一批结果，避免长期使用无限增长本地 Storage。
const LOCAL_CACHE_ENTRY_LIMITS = {
  cardSearch: 40,
  cardDetail: 80,
  cardEntity: 120,
};
const DECK_NAME_MAX_LENGTH = 15;
const OPPONENT_DECK_MAX_LENGTH = 15;
const RECORD_DECK_COLLAPSED_ROW_LIMIT = 3;
const DEFAULT_BOTTOM_TABS_RESERVE_PX = 96;
const MEASURED_BOTTOM_TABS_EXTRA_GAP_PX = 2;
const PIE_COLORS = [
  "#1976D2", "#64B5F6", "#00796B", "#4DB6AC", "#FFA000",
  "#FFD54F", "#E64A19", "#FF5722", "#FF8A65", "#455A64",
];
const PIE_OTHERS_COLOR = "#c0b8ad";
const PIE_CUSTOM_COLORS = [
  "#1976D2", "#64B5F6", "#00796B", "#4DB6AC", "#FFA000",
  "#FFD54F", "#E64A19", "#FF5722", "#FF8A65", "#455A64",
];
const PIE_COLOR_STORAGE_KEY = "ygo_pie_colors:v1";
const RECORD_OPTIONAL_FIELD_ITEMS = [
  {
    key: "dayOfWeek",
    label: "日期",
    description: "记录对局发生在几号。",
  },
  {
    key: "remark",
    label: "备注",
    description: "补充记录特殊情况或细节。",
  },
];
const DEFAULT_RECORD_FIELD_VISIBILITY = RECORD_OPTIONAL_FIELD_ITEMS.reduce(
  (result, item) => ({
    ...result,
    [item.key]: true,
  }),
  {}
);

const DEFAULT_APP_CONFIG = {
  donationEnabled: false,
  donationImageUrl: "",
  donationText: "",
  mpQrcodeUrl: "",
  mpName: "",
};

const LITE_DISABLED_RECORD_FIELDS = [
  "opponentDeck",
  "starterCount",
  "handTrapCount",
  "brickCount",
  "failureReasons",
];

function getLiteRecordFieldVisibility() {
  return LITE_DISABLED_RECORD_FIELDS.reduce(
    (visibility, key) => ({ ...visibility, [key]: false }),
    { ...DEFAULT_RECORD_FIELD_VISIBILITY }
  );
}
const DEFAULT_DONATION_TEXT =
  "如果这个小工具帮到了你，可以请作者喝杯咖啡～完全自愿，不影响任何功能。";
const MESSAGE_MAX_LENGTH = 200;
const MESSAGE_SORT_OPTIONS = [
  { key: "time", label: "按时间" },
  { key: "likes", label: "按点赞" },
];

const DEFAULT_STATS = {
  totalGames: 0,
  winCount: 0,
  drawCount: 0,
  winRate: "0.00%",
  coinGames: 0,
  coinWinCount: 0,
  coinWinRate: "0.00%",
  winCoinGames: 0,
  winCoinWinCount: 0,
  winRateWhenCoinWin: "0.00%",
  loseCoinGames: 0,
  loseCoinWinCount: 0,
  winRateWhenCoinLoss: "0.00%",
  starterGames: 0,
  starterTotalCount: 0,
  hasStarterCount: 0,
  hasStarterRate: "0.00%",
  handTrapRecordedCount: 0,
  handTrapTotalCount: 0,
  brickRecordedCount: 0,
  brickTotalCount: 0,
  averageStarterCount: "0.00",
  averageHandTrapCount: "0.00",
  averageBrickCount: "0.00",
  deckCount: 0,
};

function getCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getCurrentDayLabel() {
  return String(new Date().getDate());
}

function formatDayOfWeekLabel(value) {
  const normalizedValue = String(value || "").trim();
  if (/^\d{1,2}$/.test(normalizedValue)) {
    return `${Number(normalizedValue)}号`;
  }
  return normalizedValue;
}

function buildRecordDayOptions() {
  return [RECORD_DAY_OPTION_EMPTY].concat(
    DAY_OPTIONS.map((item) => ({
      itemLabel: `${item}号`,
      itemValue: String(item),
    }))
  );
}

function getRecordDayIndexByValue(dayValue, options = buildRecordDayOptions()) {
  const normalizedValue = String(dayValue || "").trim();
  const matchedIndex = (options || []).findIndex(
    (item) => String((item && item.itemValue) || "") === normalizedValue
  );
  return matchedIndex >= 0 ? matchedIndex : 0;
}

function buildRecordDayCalendarCells(monthValue, selectedDayValue) {
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(String(monthValue || "").trim());
  if (!monthMatch) {
    return [];
  }
  const year = Number(monthMatch[1]);
  const monthIndex = Number(monthMatch[2]) - 1;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstWeekdayOffset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const now = new Date();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() === monthIndex;
  const todayDay = now.getDate();
  const selectedDay = String(selectedDayValue || "").trim();
  const cells = [];
  for (let i = 0; i < firstWeekdayOffset; i += 1) {
    cells.push({ empty: true });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dayValue = String(day);
    cells.push({
      empty: false,
      label: String(day),
      value: dayValue,
      isToday: isCurrentMonth && day === todayDay,
      isSelected: dayValue === selectedDay,
    });
  }
  return cells;
}

function clampRecordMetricCount(value) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 0) {
    return 0;
  }
  if (numberValue > 7) {
    return 7;
  }
  return numberValue;
}

function getRecordMetricIndex(metricValue) {
  const normalizedValue = Number.isInteger(metricValue) ? String(metricValue) : "";
  const matchedIndex = RECORD_METRIC_OPTIONS.findIndex(
    (item) => String(item.itemValue) === normalizedValue
  );
  return matchedIndex >= 0 ? matchedIndex : 0;
}

function clampStarterCount(value) {
  return clampRecordMetricCount(value);
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectKeys(item));
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = sortObjectKeys(value[key]);
        return result;
      }, {});
  }
  return value;
}

function buildLocalCacheKey(resource, params = {}) {
  return `${LOCAL_CACHE_STORAGE_KEY_PREFIX}${resource}:${encodeURIComponent(
    JSON.stringify(sortObjectKeys(params))
  )}`;
}

function logCacheDebug(event, payload = {}) {
  if (!CACHE_DEBUG_LOG_ENABLED) {
    return;
  }
  try {
    console.info(`[cache:${event}]`, payload);
  } catch (error) {
    console.info(`[cache:${event}]`);
  }
}

function readLocalCache(resource, params = {}, maxAgeMs = 0) {
  try {
    const cacheKey = buildLocalCacheKey(resource, params);
    const cached = wx.getStorageSync(cacheKey);
    if (!cached || typeof cached !== "object") {
      logCacheDebug("miss", {
        resource,
        params,
        reason: "empty",
      });
      return null;
    }
    const savedAt = Number(cached.savedAt || 0);
    if (!savedAt) {
      logCacheDebug("miss", {
        resource,
        params,
        reason: "invalid_saved_at",
      });
      return null;
    }
    const ageMs = Date.now() - savedAt;
    if (maxAgeMs > 0 && ageMs > maxAgeMs) {
      logCacheDebug("stale", {
        resource,
        params,
        ageMs,
        maxAgeMs,
      });
      return null;
    }
    logCacheDebug("hit", {
      resource,
      params,
      ageMs,
      maxAgeMs,
      cacheKey,
    });
    return cached.data;
  } catch (error) {
    console.error("readLocalCache failed =>", error);
    return null;
  }
}

function writeLocalCache(resource, params = {}, data = null) {
  try {
    const cacheKey = buildLocalCacheKey(resource, params);
    wx.setStorageSync(cacheKey, {
      savedAt: Date.now(),
      data,
    });
    pruneLocalCacheResource(resource);
    logCacheDebug("write", {
      resource,
      params,
      cacheKey,
    });
  } catch (error) {
    console.error("writeLocalCache failed =>", error);
  }
}

function pruneLocalCacheResource(resource) {
  const limit = Number(LOCAL_CACHE_ENTRY_LIMITS[resource] || 0);
  if (!limit) {
    return;
  }
  try {
    const storageInfo = wx.getStorageInfoSync();
    const prefix = `${LOCAL_CACHE_STORAGE_KEY_PREFIX}${resource}:`;
    const entries = (storageInfo.keys || [])
      .filter((key) => String(key || "").startsWith(prefix))
      .map((key) => {
        let savedAt = 0;
        try {
          const value = wx.getStorageSync(key);
          savedAt = Number(value && value.savedAt) || 0;
        } catch (error) {
          savedAt = 0;
        }
        return { key, savedAt };
      })
      .sort((left, right) => right.savedAt - left.savedAt);
    entries.slice(limit).forEach(({ key }) => wx.removeStorageSync(key));
  } catch (error) {
    // 缓存淘汰失败不应影响主流程，下一次写入继续尝试。
    logCacheDebug("prune_failed", { resource });
  }
}

function removeLocalCacheByResource(resource) {
  try {
    const storageInfo = wx.getStorageInfoSync();
    const prefix = `${LOCAL_CACHE_STORAGE_KEY_PREFIX}${resource}:`;
    (storageInfo.keys || []).forEach((key) => {
      if (String(key || "").startsWith(prefix)) {
        wx.removeStorageSync(key);
      }
    });
    logCacheDebug("clear", {
      resource,
      removedCount: (storageInfo.keys || []).filter((key) =>
        String(key || "").startsWith(prefix)
      ).length,
    });
  } catch (error) {
    console.error("removeLocalCacheByResource failed =>", error);
  }
}

function formatStarterLabel(starterCount) {
  return formatRecordMetricLabel("动点", starterCount);
}

function formatRecordMetricLabel(metricLabel, metricCount) {
  return Number.isInteger(metricCount)
    ? `${metricLabel} ${metricCount}`
    : `${metricLabel} 未记录`;
}

function formatRecordMetricCountValue(metricCount) {
  return Number.isInteger(metricCount) ? String(metricCount) : "未";
}

function formatOcgStarterCountLabel(starterCount) {
  return formatRecordMetricCountValue(starterCount);
}

function formatOcgMetricLabel(metricLabel, metricValues = [], fallbackValue = null) {
  const values = Array.isArray(metricValues) ? metricValues : [];
  if (values.length) {
    return `${metricLabel} ${values.map((item) => formatRecordMetricCountValue(item)).join("/")}`;
  }
  return formatRecordMetricLabel(metricLabel, fallbackValue);
}

function hasRecordMetricValue(record, fieldName, ocgFieldName) {
  const metricValues = Array.isArray(record && record[ocgFieldName]) ? record[ocgFieldName] : [];
  if (metricValues.some((item) => Number.isInteger(item) && item >= 0)) {
    return true;
  }
  return Number.isInteger(record && record[fieldName]) && Number(record[fieldName]) >= 0;
}

function buildRecordMetricChips(record) {
  const chips = [];

  if (record && record.matchFormat === "ocg") {
    if (hasRecordMetricValue(record, "starterCount", "ocgStarterCounts")) {
      chips.push(formatOcgMetricLabel("动点", record.ocgStarterCounts, record.starterCount));
    }
    if (hasRecordMetricValue(record, "handTrapCount", "ocgHandTrapCounts")) {
      chips.push(formatOcgMetricLabel("手坑", record.ocgHandTrapCounts, record.handTrapCount));
    }
    if (hasRecordMetricValue(record, "brickCount", "ocgBrickCounts")) {
      chips.push(formatOcgMetricLabel("废件", record.ocgBrickCounts, record.brickCount));
    }
    return chips;
  }

  if (hasRecordMetricValue(record, "starterCount", "ocgStarterCounts")) {
    chips.push(formatRecordMetricLabel("动点", record ? record.starterCount : null));
  }
  if (hasRecordMetricValue(record, "handTrapCount", "ocgHandTrapCounts")) {
    chips.push(formatRecordMetricLabel("手坑", record ? record.handTrapCount : null));
  }
  if (hasRecordMetricValue(record, "brickCount", "ocgBrickCounts")) {
    chips.push(formatRecordMetricLabel("废件", record ? record.brickCount : null));
  }
  return chips;
}

function parseRateValue(rateText) {
  if (typeof rateText === "number") {
    return rateText;
  }
  const match = String(rateText || "").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function getRateClass(rateText, threshold) {
  return parseRateValue(rateText) >= threshold
    ? "rate-text--high"
    : "rate-text--low";
}

function decorateOverallStats(stats) {
  const overall = {
    ...DEFAULT_STATS,
    ...(stats || {}),
  };
  const averageStarterCount = formatAverageMetricValue(
    overall.starterTotalCount,
    overall.starterGames
  );
  const averageHandTrapCount = formatAverageMetricValue(
    overall.handTrapTotalCount,
    overall.handTrapRecordedCount
  );
  const averageBrickCount = formatAverageMetricValue(
    overall.brickTotalCount,
    overall.brickRecordedCount
  );

  return {
    ...overall,
    averageStarterCount,
    averageHandTrapCount,
    averageBrickCount,
    winRateRatio: formatRatioText(overall.winCount, overall.totalGames),
    coinWinRateRatio: formatRatioText(overall.coinWinCount, overall.coinGames),
    winRateWhenCoinWinRatio: formatRatioText(overall.winCoinWinCount, overall.winCoinGames),
    winRateWhenCoinLossRatio: formatRatioText(overall.loseCoinWinCount, overall.loseCoinGames),
    hasStarterRateRatio: formatRatioText(overall.hasStarterCount, overall.starterGames),
    averageStarterCountRatio: formatRatioText(overall.starterTotalCount, overall.starterGames),
    averageHandTrapCountRatio: formatRatioText(
      overall.handTrapTotalCount,
      overall.handTrapRecordedCount
    ),
    averageBrickCountRatio: formatRatioText(
      overall.brickTotalCount,
      overall.brickRecordedCount
    ),
    winRateClass: getRateClass(overall.winRate, 50),
    coinWinRateClass: getRateClass(overall.coinWinRate, 50),
    winRateWhenCoinWinClass: getRateClass(overall.winRateWhenCoinWin, 50),
    winRateWhenCoinLossClass: getRateClass(overall.winRateWhenCoinLoss, 50),
    hasStarterRateClass: getRateClass(overall.hasStarterRate, 85),
  };
}

function decorateDeckStats(statsList) {
  return (statsList || []).map((item) => ({
    ...item,
    winRateClass: getRateClass(item.winRate, 50),
    hasStarterRateClass: getRateClass(item.hasStarterRate, 85),
  }));
}

function getOpponentDeckShareClass(rateText) {
  const value = parseRateValue(rateText);
  if (value > 30) {
    return "opponent-share--high";
  }
  if (value > 5) {
    return "opponent-share--normal";
  }
  return "opponent-share--low";
}

function decorateOpponentDeckStats(statsList) {
  return (statsList || []).map((item) => ({
    ...item,
    shareClass: getOpponentDeckShareClass(item.shareRate),
    winRateClass: getRateClass(item.winRate, 50),
  }));
}

function buildDefaultOcgGames() {
  return [1, 2, 3].map((round) => ({
    label: `第${round}局`,
    value: "",
    starterCount: null,
    handTrapCount: null,
    brickCount: null,
    starterCountIndex: 0,
    handTrapCountIndex: 0,
    brickCountIndex: 0,
  }));
}

function formatOcgGameSummary(gameResults, ocgStarterCounts = [], starterCount = null) {
  const values = Array.isArray(gameResults) ? gameResults : [];
  const starterValues = Array.isArray(ocgStarterCounts) ? ocgStarterCounts : [];
  const items = values
    .map((item, index) => {
      const resultLabel = OCG_GAME_RESULT_LABEL_MAP[item] || "";
      if (!resultLabel) {
        return "";
      }
      if (starterValues.length) {
        return `${resultLabel}(${formatOcgStarterCountLabel(starterValues[index])})`;
      }
      return resultLabel;
    })
    .filter(Boolean);

  if (!items.length) {
    return "";
  }
  if (starterValues.length) {
    return items.join(" ");
  }
  if (Number.isInteger(starterCount)) {
    return `${items.join(" ")} · 动点 ${starterCount}`;
  }
  return items.join(" ");
}

function formatEditHistoryMatchTypeIds(changedFields, matchTypes = []) {
  const nameById = new Map(
    (matchTypes || []).map((item) => [
      String(item && item.id || ""),
      String(item && (item.itemLabel || item.itemValue) || ""),
    ])
  );
  return (changedFields || []).map((field) => {
    const text = String(field || "");
    if (!text.startsWith("对战类型:")) {
      return text;
    }
    return text.replace(/\b[a-z]{2}[a-z0-9_-]{4,}\b/gi, (id) => nameById.get(id) || id);
  });
}

function getOcgMatchSummaryLabel(recordOcgGames) {
  const values = (recordOcgGames || []).map((item) => item.value).filter(Boolean);
  if (values.length < 3) {
    return "未完成";
  }

  const winCount = values.filter((item) => item === "win").length;
  const lossCount = values.filter((item) => item === "loss").length;

  if (winCount > lossCount) {
    return "胜利";
  }
  if (lossCount > winCount) {
    return "失利";
  }
  return "平局";
}

function shouldShowFailureReasonField(matchFormat, matchResult, ocgSummaryLabel) {
  if (String(matchFormat || "") === "ocg") {
    return ocgSummaryLabel === "失利" || ocgSummaryLabel === "平局";
  }
  return Number(matchResult) === 0 || Number(matchResult) === 4;
}

function getStarterMetrics(record) {
  const metricStats = getRecordMetricStats(record, "starterCount", "ocgStarterCounts");
  return {
    starterGames: metricStats.recordedCount,
    hasStarterCount: metricStats.positiveCount,
    starterTotalCount: metricStats.totalCount,
  };
}

function getRecordMetricStats(record, fieldName, ocgFieldName) {
  const metricValues = Array.isArray(record && record[ocgFieldName])
    ? record[ocgFieldName]
    : [];
  if (metricValues.length) {
    return metricValues.reduce((result, item) => {
      if (Number.isInteger(item) && item >= 0) {
        result.recordedCount += 1;
        result.totalCount += Number(item);
        if (item > 0) {
          result.positiveCount += 1;
        }
      }
      return result;
    }, {
      recordedCount: 0,
      totalCount: 0,
      positiveCount: 0,
    });
  }

  if (Number.isInteger(record && record[fieldName]) && Number(record[fieldName]) >= 0) {
    return {
      recordedCount: 1,
      totalCount: Number(record[fieldName]),
      positiveCount: Number(record[fieldName]) > 0 ? 1 : 0,
    };
  }

  return {
    recordedCount: 0,
    totalCount: 0,
    positiveCount: 0,
  };
}

function formatRecordStarterLabel(record) {
  if (record && record.matchFormat === "ocg") {
    const starterValues = Array.isArray(record.ocgStarterCounts) ? record.ocgStarterCounts : [];
    if (starterValues.length) {
      return `动点 ${starterValues.map((item) => formatOcgStarterCountLabel(item)).join("/")}`;
    }
  }
  return formatStarterLabel(record ? record.starterCount : null);
}

function getRecordResultMeta(matchResult) {
  const numericResult = Number(matchResult);
  if (numericResult === 1) {
    return {
      resultLabel: MATCH_RESULT_LABEL_MAP[1],
      resultClass: "is-win",
      cardClass: "record-card--win",
    };
  }
  if (numericResult === 2) {
    return {
      resultLabel: MATCH_RESULT_LABEL_MAP[2],
      resultClass: "is-loss",
      cardClass: "record-card--loss",
    };
  }
  if (numericResult === 3) {
    return {
      resultLabel: MATCH_RESULT_LABEL_MAP[3],
      resultClass: "is-neutral",
      cardClass: "record-card--neutral",
    };
  }
  if (numericResult === 4) {
    return {
      resultLabel: MATCH_RESULT_LABEL_MAP[4],
      resultClass: "is-neutral",
      cardClass: "record-card--neutral",
    };
  }

  return {
    resultLabel: MATCH_RESULT_LABEL_MAP[0],
    resultClass: "is-loss",
    cardClass: "record-card--loss",
  };
}

function getCurrentStreakLabel(records = []) {
  const sorted = sortRecordListDesc(records);
  if (!sorted.length || ![0, 1].includes(Number(sorted[0].matchResult))) return "";
  const firstResult = Number(sorted[0].matchResult);
  let count = 0;
  for (const item of sorted) {
    if (Number(item.matchResult) !== firstResult) break;
    count += 1;
  }
  return count >= 3 ? `${firstResult === 1 ? "连胜" : "连败"} ${count} 局` : "";
}

function buildSidebarDecks(decks, records = []) {
  const totalGames = (decks || []).reduce(
    (sum, item) => sum + Number(item.totalGames || 0),
    0
  );

  return [
    {
      id: "all",
      deckName: "全部卡组",
      totalGames,
    streakLabel: getCurrentStreakLabel(records),
      isVirtual: true,
    },
  ].concat(decks || []);
}

function formatRecordMeta(record) {
  const parts = [];

  if (record.matchMonth) {
    parts.push(record.matchMonth);
  }
  if (record.dayOfWeek) {
    parts.push(formatDayOfWeekLabel(record.dayOfWeek));
  }
  if (record.matchType) {
    parts.push(record.matchType);
  }

  return parts.join(" · ");
}

function getDefaultMatchTypeLabel(matchFormat) {
  return DEFAULT_MATCH_TYPE_HINT_MAP[matchFormat] || DEFAULT_MATCH_TYPE_HINT_MAP.md;
}

function buildRecordMatchTypeOptions(matchTypes, matchFormat) {
  const list = matchTypes || [];
  if (list.length) {
    return list.slice();
  }

  return [{ id: "", itemLabel: getDefaultMatchTypeLabel(matchFormat) }];
}

function sortAndMergeMatchTypes(matchTypes, records = [], matchFormat = "md") {
  const countById = new Map();
  (records || []).forEach((record) => {
    const id = String(record && record.matchTypeId || "").trim();
    if (id) countById.set(id, (countById.get(id) || 0) + 1);
  });
  const groups = new Map();
  (matchTypes || []).forEach((item, index) => {
    if (!item || item.id === undefined || item.id === null || item.id === "") return;
    const label = String(item.itemLabel || item.itemValue || "").trim() || getDefaultMatchTypeLabel(matchFormat);
    const key = label.toLowerCase();
    const id = String(item.id);
    const count = countById.get(id) || 0;
    const existing = groups.get(key);
    if (existing) {
      existing.matchTypeIds.push(id);
      existing.recordCount += count;
      if (count > existing.primaryCount || (count === existing.primaryCount && index < existing.primaryIndex)) {
        existing.item = item;
        existing.primaryCount = count;
        existing.primaryIndex = index;
      }
    } else {
      groups.set(key, {
        item,
        label,
        matchTypeIds: [id],
        recordCount: count,
        primaryCount: count,
        primaryIndex: index,
      });
    }
  });
  return Array.from(groups.values())
    .sort((left, right) => {
      const leftPreferred = left.label === "排位" ? 1 : 0;
      const rightPreferred = right.label === "排位" ? 1 : 0;
      if (leftPreferred !== rightPreferred) return rightPreferred - leftPreferred;
      if (right.recordCount !== left.recordCount) return right.recordCount - left.recordCount;
      const leftOrder = Number(left.item.sortOrder || 0);
      const rightOrder = Number(right.item.sortOrder || 0);
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left.label.localeCompare(right.label, "zh-CN");
    })
    .map((group) => ({
      ...group.item,
      itemLabel: group.label,
      matchTypeIds: group.matchTypeIds,
      recordCount: group.recordCount,
    }));
}

function getPreferredMatchTypeIndex(options, matchFormat = "md") {
  const list = options || [];
  const preferredLabel = getDefaultMatchTypeLabel(matchFormat);
  const preferredIndex = list.findIndex(
    (item) => item && (item.itemValue === preferredLabel || item.itemLabel === preferredLabel)
  );

  return preferredIndex >= 0 ? preferredIndex : 0;
}

function getPreferredMonthIndex(options) {
  const list = options || [];
  const currentMonth = getCurrentMonth();
  const preferredIndex = list.findIndex(
    (item) => item && item.itemValue === currentMonth
  );

  return preferredIndex >= 0 ? preferredIndex : 0;
}

function hasMonthItem(options, monthValue) {
  return (options || []).some(
    (item) => item && item.itemValue === monthValue
  );
}

function formatMonthOptionLabel(monthValue) {
  const match = String(monthValue || "").trim().match(/^(\d{4})-(\d{1,2})$/);
  if (!match) {
    return String(monthValue || "");
  }
  return `${match[1]}-${Number(match[2])}`;
}

function getResolvedCardImageSrc(card) {
  return String(
    (card &&
      (card.localImagePath ||
        card.imageSrc ||
        card.cachedImageFileId ||
        card.cloudFileId ||
        card.thumbUrl ||
        card.remoteUrl)) ||
      ""
  ).trim();
}

function formatRateValue(numerator, denominator) {
  if (!denominator) {
    return "0.00%";
  }
  return `${((Number(numerator || 0) / Number(denominator || 0)) * 100).toFixed(2)}%`;
}

function formatAverageMetricValue(totalValue, recordedCount) {
  if (!recordedCount) {
    return "-";
  }
  return (Number(totalValue || 0) / Number(recordedCount || 0)).toFixed(2);
}

function formatRatioText(numerator, denominator) {
  if (!denominator) {
    return "-";
  }
  return `${Number(numerator || 0)}/${Number(denominator || 0)}`;
}

function isResolvedMatchResult(matchResult) {
  return (
    Number(matchResult) === 0 ||
    Number(matchResult) === 1 ||
    Number(matchResult) === 2 ||
    Number(matchResult) === MATCH_RESULT_DRAW
  );
}

function buildLocalStats(records) {
  const list = records || [];
  const duelRecords = list.filter((item) => isResolvedMatchResult(item.matchResult));
  const totalGames = duelRecords.length;
  const winCount = duelRecords.filter((item) => Number(item.matchResult) === 1).length;
  const drawCount = duelRecords.filter((item) => Number(item.matchResult) === MATCH_RESULT_DRAW).length;
  const coinGames = list.filter(
    (item) => Number(item.coinResult) === 0 || Number(item.coinResult) === 1
  ).length;
  const coinWinCount = list.filter((item) => Number(item.coinResult) === 1).length;
  const winCoinRecords = duelRecords.filter((item) => Number(item.coinResult) === 1);
  const winCoinGames = winCoinRecords.length;
  const winCoinWinCount = winCoinRecords.filter((item) => Number(item.matchResult) === 1).length;
  const loseCoinRecords = duelRecords.filter((item) => Number(item.coinResult) === 0);
  const loseCoinGames = loseCoinRecords.length;
  const loseCoinWinCount = loseCoinRecords.filter((item) => Number(item.matchResult) === 1).length;
  const starterMetrics = list.reduce((result, item) => {
    const current = getStarterMetrics(item);
    result.starterGames += current.starterGames;
    result.hasStarterCount += current.hasStarterCount;
    result.starterTotalCount += current.starterTotalCount;
    return result;
  }, {
    starterGames: 0,
    hasStarterCount: 0,
    starterTotalCount: 0,
  });
  const handTrapMetrics = list.reduce((result, item) => {
    const current = getRecordMetricStats(item, "handTrapCount", "ocgHandTrapCounts");
    result.recordedCount += current.recordedCount;
    result.totalCount += current.totalCount;
    return result;
  }, {
    recordedCount: 0,
    totalCount: 0,
  });
  const brickMetrics = list.reduce((result, item) => {
    const current = getRecordMetricStats(item, "brickCount", "ocgBrickCounts");
    result.recordedCount += current.recordedCount;
    result.totalCount += current.totalCount;
    return result;
  }, {
    recordedCount: 0,
    totalCount: 0,
  });
  const { starterGames, hasStarterCount, starterTotalCount } = starterMetrics;

  return {
    totalGames,
    winCount,
    drawCount,
    winRate: formatRateValue(winCount, totalGames),
    coinGames,
    coinWinCount,
    coinWinRate: formatRateValue(coinWinCount, coinGames),
    winCoinGames,
    winCoinWinCount,
    winRateWhenCoinWin: formatRateValue(winCoinWinCount, winCoinGames),
    loseCoinGames,
    loseCoinWinCount,
    winRateWhenCoinLoss: formatRateValue(loseCoinWinCount, loseCoinGames),
    starterGames,
    starterTotalCount,
    hasStarterCount,
    hasStarterRate: formatRateValue(hasStarterCount, starterGames),
    handTrapRecordedCount: handTrapMetrics.recordedCount,
    handTrapTotalCount: handTrapMetrics.totalCount,
    brickRecordedCount: brickMetrics.recordedCount,
    brickTotalCount: brickMetrics.totalCount,
    averageStarterCount: formatAverageMetricValue(starterTotalCount, starterGames),
    averageHandTrapCount: formatAverageMetricValue(
      handTrapMetrics.totalCount,
      handTrapMetrics.recordedCount
    ),
    averageBrickCount: formatAverageMetricValue(
      brickMetrics.totalCount,
      brickMetrics.recordedCount
    ),
  };
}

function buildOpponentDeckCategoryMap(categories = []) {
  const map = {};
  (categories || []).forEach((cat) => {
    const names = cat.deckNames || [];
    const target = String(cat.categoryName || "").trim();
    if (!target) return;
    names.forEach((name) => {
      const key = String(name || "").trim();
      if (key) {
        map[key] = target;
      }
    });
  });
  return map;
}

function buildFailureReasonCategoryMap(categories = []) {
  const map = {};
  (categories || []).forEach((cat) => {
    const target = String(cat.categoryName || "").trim();
    (cat.reasonNames || []).forEach((name) => {
      const key = String(name || "").trim();
      if (key && target) map[key] = target;
    });
  });
  return map;
}

function buildFailureReasonStats(records = [], categoryMap = {}) {
  const map = Array.isArray(categoryMap) ? buildFailureReasonCategoryMap(categoryMap) : categoryMap;
  const counts = new Map();
  let total = 0;
  (records || []).forEach((record) => {
    const reasons = Array.isArray(record.failureReasons) ? record.failureReasons : [];
    reasons.forEach((reason) => {
      const name = String(reason || "").trim();
      if (!name) return;
      const display = map[name] || name;
      counts.set(display, (counts.get(display) || 0) + 1);
      total += 1;
    });
  });
  return Array.from(counts.entries()).map(([name, count]) => ({
    name, count, total, shareRate: formatRateValue(count, total),
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
}

function buildOpponentDeckStats(records, mode = "all", categoryMap = null) {
  const grouped = new Map();
  const winRateGroups = new Map();
  (records || []).forEach((item) => {
    const opponentDeck = String(item.opponentDeck || "").trim();
    if (!opponentDeck) {
      return;
    }
    const stats = winRateGroups.get(opponentDeck) || {
      winCount: 0,
      resolvedGames: 0,
      coinWinCount: 0,
      coinLossCount: 0,
    };
    if (Number(item.coinResult) === 1) {
      stats.coinWinCount += 1;
    } else if (Number(item.coinResult) === 0) {
      stats.coinLossCount += 1;
    }
    if (isResolvedMatchResult(item.matchResult)) {
      stats.resolvedGames += 1;
      if (Number(item.matchResult) === 1) {
        stats.winCount += 1;
      }
    }
    winRateGroups.set(opponentDeck, stats);
  });
  const scopedRecords = (records || []).filter((item) => {
    const opponentDeck = String(item.opponentDeck || "").trim();
    if (!opponentDeck) {
      return false;
    }
    const matchResult = Number(item.matchResult);
    if (mode === "win") {
      return matchResult === 1;
    }
    if (mode === "loss") {
      return matchResult === 0;
    }
    return true;
  });

  scopedRecords.forEach((item) => {
    let opponentDeck = String(item.opponentDeck || "").trim();
    if (categoryMap && categoryMap[opponentDeck]) {
      opponentDeck = categoryMap[opponentDeck];
    }
    grouped.set(opponentDeck, (grouped.get(opponentDeck) || 0) + 1);
  });

  const totalRecordedGames = scopedRecords.length;

  return Array.from(grouped.entries())
    .map(([opponentDeck, matchCount]) => {
      const winRateStats = winRateGroups.get(opponentDeck) || {
        winCount: 0,
        resolvedGames: 0,
        coinWinCount: 0,
        coinLossCount: 0,
      };
      return {
        opponentDeck,
        matchCount,
        totalRecordedGames,
        shareRate: formatRateValue(matchCount, totalRecordedGames),
        winCount: winRateStats.winCount,
        resolvedGames: winRateStats.resolvedGames,
        winRate: formatRateValue(winRateStats.winCount, winRateStats.resolvedGames),
        coinWinCount: winRateStats.coinWinCount,
        coinLossCount: winRateStats.coinLossCount,
        coinSummary: `${winRateStats.coinWinCount}赢骰 ${winRateStats.coinLossCount}输骰`,
      };
    })
    .sort((left, right) => {
      if (Number(right.matchCount || 0) !== Number(left.matchCount || 0)) {
        return Number(right.matchCount || 0) - Number(left.matchCount || 0);
      }
      return String(left.opponentDeck || "").localeCompare(String(right.opponentDeck || ""), "zh-CN");
    });
}

function applyOpponentDeckCategoryMapping(statsList, categoryMap) {
  if (!categoryMap || !Object.keys(categoryMap).length || !statsList.length) {
    return statsList;
  }
  const merged = new Map();
  const unmatched = [];
  statsList.forEach((item) => {
    const deck = String(item.opponentDeck || "").trim();
    const category = categoryMap[deck];
    if (category) {
      const existing = merged.get(category);
      if (existing) {
        existing.matchCount = (existing.matchCount || 0) + (item.matchCount || 0);
        existing.totalRecordedGames = Math.max(existing.totalRecordedGames || 0, item.totalRecordedGames || 0);
        existing.winCount = (existing.winCount || 0) + (item.winCount || 0);
        existing.resolvedGames = (existing.resolvedGames || 0) + (item.resolvedGames || 0);
        existing.coinWinCount = (existing.coinWinCount || 0) + (item.coinWinCount || 0);
        existing.coinLossCount = (existing.coinLossCount || 0) + (item.coinLossCount || 0);
      } else {
        merged.set(category, {
          opponentDeck: category,
          matchCount: item.matchCount || 0,
          totalRecordedGames: item.totalRecordedGames || 0,
          winCount: item.winCount || 0,
          resolvedGames: item.resolvedGames || 0,
          coinWinCount: item.coinWinCount || 0,
          coinLossCount: item.coinLossCount || 0,
        });
      }
    } else {
      unmatched.push(item);
    }
  });
  const mergedList = Array.from(merged.values()).map((item) => ({
    ...item,
    shareRate: formatRateValue(item.matchCount, item.totalRecordedGames),
    winRate: formatRateValue(item.winCount, item.resolvedGames),
    winRateClass: getRateClass(
      formatRateValue(item.winCount, item.resolvedGames),
      50
    ),
    coinSummary: `${item.coinWinCount || 0}赢骰 ${item.coinLossCount || 0}输骰`,
  }));

  return mergedList.concat(unmatched).sort((left, right) => {
    if (Number(right.matchCount || 0) !== Number(left.matchCount || 0)) {
      return Number(right.matchCount || 0) - Number(left.matchCount || 0);
    }
    return String(left.opponentDeck || "").localeCompare(String(right.opponentDeck || ""), "zh-CN");
  });
}

function decorateDeckUsageStats(statsList) {
  return (statsList || []).map((item) => ({
    ...item,
    shareClass: getOpponentDeckShareClass(item.shareRate),
  }));
}

function sortDeckListByCount(decks) {
  return (decks || []).slice().sort((left, right) => {
    if (Number(right.totalGames || 0) !== Number(left.totalGames || 0)) {
      return Number(right.totalGames || 0) - Number(left.totalGames || 0);
    }
    return String(left.deckName || "").localeCompare(String(right.deckName || ""), "zh-CN");
  });
}

function deriveLocalOcgMatchResult(gameResults) {
  const values = (gameResults || []).filter(Boolean);
  const winCount = values.filter((item) => item === "win").length;
  const lossCount = values.filter((item) => item === "loss").length;
  if (winCount > lossCount) {
    return 1;
  }
  if (lossCount > winCount) {
    return 0;
  }
  return MATCH_RESULT_DRAW;
}

function compareRecordListItemDesc(left, right) {
  const leftMonth = String((left && left.matchMonth) || "");
  const rightMonth = String((right && right.matchMonth) || "");
  if (leftMonth !== rightMonth) {
    return rightMonth.localeCompare(leftMonth, "zh-CN");
  }
  const leftCreate = String((left && left.createTime) || "");
  const rightCreate = String((right && right.createTime) || "");
  if (leftCreate !== rightCreate) {
    return rightCreate.localeCompare(leftCreate, "zh-CN");
  }
  return String((right && right.updateTime) || "").localeCompare(
    String((left && left.updateTime) || ""),
    "zh-CN"
  );
}

function sortRecordListDesc(records) {
  return (records || []).slice().sort(compareRecordListItemDesc);
}

function formatCsvCell(value) {
  const normalized = String(value === null || value === undefined ? "" : value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  return /[",\n]/.test(normalized)
    ? `"${normalized.replace(/"/g, '""')}"`
    : normalized;
}

function parseCsvTextRows(text) {
  const source = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      if (row.some((item) => String(item).trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    if (row.some((item) => String(item).trim() !== "")) rows.push(row);
  }
  return rows;
}

function fnv1aHash(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function parseCsvMetricList(value) {
  const text = String(value || "").trim();
  if (!text) return [];
  return text.split("/").map((item) => {
    const normalized = String(item || "").trim();
    if (!normalized || normalized === "未") return null;
    const numberValue = Number(normalized);
    return Number.isInteger(numberValue) ? numberValue : null;
  });
}

function parseCsvOcgResults(value) {
  const text = String(value || "");
  const results = [];
  const pattern = /([○×-])(?:\([^)]*\))?/g;
  let match;
  while ((match = pattern.exec(text))) {
    results.push(match[1] === "○" ? "win" : match[1] === "×" ? "loss" : "draw");
  }
  return results;
}

function normalizeCsvMatchFormat(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "md" || normalized.includes("大师")) return "md";
  if (normalized === "ocg" || normalized.includes("实卡")) return "ocg";
  throw new Error(`无法识别 CSV 赛制：${value || "空"}`);
}

function parseCsvRecordRows(text) {
  const rows = parseCsvTextRows(text);
  if (rows.length < 2) throw new Error("CSV 中没有可导入的战绩");
  const headers = rows[0].map((item) => String(item || "").trim());
  const indexMap = new Map(headers.map((item, index) => [item, index]));
  ["赛制", "对局月份", "对战类型", "卡组", "胜负结果"].forEach((name) => {
    if (!indexMap.has(name)) throw new Error(`CSV 缺少必要列：${name}`);
  });
  const get = (row, name) => indexMap.has(name) ? String(row[indexMap.get(name)] || "").trim() : "";
  return rows.slice(1).map((row, rowIndex) => {
    const matchFormat = normalizeCsvMatchFormat(get(row, "赛制"));
    const dayText = get(row, "日期").replace(/号$/, "");
    const resultLabel = get(row, "胜负结果");
    const resultMap = { 胜利: 1, 失利: 0, 掉线: 2, 拔线: 3, 平局: 4 };
    const coinText = get(row, "骰子结果");
    const coinResult = coinText === "赢骰" ? 1 : coinText === "输骰" ? 0 : null;
    const record = {
      matchFormat,
      matchMonth: get(row, "对局月份"),
      dayOfWeek: dayText,
      matchTypeName: get(row, "对战类型"),
      deckName: get(row, "卡组"),
      mdAccountName: get(row, "MD账号"),
      opponentDeck: get(row, "对手卡组"),
      coinResult,
      matchResult: resultMap[resultLabel],
      ocgGameResults: matchFormat === "ocg" ? parseCsvOcgResults(get(row, "三局结果")) : [],
      starterValues: parseCsvMetricList(get(row, "动点数")),
      handTrapValues: parseCsvMetricList(get(row, "手坑数")),
      brickValues: parseCsvMetricList(get(row, "废件数")),
      failureReasons: get(row, "失败原因").split(/[、,，]/).map((item) => item.trim()).filter(Boolean).slice(0, 3),
      remark: get(row, "备注"),
      createTime: get(row, "创建时间"),
      sourceId: get(row, "记录标识"),
    };
    if (!record.matchMonth || !record.deckName || !record.matchTypeName || record.matchResult === undefined) {
      throw new Error(`CSV 第 ${rowIndex + 2} 行缺少必要战绩字段`);
    }
    if (record.coinResult === null) {
      throw new Error(`CSV 第 ${rowIndex + 2} 行缺少或无法识别骰子结果`);
    }
    if (matchFormat === "ocg" && record.ocgGameResults.length !== 3) {
      throw new Error(`CSV 第 ${rowIndex + 2} 行 OCG 三局结果不完整`);
    }
    record.starterCount = matchFormat === "md" ? (record.starterValues[0] ?? null) : null;
    record.handTrapCount = matchFormat === "md" ? (record.handTrapValues[0] ?? null) : null;
    record.brickCount = matchFormat === "md" ? (record.brickValues[0] ?? null) : null;
    record.importKey = record.sourceId
      ? (String(record.sourceId).startsWith("csv:") ? String(record.sourceId) : `csv:${record.sourceId}`)
      : `legacy:${fnv1aHash(JSON.stringify(record))}`;
    return record;
  });
}

function csvRecordFingerprint(record) {
  const isOcg = record.matchFormat === "ocg";
  return JSON.stringify([
    record.matchFormat, record.matchMonth, record.dayOfWeek, record.matchTypeName || record.matchType,
    record.deckName, record.mdAccountName || record.mdAccount, record.opponentDeck,
    record.coinResult, record.matchResult, record.ocgGameResults || [],
    record.starterValues || (isOcg ? record.ocgStarterCounts || [] : [record.starterCount]),
    record.handTrapValues || (isOcg ? record.ocgHandTrapCounts || [] : [record.handTrapCount]),
    record.brickValues || (isOcg ? record.ocgBrickCounts || [] : [record.brickCount]),
    record.failureReasons || [],
    record.remark, record.createTime,
  ]);
}

function wxDownloadFilePromise(options) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      ...options,
      success: resolve,
      fail: reject,
    });
  });
}

function wxCloudDownloadFilePromise(options) {
  // 本地模式:card-store 返回的 fileID 即本地文件路径,复制到临时文件返回
  // (调用方会先 unlink 目标路径再 copy,复制一份可避免误删源文件)
  const fileID = String((options && options.fileID) || "").trim();
  if (!fileID || fileID.indexOf("cloud://") === 0) {
    return Promise.reject(new Error("本地模式不支持云文件下载"));
  }
  const tempFilePath =
    wx.env.USER_DATA_PATH +
    "/ygo_tmp_cloud_" + Date.now() + "_" + Math.floor(Math.random() * 1e6) + ".jpg";
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().copyFile({
      srcPath: fileID,
      destPath: tempFilePath,
      success: () => resolve({ tempFilePath }),
      fail: reject,
    });
  });
}

function wxFsCopyFilePromise(fileSystemManager, srcPath, destPath) {
  return new Promise((resolve, reject) => {
    fileSystemManager.copyFile({
      srcPath,
      destPath,
      success: resolve,
      fail: reject,
    });
  });
}

function wxFsAccessPromise(fileSystemManager, path) {
  return new Promise((resolve) => {
    fileSystemManager.access({
      path,
      success: () => resolve(true),
      fail: () => resolve(false),
    });
  });
}

function wxFsUnlinkPromise(fileSystemManager, filePath) {
  return new Promise((resolve) => {
    fileSystemManager.unlink({
      filePath,
      success: () => resolve(true),
      fail: () => resolve(false),
    });
  });
}

function wxFsUnlinkSync(fileSystemManager, filePath) {
  try {
    fileSystemManager.unlinkSync(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

function wxFsWriteFilePromise(fileSystemManager, filePath, data, encoding = "utf8") {
  return new Promise((resolve, reject) => {
    fileSystemManager.writeFile({
      filePath,
      data,
      encoding,
      success: resolve,
      fail: reject,
    });
  });
}

function wxFsWriteFileSync(fileSystemManager, filePath, data, encoding = "utf8") {
  fileSystemManager.writeFileSync(filePath, data, encoding);
}

function wxShareFileMessagePromise(options) {
  return new Promise((resolve, reject) => {
    wx.shareFileMessage({
      ...options,
      success: resolve,
      fail: reject,
    });
  });
}

function getMonthSortKey(monthValue) {
  const match = String(monthValue || "").trim().match(/^(\d{4})-(\d{1,2})$/);
  if (!match) {
    return -1;
  }

  return Number(match[1]) * 100 + Number(match[2]);
}

function sortMonthItemsDesc(monthItems) {
  return (monthItems || []).slice().sort((left, right) => {
    const keyDiff = getMonthSortKey(right.itemValue) - getMonthSortKey(left.itemValue);
    if (keyDiff !== 0) {
      return keyDiff;
    }
    return String(right.itemValue || "").localeCompare(String(left.itemValue || ""), "zh-CN");
  });
}

function sortMonthItemsAsc(monthItems) {
  return (monthItems || []).slice().sort((left, right) => {
    const keyDiff = getMonthSortKey(left.itemValue) - getMonthSortKey(right.itemValue);
    if (keyDiff !== 0) {
      return keyDiff;
    }
    return String(left.itemValue || "").localeCompare(String(right.itemValue || ""), "zh-CN");
  });
}

function buildMonthFilterOptions(monthItems) {
  return [
    {
      id: "all",
      itemLabel: "全部月份",
      itemValue: "all",
    },
  ].concat(monthItems || []);
}

function getMonthFilterIndex(options, selectedValue) {
  const list = options || [];
  const targetValue = selectedValue || "all";
  const index = list.findIndex(
    (item) => item && item.itemValue === targetValue
  );

  return index >= 0 ? index : 0;
}

function buildMatchTypeFilterOptions(matchTypes) {
  return [
    {
      id: "all",
      itemLabel: "全部类型",
      itemValue: "all",
      matchTypeIds: [],
    },
  ].concat(matchTypes || []);
}

function getMatchTypeFilterIndex(options, selectedId) {
  const list = options || [];
  const targetId = selectedId || "all";
  const index = list.findIndex(
    (item) => item && String(item.id) === String(targetId)
  );

  return index >= 0 ? index : 0;
}

function buildAdminOverviewMatchTypeOptions(matchTypes, selectedIds) {
  const selectedSet = new Set((selectedIds || []).map((id) => String(id)));
  return (matchTypes || [])
    .filter(
      (item) =>
        item && item.id !== undefined && item.id !== null && item.id !== ""
    )
    .map((item) => ({
      id: item.id,
      itemLabel: item.itemLabel || item.itemValue || "未命名",
      active: selectedSet.has(String(item.id)),
    }));
}

function resolveAdminOverviewMonthState(monthItems, selectedValue) {
  const list = monthItems || [];
  const fallbackValue = getCurrentMonth();
  if (!list.length) {
    return {
      index: 0,
      value: fallbackValue,
      label: formatMonthOptionLabel(fallbackValue),
    };
  }

  let index = list.findIndex(
    (item) => item && item.itemValue === (selectedValue || fallbackValue)
  );
  if (index < 0) {
    index = getPreferredMonthIndex(list);
  }
  const selectedItem = list[index] || list[0] || {
    itemValue: fallbackValue,
    itemLabel: formatMonthOptionLabel(fallbackValue),
  };

  return {
    index: index >= 0 ? index : 0,
    value: selectedItem.itemValue || fallbackValue,
    label: selectedItem.itemLabel || formatMonthOptionLabel(selectedItem.itemValue || fallbackValue),
  };
}

function buildStatsMonthRangeValues(monthItems) {
  return sortMonthItemsAsc(monthItems || []).map((item) => item.itemValue || "");
}

function resolveStatsMonthRange(monthValues, startValue, endValue) {
  const values = (monthValues || []).filter(Boolean);
  if (!values.length) {
    return {
      startValue: "",
      endValue: "",
      startIndex: 0,
      endIndex: 0,
    };
  }

  let startIndex = values.indexOf(startValue);
  let endIndex = values.indexOf(endValue);

  if (startIndex < 0) {
    startIndex = 0;
  }
  if (endIndex < 0) {
    endIndex = values.length - 1;
  }
  if (startIndex > endIndex) {
    const temp = startIndex;
    startIndex = endIndex;
    endIndex = temp;
  }

  return {
    startValue: values[startIndex],
    endValue: values[endIndex],
    startIndex,
    endIndex,
  };
}

function formatStatsMonthRangeLabel(startValue, endValue) {
  const startLabel = formatMonthOptionLabel(startValue);
  const endLabel = formatMonthOptionLabel(endValue);
  if (!startLabel && !endLabel) {
    return "未选择月份";
  }
  if (startLabel === endLabel) {
    return startLabel;
  }
  return `${startLabel} 至 ${endLabel}`;
}

function createEmptyDeckSections() {
  return {
    main: [],
    extra: [],
    side: [],
  };
}

function getDeckSectionLabel(section) {
  if (section === "extra") {
    return "额外";
  }
  if (section === "side") {
    return "副卡组";
  }
  return "主卡组";
}

function buildDeckCardViewItem(item) {
  const card = item.card || item;
  return {
    cardId: item.cardId || card.cardId,
    count: Number(item.count || 1),
    section: item.section || "main",
    card: {
      ...card,
      imageSrc: getResolvedCardImageSrc(card),
      typeText: Array.isArray(card.types) ? card.types.join(" / ") : "",
      metaText: [
        Array.isArray(card.types) ? card.types.join(" / ") : "",
        card.race || "",
        card.attribute || "",
      ].filter(Boolean).join(" · "),
      statText:
        card.atk !== null && card.atk !== undefined
          ? `ATK ${card.atk}${card.def !== null && card.def !== undefined ? ` / DEF ${card.def}` : ""}`
          : "",
    },
  };
}

function getCardDisplayNameByFormat(card, matchFormat) {
  if (!card) {
    return "";
  }
  if (matchFormat === "md") {
    return card.mdName || card.cnName || card.scName || card.name || card.cardId || "";
  }
  return card.cnName || card.scName || card.mdName || card.name || card.cardId || "";
}

function getDeckBuilderCardName(card) {
  return String(
    (card &&
      (card.displayName || card.cnName || card.scName || card.mdName || card.name || card.cardId)) ||
      ""
  ).trim();
}

function isExtraDeckMonsterCard(card) {
  if (typeof (card && card.isExtraDeckCard) === "boolean") {
    return card.isExtraDeckCard;
  }
  const typeText = Array.isArray(card && card.types)
    ? card.types.map((item) => String(item || "")).join(" ")
    : String((card && card.typeText) || "");
  return EXTRA_DECK_TYPE_KEYWORDS.some((keyword) => typeText.includes(keyword));
}

function getDeckSectionCardRuleMessage(card, section) {
  if (section === "side") {
    return "";
  }
  const displayName = getDeckBuilderCardName(card) || "该卡";
  const isExtraCard = isExtraDeckMonsterCard(card);
  if (section === "extra" && !isExtraCard) {
    return `${displayName} 不能加入额外卡组`;
  }
  if (section === "main" && isExtraCard) {
    return `${displayName} 只能加入额外卡组或副卡组`;
  }
  return "";
}

function getDeckBuilderSameNameCount(sections, cardName) {
  const targetName = String(cardName || "").trim();
  if (!targetName) {
    return 0;
  }
  return ["main", "extra", "side"].reduce((total, section) => {
    return (
      total +
      (sections[section] || []).reduce((sectionTotal, item) => {
        return getDeckBuilderCardName(item.card) === targetName
          ? sectionTotal + Number(item.count || 1)
          : sectionTotal;
      }, 0)
    );
  }, 0);
}

function validateDeckBuilderSections(sections, matchFormat) {
  if (matchFormat === "md" && (sections.side || []).some((item) => Number(item.count || 0) > 0)) {
    return "MD 模式不支持副卡组";
  }
  const sameNameCountMap = new Map();
  for (const section of ["main", "extra", "side"]) {
    for (const item of sections[section] || []) {
      const ruleMessage = getDeckSectionCardRuleMessage(item.card, section);
      if (ruleMessage) {
        return ruleMessage;
      }
      const cardName = getDeckBuilderCardName(item.card);
      if (!cardName) {
        continue;
      }
      const nextCount = (sameNameCountMap.get(cardName) || 0) + Number(item.count || 1);
      if (nextCount > 3) {
        return `${cardName} 在主卡组、额外卡组、副卡组中的总数不能超过 3 张`;
      }
      sameNameCountMap.set(cardName, nextCount);
    }
  }
  return "";
}

function normalizeDeckBuilderSections(sections) {
  const source = sections || {};
  return {
    main: (source.main || []).map(buildDeckCardViewItem),
    extra: (source.extra || []).map(buildDeckCardViewItem),
    side: (source.side || []).map(buildDeckCardViewItem),
  };
}

function buildDeckBuilderSectionGroups(sections, matchFormat) {
  const normalizedSections = sections || createEmptyDeckSections();
  const sortSectionCards = (cards, section) =>
    (cards || []).slice().sort((left, right) =>
      compareDeckBuilderCards(left, right, section, matchFormat)
    );
  const getSectionTotalCount = (cards) =>
    (cards || []).reduce((total, item) => total + Number(item.count || 0), 0);
  const groups = [
    {
      key: "main",
      label: "主卡组",
      cards: sortSectionCards(normalizedSections.main || [], "main"),
      totalCount: getSectionTotalCount(normalizedSections.main || []),
    },
    {
      key: "extra",
      label: "额外卡组",
      cards: sortSectionCards(normalizedSections.extra || [], "extra"),
      totalCount: getSectionTotalCount(normalizedSections.extra || []),
    },
  ];
  if (matchFormat === "ocg") {
    groups.push({
      key: "side",
      label: "副卡组",
      cards: sortSectionCards(normalizedSections.side || [], "side"),
      totalCount: getSectionTotalCount(normalizedSections.side || []),
    });
  }
  return groups;
}

function getDeckBuilderViewState(sections, matchFormat) {
  return {
    deckBuilderSectionGroups: buildDeckBuilderSectionGroups(sections, matchFormat),
  };
}

function getDeckCardPrimaryTypeRank(card) {
  const types = Array.isArray(card && card.types) ? card.types : [];
  if (types.includes("怪兽")) {
    return 0;
  }
  if (types.includes("魔法")) {
    return 1;
  }
  if (types.includes("陷阱")) {
    return 2;
  }
  return 3;
}

function getExtraDeckSubtypeRank(card) {
  const types = Array.isArray(card && card.types) ? card.types : [];
  if (types.includes("融合")) {
    return 0;
  }
  if (types.includes("同调")) {
    return 1;
  }
  if (types.includes("超量")) {
    return 2;
  }
  if (types.includes("连接")) {
    return 3;
  }
  return 4;
}

function compareDeckBuilderCards(left, right, section, matchFormat) {
  const leftCard = left && left.card ? left.card : left;
  const rightCard = right && right.card ? right.card : right;
  if (section === "extra") {
    const extraTypeDiff = getExtraDeckSubtypeRank(leftCard) - getExtraDeckSubtypeRank(rightCard);
    if (extraTypeDiff !== 0) {
      return extraTypeDiff;
    }
  } else {
    const typeDiff = getDeckCardPrimaryTypeRank(leftCard) - getDeckCardPrimaryTypeRank(rightCard);
    if (typeDiff !== 0) {
      return typeDiff;
    }
    if (section === "side") {
      const extraTypeDiff = getExtraDeckSubtypeRank(leftCard) - getExtraDeckSubtypeRank(rightCard);
      if (
        isExtraDeckMonsterCard(leftCard) &&
        isExtraDeckMonsterCard(rightCard) &&
        extraTypeDiff !== 0
      ) {
        return extraTypeDiff;
      }
    }
  }

  const leftName = getCardDisplayNameByFormat(leftCard, matchFormat);
  const rightName = getCardDisplayNameByFormat(rightCard, matchFormat);
  const nameDiff = String(leftName).localeCompare(String(rightName), "zh-CN");
  if (nameDiff !== 0) {
    return nameDiff;
  }

  return Number(leftCard.cardId || 0) - Number(rightCard.cardId || 0);
}

function formatCardDetailView(card, matchFormat) {
  if (!card) {
    return null;
  }
  return {
    ...card,
    displayName: getCardDisplayNameByFormat(card, matchFormat),
    imageSrc: getResolvedCardImageSrc(card),
    typeText: Array.isArray(card.types) ? card.types.join(" / ") : "",
    metaText: [card.race || "", card.attribute || ""].filter(Boolean).join(" · "),
    statText:
      card.atk !== null && card.atk !== undefined
        ? `ATK ${card.atk}${card.def !== null && card.def !== undefined ? ` / DEF ${card.def}` : ""}`
        : "",
    extraText: [
      card.level !== null && card.level !== undefined ? `等级 ${card.level}` : "",
      card.scale !== null && card.scale !== undefined ? `灵摆 ${card.scale}` : "",
      card.linkval !== null && card.linkval !== undefined ? `LINK ${card.linkval}` : "",
    ].filter(Boolean).join(" · "),
  };
}

function buildDefaultRecordDraft(matchFormat) {
  return {
    matchFormat: matchFormat || "md",
    recordDeckId: "",
    recordCoinResult: 1,
    recordMatchResult: 1,
    recordOcgGames: buildDefaultOcgGames().map((item) => ({
      value: item.value,
      starterCount: item.starterCount,
      handTrapCount: item.handTrapCount,
      brickCount: item.brickCount,
    })),
    recordStarterCount: null,
    recordHandTrapCount: null,
    recordBrickCount: null,
    recordOpponentDeck: "",
    recordFailureReasons: [],
    recordFailureReasonVisible: false,
    recordRemark: "",
    recordMatchTypeId: "",
  };
}

function normalizeDeckNameInput(value) {
  return String(value || "")
    .replace(/[\r\n]+/g, "")
    .trim();
}

function normalizeOpponentDeckInput(value) {
  return String(value || "")
    .replace(/[\r\n]+/g, "")
    .slice(0, OPPONENT_DECK_MAX_LENGTH);
}

function buildRecordOpponentDeckHistoryItems(records) {
  const grouped = new Map();
  // 按对手卡组聚合总场次，展示名取最近一次输入的写法
  sortRecordListDesc(records).forEach((item) => {
    const value = normalizeOpponentDeckInput(item && item.opponentDeck).trim();
    if (!value) {
      return;
    }

    const key = value.toLowerCase();
    if (!grouped.has(key)) {
      grouped.set(key, {
        key: `history:${key}`,
        value,
        count: 0,
      });
    }
    grouped.get(key).count += 1;
  });

  return Array.from(grouped.values())
    .sort((a, b) => b.count - a.count)
    .map((item) => ({
      key: item.key,
      value: item.value,
      meta: `${item.count} 场`,
    }));
}

function normalizeFailureReasonInput(value) {
  return String(value || "").replace(/[\r\n]+/g, "").slice(0, 10);
}

function buildRecordFailureReasonHistoryItems(records) {
  const grouped = new Map();
  sortRecordListDesc(records).forEach((item) => {
    const reasons = Array.isArray(item && item.failureReasons) ? item.failureReasons : [];
    reasons.forEach((reason) => {
      const value = normalizeFailureReasonInput(reason).trim();
      if (!value) return;
      const entry = grouped.get(value) || { value, count: 0 };
      entry.count += 1;
      grouped.set(value, entry);
    });
  });
  return Array.from(grouped.values())
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value, "zh-CN"))
    .map((item) => ({ key: item.value, value: item.value, meta: `${item.count} 次` }));
}

function buildRecordOpponentDeckDeckItems(decks) {
  const seen = new Set();
  return (decks || []).reduce((result, item) => {
    const value = normalizeDeckNameInput(item && item.deckName).trim();
    if (!value) {
      return result;
    }

    const key = value.toLowerCase();
    if (seen.has(key)) {
      return result;
    }
    seen.add(key);

    result.push({
      key: `deck:${String((item && item.id) || key)}`,
      value,
      meta: `${Number((item && item.totalGames) || 0)} 场`,
    });
    return result;
  }, []);
}

function normalizeRecordFieldVisibilitySettings(value) {
  const source = value && typeof value === "object" ? value : {};
  return RECORD_OPTIONAL_FIELD_ITEMS.reduce((result, item) => {
    result[item.key] = source[item.key] === undefined
      ? DEFAULT_RECORD_FIELD_VISIBILITY[item.key]
      : Boolean(source[item.key]);
    return result;
  }, {});
}

function buildRecordFieldSettingItems(visibility = DEFAULT_RECORD_FIELD_VISIBILITY) {
  return RECORD_OPTIONAL_FIELD_ITEMS.map((item) => ({
    ...item,
    checked: Boolean(visibility[item.key]),
  }));
}

function hasHiddenRecordOptionalFields(visibility = DEFAULT_RECORD_FIELD_VISIBILITY) {
  return RECORD_OPTIONAL_FIELD_ITEMS.some((item) => !visibility[item.key]);
}

function hasHiddenRecordOptionalFieldValue(source, visibility = DEFAULT_RECORD_FIELD_VISIBILITY) {
  const state = source && typeof source === "object" ? source : {};
  const recordOcgGames = Array.isArray(state.recordOcgGames) ? state.recordOcgGames : [];
  const ocgStarterCounts = Array.isArray(state.ocgStarterCounts) ? state.ocgStarterCounts : [];
  const ocgHandTrapCounts = Array.isArray(state.ocgHandTrapCounts) ? state.ocgHandTrapCounts : [];
  const ocgBrickCounts = Array.isArray(state.ocgBrickCounts) ? state.ocgBrickCounts : [];

  if (!visibility.dayOfWeek) {
    const dayOfWeek = String(state.recordDayOfWeek || state.dayOfWeek || "").trim();
    if (dayOfWeek) {
      return true;
    }
  }

  if (!visibility.opponentDeck) {
    const opponentDeck = String(state.recordOpponentDeck || state.opponentDeck || "").trim();
    if (opponentDeck) {
      return true;
    }
  }

  if (!visibility.starterCount) {
    if (
      Number.isInteger(state.recordStarterCount) ||
      Number.isInteger(state.starterCount) ||
      recordOcgGames.some((item) => Number.isInteger(item && item.starterCount)) ||
      ocgStarterCounts.some((item) => Number.isInteger(item))
    ) {
      return true;
    }
  }

  if (!visibility.handTrapCount) {
    if (
      Number.isInteger(state.recordHandTrapCount) ||
      Number.isInteger(state.handTrapCount) ||
      recordOcgGames.some((item) => Number.isInteger(item && item.handTrapCount)) ||
      ocgHandTrapCounts.some((item) => Number.isInteger(item))
    ) {
      return true;
    }
  }

  if (!visibility.brickCount) {
    if (
      Number.isInteger(state.recordBrickCount) ||
      Number.isInteger(state.brickCount) ||
      recordOcgGames.some((item) => Number.isInteger(item && item.brickCount)) ||
      ocgBrickCounts.some((item) => Number.isInteger(item))
    ) {
      return true;
    }
  }

  if (!visibility.remark) {
    const remark = String(state.recordRemark || state.remark || "").trim();
    if (remark) {
      return true;
    }
  }

  if (!visibility.failureReasons) {
    const reasons = Array.isArray(state.recordFailureReasons) ? state.recordFailureReasons : state.failureReasons;
    if (Array.isArray(reasons) && reasons.length) return true;
  }

  return false;
}

function buildSettingSections(isAdmin) {
  return (SETTING_SECTIONS || []).filter((item) =>
    item && item.adminOnly ? Boolean(isAdmin) : true
  );
}

const MD_MIGRATE_MODE_OPTIONS = [
  { key: "deck", label: "按卡组" },
  { key: "matchType", label: "按对战类型" },
  { key: "record", label: "逐条选择" },
];

function normalizeAppConfig(config) {
  const source = config && typeof config === "object" ? config : {};
  return {
    donationEnabled: Boolean(source.donationEnabled),
    donationImageUrl: String(source.donationImageUrl || "").trim(),
    donationText: String(source.donationText || "").trim(),
    mpQrcodeUrl: String(source.mpQrcodeUrl || "").trim(),
    mpName: String(source.mpName || "").trim(),
  };
}

function toMessageTimeValue(message) {
  const raw = message && message.createdAt;
  if (!raw) {
    return 0;
  }
  const date = raw instanceof Date ? raw : new Date(raw);
  const time = date.getTime();
  return Number.isNaN(time) ? 0 : time;
}

function formatMessageTime(value) {
  if (!value) {
    return "";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function decorateMessage(message) {
  return {
    ...message,
    displayTime: formatMessageTime(message && message.createdAt),
  };
}

function sortMessages(messages, sortBy) {
  const sorted = (messages || []).slice();
  if (sortBy === "likes") {
    sorted.sort((left, right) => {
      if (Number(right.likeCount || 0) !== Number(left.likeCount || 0)) {
        return Number(right.likeCount || 0) - Number(left.likeCount || 0);
      }
      return toMessageTimeValue(right) - toMessageTimeValue(left);
    });
    return sorted;
  }
  sorted.sort((left, right) => toMessageTimeValue(right) - toMessageTimeValue(left));
  return sorted;
}

const pageConfig = {
  data: {
    dayOptions: DAY_OPTIONS,
    recordDayOptions: buildRecordDayOptions(),
    tabs: TAB_OPTIONS,
    matchFormats: MATCH_FORMAT_OPTIONS,
    currentMatchFormat: "md",
    currentMatchFormatLabel: MATCH_FORMAT_LABEL_MAP.md,
    currentTab: "records",
    currentTabTitle: TAB_TITLE_MAP.records,
    settingSections: buildSettingSections(false),
    currentSettingSection: "decks",
    liteEdition: LITE_EDITION,
    isAdmin: false,
    appConfig: { ...DEFAULT_APP_CONFIG },
    appConfigSaving: false,
    defaultDonationText: DEFAULT_DONATION_TEXT,
    messageBoardExpanded: false,
    messagesLoading: false,
    messagesLoaded: false,
    messages: [],
    messageTotal: 0,
    messageSortBy: "time",
    messageSortOptions: MESSAGE_SORT_OPTIONS,
    messageDraft: "",
    messageMaxLength: MESSAGE_MAX_LENGTH,
    messageSubmitting: false,
    migrationRunning: false,
    migrationProgressText: "",
    recordExporting: false,
    backupExporting: false,
    backupImporting: false,
    backupSummaryText: "",
    csvExportText: "",
    recordsRefreshing: false,
    settingsRefreshing: false,
    pageLoading: true,
    contentLoading: false,
    errorMessage: "",
    pageShellHeight: 720,
    safeAreaBottom: 0,
    workspaceTopPadding: 16,
    workspaceBottomPadding: 88,
    sidebarCollapsed: false,
    sidebarDecks: [{ id: "all", deckName: "全部卡组", totalGames: 0, isVirtual: true }],
    decks: [],
    selectedDeckId: "all",
    selectedDeckName: "全部卡组",
    currentStreakLabel: "",
    heroCollapsed: false,
    records: [],
    recordsDisplayCount: RECORD_LIST_PAGE_SIZE,
    recordsHasMore: false,
    statistics: {
      overall: { ...DEFAULT_STATS },
      byDeck: [],
      opponentDeckStats: {
        all: [],
        win: [],
        loss: [],
      },
    },
    opponentDeckStatsEnabled: false,
    statsTodayOnly: false,
    statsOpponentDeckMode: "all",
    currentStatsOpponentDeckModeLabel: STATS_OPPONENT_DECK_MODE_LABEL_MAP.all,
    statsOpponentDeckModeOptions: STATS_OPPONENT_DECK_MODE_OPTIONS,
    statsOpponentDeckList: [],
    pieChartEnabled: false,
    pieChartLegend: [],
    pieChartTotalGames: 0,
    pieChartGradient: "",
    pieChartColorMap: [],
    pieColorPickerVisible: false,
    pieColorPickerDeck: "",
    pieColorPickerIndex: -1,
    pieColorPickerValue: "",
    pieColorOptions: PIE_CUSTOM_COLORS,
    pieRulesVisible: false,
    opponentDeckCategories: [],
    failureReasonCategories: [],
    failureReasonStats: [],
    recordFailureReasons: [],
    recordFailureReasonVisible: false,
    recordFailureReason: "",
    recordFailureReasonPickerVisible: false,
    recordFailureReasonPickerLoading: false,
    recordFailureReasonInputFocused: false,
    recordFailureReasonHistoryItems: [],
    failureReasonMaxLength: 10,
    opponentDeckCategoryDialogVisible: false,
    opponentDeckCategoryEditingId: "",
    opponentDeckCategoryEditingName: "",
    opponentDeckCategoryEditingDeckNames: [],
    opponentDeckCategoryAvailableDeckNames: [],
    opponentDeckCategoryNameMaxLength: 12,
    opponentDeckCategoryDeckLimit: 20,
    failureReasonCategoryDialogVisible: false,
    failureReasonCategoryEditingId: "",
    failureReasonCategoryEditingName: "",
    failureReasonCategoryEditingReasonNames: [],
    failureReasonCategoryAvailableReasons: [],
    failureReasonCategoryNameMaxLength: 12,
    failureReasonCategoryReasonLimit: 20,
    adminOverviewScopeOptions: ADMIN_OVERVIEW_SCOPE_OPTIONS,
    adminOverviewScope: "month",
    adminOverviewLoaded: false,
    adminOverviewLoading: false,
    adminOverviewMonthIndex: 0,
    adminOverviewMonthValue: getCurrentMonth(),
    adminOverviewMonthLabel: formatMonthOptionLabel(getCurrentMonth()),
    adminOverviewStats: {
      totalGames: 0,
      deckCount: 0,
      scopeLabel: formatMonthOptionLabel(getCurrentMonth()),
      items: [],
    },
    adminOverviewMatchTypeOptions: [],
    adminOverviewMatchTypeList: [],
    adminOverviewSelectedMatchTypeNames: [],
    monthItems: [],
    monthFilterOptions: [{ id: "all", itemLabel: "全部月份", itemValue: "all" }],
    monthFilterIndex: 0,
    currentMonthFilterLabel: "全部月份",
    selectedMonthFilterValue: "all",
    statsMonthRangeValues: [],
    statsMonthRangeColumns: [[], []],
    statsMonthRangeIndices: [0, 0],
    statsMonthRangeStartValue: "",
    statsMonthRangeEndValue: "",
    statsMonthRangeLabel: "未选择月份",
    matchTypes: [],
    matchTypeFilterOptions: buildMatchTypeFilterOptions([]),
    matchTypeFilterIndex: 0,
    currentMatchTypeFilterLabel: "全部类型",
    selectedMatchTypeFilterValue: "all",
    selectedMatchTypeFilterIds: [],
    mdAccounts: [],
    currentMdAccountId: "",
    currentMdAccountName: "",
    mdMigrateVisible: false,
    mdMigrateLoading: false,
    mdMigrateSubmitting: false,
    mdMigrateAccountId: "",
    mdMigrateAccountName: "",
    mdMigrateMode: "deck",
    mdMigrateModeOptions: MD_MIGRATE_MODE_OPTIONS,
    mdMigrateGroups: [],
    mdMigrateRecords: [],
    mdMigrateSelectedCount: 0,
    settingsLoading: false,
    deckNameMaxLength: DECK_NAME_MAX_LENGTH,
    recordOpponentDeckMaxLength: OPPONENT_DECK_MAX_LENGTH,
    deckNameDialogVisible: false,
    deckNameDialogTitle: "",
    deckNameDialogPlaceholder: "",
    deckNameDialogValue: "",
    recordPopupVisible: false,
    recordSaving: false,
    recordEditingId: "",
    recordPopupMode: "create",
    recordDeckId: "",
    recordMonth: getCurrentMonth(),
    recordMonthIndex: 0,
    currentRecordMonthLabel: getCurrentMonth(),
    recordDayIndex: 0,
    currentRecordDayLabel: RECORD_DAY_OPTION_EMPTY.itemLabel,
    recordCoinResult: 1,
    recordMatchResult: 1,
    recordOcgGames: buildDefaultOcgGames(),
    recordOcgGameOptions: OCG_GAME_RESULT_OPTIONS,
    recordOcgSummaryLabel: "未完成",
    recordStarterCount: null,
    recordHandTrapCount: null,
    recordBrickCount: null,
    recordStarterCountIndex: 0,
    recordHandTrapCountIndex: 0,
    recordBrickCountIndex: 0,
    recordMetricOptions: RECORD_METRIC_OPTIONS,
    recordMetricPickerVisible: false,
    recordMetricPickerField: "",
    recordMetricPickerRoundIndex: -1,
    recordMetricPickerValue: null,
    recordMetricPickerTitle: "",
    recordMetricPickerOptions: [],
    recordDayCalendarVisible: false,
    recordDayCalendarMonth: getCurrentMonth(),
    recordDayCalendarWeekdayHeaders: ["一", "二", "三", "四", "五", "六", "日"],
    recordDayCalendarDays: [],
    recordOpponentDeck: "",
    recordOpponentDeckPickerVisible: false,
    recordOpponentDeckPickerLoading: false,
    recordOpponentDeckInputFocused: false,
    recordOpponentDeckHistoryItems: [],
    recordOpponentDeckDeckItems: [],
    recordFieldVisibility: { ...DEFAULT_RECORD_FIELD_VISIBILITY },
    recordFieldSettingItems: buildRecordFieldSettingItems(DEFAULT_RECORD_FIELD_VISIBILITY),
    recordHasHiddenOptionalFields: false,
    recordShowAllOptionalFields: false,
    recordRemark: "",
    recordMatchTypeIndex: 0,
    currentRecordMatchTypeLabel: getDefaultMatchTypeLabel("md"),
    recordMatchTypeOptions: buildRecordMatchTypeOptions([], "md"),
    recordMatchTypePickerVisible: false,
    recordMatchTypePickerOptions: [],
    statsMatchTypePickerVisible: false,
    recordDeckListCollapsed: true,
    recordDeckListOverflow: false,
    deckBuilderVisible: false,
    deckBuilderLoading: false,
    deckBuilderSaving: false,
    deckBuilderRefreshing: false,
    deckBuilderDeckId: "",
    deckBuilderDeckName: "",
    deckBuilderImages: [],
    deckImagePreviewVisible: false,
    deckImagePreview: null,
    deckBuilderKeyword: "",
    deckBuilderSearchKeywordApplied: "",
    deckBuilderSearchLoading: false,
    deckBuilderSearchLoadingMore: false,
    deckBuilderSearchHasMore: false,
    deckBuilderSearchPageNum: 0,
    deckBuilderSearchPageSize: 20,
    deckBuilderSearchResults: [],
    deckBuilderSections: createEmptyDeckSections(),
    deckBuilderSectionGroups: buildDeckBuilderSectionGroups(createEmptyDeckSections(), "md"),
    deckBuilderActionVisible: false,
    deckBuilderActionCard: null,
    deckBuilderActionMainCount: 0,
    deckBuilderActionSideCount: 0,
    deckBuilderActionPrimarySection: "main",
    cardDetailVisible: false,
    cardDetailLoading: false,
    cardDetailData: null,
    editHistoryVisible: false,
    editHistoryLoading: false,
    editHistoryItems: [],
    editHistoryRecordMeta: "",
  },

  onLoad() {
    this.loadRecordFieldVisibilitySettings();
    if (!LITE_EDITION) {
      this.loadPieChartColors();
      this.loadOpponentDeckCategories();
      this.loadFailureReasonCategories();
      this.restoreCurrentMdAccount();
    }
    this.bindWindowResize();
    this.scheduleLayoutMetricsRefresh();
    this.bootstrapPage();
  },

  onShow() {
    this.scheduleLayoutMetricsRefresh();
    if (this._hasBootstrapped) {
      this.refreshCurrentTabData();
      this.scheduleBackgroundRemoteRefresh({
        targetFormats: [this.getSelectedMatchFormat()],
      });
    }
  },

  onHide() {
    this.dismissRecordOpponentDeckInput();
    this.dismissRecordFailureReasonInput();
    this.clearLayoutMetricsTimers();
  },

  onBackPress() {
    if (this.data.recordFailureReasonPickerVisible) {
      this.closeRecordFailureReasonPicker();
      return true;
    }
    if (this.data.recordOpponentDeckPickerVisible) {
      this.closeRecordOpponentDeckPicker();
      return true;
    }
    if (this.data.recordPopupVisible) {
      this.closeCreateRecord();
      return true;
    }
    return false;
  },

  onUnload() {
    this.dismissRecordOpponentDeckInput();
    this.dismissRecordFailureReasonInput();
    this.clearLayoutMetricsTimers();
    this.unbindWindowResize();
  },

  onResize() {
    this.scheduleLayoutMetricsRefresh();
  },

  bindWindowResize() {
    if (typeof wx.onWindowResize !== "function" || this._windowResizeHandler) {
      return;
    }
    this._windowResizeHandler = () => {
      this.scheduleLayoutMetricsRefresh();
    };
    wx.onWindowResize(this._windowResizeHandler);
  },

  unbindWindowResize() {
    if (typeof wx.offWindowResize !== "function" || !this._windowResizeHandler) {
      return;
    }
    wx.offWindowResize(this._windowResizeHandler);
    this._windowResizeHandler = null;
  },

  clearLayoutMetricsTimers() {
    this._layoutMetricsGeneration = (this._layoutMetricsGeneration || 0) + 1;
    (this._layoutMetricsTimerIds || []).forEach((timerId) => clearTimeout(timerId));
    this._layoutMetricsTimerIds = [];
  },

  scheduleLayoutMetricsRefresh() {
    this.clearLayoutMetricsTimers();
    const generation = (this._layoutMetricsGeneration || 0) + 1;
    this._layoutMetricsGeneration = generation;
    this.initLayoutMetrics(generation);
    wx.nextTick(() => {
      if (generation !== this._layoutMetricsGeneration) {
        return;
      }
      this.initLayoutMetrics(generation);
    });
    this._layoutMetricsTimerIds = [80, 220].map((delay) =>
      setTimeout(() => {
        if (generation !== this._layoutMetricsGeneration) {
          return;
        }
        this.initLayoutMetrics(generation);
      }, delay)
    );
  },

  initLayoutMetrics(generation = null) {
    const systemInfo = typeof wx.getWindowInfo === "function"
      ? {
          ...wx.getSystemInfoSync(),
          ...wx.getWindowInfo(),
        }
      : wx.getSystemInfoSync();
    // SelectorQuery 的坐标以小程序窗口为准。safeArea.height 在部分真机上
    // 会包含窗口之外的区域，不能与 windowHeight 取较大值，否则会多预留底部空间。
    const windowHeight = Math.max(
      Number(systemInfo.windowHeight) ||
        Number(systemInfo.safeArea && systemInfo.safeArea.height) ||
        0,
      320
    );
    // 底部安全区(手势条/Home 条高度):
    // App 端用 plus.navigator.getSafeAreaInsets()(相对屏幕的绝对安全区,不受导航栏/状态栏坐标影响);
    // 小程序/H5 端用 screenHeight - safeArea.bottom。
    let safeAreaBottom = 0;
    // #ifdef APP-PLUS
    try {
      safeAreaBottom = Math.max(
        0,
        Number(
          (plus.navigator.getSafeAreaInsets &&
            plus.navigator.getSafeAreaInsets().bottom) ||
            0
        )
      );
    } catch (error) {
      safeAreaBottom = 0;
    }
    // #endif
    // #ifndef APP-PLUS
    safeAreaBottom = systemInfo.safeArea
      ? Math.max(0, Number(systemInfo.screenHeight || 0) - Number(systemInfo.safeArea.bottom || 0))
      : 0;
    // #endif
    const workspaceTopPadding = 16;
    const workspaceBottomPadding = Math.max(
      safeAreaBottom + DEFAULT_BOTTOM_TABS_RESERVE_PX,
      Number(this.data.workspaceBottomPadding) || 0
    );
    this.setData({
      pageShellHeight: windowHeight,
      safeAreaBottom,
      workspaceTopPadding,
      workspaceBottomPadding,
    });
    this.measureWorkspaceBottomPadding({
      windowHeight,
      safeAreaBottom,
      workspaceTopPadding,
      generation,
    });
  },

  measureWorkspaceBottomPadding({
    windowHeight,
    safeAreaBottom,
    workspaceTopPadding,
    generation = null,
  }) {
    wx.nextTick(() => {
      if (generation !== null && generation !== this._layoutMetricsGeneration) {
        return;
      }
      const query = this.createSelectorQuery();
      query.select(".bottom-tabs").boundingClientRect();
      query.exec((result = []) => {
        if (generation !== null && generation !== this._layoutMetricsGeneration) {
          return;
        }
        const bottomTabsRect = result[0];
        if (!bottomTabsRect || !Number.isFinite(bottomTabsRect.top)) {
          return;
        }
        const workspaceBottomPadding = Math.max(
          safeAreaBottom + 24,
          Math.round(windowHeight - Number(bottomTabsRect.top) + MEASURED_BOTTOM_TABS_EXTRA_GAP_PX)
        );
        if (workspaceBottomPadding === this.data.workspaceBottomPadding) {
          return;
        }
        this.setData({
          workspaceBottomPadding,
        });
      });
    });
  },

  async bootstrapPage() {
    this.setData({
      pageLoading: true,
      errorMessage: "",
    });

    try {
      await this.loadAdminStatus();
      if (this.data.currentTab === "settings") {
        await this.loadCurrentTabData();
      } else {
        await this.loadMonths();
        await Promise.all([this.loadDecks(), this.loadCurrentTabData()]);
      }
      this._hasBootstrapped = true;
      this.scheduleBackgroundRemoteRefresh({
        force: true,
        targetFormats: [this.getSelectedMatchFormat()],
      });
    } catch (error) {
      this.setData({
        errorMessage: this.getErrorMessage(error),
      });
    } finally {
      this.setData({
        pageLoading: false,
      });
    }
  },

  async refreshCurrentTabData() {
    try {
      await this.loadAdminStatus();
      if (this.data.currentTab === "settings") {
        await this.loadCurrentTabData();
      } else {
        if (!this._hasLoadedMonths) {
          await this.loadMonths();
        }
        await Promise.all([this.loadDecks(true), this.loadCurrentTabData()]);
      }
    } catch (error) {
      console.error("refreshCurrentTabData failed =>", error);
    }
  },

  async loadAdminStatus(options = {}) {
    const { force = false } = options;
    try {
      const result = await this.loadCachedResource({
        resource: "adminStatus",
        force,
        request: () => this.callApi("/admin/status"),
      });
      const isAdmin = Boolean(result && result.isAdmin);
      const settingSections = buildSettingSections(isAdmin);
      const currentSettingSection = settingSections.some(
        (item) => item.key === this.data.currentSettingSection
      )
        ? this.data.currentSettingSection
        : settingSections[0].key;

      this.setData({
        isAdmin,
        settingSections,
        currentSettingSection,
      });
    } catch (error) {
      this.setData({
        isAdmin: false,
        settingSections: buildSettingSections(false),
        currentSettingSection: "decks",
      });
    }
  },

  getNormalizedTargetFormats(targetFormats) {
    const source = Array.isArray(targetFormats) && targetFormats.length
      ? targetFormats
      : [this.getSelectedMatchFormat()];
    return Array.from(
      new Set(
        source
          .map((item) => String(item || "").trim().toLowerCase())
          .filter((item) => item === "md" || item === "ocg")
      )
    );
  },

  shouldSkipBackgroundRemoteRefresh() {
    return Boolean(
      this.data.pageLoading ||
      this.data.recordPopupVisible ||
      this.data.recordSaving ||
      this.data.deckNameDialogVisible ||
      this.data.deckBuilderVisible ||
      this.data.deckBuilderSaving ||
      this.data.deckBuilderActionVisible ||
      this.data.cardDetailVisible
    );
  },

  mergeBackgroundRefreshRequest(nextOptions = {}) {
    const previous = this._pendingBackgroundRefreshOptions || {};
    return {
      force: Boolean(previous.force || nextOptions.force),
      targetFormats: this.getNormalizedTargetFormats(
        (previous.targetFormats || []).concat(nextOptions.targetFormats || [])
      ),
    };
  },

  scheduleBackgroundRemoteRefresh(options = {}) {
    this._pendingBackgroundRefreshOptions = this.mergeBackgroundRefreshRequest(options);
    if (this._backgroundRefreshPromise) {
      return;
    }

    const pendingOptions = this._pendingBackgroundRefreshOptions;
    this._pendingBackgroundRefreshOptions = null;
    this.refreshRemoteCachesInBackground(pendingOptions).catch((error) => {
      console.error("refreshRemoteCachesInBackground failed =>", error);
    });
  },

  async onRecordsRefresherRefresh() {
    if (this.data.recordsRefreshing) {
      return;
    }

    this.setData({
      recordsRefreshing: true,
    });

    try {
      await this.refreshRemoteCachesInBackground({
        force: true,
        targetFormats: [this.getSelectedMatchFormat()],
      });
      wx.showToast({
        title: "已同步最新战绩",
        icon: "success",
      });
    } catch (error) {
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    } finally {
      this.setData({
        recordsRefreshing: false,
      });
    }
  },

  async onSettingsManualRefresh() {
    if (this.data.settingsRefreshing) {
      return;
    }

    this.setData({
      settingsRefreshing: true,
    });

    try {
      await this.refreshRemoteCachesInBackground({
        force: true,
        targetFormats: [this.getSelectedMatchFormat()],
      });
      wx.showToast({
        title: "已同步最新数据",
        icon: "success",
      });
    } catch (error) {
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    } finally {
      this.setData({
        settingsRefreshing: false,
      });
    }
  },

  getSelectedDeckFilter() {
    return this.data.selectedDeckId && this.data.selectedDeckId !== "all"
      ? [this.data.selectedDeckId]
      : [];
  },

  getSelectedMonthFilter() {
    return this.data.selectedMonthFilterValue || "all";
  },

  getSelectedMatchTypeFilter() {
    return this.data.selectedMatchTypeFilterValue || "all";
  },

  getSelectedMdAccountFilter() {
    if (this.getSelectedMatchFormat() !== "md") {
      return "all";
    }
    // 有“当前使用账号”时视图按该账号过滤；无账号时展示全部
    return this.data.currentMdAccountId || "all";
  },

  getSelectedStatsMonthRange() {
    return resolveStatsMonthRange(
      this.data.statsMonthRangeValues || [],
      this.data.statsMonthRangeStartValue,
      this.data.statsMonthRangeEndValue
    );
  },

  getCurrentDeckMonthFilter() {
    if (this.data.currentTab === "stats" && this.data.opponentDeckStatsEnabled) {
      const selectedRange = this.getSelectedStatsMonthRange();
      return {
        matchMonthStart: selectedRange.startValue,
        matchMonthEnd: selectedRange.endValue,
        mdAccountId: LITE_EDITION ? "all" : this.getSelectedMdAccountFilter(),
      };
    }

    return {
      matchMonth: this.getSelectedMonthFilter(),
      mdAccountId: LITE_EDITION ? "all" : this.getSelectedMdAccountFilter(),
    };
  },

  getCurrentStatsRecordFilter() {
    const filter = {
      deckId: this.getSelectedDeckFilter(),
      matchTypeId: this.getSelectedMatchTypeFilter(),
      matchTypeIds: this.data.selectedMatchTypeFilterIds || [],
      mdAccountId: LITE_EDITION ? "all" : this.getSelectedMdAccountFilter(),
    };

    if (this.data.statsTodayOnly) {
      return {
        ...filter,
        todayOnly: true,
      };
    }

    if (this.data.opponentDeckStatsEnabled) {
      const selectedRange = this.getSelectedStatsMonthRange();
      return {
        ...filter,
        matchMonthStart: selectedRange.startValue,
        matchMonthEnd: selectedRange.endValue,
      };
    }

    return {
      ...filter,
      matchMonth: this.getSelectedMonthFilter(),
    };
  },

  getSelectedOpponentDeckStatsList(
    statistics = this.data.statistics,
    mode = this.data.statsOpponentDeckMode || "all"
  ) {
    return (
      statistics &&
      statistics.opponentDeckStats &&
      statistics.opponentDeckStats[mode]
    ) || [];
  },

  getOpponentDeckCategoryMap(
    categories = this.data.opponentDeckCategories,
    matchFormat = this.getSelectedMatchFormat()
  ) {
    return buildOpponentDeckCategoryMap(
      (categories || []).filter((cat) => cat.matchFormat === matchFormat)
    );
  },

  getFailureReasonCategoryMap(
    categories = this.data.failureReasonCategories,
    matchFormat = this.getSelectedMatchFormat()
  ) {
    return buildFailureReasonCategoryMap(
      (categories || []).filter((cat) => !cat.matchFormat || cat.matchFormat === matchFormat)
    );
  },

  getSelectedMatchFormat() {
    return this.data.currentMatchFormat || "md";
  },

  getRecordDraftStorageKey(matchFormat = this.getSelectedMatchFormat()) {
    return `${RECORD_DRAFT_STORAGE_KEY_PREFIX}${matchFormat || "md"}`;
  },

  restoreCurrentMdAccount() {
    let storedValue = null;
    try {
      storedValue = wx.getStorageSync(MD_CURRENT_ACCOUNT_STORAGE_KEY);
    } catch (error) {
      console.error("restoreCurrentMdAccount failed =>", error);
    }
    if (!storedValue || typeof storedValue !== "object" || !storedValue.id) {
      return;
    }
    this.setData({
      currentMdAccountId: String(storedValue.id),
      currentMdAccountName: String(storedValue.name || ""),
    });
  },

  persistCurrentMdAccount() {
    try {
      wx.setStorageSync(MD_CURRENT_ACCOUNT_STORAGE_KEY, {
        id: this.data.currentMdAccountId || "",
        name: this.data.currentMdAccountName || "",
      });
    } catch (error) {
      console.error("persistCurrentMdAccount failed =>", error);
    }
  },

  loadRecordFieldVisibilitySettings() {
    if (LITE_EDITION) {
      const recordFieldVisibility = getLiteRecordFieldVisibility();
      this.setData({
        recordFieldVisibility,
        recordFieldSettingItems: buildRecordFieldSettingItems(recordFieldVisibility),
        recordHasHiddenOptionalFields: false,
        recordShowAllOptionalFields: false,
      });
      return;
    }
    let storedValue = null;
    try {
      storedValue = wx.getStorageSync(RECORD_FIELD_VISIBILITY_STORAGE_KEY);
    } catch (error) {
      console.error("loadRecordFieldVisibilitySettings failed =>", error);
    }
    const recordFieldVisibility = normalizeRecordFieldVisibilitySettings(storedValue);
    const recordHasHiddenOptionalFields = hasHiddenRecordOptionalFields(recordFieldVisibility);
    this.setData({
      recordFieldVisibility,
      recordFieldSettingItems: buildRecordFieldSettingItems(recordFieldVisibility),
      recordHasHiddenOptionalFields,
      recordShowAllOptionalFields: recordHasHiddenOptionalFields
        ? this.data.recordShowAllOptionalFields
        : false,
    });
  },

  persistRecordFieldVisibilitySettings(recordFieldVisibility = this.data.recordFieldVisibility) {
    try {
      wx.setStorageSync(
        RECORD_FIELD_VISIBILITY_STORAGE_KEY,
        normalizeRecordFieldVisibilitySettings(recordFieldVisibility)
      );
    } catch (error) {
      console.error("persistRecordFieldVisibilitySettings failed =>", error);
    }
  },

  updateRecordFieldVisibilitySettings(nextVisibility) {
    const recordFieldVisibility = normalizeRecordFieldVisibilitySettings(nextVisibility);
    const recordHasHiddenOptionalFields = hasHiddenRecordOptionalFields(recordFieldVisibility);
    const shouldKeepOptionalFieldsExpanded = this.data.recordPopupVisible &&
      hasHiddenRecordOptionalFieldValue(this.data, recordFieldVisibility);
    this.setData({
      recordFieldVisibility,
      recordFieldSettingItems: buildRecordFieldSettingItems(recordFieldVisibility),
      recordHasHiddenOptionalFields,
      recordShowAllOptionalFields:
        shouldKeepOptionalFieldsExpanded ||
        (this.data.recordShowAllOptionalFields && recordHasHiddenOptionalFields),
    });
    this.persistRecordFieldVisibilitySettings(recordFieldVisibility);
  },

  getCurrentRecordDraftPayload() {
    const selectedMatchType =
      (this.data.recordMatchTypeOptions || [])[this.data.recordMatchTypeIndex] || {
        id: "",
      };
    return {
      matchFormat: this.getSelectedMatchFormat(),
      recordDeckId: this.data.recordDeckId || "",
      recordCoinResult: Number(this.data.recordCoinResult || 0),
      recordMatchResult: Number(this.data.recordMatchResult || 1),
      recordOcgGames: (this.data.recordOcgGames || buildDefaultOcgGames()).map((item) => ({ value: item.value || "" })),
      recordRemark: String(this.data.recordRemark || ""),
      recordMatchTypeId: selectedMatchType.id || "",
    };
  },

  persistRecordDraft() {
    try {
      wx.setStorageSync(
        this.getRecordDraftStorageKey(),
        this.getCurrentRecordDraftPayload()
      );
    } catch (error) {
      console.error("persistRecordDraft failed =>", error);
    }
  },

  clearRecordDraft(matchFormat = this.getSelectedMatchFormat()) {
    try {
      wx.removeStorageSync(this.getRecordDraftStorageKey(matchFormat));
    } catch (error) {
      console.error("clearRecordDraft failed =>", error);
    }
  },

  loadRecordDraft(matchFormat = this.getSelectedMatchFormat()) {
    try {
      const draft = wx.getStorageSync(this.getRecordDraftStorageKey(matchFormat));
      return draft && typeof draft === "object" ? draft : null;
    } catch (error) {
      console.error("loadRecordDraft failed =>", error);
      return null;
    }
  },

  setRecordDraftFields(nextData) {
    this.setData(nextData, () => {
      if (this.data.recordPopupVisible && this.data.recordPopupMode === "create") {
        this.persistRecordDraft();
      }
    });
  },

  async openRecordOpponentDeckPicker() {
    if (this.data.recordOpponentDeckPickerLoading) {
      return;
    }

    this.dismissRecordOpponentDeckInput();
    this.setData({
      recordOpponentDeckPickerLoading: true,
    });

    try {
      const allRecords = await this.loadAllRecordsForMatchFormat(this.getSelectedMatchFormat());
      if (!this.data.recordPopupVisible) {
        return;
      }
      this.setData({
        recordOpponentDeckPickerVisible: true,
        recordOpponentDeckHistoryItems: buildRecordOpponentDeckHistoryItems(allRecords),
        recordOpponentDeckDeckItems: buildRecordOpponentDeckDeckItems(this.data.decks),
      });
    } catch (error) {
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    } finally {
      this.setData({
        recordOpponentDeckPickerLoading: false,
      });
    }
  },

  closeRecordOpponentDeckPicker() {
    this.dismissRecordOpponentDeckInput();
    this.setData({
      recordOpponentDeckPickerVisible: false,
    });
  },

  onSelectRecordOpponentDeckSuggestion(e) {
    const value = normalizeOpponentDeckInput(e.currentTarget.dataset.value).trim();
    this.setRecordDraftFields({
      recordOpponentDeck: value,
    });
    this.closeRecordOpponentDeckPicker();
  },

  onRecordOpponentDeckFocus() {
    this.setData({
      recordOpponentDeckInputFocused: true,
    });
  },

  onRecordOpponentDeckBlur() {
    if (!this.data.recordOpponentDeckInputFocused) {
      return;
    }
    this.setData({
      recordOpponentDeckInputFocused: false,
    });
  },

  dismissRecordOpponentDeckInput() {
    if (this.data.recordOpponentDeckInputFocused) {
      this.setData({
        recordOpponentDeckInputFocused: false,
      });
    }
    if (typeof wx.hideKeyboard === "function") {
      try {
        wx.hideKeyboard({});
      } catch (error) {
        console.error("hideKeyboard failed =>", error);
      }
    }
  },

  onPageTouchMove() {
    this.dismissRecordOpponentDeckInput();
    this.dismissRecordFailureReasonInput();
  },

  onToggleRecordFieldVisibility(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) {
      return;
    }
    this.updateRecordFieldVisibilitySettings({
      ...this.data.recordFieldVisibility,
      [key]: Boolean(e.detail.value),
    });
  },

  getCurrentSelectedRecordDayValue() {
    return (
      ((this.data.recordDayOptions || [])[this.data.recordDayIndex] || RECORD_DAY_OPTION_EMPTY)
        .itemValue || ""
    );
  },

  ensureRecordDayFilledWithCurrentDay() {
    if (this.getCurrentSelectedRecordDayValue()) {
      return;
    }
    const recordDayOptions = this.data.recordDayOptions || buildRecordDayOptions();
    const currentDayValue = getCurrentDayLabel();
    const recordDayIndex = getRecordDayIndexByValue(currentDayValue, recordDayOptions);
    this.setRecordDraftFields({
      recordDayIndex,
      currentRecordDayLabel:
        (recordDayOptions[recordDayIndex] || RECORD_DAY_OPTION_EMPTY).itemLabel,
    });
  },

  toggleRecordOptionalFieldsExpanded() {
    if (!this.data.recordHasHiddenOptionalFields) {
      return;
    }
    const nextExpanded = !this.data.recordShowAllOptionalFields;
    if (
      nextExpanded &&
      this.data.recordPopupMode === "create" &&
      !this.data.recordFieldVisibility.dayOfWeek
    ) {
      this.ensureRecordDayFilledWithCurrentDay();
    }
    this.setData({
      recordShowAllOptionalFields: nextExpanded,
    });
  },

  refreshRecordDeckListOverflow() {
    if (!this.data.recordPopupVisible) {
      return;
    }

    wx.nextTick(() => {
      const query = this.createSelectorQuery();
      query.selectAll(".record-deck-choice-pill").boundingClientRect();
      query.exec((result) => {
        const rects = Array.isArray(result && result[0]) ? result[0] : [];
        if (!rects.length) {
          this.setData({
            recordDeckListOverflow: false,
            recordDeckListCollapsed: false,
          });
          return;
        }

        const rowTops = [];
        rects.forEach((rect) => {
          if (!rect || typeof rect.top !== "number") {
            return;
          }
          if (!rowTops.some((top) => Math.abs(top - rect.top) < 2)) {
            rowTops.push(rect.top);
          }
        });

        const recordDeckListOverflow = rowTops.length > RECORD_DECK_COLLAPSED_ROW_LIMIT;
        this.setData({
          recordDeckListOverflow,
          recordDeckListCollapsed: recordDeckListOverflow
            ? this.data.recordDeckListCollapsed
            : false,
        });
      });
    });
  },

  toggleRecordDeckListCollapsed() {
    if (!this.data.recordDeckListOverflow) {
      return;
    }

    this.setData({
      recordDeckListCollapsed: !this.data.recordDeckListCollapsed,
    });
  },

  getSelectedDeckName(sidebarDecks, selectedDeckId) {
    const target = (sidebarDecks || []).find((item) => item.id === selectedDeckId);
    return target ? target.deckName : "全部卡组";
  },

  getErrorMessage(error) {
    return (
      (error && (error.errMsg || error.message || error.detail || error.msg)) ||
      "加载失败，请稍后重试"
    );
  },

  copyTextToClipboard(text) {
    const content = String(text || "");
    if (!content) {
      return;
    }
    uni.setClipboardData({
      data: content,
      success: () => {
        wx.showToast({
          title: "已复制到剪贴板",
          icon: "success",
        });
      },
      fail: () => {
        wx.showToast({
          title: "复制失败，请长按文字选择",
          icon: "none",
        });
      },
    });
  },

  copyBackupSummaryText() {
    this.copyTextToClipboard(this.data.backupSummaryText);
  },

  copyCsvExportText() {
    this.copyTextToClipboard(this.data.csvExportText);
  },

  getCacheMaxAge(resource) {
    if (LOCAL_PERSISTENT_CACHE_RESOURCES.has(resource)) {
      return 0;
    }
    return LOCAL_CACHE_MAX_AGE_MS[resource] || 0;
  },

  getLocalCache(resource, params = {}, maxAgeMs = this.getCacheMaxAge(resource)) {
    return readLocalCache(resource, params, maxAgeMs);
  },

  hasLocalCacheEntry(resource, params = {}) {
    return this.getLocalCache(resource, params, 0) !== null;
  },

  mutateLocalCache(resource, params = {}, updater) {
    const currentData = this.getLocalCache(resource, params, 0);
    const nextData = updater(currentData);
    if (nextData === undefined) {
      return currentData;
    }
    this.setLocalCache(resource, params, nextData);
    return nextData;
  },

  setLocalCache(resource, params = {}, data = null) {
    writeLocalCache(resource, params, data);
    return data;
  },

  clearLocalCaches(resources = []) {
    (resources || []).forEach((resource) => {
      removeLocalCacheByResource(resource);
    });
  },

  getCachedCardEntity(cardId) {
    if (!cardId) {
      return null;
    }
    return this.getLocalCache("cardEntity", {
      cardId: String(cardId),
    });
  },

  getCachedCardImageMeta(cardId) {
    if (!cardId) {
      return null;
    }
    return this.getLocalCache("cardImage", {
      cardId: String(cardId),
    }, 0);
  },

  cacheLocalCardImageMeta(cardId, localImagePath) {
    const normalizedCardId = String(cardId || "").trim();
    const normalizedPath = String(localImagePath || "").trim();
    if (!normalizedCardId || !normalizedPath) {
      return null;
    }
    const payload = {
      cardId: normalizedCardId,
      localImagePath: normalizedPath,
    };
    this.setLocalCache("cardImage", {
      cardId: normalizedCardId,
    }, payload);
    return payload;
  },

  hydrateCardEntity(card) {
    if (!card) {
      return null;
    }
    const cardId = String((card && (card.cardId || card.id)) || "").trim();
    if (!cardId) {
      return {
        ...card,
        imageSrc: getResolvedCardImageSrc(card),
      };
    }
    const cached = this.getCachedCardEntity(cardId) || {};
    const cachedImageMeta = this.getCachedCardImageMeta(cardId) || {};
    const merged = {
      ...cached,
      ...cachedImageMeta,
      ...card,
      cardId,
    };
    return {
      ...merged,
      imageSrc: getResolvedCardImageSrc(merged),
    };
  },

  cacheCardEntity(card) {
    const hydrated = this.hydrateCardEntity(card);
    if (!hydrated || !hydrated.cardId) {
      return hydrated;
    }
    this.setLocalCache(
      "cardEntity",
      {
        cardId: String(hydrated.cardId),
      },
      hydrated
    );
    return hydrated;
  },

  cacheCardEntities(cards = []) {
    return (cards || []).map((item) => this.cacheCardEntity(item));
  },

  getLocalCardImagePath(cardId) {
    const normalizedCardId = String(cardId || "").trim();
    if (!normalizedCardId) {
      return "";
    }
    return `${wx.env.USER_DATA_PATH}/${LOCAL_CARD_IMAGE_FILE_PREFIX}${normalizedCardId}.jpg`;
  },

  async localFileExists(filePath) {
    if (!filePath) {
      return false;
    }
    try {
      return await fileIoFileExists(filePath);
    } catch (error) {
      return false;
    }
  },

  async cacheCardImageFile(card) {
    const hydratedCard = this.hydrateCardEntity(card);
    const cardId = String((hydratedCard && hydratedCard.cardId) || "").trim();
    if (!cardId) {
      return hydratedCard;
    }

    const localImagePath = this.getLocalCardImagePath(cardId);
    if (await this.localFileExists(localImagePath)) {
      this.cacheLocalCardImageMeta(cardId, localImagePath);
      return this.cacheCardEntity({
        ...hydratedCard,
        localImagePath,
      });
    }

    this._cardImageFilePromises = this._cardImageFilePromises || {};
    if (this._cardImageFilePromises[cardId]) {
      return this._cardImageFilePromises[cardId];
    }

    const pendingPromise = (async () => {
      const fileSystemManager = wx.getFileSystemManager();
      const downloadAttempts = [
        async () => {
          const thumbUrl = String(hydratedCard.thumbUrl || "").trim();
          if (!thumbUrl) {
            throw new Error("thumb_url_empty");
          }
          const response = await wxDownloadFilePromise({
            url: thumbUrl,
            filePath: localImagePath,
          });
          if (Number(response && response.statusCode) !== 200) {
            throw new Error(`download_status_${response && response.statusCode}`);
          }
          return localImagePath;
        },
        async () => {
          const cloudFileId = String(
            hydratedCard.cachedImageFileId || hydratedCard.cloudFileId || ""
          ).trim();
          if (!cloudFileId) {
            throw new Error("cloud_file_empty");
          }
          const response = await wxCloudDownloadFilePromise({
            fileID: cloudFileId,
          });
          const tempFilePath = String((response && response.tempFilePath) || "").trim();
          if (!tempFilePath) {
            throw new Error("cloud_temp_file_empty");
          }
          await wxFsUnlinkPromise(fileSystemManager, localImagePath);
          await wxFsCopyFilePromise(fileSystemManager, tempFilePath, localImagePath);
          return localImagePath;
        },
        async () => {
          const imageResult = await this.callApi("/card/image/cache", {
            cardId,
          });
          const fallbackCard = this.cacheCardEntity({
            ...hydratedCard,
            cachedImageFileId:
              (imageResult && (imageResult.cloudFileId || imageResult.cachedImageFileId)) || "",
            thumbUrl:
              (imageResult && (imageResult.remoteUrl || imageResult.thumbUrl)) ||
              hydratedCard.thumbUrl ||
              "",
          });
          const cloudFileId = String(
            fallbackCard.cachedImageFileId || fallbackCard.cloudFileId || ""
          ).trim();
          if (!cloudFileId) {
            throw new Error("fallback_cloud_file_empty");
          }
          const response = await wxCloudDownloadFilePromise({
            fileID: cloudFileId,
          });
          const tempFilePath = String((response && response.tempFilePath) || "").trim();
          if (!tempFilePath) {
            throw new Error("fallback_temp_file_empty");
          }
          await wxFsUnlinkPromise(fileSystemManager, localImagePath);
          await wxFsCopyFilePromise(fileSystemManager, tempFilePath, localImagePath);
          return localImagePath;
        },
      ];

      let lastError = null;
      for (const attempt of downloadAttempts) {
        try {
          const resolvedPath = await attempt();
          this.cacheLocalCardImageMeta(cardId, resolvedPath);
          return this.cacheCardEntity({
            ...hydratedCard,
            localImagePath: resolvedPath,
          });
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error("cache_card_image_failed");
    })();

    this._cardImageFilePromises[cardId] = pendingPromise;
    try {
      return await pendingPromise;
    } finally {
      delete this._cardImageFilePromises[cardId];
    }
  },

  async refreshDeckBuilderSearchResultImages() {
    // 搜索结果直接使用同步的本地缩略图或远端缩略图。不要异步回写整个结果集，
    // 否则旧搜索任务可能覆盖用户刚刚输入的新结果。
  },

  async refreshDeckBuilderSectionImages() {
    // 卡组编辑状态只由增删卡、保存和明确刷新修改；缩略图加载不能回写该状态，
    // 避免旧的异步任务把新加的卡覆盖掉。
  },

  formatClientDateTime(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    const second = String(date.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  },

  patchLocalAllRecords(matchFormat, updater) {
    return this.mutateLocalCache("allRecords", { matchFormat }, (records) =>
      sortRecordListDesc(updater(Array.isArray(records) ? records.slice() : []))
    );
  },

  patchLocalDeckBase(matchFormat, updater) {
    return this.mutateLocalCache("decksBase", { matchFormat }, (decks) =>
      updater(Array.isArray(decks) ? decks.slice() : [])
    );
  },

  patchLocalMatchTypes(matchFormat, updater) {
    return this.mutateLocalCache("matchTypes", { matchFormat }, (items) =>
      updater(Array.isArray(items) ? items.slice() : [])
    );
  },

  patchLocalMonths(updater) {
    return this.mutateLocalCache("months", {}, (items) =>
      sortMonthItemsDesc(updater(Array.isArray(items) ? items.slice() : []))
    );
  },

  ensureLocalMonthExists(monthValue) {
    const normalizedMonth = String(monthValue || "").trim();
    if (!normalizedMonth) {
      return;
    }
    this.patchLocalMonths((items) => {
      if (hasMonthItem(items, normalizedMonth)) {
        return items;
      }
      return items.concat({
        id: `local:${normalizedMonth}`,
        dictCode: "match_month",
        itemValue: normalizedMonth,
        itemLabel: formatMonthOptionLabel(normalizedMonth),
        sortOrder: 0,
      });
    });
  },

  buildLocalRecordPayload({
    id,
    createTime,
    updateTime,
    hasEdited,
    editCount = 0,
  }) {
    const selectedMatchType =
      this.data.recordMatchTypeOptions[this.data.recordMatchTypeIndex] || {
        id: "",
        itemLabel: "",
      };
    const selectedDeck = (this.data.decks || []).find(
      (item) => String(item.id || "") === String(this.data.recordDeckId || "")
    );
    const ocgGameResults = (this.data.recordOcgGames || []).map((item) => item.value || "");
    const ocgStarterCounts = (this.data.recordOcgGames || []).map((item) =>
      Number.isInteger(item.starterCount) ? item.starterCount : null
    );
    const ocgHandTrapCounts = (this.data.recordOcgGames || []).map((item) =>
      Number.isInteger(item.handTrapCount) ? item.handTrapCount : null
    );
    const ocgBrickCounts = (this.data.recordOcgGames || []).map((item) =>
      Number.isInteger(item.brickCount) ? item.brickCount : null
    );
    const matchResult =
      this.getSelectedMatchFormat() === "ocg"
        ? deriveLocalOcgMatchResult(ocgGameResults)
        : Number(this.data.recordMatchResult);
    const selectedDayOption =
      (this.data.recordDayOptions || [])[this.data.recordDayIndex] || RECORD_DAY_OPTION_EMPTY;
    // MD 新建时归属“当前使用账号”，编辑时保留原记录归属
    const selectedMdAccount = (() => {
      if (this.getSelectedMatchFormat() !== "md") {
        return { id: "", itemLabel: "" };
      }
      if (this.data.recordPopupMode === "edit") {
        const editingRecord = (this.data.records || []).find(
          (item) => String(item.id || "") === String(this.data.recordEditingId || "")
        );
        return {
          id: (editingRecord && editingRecord.mdAccountId) || "",
          itemLabel: (editingRecord && editingRecord.mdAccount) || "",
        };
      }
      return {
        id: this.data.currentMdAccountId || "",
        itemLabel: this.data.currentMdAccountName || "",
      };
    })();

    return {
      id,
      matchFormat: this.getSelectedMatchFormat(),
      matchMonthId: (() => {
        const selectedMonthId =
          ((this.data.monthItems || [])[this.data.recordMonthIndex] || {}).id || "";
        return String(selectedMonthId).startsWith("local:") ? null : selectedMonthId || null;
      })(),
      matchMonth: this.data.recordMonth.trim(),
      dayOfWeek: selectedDayOption.itemValue || "",
      coinResult: Number(this.data.recordCoinResult),
      matchResult,
      ocgGameResults,
      deckId: this.data.recordDeckId || null,
      deckName: selectedDeck ? selectedDeck.deckName : "已删除卡组",
      matchTypeId: selectedMatchType.id || null,
      matchType: selectedMatchType.itemLabel || "",
      remark: this.data.recordRemark.trim(),
      createTime,
      updateTime,
      hasEdited: Boolean(hasEdited),
      editCount: Number(editCount || 0),
    };
  },

  buildRecordExportFileName(matchFormat) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hour = String(now.getHours()).padStart(2, "0");
    const minute = String(now.getMinutes()).padStart(2, "0");
    const second = String(now.getSeconds()).padStart(2, "0");
    return `ygo-records-${matchFormat}-${year}${month}${day}-${hour}${minute}${second}.csv`;
  },

  buildRecordExportRows(records = [], matchFormat = this.getSelectedMatchFormat()) {
    const formatLabel =
      MATCH_FORMAT_LABEL_MAP[String(matchFormat || "").trim().toLowerCase()] ||
      String(matchFormat || "").toUpperCase();
    const formatMetricExportValue = (item, fieldKey, ocgFieldKey) => {
      if (item && item.matchFormat === "ocg") {
        const ocgValues = Array.isArray(item[ocgFieldKey]) ? item[ocgFieldKey] : [];
        if (ocgValues.length) {
          return ocgValues.map((value) => formatRecordMetricCountValue(value)).join("/");
        }
      }
      return Number.isInteger(item && item[fieldKey]) ? item[fieldKey] : "";
    };
    return [
      [
        "赛制",
        "对局月份",
        "日期",
        "对战类型",
        "卡组",
        "MD账号",
        "对手卡组",
        "骰子结果",
        "胜负结果",
        "三局结果",
        "动点数",
        "手坑数",
        "废件数",
        "失败原因",
        "备注",
        "创建时间",
        "修改时间",
        "是否修改过",
        "记录标识",
      ],
    ].concat(
      (records || []).map((item) => [
        formatLabel,
        item.matchMonth || "",
        formatDayOfWeekLabel(item.dayOfWeek),
        item.matchType || "",
        item.deckName || "",
        item.mdAccount || "",
        item.opponentDeck || "",
        Number(item.coinResult) === 1 ? "赢骰" : Number(item.coinResult) === 0 ? "输骰" : "",
        MATCH_RESULT_LABEL_MAP[Number(item.matchResult)] || "",
        formatOcgGameSummary(item.ocgGameResults, item.ocgStarterCounts, item.starterCount),
        formatMetricExportValue(item, "starterCount", "ocgStarterCounts"),
        formatMetricExportValue(item, "handTrapCount", "ocgHandTrapCounts"),
        formatMetricExportValue(item, "brickCount", "ocgBrickCounts"),
        Array.isArray(item.failureReasons) ? item.failureReasons.join("、") : "",
        item.remark || "",
        item.createTime || "",
        item.updateTime || "",
        item.hasEdited ? "是" : "否",
        item.importKey || `csv:${item.id || ""}`,
      ])
    );
  },

  buildRecordExportCsv(records = [], matchFormat = this.getSelectedMatchFormat()) {
    const rows = this.buildRecordExportRows(records, matchFormat);
    return `\uFEFF${rows
      .map((row) => row.map((cell) => formatCsvCell(cell)).join(","))
      .join("\n")}`;
  },

  getCachedAllRecordsForMatchFormat(matchFormat) {
    const cached = this.getLocalCache(
      "allRecords",
      {
        matchFormat,
      },
      0
    );
    return Array.isArray(cached) ? cached : null;
  },

  async refreshViewFromLocalCaches({ keepSelection = true, reloadMonths = false } = {}) {
    if (reloadMonths) {
      await this.loadMonths();
    }
    if (this.data.currentTab === "settings") {
      await this.loadCurrentTabData();
      return;
    }
    await Promise.all([
      this.loadDecks(keepSelection),
      this.loadCurrentTabData(),
    ]);
  },

  invalidateRecordRelatedCaches() {
    this.clearLocalCaches(["records", "statistics", "decks", "allRecords", "months", "adminOverviewStats"]);
  },

  invalidateDeckRelatedCaches() {
    this.clearLocalCaches(["decks", "decksBase", "records", "statistics", "allRecords", "deckCards", "adminOverviewStats"]);
  },

  invalidateMatchTypeCaches() {
    this.clearLocalCaches(["matchTypes", "records", "statistics"]);
  },

  clearDerivedViewCaches() {
    this.clearLocalCaches(["decks", "records", "statistics", "adminOverviewStats"]);
  },

  async forceRefreshMonthsCache() {
    const currentMonth = getCurrentMonth();
    let monthItems = await this.loadCachedResource({
      resource: "months",
      force: true,
      request: () =>
        this.callApi("/dict/list", {
          dictCode: "match_month",
        }),
    });

    if (!hasMonthItem(monthItems, currentMonth)) {
      monthItems = (monthItems || []).concat({
        id: `local:${currentMonth}`,
        dictCode: "match_month",
        itemValue: currentMonth,
        itemLabel: formatMonthOptionLabel(currentMonth),
        sortOrder: 0,
      });
    }

    monthItems = sortMonthItemsDesc(monthItems);
    this.setLocalCache("months", {}, monthItems);
    return monthItems;
  },

  async forceRefreshMatchTypesCache(matchFormat) {
    return this.loadCachedResource({
      resource: "matchTypes",
      params: {
        matchFormat,
      },
      force: true,
      request: () =>
        this.callApi("/dict/list", {
          dictCode: "match_type",
          matchFormat,
        }),
    });
  },

  async forceRefreshDeckBaseCache(matchFormat) {
    return this.loadCachedResource({
      resource: "decksBase",
      params: {
        matchFormat,
      },
      force: true,
      request: () =>
        this.callApi("/deck/list", {
          matchFormat,
          matchMonth: "all",
        }),
    });
  },

  async refreshRemoteCachesInBackground(options = {}) {
    const { force = false } = options;
    const targetFormats = this.getNormalizedTargetFormats(options.targetFormats);
    if (!targetFormats.length) {
      return;
    }
    if (this.shouldSkipBackgroundRemoteRefresh()) {
      this._pendingBackgroundRefreshOptions = this.mergeBackgroundRefreshRequest(options);
      return;
    }

    const now = Date.now();
    if (
      !force &&
      this._lastRemoteSyncAt &&
      now - this._lastRemoteSyncAt < REMOTE_SYNC_INTERVAL_MS
    ) {
      return;
    }
    if (this._backgroundRefreshPromise) {
      this._pendingBackgroundRefreshOptions = this.mergeBackgroundRefreshRequest(options);
      return this._backgroundRefreshPromise;
    }

    this._backgroundRefreshPromise = (async () => {
      await this.forceRefreshMonthsCache();
      await Promise.all(
        targetFormats.map(async (matchFormat) => {
          await Promise.all([
            this.forceRefreshMatchTypesCache(matchFormat),
            this.forceRefreshDeckBaseCache(matchFormat),
            this.loadAllRecordsForMatchFormat(matchFormat, {
              force: true,
            }),
          ]);
        })
      );
      this.clearDerivedViewCaches();
      this._lastRemoteSyncAt = Date.now();

      const currentFormat = this.getSelectedMatchFormat();
      if (!targetFormats.includes(currentFormat)) {
        return;
      }

      await this.loadMonths();
      if (this.data.currentTab === "settings") {
        if (this.data.currentSettingSection === "matchTypes") {
          await this.loadMatchTypes();
        } else if (this.data.currentSettingSection === "months") {
          await this.loadMonths();
        } else if (this.data.currentSettingSection === "decks") {
          await this.loadDecks(true, {
            force: true,
          });
        } else if (this.data.currentSettingSection === "opponentDeckCategories") {
          await this.loadStatistics();
        }
        return;
      }

      await this.loadDecks(true, {
        force: true,
      });
      if (this.data.currentTab === "records") {
        await this.loadRecords({
          force: true,
        });
      } else if (this.data.currentTab === "stats") {
        await this.loadStatistics({
          force: true,
        });
      }
    })();

    try {
      await this._backgroundRefreshPromise;
    } finally {
      this._backgroundRefreshPromise = null;
      if (this._pendingBackgroundRefreshOptions) {
        const nextOptions = this._pendingBackgroundRefreshOptions;
        this._pendingBackgroundRefreshOptions = null;
        this.refreshRemoteCachesInBackground(nextOptions).catch((error) => {
          console.error("refreshRemoteCachesInBackground retry failed =>", error);
        });
      }
    }
  },

  async loadCachedResource({
    resource,
    params = {},
    force = false,
    maxAgeMs = this.getCacheMaxAge(resource),
    request,
  }) {
    const requestKey = buildLocalCacheKey(resource, params);
    this._resourceLoadPromises = this._resourceLoadPromises || {};
    if (force) {
      logCacheDebug("bypass", {
        resource,
        params,
        reason: "force_refresh",
      });
    }
    if (!force) {
      const cached = this.getLocalCache(resource, params, maxAgeMs);
      if (cached !== null) {
        return cached;
      }
    }

    logCacheDebug("fetch", {
      resource,
      params,
    });
    if (this._resourceLoadPromises[requestKey]) {
      logCacheDebug("join_inflight", {
        resource,
        params,
      });
      return this._resourceLoadPromises[requestKey];
    }

    const pendingPromise = (async () => {
      const data = await request();
      this.setLocalCache(resource, params, data);
      return data;
    })();
    this._resourceLoadPromises[requestKey] = pendingPromise;

    try {
      return await pendingPromise;
    } finally {
      delete this._resourceLoadPromises[requestKey];
    }
  },

  async callApi(path, body = {}) {
    logCacheDebug("api_call", {
      path,
      body,
    });
    const response = { result: await callLocalApi({ path, body }) };

    const result = response.result || {};
    if (result.code !== 0) {
      throw new Error(result.detail || result.msg || "接口调用失败");
    }

    logCacheDebug("api_success", {
      path,
    });
    return result.body;
  },

  async loadAllRecordsForMatchFormat(matchFormat, options = {}) {
    return this.loadCachedResource({
      resource: "allRecords",
      params: {
        matchFormat,
      },
      force: Boolean(options.force),
      request: async () => {
        const pageSize = 100;
        let pageNum = 1;
        let total = 0;
        let allRecords = [];

        do {
          const response = await this.callApi("/match/record/page", {
            matchFormat,
            matchMonth: "all",
            pageNum,
            pageSize,
          });
          const data = Array.isArray(response && response.data) ? response.data : [];
          total = Number(response && response.total) || 0;
          allRecords = allRecords.concat(data);
          pageNum += 1;
        } while (allRecords.length < total);

        return allRecords;
      },
    });
  },

  filterRecordsForView(records, options = {}) {
    const selectedMonth = options.matchMonth || "all";
    const matchMonthStart = options.matchMonthStart || "";
    const matchMonthEnd = options.matchMonthEnd || "";
    const selectedDeckIds = options.deckId || [];
    const selectedMatchTypeId = options.matchTypeId || "all";
    const selectedMatchTypeIds = Array.isArray(options.matchTypeIds) ? options.matchTypeIds.map((id) => String(id)) : [];
    const selectedMdAccountId = options.mdAccountId || "all";
    const todayOnly = options.todayOnly || false;
    const todayStart = todayOnly ? new Date(new Date().setHours(0, 0, 0, 0)) : null;
    return (records || []).filter((item) => {
      const recordMonth = String(item.matchMonth || "");
      if (
        selectedMonth &&
        selectedMonth !== "all" &&
        recordMonth !== String(selectedMonth)
      ) {
        return false;
      }
      if (matchMonthStart || matchMonthEnd) {
        const recordMonthKey = getMonthSortKey(recordMonth);
        if (matchMonthStart && recordMonthKey < getMonthSortKey(matchMonthStart)) {
          return false;
        }
        if (matchMonthEnd && recordMonthKey > getMonthSortKey(matchMonthEnd)) {
          return false;
        }
      }
      if (
        selectedDeckIds.length &&
        !selectedDeckIds.some((deckId) => String(deckId) === String(item.deckId || ""))
      ) {
        return false;
      }
      if (selectedMatchTypeIds.length) {
        if (!selectedMatchTypeIds.includes(String(item.matchTypeId || ""))) return false;
      } else if (
        selectedMatchTypeId &&
        selectedMatchTypeId !== "all" &&
        String(item.matchTypeId || "") !== String(selectedMatchTypeId)
      ) return false;
      if (
        selectedMdAccountId &&
        selectedMdAccountId !== "all" &&
        String(item.mdAccountId || "") !== String(selectedMdAccountId)
      ) {
        return false;
      }
      if (todayOnly) {
        const raw = (item && (item.createdAt || item.createTime));
        if (!raw) return false;
        const d = raw instanceof Date ? raw : new Date(raw);
        if (isNaN(d.getTime())) return false;
        if (d < todayStart) return false;
      }
      return true;
    });
  },

  buildDecksFromBaseRecords(baseDecks, records) {
    const countMap = new Map();
    (records || []).forEach((item) => {
      const deckId = String(item.deckId || "").trim();
      if (!deckId) {
        return;
      }
      countMap.set(deckId, (countMap.get(deckId) || 0) + 1);
    });

    return sortDeckListByCount(
      (baseDecks || []).map((deck) => ({
        ...deck,
        totalGames: countMap.get(String(deck.id || "")) || 0,
      }))
    );
  },

  buildStatisticsFromRecords(records, options = {}) {
    const overall = buildLocalStats(records);
    const selectedDeckIds = options.deckId || [];
    const deckNameMap = new Map(
      (this.data.decks || []).map((item) => [String(item.id || ""), item.deckName || ""])
    );
    const grouped = new Map();

    selectedDeckIds.forEach((deckId) => {
      const normalizedDeckId = String(deckId || "").trim();
      if (!normalizedDeckId || grouped.has(normalizedDeckId)) {
        return;
      }
      grouped.set(normalizedDeckId, {
        deckId: normalizedDeckId,
        deckName: deckNameMap.get(normalizedDeckId) || "已删除卡组",
        records: [],
      });
    });

    (records || []).forEach((item) => {
      const deckKey = String(item.deckId || "__deleted__");
      if (!grouped.has(deckKey)) {
        grouped.set(deckKey, {
          deckId: item.deckId || null,
          deckName: item.deckId
            ? (deckNameMap.get(String(item.deckId || "")) || item.deckName || "已删除卡组")
            : "已删除卡组",
          records: [],
        });
      }
      grouped.get(deckKey).records.push(item);
    });

    overall.deckCount = new Set(
      (records || []).map((item) => String(item.deckId || "")).filter(Boolean)
    ).size;

    const byDeck = Array.from(grouped.values())
      .map((item) => ({
        deckId: item.deckId,
        deckName: item.deckName,
        ...buildLocalStats(item.records),
      }))
      .sort((left, right) => {
        if (Number(right.totalGames || 0) !== Number(left.totalGames || 0)) {
          return Number(right.totalGames || 0) - Number(left.totalGames || 0);
        }
        return String(left.deckName || "").localeCompare(String(right.deckName || ""), "zh-CN");
      });

    return {
      overall,
      byDeck,
      failureReasonStats: buildFailureReasonStats(records, this.getFailureReasonCategoryMap()),
      opponentDeckStats: {
        all: buildOpponentDeckStats(records, "all"),
        win: buildOpponentDeckStats(records, "win"),
        loss: buildOpponentDeckStats(records, "loss"),
      },
    };
  },

  isLegacyStatisticsPayload(statistics) {
    const overall = statistics && statistics.overall;
    if (!overall || typeof overall !== "object") {
      return true;
    }
    return !(
      Object.prototype.hasOwnProperty.call(overall, "starterTotalCount") &&
      Object.prototype.hasOwnProperty.call(overall, "handTrapRecordedCount") &&
      Object.prototype.hasOwnProperty.call(overall, "handTrapTotalCount") &&
      Object.prototype.hasOwnProperty.call(overall, "brickRecordedCount") &&
      Object.prototype.hasOwnProperty.call(overall, "brickTotalCount")
    );
  },

  async loadDecks(keepSelection = false, options = {}) {
    const matchFormat = this.getSelectedMatchFormat();
    const deckMonthFilter = this.getCurrentDeckMonthFilter();
    const baseDecks = await this.loadCachedResource({
      resource: "decksBase",
      params: {
        matchFormat,
      },
      force: Boolean(options.force),
      request: () =>
        this.callApi("/deck/list", {
          matchFormat,
          matchMonth: "all",
        }),
    });
    const allRecords = await this.loadAllRecordsForMatchFormat(matchFormat, options);
    const decks = await this.loadCachedResource({
      resource: "decks",
      params: {
        matchFormat,
        ...deckMonthFilter,
      },
      force: Boolean(options.force),
      request: async () => {
        return this.buildDecksFromBaseRecords(
          baseDecks,
          this.filterRecordsForView(allRecords, deckMonthFilter)
        );
      },
    });

    const sidebarRecords = this.filterRecordsForView(allRecords, deckMonthFilter);
    const sidebarDecks = buildSidebarDecks(decks, sidebarRecords);
    let selectedDeckId = keepSelection ? this.data.selectedDeckId : "all";

    if (!sidebarDecks.some((item) => item.id === selectedDeckId)) {
      selectedDeckId = "all";
    }

    this.setData({
      decks,
      sidebarDecks,
      selectedDeckId,
      selectedDeckName: this.getSelectedDeckName(sidebarDecks, selectedDeckId),
      currentStreakLabel: getCurrentStreakLabel(sidebarRecords),
      recordOpponentDeckDeckItems: buildRecordOpponentDeckDeckItems(decks),
    }, () => {
      if (this.data.recordPopupVisible) {
        this.refreshRecordDeckListOverflow();
      }
    });
  },

  async loadCurrentTabData() {
    this.setData({
      contentLoading: true,
      errorMessage: "",
    });

    try {
      if (this.data.currentTab === "records") {
        await this.loadRecords();
      } else if (this.data.currentTab === "stats") {
        await this.loadStatistics();
      } else {
        await this.loadSettingsData();
      }
    } catch (error) {
      this.setData({
        errorMessage: this.getErrorMessage(error),
      });
    } finally {
      this.setData({
        contentLoading: false,
      });
    }
  },

  async loadRecords(options = {}) {
    const matchFormat = this.getSelectedMatchFormat();
    await this.loadMatchTypes(options);
    if (!LITE_EDITION && matchFormat === "md") {
      await this.loadMdAccounts(options);
    }
    const matchMonth = this.getSelectedMonthFilter();
    const selectedDeckFilter = this.getSelectedDeckFilter();
    const matchTypeId = this.getSelectedMatchTypeFilter();
    const matchTypeIds = this.data.selectedMatchTypeFilterIds || [];
    const mdAccountId = this.getSelectedMdAccountFilter();
    const recordList = await this.loadCachedResource({
      resource: "records",
      params: {
        matchFormat,
        matchMonth,
        deckId: selectedDeckFilter,
        matchTypeId,
        matchTypeIds,
        mdAccountId,
      },
      force: Boolean(options.force),
      request: async () => {
        const allRecords = await this.loadAllRecordsForMatchFormat(matchFormat, options);
        return this.filterRecordsForView(allRecords, {
          matchMonth,
          deckId: selectedDeckFilter,
          matchTypeId,
          matchTypeIds,
          mdAccountId,
        });
      },
    });
    this._recordsFullList = Array.isArray(recordList) ? recordList : [];
    this.renderVisibleRecords(RECORD_LIST_PAGE_SIZE);
  },

  renderVisibleRecords(displayCount) {
    const fullList = this._recordsFullList || [];
    const count = Math.max(Number(displayCount) || RECORD_LIST_PAGE_SIZE, RECORD_LIST_PAGE_SIZE);
    const records = fullList.slice(0, count).map((item) => ({
      ...item,
      ...getRecordResultMeta(item.matchResult),
      metaText: formatRecordMeta(item),
      timeLabel: item.hasEdited ? item.updateTime : item.createTime,
      coinLabel: Number(item.coinResult) === 1 ? "赢骰" : "输骰",
      coinClass: Number(item.coinResult) === 1 ? "record-chip--win" : "record-chip--loss",
      metricChips: buildRecordMetricChips(item),
      failureReasons: Array.isArray(item.failureReasons) ? item.failureReasons.slice() : [],
      failureReasonsExpanded: false,
      ocgGameSummary: formatOcgGameSummary(item.ocgGameResults, item.ocgStarterCounts, item.starterCount),
    }));

    this.setData({
      records,
      recordsDisplayCount: count,
      recordsHasMore: fullList.length > records.length,
      currentStreakLabel: getCurrentStreakLabel(fullList),
    });
  },

  onLoadMoreRecords() {
    if (!this.data.recordsHasMore) {
      return;
    }
    this.renderVisibleRecords(
      (Number(this.data.recordsDisplayCount) || RECORD_LIST_PAGE_SIZE) + RECORD_LIST_PAGE_SIZE
    );
  },

  async loadStatistics(options = {}) {
    const matchFormat = this.getSelectedMatchFormat();
    // 同一轮统计刷新共享一次全量战绩读取，避免 force=true 时重复分页请求。
    let allRecordsPromise = null;
    const loadAllRecordsOnce = () => {
      if (!allRecordsPromise) {
        allRecordsPromise = this.loadAllRecordsForMatchFormat(matchFormat, options);
      }
      return allRecordsPromise;
    };
    const allRecordsForStats = await loadAllRecordsOnce();
    await this.loadMatchTypes(options, allRecordsForStats);
    if (!LITE_EDITION && matchFormat === "md") {
      await this.loadMdAccounts(options);
    }
    const statsFilter = this.getCurrentStatsRecordFilter();
    let statistics = await this.loadCachedResource({
      resource: "statistics",
      params: {
        matchFormat,
        ...statsFilter,
      },
      force: Boolean(options.force),
      request: async () => {
        const allRecords = await loadAllRecordsOnce();
        return this.buildStatisticsFromRecords(
          this.filterRecordsForView(allRecords, statsFilter),
          statsFilter
        );
      },
    });
    if (this.isLegacyStatisticsPayload(statistics)) {
      statistics = await this.loadCachedResource({
        resource: "statistics",
        params: {
          matchFormat,
          ...statsFilter,
        },
        force: true,
        request: async () => {
          const allRecords = await loadAllRecordsOnce();
          return this.buildStatisticsFromRecords(
            this.filterRecordsForView(allRecords, statsFilter),
            statsFilter
          );
        },
      });
    }
    const failureStatsRecords = this.filterRecordsForView(
      await loadAllRecordsOnce(),
      statsFilter
    );
    const scopedFailureReasonStats = buildFailureReasonStats(
      failureStatsRecords,
      this.getFailureReasonCategoryMap()
    );
    const decoratedStatistics = {
      overall: decorateOverallStats(statistics.overall),
      byDeck: decorateDeckStats(statistics.byDeck),
      opponentDeckStats: {
        all: decorateOpponentDeckStats(
          statistics.opponentDeckStats && statistics.opponentDeckStats.all
        ),
        win: decorateOpponentDeckStats(
          statistics.opponentDeckStats && statistics.opponentDeckStats.win
        ),
        loss: decorateOpponentDeckStats(
          statistics.opponentDeckStats && statistics.opponentDeckStats.loss
        ),
      },
      failureReasonStats: scopedFailureReasonStats,
    };

    const statsOpponentDeckList = applyOpponentDeckCategoryMapping(
      this.getSelectedOpponentDeckStatsList(decoratedStatistics),
      this.getOpponentDeckCategoryMap()
    );

    const statsUpdates = {
      statistics: decoratedStatistics,
      statsOpponentDeckList,
      failureReasonStats: decoratedStatistics.failureReasonStats,
    };

    // 饼图开启时同步更新饼图数据
    if (this.data.pieChartEnabled) {
      statsUpdates.pieChartLegend = this.computePieChartSegments(statsOpponentDeckList);
      statsUpdates.pieChartGradient = this.buildPieChartGradient(statsUpdates.pieChartLegend);
    }
    statsUpdates.pieChartTotalGames = (statsOpponentDeckList.length && statsOpponentDeckList[0].totalRecordedGames) || 0;

    this.setData(statsUpdates);
  },

  async loadMatchTypes(options = {}, preloadedRecords = null) {
    const matchFormat = this.getSelectedMatchFormat();
    const matchTypes = await this.loadCachedResource({
      resource: "matchTypes",
      params: {
        matchFormat,
      },
      force: Boolean(options.force),
      request: () =>
        this.callApi("/dict/list", {
          dictCode: "match_type",
          matchFormat,
        }),
    });
    let allRecords = Array.isArray(preloadedRecords) ? preloadedRecords : [];
    if (!Array.isArray(preloadedRecords)) {
      try {
        allRecords = await this.loadAllRecordsForMatchFormat(matchFormat, options);
      } catch (error) {
        allRecords = [];
      }
    }
    const sortedMatchTypes = sortAndMergeMatchTypes(matchTypes, allRecords, matchFormat);
    const defaultMatchTypeLabel = getDefaultMatchTypeLabel(this.getSelectedMatchFormat());
    const recordMatchTypeOptions = buildRecordMatchTypeOptions(
      sortedMatchTypes,
      this.getSelectedMatchFormat()
    );
    const recordMatchTypeIndex = getPreferredMatchTypeIndex(
      recordMatchTypeOptions,
      this.getSelectedMatchFormat()
    );
    const matchTypeFilterOptions = buildMatchTypeFilterOptions(sortedMatchTypes);
    const matchTypeFilterIndex = getMatchTypeFilterIndex(
      matchTypeFilterOptions,
      this.data.selectedMatchTypeFilterValue
    );
    const selectedMatchTypeFilter =
      matchTypeFilterOptions[matchTypeFilterIndex] || matchTypeFilterOptions[0];

    this.setData({
      matchTypes: sortedMatchTypes,
      recordMatchTypeOptions,
      recordMatchTypePickerOptions: recordMatchTypeOptions,
      recordMatchTypeIndex,
      matchTypeFilterOptions,
      matchTypeFilterIndex,
      currentMatchTypeFilterLabel: selectedMatchTypeFilter.itemLabel,
      selectedMatchTypeFilterValue: selectedMatchTypeFilter.id,
      selectedMatchTypeFilterIds: selectedMatchTypeFilter.matchTypeIds || [],
      currentRecordMatchTypeLabel:
        (recordMatchTypeOptions[recordMatchTypeIndex] || {
          itemLabel: defaultMatchTypeLabel,
        }).itemLabel,
    });
  },

  async loadMdAccounts(options = {}) {
    const mdAccounts = await this.loadCachedResource({
      resource: "mdAccounts",
      force: Boolean(options.force),
      request: () =>
        this.callApi("/dict/list", {
          dictCode: "md_account",
        }),
    });
    const accounts = mdAccounts || [];
    // 当前使用账号失效时回落到第一个账号；无账号则回到无账号状态
    const matchedAccount = accounts.find(
      (item) => String(item.id || "") === String(this.data.currentMdAccountId || "")
    );
    const nextAccount = matchedAccount || accounts[0] || null;
    const nextId = nextAccount ? String(nextAccount.id) : "";
    const nextName = nextAccount ? String(nextAccount.itemLabel || "") : "";
    const changed =
      nextId !== String(this.data.currentMdAccountId || "") ||
      nextName !== String(this.data.currentMdAccountName || "");

    this.setData({
      mdAccounts: accounts,
      currentMdAccountId: nextId,
      currentMdAccountName: nextName,
    });
    if (changed) {
      this.persistCurrentMdAccount();
    }
    return accounts;
  },

  async loadMonths(options = {}) {
    const currentMonth = getCurrentMonth();
    let monthItems = await this.loadCachedResource({
      resource: "months",
      force: Boolean(options.force),
      request: () =>
        this.callApi("/dict/list", {
          dictCode: "match_month",
        }),
    });

    if (!hasMonthItem(monthItems, currentMonth)) {
      monthItems = (monthItems || []).concat({
        id: `local:${currentMonth}`,
        dictCode: "match_month",
        itemValue: currentMonth,
        itemLabel: formatMonthOptionLabel(currentMonth),
        sortOrder: 0,
      });
    }

    monthItems = sortMonthItemsDesc(monthItems);
    this.setLocalCache("months", {}, monthItems);

    const recordMonthIndex = getPreferredMonthIndex(monthItems || []);
    const currentRecordMonthLabel =
      ((monthItems || [])[recordMonthIndex] || { itemLabel: currentMonth }).itemLabel;
    const recordMonth =
      ((monthItems || [])[recordMonthIndex] || { itemValue: currentMonth }).itemValue;
    const monthFilterOptions = buildMonthFilterOptions(monthItems || []);
    const monthFilterIndex = getMonthFilterIndex(
      monthFilterOptions,
      this.data.selectedMonthFilterValue
    );
    const selectedMonthFilter =
      monthFilterOptions[monthFilterIndex] || monthFilterOptions[0];
    const statsMonthRangeValues = buildStatsMonthRangeValues(monthItems || []);
    const statsMonthRangeLabels = statsMonthRangeValues.map((item) => formatMonthOptionLabel(item));
    const selectedStatsMonthRange = resolveStatsMonthRange(
      statsMonthRangeValues,
      this.data.statsMonthRangeStartValue,
      this.data.statsMonthRangeEndValue
    );
    const adminOverviewMonthState = resolveAdminOverviewMonthState(
      monthItems || [],
      this.data.adminOverviewMonthValue
    );

    this.setData({
      monthItems: monthItems || [],
      monthFilterOptions,
      monthFilterIndex,
      currentMonthFilterLabel: selectedMonthFilter.itemLabel,
      selectedMonthFilterValue: selectedMonthFilter.itemValue,
      statsMonthRangeValues,
      statsMonthRangeColumns: [statsMonthRangeLabels, statsMonthRangeLabels],
      statsMonthRangeIndices: [
        selectedStatsMonthRange.startIndex,
        selectedStatsMonthRange.endIndex,
      ],
      statsMonthRangeStartValue: selectedStatsMonthRange.startValue,
      statsMonthRangeEndValue: selectedStatsMonthRange.endValue,
      statsMonthRangeLabel: formatStatsMonthRangeLabel(
        selectedStatsMonthRange.startValue,
        selectedStatsMonthRange.endValue
      ),
      recordMonthIndex,
      currentRecordMonthLabel,
      recordMonth,
      adminOverviewMonthIndex: adminOverviewMonthState.index,
      adminOverviewMonthValue: adminOverviewMonthState.value,
      adminOverviewMonthLabel: adminOverviewMonthState.label,
    });

    this._hasLoadedMonths = true;
  },

  async loadSettingsData() {
    this.setData({
      settingsLoading: true,
    });

    try {
      await this.ensureCurrentSettingSectionData();
    } finally {
      this.setData({
        settingsLoading: false,
      });
    }
  },

  async ensureCurrentSettingSectionData() {
    const section = this.data.currentSettingSection;
    const availableSections = (this.data.settingSections || []).map((item) => item.key);
    if (!availableSections.includes(section)) {
      this.setData({ currentSettingSection: "decks" });
      return this.loadDecks(true);
    }
    if (section === "decks") {
      await this.loadDecks(true);
      return;
    }
    if (section === "matchTypes") {
      await this.loadMatchTypes();
      return;
    }
    if (section === "mdAccounts") {
      await this.loadMdAccounts();
      return;
    }
    if (section === "months") {
      await this.loadMonths();
      return;
    }
    if (section === "recordFields") {
      this.loadRecordFieldVisibilitySettings();
      return;
    }
    if (section === "opponentDeckCategories") {
      await this.loadStatistics();
      return;
    }
  },

  async loadAppConfig(options = {}) {
    const appConfig = await this.loadCachedResource({
      resource: "appConfig",
      force: Boolean(options.force),
      request: () => this.callApi("/app/config/get"),
    });
    this.setData({
      appConfig: normalizeAppConfig(appConfig),
    });
  },

  previewAppConfigImage(rawUrl) {
    const url = String(rawUrl || "").trim();
    if (!url) {
      return;
    }
    wx.previewImage({
      urls: [url],
    });
  },

  onPreviewMpQrcode() {
    this.previewAppConfigImage(this.data.appConfig.mpQrcodeUrl);
  },

  onPreviewDonationImage() {
    this.previewAppConfigImage(this.data.appConfig.donationImageUrl);
  },

  async saveAppConfig(patch = {}) {
    if (!this.data.isAdmin || this.data.appConfigSaving) {
      return;
    }

    this.setData({
      appConfigSaving: true,
    });

    try {
      const appConfig = await this.callApi("/app/config/save", patch);
      const normalized = normalizeAppConfig(appConfig);
      this.setLocalCache("appConfig", {}, normalized);
      this.setData({
        appConfig: normalized,
      });
      wx.showToast({
        title: "已保存",
        icon: "success",
      });
    } catch (error) {
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
      // 保存失败时回拉本地开关状态，避免界面与云端不一致
      await this.loadAppConfig({ force: true }).catch(() => {});
    } finally {
      this.setData({
        appConfigSaving: false,
      });
    }
  },

  onToggleDonationEnabled(e) {
    this.saveAppConfig({
      donationEnabled: Boolean(e.detail.value),
    });
  },

  async uploadAppConfigImage(configKey, cloudFileName) {
    if (!this.data.isAdmin || this.data.appConfigSaving) {
      return;
    }

    let media = null;
    try {
      media = await wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["album"],
      });
    } catch (error) {
      // 用户取消选图，不提示
      return;
    }

    const tempFilePath = String(
      (media && media.tempFiles && media.tempFiles[0] && media.tempFiles[0].tempFilePath) || ""
    );
    if (!tempFilePath) {
      return;
    }

    try {
      wx.showLoading({
        title: "上传中",
      });
      const extMatch = tempFilePath.match(/\.(\w+)$/);
      const ext = extMatch ? extMatch[1] : "png";
      const uploadResult = await wx.cloud.uploadFile({
        cloudPath: `app-config/${cloudFileName}-${Date.now()}.${ext}`,
        filePath: tempFilePath,
      });
      wx.hideLoading();
      await this.saveAppConfig({
        [configKey]: uploadResult.fileID,
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    }
  },

  onUploadDonationImage() {
    this.uploadAppConfigImage("donationImageUrl", "donation-code");
  },

  onUploadMpQrcode() {
    this.uploadAppConfigImage("mpQrcodeUrl", "mp-qrcode");
  },

  async onEditDonationText() {
    const result = await this.showEditableModal({
      title: "编辑赞赏文案",
      placeholderText: "留空则使用默认文案",
      content: this.data.appConfig.donationText,
    });
    if (!result.confirm) {
      return;
    }
    await this.saveAppConfig({
      donationText: String(result.content || "").trim(),
    });
  },

  async onEditMpName() {
    const result = await this.showEditableModal({
      title: "编辑公众号名称",
      placeholderText: "输入公众号名称",
      content: this.data.appConfig.mpName,
    });
    if (!result.confirm) {
      return;
    }
    await this.saveAppConfig({
      mpName: String(result.content || "").trim(),
    });
  },

  async onToggleMessageBoard() {
    const messageBoardExpanded = !this.data.messageBoardExpanded;
    this.setData({
      messageBoardExpanded,
    });
    if (messageBoardExpanded && !this.data.messagesLoaded && !this.data.messagesLoading) {
      await this.loadMessages();
    }
  },

  async loadMessages() {
    this.setData({
      messagesLoading: true,
    });

    try {
      const response = await this.callApi("/message/list");
      const messages = (Array.isArray(response && response.data) ? response.data : []).map(
        decorateMessage
      );
      this.setData({
        messages: sortMessages(messages, this.data.messageSortBy),
        messageTotal: Number((response && response.total) || messages.length),
        messagesLoaded: true,
      });
    } catch (error) {
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    } finally {
      this.setData({
        messagesLoading: false,
      });
    }
  },

  onSwitchMessageSort(e) {
    const messageSortBy = e.currentTarget.dataset.sort;
    if (!messageSortBy || messageSortBy === this.data.messageSortBy) {
      return;
    }
    this.setData({
      messageSortBy,
      messages: sortMessages(this.data.messages, messageSortBy),
    });
  },

  onMessageDraftInput(e) {
    this.setData({
      messageDraft: String(e.detail.value || ""),
    });
  },

  async onSubmitMessage() {
    if (this.data.messageSubmitting) {
      return;
    }

    const content = String(this.data.messageDraft || "").trim();
    if (!content) {
      wx.showToast({
        title: "先写点内容吧",
        icon: "none",
      });
      return;
    }
    if (content.length > MESSAGE_MAX_LENGTH) {
      wx.showToast({
        title: `留言最多 ${MESSAGE_MAX_LENGTH} 字`,
        icon: "none",
      });
      return;
    }

    this.setData({
      messageSubmitting: true,
    });

    try {
      await this.callApi("/message/save", {
        content,
      });
      this.setData({
        messageDraft: "",
      });
      await this.loadMessages();
      wx.showToast({
        title: "已发布",
        icon: "success",
      });
    } catch (error) {
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    } finally {
      this.setData({
        messageSubmitting: false,
      });
    }
  },

  async onReactMessage(e) {
    const { id, reaction } = e.currentTarget.dataset;
    if (!id || !reaction || this._messageReactPending) {
      return;
    }

    const index = (this.data.messages || []).findIndex((item) => item.id === id);
    if (index < 0) {
      return;
    }

    const current = this.data.messages[index];
    const nextReaction = current.myReaction === reaction ? "none" : reaction;

    this._messageReactPending = true;
    try {
      const result = await this.callApi("/message/react", {
        messageId: id,
        reaction: nextReaction,
      });
      const patch = {};
      patch[`messages[${index}].likeCount`] = Math.max(0, Number((result && result.likeCount) || 0));
      patch[`messages[${index}].dislikeCount`] = Math.max(
        0,
        Number((result && result.dislikeCount) || 0)
      );
      patch[`messages[${index}].adminLiked`] = Boolean(result && result.adminLiked);
      patch[`messages[${index}].myReaction`] = String((result && result.myReaction) || "none");
      this.setData(patch);
    } catch (error) {
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    } finally {
      this._messageReactPending = false;
    }
  },

  async onRemoveMessage(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) {
      return;
    }

    const confirmResult = await this.showConfirmModal({
      title: "删除留言",
      content: "确认删除这条留言吗？",
    });
    if (!confirmResult.confirm) {
      return;
    }

    try {
      wx.showLoading({
        title: "删除中",
      });
      await this.callApi("/message/remove", {
        messageId: id,
      });
      wx.hideLoading();
      await this.loadMessages();
      wx.showToast({
        title: "已删除",
        icon: "success",
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    }
  },

  async loadAdminOverviewStats(options = {}) {
    if (!this.data.isAdmin) {
      return;
    }

    const matchFormat = this.getSelectedMatchFormat();
    const scope = this.data.adminOverviewScope || "month";
    const selectedMonthValue = this.data.adminOverviewMonthValue || getCurrentMonth();
    const selectedMonthLabel =
      this.data.adminOverviewMonthLabel || formatMonthOptionLabel(selectedMonthValue);
    const matchMonth = scope === "all" ? "all" : selectedMonthValue;
    const matchTypeNames = (
      this.data.adminOverviewSelectedMatchTypeNames || []
    ).map((name) => String(name));
    const adminOverviewStats = await this.loadCachedResource({
      resource: "adminOverviewStats",
      params: {
        matchFormat,
        matchMonth,
        matchTypeNames: matchTypeNames.join(","),
      },
      force: Boolean(options.force),
      request: () =>
        this.callApi("/admin/overall-stats", {
          matchFormat,
          matchMonth,
          matchTypeNames,
        }),
    });

    this.setData({
      adminOverviewStats: {
        ...adminOverviewStats,
        scopeLabel: scope === "all" ? "全部数据" : selectedMonthLabel,
        items: decorateDeckUsageStats(adminOverviewStats.items),
      },
    });
  },

  resetAdminOverviewState(scope = this.data.adminOverviewScope || "month") {
    const selectedMonth = resolveAdminOverviewMonthState(
      this.data.monthItems || [],
      this.data.adminOverviewMonthValue
    );
    this.setData({
      adminOverviewScope: scope,
      adminOverviewLoaded: false,
      adminOverviewMonthIndex: selectedMonth.index,
      adminOverviewMonthValue: selectedMonth.value,
      adminOverviewMonthLabel: selectedMonth.label,
      adminOverviewStats: {
        totalGames: 0,
        deckCount: 0,
        scopeLabel: scope === "all" ? "全部数据" : selectedMonth.label,
        items: [],
      },
    });
  },

  async loadAdminOverviewMatchTypes(options = {}) {
    if (!this.data.isAdmin) {
      return;
    }

    const matchFormat = this.getSelectedMatchFormat();
    const matchTypeList = await this.loadCachedResource({
      resource: "adminMatchTypes",
      params: {
        matchFormat,
      },
      force: Boolean(options.force),
      request: () =>
        this.callApi("/admin/match-types", {
          matchFormat,
        }),
    });

    this.setData({
      adminOverviewMatchTypeList: matchTypeList || [],
    });
    this.syncAdminOverviewMatchTypeOptions();
  },

  syncAdminOverviewMatchTypeOptions() {
    const matchTypeList = this.data.adminOverviewMatchTypeList || [];
    const validKeys = new Set(matchTypeList.map((item) => String(item.id)));
    const selectedMatchTypeNames = (
      this.data.adminOverviewSelectedMatchTypeNames || []
    ).filter((name) => validKeys.has(String(name)));
    this.setData({
      adminOverviewMatchTypeOptions: buildAdminOverviewMatchTypeOptions(
        matchTypeList,
        selectedMatchTypeNames
      ),
      adminOverviewSelectedMatchTypeNames: selectedMatchTypeNames,
    });
  },

  async exportDataBackup() {
    if (this.data.backupExporting) {
      return;
    }

    this.setData({
      backupExporting: true,
    });

    try {
      const result = await exportBackup();
      if (result && result.cancelled) {
        return;
      }
      const summary = (result && result.summary) || {};
      // 明确提示文件保存位置:H5 走浏览器下载,App 优先公共 Download,失败回退私有目录
      const locationLabel = result && result.viaBrowser
        ? "已生成备份文件"
        : result && result.savedByPicker
          ? "已保存到用户选择的位置"
          : result && result.savedToDownload
          ? "已保存到手机 Download"
          : "已保存到应用私有目录";
      // savedPath 为 file:// 真实绝对路径,展示时去掉前缀,方便在文件管理器中直接定位
      const savedPath = ((result && result.savedPath) || "").replace(/^file:\/\//, "");
      this.setData({
        backupSummaryText: `${locationLabel} · ${summary.records || 0} 条战绩 · ${result.fileName || ""}${savedPath ? ` · ${savedPath}` : ""}`,
      });
      wx.showToast({
        title: result && result.savedToDownload ? "已保存到 Download" : "已导出",
        icon: "success",
      });
    } catch (error) {
      const message = this.getErrorMessage(error);
      console.error("backup export failed =>", error);
      this.setData({
        backupSummaryText: `导出失败：${message}`,
      });
      wx.showToast({
        title: message,
        icon: "none",
      });
    } finally {
      this.setData({
        backupExporting: false,
      });
    }
  },

  async openBackupImport() {
    if (this.data.backupImporting) {
      return;
    }
    // Android 分区存储下不能可靠扫描公共 Download，直接选择文件更稳定，
    // 也能导入任意位置的备份。私有自动备份仅作为导入前的安全回滚副本保留。
    await this.openBackupImportFromFile();
  },

  async mergeCsvRecordImport(records) {
    // CSV 合并同样先留一份私有自动备份，便于用户发现内容不符时回滚。
    await autoBackupBeforeImportWithTimeout().catch(() => "");
    const [existingMd, existingOcg] = await Promise.all([
      this.loadAllRecordsForMatchFormat("md", { force: true }),
      this.loadAllRecordsForMatchFormat("ocg", { force: true }),
    ]);
    const existingImportKeys = new Set();
    const existingFingerprints = new Set();
    [...existingMd, ...existingOcg].forEach((item) => {
      if (item.importKey) existingImportKeys.add(String(item.importKey));
      existingFingerprints.add(csvRecordFingerprint(item));
    });

    const refsByFormat = {};
    for (const matchFormat of ["md", "ocg"]) {
      const [decks, matchTypes, mdAccounts] = await Promise.all([
        this.callApi("/deck/list", { matchFormat, matchMonth: "all" }),
        this.callApi("/dict/list", { dictCode: "match_type", matchFormat }),
        matchFormat === "md"
          ? this.callApi("/dict/list", { dictCode: "md_account" })
          : Promise.resolve([]),
      ]);
      const toMap = (items, labelKey) => new Map(
        (items || []).map((item) => [String(item[labelKey] || "").trim().toLocaleLowerCase(), item])
      );
      refsByFormat[matchFormat] = {
        decks: toMap(decks, "deckName"),
        matchTypes: toMap(matchTypes, "itemLabel"),
        mdAccounts: toMap(mdAccounts, "itemLabel"),
      };
    }

    let created = 0;
    let skipped = 0;
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      if (index % 10 === 0) {
        wx.showLoading({ title: `合并 ${index + 1}/${records.length}` });
      }
      const fingerprint = csvRecordFingerprint(record);
      if (existingImportKeys.has(record.importKey) || existingFingerprints.has(fingerprint)) {
        skipped += 1;
        continue;
      }
      const refs = refsByFormat[record.matchFormat];
      const deckKey = record.deckName.toLocaleLowerCase();
      let deck = refs.decks.get(deckKey);
      if (!deck) {
        const saved = await this.callApi("/deck/save", {
          matchFormat: record.matchFormat,
          deckName: record.deckName,
        });
        deck = { id: saved.id, deckName: record.deckName };
        refs.decks.set(deckKey, deck);
      }
      const typeKey = record.matchTypeName.toLocaleLowerCase();
      let matchType = refs.matchTypes.get(typeKey);
      if (!matchType) {
        await this.callApi("/dict/item/save", {
          dictCode: "match_type",
          matchFormat: record.matchFormat,
          itemValue: record.matchTypeName,
          itemLabel: record.matchTypeName,
        });
        const types = await this.callApi("/dict/list", {
          dictCode: "match_type",
          matchFormat: record.matchFormat,
        });
        (types || []).forEach((item) => refs.matchTypes.set(
          String(item.itemLabel || "").trim().toLocaleLowerCase(), item
        ));
        matchType = refs.matchTypes.get(typeKey);
      }
      let mdAccountId = null;
      if (record.matchFormat === "md" && record.mdAccountName) {
        const accountKey = record.mdAccountName.toLocaleLowerCase();
        let account = refs.mdAccounts.get(accountKey);
        if (!account) {
          await this.callApi("/dict/item/save", {
            dictCode: "md_account",
            itemValue: record.mdAccountName,
            itemLabel: record.mdAccountName,
          });
          const accounts = await this.callApi("/dict/list", { dictCode: "md_account" });
          (accounts || []).forEach((item) => refs.mdAccounts.set(
            String(item.itemLabel || "").trim().toLocaleLowerCase(), item
          ));
          account = refs.mdAccounts.get(accountKey);
        }
        mdAccountId = account && account.id;
      }
      await this.callApi("/match/record/save", {
        matchFormat: record.matchFormat,
        matchMonth: record.matchMonth,
        dayOfWeek: record.dayOfWeek,
        coinResult: record.coinResult,
        matchResult: record.matchResult,
        ocgGameResults: record.ocgGameResults,
        ocgStarterCounts: record.matchFormat === "ocg" && record.starterValues.length ? record.starterValues : "",
        ocgHandTrapCounts: record.matchFormat === "ocg" && record.handTrapValues.length ? record.handTrapValues : "",
        ocgBrickCounts: record.matchFormat === "ocg" && record.brickValues.length ? record.brickValues : "",
        deckId: deck && deck.id,
        matchType: matchType && matchType.id,
        mdAccountId,
        starterCount: record.starterCount,
        handTrapCount: record.handTrapCount,
        brickCount: record.brickCount,
        opponentDeck: record.opponentDeck,
        failureReasons: record.failureReasons,
        remark: record.remark,
        importKey: record.importKey,
      });
      existingImportKeys.add(record.importKey);
      existingFingerprints.add(fingerprint);
      created += 1;
    }
    this.clearLocalCaches(["records", "statistics", "decks", "allRecords", "months", "mdAccounts", "matchTypes"]);
    return { created, skipped };
  },

  async openBackupImportFromFile() {
    const text = await this.pickBackupFileText();
    if (text === null) {
      return; // 未选择文件或读取失败
    }
    const isJsonBackup = String(text).trim().startsWith("{");
    let csvRecords = null;
    if (!isJsonBackup) {
      try {
        csvRecords = parseCsvRecordRows(text);
      } catch (error) {
        wx.showToast({ title: this.getErrorMessage(error), icon: "none" });
        return;
      }
    }
    const confirmResult = await this.showConfirmModal({
      title: isJsonBackup ? "覆盖导入 JSON 备份" : "合并导入 CSV 战绩",
      content: isJsonBackup
        ? "JSON 备份将覆盖本机全部数据，导入前会自动保留一份当前数据备份。"
        : `将合并 ${csvRecords.length} 条 CSV 战绩；已有数据会跳过，缺少的卡组、月份、对战类型和 MD 账号会自动新增。`,
      confirmText: isJsonBackup ? "覆盖导入" : "开始合并",
      cancelText: "取消",
    });
    if (!confirmResult.confirm) return;

    this.setData({
      backupImporting: true,
    });
    try {
      wx.showLoading({
        title: "导入中",
      });
      const result = isJsonBackup
        ? await importBackupFromText(text, { mode: "overwrite" })
        : await this.mergeCsvRecordImport(csvRecords);
      wx.hideLoading();
      this.setData({
        backupSummaryText: isJsonBackup
          ? `已覆盖导入 ${(result.summary && result.summary.records) || 0} 条战绩`
          : `CSV 合并完成：新增 ${result.created} 条，跳过 ${result.skipped} 条`,
      });
      wx.showToast({
        title: "导入完成",
        icon: "success",
      });
      this.loadPieChartColors();
      await this.refreshCurrentTabData();
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    } finally {
      this.setData({
        backupImporting: false,
      });
    }
  },

  // 通过系统文件选择器读取 JSON 备份或 CSV 战绩;H5 为 File,App Android 常为 content:// URI。
  // 未选择或读取失败时返回 null。
  pickBackupFileText() {
    return new Promise((resolve) => {
      if (!isH5()) {
        chooseOpenFile("*/*")
          .then((pickedPath) => {
            if (!pickedPath) {
              resolve(null);
              return;
            }
            return readTextFile(String(pickedPath))
              .then((text) => resolve(text))
              .catch((error) => {
                wx.showToast({
                  title: this.getErrorMessage(error),
                  icon: "none",
                });
                resolve(null);
              });
          })
          .catch((error) => {
            wx.showToast({
              title: this.getErrorMessage(error),
              icon: "none",
            });
            resolve(null);
          });
        return;
      }
      try {
        uni.chooseFile({
          count: 1,
          extension: [".json", ".csv"],
          success: (res) => {
            const picked =
              (res.tempFiles && res.tempFiles[0]) ||
              (res.tempFilePaths && res.tempFilePaths[0]) ||
              null;
            if (!picked) {
              resolve(null);
              return;
            }
            if (typeof File !== "undefined" && picked instanceof File) {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result || ""));
              reader.onerror = () => {
                wx.showToast({
                  title: "读取文件失败",
                  icon: "none",
                });
                resolve(null);
              };
              reader.readAsText(picked, "utf-8");
              return;
            }
            const pickedPath =
              (picked && (picked.path || picked.tempFilePath || picked.filePath)) ||
              picked;
            if (!pickedPath) {
              resolve(null);
              return;
            }
            if (!isH5()) {
              readTextFile(String(pickedPath))
                .then((text) => resolve(text))
                .catch(() => {
                  wx.showToast({
                    title: "读取文件失败",
                    icon: "none",
                  });
                  resolve(null);
                });
              return;
            }
            // 兜底:object URL / 临时路径,用 fetch 读取
            fetch(String(pickedPath))
              .then((response) => response.text())
              .then((text) => resolve(text))
              .catch(() => {
                wx.showToast({
                  title: "读取文件失败",
                  icon: "none",
                });
                resolve(null);
              });
          },
          fail: () => resolve(null),
        });
      } catch (error) {
        resolve(null);
      }
    });
  },

  async exportCurrentFormatRecords() {
    if (this.data.recordExporting) {
      return;
    }
    const matchFormat = this.getSelectedMatchFormat();
    const cachedRecords = this.getCachedAllRecordsForMatchFormat(matchFormat);
    if (!cachedRecords) {
      this.loadAllRecordsForMatchFormat(matchFormat, {
        force: true,
      }).catch((error) => {
        console.error("preload export records failed =>", error);
      });
      wx.showToast({
        title: "战绩还在加载，稍后再试",
        icon: "none",
      });
      return;
    }

    const records = sortRecordListDesc(cachedRecords);
    if (!records.length) {
      wx.showToast({
        title: "当前赛制还没有战绩",
        icon: "none",
      });
      return;
    }

    this.setData({
      recordExporting: true,
    });
    // 统一复位按钮状态,避免异常后按钮一直转圈
    const finish = () => {
      this.setData({
        recordExporting: false,
      });
    };
    const failExport = (error) => {
      const message = this.getErrorMessage(error);
      console.error("CSV export failed =>", error);
      this.setData({
        csvExportText: `导出失败：${message}`,
      });
      wx.showToast({
        title: message,
        icon: "none",
      });
      finish();
    };

    try {
      const fileName = this.buildRecordExportFileName(matchFormat);
      const csvText = this.buildRecordExportCsv(records, matchFormat);
      if (isH5()) {
        // H5:浏览器直接下载,不经过文件系统
        downloadTextFile(fileName, csvText, "text/csv;charset=utf-8");
        this.setData({
          csvExportText: "已通过浏览器下载 CSV 文件",
        });
        wx.showToast({
          title: "已导出 CSV",
          icon: "success",
        });
        finish();
        return;
      }

      // App 端让用户通过系统“另存为”选择器决定保存目录（可选择 Download）。
      let filePath = "";
      let savedPath = "";
      let savedToDownload = false;
      let savedByPicker = false;
      let pickerSupported = true;
      let selectedUri = null;
      try {
        selectedUri = await chooseSaveFile(fileName, "text/csv");
      } catch (pickerError) {
        pickerSupported = false;
      }
      if (pickerSupported && !selectedUri) {
        finish();
        return;
      }
      if (selectedUri) {
        let byteLength;
        try {
          byteLength = await writeTextToContentUri(selectedUri, csvText);
        } catch (error) {
          throw new Error(`写入用户选择的位置失败：${error.message || error}`);
        }
        if (Number(byteLength) <= 0) {
          throw new Error("CSV 文件写入后为空");
        }
        filePath = selectedUri;
        savedPath = selectedUri;
        savedByPicker = true;
      }
      // Android 10+ 的兼容回退:通过 MediaStore 写入真正的公共 Download。
      try {
        if (!filePath) {
          const saved = await saveTextToPublicDownloads(
            fileName,
            csvText,
            "text/csv;charset=utf-8"
          );
          if (!saved || Number(saved.sizeBytes) <= 0) {
            throw new Error("CSV 文件写入后为空");
          }
          filePath = saved.uri;
          savedPath = saved.displayPath;
          savedToDownload = true;
        }
      } catch (error) {
        filePath = "";
      }
      if (!filePath) {
        filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;
        await writeTextFile(filePath, csvText);
        const writtenText = await readTextFile(filePath);
        // 部分 Android FileReader 读取 UTF-8 文本时会自动去掉 BOM;
        // CSV 本身已生成,校验时忽略 BOM 差异,避免误报写入失败。
        const normalizeUtf8Bom = (value) => String(value || "").replace(/^\uFEFF/, "");
        if (normalizeUtf8Bom(writtenText) !== normalizeUtf8Bom(csvText)) {
          throw new Error("CSV 文件写入校验失败");
        }
        savedPath = toAbsoluteUrl(filePath);
      }

      // 不再自动分享:保存后直接展示文件真实路径(file:// 前缀去掉,便于文件管理器定位)
      savedPath = String(savedPath || filePath).replace(/^file:\/\//, "");
      this.setData({
        csvExportText: savedToDownload
          ? `已保存到系统「下载」目录：${savedPath}`
          : savedByPicker
            ? `已保存到用户选择的位置：${savedPath}`
          : `已保存到应用私有目录：${savedPath}`,
      });
      wx.showToast({
        title: savedToDownload || savedByPicker ? "已保存 CSV" : "已导出",
        icon: "success",
      });
      finish();
    } catch (error) {
      failExport(error);
    }
  },

  onSelectDeck(e) {
    const selectedDeckId = e.currentTarget.dataset.id;
    if (!selectedDeckId || selectedDeckId === this.data.selectedDeckId) {
      return;
    }

    this.setData({
      selectedDeckId,
      selectedDeckName: this.getSelectedDeckName(
        this.data.sidebarDecks,
        selectedDeckId
      ),
    });

    this.loadCurrentTabData();
  },

  onToggleSidebar() {
    this.setData({
      sidebarCollapsed: !this.data.sidebarCollapsed,
    });
  },

  onSwitchTab(e) {
    const currentTab = e.currentTarget.dataset.tab;
    if (!currentTab || currentTab === this.data.currentTab) {
      return;
    }

    this.dismissRecordOpponentDeckInput();
    this.setData({
      currentTab,
      currentTabTitle: TAB_TITLE_MAP[currentTab] || TAB_TITLE_MAP.records,
      errorMessage: "",
    });

    if (currentTab === "settings") {
      this.loadCurrentTabData();
      return;
    }

    Promise.all([this.loadDecks(true), this.loadCurrentTabData()]).catch((error) => {
      this.setData({
        errorMessage: this.getErrorMessage(error),
      });
    });
  },

  onSwitchMatchFormat(e) {
    const currentMatchFormat = e.currentTarget.dataset.format;
    if (!currentMatchFormat || currentMatchFormat === this.data.currentMatchFormat) {
      return;
    }

    this.dismissRecordOpponentDeckInput();
    this.setData({
      currentMatchFormat,
      currentMatchFormatLabel: MATCH_FORMAT_LABEL_MAP[currentMatchFormat] || "MD",
      matchTypes: [],
      recordMatchTypeIndex: 0,
      currentRecordMatchTypeLabel: getDefaultMatchTypeLabel(currentMatchFormat),
      recordMatchTypeOptions: buildRecordMatchTypeOptions([], currentMatchFormat),
      recordMatchTypePickerOptions: buildRecordMatchTypeOptions([], currentMatchFormat),
      matchTypeFilterOptions: buildMatchTypeFilterOptions([]),
      matchTypeFilterIndex: 0,
      currentMatchTypeFilterLabel: "全部类型",
      selectedMatchTypeFilterValue: "all",
      selectedMatchTypeFilterIds: [],
      errorMessage: "",
    });
    this.resetAdminOverviewState(this.data.adminOverviewScope || "month");

    Promise.all([this.loadDecks(false), this.loadCurrentTabData()]).catch((error) => {
      this.setData({
        errorMessage: this.getErrorMessage(error),
      });
    });

    this.scheduleBackgroundRemoteRefresh({
      force: true,
      targetFormats: [currentMatchFormat],
    });
  },

  onMonthFilterChange(e) {
    const monthFilterIndex = Number(e.detail.value || 0);
    const selectedMonthFilter =
      (this.data.monthFilterOptions || [])[monthFilterIndex] ||
      this.data.monthFilterOptions[0] || {
        itemLabel: "全部月份",
        itemValue: "all",
      };

    this.setData({
      monthFilterIndex,
      currentMonthFilterLabel: selectedMonthFilter.itemLabel,
      selectedMonthFilterValue: selectedMonthFilter.itemValue,
    });

    if (this.data.currentTab === "records" || this.data.currentTab === "stats") {
      this.setData({
        contentLoading: true,
        errorMessage: "",
      });

      Promise.all([this.loadDecks(true), this.loadCurrentTabData()]).catch((error) => {
        this.setData({
          errorMessage: this.getErrorMessage(error),
          contentLoading: false,
        });
      });
    }
  },

  onMatchTypeFilterChange(e) {
    const matchTypeFilterIndex = Number(e.detail.value || 0);
    const selectedMatchTypeFilter =
      (this.data.matchTypeFilterOptions || [])[matchTypeFilterIndex] ||
      this.data.matchTypeFilterOptions[0] || {
        id: "all",
        itemLabel: "全部类型",
      };

    this.setData({
      matchTypeFilterIndex,
      currentMatchTypeFilterLabel: selectedMatchTypeFilter.itemLabel,
      selectedMatchTypeFilterValue: selectedMatchTypeFilter.id,
      selectedMatchTypeFilterIds: selectedMatchTypeFilter.matchTypeIds || [],
    });

    if (this.data.currentTab === "stats" || this.data.currentTab === "records") {
      this.setData({
        contentLoading: true,
        errorMessage: "",
      });

      this.loadCurrentTabData().catch((error) => {
        this.setData({
          errorMessage: this.getErrorMessage(error),
          contentLoading: false,
        });
      });
    }
  },

  onToggleOpponentDeckStats() {
    if (LITE_EDITION) {
      return;
    }
    const opponentDeckStatsEnabled = !this.data.opponentDeckStatsEnabled;
    const statsOpponentDeckMode = opponentDeckStatsEnabled
      ? "all"
      : (this.data.statsOpponentDeckMode || "all");

    this.setData({
      opponentDeckStatsEnabled,
      statsOpponentDeckMode,
      currentStatsOpponentDeckModeLabel:
        STATS_OPPONENT_DECK_MODE_LABEL_MAP[statsOpponentDeckMode] ||
        STATS_OPPONENT_DECK_MODE_LABEL_MAP.all,
      statsOpponentDeckList: this.getSelectedOpponentDeckStatsList(
        this.data.statistics,
        statsOpponentDeckMode
      ),
    });

    if (this.data.currentTab === "stats") {
      this.setData({
        contentLoading: true,
        errorMessage: "",
      });

      Promise.all([this.loadDecks(true), this.loadCurrentTabData()]).catch((error) => {
        this.setData({
          errorMessage: this.getErrorMessage(error),
          contentLoading: false,
        });
      });
    }
  },

  toggleHeroCollapsed() {
    this.setData({ heroCollapsed: !this.data.heroCollapsed });
  },

  onToggleStatsTodayOnly() {
    const statsTodayOnly = !this.data.statsTodayOnly;
    this.setData({ statsTodayOnly });

    if (this.data.currentTab === "stats") {
      this.setData({
        contentLoading: true,
        errorMessage: "",
      });
      Promise.all([this.loadDecks(true), this.loadCurrentTabData()]).catch((error) => {
        this.setData({
          errorMessage: this.getErrorMessage(error),
          contentLoading: false,
        });
      });
    }
  },

  onStatsMonthRangeChange(e) {
    const selectedIndices = Array.isArray(e.detail.value) ? e.detail.value : [0, 0];
    const monthValues = this.data.statsMonthRangeValues || [];
    const selectedStatsMonthRange = resolveStatsMonthRange(
      monthValues,
      monthValues[Number(selectedIndices[0] || 0)] || "",
      monthValues[Number(selectedIndices[1] || 0)] || ""
    );

    this.setData({
      statsMonthRangeIndices: [
        selectedStatsMonthRange.startIndex,
        selectedStatsMonthRange.endIndex,
      ],
      statsMonthRangeStartValue: selectedStatsMonthRange.startValue,
      statsMonthRangeEndValue: selectedStatsMonthRange.endValue,
      statsMonthRangeLabel: formatStatsMonthRangeLabel(
        selectedStatsMonthRange.startValue,
        selectedStatsMonthRange.endValue
      ),
    });

    if (this.data.currentTab === "stats" && this.data.opponentDeckStatsEnabled) {
      this.setData({
        contentLoading: true,
        errorMessage: "",
      });

      Promise.all([this.loadDecks(true), this.loadCurrentTabData()]).catch((error) => {
        this.setData({
          errorMessage: this.getErrorMessage(error),
          contentLoading: false,
        });
      });
    }
  },

  onSwitchStatsOpponentDeckMode(e) {
    const statsOpponentDeckMode = e.currentTarget.dataset.mode;
    if (
      !statsOpponentDeckMode ||
      statsOpponentDeckMode === this.data.statsOpponentDeckMode
    ) {
      return;
    }

    const statsOpponentDeckList = applyOpponentDeckCategoryMapping(
      this.getSelectedOpponentDeckStatsList(
        this.data.statistics,
        statsOpponentDeckMode
      ),
      this.getOpponentDeckCategoryMap()
    );

    const updates = {
      statsOpponentDeckMode,
      currentStatsOpponentDeckModeLabel:
        STATS_OPPONENT_DECK_MODE_LABEL_MAP[statsOpponentDeckMode] ||
        STATS_OPPONENT_DECK_MODE_LABEL_MAP.all,
      statsOpponentDeckList,
    };

    // 饼图开启时同步更新饼图数据
    if (this.data.pieChartEnabled) {
      updates.pieChartLegend = this.computePieChartSegments(statsOpponentDeckList);
      updates.pieChartGradient = this.buildPieChartGradient(updates.pieChartLegend);
    }
    updates.pieChartTotalGames = (statsOpponentDeckList.length && statsOpponentDeckList[0].totalRecordedGames) || 0;

    this.setData(updates);
  },

  loadPieChartColors() {
    try {
      const saved = wx.getStorageSync(PIE_COLOR_STORAGE_KEY);
      const colors = Array.isArray(saved) ? saved : [];
      this.setData({ pieChartColorMap: colors });
    } catch (error) {
      this.setData({ pieChartColorMap: [] });
    }
  },

  openPieChartRules() {
    this.setData({ pieRulesVisible: true });
  },

  closePieChartRules() {
    this.setData({ pieRulesVisible: false });
  },

  onPieChartColorTap(event) {
    const index = Number(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.index);
    const segment = (this.data.pieChartLegend || [])[index];
    if (!segment || !segment.customizable || segment.opponentDeck === "others") {
      return;
    }
    this.setData({
      pieColorPickerVisible: true,
      pieColorPickerDeck: segment.opponentDeck,
      pieColorPickerIndex: index,
      pieColorPickerValue: segment.color,
    });
  },

  closePieColorPicker() {
    this.setData({
      pieColorPickerVisible: false,
      pieColorPickerDeck: "",
      pieColorPickerIndex: -1,
      pieColorPickerValue: "",
    });
  },

  onSelectPieChartColor(event) {
    const color = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.color || "").toUpperCase();
    const index = Number(this.data.pieColorPickerIndex);
    if (!Number.isInteger(index) || index < 0 || PIE_CUSTOM_COLORS.indexOf(color) < 0) {
      return;
    }
    const colorMap = Array.isArray(this.data.pieChartColorMap)
      ? this.data.pieChartColorMap.slice()
      : [];
    colorMap[index] = color;
    try {
      wx.setStorageSync(PIE_COLOR_STORAGE_KEY, colorMap);
    } catch (error) {
      console.warn("save pie chart color failed", error);
    }
    const segments = this.computePieChartSegments(this.data.statsOpponentDeckList, colorMap);
    this.setData({
      pieChartColorMap: colorMap,
      pieChartLegend: segments,
      pieChartGradient: this.buildPieChartGradient(segments),
      pieColorPickerValue: color,
      pieColorPickerVisible: false,
    });
  },

  onTogglePieChart() {
    const pieChartEnabled = !this.data.pieChartEnabled;
    const updates = { pieChartEnabled };

    if (pieChartEnabled) {
      updates.sidebarCollapsed = true;
      const segments = this.computePieChartSegments(this.data.statsOpponentDeckList);
      updates.pieChartLegend = segments;
      updates.pieChartGradient = this.buildPieChartGradient(segments);
      const list = this.data.statsOpponentDeckList;
      updates.pieChartTotalGames = (list.length && list[0].totalRecordedGames) || 0;
    } else {
      updates.pieChartLegend = [];
      updates.pieChartGradient = "";
      updates.pieChartTotalGames = 0;
    }

    this.setData(updates);
  },

  computePieChartSegments(statsList = [], colorMap = this.data.pieChartColorMap) {
    if (!statsList.length) {
      return [];
    }

    // 解析 shareRate "xx.xx%" → 数值
    const parsed = statsList.map((item) => ({
      ...item,
      shareValue: parseFloat(String(item.shareRate || "0")) || 0,
    }));

    // 筛选 ≥ 5%
    const above5 = parsed.filter((item) => item.shareValue >= 5);
    // 按占比降序排列
    above5.sort((a, b) => b.shareValue - a.shareValue || b.matchCount - a.matchCount);

    // 取前 10 位，处理末尾平局：如果第 10 位与后面有相同占比，只取前面的
    const segments = [];
    for (let i = 0; i < above5.length; i++) {
      if (segments.length >= 10) {
        break;
      }
      // 检查：加入当前项是否会触发平局超限
      // 如果这是第 10 个位置（segments.length === 9），并且后面还有相同占比的项
      if (segments.length === 9) {
        let tieCount = 1;
        for (let j = i + 1; j < above5.length; j++) {
          if (above5[j].shareValue === above5[i].shareValue) {
            tieCount++;
          } else {
            break;
          }
        }
        if (tieCount > 1) {
          // 存在平局会导致超出 10 位，不取这个平局组
          break;
        }
      }
      segments.push(above5[i]);
    }

    const segmentsShareSum = segments.reduce((sum, s) => sum + s.shareValue, 0);
    const othersShare = Math.max(0, parseFloat((100 - segmentsShareSum).toFixed(2)));

    const totalAngle = Math.PI * 2;
    let currentAngle = -Math.PI / 2; // 饼图从12点方向开始，顺时针

    const result = segments.map((item, index) => {
      const angle = (item.shareValue / 100) * totalAngle;
      const seg = {
        opponentDeck: item.opponentDeck,
        matchCount: item.matchCount,
        shareRate: item.shareRate,
        shareValue: item.shareValue,
        color: (Array.isArray(colorMap) && colorMap[index]) || PIE_COLORS[index % PIE_COLORS.length],
        customizable: true,
        startAngle: currentAngle,
        sweepAngle: angle,
      };
      currentAngle += angle;
      return seg;
    });

    if (othersShare > 0) {
      const othersAngle = (othersShare / 100) * totalAngle;
      result.push({
        opponentDeck: "others",
        matchCount: 0,
        shareRate: othersShare.toFixed(2) + "%",
        shareValue: othersShare,
        color: PIE_OTHERS_COLOR,
        startAngle: currentAngle,
        sweepAngle: othersAngle,
      });
    }

    return result;
  },

  // 用 CSS 圆锥渐变拼出环形图背景，完全不依赖 canvas，
  // 避免原生组件在安卓真机上销毁重建后无法重绘/不跟随滚动的问题
  buildPieChartGradient(segments = []) {
    if (!segments.length) {
      return "";
    }
    const stops = [];
    let cursor = 0;
    segments.forEach((seg, index) => {
      const start = cursor;
      const end = index === segments.length - 1
        ? 100
        : Math.min(100, cursor + seg.shareValue);
      stops.push(`${seg.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`);
      cursor = end;
    });
    return `conic-gradient(${stops.join(", ")})`;
  },

  async openCreateDeck() {
    const result = await this.showDeckNameDialog({
      title: "新增卡组",
      placeholderText: `输入卡组名称（最多 ${DECK_NAME_MAX_LENGTH} 字）`,
    });

    const deckName = normalizeDeckNameInput(result.content);
    if (!result.confirm || !deckName) {
      return;
    }
    if (deckName.length > DECK_NAME_MAX_LENGTH) {
      wx.showToast({
        title: `卡组名最多 ${DECK_NAME_MAX_LENGTH} 字`,
        icon: "none",
      });
      return;
    }

    try {
      wx.showLoading({
        title: "保存中",
      });
      const matchFormat = this.getSelectedMatchFormat();
      const result = await this.callApi("/deck/save", {
        matchFormat,
        deckName,
      });
      if (this.hasLocalCacheEntry("decksBase", { matchFormat })) {
        this.patchLocalDeckBase(matchFormat, (decks) =>
          decks.concat({
            id: (result && result.id) || "",
            deckName: (result && result.deckName) || deckName,
            totalGames: 0,
          })
        );
        this.clearLocalCaches(["decks"]);
      } else {
        this.invalidateDeckRelatedCaches();
      }
      wx.hideLoading();
      wx.showToast({
        title: "已新增",
        icon: "success",
      });
      await this.refreshViewFromLocalCaches({
        keepSelection: true,
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    }
  },

  async deleteDeck(e) {
    const { id, name } = e.currentTarget.dataset;
    if (!id) {
      return;
    }

    const confirmResult = await this.showConfirmModal({
      title: "永久删除卡组",
      content: `确认永久删除“${name}”吗？关联战绩也会一并永久删除。`,
    });

    if (!confirmResult.confirm) {
      return;
    }

    try {
      wx.showLoading({
        title: "删除中",
      });
      const matchFormat = this.getSelectedMatchFormat();
      await this.callApi("/deck/remove", {
        matchFormat,
        id,
      });
      if (this.hasLocalCacheEntry("decksBase", { matchFormat })) {
        this.patchLocalDeckBase(matchFormat, (decks) =>
          decks.filter((item) => String(item.id || "") !== String(id))
        );
        if (this.hasLocalCacheEntry("allRecords", { matchFormat })) {
          this.patchLocalAllRecords(matchFormat, (records) =>
            records.filter((item) => String(item.deckId || "") !== String(id))
          );
        }
        this.clearLocalCaches(["decks", "records", "statistics", "deckCards", "adminOverviewStats"]);
      } else {
        this.invalidateDeckRelatedCaches();
      }
      wx.hideLoading();
      wx.showToast({
        title: "已删除",
        icon: "success",
      });
      await this.refreshViewFromLocalCaches({
        keepSelection: true,
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    }
  },

  async openDeckBuilder(e) {
    const { id, name } = e.currentTarget.dataset;
    if (!id) {
      return;
    }

    this.setData({
      deckBuilderVisible: true,
      deckBuilderLoading: true,
      deckBuilderRefreshing: false,
      deckBuilderDeckId: id,
      deckBuilderDeckName: name || "",
      deckBuilderImages: [],
      deckImagePreviewVisible: false,
      deckImagePreview: null,
      deckBuilderKeyword: "",
      deckBuilderSearchKeywordApplied: "",
      deckBuilderSearchLoadingMore: false,
      deckBuilderSearchHasMore: false,
      deckBuilderSearchPageNum: 0,
      deckBuilderSearchResults: [],
      deckBuilderSections: createEmptyDeckSections(),
      deckBuilderActionVisible: false,
      deckBuilderActionCard: null,
      deckBuilderActionMainCount: 0,
      deckBuilderActionSideCount: 0,
      deckBuilderActionPrimarySection: this.getSelectedMatchFormat() === "md" ? "main" : "main",
      ...getDeckBuilderViewState(createEmptyDeckSections(), this.getSelectedMatchFormat()),
    });

    try {
      await this.loadDeckBuilderData({
        deckId: id,
        deckName: name || "",
      });
    } catch (error) {
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
      this.setData({
        deckBuilderVisible: false,
      });
    } finally {
      this.setData({
        deckBuilderLoading: false,
      });
    }
  },

  async loadDeckBuilderData({ deckId, deckName = "", force = false } = {}) {
    const targetDeckId = String(deckId || this.data.deckBuilderDeckId || "").trim();
    if (!targetDeckId) {
      return;
    }
    const matchFormat = this.getSelectedMatchFormat();
    const result = await this.loadCachedResource({
      resource: "deckImages",
      params: {
        matchFormat,
        deckId: targetDeckId,
      },
      force,
      request: () =>
        this.callApi("/deck/images/get", {
          matchFormat,
          deckId: targetDeckId,
        }),
    });
    this.setData({
      deckBuilderDeckName: deckName || this.data.deckBuilderDeckName || "",
      deckBuilderImages: Array.isArray(result && result.images) ? result.images : [],
    });
  },

  async onRefreshDeckBuilder() {
    if (
      this.data.deckBuilderLoading ||
      this.data.deckBuilderSaving ||
      this.data.deckBuilderRefreshing
    ) {
      return;
    }

    this.setData({
      deckBuilderRefreshing: true,
    });

    try {
      await this.loadDeckBuilderData({
        force: true,
      });
      wx.showToast({
        title: "已刷新卡组图片",
        icon: "success",
      });
    } catch (error) {
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    } finally {
      this.setData({
        deckBuilderRefreshing: false,
      });
    }
  },

  chooseDeckImages() {
    const remaining = MAX_DECK_IMAGES - (this.data.deckBuilderImages || []).length;
    if (remaining <= 0) {
      wx.showToast({ title: "每个卡组最多保存 3 张图片", icon: "none" });
      return;
    }
    const handleResult = async (res) => {
      const files = (res && res.tempFiles) || [];
      const next = (this.data.deckBuilderImages || []).slice();
      try {
        for (const file of files.slice(0, remaining)) {
          const sourcePath = String(file.tempFilePath || file.path || "").trim();
          if (!sourcePath) continue;
          let sizeBytes = Number(file.size) || 0;
          if (!sizeBytes) sizeBytes = Number((await fileIoStatFile(sourcePath)).size) || 0;
          if (sizeBytes <= 0 || sizeBytes > MAX_DECK_IMAGE_BYTES) {
            throw new Error("图片大小不能超过 7MB");
          }
          const targetPath = `${wx.env.USER_DATA_PATH}/ygo_deck_image_${this.data.deckBuilderDeckId}_${Date.now()}_${next.length}.jpg`;
          await fileIoCopyFile(sourcePath, targetPath);
          next.push({
            path: targetPath,
            url: targetPath,
            name: String(file.name || `图片${next.length + 1}`),
            sizeBytes,
          });
        }
        this.setData({ deckBuilderImages: next });
      } catch (error) {
        wx.showToast({ title: (error && error.message) || "图片处理失败", icon: "none" });
      }
    };
    if (typeof uni !== "undefined" && typeof uni.chooseImage === "function") {
      uni.chooseImage({ count: remaining, sizeType: ["original", "compressed"], sourceType: ["album", "camera"], success: handleResult });
    } else {
      wx.chooseMedia({ count: remaining, mediaType: ["image"], sourceType: ["album", "camera"], success: handleResult });
    }
  },

  removeDeckImage(e) {
    const index = Number(e.currentTarget.dataset.index);
    const images = (this.data.deckBuilderImages || []).slice();
    if (!Number.isInteger(index) || index < 0 || index >= images.length) return;
    images.splice(index, 1);
    this.setData({ deckBuilderImages: images });
  },

  previewDeckImage(e) {
    const index = Number(e.currentTarget.dataset.index);
    const images = this.data.deckBuilderImages || [];
    const image = images[index];
    if (!image || !image.url) return;
    this.setData({ deckImagePreviewVisible: true, deckImagePreview: image });
  },

  closeDeckImagePreview() {
    this.setData({ deckImagePreviewVisible: false, deckImagePreview: null });
  },

  saveDeckImageToAlbum() {
    const image = this.data.deckImagePreview;
    if (!image || !image.path) return;
    if (typeof uni !== "undefined" && typeof uni.saveImageToPhotosAlbum === "function") {
      uni.saveImageToPhotosAlbum({ filePath: image.path, success: () => wx.showToast({ title: "已保存到相册", icon: "success" }), fail: (error) => wx.showToast({ title: (error && error.errMsg) || "保存失败", icon: "none" }) });
    } else {
      wx.showToast({ title: "图片已保存在应用本地", icon: "success" });
    }
  },

  closeDeckBuilder() {
    if (this.data.deckBuilderSaving) {
      return;
    }

    this.setData({
      deckBuilderVisible: false,
    });
  },

  onDeckBuilderKeywordInput(e) {
    this.setData({
      deckBuilderKeyword: e.detail.value,
    });
  },

  clearDeckBuilderKeyword() {
    this.setData({
      deckBuilderKeyword: "",
    });
  },

  formatDeckBuilderSearchResults(results) {
    return (results || []).map((item) => {
      const card = this.cacheCardEntity(item);
      return {
        ...card,
        displayName: getCardDisplayNameByFormat(card, this.getSelectedMatchFormat()),
        imageSrc: getResolvedCardImageSrc(card),
        typeText: Array.isArray(card.types) ? card.types.join(" / ") : "",
        metaText: [
          Array.isArray(card.types) ? card.types.join(" / ") : "",
          card.race || "",
          card.attribute || "",
        ].filter(Boolean).join(" · "),
        statText:
          card.atk !== null && card.atk !== undefined
            ? `ATK ${card.atk}${card.def !== null && card.def !== undefined ? ` / DEF ${card.def}` : ""}`
            : "",
      };
    });
  },

  async searchDeckBuilderCards() {
    const keyword = String(this.data.deckBuilderKeyword || "").trim();
    if (!keyword) {
      this.setData({
        deckBuilderSearchKeywordApplied: "",
        deckBuilderSearchHasMore: false,
        deckBuilderSearchPageNum: 0,
        deckBuilderSearchResults: [],
      });
      return;
    }

    this.setData({
      deckBuilderSearchLoading: true,
    });

    try {
      const searchParams = {
        keyword,
        pageNum: 1,
        pageSize: this.data.deckBuilderSearchPageSize || 20,
      };
      const response = await this.loadCachedResource({
        resource: "cardSearch",
        params: searchParams,
        // 本地卡库可在当前会话中完成同步，不能复用同步前的在线搜索缓存。
        force: true,
        request: () => this.callApi("/card/search", searchParams),
      });
      this.setData({
        deckBuilderSearchKeywordApplied: keyword,
        deckBuilderSearchHasMore: !!(response && response.hasMore),
        deckBuilderSearchPageNum: response && response.pageNum ? response.pageNum : 1,
        deckBuilderSearchResults: this.formatDeckBuilderSearchResults(
          (response && response.list) || []
        ),
      });
      this.refreshDeckBuilderSearchResultImages().catch((error) => {
        console.error("refreshDeckBuilderSearchResultImages failed =>", error);
      });
    } catch (error) {
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    } finally {
      this.setData({
        deckBuilderSearchLoading: false,
      });
    }
  },

  onDeckBuilderSearchConfirm() {
    this.searchDeckBuilderCards();
  },

  async loadMoreDeckBuilderCards() {
    if (
      this.data.deckBuilderSearchLoading ||
      this.data.deckBuilderSearchLoadingMore ||
      !this.data.deckBuilderSearchHasMore
    ) {
      return;
    }

    const keyword = String(
      this.data.deckBuilderSearchKeywordApplied || this.data.deckBuilderKeyword || ""
    ).trim();
    if (!keyword) {
      return;
    }

    this.setData({
      deckBuilderSearchLoadingMore: true,
    });

    try {
      const nextPageNum = Number(this.data.deckBuilderSearchPageNum || 0) + 1;
      const searchParams = {
        keyword,
        pageNum: nextPageNum,
        pageSize: this.data.deckBuilderSearchPageSize || 20,
      };
      const response = await this.loadCachedResource({
        resource: "cardSearch",
        params: searchParams,
        force: true,
        request: () => this.callApi("/card/search", searchParams),
      });
      const appendedResults = this.formatDeckBuilderSearchResults(
        (response && response.list) || []
      );
      this.setData({
        deckBuilderSearchHasMore: !!(response && response.hasMore),
        deckBuilderSearchPageNum: response && response.pageNum ? response.pageNum : nextPageNum,
        deckBuilderSearchResults: (this.data.deckBuilderSearchResults || []).concat(appendedResults),
      });
      this.refreshDeckBuilderSearchResultImages().catch((error) => {
        console.error("refreshDeckBuilderSearchResultImages failed =>", error);
      });
    } catch (error) {
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    } finally {
      this.setData({
        deckBuilderSearchLoadingMore: false,
      });
    }
  },

  async warmCardImageCache(card) {
  },

  cloneDeckBuilderSections() {
    return {
      main: (this.data.deckBuilderSections.main || []).map((item) => ({
        ...item,
        card: {
          ...item.card,
        },
      })),
      extra: (this.data.deckBuilderSections.extra || []).map((item) => ({
        ...item,
        card: {
          ...item.card,
        },
      })),
      side: (this.data.deckBuilderSections.side || []).map((item) => ({
        ...item,
        card: {
          ...item.card,
        },
      })),
    };
  },

  getDeckBuilderPrimarySection(card) {
    return isExtraDeckMonsterCard(card) ? "extra" : "main";
  },

  getDeckBuilderCardCountInSection(sections, section, cardId) {
    const target = (sections[section] || []).find((item) => String(item.cardId) === String(cardId));
    return target ? Number(target.count || 1) : 0;
  },

  openDeckBuilderCardAction(card) {
    if (!card) {
      return;
    }
    const hydratedCard = this.cacheCardEntity(card);
    const sections = this.data.deckBuilderSections || createEmptyDeckSections();
    const primarySection = this.getDeckBuilderPrimarySection(hydratedCard);
    const mainCount = this.getDeckBuilderCardCountInSection(
      sections,
      primarySection,
      hydratedCard.cardId
    );
    const sideCount = this.getDeckBuilderCardCountInSection(
      sections,
      "side",
      hydratedCard.cardId
    );
    this.setData({
      deckBuilderActionVisible: true,
      deckBuilderActionCard: {
        ...hydratedCard,
        displayName: getCardDisplayNameByFormat(hydratedCard, this.getSelectedMatchFormat()),
        imageSrc: getResolvedCardImageSrc(hydratedCard),
      },
      deckBuilderActionMainCount: mainCount,
      deckBuilderActionSideCount: sideCount,
      deckBuilderActionPrimarySection: primarySection,
    });
  },

  closeDeckBuilderCardAction() {
    this.setData({
      deckBuilderActionVisible: false,
      deckBuilderActionCard: null,
      deckBuilderActionMainCount: 0,
      deckBuilderActionSideCount: 0,
      deckBuilderActionPrimarySection: "main",
    });
  },

  closeCardDetail() {
    this.setData({
      cardDetailVisible: false,
      cardDetailLoading: false,
      cardDetailData: null,
    });
  },

  async showEditHistory(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) {
      return;
    }
    const record = (this.data.records || []).find((item) => String(item.id) === String(id));
    const meta = record ? `${record.deckName} · ${record.metaText}` : "";
    this.setData({
      editHistoryVisible: true,
      editHistoryLoading: true,
      editHistoryItems: [],
      editHistoryRecordMeta: meta,
    });
    try {
      let logs = await this.loadCachedResource({
        resource: "editLogs",
        params: { id },
        request: () => this.callApi("/match/record/edit-logs", { id }),
      }) || [];
      // 校验缓存：日志条数应与战绩的 editCount 一致，不一致则强制刷新
      const recordEditCount = record ? (record.editCount || 0) : 0;
      if (logs.length !== recordEditCount && recordEditCount > 0) {
        logs = await this.loadCachedResource({
          resource: "editLogs",
          params: { id },
          force: true,
          request: () => this.callApi("/match/record/edit-logs", { id }),
        }) || [];
      }
      this.setData({
        editHistoryItems: logs.map((item) => ({
          ...item,
          changedFields: formatEditHistoryMatchTypeIds(
            item.changedFields,
            this.data.matchTypes
          ),
        })),
      });
    } catch (error) {
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    } finally {
      this.setData({
        editHistoryLoading: false,
      });
    }
  },

  closeEditHistory() {
    this.setData({
      editHistoryVisible: false,
      editHistoryItems: [],
      editHistoryRecordMeta: "",
    });
  },

  noop() {
    // Prevent overlay tap from closing sheet
  },

  onSelectDeckBuilderSearchCard(e) {
    const cardId = String(e.currentTarget.dataset.cardId || "");
    if (!cardId) {
      return;
    }
    const selectedCard = (this.data.deckBuilderSearchResults || []).find(
      (item) => String(item.cardId) === cardId
    );
    if (!selectedCard) {
      return;
    }
    this.openDeckBuilderCardAction(selectedCard);
  },

  onSelectDeckBuilderExistingCard(e) {
    const { cardId, section } = e.currentTarget.dataset;
    if (!cardId || !section) {
      return;
    }
    const target = (this.data.deckBuilderSections[section] || []).find(
      (item) => String(item.cardId) === String(cardId)
    );
    if (!target) {
      return;
    }
    this.openDeckBuilderCardAction(target.card);
  },

  onPreviewDeckBuilderActionCard() {
    const card = this.data.deckBuilderActionCard;
    if (!card || !card.cardId) {
      return;
    }
    this.closeDeckBuilderCardAction();
    this.openCardDetail(card.cardId);
  },

  async openCardDetail(cardId) {
    if (!cardId) {
      return;
    }
    this.setData({
      cardDetailVisible: true,
      cardDetailLoading: true,
      cardDetailData: null,
    });
    try {
      const cachedCardEntity = this.getCachedCardEntity(cardId);
      const detail = (cachedCardEntity && cachedCardEntity.desc)
        ? cachedCardEntity
        : await this.loadCachedResource({
        resource: "cardDetail",
        params: {
          cardId,
        },
        request: () =>
          this.callApi("/card/get", {
            cardId,
          }),
        });
      const cachedDetail = this.cacheCardEntity(detail);
      const detailImage = await this.callApi("/card/image/detail", { cardId });
      const localizedDetail = {
        ...cachedDetail,
        imageSrc: detailImage && detailImage.imageUrl
          ? detailImage.imageUrl
          : cachedDetail.fullImageUrl || cachedDetail.thumbUrl || "",
      };
      this.setData({
        cardDetailData: formatCardDetailView(localizedDetail, this.getSelectedMatchFormat()),
      });
    } catch (error) {
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
      this.closeCardDetail();
    } finally {
      this.setData({
        cardDetailLoading: false,
      });
    }
  },

  onPreviewCardDetailImage() {
    const card = this.data.cardDetailData;
    if (!card || !card.imageSrc) {
      return;
    }
    wx.previewImage({
      current: card.imageSrc,
      urls: [card.imageSrc],
    });
  },

  changeDeckBuilderActionCount(e) {
    const field = String(e.currentTarget.dataset.field || "");
    const delta = Number(e.currentTarget.dataset.delta || 0);
    if (!field || !delta) {
      return;
    }
    const card = this.data.deckBuilderActionCard;
    if (!card) {
      return;
    }
    const nextMainCount =
      field === "main"
        ? Math.max(0, Number(this.data.deckBuilderActionMainCount || 0) + delta)
        : Number(this.data.deckBuilderActionMainCount || 0);
    const nextSideCount =
      field === "side"
        ? Math.max(0, Number(this.data.deckBuilderActionSideCount || 0) + delta)
        : Number(this.data.deckBuilderActionSideCount || 0);
    const totalCount = nextMainCount + nextSideCount;
    const cardName = getDeckBuilderCardName(card);
    if (totalCount > 3) {
      wx.showToast({
        title: `${cardName} 总数不能超过 3 张`,
        icon: "none",
      });
      return;
    }
    this.setData({
      deckBuilderActionMainCount: nextMainCount,
      deckBuilderActionSideCount: nextSideCount,
    });
  },

  applyDeckBuilderCardCount(nextSections, section, card, count) {
    const nextList = (nextSections[section] || []).filter(
      (item) => String(item.cardId) !== String(card.cardId)
    );
    if (count > 0) {
      nextList.push({
        cardId: card.cardId,
        count,
        section,
        card: {
          ...card,
          imageSrc: card.imageSrc || card.cachedImageFileId || card.thumbUrl || "",
        },
      });
    }
    nextSections[section] = nextList;
  },

  confirmDeckBuilderCardAction() {
    const card = this.data.deckBuilderActionCard;
    if (!card) {
      return;
    }
    const primarySection = this.data.deckBuilderActionPrimarySection || "main";
    const nextSections = this.cloneDeckBuilderSections();
    this.applyDeckBuilderCardCount(
      nextSections,
      primarySection,
      card,
      Number(this.data.deckBuilderActionMainCount || 0)
    );
    this.applyDeckBuilderCardCount(
      nextSections,
      "side",
      card,
      this.getSelectedMatchFormat() === "ocg"
        ? Number(this.data.deckBuilderActionSideCount || 0)
        : 0
    );

    const deckRuleMessage = validateDeckBuilderSections(
      nextSections,
      this.getSelectedMatchFormat()
    );
    if (deckRuleMessage) {
      wx.showToast({
        title: deckRuleMessage,
        icon: "none",
      });
      return;
    }

    this.setData({
      deckBuilderSections: nextSections,
      ...getDeckBuilderViewState(nextSections, this.getSelectedMatchFormat()),
    });
    this.closeDeckBuilderCardAction();
    this.warmCardImageCache(card);
    this.refreshDeckBuilderSectionImages().catch((error) => {
      console.error("refreshDeckBuilderSectionImages failed =>", error);
    });
  },

  async saveDeckBuilder() {
    if (this.data.deckBuilderSaving) {
      return;
    }

    const deckId = this.data.deckBuilderDeckId;
    if (!deckId) {
      return;
    }

    if ((this.data.deckBuilderImages || []).length > MAX_DECK_IMAGES) {
      wx.showToast({
        title: "每个卡组最多保存 3 张图片",
        icon: "none",
      });
      return;
    }

    this.setData({
      deckBuilderSaving: true,
    });

    try {
      const matchFormat = this.getSelectedMatchFormat();
      await this.callApi("/deck/images/save", {
        matchFormat,
        deckId,
        images: this.data.deckBuilderImages,
      });
      this.setLocalCache(
        "deckImages",
        {
          matchFormat,
          deckId,
        },
        {
          deckId,
          deckName: this.data.deckBuilderDeckName || "",
          images: this.data.deckBuilderImages,
        }
      );
      wx.showToast({
        title: "已保存",
        icon: "success",
      });
      this.setData({
        deckBuilderVisible: false,
      });
    } catch (error) {
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    } finally {
      this.setData({
        deckBuilderSaving: false,
      });
    }
  },

  async deleteRecord(e) {
    const { id, name } = e.currentTarget.dataset;
    if (!id) {
      return;
    }

    const confirmResult = await this.showConfirmModal({
      title: "永久删除战绩",
      content: `确认永久删除这条战绩吗？${name ? `\n${name}` : ""}`,
    });

    if (!confirmResult.confirm) {
      return;
    }

    try {
      wx.showLoading({
        title: "删除中",
      });
      await this.callApi("/match/record/remove", { id });
      const matchFormat = this.getSelectedMatchFormat();
      if (this.hasLocalCacheEntry("allRecords", { matchFormat })) {
        this.patchLocalAllRecords(matchFormat, (records) =>
          records.filter((item) => String(item.id || "") !== String(id))
        );
        this.clearLocalCaches(["records", "statistics", "decks", "adminOverviewStats", "editLogs"]);
      } else {
        this.invalidateRecordRelatedCaches();
      }
      wx.hideLoading();
      wx.showToast({
        title: "已删除",
        icon: "success",
      });
      await this.refreshViewFromLocalCaches({
        keepSelection: true,
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    }
  },

  async openCreateRecord() {
    if (!this.data.decks.length) {
      wx.showToast({
        title: "请先新增卡组",
        icon: "none",
      });
      return;
    }

    try {
      const createRecordLoaders = [this.loadMatchTypes(), this.loadMonths()];
      if (this.getSelectedMatchFormat() === "md") {
        createRecordLoaders.push(this.loadMdAccounts());
      }
      await Promise.all(createRecordLoaders);
    } catch (error) {
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    }

    if (!this.data.monthItems.length) {
      wx.showToast({
        title: "请先在设置里新增月份",
        icon: "none",
      });
      return;
    }

    const hasSidebarDeckSelection = this.data.selectedDeckId !== "all";
    const defaultDeckId = hasSidebarDeckSelection
      ? this.data.selectedDeckId
      : this.data.decks[0].id;

    const recordMatchTypeOptions =
      this.data.recordMatchTypeOptions && this.data.recordMatchTypeOptions.length
        ? this.data.recordMatchTypeOptions
        : buildRecordMatchTypeOptions([], this.getSelectedMatchFormat());
    const draft = this.loadRecordDraft(this.getSelectedMatchFormat()) || buildDefaultRecordDraft(
      this.getSelectedMatchFormat()
    );
    const draftMatchTypeIndex = recordMatchTypeOptions.findIndex(
      (item) => String(item.id || "") === String(draft.recordMatchTypeId || "")
    );
    const recordMatchTypeIndex =
      draftMatchTypeIndex >= 0
        ? draftMatchTypeIndex
        : getPreferredMatchTypeIndex(recordMatchTypeOptions, this.getSelectedMatchFormat());
    const monthItems = this.data.monthItems || [];
    const recordMonthIndex = getPreferredMonthIndex(monthItems);
    const selectedMonth = monthItems[recordMonthIndex] || {
      itemLabel: getCurrentMonth(),
      itemValue: getCurrentMonth(),
    };
    const draftDeckExists = (this.data.decks || []).some(
      (item) => String(item.id) === String(draft.recordDeckId || "")
    );
    const restoredDeckId = hasSidebarDeckSelection
      ? this.data.selectedDeckId
      : (draftDeckExists ? draft.recordDeckId : defaultDeckId);
    const shouldShowDraftRestoredToast = Boolean(
      (!hasSidebarDeckSelection && draft.recordDeckId) ||
      draft.recordOpponentDeck ||
      draft.recordRemark ||
      draft.recordMatchTypeId ||
      Number.isInteger(draft.recordStarterCount) ||
      Number.isInteger(draft.recordHandTrapCount) ||
      Number.isInteger(draft.recordBrickCount) ||
      (Array.isArray(draft.recordOcgGames) && draft.recordOcgGames.some((item) =>
        item &&
        typeof item === "object" &&
        (
          item.value ||
          Number.isInteger(item.starterCount) ||
          Number.isInteger(item.handTrapCount) ||
          Number.isInteger(item.brickCount)
        )
      ))
    );
    const recordDayOptions = this.data.recordDayOptions || buildRecordDayOptions();
    const restoredDayIndex = getRecordDayIndexByValue(getCurrentDayLabel(), recordDayOptions);
    const restoredOcgGames = buildDefaultOcgGames().map((item, index) => {
      const restoredStarterCount = Array.isArray(draft.recordOcgGames) &&
        draft.recordOcgGames[index] &&
        typeof draft.recordOcgGames[index] === "object" &&
        Number.isInteger(draft.recordOcgGames[index].starterCount)
        ? draft.recordOcgGames[index].starterCount
        : null;
      const restoredHandTrapCount = Array.isArray(draft.recordOcgGames) &&
        draft.recordOcgGames[index] &&
        typeof draft.recordOcgGames[index] === "object" &&
        Number.isInteger(draft.recordOcgGames[index].handTrapCount)
        ? draft.recordOcgGames[index].handTrapCount
        : null;
      const restoredBrickCount = Array.isArray(draft.recordOcgGames) &&
        draft.recordOcgGames[index] &&
        typeof draft.recordOcgGames[index] === "object" &&
        Number.isInteger(draft.recordOcgGames[index].brickCount)
        ? draft.recordOcgGames[index].brickCount
        : null;
      return {
        ...item,
        value: Array.isArray(draft.recordOcgGames)
          ? (typeof draft.recordOcgGames[index] === "object"
              ? (draft.recordOcgGames[index].value || "")
              : (draft.recordOcgGames[index] || ""))
          : "",
        starterCount: restoredStarterCount,
        handTrapCount: restoredHandTrapCount,
        brickCount: restoredBrickCount,
        starterCountIndex: getRecordMetricIndex(restoredStarterCount),
        handTrapCountIndex: getRecordMetricIndex(restoredHandTrapCount),
        brickCountIndex: getRecordMetricIndex(restoredBrickCount),
      };
    });
    const recordShowAllOptionalFields = hasHiddenRecordOptionalFieldValue(
      {
        ...draft,
        recordOcgGames: restoredOcgGames,
      },
      this.data.recordFieldVisibility
    );

    this.setData({
      recordPopupVisible: true,
      recordPopupMode: "create",
      recordEditingId: "",
      recordDeckId: restoredDeckId,
      recordMonth: selectedMonth.itemValue,
      recordMonthIndex,
      currentRecordMonthLabel: selectedMonth.itemLabel,
      recordDayIndex: restoredDayIndex,
      currentRecordDayLabel:
        (recordDayOptions[restoredDayIndex] || RECORD_DAY_OPTION_EMPTY).itemLabel,
      recordCoinResult:
        draft.recordCoinResult === 1 || draft.recordCoinResult === 0
          ? draft.recordCoinResult
          : 1,
      recordMatchResult: Number.isInteger(draft.recordMatchResult)
        ? draft.recordMatchResult
        : 1,
      recordOcgGames: restoredOcgGames,
      recordOcgSummaryLabel: getOcgMatchSummaryLabel(restoredOcgGames),
      recordStarterCount: Number.isInteger(draft.recordStarterCount)
        ? draft.recordStarterCount
        : null,
      recordHandTrapCount: Number.isInteger(draft.recordHandTrapCount)
        ? draft.recordHandTrapCount
        : null,
      recordBrickCount: Number.isInteger(draft.recordBrickCount)
        ? draft.recordBrickCount
        : null,
      recordStarterCountIndex: getRecordMetricIndex(draft.recordStarterCount),
      recordHandTrapCountIndex: getRecordMetricIndex(draft.recordHandTrapCount),
      recordBrickCountIndex: getRecordMetricIndex(draft.recordBrickCount),
      recordOpponentDeck: normalizeOpponentDeckInput(draft.recordOpponentDeck),
      recordFailureReasons: Array.isArray(draft.recordFailureReasons) ? draft.recordFailureReasons.slice(0, 3) : [],
      recordFailureReason: "",
      recordFailureReasonVisible: shouldShowFailureReasonField(
        this.getSelectedMatchFormat(),
        draft.recordMatchResult,
        getOcgMatchSummaryLabel(restoredOcgGames)
      ),
      recordOpponentDeckPickerVisible: false,
      recordOpponentDeckPickerLoading: false,
      recordOpponentDeckInputFocused: false,
      recordOpponentDeckHistoryItems: [],
      recordOpponentDeckDeckItems: buildRecordOpponentDeckDeckItems(this.data.decks),
      recordFailureReasonPickerVisible: false,
      recordFailureReasonPickerLoading: false,
      recordFailureReasonInputFocused: false,
      recordFailureReasonHistoryItems: [],
      recordShowAllOptionalFields,
      recordRemark: draft.recordRemark || "",
      recordMatchTypeIndex,
      currentRecordMatchTypeLabel:
        (recordMatchTypeOptions[recordMatchTypeIndex] || {
          itemLabel: getDefaultMatchTypeLabel(this.getSelectedMatchFormat()),
        }).itemLabel,
      recordMatchTypeOptions,
      recordDeckListCollapsed: true,
      recordDeckListOverflow: false,
    }, () => {
      this.persistRecordDraft();
      this.refreshRecordDeckListOverflow();
      if (draft && shouldShowDraftRestoredToast) {
        wx.showToast({
          title: "已恢复暂存",
          icon: "none",
        });
      }
    });
  },

  async openEditRecord(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || this.data.recordSaving) {
      return;
    }

    const record = (this.data.records || []).find((item) => String(item.id) === String(id));
    if (!record) {
      return;
    }

    try {
      const editRecordLoaders = [this.loadMatchTypes(), this.loadMonths()];
      if (this.getSelectedMatchFormat() === "md") {
        editRecordLoaders.push(this.loadMdAccounts());
      }
      await Promise.all(editRecordLoaders);
    } catch (error) {
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
      return;
    }

    const recordMatchTypeOptions =
      this.data.recordMatchTypeOptions && this.data.recordMatchTypeOptions.length
        ? this.data.recordMatchTypeOptions
        : buildRecordMatchTypeOptions([], this.getSelectedMatchFormat());
    const monthItems = this.data.monthItems || [];
    const recordMonthIndex = monthItems.findIndex(
      (item) => String(item.id || "") === String(record.matchMonthId || "")
    );
    const selectedMonth =
      monthItems[recordMonthIndex >= 0 ? recordMonthIndex : getPreferredMonthIndex(monthItems)] || {
        itemLabel: getCurrentMonth(),
        itemValue: getCurrentMonth(),
      };
    const recordDayOptions = this.data.recordDayOptions || buildRecordDayOptions();
    const recordDayIndex = getRecordDayIndexByValue(record.dayOfWeek, recordDayOptions);
    const recordMatchTypeIndex = Math.max(
      recordMatchTypeOptions.findIndex(
        (item) => String(item.id || "") === String(record.matchTypeId || "")
      ),
      0
    );
    const recordOcgGames = buildDefaultOcgGames().map((item, index) => {
      const restoredStarterCount = Array.isArray(record.ocgStarterCounts) && Number.isInteger(record.ocgStarterCounts[index])
        ? record.ocgStarterCounts[index]
        : (index === 0 &&
            !(Array.isArray(record.ocgStarterCounts) && record.ocgStarterCounts.length) &&
            Number.isInteger(record.starterCount)
            ? record.starterCount
            : null);
      const restoredHandTrapCount = Array.isArray(record.ocgHandTrapCounts) && Number.isInteger(record.ocgHandTrapCounts[index])
        ? record.ocgHandTrapCounts[index]
        : (index === 0 &&
            !(Array.isArray(record.ocgHandTrapCounts) && record.ocgHandTrapCounts.length) &&
            Number.isInteger(record.handTrapCount)
            ? record.handTrapCount
            : null);
      const restoredBrickCount = Array.isArray(record.ocgBrickCounts) && Number.isInteger(record.ocgBrickCounts[index])
        ? record.ocgBrickCounts[index]
        : (index === 0 &&
            !(Array.isArray(record.ocgBrickCounts) && record.ocgBrickCounts.length) &&
            Number.isInteger(record.brickCount)
            ? record.brickCount
            : null);
      return {
        ...item,
        value: Array.isArray(record.ocgGameResults) ? record.ocgGameResults[index] || "" : "",
        starterCount: restoredStarterCount,
        handTrapCount: restoredHandTrapCount,
        brickCount: restoredBrickCount,
        starterCountIndex: getRecordMetricIndex(restoredStarterCount),
        handTrapCountIndex: getRecordMetricIndex(restoredHandTrapCount),
        brickCountIndex: getRecordMetricIndex(restoredBrickCount),
      };
    });
    const recordShowAllOptionalFields = hasHiddenRecordOptionalFieldValue(
      {
        ...record,
        recordOcgGames,
      },
      this.data.recordFieldVisibility
    );

    this.setData({
      recordPopupVisible: true,
      recordPopupMode: "edit",
      recordEditingId: id,
      recordDeckId: record.deckId || "",
      recordMonth: selectedMonth.itemValue,
      recordMonthIndex: recordMonthIndex >= 0 ? recordMonthIndex : getPreferredMonthIndex(monthItems),
      currentRecordMonthLabel: selectedMonth.itemLabel,
      recordDayIndex,
      currentRecordDayLabel:
        (recordDayOptions[recordDayIndex] || RECORD_DAY_OPTION_EMPTY).itemLabel,
      recordCoinResult: record.coinResult === 1 || record.coinResult === 0 ? record.coinResult : 1,
      recordMatchResult: Number.isInteger(record.matchResult) ? record.matchResult : 1,
      recordOcgGames,
      recordOcgSummaryLabel: getOcgMatchSummaryLabel(recordOcgGames),
      recordStarterCount: Number.isInteger(record.starterCount) ? record.starterCount : null,
      recordHandTrapCount: Number.isInteger(record.handTrapCount) ? record.handTrapCount : null,
      recordBrickCount: Number.isInteger(record.brickCount) ? record.brickCount : null,
      recordStarterCountIndex: getRecordMetricIndex(record.starterCount),
      recordHandTrapCountIndex: getRecordMetricIndex(record.handTrapCount),
      recordBrickCountIndex: getRecordMetricIndex(record.brickCount),
      recordOpponentDeck: normalizeOpponentDeckInput(record.opponentDeck),
      recordFailureReasons: Array.isArray(record.failureReasons) ? record.failureReasons.slice(0, 3) : [],
      recordFailureReason: "",
      recordFailureReasonVisible: shouldShowFailureReasonField(
        record.matchFormat,
        record.matchResult,
        getOcgMatchSummaryLabel(recordOcgGames)
      ),
      recordOpponentDeckPickerVisible: false,
      recordOpponentDeckPickerLoading: false,
      recordOpponentDeckInputFocused: false,
      recordOpponentDeckHistoryItems: [],
      recordOpponentDeckDeckItems: buildRecordOpponentDeckDeckItems(this.data.decks),
      recordFailureReasonPickerVisible: false,
      recordFailureReasonPickerLoading: false,
      recordFailureReasonInputFocused: false,
      recordFailureReasonHistoryItems: [],
      recordShowAllOptionalFields,
      recordRemark: record.remark || "",
      recordMatchTypeIndex,
      currentRecordMatchTypeLabel:
        (recordMatchTypeOptions[recordMatchTypeIndex] || {
          itemLabel: getDefaultMatchTypeLabel(this.getSelectedMatchFormat()),
        }).itemLabel,
      recordMatchTypeOptions,
      recordDeckListCollapsed: true,
      recordDeckListOverflow: false,
    }, () => {
      this.refreshRecordDeckListOverflow();
    });
  },

  closeCreateRecord() {
    if (this.data.recordSaving) {
      return;
    }

    this.dismissRecordOpponentDeckInput();
    this.setData({
      recordPopupVisible: false,
      recordPopupMode: "create",
      recordEditingId: "",
      recordOpponentDeckPickerVisible: false,
      recordOpponentDeckPickerLoading: false,
      recordOpponentDeckInputFocused: false,
      recordFailureReason: "",
      recordFailureReasonPickerVisible: false,
      recordFailureReasonPickerLoading: false,
      recordFailureReasonInputFocused: false,
      recordFailureReasonHistoryItems: [],
      recordShowAllOptionalFields: false,
      recordDeckListCollapsed: true,
      recordDeckListOverflow: false,
    });
  },

  onRecordDeckChange(e) {
    const recordDeckId = e.currentTarget.dataset.id;
    this.setRecordDraftFields({
      recordDeckId,
    });
  },

  onRecordMonthChange(e) {
    const recordMonthIndex = Number(e.detail.value || 0);
    const selectedMonth = (this.data.monthItems || [])[recordMonthIndex] || {
      itemLabel: getCurrentMonth(),
      itemValue: getCurrentMonth(),
    };

    this.setRecordDraftFields({
      recordMonthIndex,
      currentRecordMonthLabel: selectedMonth.itemLabel,
      recordMonth: selectedMonth.itemValue,
    });
  },

  onRecordRemarkInput(e) {
    this.setRecordDraftFields({
      recordRemark: e.detail.value,
    });
  },

  onRecordFailureReasonInput(e) {
    this.setData({ recordFailureReason: normalizeFailureReasonInput(e.detail.value) });
  },

  onRecordFailureReasonFocus() {
    this.setData({ recordFailureReasonInputFocused: true });
  },

  onRecordFailureReasonBlur() {
    if (this.data.recordFailureReasonInputFocused) {
      this.setData({ recordFailureReasonInputFocused: false });
    }
  },

  dismissRecordFailureReasonInput() {
    if (this.data.recordFailureReasonInputFocused) {
      this.setData({ recordFailureReasonInputFocused: false });
    }
    if (typeof wx.hideKeyboard === "function") {
      try { wx.hideKeyboard({}); } catch (error) { console.error("hideKeyboard failed =>", error); }
    }
  },

  addFailureReasonToRecord(value) {
    const name = normalizeFailureReasonInput(value).trim();
    if (!name) {
      wx.showToast({ title: "请输入失败原因", icon: "none" });
      return false;
    }
    const current = Array.isArray(this.data.recordFailureReasons) ? this.data.recordFailureReasons.slice() : [];
    if (current.includes(name)) {
      this.setData({ recordFailureReason: "" });
      return true;
    }
    if (current.length >= 3) {
      wx.showToast({ title: "最多选择 3 个失败原因", icon: "none" });
      return false;
    }
    this.setRecordDraftFields({ recordFailureReasons: current.concat(name), recordFailureReason: "" });
    return true;
  },

  addRecordFailureReason() {
    this.addFailureReasonToRecord(this.data.recordFailureReason);
  },

  async openRecordFailureReasonPicker() {
    if (this.data.recordFailureReasonPickerLoading) return;
    this.dismissRecordFailureReasonInput();
    this.setData({ recordFailureReasonPickerLoading: true });
    try {
      const allRecords = await this.loadAllRecordsForMatchFormat(this.getSelectedMatchFormat());
      if (!this.data.recordPopupVisible) return;
      this.setData({ recordFailureReasonPickerVisible: true, recordFailureReasonHistoryItems: buildRecordFailureReasonHistoryItems(allRecords) });
    } catch (error) {
      wx.showToast({ title: this.getErrorMessage(error), icon: "none" });
    } finally {
      this.setData({ recordFailureReasonPickerLoading: false });
    }
  },

  closeRecordFailureReasonPicker() {
    this.dismissRecordFailureReasonInput();
    this.setData({ recordFailureReasonPickerVisible: false });
  },

  onSelectRecordFailureReasonSuggestion(e) {
    if (this.addFailureReasonToRecord(e.currentTarget.dataset.value)) this.closeRecordFailureReasonPicker();
  },

  toggleRecordFailureReason(e) {
    const name = String(e.currentTarget.dataset.name || "").trim();
    if (!name) return;
    const current = Array.isArray(this.data.recordFailureReasons) ? this.data.recordFailureReasons.slice() : [];
    const index = current.indexOf(name);
    if (index >= 0) current.splice(index, 1);
    else if (current.length < 3) current.push(name);
    else { wx.showToast({ title: "最多选择 3 个失败原因", icon: "none" }); return; }
    this.setRecordDraftFields({ recordFailureReasons: current });
  },

  toggleRecordFailureReasons(e) {
    const id = String(e.currentTarget.dataset.id || "");
    const records = (this.data.records || []).map((item) => String(item.id) === id ? { ...item, failureReasonsExpanded: !item.failureReasonsExpanded } : item);
    this.setData({ records });
  },

  showFailureReasonRules() {
    wx.showModal({
      title: "失败原因规则",
      content: "可选择多个失败原因，最多 3 个，每项最多 10 字",
      showCancel: false,
    });
  },

  onRecordOpponentDeckInput(e) {
    this.setRecordDraftFields({
      recordOpponentDeck: normalizeOpponentDeckInput(e.detail.value),
    });
  },

  openRecordDayCalendar() {
    const recordDayOptions = this.data.recordDayOptions || buildRecordDayOptions();
    this.setData({
      recordDayCalendarVisible: true,
      recordDayCalendarMonth: this.data.recordMonth,
      recordDayCalendarDays: buildRecordDayCalendarCells(
        this.data.recordMonth,
        (recordDayOptions[this.data.recordDayIndex] || RECORD_DAY_OPTION_EMPTY).itemValue
      ),
    });
  },

  closeRecordDayCalendar() {
    this.setData({
      recordDayCalendarVisible: false,
    });
  },

  onSelectRecordDayCalendarDay(e) {
    const dayValue = String(e.currentTarget.dataset.value || "");
    if (!dayValue) {
      return;
    }
    const recordDayOptions = this.data.recordDayOptions || buildRecordDayOptions();
    const recordDayIndex = getRecordDayIndexByValue(dayValue, recordDayOptions);
    this.setRecordDraftFields({
      recordDayIndex,
      currentRecordDayLabel:
        (recordDayOptions[recordDayIndex] || RECORD_DAY_OPTION_EMPTY).itemLabel,
    });
    this.closeRecordDayCalendar();
  },

  onClearRecordDayCalendar() {
    this.setRecordDraftFields({
      recordDayIndex: 0,
      currentRecordDayLabel: RECORD_DAY_OPTION_EMPTY.itemLabel,
    });
    this.closeRecordDayCalendar();
  },

  onRecordDayChange(e) {
    const recordDayIndex = Number(e.detail.value || 0);
    const selectedDayOption =
      (this.data.recordDayOptions || [])[recordDayIndex] || RECORD_DAY_OPTION_EMPTY;
    this.setRecordDraftFields({
      recordDayIndex,
      currentRecordDayLabel: selectedDayOption.itemLabel,
    });
  },

  openRecordMetricPicker(e) {
    const field = String(e.currentTarget.dataset.field || "");
    const rawRoundIndex = e.currentTarget.dataset.index;
    const roundIndex = Number.isInteger(Number(rawRoundIndex)) ? Number(rawRoundIndex) : -1;
    if (!field) {
      return;
    }
    let currentValue = null;
    if (roundIndex >= 0) {
      const game = (this.data.recordOcgGames || [])[roundIndex];
      currentValue = game ? game[field] : null;
    } else {
      currentValue = this.data[field];
    }
    const fieldTitleMap = {
      starterCount: "动点数",
      handTrapCount: "手坑数",
      brickCount: "废件数",
      recordStarterCount: "动点数",
      recordHandTrapCount: "手坑数",
      recordBrickCount: "废件数",
    };
    this.setData({
      recordMetricPickerVisible: true,
      recordMetricPickerField: field,
      recordMetricPickerRoundIndex: roundIndex,
      recordMetricPickerValue: currentValue,
      recordMetricPickerTitle: fieldTitleMap[field] || "指标",
      recordMetricPickerOptions: RECORD_METRIC_OPTIONS.map((option) => ({
        ...option,
        isSelected:
          currentValue === null
            ? String(option.itemValue || "") === ""
            : Number(option.itemValue) === currentValue,
      })),
    });
  },

  closeRecordMetricPicker() {
    this.setData({
      recordMetricPickerVisible: false,
    });
  },

  onSelectRecordMetricOption(e) {
    const rawValue = String(e.currentTarget.dataset.value || "");
    const metricValue = rawValue === "" ? null : Number(rawValue);
    const field = this.data.recordMetricPickerField;
    const roundIndex = this.data.recordMetricPickerRoundIndex;
    this.closeRecordMetricPicker();
    if (!field) {
      return;
    }
    const metricIndex = getRecordMetricIndex(metricValue);
    if (roundIndex >= 0) {
      const recordOcgGames = (this.data.recordOcgGames || buildDefaultOcgGames()).map((item) => ({
        ...item,
      }));
      if (!recordOcgGames[roundIndex]) {
        return;
      }
      recordOcgGames[roundIndex][field] = metricValue;
      recordOcgGames[roundIndex][`${field}Index`] = metricIndex;
      this.setRecordDraftFields({
        recordOcgGames,
      });
      return;
    }
    const indexFieldMap = {
      recordStarterCount: "recordStarterCountIndex",
      recordHandTrapCount: "recordHandTrapCountIndex",
      recordBrickCount: "recordBrickCountIndex",
    };
    const updates = {
      [field]: metricValue,
    };
    const indexField = indexFieldMap[field];
    if (indexField) {
      updates[indexField] = metricIndex;
    }
    this.setRecordDraftFields(updates);
  },

  onRecordMetricPickerChange(e) {
    const field = String(e.currentTarget.dataset.field || "");
    const metricIndex = Number(e.detail.value || 0);
    const selectedOption =
      (this.data.recordMetricOptions || [])[metricIndex] || RECORD_METRIC_OPTIONS[0];
    const metricValue =
      String(selectedOption.itemValue || "") === ""
        ? null
        : Number(selectedOption.itemValue);
    const indexFieldMap = {
      recordStarterCount: "recordStarterCountIndex",
      recordHandTrapCount: "recordHandTrapCountIndex",
      recordBrickCount: "recordBrickCountIndex",
    };
    const updates = {
      [field]: metricValue,
    };
    const indexField = indexFieldMap[field];
    if (indexField) {
      updates[indexField] = metricIndex;
    }
    this.setRecordDraftFields(updates);
  },

  onOcgMetricPickerChange(e) {
    const roundIndex = Number(e.currentTarget.dataset.index);
    const field = String(e.currentTarget.dataset.field || "");
    const metricIndex = Number(e.detail.value || 0);
    const selectedOption =
      (this.data.recordMetricOptions || [])[metricIndex] || RECORD_METRIC_OPTIONS[0];
    const metricValue =
      String(selectedOption.itemValue || "") === ""
        ? null
        : Number(selectedOption.itemValue);
    const recordOcgGames = (this.data.recordOcgGames || buildDefaultOcgGames()).map((item) => ({
      ...item,
    }));
    if (!recordOcgGames[roundIndex]) {
      return;
    }
    recordOcgGames[roundIndex][field] = metricValue;
    recordOcgGames[roundIndex][`${field}Index`] = metricIndex;
    this.setRecordDraftFields({
      recordOcgGames,
    });
  },

  onRecordMatchTypeChange(e) {
    const recordMatchTypeIndex = Number(e.detail.value || 0);
    const currentRecordMatchTypeLabel =
      (this.data.recordMatchTypeOptions[recordMatchTypeIndex] || {
        itemLabel: getDefaultMatchTypeLabel(this.getSelectedMatchFormat()),
      }).itemLabel;

    this.setRecordDraftFields({
      recordMatchTypeIndex,
      currentRecordMatchTypeLabel,
    });
  },

  openRecordMatchTypePicker() {
    const options = this.data.recordMatchTypeOptions || [];
    this.setData({
      recordMatchTypePickerOptions: options,
      recordMatchTypePickerVisible: true,
    });
  },

  closeRecordMatchTypePicker() {
    this.setData({ recordMatchTypePickerVisible: false });
  },

  onSelectRecordMatchTypeOption(e) {
    const recordMatchTypeIndex = Number(e.currentTarget.dataset.index || 0);
    const selected = (this.data.recordMatchTypeOptions || [])[recordMatchTypeIndex];
    if (!selected) return;
    this.closeRecordMatchTypePicker();
    this.setRecordDraftFields({
      recordMatchTypeIndex,
      currentRecordMatchTypeLabel: selected.itemLabel,
    });
  },

  openStatsMatchTypePicker() {
    this.setData({ statsMatchTypePickerVisible: true });
  },

  closeStatsMatchTypePicker() {
    this.setData({ statsMatchTypePickerVisible: false });
  },

  onSelectStatsMatchTypeOption(e) {
    const matchTypeFilterIndex = Number(e.currentTarget.dataset.index || 0);
    const selected = (this.data.matchTypeFilterOptions || [])[matchTypeFilterIndex] || this.data.matchTypeFilterOptions[0];
    if (!selected) return;
    this.closeStatsMatchTypePicker();
    this.setData({
      matchTypeFilterIndex,
      currentMatchTypeFilterLabel: selected.itemLabel,
      selectedMatchTypeFilterValue: selected.id,
      selectedMatchTypeFilterIds: selected.matchTypeIds || [],
    });
    if (this.data.currentTab === "stats" || this.data.currentTab === "records") {
      this.setData({ contentLoading: true, errorMessage: "" });
      this.loadCurrentTabData().catch((error) => {
        this.setData({ errorMessage: this.getErrorMessage(error), contentLoading: false });
      });
    }
  },

  onToggleRecordField(e) {
    const field = e.currentTarget.dataset.field;
    const value = Number(e.currentTarget.dataset.value);
    if (!field) {
      return;
    }

    this.setRecordDraftFields({
      [field]: value,
      ...(field === "recordMatchResult"
        ? { recordFailureReasonVisible: shouldShowFailureReasonField("md", value, "") }
        : {}),
    });
  },

  onSelectOcgGameResult(e) {
    const roundIndex = Number(e.currentTarget.dataset.index);
    const value = String(e.currentTarget.dataset.value || "");
    const recordOcgGames = (this.data.recordOcgGames || buildDefaultOcgGames()).map((item) => ({
      ...item,
    }));

    if (!recordOcgGames[roundIndex]) {
      return;
    }

    recordOcgGames[roundIndex].value = value;

    this.setRecordDraftFields({
      recordOcgGames,
      recordOcgSummaryLabel: getOcgMatchSummaryLabel(recordOcgGames),
      recordFailureReasonVisible: shouldShowFailureReasonField(
        "ocg",
        null,
        getOcgMatchSummaryLabel(recordOcgGames)
      ),
    });
  },

  increaseOcgStarterCount(e) {
    this.changeOcgGameMetricCount(e, "starterCount");
  },

  decreaseOcgStarterCount(e) {
    this.changeOcgGameMetricCount(e, "starterCount", -1);
  },

  clearOcgStarterCount(e) {
    this.clearOcgGameMetricCount(e, "starterCount");
  },

  increaseStarterCount() {
    this.changeRecordMetricCount("recordStarterCount");
  },

  decreaseStarterCount() {
    this.changeRecordMetricCount("recordStarterCount", -1);
  },

  clearStarterCount() {
    this.clearRecordMetricCount("recordStarterCount");
  },

  increaseHandTrapCount() {
    this.changeRecordMetricCount("recordHandTrapCount");
  },

  decreaseHandTrapCount() {
    this.changeRecordMetricCount("recordHandTrapCount", -1);
  },

  clearHandTrapCount() {
    this.clearRecordMetricCount("recordHandTrapCount");
  },

  increaseBrickCount() {
    this.changeRecordMetricCount("recordBrickCount");
  },

  decreaseBrickCount() {
    this.changeRecordMetricCount("recordBrickCount", -1);
  },

  clearBrickCount() {
    this.clearRecordMetricCount("recordBrickCount");
  },

  increaseOcgHandTrapCount(e) {
    this.changeOcgGameMetricCount(e, "handTrapCount");
  },

  decreaseOcgHandTrapCount(e) {
    this.changeOcgGameMetricCount(e, "handTrapCount", -1);
  },

  clearOcgHandTrapCount(e) {
    this.clearOcgGameMetricCount(e, "handTrapCount");
  },

  increaseOcgBrickCount(e) {
    this.changeOcgGameMetricCount(e, "brickCount");
  },

  decreaseOcgBrickCount(e) {
    this.changeOcgGameMetricCount(e, "brickCount", -1);
  },

  clearOcgBrickCount(e) {
    this.clearOcgGameMetricCount(e, "brickCount");
  },

  changeRecordMetricCount(field, delta = 1) {
    const currentCount = Number.isInteger(this.data[field])
      ? this.data[field]
      : (delta > 0 ? -1 : 0);
    this.setRecordDraftFields({
      [field]: clampRecordMetricCount(currentCount + delta),
    });
  },

  clearRecordMetricCount(field) {
    this.setRecordDraftFields({
      [field]: null,
    });
  },

  changeOcgGameMetricCount(e, field, delta = 1) {
    const roundIndex = Number(e.currentTarget.dataset.index);
    const recordOcgGames = (this.data.recordOcgGames || buildDefaultOcgGames()).map((item) => ({
      ...item,
    }));
    if (!recordOcgGames[roundIndex]) {
      return;
    }
    const currentCount = Number.isInteger(recordOcgGames[roundIndex][field])
      ? recordOcgGames[roundIndex][field]
      : (delta > 0 ? -1 : 0);
    recordOcgGames[roundIndex][field] = clampRecordMetricCount(currentCount + delta);
    this.setRecordDraftFields({
      recordOcgGames,
    });
  },

  clearOcgGameMetricCount(e, field) {
    const roundIndex = Number(e.currentTarget.dataset.index);
    const recordOcgGames = (this.data.recordOcgGames || buildDefaultOcgGames()).map((item) => ({
      ...item,
    }));
    if (!recordOcgGames[roundIndex]) {
      return;
    }
    recordOcgGames[roundIndex][field] = null;
    this.setRecordDraftFields({
      recordOcgGames,
    });
  },

  async saveRecord() {
    if (this.data.recordSaving) {
      return;
    }

    if (!this.data.recordDeckId) {
      wx.showToast({
        title: "请选择卡组",
        icon: "none",
      });
      return;
    }

    this.setData({
      recordSaving: true,
    });

    try {
      const matchFormat = this.getSelectedMatchFormat();
      const existingRecord = this.data.recordPopupMode === "edit"
        ? (this.data.records || []).find(
            (item) => String(item.id || "") === String(this.data.recordEditingId || "")
          )
        : null;
      const selectedMatchType =
        this.data.recordMatchTypeOptions[this.data.recordMatchTypeIndex] || {
          id: "",
        };

      const body = {
        matchFormat,
        matchMonth: this.data.recordMonth.trim(),
        matchMonthId: (() => {
          const selectedMonthId =
            ((this.data.monthItems || [])[this.data.recordMonthIndex] || {}).id || "";
          return String(selectedMonthId).startsWith("local:") ? "" : selectedMonthId;
        })(),
        dayOfWeek: (
          ((this.data.recordDayOptions || [])[this.data.recordDayIndex] || RECORD_DAY_OPTION_EMPTY)
            .itemValue || ""
        ),
        coinResult: this.data.recordCoinResult,
        deckId: this.data.recordDeckId,
        remark: this.data.recordRemark.trim(),
      };

      if (matchFormat === "ocg") {
        const ocgGameResults = (this.data.recordOcgGames || []).map((item) => item.value);
        if (ocgGameResults.some((item) => !item)) {
          throw new Error("请完整记录三局结果");
        }
        body.ocgGameResults = ocgGameResults;
      } else {
        body.matchResult = this.data.recordMatchResult;
        if (this.data.recordPopupMode !== "edit") {
        }
      }

      if (selectedMatchType.id) {
        body.matchType = selectedMatchType.id;
      }

      let saveResult = null;
      if (this.data.recordPopupMode === "edit") {
        await this.callApi("/match/record/update", {
          id: this.data.recordEditingId,
          ...body,
        });
      } else {
        saveResult = await this.callApi("/match/record/save", body);
        this.clearRecordDraft();
      }
      if (this.hasLocalCacheEntry("allRecords", { matchFormat })) {
        const nowText = this.formatClientDateTime(new Date());
        const localRecord = this.buildLocalRecordPayload({
          id:
            this.data.recordPopupMode === "edit"
              ? this.data.recordEditingId
              : ((saveResult && saveResult.id) || ""),
          createTime:
            this.data.recordPopupMode === "edit"
              ? ((existingRecord && existingRecord.createTime) || nowText)
              : ((saveResult && saveResult.createTime) || nowText),
          updateTime:
            this.data.recordPopupMode === "edit"
              ? nowText
              : ((saveResult && saveResult.createTime) || nowText),
          hasEdited: this.data.recordPopupMode === "edit",
          editCount: this.data.recordPopupMode === "edit"
            ? ((existingRecord && existingRecord.editCount || 0) + 1)
            : 0,
        });
        this.patchLocalAllRecords(matchFormat, (records) => {
          const nextRecords = records.filter(
            (item) => String(item.id || "") !== String(localRecord.id || "")
          );
          nextRecords.push(localRecord);
          return nextRecords;
        });
        this.ensureLocalMonthExists(localRecord.matchMonth);
        this.clearLocalCaches(["records", "statistics", "decks", "adminOverviewStats", "editLogs"]);
      } else {
        this.invalidateRecordRelatedCaches();
      }

      wx.showToast({
        title: this.data.recordPopupMode === "edit" ? "已修改" : "已保存",
        icon: "success",
      });

      this.dismissRecordOpponentDeckInput();
      this.setData({
        recordPopupVisible: false,
        recordPopupMode: "create",
        recordEditingId: "",
        recordOpponentDeckPickerVisible: false,
        recordOpponentDeckPickerLoading: false,
        recordOpponentDeckInputFocused: false,
        recordShowAllOptionalFields: false,
      });

      await this.refreshViewFromLocalCaches({
        keepSelection: true,
      });
    } catch (error) {
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    } finally {
      this.setData({
        recordSaving: false,
      });
    }
  },

  async createMatchType() {
    const defaultMatchTypeLabel = getDefaultMatchTypeLabel(this.getSelectedMatchFormat());
    const result = await this.showEditableModal({
      title: "新增对战类型",
      placeholderText: `例如 ${defaultMatchTypeLabel} / 娱乐 / 练习`,
    });

    if (!result.confirm || !result.content || !result.content.trim()) {
      return;
    }

    try {
      wx.showLoading({
        title: "保存中",
      });
      const matchFormat = this.getSelectedMatchFormat();
      await this.callApi("/dict/item/save", {
        dictCode: "match_type",
        matchFormat,
        itemValue: result.content.trim(),
        itemLabel: result.content.trim(),
        sortOrder: this.data.matchTypes.length + 1,
      });
      this.clearLocalCaches(["matchTypes"]);
      wx.hideLoading();
      await this.loadMatchTypes({
        force: true,
      });
      wx.showToast({
        title: "已新增",
        icon: "success",
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    }
  },

  async deleteMatchType(e) {
    const { id, name } = e.currentTarget.dataset;
    if (!id) {
      return;
    }

    const confirmResult = await this.showConfirmModal({
      title: "永久删除对战类型",
      content: `确认永久删除“${name}”吗？关联战绩也会一并永久删除。`,
    });

    if (!confirmResult.confirm) {
      return;
    }

    try {
      wx.showLoading({
        title: "删除中",
      });
      const matchFormat = this.getSelectedMatchFormat();
      await this.callApi("/dict/item/remove", {
        matchFormat,
        id,
      });
      if (this.hasLocalCacheEntry("matchTypes", { matchFormat })) {
        this.patchLocalMatchTypes(matchFormat, (items) =>
          items.filter((item) => String(item.id || "") !== String(id))
        );
        if (this.hasLocalCacheEntry("allRecords", { matchFormat })) {
          this.patchLocalAllRecords(matchFormat, (records) =>
            records.filter((item) => String(item.matchTypeId || "") !== String(id))
          );
        }
        this.clearLocalCaches(["records", "statistics"]);
      } else {
        this.invalidateMatchTypeCaches();
      }
      wx.hideLoading();
      await this.loadMatchTypes();
      wx.showToast({
        title: "已删除",
        icon: "success",
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    }
  },

  async updateDeck(e) {
    const { id, name } = e.currentTarget.dataset;
    if (!id) {
      return;
    }

    const result = await this.showDeckNameDialog({
      title: "修改卡组",
      placeholderText: `当前：${name}（最多 ${DECK_NAME_MAX_LENGTH} 字）`,
      value: name || "",
    });

    const deckName = normalizeDeckNameInput(result.content);
    if (!result.confirm || !deckName) {
      return;
    }
    if (deckName.length > DECK_NAME_MAX_LENGTH) {
      wx.showToast({
        title: `卡组名最多 ${DECK_NAME_MAX_LENGTH} 字`,
        icon: "none",
      });
      return;
    }

    try {
      wx.showLoading({
        title: "保存中",
      });
      const matchFormat = this.getSelectedMatchFormat();
      await this.callApi("/deck/update", {
        matchFormat,
        id,
        deckName,
      });
      if (this.hasLocalCacheEntry("decksBase", { matchFormat })) {
        this.patchLocalDeckBase(matchFormat, (decks) =>
          decks.map((item) =>
            String(item.id || "") === String(id)
              ? {
                  ...item,
                  deckName,
                }
              : item
          )
        );
        if (this.hasLocalCacheEntry("allRecords", { matchFormat })) {
          this.patchLocalAllRecords(matchFormat, (records) =>
            records.map((item) =>
              String(item.deckId || "") === String(id)
                ? {
                    ...item,
                    deckName,
                  }
                : item
            )
          );
        }
        this.clearLocalCaches(["decks", "records", "statistics", "adminOverviewStats"]);
      } else {
        this.invalidateDeckRelatedCaches();
      }
      wx.hideLoading();
      await this.refreshViewFromLocalCaches({
        keepSelection: true,
      });
      wx.showToast({
        title: "已修改",
        icon: "success",
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    }
  },

  async updateMatchType(e) {
    const { id, name, sort } = e.currentTarget.dataset;
    if (!id) {
      return;
    }

    const result = await this.showEditableModal({
      title: "修改对战类型",
      placeholderText: `当前：${name}`,
    });

    if (!result.confirm || !result.content || !result.content.trim()) {
      return;
    }

    try {
      wx.showLoading({
        title: "保存中",
      });
      const matchFormat = this.getSelectedMatchFormat();
      await this.callApi("/dict/item/update", {
        matchFormat,
        id,
        itemValue: result.content.trim(),
        itemLabel: result.content.trim(),
        sortOrder: Number(sort || 0),
      });
      // 重命名后共用文档 id 会变（重指向），乐观 patch 不再正确，统一失效并重新加载
      this.invalidateMatchTypeCaches();
      this.invalidateRecordRelatedCaches();
      wx.hideLoading();
      await this.loadMatchTypes();
      wx.showToast({
        title: "已修改",
        icon: "success",
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    }
  },

  async onSwitchSettingSection(e) {
    const currentSettingSection = e.currentTarget.dataset.section;
    if (!currentSettingSection || currentSettingSection === this.data.currentSettingSection) {
      return;
    }

    this.setData({
      currentSettingSection,
    });

    this.setData({
      settingsLoading: true,
    });

    try {
      await this.ensureCurrentSettingSectionData();
    } catch (error) {
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    } finally {
      this.setData({
        settingsLoading: false,
      });
    }
  },

  async onSwitchAdminOverviewScope(e) {
    const adminOverviewScope = e.currentTarget.dataset.scope;
    if (!adminOverviewScope || adminOverviewScope === this.data.adminOverviewScope) {
      return;
    }

    this.resetAdminOverviewState(adminOverviewScope);
    this.setData({
      errorMessage: "",
    });
  },

  onAdminOverviewMonthChange(e) {
    const adminOverviewMonthIndex = Number(e.detail.value || 0);
    const selectedMonth =
      (this.data.monthItems || [])[adminOverviewMonthIndex] || this.data.monthItems[0];
    if (!selectedMonth) {
      return;
    }

    this.setData({
      adminOverviewLoaded: false,
      adminOverviewMonthIndex,
      adminOverviewMonthValue: selectedMonth.itemValue || getCurrentMonth(),
      adminOverviewMonthLabel:
        selectedMonth.itemLabel || formatMonthOptionLabel(selectedMonth.itemValue || getCurrentMonth()),
      adminOverviewStats: {
        totalGames: 0,
        deckCount: 0,
        scopeLabel:
          selectedMonth.itemLabel || formatMonthOptionLabel(selectedMonth.itemValue || getCurrentMonth()),
        items: [],
      },
      errorMessage: "",
    });
  },

  async onRunAdminOverviewStats() {
    if (!this.data.isAdmin || this.data.adminOverviewLoading) {
      return;
    }

    this.setData({
      adminOverviewLoading: true,
      errorMessage: "",
    });

    try {
      await this.loadAdminOverviewStats({
        force: true,
      });
      this.setData({
        adminOverviewLoaded: true,
      });
    } catch (error) {
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    } finally {
      this.setData({
        adminOverviewLoading: false,
      });
    }
  },

  onToggleAdminOverviewMatchType(e) {
    const rawId = e.currentTarget.dataset.id;
    if (rawId === undefined || rawId === null || rawId === "") {
      return;
    }
    const targetName = String(rawId);
    const current = (this.data.adminOverviewSelectedMatchTypeNames || []).map(
      (name) => String(name)
    );
    const selectedMatchTypeNames = current.includes(targetName)
      ? current.filter((name) => name !== targetName)
      : current.concat(targetName);

    this.setData({
      adminOverviewSelectedMatchTypeNames: selectedMatchTypeNames,
      adminOverviewMatchTypeOptions: buildAdminOverviewMatchTypeOptions(
        this.data.adminOverviewMatchTypeList || [],
        selectedMatchTypeNames
      ),
      ...this.buildResetAdminOverviewStatsPatch(),
    });
  },

  onClearAdminOverviewMatchTypes() {
    if (!(this.data.adminOverviewSelectedMatchTypeNames || []).length) {
      return;
    }

    this.setData({
      adminOverviewSelectedMatchTypeNames: [],
      adminOverviewMatchTypeOptions: buildAdminOverviewMatchTypeOptions(
        this.data.adminOverviewMatchTypeList || [],
        []
      ),
      ...this.buildResetAdminOverviewStatsPatch(),
    });
  },

  buildResetAdminOverviewStatsPatch() {
    const scope = this.data.adminOverviewScope || "month";
    return {
      adminOverviewLoaded: false,
      adminOverviewStats: {
        totalGames: 0,
        deckCount: 0,
        scopeLabel: scope === "all" ? "全部数据" : this.data.adminOverviewMonthLabel,
        items: [],
      },
      errorMessage: "",
    };
  },

  async createMonth() {
    const result = await this.showEditableModal({
      title: "新增月份",
      placeholderText: "请输入 yyyy-MM，例如 2026-06",
    });

    if (!result.confirm || !result.content || !result.content.trim()) {
      return;
    }

    try {
      wx.showLoading({
        title: "保存中",
      });
      await this.callApi("/dict/item/save", {
        dictCode: "match_month",
        itemValue: result.content.trim(),
      });
      this.clearLocalCaches(["months"]);
      wx.hideLoading();
      await this.loadMonths({
        force: true,
      });
      wx.showToast({
        title: "已新增",
        icon: "success",
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    }
  },

  async deleteMonth(e) {
    const { id, name } = e.currentTarget.dataset;
    if (!id) {
      return;
    }
    if (String(id).startsWith("local:")) {
      wx.showToast({
        title: "该月份会在首次保存战绩后自动同步",
        icon: "none",
      });
      return;
    }

    const confirmResult = await this.showConfirmModal({
      title: "永久删除月份",
      content: `确认永久删除“${name}”吗？关联战绩也会一并永久删除。`,
    });

    if (!confirmResult.confirm) {
      return;
    }

    try {
      wx.showLoading({
        title: "删除中",
      });
      await this.callApi("/dict/item/remove", { id });
      const cachedMonthFormats = ["md", "ocg"].filter((matchFormat) =>
        this.hasLocalCacheEntry("allRecords", { matchFormat })
      );
      if (this.hasLocalCacheEntry("months", {})) {
        this.patchLocalMonths((items) =>
          items.filter((item) => String(item.id || "") !== String(id))
        );
      }
      if (cachedMonthFormats.length) {
        cachedMonthFormats.forEach((matchFormat) => {
          this.patchLocalAllRecords(matchFormat, (records) =>
            records.filter((item) => String(item.matchMonthId || "") !== String(id))
          );
        });
        this.clearLocalCaches(["records", "statistics", "decks"]);
      } else {
        this.invalidateRecordRelatedCaches();
      }
      wx.hideLoading();
      await this.refreshViewFromLocalCaches({
        keepSelection: true,
        reloadMonths: true,
      });
      wx.showToast({
        title: "已删除",
        icon: "success",
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    }
  },

  async updateMonth(e) {
    const { id, name, sort } = e.currentTarget.dataset;
    if (!id) {
      return;
    }
    if (String(id).startsWith("local:")) {
      wx.showToast({
        title: "该月份会在首次保存战绩后自动同步",
        icon: "none",
      });
      return;
    }

    const result = await this.showEditableModal({
      title: "修改月份",
      placeholderText: `当前：${name}`,
    });

    if (!result.confirm || !result.content || !result.content.trim()) {
      return;
    }

    try {
      wx.showLoading({
        title: "保存中",
      });
      await this.callApi("/dict/item/update", {
        id,
        itemValue: result.content.trim(),
        sortOrder: Number(sort || 0),
      });
      // 重命名后共用月份文档 id 会变（重指向），乐观 patch 不再正确，统一失效并重新加载
      this.invalidateRecordRelatedCaches();
      wx.hideLoading();
      await this.refreshViewFromLocalCaches({
        keepSelection: true,
        reloadMonths: true,
      });
      wx.showToast({
        title: "已修改",
        icon: "success",
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    }
  },

  async createMdAccount() {
    const result = await this.showEditableModal({
      title: "新增MD账号",
      placeholderText: "请输入账号名称",
    });

    if (!result.confirm || !result.content || !result.content.trim()) {
      return;
    }

    try {
      wx.showLoading({
        title: "保存中",
      });
      await this.callApi("/dict/item/save", {
        dictCode: "md_account",
        itemValue: result.content.trim(),
        itemLabel: result.content.trim(),
      });
      this.clearLocalCaches(["mdAccounts"]);
      wx.hideLoading();
      await this.loadMdAccounts({
        force: true,
      });
      wx.showToast({
        title: "已新增",
        icon: "success",
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    }
  },

  onSelectMdAccount(e) {
    const { id, name } = e.currentTarget.dataset;
    if (!id || String(id) === String(this.data.currentMdAccountId || "")) {
      return;
    }
    this.setData({
      currentMdAccountId: String(id),
      currentMdAccountName: String(name || ""),
    });
    this.persistCurrentMdAccount();
    wx.showToast({
      title: "已切换使用账号",
      icon: "success",
    });
  },

  async updateMdAccount(e) {
    const { id, name, sort } = e.currentTarget.dataset;
    if (!id) {
      return;
    }

    const result = await this.showEditableModal({
      title: "修改MD账号",
      placeholderText: `当前：${name}`,
    });

    if (!result.confirm || !result.content || !result.content.trim()) {
      return;
    }

    try {
      wx.showLoading({
        title: "保存中",
      });
      const nextName = result.content.trim();
      const wasCurrentAccount =
        String(this.data.currentMdAccountId || "") === String(id);
      await this.callApi("/dict/item/update", {
        id,
        itemValue: nextName,
        itemLabel: nextName,
        sortOrder: Number(sort || 0),
      });
      // 重命名后共用账号文档 id 会变（重指向），乐观 patch 不再正确，统一失效并重新加载
      this.clearLocalCaches(["mdAccounts"]);
      this.invalidateRecordRelatedCaches();
      wx.hideLoading();
      const accounts = await this.loadMdAccounts({
        force: true,
      });
      if (wasCurrentAccount) {
        // 重命名后文档 id 会变，按新名称重新指向当前使用账号
        const renamedAccount = (accounts || []).find(
          (item) => String(item.itemLabel || "") === nextName
        );
        if (renamedAccount) {
          this.setData({
            currentMdAccountId: String(renamedAccount.id),
            currentMdAccountName: String(renamedAccount.itemLabel || ""),
          });
          this.persistCurrentMdAccount();
        }
      }
      await this.refreshViewFromLocalCaches({
        keepSelection: true,
      });
      wx.showToast({
        title: "已修改",
        icon: "success",
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    }
  },

  async deleteMdAccount(e) {
    const { id, name } = e.currentTarget.dataset;
    if (!id) {
      return;
    }

    const remainingAccounts = (this.data.mdAccounts || []).filter(
      (item) => String(item.id || "") !== String(id)
    );
    // 并入目标：优先当前使用账号，其次剩余第一个账号
    const mergeTarget =
      remainingAccounts.find(
        (item) => String(item.id || "") === String(this.data.currentMdAccountId || "")
      ) || remainingAccounts[0] || null;
    const keepLabel = mergeTarget
      ? `保留战绩，并入「${mergeTarget.itemLabel}」`
      : "保留战绩，变为未指定账号";

    const actionResult = await this.showActionSheetModal([
      keepLabel,
      "同时删除该账号下的战绩",
    ]);
    if (actionResult.tapIndex !== 0 && actionResult.tapIndex !== 1) {
      return;
    }
    const recordAction =
      actionResult.tapIndex === 1 ? "delete" : mergeTarget ? "merge" : "clear";

    if (recordAction === "delete") {
      const confirmResult = await this.showConfirmModal({
        title: "删除MD账号",
        content: `确认删除“${name}”及其名下所有战绩吗？该操作不可恢复。`,
      });
      if (!confirmResult.confirm) {
        return;
      }
    }

    try {
      wx.showLoading({
        title: "删除中",
      });
      const removeParams = { id, recordAction };
      if (recordAction === "merge") {
        removeParams.targetAccountId = mergeTarget.id;
      }
      await this.callApi("/dict/item/remove", removeParams);
      if (this.hasLocalCacheEntry("allRecords", { matchFormat: "md" })) {
        this.patchLocalAllRecords("md", (records) => {
          if (recordAction === "delete") {
            return records.filter(
              (item) => String(item.mdAccountId || "") !== String(id)
            );
          }
          return records.map((item) =>
            String(item.mdAccountId || "") === String(id)
              ? {
                  ...item,
                  mdAccountId: recordAction === "merge" ? mergeTarget.id : null,
                  mdAccount: recordAction === "merge" ? mergeTarget.itemLabel : "",
                }
              : item
          );
        });
        this.clearLocalCaches(["mdAccounts", "records", "statistics", "decks"]);
      } else {
        this.clearLocalCaches(["mdAccounts"]);
        this.invalidateRecordRelatedCaches();
      }
      wx.hideLoading();
      // loadMdAccounts 内部会把当前使用账号回落到剩余账号
      await this.loadMdAccounts({
        force: true,
      });
      await this.refreshViewFromLocalCaches({
        keepSelection: true,
      });
      wx.showToast({
        title: "已删除",
        icon: "success",
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    }
  },

  showActionSheetModal(itemList) {
    return new Promise((resolve) => {
      wx.showActionSheet({
        itemList,
        success: resolve,
        fail: () => resolve({ tapIndex: -1 }),
      });
    });
  },

  async openMdAccountMigrate(e) {
    const { id, name } = e.currentTarget.dataset;
    if (!id) {
      return;
    }
    this.setData({
      mdMigrateVisible: true,
      mdMigrateLoading: true,
      mdMigrateAccountId: String(id),
      mdMigrateAccountName: String(name || ""),
      mdMigrateMode: "deck",
      mdMigrateGroups: [],
      mdMigrateRecords: [],
      mdMigrateSelectedCount: 0,
    });
    try {
      const allRecords = await this.loadAllRecordsForMatchFormat("md");
      // 仅无归属的 MD 战绩可迁移
      this._mdMigrateUnassignedRecords = (allRecords || []).filter(
        (item) => !item.mdAccountId
      );
      this.setData({
        mdMigrateLoading: false,
        ...this.buildMdMigrateViewData("deck"),
      });
    } catch (error) {
      this.setData({
        mdMigrateVisible: false,
        mdMigrateLoading: false,
      });
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    }
  },

  buildMdMigrateViewData(mode) {
    const unassignedRecords = this._mdMigrateUnassignedRecords || [];
    if (mode === "record") {
      return {
        mdMigrateGroups: [],
        mdMigrateRecords: unassignedRecords.map((item) => ({
          id: String(item.id || ""),
          label: `${item.deckName || "未知卡组"} · ${
            MATCH_RESULT_LABEL_MAP[Number(item.matchResult)] || "未知结果"
          }`,
          timeLabel: item.createTime || item.matchMonth || "",
          checked: false,
        })),
        mdMigrateSelectedCount: 0,
      };
    }
    const groupMap = new Map();
    unassignedRecords.forEach((item) => {
      const key =
        mode === "matchType"
          ? String(item.matchTypeId || "none")
          : String(item.deckId || "none");
      const label =
        mode === "matchType"
          ? item.matchType || "未指定类型"
          : item.deckName || "未知卡组";
      const group = groupMap.get(key) || { key, label, count: 0, checked: false };
      group.count += 1;
      groupMap.set(key, group);
    });
    return {
      mdMigrateGroups: Array.from(groupMap.values()),
      mdMigrateRecords: [],
      mdMigrateSelectedCount: 0,
    };
  },

  countMdMigrateSelection(mode, groups, records) {
    if (mode === "record") {
      return (records || []).filter((item) => item.checked).length;
    }
    return (groups || []).reduce(
      (total, item) => total + (item.checked ? Number(item.count || 0) : 0),
      0
    );
  },

  onMdMigrateModeChange(e) {
    const mode = e.currentTarget.dataset.mode;
    if (!mode || mode === this.data.mdMigrateMode) {
      return;
    }
    this.setData({
      mdMigrateMode: mode,
      ...this.buildMdMigrateViewData(mode),
    });
  },

  onToggleMdMigrateGroup(e) {
    const key = String(e.currentTarget.dataset.key || "");
    const mdMigrateGroups = (this.data.mdMigrateGroups || []).map((item) =>
      String(item.key) === key ? { ...item, checked: !item.checked } : item
    );
    this.setData({
      mdMigrateGroups,
      mdMigrateSelectedCount: this.countMdMigrateSelection(
        this.data.mdMigrateMode,
        mdMigrateGroups,
        this.data.mdMigrateRecords
      ),
    });
  },

  onToggleMdMigrateRecord(e) {
    const id = String(e.currentTarget.dataset.id || "");
    const mdMigrateRecords = (this.data.mdMigrateRecords || []).map((item) =>
      String(item.id) === id ? { ...item, checked: !item.checked } : item
    );
    this.setData({
      mdMigrateRecords,
      mdMigrateSelectedCount: this.countMdMigrateSelection(
        this.data.mdMigrateMode,
        this.data.mdMigrateGroups,
        mdMigrateRecords
      ),
    });
  },

  onMdMigrateSelectAll() {
    const mode = this.data.mdMigrateMode;
    if (mode === "record") {
      const shouldCheckAll = (this.data.mdMigrateRecords || []).some(
        (item) => !item.checked
      );
      const mdMigrateRecords = (this.data.mdMigrateRecords || []).map((item) => ({
        ...item,
        checked: shouldCheckAll,
      }));
      this.setData({
        mdMigrateRecords,
        mdMigrateSelectedCount: this.countMdMigrateSelection(
          mode,
          this.data.mdMigrateGroups,
          mdMigrateRecords
        ),
      });
      return;
    }
    const shouldCheckAll = (this.data.mdMigrateGroups || []).some(
      (item) => !item.checked
    );
    const mdMigrateGroups = (this.data.mdMigrateGroups || []).map((item) => ({
      ...item,
      checked: shouldCheckAll,
    }));
    this.setData({
      mdMigrateGroups,
      mdMigrateSelectedCount: this.countMdMigrateSelection(
        mode,
        mdMigrateGroups,
        this.data.mdMigrateRecords
      ),
    });
  },

  collectMdMigrateRecordIds() {
    const mode = this.data.mdMigrateMode;
    if (mode === "record") {
      return (this.data.mdMigrateRecords || [])
        .filter((item) => item.checked)
        .map((item) => String(item.id))
        .filter(Boolean);
    }
    const checkedKeys = new Set(
      (this.data.mdMigrateGroups || [])
        .filter((item) => item.checked)
        .map((item) => String(item.key))
    );
    return (this._mdMigrateUnassignedRecords || [])
      .filter((item) => {
        const key =
          mode === "matchType"
            ? String(item.matchTypeId || "none")
            : String(item.deckId || "none");
        return checkedKeys.has(key);
      })
      .map((item) => String(item.id || ""))
      .filter(Boolean);
  },

  async confirmMdAccountMigrate() {
    if (this.data.mdMigrateSubmitting) {
      return;
    }
    const recordIds = this.collectMdMigrateRecordIds();
    if (!recordIds.length) {
      wx.showToast({
        title: "请先选择要迁移的战绩",
        icon: "none",
      });
      return;
    }
    const targetId = this.data.mdMigrateAccountId;
    const targetName = this.data.mdMigrateAccountName;
    this.setData({
      mdMigrateSubmitting: true,
    });
    try {
      await this.callApi("/match/record/assign-md-account", {
        mdAccountId: targetId,
        recordIds,
      });
      const idSet = new Set(recordIds.map((rid) => String(rid)));
      if (this.hasLocalCacheEntry("allRecords", { matchFormat: "md" })) {
        this.patchLocalAllRecords("md", (records) =>
          records.map((item) =>
            !item.mdAccountId && idSet.has(String(item.id || ""))
              ? { ...item, mdAccountId: targetId, mdAccount: targetName }
              : item
          )
        );
        this.clearLocalCaches(["records", "statistics", "decks"]);
      } else {
        this.invalidateRecordRelatedCaches();
      }
      this._mdMigrateUnassignedRecords = [];
      this.setData({
        mdMigrateVisible: false,
        mdMigrateSubmitting: false,
      });
      await this.refreshViewFromLocalCaches({
        keepSelection: true,
      });
      wx.showToast({
        title: `已迁移 ${recordIds.length} 条`,
        icon: "success",
      });
    } catch (error) {
      this.setData({
        mdMigrateSubmitting: false,
      });
      wx.showToast({
        title: this.getErrorMessage(error),
        icon: "none",
      });
    }
  },

  closeMdMigratePopup() {
    if (this.data.mdMigrateSubmitting) {
      return;
    }
    this._mdMigrateUnassignedRecords = [];
    this.setData({
      mdMigrateVisible: false,
    });
  },

  showEditableModal(options) {
    return new Promise((resolve) => {
      wx.showModal({
        editable: true,
        ...options,
        success: resolve,
        fail: () => resolve({ confirm: false, cancel: true }),
      });
    });
  },

  showDeckNameDialog(options) {
    if (typeof this._deckNameDialogResolver === "function") {
      this._deckNameDialogResolver({
        confirm: false,
        cancel: true,
        content: this.data.deckNameDialogValue || "",
      });
    }

    this.setData({
      deckNameDialogVisible: true,
      deckNameDialogTitle: options && options.title ? options.title : "输入卡组名称",
      deckNameDialogPlaceholder:
        options && options.placeholderText ? options.placeholderText : "",
      deckNameDialogValue: options && options.value ? String(options.value) : "",
    });

    return new Promise((resolve) => {
      this._deckNameDialogResolver = resolve;
    });
  },

  resolveDeckNameDialog(result) {
    const resolver = this._deckNameDialogResolver;
    this._deckNameDialogResolver = null;

    this.setData({
      deckNameDialogVisible: false,
      deckNameDialogTitle: "",
      deckNameDialogPlaceholder: "",
      deckNameDialogValue: "",
    });

    if (typeof resolver === "function") {
      resolver(result);
    }
  },

  onDeckNameDialogInput(e) {
    this.setData({
      deckNameDialogValue: e.detail.value || "",
    });
  },

  confirmDeckNameDialog() {
    this.resolveDeckNameDialog({
      confirm: true,
      cancel: false,
      content: this.data.deckNameDialogValue || "",
    });
  },

  closeDeckNameDialog() {
    this.resolveDeckNameDialog({
      confirm: false,
      cancel: true,
      content: this.data.deckNameDialogValue || "",
    });
  },

  showConfirmModal(options) {
    return new Promise((resolve) => {
      wx.showModal({
        ...options,
        success: resolve,
        fail: () => resolve({ confirm: false, cancel: true }),
      });
    });
  },

  loadOpponentDeckCategories() {
    try {
      const saved = wx.getStorageSync(OPPONENT_DECK_CATEGORIES_STORAGE_KEY);
      if (saved && typeof saved === "object" && Array.isArray(saved.items)) {
        this.setData({
          opponentDeckCategories: saved.items,
        });
      }
    } catch (error) {
      console.error("loadOpponentDeckCategories failed =>", error);
    }
  },

  loadFailureReasonCategories() {
    try {
      const saved = wx.getStorageSync(FAILURE_REASON_CATEGORIES_STORAGE_KEY);
      const items = saved && Array.isArray(saved.items) ? saved.items : [];
      this.setData({ failureReasonCategories: items });
    } catch (error) { console.error("loadFailureReasonCategories failed =>", error); }
  },

  persistFailureReasonCategories(categories = this.data.failureReasonCategories) {
    const items = Array.isArray(categories) ? categories : [];
    try { wx.setStorageSync(FAILURE_REASON_CATEGORIES_STORAGE_KEY, { savedAt: Date.now(), items }); } catch (error) { console.error("persistFailureReasonCategories failed =>", error); }
    this.setData({ failureReasonCategories: items });
    if (this._hasBootstrapped) this.refreshViewFromLocalCaches({ keepSelection: true });
  },

  async openCreateFailureReasonCategory() {
    const result = await this.showEditableModal({
      title: "新增失败原因归类",
      placeholderText: `输入归类名称（最多 ${this.data.failureReasonCategoryNameMaxLength} 字）`,
    });
    const categoryName = String(result.content || "").trim();
    if (!result.confirm || !categoryName) return;
    if (categoryName.length > this.data.failureReasonCategoryNameMaxLength) {
      wx.showToast({ title: `归类名最多 ${this.data.failureReasonCategoryNameMaxLength} 字`, icon: "none" });
      return;
    }
    const id = "failure_cat_" + Date.now();
    const categories = (this.data.failureReasonCategories || []).concat({
      id,
      categoryName,
      reasonNames: [],
      matchFormat: this.getSelectedMatchFormat(),
    });
    this.persistFailureReasonCategories(categories);
    this.openEditFailureReasonCategory(id);
  },

  async openEditFailureReasonCategory(e) {
    const id = typeof e === "string" ? e : (e.currentTarget.dataset.id || "");
    const category = (this.data.failureReasonCategories || []).find((item) => item.id === id);
    if (!category) return;
    let allRecords = this._recordsFullList || [];
    try {
      allRecords = await this.loadAllRecordsForMatchFormat(this.getSelectedMatchFormat());
    } catch (error) {
      wx.showToast({ title: this.getErrorMessage(error), icon: "none" });
      return;
    }
    const allReasons = this.collectFailureReasonNames(allRecords);
    const occupiedSet = new Set();
    (this.data.failureReasonCategories || []).forEach((item) => {
      if (item.id === id || (item.matchFormat && item.matchFormat !== this.getSelectedMatchFormat())) return;
      (item.reasonNames || []).forEach((name) => occupiedSet.add(String(name).trim()));
    });
    const editingSet = new Set((category.reasonNames || []).map((name) => String(name).trim()));
    this.setData({
      failureReasonCategoryDialogVisible: true,
      failureReasonCategoryEditingId: id,
      failureReasonCategoryEditingName: category.categoryName,
      failureReasonCategoryEditingReasonNames: (category.reasonNames || []).slice(),
      failureReasonCategoryAvailableReasons: allReasons.map((name) => ({ name, isActive: editingSet.has(name), isDisabled: occupiedSet.has(name) })),
    });
  },

  collectFailureReasonNames(records = this._recordsFullList || []) {
    const names = new Set();
    (records || []).forEach((record) => (record.failureReasons || []).forEach((name) => {
      const value = normalizeFailureReasonInput(name).trim();
      if (value) names.add(value);
    }));
    (this.data.failureReasonCategories || []).forEach((category) => (category.reasonNames || []).forEach((name) => {
      const value = normalizeFailureReasonInput(name).trim();
      if (value) names.add(value);
    }));
    return Array.from(names).sort((left, right) => left.localeCompare(right, "zh-CN"));
  },

  onToggleFailureReasonCategoryReason(e) {
    const name = String(e.currentTarget.dataset.name || "").trim();
    if (!name) return;
    const item = (this.data.failureReasonCategoryAvailableReasons || []).find((option) => option.name === name);
    if (item && item.isDisabled) {
      wx.showToast({ title: "该失败原因已被其他归类使用", icon: "none" });
      return;
    }
    const current = (this.data.failureReasonCategoryEditingReasonNames || []).slice();
    const index = current.indexOf(name);
    if (index >= 0) current.splice(index, 1);
    else if (current.length < this.data.failureReasonCategoryReasonLimit) current.push(name);
    else {
      wx.showToast({ title: `最多关联 ${this.data.failureReasonCategoryReasonLimit} 个失败原因`, icon: "none" });
      return;
    }
    const editingSet = new Set(current);
    this.setData({
      failureReasonCategoryEditingReasonNames: current,
      failureReasonCategoryAvailableReasons: (this.data.failureReasonCategoryAvailableReasons || []).map((option) => ({ ...option, isActive: editingSet.has(option.name) })),
    });
  },

  onFailureReasonCategoryNameChange(e) {
    this.setData({ failureReasonCategoryEditingName: String(e.detail.value || "").slice(0, this.data.failureReasonCategoryNameMaxLength) });
  },

  saveFailureReasonCategoryFromDialog() {
    const id = this.data.failureReasonCategoryEditingId;
    const categoryName = String(this.data.failureReasonCategoryEditingName || "").trim();
    if (!categoryName) {
      wx.showToast({ title: "归类名不能为空", icon: "none" });
      return;
    }
    const categories = (this.data.failureReasonCategories || []).map((item) => item.id === id ? {
      ...item,
      categoryName,
      reasonNames: (this.data.failureReasonCategoryEditingReasonNames || []).slice(),
      matchFormat: item.matchFormat || this.getSelectedMatchFormat(),
    } : item);
    this.setData({ failureReasonCategoryDialogVisible: false });
    this.persistFailureReasonCategories(categories);
  },

  closeFailureReasonCategoryDialog() {
    this.setData({ failureReasonCategoryDialogVisible: false });
  },

  async deleteFailureReasonCategory(e) {
    const id = String(e.currentTarget.dataset.id || "");
    const name = String(e.currentTarget.dataset.name || "");
    const result = await this.showConfirmModal({ title: "删除归类", content: `确认删除归类“${name}”吗？不会影响已录战绩。` });
    if (!result.confirm) return;
    this.persistFailureReasonCategories((this.data.failureReasonCategories || []).filter((item) => item.id !== id));
  },

  persistOpponentDeckCategories(categories = this.data.opponentDeckCategories) {
    try {
      wx.setStorageSync(OPPONENT_DECK_CATEGORIES_STORAGE_KEY, {
        savedAt: Date.now(),
        items: categories || [],
      });
    } catch (error) {
      console.error("persistOpponentDeckCategories failed =>", error);
    }
  },

  async openCreateOpponentDeckCategory() {
    const result = await this.showEditableModal({
      title: "新增对手卡组归类",
      placeholderText: `输入归类名称（最多 ${this.data.opponentDeckCategoryNameMaxLength} 字）`,
    });

    const categoryName = String(result.content || "").trim();
    if (!result.confirm || !categoryName) {
      return;
    }
    if (categoryName.length > this.data.opponentDeckCategoryNameMaxLength) {
      wx.showToast({
        title: `归类名最多 ${this.data.opponentDeckCategoryNameMaxLength} 字`,
        icon: "none",
      });
      return;
    }

    const id = "cat_" + Date.now();
    const newCategory = {
      id,
      categoryName,
      deckNames: [],
      matchFormat: this.getSelectedMatchFormat(),
    };

    const categories = (this.data.opponentDeckCategories || []).concat(newCategory);
    this.setData({ opponentDeckCategories: categories });
    this.persistOpponentDeckCategories(categories);

    this.openEditOpponentDeckCategory(id);
  },

  openEditOpponentDeckCategory(e) {
    const id = typeof e === "string" ? e : (e.currentTarget.dataset.id || "");
    const category = (this.data.opponentDeckCategories || []).find((cat) => cat.id === id);
    if (!category) {
      return;
    }

    const allDeckNames = this.collectOpponentDeckNames();

    // 收集已被其他归类占用的卡组名（跨归类去重）
    const occupiedSet = new Set();
    (this.data.opponentDeckCategories || []).forEach((cat) => {
      if (cat.id === id) return;
      (cat.deckNames || []).forEach((name) => {
        const n = String(name).trim();
        if (n) occupiedSet.add(n);
      });
    });

    // 当前归类已选中的卡组名
    const editingSet = new Set((category.deckNames || []).map((n) => String(n).trim()));

    // 构建带布尔标记的选项列表，避免 WXML 中使用 indexOf
    const availableItems = allDeckNames.map((name) => ({
      name,
      isActive: editingSet.has(name),
      isDisabled: occupiedSet.has(name),
    }));

    this.setData({
      opponentDeckCategoryDialogVisible: true,
      opponentDeckCategoryEditingId: id,
      opponentDeckCategoryEditingName: category.categoryName,
      opponentDeckCategoryEditingDeckNames: (category.deckNames || []).slice(),
      opponentDeckCategoryAvailableDeckNames: availableItems,
    });
  },

  collectOpponentDeckNames() {
    const names = new Set();
    // 从原始统计数据中收集（未应用归类映射）
    const opponentDeckStats = this.data.statistics && this.data.statistics.opponentDeckStats;
    if (opponentDeckStats) {
      ["all", "win", "loss"].forEach((mode) => {
        const list = opponentDeckStats[mode] || [];
        list.forEach((item) => {
          const name = String(item.opponentDeck || "").trim();
          if (name) names.add(name);
        });
      });
    }
    // 也从所有归类中已收集的卡组名中提取
    (this.data.opponentDeckCategories || []).forEach((cat) => {
      (cat.deckNames || []).forEach((name) => {
        const n = String(name).trim();
        if (n) names.add(n);
      });
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, "zh-CN"));
  },

  onToggleOpponentDeckCategoryDeckName(e) {
    const name = String(e.currentTarget.dataset.name || "").trim();
    if (!name) return;

    // 已被其他归类占用，不允许点选
    const clickedItem = (this.data.opponentDeckCategoryAvailableDeckNames || []).find((item) => item.name === name);
    if (clickedItem && clickedItem.isDisabled) {
      wx.showToast({ title: "该卡组已被其他归类使用", icon: "none" });
      return;
    }

    const current = (this.data.opponentDeckCategoryEditingDeckNames || []).slice();
    const idx = current.indexOf(name);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      if (current.length >= this.data.opponentDeckCategoryDeckLimit) {
        wx.showToast({
          title: `最多关联 ${this.data.opponentDeckCategoryDeckLimit} 个卡组`,
          icon: "none",
        });
        return;
      }
      current.push(name);
    }

    // 重新计算各选项的 isActive 标记
    const editingSet = new Set(current);
    const availableItems = (this.data.opponentDeckCategoryAvailableDeckNames || []).map((item) => ({
      ...item,
      isActive: editingSet.has(item.name),
    }));

    this.setData({
      opponentDeckCategoryEditingDeckNames: current,
      opponentDeckCategoryAvailableDeckNames: availableItems,
    });
  },

  onOpponentDeckCategoryNameChange(e) {
    this.setData({
      opponentDeckCategoryEditingName: String(e.detail.value || "").slice(0, this.data.opponentDeckCategoryNameMaxLength),
    });
  },

  saveOpponentDeckCategoryFromDialog() {
    const editingId = this.data.opponentDeckCategoryEditingId;
    const categoryName = String(this.data.opponentDeckCategoryEditingName || "").trim();
    if (!categoryName) {
      wx.showToast({ title: "归类名不能为空", icon: "none" });
      return;
    }
    if (categoryName.length > this.data.opponentDeckCategoryNameMaxLength) {
      wx.showToast({ title: `归类名最多 ${this.data.opponentDeckCategoryNameMaxLength} 字`, icon: "none" });
      return;
    }

    const deckNames = (this.data.opponentDeckCategoryEditingDeckNames || []).slice();
    const categories = (this.data.opponentDeckCategories || []).map((cat) => {
      if (cat.id === editingId) {
        return { ...cat, categoryName, deckNames };
      }
      return cat;
    });

    this.setData({
      opponentDeckCategories: categories,
      opponentDeckCategoryDialogVisible: false,
    });
    this.persistOpponentDeckCategories(categories);

    // 归类变更 → 刷新统计展示
    this.refreshViewFromLocalCaches({ keepSelection: true });
  },

  closeOpponentDeckCategoryDialog() {
    this.setData({
      opponentDeckCategoryDialogVisible: false,
    });
  },

  async deleteOpponentDeckCategory(e) {
    const { id, name } = e.currentTarget.dataset;
    if (!id) return;

    const confirmResult = await this.showConfirmModal({
      title: "删除归类",
      content: `确认删除归类“${name}”吗？不会影响已录战绩。`,
    });
    if (!confirmResult.confirm) return;

    const categories = (this.data.opponentDeckCategories || []).filter((cat) => cat.id !== id);
    this.setData({ opponentDeckCategories: categories });
    this.persistOpponentDeckCategories(categories);

    this.refreshViewFromLocalCaches({ keepSelection: true });
  },

  noop() {},
};

// ===== 以下为 uni-app 适配层(build-index-vue.js 生成) =====
const PAGE_LIFECYCLE_KEYS = [
  "onLoad", "onShow", "onReady", "onHide", "onUnload",
  "onPullDownRefresh", "onReachBottom", "onPageScroll", "onResize", "onBackPress",
];

const pageData = pageConfig.data || {};
const pageMethods = {};
const pageLifecycle = {};
const pagePlainProps = {};
Object.keys(pageConfig).forEach((key) => {
  if (key === "data") {
    return;
  }
  const value = pageConfig[key];
  if (typeof value === "function") {
    if (PAGE_LIFECYCLE_KEYS.indexOf(key) !== -1) {
      pageLifecycle[key] = value;
    } else {
      pageMethods[key] = value;
    }
  } else {
    pagePlainProps[key] = value;
  }
});

export default {
  mixins: [pageMixin],
  data() {
    return pageData;
  },
  created() {
    // Page 配置里的非函数、非 data 顶层属性(如内部缓存对象)挂到实例
    Object.keys(pagePlainProps).forEach((key) => {
      this[key] = pagePlainProps[key];
    });
  },
  methods: pageMethods,
  ...pageLifecycle,
};
</script>

<style>
page {
  background:
    radial-gradient(circle at top left, rgba(214, 164, 110, 0.18), transparent 34%),
    linear-gradient(180deg, #f5f0e6 0%, #efe9de 100%);
  color: #1f1a17;
}

.page-shell {
  overflow: hidden;
}

.workspace {
  display: flex;
  align-items: stretch;
  height: 100%;
  gap: 20rpx;
  box-sizing: border-box;
  padding-left: 22rpx;
  padding-right: 22rpx;
  overflow: hidden;
}

.sidebar {
  width: 212rpx;
  padding: 24rpx 18rpx;
  box-sizing: border-box;
  border-radius: 28rpx;
  background: linear-gradient(180deg, rgba(70, 53, 36, 0.96), rgba(45, 35, 24, 0.96));
  color: #fffaf3;
  display: flex;
  flex-direction: column;
  box-shadow: 0 18rpx 48rpx rgba(72, 49, 28, 0.08);
}

.sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.sidebar--collapsed .sidebar__header {
  justify-content: center;
  margin-bottom: 0;
}

.sidebar__toggle {
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22rpx;
  color: rgba(255, 250, 243, 0.70);
  flex-shrink: 0;
}

.sidebar__toggle:active {
  background: rgba(255, 255, 255, 0.16);
}

.sidebar--collapsed {
  width: 56rpx;
  padding: 24rpx 8rpx;
  align-items: center;
  justify-content: center;
}

.sidebar__expand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
  padding: 18rpx 0;
  border-radius: 14rpx;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 250, 243, 0.78);
  font-size: 26rpx;
  font-weight: 500;
  letter-spacing: 2rpx;
  width: 100%;
}

.sidebar__expand:active {
  background: rgba(255, 255, 255, 0.16);
}

.sidebar__eyebrow {
  font-size: 20rpx;
  letter-spacing: 2rpx;
  text-transform: uppercase;
  color: rgba(255, 250, 243, 0.5);
}

.sidebar__title {
  margin-top: 8rpx;
  font-size: 36rpx;
  font-weight: 600;
}

.sidebar__list {
  flex: 1;
  min-height: 0;
}

.deck-item {
  padding: 18rpx 16rpx;
  border-radius: 20rpx;
  margin-bottom: 12rpx;
  background: rgba(255, 255, 255, 0.04);
}

.deck-item.is-active {
  background: linear-gradient(135deg, rgba(246, 174, 86, 0.28), rgba(198, 93, 46, 0.4));
}

.deck-item__name {
  font-size: 28rpx;
  font-weight: 500;
  word-break: break-all;
}

.deck-item__row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.deck-item__meta {
  margin-top: 6rpx;
  font-size: 22rpx;
  color: rgba(255, 250, 243, 0.62);
}

.sidebar__add {
  width: 132rpx;
  align-self: center;
  margin-top: 18rpx;
  min-height: 108rpx;
  padding: 20rpx 14rpx;
  border-radius: 24rpx;
  color: #fffef9;
  background: linear-gradient(135deg, #cc6a3d, #a9471e);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 14rpx 28rpx rgba(169, 71, 30, 0.24);
}

.sidebar__add-icon {
  width: 42rpx;
  height: 42rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 34rpx;
  line-height: 1;
}

.sidebar__add-text {
  margin-top: 10rpx;
  font-size: 24rpx;
  font-weight: 500;
}

.content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.content--full {
  width: 100%;
}

.content__hero {
  position: relative;
  padding: 28rpx 30rpx;
  border-radius: 32rpx;
  background: linear-gradient(135deg, rgba(255, 250, 242, 0.95), rgba(244, 233, 218, 0.92));
  box-shadow: 0 18rpx 48rpx rgba(72, 49, 28, 0.08);
}

.content__hero-head {
  display: flex;
  align-items: center;
  gap: 16rpx;
  flex-wrap: wrap;
}

.content__hero-tag {
  display: inline-flex;
  padding: 8rpx 18rpx;
  border-radius: 999rpx;
  background: #f5dccf;
  color: #c65d2e;
  font-size: 22rpx;
  font-weight: 600;
}

.content__hero-inline-stat {
  color: rgba(31, 26, 23, 0.68);
  font-size: 24rpx;
  font-weight: 600;
}

.content__hero-account {
  margin-left: auto;
  display: inline-flex;
  padding: 8rpx 18rpx;
  border-radius: 999rpx;
  background: rgba(198, 93, 46, 0.12);
  color: #8f3d1b;
  font-size: 22rpx;
  font-weight: 600;
  max-width: 50%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.content__hero-title {
  margin-top: 18rpx;
  font-size: 44rpx;
  font-weight: 700;
}

.content__hero-main {
  margin-top: 18rpx;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12rpx;
}

.content__hero-filters {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex-wrap: wrap;
}

.content__hero-filters .content__hero-filter,
.content__hero-filters picker {
  flex: 1;
  min-width: 0;
}

.stats-toggles {
  margin-top: 18rpx;
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.stats-toggles .stats-toggle {
  margin-top: 0;
}

.stats-toggle {
  margin-top: 18rpx;
  display: inline-flex;
  align-items: center;
  gap: 14rpx;
  padding: 14rpx 18rpx;
  border-radius: 20rpx;
  background: rgba(255, 255, 255, 0.7);
  box-shadow: 0 12rpx 28rpx rgba(72, 49, 28, 0.06);
}

.stats-toggle__box {
  width: 30rpx;
  height: 30rpx;
  border-radius: 8rpx;
  border: 2rpx solid rgba(143, 61, 27, 0.42);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.9);
}

.stats-toggle__box.is-active {
  border-color: #a9471e;
  background: rgba(204, 106, 61, 0.14);
}

.stats-toggle__dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 999rpx;
  background: #a9471e;
}

.stats-toggle__label {
  font-size: 24rpx;
  font-weight: 600;
  color: #7d3d1b;
}

.format-switcher {
  margin-top: 18rpx;
  display: flex;
  gap: 12rpx;
}

.format-switcher--top {
  margin-top: 18rpx;
}

.format-switcher__item {
  min-width: 120rpx;
  padding: 14rpx 22rpx;
  border-radius: 999rpx;
  background: rgba(31, 26, 23, 0.06);
  color: rgba(31, 26, 23, 0.62);
  font-size: 24rpx;
  font-weight: 600;
  text-align: center;
}

.format-switcher__item.is-active {
  background: linear-gradient(135deg, #cc6a3d, #a9471e);
  color: #fffef9;
}

.content__hero-streak {
  position: absolute;
  top: 28rpx;
  right: 112rpx;
  color: #a9471e;
  font-size: 24rpx;
  font-weight: 700;
  white-space: nowrap;
}

.content__hero-collapse {
  position: absolute;
  top: 28rpx;
  right: 30rpx;
  color: rgba(143, 61, 27, 0.78);
  font-size: 22rpx;
  white-space: nowrap;
}

.content__hero-main .content__hero-title {
  flex: 1;
  min-width: 0;
  margin-top: 0;
}

.content__hero-filter {
  flex-shrink: 0;
  min-width: 168rpx;
  padding: 14rpx 22rpx;
  border-radius: 999rpx;
  background: rgba(198, 93, 46, 0.12);
  color: #8f3d1b;
  font-size: 24rpx;
  font-weight: 600;
  text-align: center;
}

.content__hero-filter--range {
  width: 100%;
  box-sizing: border-box;
}

.content__hero-desc {
  margin-top: 10rpx;
  font-size: 26rpx;
  line-height: 1.7;
  color: rgba(31, 26, 23, 0.62);
}

.content__scroll {
  margin-top: 18rpx;
  flex: 1;
  min-height: 0;
  box-sizing: border-box;
  padding-bottom: 24rpx;
}

.content__scroll--settings {
  margin-top: 14rpx;
}

.feedback {
  margin-top: 18rpx;
  padding: 24rpx;
  border-radius: 24rpx;
  background: rgba(255, 255, 255, 0.88);
  color: rgba(31, 26, 23, 0.62);
  box-shadow: 0 18rpx 48rpx rgba(72, 49, 28, 0.08);
}

.feedback--error {
  color: #a9471e;
  background: rgba(255, 243, 236, 0.95);
}

.record-list,
.deck-manage-list,
.stats-grid,
.section-panel,
.settings-list {
  margin-top: 18rpx;
}

.record-card {
  padding: 24rpx;
  border-radius: 24rpx;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 18rpx 48rpx rgba(72, 49, 28, 0.08);
  margin-bottom: 16rpx;
}

.record-card--win {
  background: rgba(233, 248, 237, 0.96);
}

.record-card--loss {
  background: rgba(252, 237, 240, 0.96);
}

.record-card--neutral {
  background: rgba(244, 240, 232, 0.96);
}

.record-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.record-card__title-group {
  display: flex;
  align-items: center;
  gap: 14rpx;
  min-width: 0;
  flex: 1;
}

.record-card__title {
  font-size: 30rpx;
  font-weight: 600;
  min-width: 0;
  word-break: break-all;
}

.record-card__badge {
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 600;
  color: rgba(31, 26, 23, 0.72);
  background: rgba(255, 255, 255, 0.55);
}

.record-card__actions {
  display: flex;
  align-items: center;
  gap: 10rpx;
  flex-shrink: 0;
}

.record-card__edit,
.record-card__delete {
  padding: 10rpx 18rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
}

.record-card__edit {
  color: #2d5f90;
  background: rgba(45, 95, 144, 0.1);
}

.record-card__delete {
  color: #a9471e;
  background: rgba(169, 71, 30, 0.1);
}

.record-card__meta {
  margin-top: 12rpx;
  font-size: 24rpx;
  color: rgba(31, 26, 23, 0.62);
}

.record-card__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 16rpx;
}

.record-chip {
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  background: rgba(31, 26, 23, 0.05);
  font-size: 22rpx;
  color: rgba(31, 26, 23, 0.62);
}

.record-chip--win {
  color: #1f7a42;
  background: rgba(61, 167, 93, 0.14);
}

.record-chip--loss {
  color: #a83d3d;
  background: rgba(210, 83, 83, 0.14);
}

.record-card__opponent {
  margin-top: 16rpx;
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 14rpx 18rpx;
  border-radius: 16rpx;
  background: linear-gradient(135deg, rgba(204, 106, 61, 0.14), rgba(169, 71, 30, 0.08));
  border-left: 6rpx solid #cc6a3d;
}

.record-card__opponent-label {
  flex-shrink: 0;
  font-size: 22rpx;
  font-weight: 600;
  color: #a9471e;
  background: rgba(204, 106, 61, 0.16);
  padding: 4rpx 12rpx;
  border-radius: 999rpx;
}

.record-card__opponent-name {
  flex: 1;
  min-width: 0;
  font-size: 26rpx;
  font-weight: 700;
  color: #7d3d1b;
}

.record-card__remark {
  margin-top: 14rpx;
  font-size: 24rpx;
  line-height: 1.7;
}

.record-card__failure {
  margin-top: 12rpx;
  display: flex;
  align-items: center;
  gap: 10rpx;
  flex-wrap: wrap;
}
.record-card__failure-label { color: #a9471e; font-size: 22rpx; font-weight: 600; }
.record-card__failure-list { display: flex; gap: 8rpx; flex-wrap: wrap; }
.record-chip--failure { color: #8f3d1b; background: rgba(255, 152, 0, 0.16); }
.record-card__failure-toggle { color: #a9471e; font-size: 22rpx; padding: 4rpx 8rpx; }
.failure-reason-options { display: flex; flex-wrap: wrap; gap: 10rpx; }
.failure-reason-options .segment__item { min-width: 0; padding: 12rpx 20rpx; }

.record-card__time {
  margin-top: 14rpx;
  font-size: 22rpx;
  color: rgba(31, 26, 23, 0.45);
}

.record-card__footer {
  margin-top: 14rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.record-card__footer .record-card__time {
  margin-top: 0;
}

.record-card__history {
  font-size: 22rpx;
  color: rgba(143, 61, 27, 0.72);
  padding: 6rpx 12rpx;
  border-radius: 8rpx;
  background: rgba(198, 93, 46, 0.08);
}

.record-card__history:active {
  background: rgba(198, 93, 46, 0.18);
}

.records-load-more {
  margin-top: 8rpx;
  padding: 22rpx 0;
  border-radius: 20rpx;
  background: rgba(198, 93, 46, 0.08);
  color: #8f3d1b;
  font-size: 26rpx;
  font-weight: 600;
  text-align: center;
}

.records-load-more:active {
  background: rgba(198, 93, 46, 0.18);
}

/* Edit History Popup */
.edit-history__meta {
  padding: 16rpx 0 8rpx;
  font-size: 24rpx;
  color: rgba(31, 26, 23, 0.62);
  border-bottom: 1rpx solid rgba(31, 26, 23, 0.08);
}

.edit-history__list {
  margin-top: 12rpx;
}

.edit-history__item {
  padding: 16rpx 0;
  border-bottom: 1rpx solid rgba(31, 26, 23, 0.06);
}

.edit-history__item:last-child {
  border-bottom: none;
}

.edit-history__item-time {
  font-size: 22rpx;
  color: rgba(31, 26, 23, 0.48);
  margin-bottom: 8rpx;
}

.edit-history__field {
  font-size: 26rpx;
  color: #1f1a17;
  line-height: 1.8;
  padding-left: 8rpx;
}

.stats-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
}

.stats-controls {
  margin-top: 18rpx;
}

.stats-controls__range-picker {
  margin-top: 14rpx;
}

.stats-mode-switcher {
  margin-top: 14rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.admin-overview__filter-label {
  margin-top: 20rpx;
  font-size: 24rpx;
  font-weight: 600;
  color: rgba(31, 26, 23, 0.62);
}

.stats-mode-switcher__item {
  padding: 14rpx 20rpx;
  border-radius: 999rpx;
  background: rgba(204, 106, 61, 0.12);
  color: #7d3d1b;
  font-size: 24rpx;
  font-weight: 600;
}

.stats-mode-switcher__item.is-active {
  background: linear-gradient(135deg, #cc6a3d, #a9471e);
  color: #fffef9;
}

.stats-mode-switcher__item.is-disabled {
  background: rgba(31, 26, 23, 0.06);
  color: rgba(31, 26, 23, 0.25);
}

.stats-card {
  width: 48%;
  margin-bottom: 16rpx;
  padding: 26rpx 24rpx;
  border-radius: 24rpx;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 18rpx 48rpx rgba(72, 49, 28, 0.08);
}

.stats-card__label {
  font-size: 24rpx;
  color: rgba(31, 26, 23, 0.62);
}

.stats-card__value {
  margin-top: 16rpx;
  font-size: 40rpx;
  font-weight: 700;
}

.stats-card__ratio {
  margin-top: 10rpx;
  font-size: 22rpx;
  color: rgba(31, 26, 23, 0.46);
  text-align: right;
}

.rate-text--high {
  color: #1f7a42;
}

.rate-text--low {
  color: #d5b45a;
}

.section-panel {
  padding: 24rpx;
  border-radius: 24rpx;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 18rpx 48rpx rgba(72, 49, 28, 0.08);
}

.section-panel--action {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18rpx;
}

.section-panel__title {
  font-size: 30rpx;
  font-weight: 600;
}

.section-panel__desc {
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: rgba(31, 26, 23, 0.62);
}

.sync-progress {
  display: block;
  width: 100%;
  margin-top: 12rpx;
}

.deck-images-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16rpx;
  margin-top: 18rpx;
}

.deck-image-item,
.deck-image-add {
  position: relative;
  min-width: 0;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 10rpx;
  background: rgba(31, 26, 23, 0.06);
}

.deck-image-item__image {
  width: 100%;
  height: 100%;
}

.deck-image-item__remove {
  position: absolute;
  right: 8rpx;
  bottom: 8rpx;
  padding: 4rpx 12rpx;
  border-radius: 6rpx;
  font-size: 20rpx;
  color: #fff;
  background: rgba(138, 42, 30, 0.88);
}

.deck-image-add {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12rpx;
  box-sizing: border-box;
  text-align: center;
  font-size: 24rpx;
  color: #a9471e;
  border: 1rpx dashed rgba(169, 71, 30, 0.45);
}

.deck-image-preview {
  display: block;
  width: 100%;
  height: 600rpx;
  margin: 12rpx 0 20rpx;
}

.section-panel__result {
  margin-top: 8rpx;
}

.section-panel__result-text {
  display: block;
  word-break: break-all;
}

.section-panel__copy {
  margin: 10rpx 0 0;
  padding: 0 18rpx;
  height: 52rpx;
  line-height: 52rpx;
  border-radius: 999rpx;
  background: rgba(204, 106, 61, 0.1);
  color: #a9471e;
  font-size: 22rpx;
}

.section-panel__button {
  min-width: 160rpx;
  padding: 0 22rpx;
  height: 72rpx;
  border-radius: 999rpx;
  color: #fffef9;
  background: linear-gradient(135deg, #cc6a3d, #a9471e);
  font-size: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.section-panel__buttons {
  display: flex;
  gap: 12rpx;
  flex-shrink: 0;
}

.section-panel__buttons--below {
  margin-top: 18rpx;
  flex-wrap: wrap;
}

.section-panel__button--secondary {
  color: #7d3d1b;
  background: rgba(204, 106, 61, 0.14);
}

.settings-switcher {
  display: flex;
  gap: 14rpx;
  margin-top: 18rpx;
  flex-wrap: wrap;
}

.settings-switcher--floating {
  position: sticky;
  top: 0;
  z-index: 6;
  padding: 10rpx 0 4rpx;
  background: linear-gradient(180deg, rgba(245, 240, 230, 0.96), rgba(245, 240, 230, 0.84));
}

.settings-switcher__item {
  padding: 18rpx 24rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.72);
  font-size: 24rpx;
  color: rgba(31, 26, 23, 0.62);
  box-shadow: 0 10rpx 22rpx rgba(72, 49, 28, 0.06);
}

.settings-switcher__item.is-active {
  background: linear-gradient(135deg, #cc6a3d, #a9471e);
  color: #fffef9;
}

.stats-list__item,
.deck-manage-card,
.settings-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 20rpx 0;
}

.stats-list__item + .stats-list__item,
.deck-manage-card + .deck-manage-card,
.settings-item + .settings-item {
  border-top: 1rpx solid rgba(31, 26, 23, 0.08);
}

.stats-list__name,
.deck-manage-card__name,
.settings-item__name {
  font-size: 28rpx;
  font-weight: 600;
  word-break: break-all;
}

.stats-list__sub,
.deck-manage-card__meta,
.settings-item__meta {
  margin-top: 8rpx;
  font-size: 22rpx;
  color: rgba(31, 26, 23, 0.62);
}

.stats-list__value {
  font-size: 30rpx;
  font-weight: 700;
}

.stats-list__content {
  flex: 1;
  min-width: 0;
}

.stats-list__metrics {
  display: grid;
  grid-template-columns: auto auto;
  column-gap: 12rpx;
  align-items: baseline;
  flex-shrink: 0;
  text-align: right;
}

.stats-list__metric-label {
  font-size: 20rpx;
  color: rgba(31, 26, 23, 0.48);
}

.stats-list__metric-value {
  font-size: 26rpx;
  font-weight: 700;
}

.opponent-share--high {
  color: #1f7a42;
}

.opponent-share--normal {
  color: #1f1a17;
}

.opponent-share--low {
  color: rgba(31, 26, 23, 0.38);
}

/* 饼图 */
.pie-chart__wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.pie-chart__total {
  font-size: 26rpx;
  color: rgba(31, 26, 23, 0.55);
  margin-bottom: 16rpx;
}

.pie-chart__total-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
}

.pie-chart__total-row .pie-chart__total {
  margin-bottom: 16rpx;
}

.pie-chart__help {
  width: 32rpx;
  height: 32rpx;
  margin-bottom: 16rpx;
  border: 2rpx solid rgba(45, 95, 144, 0.72);
  border-radius: 50%;
  color: #2d5f90;
  font-size: 22rpx;
  font-weight: 700;
  line-height: 28rpx;
  text-align: center;
}

.pie-chart__canvas {
  width: 400rpx;
  height: 400rpx;
  flex-shrink: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pie-chart__legend {
  width: 100%;
  margin-top: 20rpx;
}

.pie-chart__legend-item {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 12rpx 0;
}

.pie-chart__legend-item + .pie-chart__legend-item {
  border-top: 1rpx solid rgba(31, 26, 23, 0.08);
}

.pie-chart__legend-color {
  width: 20rpx;
  height: 20rpx;
  border-radius: 4rpx;
  flex-shrink: 0;
}

.pie-chart__legend-color.is-editable {
  width: 30rpx;
  height: 30rpx;
  border-radius: 50%;
  border: 3rpx solid rgba(31, 26, 23, 0.18);
}

.pie-chart__legend-action {
  color: #2d5f90;
  font-size: 22rpx;
  flex-shrink: 0;
}

.pie-color-picker {
  max-width: 620rpx;
}

.pie-color-options {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20rpx;
  padding: 24rpx 8rpx 12rpx;
}

.pie-color-option {
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  border: 5rpx solid transparent;
  box-sizing: border-box;
  justify-self: center;
}

.pie-color-option.is-selected {
  border-color: #1f1a17;
  box-shadow: 0 0 0 5rpx #fffaf2;
}

.pie-rules__body {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  padding: 12rpx 4rpx 8rpx;
  color: rgba(31, 26, 23, 0.76);
  font-size: 24rpx;
  line-height: 1.55;
}

.pie-chart__legend-name {
  flex: 1;
  min-width: 0;
  font-size: 26rpx;
  font-weight: 600;
  word-break: break-all;
}

.pie-chart__legend-share {
  font-size: 26rpx;
  font-weight: 700;
  color: rgba(31, 26, 23, 0.72);
  flex-shrink: 0;
}

.deck-manage-card__delete,
.settings-item__delete,
.settings-item__edit {
  width: 64rpx;
  height: 54rpx;
  box-sizing: border-box;
  border-radius: 999rpx;
  font-size: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.deck-manage-card__delete,
.settings-item__delete {
  background: rgba(169, 71, 30, 0.1);
  color: #a9471e;
}

.settings-item__edit {
  background: rgba(31, 26, 23, 0.08);
  color: #3d3026;
}

.settings-item__edit--wide {
  width: auto;
  min-width: 88rpx;
  padding: 0 18rpx;
}

.settings-item__badge {
  margin-left: 10rpx;
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #cc6a3d, #a9471e);
  color: #fffef9;
  font-size: 20rpx;
  font-weight: 600;
  vertical-align: middle;
}

.settings-item__actions {
  display: flex;
  gap: 8rpx;
  flex-shrink: 0;
}

.settings-item__content {
  flex: 1;
  min-width: 0;
}

.settings-item--switch {
  align-items: flex-start;
}

.settings-item--stack {
  flex-direction: column;
  align-items: stretch;
  gap: 12rpx;
}

.settings-item__input {
  height: 80rpx;
  padding: 0 20rpx;
  box-sizing: border-box;
  border-radius: 20rpx;
  background: rgba(31, 26, 23, 0.04);
  font-size: 26rpx;
}

.empty-state {
  margin-top: 18rpx;
  padding: 48rpx 26rpx;
  border-radius: 24rpx;
  text-align: center;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 18rpx 48rpx rgba(72, 49, 28, 0.08);
}

.empty-state--small {
  padding-top: 32rpx;
  padding-bottom: 32rpx;
}

.empty-state__title {
  font-size: 30rpx;
  font-weight: 600;
}

.empty-state__desc {
  margin-top: 12rpx;
  font-size: 24rpx;
  line-height: 1.7;
  color: rgba(31, 26, 23, 0.62);
}

.empty-state__button {
  margin-top: 24rpx;
  border-radius: 999rpx;
  color: #fffef9;
  background: linear-gradient(135deg, #cc6a3d, #a9471e);
  font-size: 24rpx;
}

.bottom-tabs {
  position: fixed;
  left: 22rpx;
  right: 22rpx;
  bottom: 18rpx;
  z-index: 18;
  display: flex;
  align-items: flex-start;
  padding-top: 6rpx;
  background: rgba(44, 34, 24, 0.92);
  border-radius: 28rpx;
  box-shadow: 0 20rpx 48rpx rgba(31, 26, 23, 0.22);
}

.bottom-tabs__item {
  flex: 1;
  padding: 12rpx 8rpx 14rpx;
  text-align: center;
  color: rgba(255, 250, 243, 0.52);
}

.bottom-tabs__item.is-active {
  color: #fffef9;
}

.bottom-tabs__label {
  font-size: 45rpx;
  font-weight: 600;
}

.overlay {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 40;
  background: rgba(21, 16, 12, 0.34);
  display: flex;
  align-items: center;
  justify-content: center;
}

.sheet {
  width: 92%;
  max-width: 720rpx;
  max-height: 88%;
  padding: 28rpx 26rpx 36rpx;
  box-sizing: border-box;
  border-radius: 24rpx;
  background: #fffaf2;
  overflow-y: auto;
}

.sheet--deck-builder {
  max-height: 92%;
}

/* 战绩录入是完整工作流，使用贴底全宽抽屉；其余弹窗维持居中。 */
.overlay--record {
  align-items: flex-end;
}

.sheet--record {
  width: 100%;
  max-width: none;
  max-height: calc(100% - 24rpx);
  padding-bottom: calc(36rpx + env(safe-area-inset-bottom));
  border-radius: 28rpx 28rpx 0 0;
  animation: record-sheet-slide-up 220ms ease-out;
}

@keyframes record-sheet-slide-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.sheet__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sheet__header-actions {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.sheet__title {
  font-size: 34rpx;
  font-weight: 700;
}

.sheet__action {
  font-size: 24rpx;
  color: #a9471e;
}

.sheet__close {
  font-size: 24rpx;
  color: rgba(31, 26, 23, 0.62);
}

.sheet__label {
  margin-top: 22rpx;
  margin-bottom: 12rpx;
  font-size: 24rpx;
  color: rgba(31, 26, 23, 0.62);
}

.sheet__label-required {
  margin-left: 8rpx;
  color: #a9471e;
  font-weight: 600;
}

.sheet__help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30rpx;
  height: 30rpx;
  margin-left: 8rpx;
  border: 1rpx solid rgba(143, 61, 27, 0.55);
  border-radius: 50%;
  color: #8f3d1b;
  font-size: 20rpx;
  line-height: 1;
}

.sheet__toggle-all {
  margin-top: 22rpx;
  display: inline-flex;
  min-height: 64rpx;
  padding: 0 24rpx;
  border-radius: 999rpx;
  background: rgba(169, 71, 30, 0.1);
  color: #a9471e;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  font-weight: 600;
}

.sheet__input,
.sheet__picker,
.sheet__textarea {
  width: 100%;
  box-sizing: border-box;
  border-radius: 20rpx;
  background: rgba(31, 26, 23, 0.04);
  font-size: 26rpx;
}

.sheet__input {
  height: 80rpx;
  padding: 0 20rpx;
  line-height: 80rpx;
}

.sheet__picker {
  min-height: 80rpx;
  padding: 20rpx;
}

.sheet__picker.is-empty {
  color: rgba(31, 26, 23, 0.52);
}

.metric-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 16rpx;
}

.metric-row__label {
  width: 120rpx;
  flex-shrink: 0;
  font-size: 24rpx;
  color: rgba(31, 26, 23, 0.62);
}

.metric-row__picker {
  flex: 1;
  min-width: 0;
}

.sheet__textarea {
  padding: 20rpx;
  min-height: 80rpx;
}

.sheet__inline-field {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.sheet__input--flex {
  flex: 1;
  min-width: 0;
}

.sheet__side-button {
  min-width: 148rpx;
  height: 80rpx;
  padding: 0 24rpx;
  box-sizing: border-box;
  border-radius: 20rpx;
  background: rgba(169, 71, 30, 0.1);
  color: #a9471e;
  font-size: 24rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sheet__side-button.is-disabled {
  opacity: 0.6;
}

.sheet__side-button--short {
  min-width: 96rpx;
  padding: 0 16rpx;
}

.choice-row,
.segment {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.choice-row-wrap {
  width: 100%;
}

.choice-row--collapsed {
  max-height: 252rpx;
  overflow: hidden;
}

.choice-row__toggle {
  margin-top: 14rpx;
  font-size: 24rpx;
  color: #a9471e;
}

.segment--compact {
  gap: 10rpx;
}

.choice-pill,
.segment__item {
  min-width: 112rpx;
  min-height: 76rpx;
  box-sizing: border-box;
  padding: 18rpx 28rpx;
  border-radius: 999rpx;
  background: rgba(31, 26, 23, 0.06);
  font-size: 28rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.choice-pill.is-active,
.segment__item.is-active {
  background: #c65d2e;
  color: #fffef9;
}

.segment__item--small {
  min-width: 84rpx;
  min-height: 68rpx;
  padding: 14rpx 20rpx;
}

.ocg-rounds {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.ocg-round {
  padding: 18rpx 20rpx;
  border-radius: 20rpx;
  background: rgba(31, 26, 23, 0.04);
}

.ocg-round__label {
  margin-bottom: 12rpx;
  font-size: 24rpx;
  color: rgba(31, 26, 23, 0.62);
}

.stepper__meta {
  font-size: 24rpx;
  color: rgba(31, 26, 23, 0.62);
}

.sheet__hint {
  margin-top: 14rpx;
  font-size: 24rpx;
  color: #8f3d1b;
  font-weight: 600;
}

.stepper {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12rpx;
}

.stepper__button,
.stepper__value {
  width: 88rpx;
  height: 72rpx;
  border-radius: 18rpx;
  background: rgba(31, 26, 23, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30rpx;
}

.stepper__value {
  width: 120rpx;
  font-weight: 700;
}

.stepper__value.is-empty {
  font-size: 24rpx;
  color: rgba(31, 26, 23, 0.52);
}

.stepper--compact {
  margin-top: 16rpx;
}

.stepper__button--compact,
.stepper__value--compact {
  width: 80rpx;
  height: 64rpx;
  font-size: 28rpx;
}

.stepper__value--compact {
  width: 140rpx;
}

.stepper__clear--compact {
  min-width: 96rpx;
  height: 64rpx;
}

.stepper__clear {
  min-width: 108rpx;
  height: 72rpx;
  padding: 0 22rpx;
  box-sizing: border-box;
  border-radius: 18rpx;
  background: rgba(31, 26, 23, 0.06);
  color: rgba(31, 26, 23, 0.62);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
}

.stepper__clear.is-active {
  background: rgba(169, 71, 30, 0.1);
  color: #a9471e;
}

.sheet__submit {
  margin-top: 28rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #cc6a3d, #a9471e);
  color: #fffef9;
  font-size: 28rpx;
}

.md-migrate__hint {
  margin-top: 14rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: rgba(31, 26, 23, 0.62);
}

.md-migrate__modes {
  margin-top: 18rpx;
}

.md-migrate__list {
  margin-top: 18rpx;
  max-height: 480rpx;
  border-radius: 20rpx;
  background: rgba(31, 26, 23, 0.04);
  padding: 8rpx 16rpx;
  box-sizing: border-box;
}

.md-migrate__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 18rpx 14rpx;
  border-radius: 16rpx;
  border: 2rpx solid transparent;
}

.md-migrate__item + .md-migrate__item {
  border-top: 1rpx solid rgba(31, 26, 23, 0.08);
}

.md-migrate__item.is-active {
  background: rgba(204, 106, 61, 0.14);
  border-color: rgba(198, 93, 46, 0.5);
}

.md-migrate__item-name {
  flex: 1;
  min-width: 0;
  font-size: 26rpx;
  font-weight: 600;
  word-break: break-all;
}

.md-migrate__item.is-active .md-migrate__item-name {
  color: #7d3d1b;
}

.md-migrate__item-meta {
  flex-shrink: 0;
  font-size: 22rpx;
  color: rgba(31, 26, 23, 0.55);
}

.md-migrate__footer {
  margin-top: 24rpx;
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.md-migrate__submit {
  flex: 1;
  margin-top: 0;
}

.deck-name-dialog__input {
  height: 84rpx;
  padding: 0 20rpx;
  line-height: 84rpx;
}

.builder-search {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.builder-search__input-wrap {
  position: relative;
  flex: 1;
}

.builder-search__input {
  width: 100%;
  height: 84rpx;
  padding: 0 64rpx 0 20rpx;
  line-height: 84rpx;
}

.builder-search__clear {
  position: absolute;
  top: 50%;
  right: 20rpx;
  width: 36rpx;
  height: 36rpx;
  margin-top: -18rpx;
  border-radius: 50%;
  background: rgba(31, 26, 23, 0.12);
  color: rgba(31, 26, 23, 0.62);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  line-height: 1;
}

.builder-search__button {
  min-width: 132rpx;
  height: 84rpx;
  margin: 0;
  line-height: 84rpx;
}

.builder-search-scroll {
  max-height: 520rpx;
  margin-top: 16rpx;
}

.builder-search-list,
.builder-section-list {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.builder-search-footer {
  padding: 8rpx 0 4rpx;
  text-align: center;
  font-size: 22rpx;
  color: rgba(31, 26, 23, 0.48);
}

.builder-card {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 18rpx;
  border-radius: 20rpx;
  background: rgba(31, 26, 23, 0.04);
}

.builder-card--search {
  cursor: pointer;
}

.builder-card__image {
  width: 108rpx;
  height: 144rpx;
  flex-shrink: 0;
  border-radius: 16rpx;
  background: rgba(31, 26, 23, 0.08);
}

.builder-card__content {
  flex: 1;
  min-width: 0;
}

.builder-card__name {
  font-size: 26rpx;
  font-weight: 600;
  word-break: break-all;
}

.builder-card__meta {
  margin-top: 8rpx;
  font-size: 22rpx;
  color: rgba(31, 26, 23, 0.62);
  word-break: break-all;
}

.builder-group {
  margin-top: 20rpx;
}

.builder-group__label {
  margin-top: 0;
}

.builder-thumb-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
}

.builder-thumb {
  position: relative;
  width: 108rpx;
}

.builder-thumb__image {
  width: 108rpx;
  height: 144rpx;
  border-radius: 16rpx;
  background: rgba(31, 26, 23, 0.08);
}

.builder-thumb__count {
  position: absolute;
  right: 6rpx;
  bottom: 6rpx;
  min-width: 34rpx;
  height: 34rpx;
  padding: 0 8rpx;
  border-radius: 999rpx;
  background: rgba(198, 93, 46, 0.92);
  color: #fffef9;
  font-size: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sheet--compact {
  width: 620rpx;
}

.overlay--nested {
  z-index: 41;
}

.day-calendar {
  display: flex;
  flex-wrap: wrap;
}

.day-calendar__weekday {
  width: calc(100% / 7);
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  color: rgba(31, 26, 23, 0.45);
}

.day-calendar__cell-wrap {
  width: calc(100% / 7);
  padding: 6rpx;
  box-sizing: border-box;
}

.day-calendar__cell {
  height: 76rpx;
  border-radius: 14rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  color: #1f1a17;
  cursor: pointer;
}

.day-calendar__cell--empty {
  cursor: default;
}

.day-calendar__cell.is-today {
  color: #c65d2e;
  font-weight: 600;
}

.day-calendar__cell.is-selected {
  background: #c65d2e;
  color: #fffef9;
  font-weight: 600;
}

.day-calendar__clear {
  margin-top: 18rpx;
  height: 72rpx;
  border-radius: 16rpx;
  background: rgba(31, 26, 23, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  color: rgba(31, 26, 23, 0.55);
  cursor: pointer;
}

.metric-options {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.metric-option {
  width: calc((100% - 48rpx) / 5);
  height: 84rpx;
  border-radius: 16rpx;
  background: rgba(31, 26, 23, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30rpx;
  font-weight: 600;
  color: #1f1a17;
  cursor: pointer;
}

.metric-option.is-selected {
  background: #c65d2e;
  color: #fffef9;
}

.history-picker__list {
  max-height: 460rpx;
  overflow-y: auto;
}

.history-picker__item {
  cursor: pointer;
}

.history-picker__action {
  min-width: 72rpx;
  height: 54rpx;
  padding: 0 18rpx;
  box-sizing: border-box;
  border-radius: 999rpx;
  background: rgba(169, 71, 30, 0.1);
  color: #a9471e;
  font-size: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.history-picker__empty {
  margin-top: 12rpx;
}

.builder-action-card {
  margin-top: 18rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.builder-action-card__image {
  width: 220rpx;
  height: 294rpx;
  border-radius: 20rpx;
  background: rgba(31, 26, 23, 0.08);
}

.builder-action-card__meta {
  margin-top: 14rpx;
  text-align: center;
  font-size: 22rpx;
  color: rgba(31, 26, 23, 0.62);
}

.builder-action-row {
  margin-top: 18rpx;
  padding: 18rpx 20rpx;
  border-radius: 18rpx;
  background: rgba(31, 26, 23, 0.04);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.builder-action-row--button {
  justify-content: center;
}

.builder-action-row__label {
  font-size: 26rpx;
  font-weight: 600;
}

.builder-action-stepper {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.builder-action-buttons {
  margin-top: 24rpx;
  display: flex;
  gap: 12rpx;
}

.builder-action-buttons__item {
  flex: 1;
  height: 84rpx;
  border-radius: 18rpx;
  background: rgba(31, 26, 23, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  font-weight: 600;
}

.builder-action-buttons__item--primary {
  background: #c65d2e;
  color: #fffef9;
}

.sheet--card-detail {
  width: 660rpx;
  max-height: 88%;
}

.card-detail {
  margin-top: 18rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.card-detail__image {
  width: 260rpx;
  height: 348rpx;
  border-radius: 22rpx;
  background: rgba(31, 26, 23, 0.08);
}

.card-detail__line {
  margin-top: 12rpx;
  width: 100%;
  text-align: center;
  font-size: 24rpx;
  color: rgba(31, 26, 23, 0.72);
  word-break: break-all;
}

.card-detail__desc {
  margin-top: 18rpx;
  width: 100%;
  max-height: 320rpx;
  overflow-y: auto;
  padding: 20rpx;
  box-sizing: border-box;
  border-radius: 18rpx;
  background: rgba(31, 26, 23, 0.04);
  font-size: 24rpx;
  line-height: 1.7;
  color: #1f1a17;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 关于页 */
.about-panel__qrcode {
  display: block;
  width: 360rpx;
  height: 360rpx;
  margin: 20rpx auto 0;
  border-radius: 16rpx;
  background: rgba(31, 26, 23, 0.04);
}

.about-panel__hint {
  margin-top: 12rpx;
  text-align: center;
  font-size: 22rpx;
  color: rgba(31, 26, 23, 0.45);
}

/* 留言板 */
.message-board__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18rpx;
}

.message-board__toggle {
  flex-shrink: 0;
  font-size: 24rpx;
  color: #a9471e;
}

.message-composer {
  margin-top: 20rpx;
  padding: 20rpx;
  border-radius: 18rpx;
  background: rgba(31, 26, 23, 0.04);
}

.message-composer__input {
  width: 100%;
  box-sizing: border-box;
  min-height: 96rpx;
  font-size: 26rpx;
  line-height: 1.6;
}

.message-composer__footer {
  margin-top: 12rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.message-composer__count {
  font-size: 22rpx;
  color: rgba(31, 26, 23, 0.45);
}

.message-composer__submit {
  min-width: 140rpx;
  height: 64rpx;
}

.message-board__sort {
  margin-top: 20rpx;
}

.message-board__empty {
  margin-top: 24rpx;
  text-align: center;
  font-size: 24rpx;
  color: rgba(31, 26, 23, 0.45);
}

.message-list {
  margin-top: 8rpx;
}

.message-item {
  padding: 20rpx 0;
}

.message-item + .message-item {
  border-top: 1rpx solid rgba(31, 26, 23, 0.08);
}

.message-item__header {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.message-item__floor {
  font-size: 24rpx;
  font-weight: 700;
  color: #a9471e;
}

.message-item__tag {
  padding: 2rpx 14rpx;
  border-radius: 999rpx;
  font-size: 20rpx;
}

.message-item__tag--mine {
  color: #7d3d1b;
  background: rgba(204, 106, 61, 0.14);
}

.message-item__tag--admin {
  color: #fffef9;
  background: linear-gradient(135deg, #cc6a3d, #a9471e);
}

.message-item__time {
  margin-left: auto;
  font-size: 22rpx;
  color: rgba(31, 26, 23, 0.45);
}

.message-item__content {
  margin-top: 12rpx;
  font-size: 26rpx;
  line-height: 1.7;
  word-break: break-all;
  white-space: pre-wrap;
}

.message-item__actions {
  margin-top: 14rpx;
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.message-item__react {
  padding: 8rpx 22rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  color: rgba(31, 26, 23, 0.62);
  background: rgba(31, 26, 23, 0.05);
}

.message-item__react.is-active {
  color: #fffef9;
  background: linear-gradient(135deg, #cc6a3d, #a9471e);
}

.message-item__react--down.is-active {
  color: #fffef9;
  background: rgba(31, 26, 23, 0.55);
}

.message-item__remove {
  margin-left: auto;
  font-size: 22rpx;
  color: rgba(180, 60, 50, 0.8);
}
</style>
