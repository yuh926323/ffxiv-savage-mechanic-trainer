<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import longFuseBombUrl from './assets/bombs/long-fuse-bomb.png'
import shortFuseBombUrl from './assets/bombs/short-fuse-bomb.png'
import { defaultMechanicId, mechanicPresets } from './presets/m3sFinalFusedown'

const selectedMechanicId = ref(defaultMechanicId)
const selectedStrategyId = ref(mechanicPresets[defaultMechanicId].defaultStrategyId)
const selectedVariantId = ref(getRandomVariantId(mechanicPresets[defaultMechanicId].strategies[selectedStrategyId.value]))
const selectedUserJob = ref('MT')
const canvasRef = ref(null)
const isDarkMode = ref(true)
const isArenaEditMode = ref(false)
const isBombEditMode = ref(false)
const showUserGuide = ref(false)
const arenaDrag = ref(null)
const bombDrag = ref(null)
let animationFrameId = 0
let lastFrameTime = 0
let activePatternRotation = 0

const bombImages = {
  short: { image: null, loaded: false, src: shortFuseBombUrl },
  long: { image: null, loaded: false, src: longFuseBombUrl },
}

const WAYMARK_COLORS = {
  A: { fill: '#d64f45', stroke: '#ffd7d2', text: '#fff7f5' },
  1: { fill: '#d64f45', stroke: '#ffd7d2', text: '#fff7f5' },
  B: { fill: '#d6a63d', stroke: '#fff1b8', text: '#1f1300' },
  2: { fill: '#d6a63d', stroke: '#fff1b8', text: '#1f1300' },
  C: { fill: '#4c7ee8', stroke: '#dbeafe', text: '#f8fbff' },
  3: { fill: '#4c7ee8', stroke: '#dbeafe', text: '#f8fbff' },
  D: { fill: '#8c62d9', stroke: '#ede9fe', text: '#fbfaff' },
  4: { fill: '#8c62d9', stroke: '#ede9fe', text: '#fbfaff' },
}

const ROLE_COLORS = {
  tank: { fill: '#2d3a80', stroke: '#8fb4ff', text: '#f8fbff', soft: 'rgba(45, 58, 128, 0.18)' },
  healer: { fill: '#346624', stroke: '#9be87c', text: '#f7fff3', soft: 'rgba(52, 102, 36, 0.18)' },
  dps: { fill: '#732828', stroke: '#ff9c96', text: '#fff7f6', soft: 'rgba(115, 40, 40, 0.18)' },
}

const mechanicList = Object.values(mechanicPresets)
const currentPreset = computed(() => mechanicPresets[selectedMechanicId.value])
const playerJobOptions = computed(() => currentPreset.value.players.map((player) => player.job))
const strategyList = computed(() => Object.values(currentPreset.value.strategies))
const currentStrategy = computed(() => currentPreset.value.strategies[selectedStrategyId.value])
const currentVariant = computed(() => currentStrategy.value.variants[selectedVariantId.value])
const gameState = reactive(createInitialState(currentPreset.value, currentVariant.value))
const userPlayer = computed(() => gameState.entities.players.find((player) => player.isUser))
const isEditMode = computed(() => isArenaEditMode.value || isBombEditMode.value)
const isMechanicRevealed = computed(() => gameState.status !== 'idle')
const userGuidePosition = computed(() => {
  const user = userPlayer.value
  if (!user) return null
  return getMovementPositions(gameState.movementStage)[user.job] ?? null
})
const bombPatternText = computed(() => {
  const longMarkers = gameState.longBombMarkers?.join('、') || '尚未產生'
  return `孤立長線：${gameState.isolatedLongMarker}，長線：${longMarkers}`
})
const arenaParameterText = computed(() =>
  JSON.stringify(
    {
      arena: {
        size: Math.round(gameState.arena.size),
      },
      arenaCircles: {
        circleInset: Math.round(gameState.arenaCircles.circleInset),
        outerRadius: Math.round(gameState.arenaCircles.outerRadius),
        innerRadius: Math.round(gameState.arenaCircles.innerRadius),
      },
    },
    null,
    2,
  ),
)
const bombParameterText = computed(() =>
  JSON.stringify(
    {
      bombOffset: Math.round(gameState.bombOffset),
      bombAoeRadius: Math.round(gameState.bombAoeRadius),
      playerAoeRadius: Math.round(gameState.playerAoeRadius),
      isolatedLongMarker: gameState.isolatedLongMarker,
      longBombMarkers: gameState.longBombMarkers,
      bombs: gameState.entities.bombs.map((bomb) => ({
        id: bomb.id,
        marker: bomb.marker,
        fuse: bomb.fuse,
        x: Math.round(bomb.x),
        y: Math.round(bomb.y),
      })),
    },
    null,
    2,
  ),
)

const statusText = computed(() => {
  const labels = {
    idle: '準備中',
    running: '練習中',
    failed: '失敗',
    success: '成功',
  }

  return labels[gameState.status]
})

const phaseText = computed(() => {
  if (gameState.status === 'idle') return '觀察炸彈配置後開始練習'
  if (gameState.status === 'failed') return gameState.failureMessage || '被爆炸 AoE 擊中'
  if (gameState.status === 'success') return '短線與長線爆炸皆存活'
  if (!gameState.isIgnited) return '觀察階段：導火線尚未點燃'
  if (!gameState.explodedFuses.short) return '導火線已點燃：等待短線爆炸'
  if (!gameState.explodedFuses.long) return '短線已爆炸：等待長線爆炸'
  return '機制完成'
})

const statusClass = computed(() => {
  if (gameState.status === 'failed') return 'border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950/60 dark:text-red-100'
  if (gameState.status === 'success') return 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-100'
  if (gameState.status === 'running') return 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950/60 dark:text-sky-100'
  return 'border-zinc-200 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'
})

const timelineProgressPercent = computed(() => {
  if (gameState.status === 'idle') return 0
  return clamp((gameState.elapsed / gameState.timeline.longExplosionAt) * 100, 0, 100)
})

const timelineClockText = computed(() => `${formatTimer(gameState.elapsed)} / ${formatTimer(gameState.timeline.longExplosionAt)}s`)

const activeTimelineLabel = computed(() => {
  if (gameState.status === 'idle') return '按下開始後隨機產生配置'
  if (gameState.status === 'failed') return '練習失敗'
  if (gameState.status === 'success') return '練習成功'
  if (!gameState.isIgnited) return '觀察階段'
  if (!gameState.explodedFuses.short) return '導火線點燃，短線即將爆炸'
  if (!gameState.explodedFuses.long) return '短線爆炸後，長線即將爆炸'
  return '機制完成'
})

const timelineSegments = computed(() => {
  const total = gameState.timeline.longExplosionAt
  return [
    { label: '觀察', time: 0, progress: 0, align: 'start' },
    { label: '點燃', time: gameState.timeline.ignitionAt, progress: (gameState.timeline.ignitionAt / total) * 100 },
    { label: '短線爆炸', time: gameState.timeline.shortExplosionAt, progress: (gameState.timeline.shortExplosionAt / total) * 100 },
    { label: '長線爆炸', time: gameState.timeline.longExplosionAt, progress: 100, align: 'end' },
  ]
})

