export type SupportTopic = 'bug' | 'feature' | 'other';

export const SUPPORT_TOPICS: Array<{ id: SupportTopic; label: string }> = [
  { id: 'bug', label: 'Ошибка в приложении' },
  { id: 'feature', label: 'Предложение / что добавить' },
  { id: 'other', label: 'Другое' },
];

export function getSupportTopicLabel(topic: SupportTopic): string {
  return SUPPORT_TOPICS.find((t) => t.id === topic)?.label ?? 'Обращение';
}
