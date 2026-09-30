import React from 'react';
import { Badge } from '../../../components/ui/Badge';
import { useDocSelectionStore } from '../../../stores/useDocSelectionStore';
import { DocItem } from '../../../types/document';
import './DocItemRow.css';

interface DocItemRowProps {
  doc: DocItem;
}

export const DocItemRow: React.FC<DocItemRowProps> = ({ doc }) => {
  const selectedDoc = useDocSelectionStore((state) => state.selectedDoc);
  const selectDoc = useDocSelectionStore((state) => state.selectDoc);

  const isSelected = selectedDoc?.path === doc.path;

  const metaParts = [doc.module, doc.date, doc.priority].filter(Boolean).join(' · ');

  return (
    <button
      className={`doc-item-row ${isSelected ? 'doc-item-active' : ''}`}
      onClick={() => selectDoc(doc)}
      title={`${doc.title || doc.name}\n${doc.path}`}
    >
      <div className="doc-item-top">
        <span className="doc-item-title">{doc.title || doc.name}</span>
        {doc.status && (
          <Badge variant={doc.status} size="xs">
            {doc.status}
          </Badge>
        )}
      </div>

      {metaParts && <div className="doc-item-meta">{metaParts}</div>}
    </button>
  );
};