const strategyInstruction = computed(() => {
  const user = userPlayer.value
  if (!user) {
    return {
      title: currentStrategy.value.name,
      summary: currentStrategy.value.description,
      steps: [],
      note: '',
    }
  }

  if (!isMechanicRevealed.value) {
    return {
      title: `${currentStrategy.value.name}：${user.job}`,
      summary: getStrategySummary(user.job),
      steps: [
        '按下開始後會隨機產生炸彈配置，並揭曉你身上的長短線。',
        '如果你是短線，第一波出去放玩家 AoE；如果你是長線，第一波先在中間安全點等待短線爆炸。',
      ],
      note: getStrategyRouteNote(user.job),
    }
  }

  const firstMarker = getStageMarkerForJob('first', user.job, user.fuse)
  const afterShortMarker = getStageMarkerForJob('afterShort', user.job, user.fuse)
  const firstStep = firstMarker
    ? `第一波你是短線，先到 ${formatMarker(firstMarker)} 外側放玩家 AoE。`
    : '第一波你是長線，先留在中間安全點，避免吃到短線炸彈與短線玩家 AoE。'
  const afterShortStep = afterShortMarker
    ? `短線爆炸後，前往 ${formatMarker(afterShortMarker)} 外側，準備處理長線爆炸。`
    : '短線爆炸後回到中間安全點，讓長線組出去處理第二波。'

  return {
    title: `${currentStrategy.value.name}：${user.job} / ${fuseLabel(user.fuse)}`,
    summary: getStrategySummary(user.job),
    steps: [firstStep, afterShortStep],
    note: `目前長線炸彈：${gameState.longBombMarkers.join('、')}。${getStrategyRouteNote(user.job)}`,
  }
})

