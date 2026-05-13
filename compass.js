/**
 * Compass core: drop a shortcut link on the current page that targets a
 * newly created page (appended at the end of the note), and put a return
 * link on the opposite edge of that new page.
 *
 * @format
 */

import { NativeModules } from 'react-native';
import {
  FileUtils,
  PluginCommAPI,
  PluginFileAPI,
  PluginManager,
  PluginNoteAPI,
} from 'sn-plugin-lib';

// Visible glyphs for outbound / return links.
const ARROWS = {
  right: '→', // →
  up: '↑',    // ↑
  left: '←',  // ←
  down: '↓',  // ↓
};

const OPPOSITES = { right: 'left', left: 'right', up: 'down', down: 'up' };

// Grid delta per direction: how a neighbor offsets from the current cell.
const DELTA = {
  right: { dc: 1, dr: 0 },
  left: { dc: -1, dr: 0 },
  up: { dc: 0, dr: -1 },
  down: { dc: 0, dr: 1 },
};

// Reverse lookup: arrow glyph → direction.
const ARROW_TO_DIR = Object.fromEntries(
  Object.entries(ARROWS).map(([k, v]) => [v, k]),
);

// Link-element type and the link's TYPE_LINK numeric (see Element.ts).
const TYPE_LINK = 600;
const LINK_TYPE_NOTE_PAGE = 0; // 0=jump to note page
const LINK_STYLE_BORDER = 1;   // 0=underline 1=solid border 2=dashed border
const LINK_BOX_LONG = 160;
const LINK_BOX_SHORT = 60;
const EDGE_INSET = 24;
const FONT_SIZE = 36;

function unwrap(value, what) {
  if (!value || !value.success) {
    throw new Error((value && value.error && value.error.message) || `${what} failed`);
  }
  return value.result;
}

// Returns the rect (pixel coords) for a link box centered on the given
// edge of a page with width/height.
function edgeRect(direction, width, height) {
  switch (direction) {
    case 'right':
      return {
        left: width - EDGE_INSET - LINK_BOX_LONG,
        top: Math.round(height / 2 - LINK_BOX_SHORT / 2),
        right: width - EDGE_INSET,
        bottom: Math.round(height / 2 + LINK_BOX_SHORT / 2),
      };
    case 'left':
      return {
        left: EDGE_INSET,
        top: Math.round(height / 2 - LINK_BOX_SHORT / 2),
        right: EDGE_INSET + LINK_BOX_LONG,
        bottom: Math.round(height / 2 + LINK_BOX_SHORT / 2),
      };
    case 'up':
      return {
        left: Math.round(width / 2 - LINK_BOX_LONG / 2),
        top: EDGE_INSET,
        right: Math.round(width / 2 + LINK_BOX_LONG / 2),
        bottom: EDGE_INSET + LINK_BOX_SHORT,
      };
    case 'down':
      return {
        left: Math.round(width / 2 - LINK_BOX_LONG / 2),
        top: height - EDGE_INSET - LINK_BOX_SHORT,
        right: Math.round(width / 2 + LINK_BOX_LONG / 2),
        bottom: height - EDGE_INSET,
      };
    default:
      throw new Error(`unknown direction: ${direction}`);
  }
}

