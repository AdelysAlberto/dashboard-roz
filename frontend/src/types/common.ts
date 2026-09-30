export type SortOption = 'title-asc' | 'title-desc' | 'date-desc' | 'date-asc' | 'status';
export type GroupOption = 'root' | 'folder' | 'module' | 'none';
export type ActiveTab = 'doc' | 'analysis' | 'monitor';
export type ThemeMode = 'dark' | 'light';

export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  message: string;
  duration?: number;
}
