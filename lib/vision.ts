
export type Point = [number, number];

export function toGray(data: Uint8ClampedArray): Uint8Array {
  const len = data.length / 4;
  const g = new Uint8Array(len);
  let j = 0;
  for (let i = 0; i < data.length; i += 4) {
    g[j++] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) | 0;
  }
  return g;
}

export function otsu(gray: Uint8Array): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, wF = 0, varMax = 0, threshold = 0;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > varMax) { varMax = between; threshold = t; }
  }
  return threshold;
}

export function binarize(gray: Uint8Array, th: number, invert = true): Uint8Array {
  const out = new Uint8Array(gray.length);
  if (invert) {
    for (let i = 0; i < gray.length; i++) out[i] = gray[i] <= th ? 1 : 0;
  } else {
    for (let i = 0; i < gray.length; i++) out[i] = gray[i] > th ? 1 : 0;
  }
  return out;
}

export type Component = {
  id: number;
  area: number;
  minx: number; miny: number; maxx: number; maxy: number;
  sumx: number; sumy: number;
};

export function ccl(binary: Uint8Array, width: number, height: number) {
  const labels = new Int32Array(width * height);
  let nextLabel = 1;
  const parent: number[] = [0];

  function find(a: number): number {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]];
    return a;
  }
  function unite(a: number, b: number) {
    a = find(a); b = find(b);
    if (a !== b) parent[b] = a;
  }

  parent.push(1);
  parent[1] = 1;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const idx = row + x;
      if (binary[idx] === 0) { labels[idx] = 0; continue; }
      const n = (y > 0) ? labels[idx - width] : 0;
      const w = (x > 0) ? labels[idx - 1] : 0;
      if (n === 0 && w === 0) {
        nextLabel++;
        parent[nextLabel] = nextLabel;
        labels[idx] = nextLabel;
      } else if (n !== 0 && w === 0) {
        labels[idx] = n;
      } else if (n === 0 && w !== 0) {
        labels[idx] = w;
      } else {
        labels[idx] = n;
        if (n !== w) unite(n, w);
      }
    }
  }

  const compMap = new Map<number, Component>();
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i];
    if (l === 0) continue;
    const root = find(l);
    labels[i] = root;
    const x = i % width;
    const y = (i / width) | 0;
    let c = compMap.get(root);
    if (!c) {
      c = { id: root, area: 0, minx: x, miny: y, maxx: x, maxy: y, sumx: 0, sumy: 0 };
      compMap.set(root, c);
    }
    c.area++;
    if (x < c.minx) c.minx = x;
    if (y < c.miny) c.miny = y;
    if (x > c.maxx) c.maxx = x;
    if (y > c.maxy) c.maxy = y;
    c.sumx += x; c.sumy += y;
  }

  const components = Array.from(compMap.values());
  return { labels, components };
}

export type PointList = Point[];

export function orderQuad(points: PointList): PointList {
  const sum = points.map(p => p[0] + p[1]);
  const diff = points.map(p => p[0] - p[1]);
  const tl = points[sum.indexOf(Math.min(...sum))];
  const br = points[sum.indexOf(Math.max(...sum))];
  const tr = points[diff.indexOf(Math.max(...diff))];
  const bl = points[diff.indexOf(Math.min(...diff))];
  return [tl, tr, br, bl];
}

export function polygonArea(q: PointList): number {
  let area = 0;
  for (let i = 0; i < q.length; i++) {
    const [x1, y1] = q[i];
    const [x2, y2] = q[(i + 1) % q.length];
    area += x1 * y2 - y1 * x2;
  }
  return Math.abs(area) / 2;
}

export function computeHomography(src: PointList, W: number, H: number): number[] {
  const dst: PointList = [[0, 0], [W - 1, 0], [W - 1, H - 1], [0, H - 1]];
  const A = Array.from({ length: 8 }, () => Array(8).fill(0));
  const b = Array(8).fill(0);
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    const r = 2 * i;
    A[r][0] = x; A[r][1] = y; A[r][2] = 1; A[r][3] = 0; A[r][4] = 0; A[r][5] = 0; A[r][6] = -x * u; A[r][7] = -y * u;
    b[r] = u;
    A[r + 1][0] = 0; A[r + 1][1] = 0; A[r + 1][2] = 0; A[r + 1][3] = x; A[r + 1][4] = y; A[r + 1][5] = 1; A[r + 1][6] = -x * v; A[r + 1][7] = -y * v;
    b[r + 1] = v;
  }
  const h = solveLinearSystem(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[maxRow][i])) maxRow = r;
    [A[i], A[maxRow]] = [A[maxRow], A[i]];
    [b[i], b[maxRow]] = [b[maxRow], b[i]];
    const pivot = A[i][i] || 1e-12;
    for (let j = i; j < n; j++) A[i][j] /= pivot;
    b[i] /= pivot;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = A[r][i];
      if (!f) continue;
      for (let j = i; j < n; j++) A[r][j] -= f * A[i][j];
      b[r] -= f * b[i];
    }
  }
  return b;
}

function invert3x3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const I = a * e - b * d;
  const det = a * A + b * B + c * C || 1e-12;
  return [A / det, D / det, G / det, B / det, E / det, H / det, C / det, F / det, I / det];
}

export function warpProjective(srcCanvas: HTMLCanvasElement, srcQuad: Point[], dstW: number, dstH: number): HTMLCanvasElement {
  const H = computeHomography(srcQuad, dstW, dstH);
  const Hi = invert3x3(H);
  const sctx = srcCanvas.getContext('2d')!;
  const sData = sctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
  const sPixels = sData.data;
  const dCanvas = document.createElement('canvas');
  dCanvas.width = dstW; dCanvas.height = dstH;
  const dctx = dCanvas.getContext('2d')!;
  const dData = dctx.createImageData(dstW, dstH);
  const dPixels = dData.data;

  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const denom = Hi[6] * x + Hi[7] * y + Hi[8];
      const xs = (Hi[0] * x + Hi[1] * y + Hi[2]) / denom;
      const ys = (Hi[3] * x + Hi[4] * y + Hi[5]) / denom;
      const xi = Math.round(xs);
      const yi = Math.round(ys);
      const di = (y * dstW + x) * 4;
      if (xi >= 0 && yi >= 0 && xi < srcCanvas.width && yi < srcCanvas.height) {
        const si = (yi * srcCanvas.width + xi) * 4;
        dPixels[di] = sPixels[si];
        dPixels[di + 1] = sPixels[si + 1];
        dPixels[di + 2] = sPixels[si + 2];
        dPixels[di + 3] = 255;
      } else {
        dPixels[di] = dPixels[di + 1] = dPixels[di + 2] = 255; dPixels[di + 3] = 255;
      }
    }
  }
  dctx.putImageData(dData, 0, 0);
  return dCanvas;
}