function getRandomVariantId(strategy) {
  const variantIds = Object.keys(strategy.variants)
  return variantIds[Math.floor(Math.random() * variantIds.length)]
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function createInitialState(preset, variant) {
  const players = clone(preset.players).map((player) => {
    const fuse = variant.roleFuses[player.job] ?? player.fuse

    return {
      ...player,
      isUser: player.job === selectedUserJob.value,
      fuse,
      targetX: player.x,
      targetY: player.y,
    }
  })

  return {
    status: 'idle',
    phase: 0,
    elapsed: 0,
    failureMessage: '',
    isIgnited: false,
    strategyVariantId: variant.id,
    movementStage: 'first',
    botTargets: {
      first: false,
      afterShort: false,
    },
    bombPatternRotation: 0,
    isolatedLongMarker: preset.bombPattern.baseIsolatedLongMarker,
    longBombMarkers: [...preset.bombPattern.baseLongMarkers],
    arena: { ...preset.arena },
    canvas: { ...preset.canvas },
    markerPoints: clone(preset.markerPoints),
    arenaCircles: { ...preset.arenaCircles },
    timeline: { ...preset.timeline },
    bombOffset: preset.bombOffset,
    playerOutsideOffset: preset.playerOutsideOffset,
    botMoveLeadTime: preset.botMoveLeadTime,
    bombAoeRadius: preset.bombAoeRadius,
    playerAoeRadius: preset.playerAoeRadius,
    playerBaseSpeed: preset.playerBaseSpeed,
    activeAoEs: [],
    timelineEffects: [],
    explodedFuses: {
      short: false,
      long: false,
    },
    entities: {
      players,
      bombs: clone(preset.bombs),
    },
  }
}

function applyPreset(preset, rotation = activePatternRotation) {
  Object.assign(gameState, createInitialState(preset, currentVariant.value))
  applyBombPattern(rotation)
  lastFrameTime = performance.now()
}

function handleMechanicChange() {
  selectedStrategyId.value = currentPreset.value.defaultStrategyId
  selectedVariantId.value = getRandomVariantId(currentPreset.value.strategies[selectedStrategyId.value])
  if (!playerJobOptions.value.includes(selectedUserJob.value)) {
    selectedUserJob.value = currentPreset.value.players[0].job
  }
  applyPreset(currentPreset.value)
}

function handleStrategyChange() {
  selectedVariantId.value = getRandomVariantId(currentStrategy.value)
  activePatternRotation = getRandomPatternRotation()
  applyPreset(currentPreset.value)
}

function handleUserJobChange() {
  applyPreset(currentPreset.value, activePatternRotation)
}

function startRun() {
  activePatternRotation = getRandomPatternRotation()
  selectedVariantId.value = getRandomVariantId(currentStrategy.value)
  applyPreset(currentPreset.value, activePatternRotation)
  gameState.status = 'running'
  gameState.phase = 1
  lastFrameTime = performance.now()
}

function resetRun() {
  applyPreset(currentPreset.value, activePatternRotation)
}

function randomizeCurrentBombPattern() {
  activePatternRotation = getRandomPatternRotation()
  selectedVariantId.value = getRandomVariantId(currentStrategy.value)
  applyPreset(currentPreset.value, activePatternRotation)
}

function getRandomPatternRotation() {
  const rotations = getAvailablePatternRotations()
  if (rotations.length <= 1) return rotations[0] ?? 0

  let next = rotations[Math.floor(Math.random() * rotations.length)]
  if (next === activePatternRotation) {
    const otherRotations = rotations.filter((rotation) => rotation !== activePatternRotation)
    next = otherRotations[Math.floor(Math.random() * otherRotations.length)] ?? next
  }

  return next
}

function getAvailablePatternRotations() {
  return [0, 2]
}

function applyBombPattern(rotation) {
  const normalizedRotation = normalizePatternRotation(rotation)
  activePatternRotation = normalizedRotation
  gameState.bombPatternRotation = normalizedRotation
  gameState.isolatedLongMarker = rotateMarker(currentPreset.value.bombPattern.baseIsolatedLongMarker, normalizedRotation)
  gameState.longBombMarkers = currentPreset.value.bombPattern.baseLongMarkers.map((marker) => rotateMarker(marker, normalizedRotation))

  const longMarkers = new Set(gameState.longBombMarkers)
  gameState.entities.bombs.forEach((bomb) => {
    bomb.fuse = longMarkers.has(bomb.marker) ? 'long' : 'short'
    bomb.hasExploded = false
    bomb.isLit = false
  })

  syncMarkerGeometry()
}

function normalizePatternRotation(rotation) {
  const rotations = getAvailablePatternRotations()
  return rotations.includes(rotation) ? rotation : (rotations[0] ?? 0)
}

function rotateMarker(marker, steps) {
  const clockwiseMap = {
    1: '2',
    2: '3',
    3: '4',
    4: '1',
    A: 'B',
    B: 'C',
    C: 'D',
    D: 'A',
  }

  let rotated = marker
  for (let index = 0; index < steps; index += 1) {
    rotated = clockwiseMap[rotated]
  }

  return rotated
}

function resolveOutsideMarker(markerRule, playerFuse) {
  if (!Array.isArray(markerRule)) {
    return rotateMarker(markerRule, gameState.bombPatternRotation)
  }

  if (currentVariant.value.outsideMarkers?.dynamic === 'hectorPairs') {
    return getHectorSafePairMarker(markerRule, playerFuse)
  }

  return markerRule[0]
}

function getHectorSafePairMarker(markerPair, playerFuse) {
  const safeMarker = markerPair.find((marker) => {
    const bomb = gameState.entities.bombs.find((candidate) => candidate.marker === marker)
    return bomb && bomb.fuse !== playerFuse
  })

  return safeMarker ?? markerPair[0]
}

function getStageMarkerForJob(stage, job, playerFuse) {
  const markerRule = currentVariant.value.outsideMarkers?.[stage]?.[job]
  if (!markerRule) return null

  return resolveOutsideMarker(markerRule, playerFuse)
}

function formatMarker(marker) {
  return `${marker} 標點`
}

function getStrategySummary(job) {
  if (currentStrategy.value.id === 'hector') {
    return 'Hector 解法會依職責配對選邊：自己的導火線是短線時先出去，長線時先在中心；出外側時要選不會踩到同導火線炸彈的那一側。'
  }

  return 'Game8 解法是短線組先出去、長線組先在中心。短線爆炸後雙方交換，長線組出去，短線組回到中心安全點。'
}

function getStrategyRouteNote(job) {
  if (currentStrategy.value.id !== 'hector') {
    return 'Game8 的站位會跟著目前短線分組與炸彈配置旋轉。'
  }

  const hectorPairs = {
    MT: ['A', 'D'],
    D1: ['A', 'D'],
    ST: ['B', 'C'],
    D2: ['B', 'C'],
    H1: ['1', '2'],
    D3: ['1', '2'],
    H2: ['3', '4'],
    D4: ['3', '4'],
  }
  const pair = hectorPairs[job]
  if (!pair) return 'Hector 會依職責配對選擇安全側。'

  return `${job} 固定在 ${pair[0]} / ${pair[1]} 這組中選點；實際目標會避開與你同導火線的炸彈。`
}

function findCenterSafePoint(stage) {
  const center = { x: gameState.arena.centerX, y: gameState.arena.centerY }
  const threats = getCenterSafeThreats(stage)
  const searchRadius = gameState.arena.size * 0.2
  const step = Math.max(2, Math.round(gameState.arena.size / 220))
  let bestPoint = center
  let bestMargin = getSafetyMargin(center, threats)

  for (let y = center.y - searchRadius; y <= center.y + searchRadius; y += step) {
    for (let x = center.x - searchRadius; x <= center.x + searchRadius; x += step) {
      const point = { x, y }
      const margin = getSafetyMargin(point, threats)
      const currentDistanceFromCenter = Math.hypot(point.x - center.x, point.y - center.y)
      const bestDistanceFromCenter = Math.hypot(bestPoint.x - center.x, bestPoint.y - center.y)

      if (margin > bestMargin || (Math.abs(margin - bestMargin) < 0.25 && currentDistanceFromCenter < bestDistanceFromCenter)) {
        bestPoint = point
        bestMargin = margin
      }
    }
  }

  return {
    x: Math.round(bestPoint.x),
    y: Math.round(bestPoint.y),
  }
}

function getCenterSafeThreats(stage) {
  const fuse = getExplosionFuseForStage(stage)
  const outsideMarkers = currentVariant.value.outsideMarkers?.[stage] ?? {}

  const bombThreats = gameState.entities.bombs
    .filter((bomb) => bomb.fuse === fuse)
    .map((bomb) => ({
      x: bomb.x,
      y: bomb.y,
      radius: gameState.bombAoeRadius,
    }))

  const playerThreats = gameState.entities.players
    .filter((player) => player.fuse === fuse && outsideMarkers[player.job])
    .map((player) => {
      const resolvedMarker = resolveOutsideMarker(outsideMarkers[player.job], player.fuse)
      const markerPoint = gameState.markerPoints[resolvedMarker]
      const offset = gameState.playerOutsideOffset * (gameState.arena.size / currentPreset.value.arena.size)
      const point = calculateOutwardPoint(markerPoint, offset)

      return {
        x: point.x,
        y: point.y,
        radius: gameState.playerAoeRadius,
      }
    })

  return [...bombThreats, ...playerThreats]
}

function getExplosionFuseForStage(stage) {
  return stage === 'afterShort' ? 'long' : 'short'
}

function getSafetyMargin(point, threats) {
  if (!threats.length) return Infinity

  return Math.min(...threats.map((threat) => Math.hypot(point.x - threat.x, point.y - threat.y) - threat.radius))
}

function getMovementPositions(stage) {
  const outsideMarkers = currentVariant.value.outsideMarkers?.[stage] ?? {}
  const centerSafePoint = findCenterSafePoint(stage)

  return Object.fromEntries(
    gameState.entities.players.map((player) => {
      const marker = outsideMarkers[player.job]
      if (marker) {
        const resolvedMarker = resolveOutsideMarker(marker, player.fuse)
        const point = gameState.markerPoints[resolvedMarker]
        const offset = gameState.playerOutsideOffset * (gameState.arena.size / currentPreset.value.arena.size)
        return [player.job, calculateOutwardPoint(point, offset)]
      }

      return [player.job, centerSafePoint]
    }),
  )
}

function assignBotTargets(stage) {
  const positions = getMovementPositions(stage)
  gameState.movementStage = stage
  gameState.botTargets[stage] = true

  gameState.entities.players.forEach((player) => {
    if (player.isUser) return

    const position = positions[player.job]
    if (!position) return

    player.targetX = position.x
    player.targetY = position.y
  })
}

function toggleDarkMode() {
  isDarkMode.value = !isDarkMode.value
}

function toggleArenaEditMode() {
  const next = !isArenaEditMode.value
  isArenaEditMode.value = next
  if (next) isBombEditMode.value = false
  arenaDrag.value = null
  bombDrag.value = null
}

function copyArenaParameters() {
  navigator.clipboard?.writeText(arenaParameterText.value)
}

function toggleBombEditMode() {
  const next = !isBombEditMode.value
  isBombEditMode.value = next
  if (next) isArenaEditMode.value = false
  arenaDrag.value = null
  bombDrag.value = null
}

function copyBombParameters() {
  navigator.clipboard?.writeText(bombParameterText.value)
}

function gameLoop(timestamp) {
  const deltaSeconds = Math.min((timestamp - lastFrameTime) / 1000 || 0, 0.05)
  lastFrameTime = timestamp

  updateTemporaryEffects(timestamp)

  if (gameState.status === 'running') {
    updateTimeline(deltaSeconds, timestamp)
  }

  if (gameState.status === 'running' || gameState.status === 'success') {
    movePlayers(deltaSeconds)
  }

  render(timestamp)
  animationFrameId = requestAnimationFrame(gameLoop)
}

function updateTimeline(deltaSeconds, timestamp) {
  gameState.elapsed = Math.min(gameState.timeline.longExplosionAt, gameState.elapsed + deltaSeconds)

  if (!gameState.isIgnited && gameState.elapsed >= gameState.timeline.ignitionAt) {
    igniteFuses(timestamp)
  }

  maybeAssignBotTargets()

  if (!gameState.explodedFuses.short && gameState.elapsed >= gameState.timeline.shortExplosionAt) {
    evaluateExplosion('short', timestamp)
  }

  if (!gameState.explodedFuses.long && gameState.elapsed >= gameState.timeline.longExplosionAt) {
    evaluateExplosion('long', timestamp)
  }
}

function maybeAssignBotTargets() {
  if (!gameState.botTargets.first && gameState.elapsed >= gameState.timeline.shortExplosionAt - gameState.botMoveLeadTime) {
    assignBotTargets('first')
  }

  if (
    gameState.explodedFuses.short &&
    !gameState.botTargets.afterShort &&
    gameState.elapsed >= gameState.timeline.longExplosionAt - gameState.botMoveLeadTime
  ) {
    assignBotTargets('afterShort')
  }
}

function igniteFuses(timestamp) {
  gameState.isIgnited = true
  gameState.phase = 2
  gameState.entities.bombs.forEach((bomb) => {
    bomb.isLit = true
  })
  gameState.timelineEffects.push({
    label: '點燃',
    x: gameState.arena.x + gameState.arena.size / 2,
    y: gameState.arena.y + gameState.arena.size / 2,
    radius: gameState.arena.size * 0.5,
    createdAt: timestamp,
    expiresAt: timestamp + 700,
  })
}

function updateTemporaryEffects(timestamp) {
  gameState.activeAoEs = gameState.activeAoEs.filter((aoe) => aoe.expiresAt > timestamp)
  gameState.timelineEffects = gameState.timelineEffects.filter((effect) => effect.expiresAt > timestamp)
}

function movePlayers(deltaSeconds) {
  const travelDistance = gameState.playerBaseSpeed * deltaSeconds

  gameState.entities.players.forEach((player) => {
    const dx = player.targetX - player.x
    const dy = player.targetY - player.y
    const distance = Math.hypot(dx, dy)

    if (distance <= travelDistance || distance < 0.5) {
      player.x = player.targetX
      player.y = player.targetY
      return
    }

    player.x += (dx / distance) * travelDistance
    player.y += (dy / distance) * travelDistance
  })
}

function evaluateExplosion(fuse, timestamp) {
  if (gameState.explodedFuses[fuse]) return

  gameState.explodedFuses[fuse] = true

  const bombCenters = gameState.entities.bombs
    .filter((bomb) => bomb.fuse === fuse)
    .map((bomb) => {
      bomb.hasExploded = true
      return {
        id: bomb.id,
        type: 'bomb',
        label: `炸彈 ${bomb.id}`,
        x: bomb.x,
        y: bomb.y,
        radius: gameState.bombAoeRadius,
      }
    })

  const playerCenters = gameState.entities.players
    .filter((player) => player.fuse === fuse)
    .map((player) => ({
      id: player.id,
      type: 'player',
      label: player.job,
      x: player.x,
      y: player.y,
      radius: gameState.playerAoeRadius,
    }))

  const aoeCenters = [...bombCenters, ...playerCenters]
  aoeCenters.forEach((center) => {
    gameState.activeAoEs.push({
      ...center,
      fuse,
      createdAt: timestamp,
      expiresAt: timestamp + gameState.timeline.aoeFlashMs,
    })
  })

  const hitPlayers = getHitPlayers(aoeCenters)
  if (hitPlayers.length) {
    hitPlayers.forEach((player) => {
      player.isDead = true
    })
    gameState.failureMessage = formatFailureMessage(hitPlayers)
    gameState.status = 'failed'
    return
  }

  if (fuse === 'short') {
    gameState.phase = 3
    gameState.movementStage = 'afterShort'
  }

  if (fuse === 'long' && gameState.status === 'running') {
    gameState.status = 'success'
    gameState.phase = 4
  }
}

function checkCollision(player, aoeCenters) {
  return aoeCenters.some((center) => {
    if (center.type === 'player' && center.id === player.id) return false
    return Math.hypot(center.x - player.x, center.y - player.y) <= center.radius
  })
}

function getHitPlayers(aoeCenters) {
  return gameState.entities.players.filter((player) => !player.isDead && checkCollision(player, aoeCenters))
}

function formatFailureMessage(hitPlayers) {
  const userWasHit = hitPlayers.some((player) => player.isUser)
  const teammateJobs = hitPlayers.filter((player) => !player.isUser).map((player) => player.job)

  if (userWasHit && teammateJobs.length) return `你和隊友 ${teammateJobs.join('、')} 被爆炸 AoE 擊中`
  if (userWasHit) return '你被爆炸 AoE 擊中'
  return `隊友 ${teammateJobs.join('、')} 被爆炸 AoE 擊中`
}

function handleCanvasMouseDown(event) {
  if (isArenaEditMode.value) {
    beginArenaEditDrag(event)
    return
  }

  if (isBombEditMode.value) {
    beginBombEditDrag(event)
    return
  }

  if (gameState.status !== 'running' && gameState.status !== 'success') return

  const point = getCanvasPoint(event)
  const target = clampToArena(point.x, point.y)
  const user = userPlayer.value

  user.targetX = target.x
  user.targetY = target.y
}

function handleCanvasMouseMove(event) {
  if (bombDrag.value) {
    const canvasPoint = getCanvasPoint(event)
    const point = clampToArena(canvasPoint.x, canvasPoint.y)
    const bomb = gameState.entities.bombs.find((candidate) => candidate.id === bombDrag.value.id)

    if (bomb) {
      bomb.x = point.x
      bomb.y = point.y
    }

    return
  }

  if (!arenaDrag.value) return

  const point = getCanvasPoint(event)
  const drag = arenaDrag.value
  const circleCenter = calculateCircleCenters()[drag.centerKey]

  if (drag.type === 'outerRadius') {
    gameState.arenaCircles.outerRadius = clamp(Math.hypot(point.x - circleCenter.x, point.y - circleCenter.y), 80, gameState.arena.size / 2)
    syncMarkerGeometry()
  }

  if (drag.type === 'innerRadius') {
    gameState.arenaCircles.innerRadius = clamp(Math.hypot(point.x - circleCenter.x, point.y - circleCenter.y), 40, gameState.arena.size / 4)
    syncMarkerGeometry()
  }

  if (drag.type === 'circleInset') {
    const corner = getCircleCorner(drag.centerKey)
    const towardCenter = normalize(gameState.arena.centerX - corner.x, gameState.arena.centerY - corner.y)
    const projected = (point.x - corner.x) * towardCenter.x + (point.y - corner.y) * towardCenter.y
    gameState.arenaCircles.circleInset = clamp(projected, 0, gameState.arena.size / 2 - 5)
    syncMarkerGeometry()
  }
}

function handleCanvasMouseUp() {
  arenaDrag.value = null
  bombDrag.value = null
}

function beginArenaEditDrag(event) {
  const point = getCanvasPoint(event)
  const handles = getArenaEditHandles()
  const hit = handles.find((handle) => Math.hypot(point.x - handle.x, point.y - handle.y) <= handle.hitRadius)

  if (hit) {
    arenaDrag.value = hit
  }
}

function beginBombEditDrag(event) {
  const point = getCanvasPoint(event)
  const hit = gameState.entities.bombs
    .map((bomb) => ({
      id: bomb.id,
      distance: Math.hypot(point.x - bomb.x, point.y - bomb.y),
    }))
    .filter((candidate) => candidate.distance <= 34)
    .sort((a, b) => a.distance - b.distance)[0]

  if (hit) {
    bombDrag.value = { id: hit.id }
  }
}

function getCanvasPoint(event) {
  const canvas = canvasRef.value
  const rect = canvas.getBoundingClientRect()

  return {
    x: ((event.clientX - rect.left) / rect.width) * gameState.canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * gameState.canvas.height,
  }
}

function getArenaEditHandles() {
  return Object.entries(calculateCircleCenters()).flatMap(([centerKey, point]) => {
    const inward = normalize(gameState.arena.centerX - point.x, gameState.arena.centerY - point.y)

    return [
      {
        centerKey,
        type: 'outerRadius',
        x: point.x + inward.x * gameState.arenaCircles.outerRadius,
        y: point.y + inward.y * gameState.arenaCircles.outerRadius,
        hitRadius: 18,
      },
      {
        centerKey,
        type: 'innerRadius',
        x: point.x + inward.x * gameState.arenaCircles.innerRadius,
        y: point.y + inward.y * gameState.arenaCircles.innerRadius,
        hitRadius: 16,
      },
      {
        centerKey,
        type: 'circleInset',
        x: point.x,
        y: point.y,
        hitRadius: 18,
      },
    ]
  })
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function calculateCircleCenters() {
  const { x, y, size } = gameState.arena
  const right = x + size
  const bottom = y + size
  const inset = gameState.arenaCircles.circleInset

  return {
    topLeft: { x: x + inset, y: y + inset },
    topRight: { x: right - inset, y: y + inset },
    bottomRight: { x: right - inset, y: bottom - inset },
    bottomLeft: { x: x + inset, y: bottom - inset },
  }
}

function calculateMarkerPoints() {
  const { x, y, size } = gameState.arena
  const centerX = x + size / 2
  const centerY = y + size / 2
  const inset = gameState.arenaCircles.circleInset
  const centers = calculateCircleCenters()
  const halfGap = (size - inset * 2) / 2
  const axisOffset = Math.sqrt(Math.max(gameState.arenaCircles.outerRadius ** 2 - halfGap ** 2, 0))
  const diagonalHalfGap = halfGap * Math.SQRT2
  const diagonalOffset = Math.sqrt(Math.max(gameState.arenaCircles.outerRadius ** 2 - diagonalHalfGap ** 2, 0)) / Math.SQRT2

  return {
    1: { x: Math.round(centerX - diagonalOffset), y: Math.round(centerY - diagonalOffset) },
    A: { x: Math.round(centerX), y: Math.round(centers.bottomLeft.y - axisOffset) },
    2: { x: Math.round(centerX + diagonalOffset), y: Math.round(centerY - diagonalOffset) },
    D: { x: Math.round(centers.topRight.x - axisOffset), y: Math.round(centerY) },
    B: { x: Math.round(centers.topLeft.x + axisOffset), y: Math.round(centerY) },
    4: { x: Math.round(centerX - diagonalOffset), y: Math.round(centerY + diagonalOffset) },
    C: { x: Math.round(centerX), y: Math.round(centers.topLeft.y + axisOffset) },
    3: { x: Math.round(centerX + diagonalOffset), y: Math.round(centerY + diagonalOffset) },
  }
}

function syncMarkerGeometry() {
  const markerPoints = calculateMarkerPoints()
  Object.assign(gameState.markerPoints, markerPoints)

  gameState.entities.bombs.forEach((bomb) => {
    const marker = markerPoints[bomb.marker]
    if (!marker) return
    const point = calculateOutwardPoint(marker, gameState.bombOffset)
    bomb.x = point.x
    bomb.y = point.y
  })

  if (gameState.botTargets?.[gameState.movementStage]) {
    assignBotTargets(gameState.movementStage)
  }
}

function calculateOutwardPoint(point, distance) {
  const dx = point.x - gameState.arena.centerX
  const dy = point.y - gameState.arena.centerY
  const length = Math.hypot(dx, dy) || 1

  return {
    x: Math.round(point.x + (dx / length) * distance),
    y: Math.round(point.y + (dy / length) * distance),
  }
}

function getCircleCorner(centerKey) {
  const { x, y, size } = gameState.arena
  const corners = {
    topLeft: { x, y },
    topRight: { x: x + size, y },
    bottomRight: { x: x + size, y: y + size },
    bottomLeft: { x, y: y + size },
  }

  return corners[centerKey]
}

function handleArenaSizeInput(event) {
  const nextSize = clamp(Number(event.target.value), 480, gameState.canvas.width)
  const previousSize = gameState.arena.size
  const ratio = nextSize / previousSize

  gameState.arena.size = nextSize
  gameState.arena.x = (gameState.canvas.width - nextSize) / 2
  gameState.arena.y = (gameState.canvas.height - nextSize) / 2
  gameState.arena.centerX = gameState.canvas.width / 2
  gameState.arena.centerY = gameState.canvas.height / 2
  gameState.arenaCircles.circleInset *= ratio
  gameState.arenaCircles.outerRadius *= ratio
  gameState.arenaCircles.innerRadius *= ratio
  gameState.bombOffset *= ratio
  gameState.bombAoeRadius *= ratio
  gameState.playerAoeRadius *= ratio
  syncMarkerGeometry()
}

function handleOuterRadiusInput(event) {
  gameState.arenaCircles.outerRadius = clamp(Number(event.target.value), 80, gameState.arena.size / 2)
  syncMarkerGeometry()
}

function handleInnerRadiusInput(event) {
  gameState.arenaCircles.innerRadius = clamp(Number(event.target.value), 40, gameState.arena.size / 4)
  syncMarkerGeometry()
}

function handleCircleInsetInput(event) {
  gameState.arenaCircles.circleInset = clamp(Number(event.target.value), 0, gameState.arena.size / 2 - 5)
  syncMarkerGeometry()
}

function handleBombOffsetInput(event) {
  gameState.bombOffset = clamp(Number(event.target.value), 0, gameState.arena.size * 0.16)
  syncMarkerGeometry()
}

function clampToArena(x, y) {
  const { x: arenaX, y: arenaY, size } = gameState.arena
  const padding = 18

  return {
    x: Math.min(Math.max(x, arenaX + padding), arenaX + size - padding),
    y: Math.min(Math.max(y, arenaY + padding), arenaY + size - padding),
  }
}

function remainingTo(mark) {
  if (gameState.status !== 'running') return mark
  return Math.max(0, mark - gameState.elapsed)
}

function formatTimer(value) {
  return value.toFixed(1).padStart(4, '0')
}

function fuseLabel(fuse) {
  return fuse === 'short' ? '短導火線' : '長導火線'
}

function getRole(job) {
  if (job.startsWith('T') || job === 'MT' || job === 'ST') return 'tank'
  if (job.startsWith('H')) return 'healer'
  return 'dps'
}

function getRoleColors(job) {
  return ROLE_COLORS[getRole(job)]
}

function getWaymarkColors(label) {
  return WAYMARK_COLORS[label] ?? { fill: '#64748b', stroke: '#e2e8f0', text: '#f8fafc' }
}

function render(timestamp = performance.now()) {
  const canvas = canvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  const { width, height } = gameState.canvas

  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height

  ctx.clearRect(0, 0, width, height)
  drawArenaBase(ctx, width, height)
  drawArenaDiagram(ctx)
  drawArenaEditHandles(ctx)
  drawTimelineEffects(ctx, timestamp)
  drawTargetLines(ctx)
  drawUserGuide(ctx)
  drawBombAoEPreviews(ctx)
  drawPlayerAoEPreviews(ctx)
  drawBombs(ctx, timestamp)
  drawBombEditHandles(ctx)
  drawAoEs(ctx, timestamp)
  drawPlayers(ctx)
}

function theme() {
  if (isDarkMode.value) {
    return {
      canvasStart: '#0f172a',
      canvasEnd: '#111827',
      arenaFill: '#1f2937',
      arenaStroke: '#e2e8f0',
      grid: 'rgba(226, 232, 240, 0.22)',
      text: '#f8fafc',
      mutedText: '#cbd5e1',
      targetLine: 'rgba(96, 165, 250, 0.95)',
      botLine: 'rgba(203, 213, 225, 0.42)',
    }
  }

  return {
    canvasStart: '#e2e8f0',
    canvasEnd: '#f8fafc',
    arenaFill: '#edf2f7',
    arenaStroke: '#1f2937',
    grid: 'rgba(31, 41, 55, 0.2)',
    text: '#111827',
    mutedText: '#475569',
    targetLine: 'rgba(37, 99, 235, 0.9)',
    botLine: 'rgba(71, 85, 105, 0.45)',
  }
}

function drawArenaBase(ctx, width, height) {
  const colors = theme()
  const gradient = ctx.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, colors.canvasStart)
  gradient.addColorStop(1, colors.canvasEnd)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
}

function drawArenaDiagram(ctx) {
  const colors = theme()
  const { x, y, size, centerX, centerY } = gameState.arena
  const { outerRadius, innerRadius } = gameState.arenaCircles
  const circleCenters = Object.values(calculateCircleCenters())

  ctx.save()
  ctx.fillStyle = colors.arenaFill
  ctx.strokeStyle = colors.arenaStroke
  ctx.lineWidth = 4
  ctx.fillRect(x, y, size, size)
  ctx.strokeRect(x, y, size, size)

  ctx.beginPath()
  ctx.moveTo(x, centerY)
  ctx.lineTo(x + size, centerY)
  ctx.moveTo(centerX, y)
  ctx.lineTo(centerX, y + size)
  ctx.strokeStyle = colors.grid
  ctx.lineWidth = 1.5
  ctx.stroke()

  circleCenters.forEach((point) => {
    ctx.beginPath()
    ctx.arc(point.x, point.y, outerRadius, 0, Math.PI * 2)
    ctx.strokeStyle = isDarkMode.value ? 'rgba(226, 232, 240, 0.26)' : 'rgba(120, 113, 108, 0.34)'
    ctx.lineWidth = 3
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(point.x, point.y, innerRadius, 0, Math.PI * 2)
    ctx.strokeStyle = isDarkMode.value ? 'rgba(148, 163, 184, 0.3)' : 'rgba(87, 83, 78, 0.36)'
    ctx.lineWidth = 2
    ctx.stroke()
  })

  drawMarkerLabels(ctx)
  ctx.restore()

  drawCardinalLabels(ctx)
}

function drawArenaEditHandles(ctx) {
  if (!isArenaEditMode.value) return

  const handles = getArenaEditHandles()

  ctx.save()
  ctx.font = '800 11px Inter, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  handles.forEach((handle) => {
    const isOuter = handle.type === 'outerRadius'
    const isInnerRadius = handle.type === 'innerRadius'

    ctx.beginPath()
    ctx.arc(handle.x, handle.y, isOuter ? 8 : 7, 0, Math.PI * 2)
    ctx.fillStyle = isOuter ? '#38bdf8' : isInnerRadius ? '#fbbf24' : '#fb7185'
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 2
    ctx.fill()
    ctx.stroke()

    if (handle.centerKey === 'topLeft') {
      const label = isOuter ? '大' : isInnerRadius ? '小' : '心'
      ctx.fillStyle = '#0f172a'
      ctx.fillText(label, handle.x, handle.y)
    }
  })

  ctx.restore()
}

