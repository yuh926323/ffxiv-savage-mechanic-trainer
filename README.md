# FFXIV 零式機制練習器

Vue 3 + Vite + TailwindCSS + Canvas 製作的機制練習器。第一版包含 `M3S / 零式引信炸彈`，使用者角色預設為 `MT`。

## 開發

```bash
npm install
npm run dev
```

## 建置

```bash
npm run build
```

## 新增機制

目前機制資料放在 `src/presets/m3sFinalFusedown.js`。後續新增樓層時，可以沿用同一個 preset 格式，提供：

- `displayName` 與 `description`
- `arena`、`canvas`、`bombOffset`、`bombAoeRadius`、`playerAoeRadius`、`timeline`
- `players`，其中 `players[0]` 是使用者控制角色
- `bombs` 或其他機制物件的初始座標

目前第一版使用 Game8 場地圖的 `1/2/3/4` 與 `A/B/C/D` 標記點。時間軸是 7 秒點燃、12 秒短線爆炸、16 秒長線爆炸；其他變體可以直接調整 preset。

目前有兩種解法：

- `Game8`
- `Hector`

站位資料放在 preset 的 `strategies`，每個解法都有隨機抽選的 `T/H 短線` 與 `DPS 短線` 變體，以及 `first` 與 `afterShort` 兩段座標。玩家長短線不由使用者手動指定；按「隨機炸彈配置」時會一起抽選炸彈模式與玩家短線分組。

Hector 解法採用國際版職位：`R1=D3`、`R2=D4`、`M1=D1`、`M2=D2`。目前 Hector 配對規則為：`MT/D1` 只考慮 `A/D`，`ST/D2` 只考慮 `B/C`，`H1/D3` 只考慮 `1/2`，`H2/D4` 只考慮 `3/4`。

炸彈配置支援隨機化：以「孤立長線在 `2`、另外三顆長線在對角群」作為基準，隨機旋轉到不同角落；場地標點固定不變，隊友外側站位會跟著配置調整。Hector 解法目前只抽實戰會出現的兩種對角配置。

控制路線可以在 `MT/ST/H1/H2/D1/D2/D3/D4` 間切換。NPC 會在爆炸前約 2 秒才開始移動到定位；中心集合點由即將爆炸的炸彈 AoE 與玩家 AoE 即時計算，避免站在會被兩側爆炸擊中的位置。建議位置預設關閉，可在操作面板手動開啟。

## 描述位置的建議格式

要調炸彈或站位時，最穩的是直接用場地標記或標註圖：

- 標記：例如「長線在 `2、D、C、4`，短線在 `A、3、B、1`」
- 圖片：在截圖上用紅點/藍點圈出長短線，或直接手寫 `長`、`短`
- 偏移：例如「MT 在 A 往中心偏 20px」、「D2 在 B 往右 30px」
- AoE：例如「炸彈 AoE 半徑再大 10px」、「玩家炸彈半徑維持」
- 方向基準：例如「角落長線當北」

場地背景可以在網頁右側開啟「場地調整」模式後微調。調整完把畫面中的 JSON 貼回來即可，例如：

```json
{
  "arena": {
    "size": 800
  },
  "arenaCircles": {
    "circleInset": 215,
    "outerRadius": 400,
    "innerRadius": 200
  }
}
```

場地模型目前使用 4 個角落圓心：以場地四角往中心內縮 `circleInset` 作為大小圓的圓心，再用大圈交會推算 `1/2/3/4` 與 `A/B/C/D`。調整「場地大小」時，圓、標點、炸彈外偏移、炸彈 AoE 與玩家 AoE 會一起等比例縮放。

炸彈位置與爆炸範圍可以開啟「炸彈調整」模式後微調。拖曳 Canvas 上的炸彈本體調整座標，右側滑桿可調整炸彈 AoE 與玩家 AoE。調整完把畫面中的 JSON 貼回來即可，例如：

```json
{
  "bombOffset": 42,
  "bombAoeRadius": 210,
  "playerAoeRadius": 150,
  "bombs": [
    { "id": 1, "marker": "A", "fuse": "short", "x": 400, "y": 188 }
  ]
}
```
