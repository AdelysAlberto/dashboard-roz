import React, { useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { reactNodeToText } from '../../../utils/reactNodeToText';
import { MermaidBlock } from './MermaidBlock';

interface MarkdownRendererProps {
  content: string;
}

// Module scope on purpose: a new object here on every render makes react-markdown see new
// component types, so it unmounts and remounts every node. That lost the state of an open
// diagram every time the 4 s session poll re-rendered this pane.
const components: Components = {
  pre: ({ node: _node, children, ...props }) => {
    const [firstChild] = React.Children.toArray(children);
    const childProps = React.isValidElement<{ className?: string; children?: React.ReactNode }>(firstChild)
      ? firstChild.props
      : undefined;

    if (!childProps?.className?.includes('language-mermaid')) {
      return <pre {...props}>{children}</pre>;
    }

    return <MermaidBlock code={reactNodeToText(childProps.children)} />;
  },
  table: ({ children, ...props }) => (
    <div className="md-table-wrapper">
      <table {...props}>{children}</table>
    </div>
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  // Strip frontmatter if present
  const cleanBody = useMemo(() => {
    const m = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    if (m) return content.slice(m[0].length);
    return content;
  }, [content]);

  return (
    <div className="md-rendered">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={components}>
        {cleanBody}
      </ReactMarkdown>
    </div>
  );
};