function normalize(dx, dy) {
  const length = Math.hypot(dx, dy) || 1
  return { x: dx / length, y: dy / length }
}

function drawMarkerLabels(ctx) {
  Object.entries(gameState.markerPoints).forEach(([label, point]) => {
    const isLetter = Number.isNaN(Number(label))
    const markerColors = getWaymarkColors(label)

    ctx.save()

    if (isLetter) {
      ctx.beginPath()
      ctx.arc(point.x, point.y, 19, 0, Math.PI * 2)
    } else {
      ctx.beginPath()
      ctx.rect(point.x - 17, point.y - 17, 34, 34)
    }

    ctx.shadowColor = markerColors.fill
    ctx.shadowBlur = 10
    ctx.fillStyle = markerColors.fill
    ctx.strokeStyle = markerColors.stroke
    ctx.lineWidth = 3
    ctx.fill()
    ctx.stroke()
    ctx.shadowBlur = 0

    ctx.fillStyle = markerColors.text
    ctx.font = '900 15px Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, point.x, point.y + 1)
    ctx.restore()
  })
}

function drawCardinalLabels(ctx) {
  const colors = theme()
  const { x, y, size } = gameState.arena
  const center = x + size / 2
  const labels = [
    ['N', center, y - 22],
    ['E', x + size + 24, center + 7],
    ['S', center, y + size + 34],
    ['W', x - 24, center + 7],
  ]

  ctx.save()
  ctx.fillStyle = colors.text
  ctx.font = '800 20px Inter, system-ui, sans-serif'
  ctx.textAlign = 'center'
  labels.forEach(([label, labelX, labelY]) => ctx.fillText(label, labelX, labelY))
  ctx.restore()
}

