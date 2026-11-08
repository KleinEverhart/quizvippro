/** Nguồn duy nhất cho luật chơi phía giao diện. Nếu đổi SECONDS_PER_QUESTION, phải đổi cả migration SQL (xem migration_v5.sql). */
export const QUESTION_COUNT = 20;
export const SECONDS_PER_QUESTION = 30;
export const MAX_SCORE = QUESTION_COUNT * SECONDS_PER_QUESTION; // 600

export const RULES: string[] = [
  `Kỳ thi gồm ${QUESTION_COUNT} câu trắc nghiệm, mỗi câu ${SECONDS_PER_QUESTION} giây.`,
  `Điểm mỗi câu = số giây còn lại khi bạn chọn đáp án ĐÚNG. Chọn sai hoặc hết giờ được 0 điểm. Tối đa ${MAX_SCORE} điểm.`,
  'Phải điền đúng họ và tên thật. Điền sai (hoặc đổi tên) sẽ bị hủy kết quả.',
  'Mỗi người chỉ được làm bài một lần duy nhất. Làm bài từ 2 lần trở lên sẽ bị hủy kết quả.',
  'Rời khỏi trang thi (chuyển tab, chuyển cửa sổ) sẽ bị ghi nhận: lần đầu cảnh cáo, lần thứ hai bị loại.',
  'Chơi ăn gian là admin biết hết đó nha 😏',
];
