/**
 * Rút ẢNH ra khỏi trang PDF, đặt đúng chỗ nó đứng trong đề.
 *
 * Đề Toán có hẳn dạng câu mà phương án LÀ hình: "Hình vẽ nào sau đây minh hoạ
 * cho tập hợp (1;4]?" — bốn phương án là bốn trục số. Bộ rút chữ không thấy
 * chúng, nên bốn phương án rỗng trơn và câu đó không dùng được.
 *
 * pdf.js đã giải nén sẵn ảnh thành mảng điểm ảnh thô; việc còn lại là gói vào
 * PNG (tự mã hoá, không thêm thư viện) và ghi nhớ toạ độ để `pdf-layout.ts`
 * chèn đúng dòng.
 */

import { deflateSync } from "node:zlib";

/** Ảnh đã rút, kèm chỗ đứng của nó trên trang. */
export interface PdfImage {
  /** Mốc tạm cắm vào dòng chữ, thay bằng thẻ ảnh sau khi xếp xong. */
  marker: string;
  dataUri: string;
  /** Toạ độ mép trái và mép DƯỚI — cùng hệ với chân chữ. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Trần kích thước. Ảnh đi thẳng vào nội dung câu hỏi dưới dạng data URI, mà
 * một tài liệu Firestore chỉ chứa được 1MB — một tấm ảnh quét cả trang là đủ
 * làm hỏng cả câu. Quá cỡ thì bỏ, thà thiếu ảnh còn hơn không lưu được câu.
 */
const MAX_PIXELS = 4_000_000;
const MAX_PNG_BYTES = 400_000;

/* ─────────────────────────── mã hoá PNG ─────────────────────────── */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** Điểm ảnh thô → PNG. `channels` là 3 (RGB) hoặc 4 (RGBA). */
function encodePng(
  width: number,
  height: number,
  pixels: Uint8Array,
  channels: 3 | 4,
): Buffer {
  const stride = width * channels;
  // Mỗi hàng phải có một byte "kiểu lọc" đứng trước; 0 = không lọc.
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bit mỗi kênh
  ihdr[9] = channels === 4 ? 6 : 2; // 6 = RGBA, 2 = RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Điểm ảnh đã chuẩn hoá về RGB — dạng chung để ghép và mã hoá. */
interface Raster {
  width: number;
  height: number;
  rgb: Uint8Array;
}

/** Dữ liệu ảnh pdf.js trả về → RGB, hoặc `null` khi không dựng nổi. */
function toRaster(obj: {
  width?: number;
  height?: number;
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray;
}): Raster | null {
  const { width, height, kind, data } = obj;
  if (!width || !height || !data) return null;
  if (width * height > MAX_PIXELS) return null;
  const px = data instanceof Uint8Array ? data : new Uint8Array(data);
  const rgb = new Uint8Array(width * height * 3);

  if (kind === 2 && px.length >= width * height * 3) {
    rgb.set(px.subarray(0, rgb.length));
  } else if (kind === 3 && px.length >= width * height * 4) {
    // Có kênh trong suốt: chồng lên nền TRẮNG, vì đề in ra là nền trắng.
    for (let i = 0, j = 0; i < width * height; i += 1, j += 3) {
      const a = px[i * 4 + 3]! / 255;
      rgb[j] = Math.round(px[i * 4]! * a + 255 * (1 - a));
      rgb[j + 1] = Math.round(px[i * 4 + 1]! * a + 255 * (1 - a));
      rgb[j + 2] = Math.round(px[i * 4 + 2]! * a + 255 * (1 - a));
    }
  } else if (kind === 1) {
    // Ảnh 1 bit: mỗi byte gói 8 điểm, bit 1 = trắng theo quy ước của pdf.js.
    const rowBytes = (width + 7) >> 3;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const v = (px[y * rowBytes + (x >> 3)]! >> (7 - (x & 7))) & 1 ? 255 : 0;
        const i = (y * width + x) * 3;
        rgb[i] = v;
        rgb[i + 1] = v;
        rgb[i + 2] = v;
      }
    }
  } else {
    return null;
  }
  return { width, height, rgb };
}

const rasterToUri = (r: Raster): string | null => {
  const png = encodePng(r.width, r.height, r.rgb, 3);
  return png.length > MAX_PNG_BYTES ? null : `data:image/png;base64,${png.toString("base64")}`;
};

/* ─────────────────────── đọc lệnh vẽ của trang ─────────────────────── */

type Matrix = [number, number, number, number, number, number];

const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

interface OperatorList {
  fnArray: number[];
  argsArray: unknown[];
}

