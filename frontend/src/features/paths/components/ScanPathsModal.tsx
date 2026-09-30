import { FolderPlus, History, Trash2, X } from 'lucide-react';
import React, { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { useModalStore } from '../../../stores/useModalStore';
import { useScanPaths } from '../hooks/useScanPaths';
import './ScanPathsModal.css';

export const ScanPathsModal: React.FC = () => {
  const activeModal = useModalStore((state) => state.activeModal);
  const closeModal = useModalStore((state) => state.closeModal);
  const {
    roots,
    recentPaths,
    addRootMutation,
    deleteRootMutation,
    clearRecentPath,
  } = useScanPaths();

  const [newPath, setNewPath] = useState('');

  if (activeModal !== 'paths') return null;

  const handleAdd = async (pathToAdd?: string) => {
    const target = (pathToAdd || newPath).trim();
    if (!target) return;
    await addRootMutation.mutateAsync(target);
    if (!pathToAdd) setNewPath('');
  };

  const handleDelete = (path: string) => {
    deleteRootMutation.mutate(path);
  };

  return (
    <Modal
      isOpen={true}
      onClose={closeModal}
      title="Configure Scan Paths"
      size="md"
      footer={
        <Button variant="secondary" onClick={closeModal}>
          Close
        </Button>
      }
    >
      <div className="scan-paths-modal-content">
        <p className="scan-paths-intro">
          Roz recursively searches for <code>.md</code> documents within the following folders. All paths are validated before indexing.
        </p>

        {/* Active Roots List */}
        <div className="active-roots-section">
          <div className="section-subtitle">Active Scan Folders ({roots.length})</div>
          {roots.length === 0 ? (
            <div className="no-roots-msg">No scan roots configured. Add a folder below.</div>
          ) : (
            <ul className="roots-list">
              {roots.map((r) => (
                <li key={r} className="root-item">
                  <span className="root-item-path font-mono" title={r}>
                    {r}
                  </span>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleDelete(r)}
                    disabled={deleteRootMutation.isPending}
                    aria-label={`Remove ${r}`}
                    leftIcon={<Trash2 size={13} />}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add New Folder */}
        <div className="add-root-form">
          <Input
            placeholder="/absolute/path/to/markdown/folder"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            leftIcon={<FolderPlus size={14} />}
          />
          <Button
            variant="primary"
            size="md"
            onClick={() => handleAdd()}
            disabled={!newPath.trim() || addRootMutation.isPending}
            isLoading={addRootMutation.isPending}
          >
            Add Path
          </Button>
        </div>

        {/* LocalStorage History / Bookmarks */}
        {recentPaths.length > 0 && (
          <div className="recent-paths-section">
            <div className="section-subtitle">
              <History size={12} />
              <span>Saved in LocalStorage ({recentPaths.length})</span>
            </div>
            <div className="recent-chips-list">
              {recentPaths.map((rp) => {
                const isAlreadyActive = roots.includes(rp);
                return (
                  <div key={rp} className="recent-chip">
                    <button
                      className="recent-chip-btn font-mono"
                      onClick={() => !isAlreadyActive && handleAdd(rp)}
                      disabled={isAlreadyActive || addRootMutation.isPending}
                      title={isAlreadyActive ? 'Already added' : `Click to add ${rp}`}
                    >
                      {rp.split('/').slice(-2).join('/')}
                      {isAlreadyActive && <span className="active-dot">✓</span>}
                    </button>
                    <button
                      className="recent-chip-remove"
                      onClick={() => clearRecentPath(rp)}
                      aria-label="Remove from history"
                    >
                      <X size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