export async function createLinkedPage(direction) {
  if (!OPPOSITES[direction]) throw new Error(`unknown direction: ${direction}`);

  const notePath = unwrap(
    await PluginCommAPI.getCurrentFilePath(),
    'getCurrentFilePath',
  );

  const srcPage = unwrap(
    await PluginCommAPI.getCurrentPageNum(),
    'getCurrentPageNum',
  );

  const total = unwrap(
    await PluginFileAPI.getNoteTotalPageNum(notePath),
    'getNoteTotalPageNum',
  );
  if (!total || total < 1) throw new Error('note has no pages');

  // Match the new page's template to the current page's template.
  const template = unwrap(
    await PluginFileAPI.getNotePageTemplate(notePath, srcPage),
    'getNotePageTemplate',
  );

  // Insert the new page at the end of the note.
  const newPage = total; // page index of the appended page (0-based)
  unwrap(
    await PluginFileAPI.insertNotePage({
      notePath,
      page: newPage,
      template: typeof template === 'string' ? template : template?.path || template?.template || '',
    }),
    'insertNotePage',
  );

  // Source-page link rect on the chosen edge, pointing to the new page.
  const srcSize = unwrap(
    await PluginFileAPI.getPageSize(notePath, srcPage),
    'getPageSize(src)',
  );
  const srcRect = edgeRect(direction, srcSize.width, srcSize.height);

  unwrap(
    await PluginNoteAPI.insertTextLink({
      destPath: notePath,
      destPage: newPage,
      style: LINK_STYLE_BORDER,
      linkType: LINK_TYPE_NOTE_PAGE,
      rect: srcRect,
      fontSize: FONT_SIZE,
      fullText: ARROWS[direction],
      showText: ARROWS[direction],
      isItalic: 0,
    }),
    'insertTextLink(outbound)',
  );

  // Return link on the opposite edge of the new page, pointing back.
  const newSize = unwrap(
    await PluginFileAPI.getPageSize(notePath, newPage),
    'getPageSize(new)',
  );
  const backDir = OPPOSITES[direction];
  const backRect = edgeRect(backDir, newSize.width, newSize.height);

  const linkEl = unwrap(
    await PluginCommAPI.createElement(TYPE_LINK),
    'createElement(link)',
  );
  linkEl.type = TYPE_LINK;
  linkEl.pageNum = newPage;
  linkEl.link = {
    category: 0,
    X: backRect.left,
    Y: backRect.top,
    width: backRect.right - backRect.left,
    height: backRect.bottom - backRect.top,
    page: newPage,
    style: LINK_STYLE_BORDER,
    linkType: LINK_TYPE_NOTE_PAGE,
    destPath: notePath,
    destPage: srcPage,
    fontSize: FONT_SIZE,
    fullText: ARROWS[backDir],
    showText: ARROWS[backDir],
    italic: 0,
    controlTrailNums: [],
  };

  unwrap(
    await PluginFileAPI.insertElements(notePath, newPage, [linkEl]),
    'insertElements(return-link)',
  );

  return { srcPage, newPage, direction };
}

// Map-export ---------------------------------------------------------------

function deriveBaseName(notePath) {
  const last = notePath.split('/').pop() || 'note';
  const noExt = last.replace(/\.[^.]+$/, '');
  const safe = noExt.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return safe.length > 0 ? safe : 'note';
}

// Inspect every link element on `page` and return an array of
// { dir, destPage } neighbors via compass-arrow links pointing within
// the same note.
async function compassNeighbors(notePath, page) {
  const elements = unwrap(
    await PluginFileAPI.getElements(page, notePath),
    `getElements(page ${page})`,
  );
  const out = [];
  if (!Array.isArray(elements)) return out;
  for (const el of elements) {
    if (!el || el.type !== TYPE_LINK || !el.link) continue;
    const link = el.link;
    if (link.linkType !== LINK_TYPE_NOTE_PAGE) continue;
    if (link.destPath && link.destPath !== notePath) continue;
    const dir = ARROW_TO_DIR[link.showText] || ARROW_TO_DIR[link.fullText];
    if (!dir) continue;
    out.push({ dir, destPage: link.destPage });
  }
  return out;
}

/**
 * Exports a 2D PNG laying out every page reachable via compass links
 * starting from the current page. The current page is the origin; each
 * "→" link shifts the neighbor one cell right, "↑" one cell up, etc.
 * Returns { outPath, conflicts }.
 */
