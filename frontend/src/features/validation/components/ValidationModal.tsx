import { CheckCircle2, ShieldAlert } from 'lucide-react';
import React, { useState } from 'react';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { useDocSelectionStore } from '../../../stores/useDocSelectionStore';
import { useModalStore } from '../../../stores/useModalStore';
import { useDocuments } from '../../documents/hooks/useDocuments';
import { useValidation } from '../hooks/useValidation';
import './ValidationModal.css';

export const ValidationModal: React.FC = () => {
  const activeModal = useModalStore((state) => state.activeModal);
  const closeModal = useModalStore((state) => state.closeModal);
  const selectDoc = useDocSelectionStore((state) => state.selectDoc);
  const { data: docs = [] } = useDocuments();

  const { data: result, isLoading, error } = useValidation(activeModal === 'validate');
  const [filterType, setFilterType] = useState<string>('all');

  if (activeModal !== 'validate') return null;

  const handleSelectDocByPath = (path: string) => {
    const found = docs.find((d) => d.path === path);
    if (found) {
      selectDoc(found);
      closeModal();
    }
  };

  const issues = result?.issues || [];
  const filteredIssues = filterType === 'all'
    ? issues
    : issues.filter((it) => it.type === filterType);

  return (
    <Modal
      isOpen={true}
      onClose={closeModal}
      title="Frontmatter Convention Audit"
      size="lg"
      footer={
        <Button variant="secondary" onClick={closeModal}>
          Close
        </Button>
      }
    >
      <div className="validation-modal-content">
        {isLoading ? (
          <div className="validation-loading">
            <div className="btn-spinner" />
            <span>Auditing all scan roots for frontmatter conventions…</span>
          </div>
        ) : error ? (
          <Alert variant="error" title="Audit Failed">
            {error instanceof Error ? error.message : 'Unknown validation error'}
          </Alert>
        ) : result ? (
          <>
            {issues.length === 0 ? (
              <div className="validation-success-banner">
                <CheckCircle2 size={24} className="val-success-icon" />
                <div>
                  <div className="val-success-title">All conventions respected</div>
                  <div className="val-success-sub">
                    {result.checked} documents checked — no metadata drift or missing headers found.
                  </div>
                </div>
              </div>
            ) : (
              <div className="validation-summary-card">
                <div className="summary-headline">
                  <ShieldAlert size={18} className="val-warn-icon" />
                  <span>
                    Audited {result.checked} documents — found <strong>{issues.length}</strong> convention issues.
                  </span>
                </div>

                {/* Filter chips by issue type */}
                <div className="issue-type-filters">
                  <button
                    className={`issue-filter-chip ${filterType === 'all' ? 'active' : ''}`}
                    onClick={() => setFilterType('all')}
                  >
                    All Types ({issues.length})
                  </button>
                  {Object.entries(result.counts || {}).map(([type, count]) => (
                    <button
                      key={type}
                      className={`issue-filter-chip ${filterType === type ? 'active' : ''}`}
                      onClick={() => setFilterType(type)}
                    >
                      {type} ({count})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Issues list */}
            {filteredIssues.length > 0 && (
              <div className="issues-list-container">
                {filteredIssues.map((it, idx) => (
                  <div key={idx} className="issue-row">
                    <Badge variant="amber" size="xs">
                      {it.type}
                    </Badge>
                    <button
                      className="issue-path-btn font-mono"
                      onClick={() => handleSelectDocByPath(it.path)}
                      title="Click to view document"
                    >
                      {it.path}
                    </button>
                    <span className="issue-detail">{it.detail}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </Modal>
  );
};
