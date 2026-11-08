# PHILOSOPHY EXAM - Hệ thống thi trắc nghiệm Triết học

Next.js (App Router) + Tailwind + Supabase (PostgreSQL + Realtime). Triển khai trên Vercel.

## 1. Tạo cơ sở dữ liệu (Supabase)

1. Tạo project mới tại supabase.com.
2. Vào **SQL Editor**, dán toàn bộ nội dung `supabase/schema.sql` rồi nhấn Run.
3. Dán tiếp `supabase/seed_questions.sql` rồi nhấn Run.
4. Chạy LẦN LƯỢT `supabase/migration_v2.sql`, `migration_v3.sql`, `migration_v4.sql`, `migration_v5.sql` (bắt buộc; thiếu thì nút DỪNG THI / RESET sẽ lỗi 500).
5. Kiểm tra: `select count(*) from questions;` phải trả về **20**.

## 2. Biến môi trường (Vercel → Project → Settings → Environment Variables)

| Biến | Lấy ở đâu | Ghi chú |
|---|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API | Địa chỉ dạng `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API keys (service_role / secret) | **Bí mật**, chỉ dán vào Vercel |
| `NEXT_PUBLIC_SUPABASE_URL` | Giống `SUPABASE_URL` | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API keys (anon / publishable) | An toàn cho trình duyệt |
| `ADMIN_USERNAME` | Tự đặt | `admin` |
| `ADMIN_MSSV` | Tự đặt | `26119015` |
| `SESSION_SECRET` | Tự tạo | Ít nhất 32 ký tự, ví dụ `openssl rand -hex 32` |

Sao chép `.env.example` thành `.env.local` để chạy thử trên máy.

## 3. Chạy thử và triển khai

```bash
npm install
npm run dev          # http://localhost:3000
```

Đưa mã nguồn lên GitHub, rồi import repo vào Vercel. Sau khi thêm biến môi trường, bấm **Deploy**.

## 4. Luồng sử dụng

1. Thí sinh đăng nhập bằng họ tên và MSSV, vào **phòng chờ** và chat.
2. Admin đăng nhập bằng tên `admin` và MSSV quản trị, rồi bấm **START EXAM**.
3. Khi kỳ thi bắt đầu: thí sinh chuyển sang bài thi, phòng chat đóng, người vào sau không được tham gia.
4. Mỗi câu 30 giây. Chọn đáp án là khóa, hiện ĐÚNG/SAI rồi tự chuyển câu.
5. Sau khi hoàn thành hoặc bị loại, thí sinh xem kết quả và các câu sai. Admin xem bảng xếp hạng.

## 5. Các quy tắc đã chọn (có thể đổi)

- **Điểm** = với mỗi câu trả lời ĐÚNG, điểm bằng số giây còn lại khi chọn (làm tròn xuống); sai hoặc hết giờ = 0. 20 câu × 30 giây, tối đa **600** điểm.
- **Họ tên**: phải điền đúng họ tên thật, điền sai thì hủy kết quả.
- **Một lần duy nhất**: làm bài từ 2 lần trở lên thì hủy kết quả.
- **Xếp hạng**: điểm cao hơn trước; bằng điểm thì thời gian ngắn hơn trước; bằng cả hai thì nộp trước.
- **Vi phạm**: rời tab, chuyển cửa sổ hoặc đóng trang thi. Lần đầu là **cảnh cáo**, lần thứ hai là **loại**. Muốn loại ngay từ lần đầu, sửa một dòng trong hàm `record_violation` (`case when counted = 0`).
- **Mất mạng** chỉ được ghi nhận để tham khảo, không tính là vi phạm.
- **Đăng nhập lại**: cùng MSSV và cùng họ tên thì được vào lại (ví dụ khi tải lại trang). Khác họ tên thì bị từ chối.
- **Thời gian** do máy chủ quyết định. Đồng hồ trên trình duyệt chỉ để hiển thị.

## 6. Realtime

Server gửi tín hiệu "poke" (không chứa dữ liệu) tới các trình duyệt. Trình duyệt nhận tín hiệu rồi tải lại từ API có kiểm tra quyền. Nếu tín hiệu không đến, trang vẫn tự làm mới sau 3-4 giây.

## 7. Kiểm thử trước khi dùng thật

- [ ] Đăng nhập thí sinh, đăng nhập admin, thử sai MSSV.
- [ ] Hai thí sinh chat, tin nhắn hiện ngay trên máy kia.
- [ ] START EXAM: mọi thí sinh chuyển sang bài thi trong vài giây; người mới đăng nhập bị từ chối.
- [ ] Mỗi câu hết 30 giây thì tự chuyển; tải lại trang không cấp thêm giờ.
- [ ] Chuyển tab thì ghi nhận vi phạm và admin thấy trong VIOLATION MONITOR.
- [ ] Hoàn thành 20 câu thì có điểm, xem lại câu sai, không thấy bảng xếp hạng.
- [ ] Admin thấy bảng xếp hạng TOP 100 đúng thứ tự.

Tải 120 người cùng lúc chưa được kiểm thử trong phiên bản này. Cần chạy thử trên môi trường riêng trước kỳ thi thật.
