/**
 * GET /api/media/audio?drive=<mã file> — cầu nối phát file nghe trên Google
 * Drive.
 *
 * ── Vì sao phải có ──────────────────────────────────────────────────────
 *
 * Giáo viên tải file nghe lên Drive rồi dán link chia sẻ. Trước đây mình đổi
 * link đó sang `drive.google.com/uc?export=download&id=…` và cắm thẳng vào
 * `<audio src>`. Đường đó KHÔNG còn chạy:
 *
 *   • Google trả 303 sang `drive.usercontent.google.com`, và thứ về tới nơi
 *     rất hay là một TRANG HTML — trang đăng nhập (file thuộc Workspace của
 *     trường), trang hỏi xác nhận quét virus, hoặc trang lỗi.
 *   • `<audio>` nhận HTML thì không kêu lên: nó đứng ở 0:00 / 0:00, bấm
 *     không chạy, không một dòng báo. Đúng kiểu hỏng chỉ lộ ra lúc học sinh
 *     đang thi — mà lúc đó không sửa được nữa.
 *   • Đã mở chia sẻ rồi vẫn hỏng, nên "bảo giáo viên mở chia sẻ" không phải
 *     là cách sửa.
 *
 * Ở đây máy chủ đi lấy hộ: bám theo chuyển hướng, qua trang xác nhận, KIỂM
 * xem thứ lấy về có thật là âm thanh không, rồi mới chuyển tiếp cho trình
 * duyệt dưới tên miền của mình. Hai cái được:
 *
 *   1. Phát được, kể cả khi Google đổi lối tải.
 *   2. Hỏng thì hỏng RA TIẾNG — trả mã lỗi kèm câu tiếng Việt nói rõ phải
 *      làm gì, thay vì một máy phát câm.
 *
 * ── Vì sao chỉ nhận MÃ FILE, không nhận URL tuỳ ý ───────────────────────
 *
 * Nhận `?src=<url>` là mở một cái cổng cho người ngoài bắt máy chủ mình gọi
 * đi bất kỳ đâu (SSRF) — kể cả vào mạng nội bộ. Chỉ nhận mã file Drive thì
 * URL do chính mình dựng, không còn cửa đó.
 *
 * ── Lưu ý băng thông ────────────────────────────────────────────────────
 *
 * Byte đi qua máy chủ mình, nên một ca 1700 học sinh cùng nghe một file 5MB
 * là ~8.5GB nếu không có bộ nhớ đệm. Đặt `s-maxage` để CDN giữ lại — file
 * nghe vốn phát cho cả ca, không phải bí mật. Dù vậy, TẢI FILE LÊN vẫn là
 * lối nên dùng cho đề thi thật; đây là đường cứu link Drive đã lỡ dán.
 *
 * Luật thuần (nhận dạng HTML, dựng header…) nằm ở `lib/media/drive-audio.ts`
 * để test được bằng node — file route của Next không xuất thêm tên nào được.
 */
import { NextResponse } from "next/server";

import {
  headerAmThanh,
  laKieuAmThanh,
  laMaFileDrive,
  LOI_KHONG_TAI_THANG_DUOC,
  LOI_TRA_VE_TRANG_WEB,
  loiTuDrive,
  macXacNhanDrive,
  urlTaiDrive,
} from "@/lib/media/drive-audio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Đệm ở CDN 6 tiếng; trình duyệt giữ 1 tiếng. */
const CACHE = "public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400";

function loi(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

async function layTuDrive(
  id: string,
  range: string | null,
): Promise<Response | { loi: [number, string] }> {
  const headers: Record<string, string> = {
    // Không có UA thì Google hay trả trang rút gọn khác.
    "user-agent": "Mozilla/5.0 (compatible; FSCExamPlatform/1.0)",
  };
  if (range) headers.range = range;

  let res = await fetch(urlTaiDrive(id), { headers, redirect: "follow" });

  // Trang HTML = chưa phải file. Thử móc mã xác nhận rồi gọi lại một lần.
  if (res.ok && !laKieuAmThanh(res.headers.get("content-type"))) {
    const ma = macXacNhanDrive(await res.text());
    if (!ma) return { loi: [502, LOI_TRA_VE_TRANG_WEB] };
    res = await fetch(urlTaiDrive(id, ma), { headers, redirect: "follow" });
    if (!laKieuAmThanh(res.headers.get("content-type"))) {
      return { loi: [502, LOI_KHONG_TAI_THANG_DUOC] };
    }
  }

  const cau = loiTuDrive(res.status);
  if (cau) return { loi: [res.status === 404 ? 404 : res.status === 403 || res.status === 401 ? 403 : 502, cau] };
  return res;
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("drive")?.trim() ?? "";
  if (!laMaFileDrive(id)) {
    return loi(400, "Thiếu hoặc sai mã file Google Drive.");
  }

  try {
    const kq = await layTuDrive(id, req.headers.get("range"));
    if ("loi" in kq) return loi(kq.loi[0], kq.loi[1]);
    return new NextResponse(kq.body, {
      status: kq.status === 206 ? 206 : 200,
      headers: headerAmThanh(kq.headers, CACHE),
    });
  } catch (e) {
    return loi(
      502,
      `Không gọi được tới Google Drive (${
        e instanceof Error ? e.message : "lỗi mạng"
      }). Thử lại, hoặc tải thẳng file lên hệ thống.`,
    );
  }
}

/** Trình duyệt hay HEAD trước khi phát để hỏi độ dài. */
export async function HEAD(req: Request) {
  const res = await GET(req);
  return new NextResponse(null, { status: res.status, headers: res.headers });
}
