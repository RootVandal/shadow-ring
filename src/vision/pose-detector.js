import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { CONFIG } from '../config.js';

// MediaPipe Pose Landmarker, fully self-hosted: the WASM runtime and the model
// ship with the site, so the game doesn't depend on any CDN being reachable
// from the judge's network.

const ROOT = new URL('../../', import.meta.url);
const WASM_DIR = new URL('vendor/mediapipe/wasm/', ROOT).href;

// GitHub Pages gzips these files. Then content-length is the compressed size
// while the stream gives the unpacked bytes, and the progress ran past 100%
// («12.4 / 11.8 МБ» — looked finished, wasn't). The real sizes of what we ship:
const SIZES = {
  'vision_wasm_internal.wasm': 11756954,
  'vision_wasm_nosimd_internal.wasm': 10960242,
  'pose_landmarker_lite.task': 5777746,
  'pose_landmarker_full.task': 9398198,
};

async function fetchBytes(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const name = new URL(url).pathname.split('/').pop();
  const packed = !!res.headers.get('content-encoding');
  const total = SIZES[name] ?? (packed ? 0 : Number(res.headers.get('content-length')) || 0);
  if (!res.body || !total) {
    const buf = new Uint8Array(await res.arrayBuffer());
    onProgress?.(buf.length, buf.length);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress?.(Math.min(got, total), total);
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/**
 * Downloads the runtime and the model (with progress), then builds the landmarker.
 * GPU first, CPU as a fallback — some integrated GPUs refuse the WebGL delegate.
 *
 * @param {{model?: 'lite'|'full', onProgress?: (loaded:number, total:number) => void}} o
 */
export async function createPoseDetector({ model = CONFIG.detector.model, onProgress } = {}) {
  const simd = await FilesetResolver.isSimdSupported();
  const name = simd ? 'vision_wasm_internal' : 'vision_wasm_nosimd_internal';
  const parts = { wasm: [0, 0], model: [0, 0] };
  const report = (key) => (got, total) => {
    parts[key] = [got, total];
    onProgress?.(parts.wasm[0] + parts.model[0], parts.wasm[1] + parts.model[1]);
  };
  const [wasm, modelBytes] = await Promise.all([
    fetchBytes(WASM_DIR + name + '.wasm', report('wasm')),
    fetchBytes(new URL(`models/pose_landmarker_${model}.task`, ROOT).href, report('model')),
  ]);
  const blobUrl = URL.createObjectURL(new Blob([wasm], { type: 'application/wasm' }));
  const filesets = [
    { wasmLoaderPath: WASM_DIR + name + '.js', wasmBinaryPath: blobUrl },
    await FilesetResolver.forVisionTasks(WASM_DIR.replace(/\/$/, '')),
  ];

  let landmarker = null;
  let delegate = null;
  let lastError = null;
  outer: for (const fileset of filesets) {
    for (const d of ['GPU', 'CPU']) {
      try {
        landmarker = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetBuffer: modelBytes, delegate: d },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: CONFIG.detector.minDetection,
          minPosePresenceConfidence: CONFIG.detector.minPresence,
          minTrackingConfidence: CONFIG.detector.minTracking,
        });
        delegate = d;
        break outer;
      } catch (e) {
        lastError = e;
      }
    }
  }
  if (!landmarker) throw lastError ?? new Error('PoseLandmarker failed to start');

  let lastTs = 0;
  return {
    delegate,
    model,
    /** @returns {{image: any[]|null, world: any[]|null}} */
    detect(video, nowMs) {
      const ts = Math.max(nowMs, lastTs + 1); // timestamps must strictly increase
      lastTs = ts;
      const r = landmarker.detectForVideo(video, ts);
      return { image: r.landmarks?.[0] ?? null, world: r.worldLandmarks?.[0] ?? null };
    },
    close() {
      landmarker.close();
      URL.revokeObjectURL(blobUrl);
    },
  };
}
