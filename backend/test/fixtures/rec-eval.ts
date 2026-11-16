export const REC_EVAL = ['AWS Cloud S3 EC2 điện toán đám mây', 'AI ML học máy trí tuệ nhân tạo', 'Giải tích đạo hàm tích phân toán học'].flatMap((topic, group) => Array.from({ length: 10 }, (_, i) => ({
  title: `${topic} ${i + 1}`, description: `${topic} Hướng dẫn bài tập thực hành ${i % 3}`, group,
  visibility: i === 9 ? 'PRIVATE' as const : 'PUBLIC' as const, deleting: group === 2 && i === 8,
  createdAt: new Date(Date.UTC(2026, 0, 1) + (group * 10 + i) * 2 * 86_400_000),
})));