export async function exportMap() {
  const notePath = unwrap(
    await PluginCommAPI.getCurrentFilePath(),
    'getCurrentFilePath',
  );
  const startPage = unwrap(
    await PluginCommAPI.getCurrentPageNum(),
    'getCurrentPageNum',
  );
  const totalPages = unwrap(
    await PluginFileAPI.getNoteTotalPageNum(notePath),
    'getNoteTotalPageNum',
  );
  if (!totalPages || totalPages < 1) throw new Error('note has no pages');

  // BFS: pages keyed by page index → { col, row }. First-write-wins
  // when a later link would relocate a page; conflicts are counted.
  const coords = new Map(); // page → {col,row}
  const cellOwners = new Map(); // "col,row" → page
  let conflicts = 0;

  coords.set(startPage, { col: 0, row: 0 });
  cellOwners.set('0,0', startPage);

  const queue = [startPage];
  while (queue.length > 0) {
    const page = queue.shift();
    const here = coords.get(page);
    const neighbors = await compassNeighbors(notePath, page);
    for (const { dir, destPage } of neighbors) {
      if (
        typeof destPage !== 'number' ||
        destPage < 0 ||
        destPage >= totalPages
      ) {
        continue;
      }
      const { dc, dr } = DELTA[dir];
      const col = here.col + dc;
      const row = here.row + dr;
      const key = `${col},${row}`;
      const existing = coords.get(destPage);
      if (existing) {
        if (existing.col !== col || existing.row !== row) conflicts++;
        continue;
      }
      if (cellOwners.has(key)) {
        conflicts++;
        continue;
      }
      coords.set(destPage, { col, row });
      cellOwners.set(key, destPage);
      queue.push(destPage);
    }
  }

  // Normalize so min coords sit at (0,0).
  let minCol = Infinity;
  let minRow = Infinity;
  let maxCol = -Infinity;
  let maxRow = -Infinity;
  for (const { col, row } of coords.values()) {
    if (col < minCol) minCol = col;
    if (col > maxCol) maxCol = col;
    if (row < minRow) minRow = row;
    if (row > maxRow) maxRow = row;
  }
  const cols = maxCol - minCol + 1;
  const rows = maxRow - minRow + 1;

  // Page sizes and per-column / per-row maxima.
  const sizes = new Map(); // page → {width, height}
  const colWidths = new Array(cols).fill(0);
  const rowHeights = new Array(rows).fill(0);
  for (const [page, { col, row }] of coords) {
    const size = unwrap(
      await PluginFileAPI.getPageSize(notePath, page),
      `getPageSize(${page})`,
    );
    sizes.set(page, size);
    const c = col - minCol;
    const r = row - minRow;
    if (size.width > colWidths[c]) colWidths[c] = size.width;
    if (size.height > rowHeights[r]) rowHeights[r] = size.height;
  }
  // Guard against empty columns/rows (shouldn't happen given normalization,
  // but be defensive — empty rows/cols would still draw white).
  for (let i = 0; i < cols; i++) if (colWidths[i] === 0) colWidths[i] = 1;
  for (let i = 0; i < rows; i++) if (rowHeights[i] === 0) rowHeights[i] = 1;

  const exportDir = await FileUtils.getExportPath();
  if (!exportDir) throw new Error('cannot resolve EXPORT directory');
  await FileUtils.makeDir(exportDir);
  const pluginDir = await PluginManager.getPluginDirPath();
  if (!pluginDir) throw new Error('cannot resolve plugin directory');

  const baseName = deriveBaseName(notePath);
  const stamp = Date.now();
  const trimmedExport = exportDir.replace(/\/+$/, '');
  const trimmedPlugin = pluginDir.replace(/\/+$/, '');
  const tmpDir = `${trimmedPlugin}/map-${stamp}`;
  await FileUtils.makeDir(tmpDir);

  const pagePaths = [];
  try {
    const tiles = [];
    for (const [page, { col, row }] of coords) {
      const pagePath = `${tmpDir}/page-${String(page).padStart(4, '0')}.png`;
      unwrap(
        await PluginFileAPI.generateNotePng({
          notePath,
          page,
          times: 1,
          pngPath: pagePath,
          type: 1,
        }),
        `generateNotePng(page ${page})`,
      );
      pagePaths.push(pagePath);
      tiles.push({ path: pagePath, col: col - minCol, row: row - minRow });
    }

    const stagedPath = `${tmpDir}/map_${baseName}_${stamp}.png`;
    const outPath = `${trimmedExport}/map_${baseName}_${stamp}.png`;
    const stitcher = NativeModules.ScrollStitch;
    if (!stitcher || typeof stitcher.stitchGrid !== 'function') {
      throw new Error('ScrollStitch.stitchGrid native module is not registered');
    }
    await stitcher.stitchGrid(tiles, colWidths, rowHeights, stagedPath);

    const moved = await FileUtils.renameToFile(stagedPath, outPath);
    if (!moved) {
      const copied = await FileUtils.copyFile(stagedPath, outPath);
      if (!copied) throw new Error('could not move stitched PNG into EXPORT');
      try {
        await FileUtils.deleteFile(stagedPath);
      } catch {
        // best-effort cleanup
      }
    }
    return { outPath, conflicts, pageCount: coords.size };
  } finally {
    for (const p of pagePaths) {
      try {
        await FileUtils.deleteFile(p);
      } catch {
        // best-effort cleanup
      }
    }
    try {
      await FileUtils.deleteDir(tmpDir);
    } catch {
      // best-effort cleanup
    }
  }
}
