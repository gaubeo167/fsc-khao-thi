/**
 * Cơ sở sẽ được đóng dấu lên node vừa tạo (mục lục / khung YCCĐ).
 *
 * ── Vì sao đọc phiên đăng nhập thay vì bắt người gọi truyền vào ──────────
 *
 * `createTocNode` và `createCompetency` được gọi từ khoảng chục chỗ: màn quản
 * lý mục lục, màn khung YCCĐ, hộp nhập khung từ Word, hộp nhập bằng AI, trợ lý
 * tạo đề… Bắt mỗi chỗ tự truyền `campusId` nghĩa là chỉ cần MỘT chỗ quên là
 * node ra đời không có chủ — và node không chủ thì hiện ở mọi cơ sở, tức là
 * đúng cái rò rỉ mà việc này sinh ra để bịt. Lỗi kiểu đó không ai phát hiện
 * cho tới khi một cơ sở khác kêu "sao tôi có mục lục tôi chưa hề tạo".
 *
 * Nên đóng dấu ở MỘT chỗ, ngay trong store, đọc từ phiên đăng nhập — cùng cách
 * `recordAudit` lấy người thao tác. Người gọi vẫn ghi đè được khi thật sự cần.
 *
 * `superadmin` không gắn cơ sở nên đi theo cơ sở đang chọn trên thanh trên.
 */
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";

import { operatingCampusId } from "./campus-scope";

/** Đọc ngoài React (trong store). Trả `null` khi chưa xác định được. */
export function currentCampusId(): string | null {
  const session = useAuthStore.getState().session;
  const active = useCampusStore.getState().activeCampusId;
  return operatingCampusId(session?.role, session?.campusId, active);
}
