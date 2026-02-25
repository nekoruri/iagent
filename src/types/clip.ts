export interface Clip {
  id: string;
  url: string;
  title: string;
  content: string;      // DOMPurify 済み
  tags: string[];
  createdAt: number;
}
