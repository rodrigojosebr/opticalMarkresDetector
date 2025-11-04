
'use client';
import { useCallback, useRef, useState } from 'react';
import { toGray, otsu, binarize, ccl, orderQuad, polygonArea, warpProjective, type Point } from '@/lib/vision';

export default function Uploader() {
  const [status, setStatus] = useState('Pronto. Envie uma imagem.');
  const [metrics, setMetrics] = useState('');
  const [origURL, setOrigURL] = useState<string | null>(null);
  const [warpURL, setWarpURL] = useState<string | null>(null);
  const debugRef = useRef<HTMLCanvasElement | null>(null);

  const process = useCallback(async (file: File) => {
    setStatus('Processando…'); setMetrics(''); setWarpURL(null);
    const img = await loadImage(file);
    const maxDim = 3400;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const sW = Math.max(1, Math.round(img.width * scale));
    const sH = Math.max(1, Math.round(img.height * scale));
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = sW; srcCanvas.height = sH;
    srcCanvas.getContext('2d')!.drawImage(img, 0, 0, sW, sH);

    const { data } = srcCanvas.getContext('2d')!.getImageData(0, 0, sW, sH);
    const gray = toGray(data);
    const th = otsu(gray);
    const bin = binarize(gray, th, true);

    if (debugRef.current) {
      const dctx = debugRef.current.getContext('2d')!;
      debugRef.current.width = sW; debugRef.current.height = sH;
      const im = dctx.createImageData(sW, sH);
      for (let i = 0; i < bin.length; i++) {
        const v = bin[i] ? 255 : 0;
        im.data[i * 4] = v; im.data[i * 4 + 1] = v; im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255;
      }
      dctx.putImageData(im, 0, 0);
    }

    await new Promise<void>(res => setTimeout(res, 0));

    const { components } = ccl(bin, sW, sH);
    const imgArea = sW * sH;
    const squares = components.map(c => {
      const w = c.maxx - c.minx + 1;
      const h = c.maxy - c.miny + 1;
      const ar = w / h;
      const bboxArea = w * h;
      const fill = c.area / bboxArea;
      const cx = c.sumx / c.area;
      const cy = c.sumy / c.area;
      return { ...c, w, h, ar, fill, bboxArea, cx, cy };
    }).filter(c => c.bboxArea > imgArea * 0.0001 && c.ar > 0.7 && c.ar < 1.4 && c.fill > 0.4);

    if (squares.length < 4) { setStatus(`Inválida: apenas ${squares.length} quadrado(s)`); return; }

    const cx = sW / 2, cy = sH / 2;
    squares.sort((a, b) => (Math.hypot(b.cx - cx, b.cy - cy) - Math.hypot(a.cx - cx, a.cy - cy)));
    const four = squares.slice(0, 4);
    const centers: Point[] = four.map(s => [s.cx, s.cy]);
    if (debugRef.current) {
      const dctx = debugRef.current.getContext('2d')!;
      dctx.fillStyle = 'red';
      for (const [x, y] of centers) {
        dctx.fillRect(x - 6, y - 6, 12, 12);
      }
    }
    const quad = orderQuad(centers);
    const area = polygonArea(quad);
    // reduzido tamanho do quadradinho, detectar menor. testar ver se deve ser maior ou menor
    // if (area < imgArea * 0.06) { setStatus('Inválida: quadrilátero pequeno'); return }
    if (area < imgArea * 0.06) { setStatus('Inválida: quadrilátero pequeno (folha distante da câmera)'); return }

    const w1 = Math.hypot(quad[1][0] - quad[0][0], quad[1][1] - quad[0][1]);
    const w2 = Math.hypot(quad[2][0] - quad[3][0], quad[2][1] - quad[3][1]);
    const h1 = Math.hypot(quad[3][0] - quad[0][0], quad[3][1] - quad[0][1]);
    const h2 = Math.hypot(quad[2][0] - quad[1][0], quad[2][1] - quad[1][1]);
    const W = Math.round(Math.max(w1, w2));
    const H = Math.round(Math.max(h1, h2));
    const dstW = Math.max(700, Math.min(1500, W));
    const dstH = Math.max(900, Math.min(2200, Math.round((H / W) * dstW)));

    const warped = warpProjective(srcCanvas, quad, dstW, dstH);
    const url = warped.toDataURL('image/png');
    setWarpURL(url);
    setStatus('Válida: 4 quadrados detectados e warp concluído ✅');
    setMetrics(`Métricas:\n- Área relativa do quad: ${(area / imgArea * 100).toFixed(1)}%\n- Tamanho destino: ${dstW} x ${dstH}px`);
  }, []);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setOrigURL(URL.createObjectURL(f));
    process(f);
  }, [process]);

  return (
    <div style={{ maxWidth: 1200, margin: '24px auto', padding: 16 }}>
      <h1 style={{ margin: 0 }}>Validador</h1>
      <p style={{ color: '#4b5563' }}>Antes e depois. Envie uma foto com quatro quadrados pretos.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
          <h3 style={{ margin: '0 0 8px' }}>1) Upload</h3>
          <input type="file" accept="image/*" onChange={onChange} />
          <div style={{ marginTop: 8, fontWeight: 600 }}>{status}</div>
          <pre style={{ fontSize: 12, color: '#374151', whiteSpace: 'pre-wrap' }}>{metrics}</pre>
          {warpURL && (
            <button onClick={() => download(warpURL, 'folha_retificada.png')}
              style={{ marginTop: 10, padding: '8px 12px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#111827', color: '#fff' }}>
              Baixar imagem retificada (PNG)
            </button>
          )}
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
          <h3 style={{ margin: '0 0 8px' }}>2) Antes (original)</h3>
          {origURL ? <img src={origURL} alt="Original" style={{ maxWidth: '100%' }} /> : <div style={{ color: '#6b7280' }}>Sem imagem</div>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
          <h3 style={{ margin: '0 0 8px' }}>3) Debug (binário)</h3>
          <canvas ref={debugRef} />
        </div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
          <h3 style={{ margin: '0 0 8px' }}>4) Depois (retificado)</h3>
          {warpURL ? <img src={warpURL} alt="Warped" style={{ maxWidth: '100%' }} /> : <div style={{ color: '#6b7280' }}>Sem resultado</div>}
        </div>
      </div>
    </div>
  );
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}
function download(url: string, name: string) {
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
}
