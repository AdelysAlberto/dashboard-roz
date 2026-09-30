import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';

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
