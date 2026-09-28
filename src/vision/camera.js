export class CameraError extends Error {
  /** @param {'insecure'|'unsupported'|'denied'|'notfound'|'busy'|'unknown'} code */
  constructor(code, cause) {
    super(code);
    this.code = code;
    this.cause = cause;
  }
}

function mapError(e) {
  switch (e?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new CameraError('denied', e);
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return new CameraError('notfound', e);
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return new CameraError('busy', e);
    default:
      return new CameraError('unknown', e);
  }
}

/**
 * Opens the front camera into `video`. Asks for a modest resolution: the pose
 * model works at 256 px anyway, and a small frame keeps 30 fps on weak laptops.
 */
export async function openCamera(video, { width = 640, height = 480, fps = 30 } = {}) {
  if (!window.isSecureContext) throw new CameraError('insecure');
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('unsupported');
  const portrait = window.innerHeight > window.innerWidth && matchMedia('(pointer: coarse)').matches;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: portrait ? height : width },
        height: { ideal: portrait ? width : height },
        frameRate: { ideal: fps },
      },
    });
  } catch (e) {
    throw mapError(e);
  }
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.srcObject = stream;
  await video.play().catch(() => {});
  if (!video.videoWidth) {
    await new Promise((resolve) => video.addEventListener('loadedmetadata', resolve, { once: true }));
  }
  return {
    stream,
    stop() {
      for (const t of stream.getTracks()) t.stop();
      video.srcObject = null;
    },
  };
}

/** Average brightness of the frame (0..255), sampled on a tiny canvas. */
export function createLightMeter() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 24;
  const g = c.getContext('2d', { willReadFrequently: true });
  return (video) => {
    if (!video?.videoWidth) return null;
    g.drawImage(video, 0, 0, 32, 24);
    const d = g.getImageData(0, 0, 32, 24).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return sum / (d.length / 4);
  };
}