interface PageLike {
  getOperatorList: () => Promise<OperatorList>;
  objs: { get: (name: string) => unknown };
  commonObjs?: { get: (name: string) => unknown };
}

/** Mã lệnh pdf.js cần dùng, truyền vào để không phải nạp `OPS` ở đây. */
export interface ImageOpCodes {
  save: number;
  restore: number;
  transform: number;
  paintImageXObject: number;
  paintInlineImageXObject: number;
}

/**
 * Mọi ảnh trên một trang, kèm toạ độ.
 *
 * Ảnh nào giải mã hỏng thì BỎ QUA — mất một hình còn hơn hỏng cả lần nhập đề.
 */
export async function extractPdfImages(
  page: PageLike,
  ops: ImageOpCodes,
  keyPrefix: string,
): Promise<PdfImage[]> {
  let list: OperatorList;
  try {
    list = await page.getOperatorList();
  } catch {
    return [];
  }

  /** Ảnh thô kèm chỗ đứng, chưa mã hoá — còn phải ghép hình bị cắt. */
  const found: Array<{ raster: Raster; x: number; y: number; w: number; h: number }> = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];

  for (let i = 0; i < list.fnArray.length; i += 1) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i] as unknown[];
    if (fn === ops.save) {
      stack.push([...ctm] as Matrix);
      continue;
    }
    if (fn === ops.restore) {
      ctm = stack.pop() ?? ctm;
      continue;
    }
    if (fn === ops.transform) {
      ctm = multiply(ctm, args as unknown as Matrix);
      continue;
    }
    if (fn !== ops.paintImageXObject && fn !== ops.paintInlineImageXObject) continue;

    // Ảnh nội tuyến mang thẳng dữ liệu; ảnh XObject thì tra theo tên.
    let obj: unknown = null;
    if (fn === ops.paintInlineImageXObject) obj = args[0];
    else {
      const name = args[0];
      if (typeof name !== "string") continue;
      try {
        obj = page.objs.get(name);
      } catch {
        try {
          obj = page.commonObjs?.get(name) ?? null;
        } catch {
          obj = null;
        }
      }
    }
    if (!obj || typeof obj !== "object") continue;

    const raster = toRaster(obj as Parameters<typeof toRaster>[0]);
    if (!raster) continue;
    found.push({
      raster,
      x: ctm[4],
      y: ctm[5],
      w: Math.abs(ctm[0]),
      h: Math.abs(ctm[3]),
    });
  }

  return stitchColumns(found).flatMap((piece, i) => {
    const uri = rasterToUri(piece.raster);
    return uri
      ? [{
          marker: `⟦PDFIMG-${keyPrefix}-${i}⟧`,
          dataUri: uri,
          x: piece.x,
          y: piece.y,
          width: piece.w,
          height: piece.h,
        }]
      : [];
  });
}

/** Gần bằng nhau, tính theo điểm in — sai số nhỏ là do làm tròn ma trận. */
const near = (a: number, b: number, tol = 1.5) => Math.abs(a - b) <= tol;

/**
 * Ghép những ảnh vốn LÀ MỘT HÌNH nhưng bị cắt ngang.
 *
 * Word/PDF hay cắt một hình cao thành nhiều dải xếp khít nhau: cùng mép trái,
 * cùng bề ngang, mép dưới dải trên trùng mép trên dải dưới. Để rời thì trong
 * đề chúng thành hai ảnh, và chữ xen vào giữa — giáo viên thấy "hình bị cắt
 * đôi".
 */
function stitchColumns<T extends { raster: Raster; x: number; y: number; w: number; h: number }>(
  items: T[],
): Array<{ raster: Raster; x: number; y: number; w: number; h: number }> {
  // Xếp từ trên xuống để dải trên đứng trước dải dưới.
  const sorted = [...items].sort((a, b) => b.y + b.h - (a.y + a.h));
  const out: Array<{ raster: Raster; x: number; y: number; w: number; h: number }> = [];
  for (const it of sorted) {
    const prev = out[out.length - 1];
    const stackable =
      prev &&
      near(prev.x, it.x) &&
      near(prev.w, it.w) &&
      prev.raster.width === it.raster.width &&
      near(prev.y, it.y + it.h); // mép dưới dải trên = mép trên dải dưới
    if (!stackable) {
      out.push({ ...it });
      continue;
    }
    const height = prev.raster.height + it.raster.height;
    const rgb = new Uint8Array(prev.raster.width * height * 3);
    rgb.set(prev.raster.rgb, 0);
    rgb.set(it.raster.rgb, prev.raster.rgb.length);
    prev.raster = { width: prev.raster.width, height, rgb };
    prev.y = it.y;
    prev.h += it.h;
  }
  return out;
}