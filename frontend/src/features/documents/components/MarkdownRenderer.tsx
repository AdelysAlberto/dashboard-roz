import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { reactNodeToText } from '../../../utils/reactNodeToText';
import { MermaidBlock } from './MermaidBlock';

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  // Strip frontmatter if present
  const cleanBody = useMemo(() => {
    const m = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    if (m) return content.slice(m[0].length);
    return content;
  }, [content]);

  return (
    <div className="md-rendered">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ node: _node, children, ...props }) => {
            const [firstChild] = React.Children.toArray(children);
            const childProps = React.isValidElement<{ className?: string; children?: React.ReactNode }>(
              firstChild
            )
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
        }}
      >
        {cleanBody}
      </ReactMarkdown>
    </div>
  );
};
