import { isValidElement, type ReactNode } from 'react';

interface ElementWithChildren {
  children?: ReactNode;
}

/**
 * Recursively extracts the plain text content from a React node tree.
 * Useful for reading the source of syntax-highlighted code blocks,
 * where the content may be split into nested <span> elements.
 */
export const reactNodeToText = (node: ReactNode): string => {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(reactNodeToText).join('');
  if (isValidElement<ElementWithChildren>(node)) return reactNodeToText(node.props.children);
  return '';
};