function drawTimelineEffects(ctx, timestamp) {
  gameState.timelineEffects.forEach((effect) => {
    const progress = Math.max(0, Math.min(1, (effect.expiresAt - timestamp) / 700))
    ctx.save()
    ctx.beginPath()
    ctx.arc(effect.x, effect.y, effect.radius * (1.05 - progress * 0.35), 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(250, 204, 21, ${0.15 + progress * 0.55})`
    ctx.lineWidth = 8
    ctx.stroke()
    ctx.fillStyle = `rgba(250, 204, 21, ${0.05 + progress * 0.1})`
    ctx.fill()
    ctx.restore()
  })
}

function drawTargetLines(ctx) {
  const colors = theme()

  ctx.save()
  ctx.lineWidth = 2
  gameState.entities.players.forEach((player) => {
    const distance = Math.hypot(player.targetX - player.x, player.targetY - player.y)
    if (distance < 3) return
    const roleColors = getRoleColors(player.job)

    ctx.beginPath()
    ctx.setLineDash([8, 8])
    ctx.strokeStyle = player.isUser ? roleColors.stroke : colors.botLine
    ctx.moveTo(player.x, player.y)
    ctx.lineTo(player.targetX, player.targetY)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.beginPath()
    ctx.arc(player.targetX, player.targetY, player.isUser ? 8 : 5, 0, Math.PI * 2)
    ctx.strokeStyle = player.isUser ? roleColors.stroke : colors.mutedText
    ctx.stroke()
  })
  ctx.restore()
}

function drawUserGuide(ctx) {
  if (!showUserGuide.value) return

  const guide = userGuidePosition.value
  if (!guide) return

  ctx.save()
  ctx.beginPath()
  ctx.arc(guide.x, guide.y, 20, 0, Math.PI * 2)
  ctx.strokeStyle = '#60a5fa'
  ctx.lineWidth = 3
  ctx.setLineDash([6, 6])
  ctx.stroke()
  ctx.setLineDash([])

  ctx.fillStyle = isDarkMode.value ? 'rgba(191, 219, 254, 0.95)' : 'rgba(29, 78, 216, 0.95)'
  ctx.font = '800 12px Inter, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(`建議 ${userPlayer.value.job}`, guide.x, guide.y - 28)
  ctx.restore()
}

function drawBombAoEPreviews(ctx) {
  if (!isBombEditMode.value) return

  gameState.entities.bombs.forEach((bomb) => {
    ctx.save()
    ctx.beginPath()
    ctx.arc(bomb.x, bomb.y, gameState.bombAoeRadius, 0, Math.PI * 2)
    ctx.fillStyle = bomb.fuse === 'short' ? 'rgba(245, 158, 11, 0.06)' : 'rgba(20, 184, 166, 0.06)'
    ctx.strokeStyle = bomb.fuse === 'short' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(20, 184, 166, 0.2)'
    ctx.lineWidth = 2
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  })
}

function drawPlayerAoEPreviews(ctx) {
  if (!isBombEditMode.value) return

  gameState.entities.players.forEach((player) => {
    const roleColors = getRoleColors(player.job)

    ctx.save()
    ctx.beginPath()
    ctx.arc(player.x, player.y, gameState.playerAoeRadius, 0, Math.PI * 2)
    ctx.fillStyle = roleColors.soft
    ctx.strokeStyle = roleColors.stroke
    ctx.lineWidth = 2
    ctx.setLineDash([9, 7])
    ctx.fill()
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = isDarkMode.value ? '#f8fafc' : '#0f172a'
    ctx.font = '800 11px Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`${player.job} AoE`, player.x, player.y - gameState.playerAoeRadius - 8)
    ctx.restore()
  })
}

function drawBombs(ctx, timestamp) {
  if (!isMechanicRevealed.value && !isBombEditMode.value) return

  gameState.entities.bombs.forEach((bomb) => {
    const isShort = bomb.fuse === 'short'
    const pulse = gameState.isIgnited ? 1 + Math.sin(timestamp / 140) * 0.08 : 1
    const imageInfo = bombImages[isShort ? 'short' : 'long']
    const imageSize = bomb.hasExploded ? 72 : 87
    const half = imageSize / 2

    ctx.save()
    ctx.translate(bomb.x, bomb.y)
    ctx.scale(pulse, pulse)
    ctx.globalAlpha = bomb.hasExploded ? 0.45 : 1
    ctx.shadowColor = isShort ? 'rgba(245, 158, 11, 0.65)' : 'rgba(20, 184, 166, 0.65)'
    ctx.shadowBlur = gameState.isIgnited && !bomb.hasExploded ? 18 : 6

    if (imageInfo.loaded && imageInfo.image) {
      ctx.drawImage(imageInfo.image, -half, -half, imageSize, imageSize)
    } else {
      ctx.rotate(Math.PI / 4)
      ctx.fillStyle = bomb.hasExploded ? '#64748b' : isShort ? '#f59e0b' : '#14b8a6'
      ctx.strokeStyle = bomb.hasExploded ? '#94a3b8' : isShort ? '#fef3c7' : '#ccfbf1'
      ctx.lineWidth = gameState.isIgnited && !bomb.hasExploded ? 5 : 3
      ctx.fillRect(-half, -half, imageSize, imageSize)
      ctx.strokeRect(-half, -half, imageSize, imageSize)
    }
    ctx.restore()

    if (gameState.isIgnited && !bomb.hasExploded) {
      ctx.save()
      ctx.strokeStyle = isShort ? '#fef08a' : '#99f6e4'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(bomb.x, bomb.y + 22)
      ctx.lineTo(bomb.x, bomb.y + 45)
      ctx.stroke()
      ctx.restore()
    }
  })
}

function drawBombEditHandles(ctx) {
  if (!isBombEditMode.value) return

  gameState.entities.bombs.forEach((bomb) => {
    const isDragging = bombDrag.value?.id === bomb.id

    ctx.save()
    ctx.beginPath()
    ctx.arc(bomb.x, bomb.y, isDragging ? 28 : 24, 0, Math.PI * 2)
    ctx.strokeStyle = isDragging ? '#38bdf8' : '#f8fafc'
    ctx.lineWidth = isDragging ? 4 : 3
    ctx.setLineDash([6, 5])
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = '#0f172a'
    ctx.strokeStyle = '#f8fafc'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(bomb.x + 24, bomb.y - 24, 13, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#f8fafc'
    ctx.font = '900 11px Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(bomb.id), bomb.x + 24, bomb.y - 24)
    ctx.restore()
  })
}

function drawAoEs(ctx, timestamp) {
  gameState.activeAoEs.forEach((aoe) => {
    const progress = Math.max(0, Math.min(1, (aoe.expiresAt - timestamp) / gameState.timeline.aoeFlashMs))
    const opacity = 0.2 + progress * 0.3

    ctx.save()
    ctx.beginPath()
    ctx.arc(aoe.x, aoe.y, aoe.radius, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(248, 113, 113, ${opacity})`
    ctx.strokeStyle = `rgba(239, 68, 68, ${0.35 + progress * 0.55})`
    ctx.lineWidth = 4
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = isDarkMode.value ? 'rgba(254, 226, 226, 0.95)' : 'rgba(127, 29, 29, 0.9)'
    ctx.font = '800 13px Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(aoe.label, aoe.x, aoe.y - aoe.radius - 8)
    ctx.restore()
  })
}

function drawPlayers(ctx) {
  gameState.entities.players.forEach((player) => {
    const isShort = player.fuse === 'short'
    const roleColors = getRoleColors(player.job)

    ctx.save()
    ctx.beginPath()
    ctx.arc(player.x, player.y, player.isUser ? 18 : 15, 0, Math.PI * 2)
    ctx.shadowColor = roleColors.fill
    ctx.shadowBlur = player.isUser ? 12 : 5
    ctx.fillStyle = player.isDead ? '#ef4444' : roleColors.fill
    ctx.strokeStyle = player.isUser ? '#f8fafc' : roleColors.stroke
    ctx.lineWidth = player.isUser ? 5 : 3
    ctx.fill()
    ctx.stroke()
    ctx.shadowBlur = 0

    ctx.fillStyle = roleColors.text
    ctx.font = '800 12px Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(player.job, player.x, player.y)

    if (isMechanicRevealed.value) {
      ctx.fillStyle = isShort ? '#fff1b8' : '#ccfbf1'
      ctx.font = '800 11px Inter, system-ui, sans-serif'
      ctx.fillText(isShort ? '短' : '長', player.x, player.y + 28)
    }
    ctx.restore()
  })
}

function loadBombImages() {
  Object.values(bombImages).forEach((entry) => {
    const image = new Image()
    image.onload = () => {
      entry.loaded = true
    }
    image.src = entry.src
    entry.image = image
  })
}

watch(isDarkMode, (enabled) => {
  localStorage.setItem('theme', enabled ? 'dark' : 'light')
})

onMounted(() => {
  loadBombImages()

  const savedTheme = localStorage.getItem('theme')
  if (savedTheme) {
    isDarkMode.value = savedTheme === 'dark'
  } else {
    isDarkMode.value = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
  }

  lastFrameTime = performance.now()
  animationFrameId = requestAnimationFrame(gameLoop)
})

onUnmounted(() => {
  cancelAnimationFrame(animationFrameId)
})
</script>

<template>
  <main
    :class="{ dark: isDarkMode }"
    class="min-h-screen bg-slate-100 px-4 py-5 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-8"
  >
    <button
      class="fixed right-4 top-4 z-20 h-10 rounded-lg border border-slate-300 bg-white/95 px-3 text-sm font-bold text-slate-800 shadow-sm backdrop-blur transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:hover:bg-slate-800"
      type="button"
      @click="toggleDarkMode"
    >
      {{ isDarkMode ? '淺色' : '深色' }}
    </button>

    <div class="mx-auto flex max-w-7xl flex-col gap-5">
      <header class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div class="max-w-3xl">
          <p class="text-sm font-semibold text-sky-700 dark:text-sky-300">FFXIV 零式機制練習器</p>
          <h1 class="mt-2 text-3xl font-bold text-slate-950 dark:text-white sm:text-4xl">
            {{ currentPreset.displayName }}
          </h1>
          <p class="mt-2 text-base text-slate-600 dark:text-slate-300">
            {{ currentPreset.description }}
          </p>
        </div>

        <div class="flex w-full flex-col gap-3 sm:w-80">
          <label class="flex flex-col gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            機制選擇
            <select
              v-model="selectedMechanicId"
              class="h-11 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-800"
              @change="handleMechanicChange"
            >
              <option v-for="mechanic in mechanicList" :key="mechanic.id" :value="mechanic.id">
                {{ mechanic.displayName }}
              </option>
            </select>
          </label>

          <label class="flex flex-col gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            解法
            <select
              v-model="selectedStrategyId"
              class="h-11 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800 dark:focus:ring-sky-800"
              :disabled="gameState.status === 'running'"
              @change="handleStrategyChange"
            >
              <option v-for="strategy in strategyList" :key="strategy.id" :value="strategy.id">
                {{ strategy.name }}
              </option>
            </select>
          </label>

          <label class="flex flex-col gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            控制路線
            <select
              v-model="selectedUserJob"
              class="h-11 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800 dark:focus:ring-sky-800"
              :disabled="gameState.status === 'running'"
              @change="handleUserJobChange"
            >
              <option v-for="job in playerJobOptions" :key="job" :value="job">
                {{ job }}
              </option>
            </select>
          </label>
        </div>
      </header>

      <div :class="['grid gap-5', isEditMode ? 'xl:grid-cols-1' : 'xl:grid-cols-[minmax(0,1fr)_370px]']">
        <section class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div :class="['grid gap-4', isEditMode ? 'lg:grid-cols-[minmax(0,1fr)_360px]' : '']">
            <div>
              <section class="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p class="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">時間軸</p>
                    <p class="text-base font-bold text-slate-950 dark:text-white">{{ activeTimelineLabel }}</p>
                  </div>
                  <span class="font-mono text-sm font-bold text-slate-700 dark:text-slate-200">{{ timelineClockText }}</span>
                </div>

                <div class="mt-3 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div
                    class="h-full rounded-full bg-gradient-to-r from-sky-500 via-amber-400 to-red-500 transition-[width] duration-150"
                    :style="{ width: timelineProgressPercent + '%' }"
                  ></div>
                </div>

                <div class="relative mt-4 h-10 text-xs text-slate-500 dark:text-slate-400">
                  <div
                    v-for="segment in timelineSegments"
                    :key="segment.label"
                    class="absolute top-0 flex flex-col gap-1"
                    :class="{
                      'items-start': segment.align === 'start',
                      'items-end -translate-x-full': segment.align === 'end',
                      'items-center -translate-x-1/2': !segment.align,
                    }"
                    :style="{ left: segment.progress + '%' }"
                  >
                    <span class="h-2 w-px bg-slate-300 dark:bg-slate-700"></span>
                    <span class="whitespace-nowrap font-bold text-slate-700 dark:text-slate-200">{{ segment.label }}</span>
                    <span class="font-mono">{{ formatTimer(segment.time) }}s</span>
                  </div>
                </div>
              </section>

              <canvas
                ref="canvasRef"
                :width="gameState.canvas.width"
                :height="gameState.canvas.height"
                :class="[
                  'aspect-square w-full rounded-lg border border-slate-900 bg-slate-900',
                  isEditMode ? 'cursor-crosshair' : 'cursor-default',
                ]"
                @mousedown="handleCanvasMouseDown"
                @mousemove="handleCanvasMouseMove"
                @mouseup="handleCanvasMouseUp"
                @mouseleave="handleCanvasMouseUp"
              ></canvas>
              <div class="mt-3 flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between">
                <span>開始後點擊場地設定 {{ userPlayer.job }} 移動目標。</span>
                <span v-if="isMechanicRevealed">目前配置：{{ currentStrategy.name }}，{{ currentVariant.shortGroupLabel }}，{{ bombPatternText }}。</span>
                <span v-else>按下開始後會隨機產生炸彈配置與玩家長短線。</span>
              </div>
            </div>

            <section
              v-if="isArenaEditMode"
              class="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"
            >
              <h2 class="text-lg font-bold text-slate-950 dark:text-white">場地調整</h2>
              <div class="mt-3 grid gap-4 text-sm text-slate-700 dark:text-slate-300">
                <label class="grid gap-2">
                  <span class="flex items-center justify-between">
                    場地大小
                    <strong class="font-mono">{{ Math.round(gameState.arena.size) }}px</strong>
                  </span>
                  <input
                    :value="gameState.arena.size"
                    type="range"
                    min="480"
                    :max="gameState.canvas.width"
                    step="1"
                    @input="handleArenaSizeInput"
                  />
                </label>
                <label class="grid gap-2">
                  <span class="flex items-center justify-between">
                    大圈半徑
                    <strong class="font-mono">{{ Math.round(gameState.arenaCircles.outerRadius) }}px</strong>
                  </span>
                  <input
                    :value="gameState.arenaCircles.outerRadius"
                    type="range"
                    min="80"
                    :max="gameState.arena.size / 2"
                    step="1"
                    @input="handleOuterRadiusInput"
                  />
                </label>
                <label class="grid gap-2">
                  <span class="flex items-center justify-between">
                    小圈半徑
                    <strong class="font-mono">{{ Math.round(gameState.arenaCircles.innerRadius) }}px</strong>
                  </span>
                  <input
                    :value="gameState.arenaCircles.innerRadius"
                    type="range"
                    min="40"
                    :max="gameState.arena.size / 4"
                    step="1"
                    @input="handleInnerRadiusInput"
                  />
                </label>
                <label class="grid gap-2">
                  <span class="flex items-center justify-between">
                    圓心內縮距離
                    <strong class="font-mono">{{ Math.round(gameState.arenaCircles.circleInset) }}px</strong>
                  </span>
                  <input
                    :value="gameState.arenaCircles.circleInset"
                    type="range"
                    min="0"
                    :max="gameState.arena.size / 2 - 5"
                    step="1"
                    @input="handleCircleInsetInput"
                  />
                </label>
                <p class="rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 dark:border-slate-800 dark:bg-slate-900">
                  Canvas 控制點：藍點調大圈半徑、黃點調小圈半徑、紅點調圓心內縮距離。場地大小會等比例縮放圓、標點、炸彈 AoE 與玩家 AoE。
                </p>
                <pre class="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{{ arenaParameterText }}</pre>
                <button
                  class="h-10 rounded-lg border border-slate-300 bg-white px-3 font-bold text-slate-800 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                  type="button"
                  @click="copyArenaParameters"
                >
                  複製場地參數
                </button>
              </div>
            </section>

            <section
              v-if="isBombEditMode"
              class="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"
            >
              <h2 class="text-lg font-bold text-slate-950 dark:text-white">炸彈調整</h2>
              <div class="mt-3 grid gap-4 text-sm text-slate-700 dark:text-slate-300">
                <label class="grid gap-2">
                  <span class="flex items-center justify-between">
                    炸彈外偏移
                    <strong class="font-mono">{{ Math.round(gameState.bombOffset) }}px</strong>
                  </span>
                  <input
                    :value="gameState.bombOffset"
                    type="range"
                    min="0"
                    :max="gameState.arena.size * 0.16"
                    step="1"
                    @input="handleBombOffsetInput"
                  />
                </label>
                <label class="grid gap-2">
                  <span class="flex items-center justify-between">
                    炸彈 AoE 半徑
                    <strong class="font-mono">{{ Math.round(gameState.bombAoeRadius) }}px</strong>
                  </span>
                  <input v-model.number="gameState.bombAoeRadius" type="range" min="40" max="320" step="1" />
                </label>
                <label class="grid gap-2">
                  <span class="flex items-center justify-between">
                    玩家 AoE 半徑
                    <strong class="font-mono">{{ Math.round(gameState.playerAoeRadius) }}px</strong>
                  </span>
                  <input v-model.number="gameState.playerAoeRadius" type="range" min="20" max="220" step="1" />
                </label>
                <p class="rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 dark:border-slate-800 dark:bg-slate-900">
                  炸彈預設從標點往場外偏移。拖曳 Canvas 上的炸彈本體可微調實際位置；玩家周圍虛線圓是玩家 AoE 預覽。
                </p>
                <pre class="max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{{ bombParameterText }}</pre>
                <button
                  class="h-10 rounded-lg border border-slate-300 bg-white px-3 font-bold text-slate-800 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                  type="button"
                  @click="copyBombParameters"
                >
                  複製炸彈參數
                </button>
              </div>
            </section>
          </div>
        </section>

        <aside :class="['flex flex-col gap-4', isEditMode ? 'xl:grid xl:grid-cols-3' : '']">
          <section :class="['rounded-lg border p-4 shadow-sm', statusClass]">
            <p class="text-sm font-semibold">目前狀態</p>
            <p class="mt-2 text-3xl font-bold">{{ statusText }}</p>
            <p class="mt-1 text-sm">{{ phaseText }}</p>
          </section>

          <section class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 class="text-lg font-bold text-slate-950 dark:text-white">操作</h2>
            <div class="mt-3 grid grid-cols-2 gap-3">
              <button
                class="h-11 rounded-lg bg-sky-600 px-4 font-bold text-white shadow-sm transition hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
                :disabled="gameState.status === 'running'"
                @click="startRun"
              >
                開始
              </button>
              <button
                class="h-11 rounded-lg border border-slate-300 bg-white px-4 font-bold text-slate-800 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
                @click="resetRun"
              >
                重置
              </button>
            </div>
            <label
              class="mt-3 flex h-11 items-center justify-between rounded-lg border border-slate-300 bg-white px-4 font-bold text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              顯示建議位置
              <input
                v-model="showUserGuide"
                class="h-5 w-5 accent-sky-600"
                type="checkbox"
              />
            </label>
          </section>

          <section class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 class="text-lg font-bold text-slate-950 dark:text-white">玩家</h2>
            <div class="mt-3 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <span class="text-slate-600 dark:text-slate-300">控制角色</span>
              <span class="font-bold text-blue-700 dark:text-blue-300">{{ userPlayer.job }}</span>
            </div>
            <div class="flex items-center justify-between border-b border-slate-100 py-3 dark:border-slate-800">
              <span class="text-slate-600 dark:text-slate-300">身上炸彈</span>
              <span class="font-bold text-amber-700 dark:text-amber-300">
                {{ isMechanicRevealed ? fuseLabel(userPlayer.fuse) : '開始後揭曉' }}
              </span>
            </div>
            <div class="flex items-center justify-between pt-3">
              <span class="text-slate-600 dark:text-slate-300">經過時間</span>
              <span class="font-mono font-bold">{{ formatTimer(gameState.elapsed) }}s</span>
            </div>
          </section>

          <section class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 class="text-lg font-bold text-slate-950 dark:text-white">站位解法</h2>
            <div class="mt-3 grid gap-3 text-sm leading-6 text-slate-700 dark:text-slate-300">
              <p class="font-bold text-slate-950 dark:text-white">{{ strategyInstruction.title }}</p>
              <p>{{ strategyInstruction.summary }}</p>
              <ol class="grid gap-2">
                <li
                  v-for="(step, index) in strategyInstruction.steps"
                  :key="step"
                  class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950"
                >
                  <span class="mr-2 font-mono font-bold text-sky-700 dark:text-sky-300">{{ index + 1 }}.</span>
                  {{ step }}
                </li>
              </ol>
              <p class="rounded-lg bg-slate-100 px-3 py-2 text-xs leading-5 text-slate-600 dark:bg-slate-950 dark:text-slate-400">
                {{ strategyInstruction.note }}
              </p>
            </div>
          </section>

        </aside>
      </div>
    </div>
  </main>
</template>
