const arena = { x: 0, y: 0, size: 800, centerX: 400, centerY: 400 }

const arenaCircles = {
  circleInset: 215,
  outerRadius: 400,
  innerRadius: 200,
}

const bombOffset = 42
const playerOutsideOffset = 35

function calculateCircleCenters(sourceArena, circles) {
  const { x, y, size } = sourceArena
  const right = x + size
  const bottom = y + size
  const inset = circles.circleInset

  return {
    topLeft: { x: x + inset, y: y + inset },
    topRight: { x: right - inset, y: y + inset },
    bottomRight: { x: right - inset, y: bottom - inset },
    bottomLeft: { x: x + inset, y: bottom - inset },
  }
}

function calculateMarkerPoints(sourceArena, circles) {
  const { x, y, size } = sourceArena
  const centerX = x + size / 2
  const centerY = y + size / 2
  const inset = circles.circleInset
  const centers = calculateCircleCenters(sourceArena, circles)
  const halfGap = (size - inset * 2) / 2
  const axisOffset = Math.sqrt(Math.max(circles.outerRadius ** 2 - halfGap ** 2, 0))
  const diagonalHalfGap = halfGap * Math.SQRT2
  const diagonalOffset = Math.sqrt(Math.max(circles.outerRadius ** 2 - diagonalHalfGap ** 2, 0)) / Math.SQRT2

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

const markerPoints = calculateMarkerPoints(arena, arenaCircles)

const centerPositions = {
  MT: { x: 370, y: 420 },
  ST: { x: 390, y: 430 },
  H1: { x: 360, y: 410 },
  H2: { x: 380, y: 440 },
  D1: { x: 370, y: 420 },
  D2: { x: 390, y: 430 },
  D3: { x: 360, y: 410 },
  D4: { x: 380, y: 440 },
}

const postShortCenterPositions = {
  MT: { x: 420, y: 380 },
  ST: { x: 410, y: 370 },
  H1: { x: 440, y: 390 },
  H2: { x: 430, y: 360 },
  D1: { x: 420, y: 380 },
  D2: { x: 410, y: 370 },
  D3: { x: 440, y: 390 },
  D4: { x: 430, y: 360 },
}

function outwardPoint(marker, distance = 35) {
  const point = markerPoints[marker]
  const dx = point.x - arena.centerX
  const dy = point.y - arena.centerY
  const length = Math.hypot(dx, dy) || 1

  return {
    x: Math.round(point.x + (dx / length) * distance),
    y: Math.round(point.y + (dy / length) * distance),
  }
}

function outwardFromPoint(point, distance) {
  const dx = point.x - arena.centerX
  const dy = point.y - arena.centerY
  const length = Math.hypot(dx, dy) || 1

  return {
    x: Math.round(point.x + (dx / length) * distance),
    y: Math.round(point.y + (dy / length) * distance),
  }
}

const outsideMarkerPositions = Object.fromEntries(
  Object.keys(markerPoints).map((marker) => [marker, outwardPoint(marker, playerOutsideOffset)]),
)

function bomb(id, marker, fuse) {
  return {
    id,
    marker,
    fuse,
    hasExploded: false,
    isLit: false,
    ...outwardFromPoint(markerPoints[marker], bombOffset),
  }
}

const supportShortOutsideMarkers = {
  first: {
    MT: 'D',
    ST: 'C',
    H1: '2',
    H2: '4',
  },
  afterShort: {
    D1: 'A',
    D2: 'B',
    D3: '1',
    D4: '3',
  },
}

const dpsShortOutsideMarkers = {
  first: {
    D1: 'D',
    D2: 'C',
    D3: '2',
    D4: '4',
  },
  afterShort: {
    H1: '1',
    MT: 'A',
    ST: 'B',
    H2: '3',
  },
}

const hectorSupportShortOutsideMarkers = {
  dynamic: 'hectorPairs',
  first: {
    MT: ['A', 'D'],
    ST: ['B', 'C'],
    H1: ['1', '2'],
    H2: ['3', '4'],
  },
  afterShort: {
    D1: ['A', 'D'],
    D2: ['B', 'C'],
    D3: ['1', '2'],
    D4: ['3', '4'],
  },
}

const hectorDpsShortOutsideMarkers = {
  dynamic: 'hectorPairs',
  first: {
    D1: ['A', 'D'],
    D2: ['B', 'C'],
    D3: ['1', '2'],
    D4: ['3', '4'],
  },
  afterShort: {
    MT: ['A', 'D'],
    ST: ['B', 'C'],
    H1: ['1', '2'],
    H2: ['3', '4'],
  },
}

function makePositions(roleFuses, outsideMarkers) {
  const first = {}
  const afterShort = {}

  Object.keys(roleFuses).forEach((job) => {
    const firstMarker = Array.isArray(outsideMarkers.first[job]) ? outsideMarkers.first[job][0] : outsideMarkers.first[job]
    const afterShortMarker = Array.isArray(outsideMarkers.afterShort[job]) ? outsideMarkers.afterShort[job][0] : outsideMarkers.afterShort[job]

    first[job] = firstMarker ? outsideMarkerPositions[firstMarker] : centerPositions[job]
    afterShort[job] = afterShortMarker ? outsideMarkerPositions[afterShortMarker] : postShortCenterPositions[job]
  })

  return { first, afterShort }
}

const supportShortFuses = {
  MT: 'short',
  ST: 'short',
  H1: 'short',
  H2: 'short',
  D1: 'long',
  D2: 'long',
  D3: 'long',
  D4: 'long',
}

const dpsShortFuses = {
  MT: 'long',
  ST: 'long',
  H1: 'long',
  H2: 'long',
  D1: 'short',
  D2: 'short',
  D3: 'short',
  D4: 'short',
}

export const mechanicPresets = {
  'm3s-final-fusedown': {
    id: 'm3s-final-fusedown',
    floor: 'M3S',
    name: '零式引信炸彈',
    displayName: 'M3S / 零式引信炸彈',
    description: '觀察長短導火線，7 秒後點燃，12 秒短線爆炸，16 秒長線爆炸。',
    canvas: { width: 800, height: 800 },
    arena,
    markerPoints,
    arenaCircles,
    bombOffset,
    playerOutsideOffset,
    bombAoeRadius: 210,
    playerAoeRadius: 150,
    playerBaseSpeed: 230,
    botMoveLeadTime: 2,
    bombPattern: {
      baseIsolatedLongMarker: '2',
      baseLongMarkers: ['2', 'D', 'C', '4'],
    },
    defaultVariantId: 'game8-support-short',
    defaultStrategyId: 'game8',
    timeline: {
      ignitionAt: 7,
      shortExplosionAt: 12,
      longExplosionAt: 16,
      aoeFlashMs: 650,
    },
    players: [
      { id: 1, isUser: true, job: 'MT', x: 400, y: 400, targetX: 400, targetY: 400, fuse: 'short', isDead: false },
      { id: 2, isUser: false, job: 'ST', x: 372, y: 428, targetX: 372, targetY: 428, fuse: 'short', isDead: false },
      { id: 3, isUser: false, job: 'H1', x: 428, y: 428, targetX: 428, targetY: 428, fuse: 'short', isDead: false },
      { id: 4, isUser: false, job: 'H2', x: 400, y: 456, targetX: 400, targetY: 456, fuse: 'short', isDead: false },
      { id: 5, isUser: false, job: 'D1', x: 356, y: 372, targetX: 356, targetY: 372, fuse: 'long', isDead: false },
      { id: 6, isUser: false, job: 'D2', x: 444, y: 372, targetX: 444, targetY: 372, fuse: 'long', isDead: false },
      { id: 7, isUser: false, job: 'D3', x: 378, y: 342, targetX: 378, targetY: 342, fuse: 'long', isDead: false },
      { id: 8, isUser: false, job: 'D4', x: 422, y: 342, targetX: 422, targetY: 342, fuse: 'long', isDead: false },
    ],
    bombs: [
      bomb(1, 'A', 'short'),
      bomb(2, '3', 'short'),
      bomb(3, 'B', 'short'),
      bomb(4, '1', 'short'),
      bomb(5, '2', 'long'),
      bomb(6, 'D', 'long'),
      bomb(7, 'C', 'long'),
      bomb(8, '4', 'long'),
    ],
    notes: [
      '場地標記使用大圈交會點：1/2/3/4 與 A/B/C/D。',
      '炸彈位置從對應標記往場外偏移。',
      '目前長線為 2、D、C、4，短線為 A、3、B、1。',
    ],
    strategies: {
      game8: {
        id: 'game8',
        name: 'Game8',
        description: '短線組先出去，長線組待中心；短線爆炸後長線組出去，短線組回中心。',
        variants: {
          'game8-support-short': {
            id: 'game8-support-short',
            label: 'Game8：T/H 短線',
            shortGroupLabel: 'T/H 短線',
            roleFuses: supportShortFuses,
            outsideMarkers: supportShortOutsideMarkers,
            positions: makePositions(supportShortFuses, supportShortOutsideMarkers),
          },
          'game8-dps-short': {
            id: 'game8-dps-short',
            label: 'Game8：DPS 短線',
            shortGroupLabel: 'DPS 短線',
            roleFuses: dpsShortFuses,
            outsideMarkers: dpsShortOutsideMarkers,
            positions: makePositions(dpsShortFuses, dpsShortOutsideMarkers),
          },
        },
      },
      hector: {
        id: 'hector',
        name: 'Hector',
        description: 'H1/R1 北側，H2/R2 南側；MT/M1 與 ST/M2 依真北分配。國際版：R1=D3、R2=D4、M1=D1、M2=D2。',
        variants: {
          'hector-support-short': {
            id: 'hector-support-short',
            label: 'Hector：T/H 短線',
            shortGroupLabel: 'T/H 短線',
            roleFuses: supportShortFuses,
            outsideMarkers: hectorSupportShortOutsideMarkers,
            positions: makePositions(supportShortFuses, hectorSupportShortOutsideMarkers),
          },
          'hector-dps-short': {
            id: 'hector-dps-short',
            label: 'Hector：DPS 短線',
            shortGroupLabel: 'DPS 短線',
            roleFuses: dpsShortFuses,
            outsideMarkers: hectorDpsShortOutsideMarkers,
            positions: makePositions(dpsShortFuses, hectorDpsShortOutsideMarkers),
          },
        },
      },
    },
  },
}

export const defaultMechanicId = 'm3s-final-fusedown'
