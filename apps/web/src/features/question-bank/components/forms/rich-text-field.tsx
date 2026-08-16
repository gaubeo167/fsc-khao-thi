"use client";

import { Divide, Image as ImageIcon, Sigma } from "lucide-react";

import { IconButton } from "@/components/ui/icon-button";

import { WysiwygEditor, type WysiwygApi } from "../wysiwyg-editor";

/**
 * Ô nhập MỘT DÒNG có khung gõ công thức.
 *
 * Vì sao thay cho `<input>`/`<textarea>` trần: công thức trong hệ thống được
 * lưu dưới dạng `$…$`. Ô nhập trần hiện đúng chuỗi đó — người soạn thấy
 * `$x^{2}$` chứ không thấy x², và bấm vào cũng không sửa được bằng bảng công
 * thức. Đề nhập từ Word thì công thức tự động về dạng `$…$`, nên đúng những
 * ô này là chỗ công thức rơi vào và mắc kẹt.
 *
 * `WysiwygEditor` đổi `$…$` thành thẻ công thức bấm được, đúng như ô đề bài.
 */
export function RichTextField({
  value,
  onChange,
  placeholder,
  minHeight = 40,
  invalid,
}: {
  value: string | undefined;
  onChange: (next: string) => void;
  placeholder?: string;
  minHeight?: number;
  invalid?: boolean;
}) {
  return (
    <WysiwygEditor
      compact
      minHeight={minHeight}
      value={value ?? ""}
      onChange={onChange}
      placeholder={placeholder}
      invalid={invalid}
      toolbar={(api: WysiwygApi) => (
        <>
          <IconButton
            size="sm"
            variant="primary"
            title="Công thức toán"
            onClick={api.openMath}
          >
            <Sigma className="h-3.5 w-3.5" strokeWidth={2} />
          </IconButton>
          <IconButton size="sm" title="Chèn phân số" onClick={api.openFraction}>
            <Divide className="h-3.5 w-3.5" strokeWidth={2} />
          </IconButton>
          <IconButton
            size="sm"
            title="Chèn ảnh"
            onClick={() => api.openMedia("image")}
          >
            <ImageIcon className="h-3.5 w-3.5" strokeWidth={1.85} />
          </IconButton>
        </>
      )}
    />
  );
}
