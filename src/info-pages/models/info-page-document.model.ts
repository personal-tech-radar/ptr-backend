export interface InfoPageHeaderBlock {
  id?: string;
  type: 'header';
  data: { text: string; level: 2 | 3 | 4 | 5 | 6 };
}

export interface InfoPageParagraphBlock {
  id?: string;
  type: 'paragraph';
  data: { text: string };
}

export interface InfoPageDocument {
  time?: number;
  blocks: Array<{
    id?: string;
    type: 'header' | 'paragraph';
    data: { text: string; level?: number };
  }>;
  version?: string;
}
