import { ArrowUpDown, FolderTree, Layers, Search, SlidersHorizontal, X } from 'lucide-react';
import React from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { useFilterStore } from '../../../stores/useFilterStore';
import { GroupOption, SortOption } from '../../../types/common';
import { StatusType } from '../../../types/document';
import { useDocuments } from '../hooks/useDocuments';
import { useFilteredDocs } from '../hooks/useFilteredDocs';
import { DocItemRow } from './DocItemRow';
import './DocSidebar.css';

export const DocSidebar: React.FC = () => {
  const { data: docs = [], isLoading } = useDocuments();
  const { filteredDocs, groupedDocs, countsByStatus, uniqueRoots } = useFilteredDocs(docs);

  const search = useFilterStore((state) => state.search);
  const setSearch = useFilterStore((state) => state.setSearch);
  const statusFilter = useFilterStore((state) => state.statusFilter);
  const setStatusFilter = useFilterStore((state) => state.setStatusFilter);
  const rootFilter = useFilterStore((state) => state.rootFilter);
  const setRootFilter = useFilterStore((state) => state.setRootFilter);
  const sortBy = useFilterStore((state) => state.sortBy);
  const setSortBy = useFilterStore((state) => state.setSortBy);
  const groupBy = useFilterStore((state) => state.groupBy);
  const setGroupBy = useFilterStore((state) => state.setGroupBy);
  const resetFilters = useFilterStore((state) => state.resetFilters);

  const hasActiveFilters =
    search !== '' ||
    statusFilter !== 'all' ||
    rootFilter !== 'all' ||
    sortBy !== 'title-asc' ||
    groupBy !== 'root';

  return (
    <aside className="doc-sidebar">
      {/* Search Bar */}
      <div className="doc-sidebar-search">
        <Input
          placeholder="Filter documents (title, module, path)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<Search size={14} />}
          rightElement={
            search ? (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                <X size={12} />
              </Button>
            ) : undefined
          }
        />
      </div>

      {/* Filter and Sort Controls in Dropdowns */}
      <div className="doc-sidebar-controls">
        <div className="control-row">
          <div className="control-item">
            <Select
              label="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusType | 'all')}
            >
              <option value="all">All Statuses ({countsByStatus.all || 0})</option>
              <option value="pending">↻ Pending ({countsByStatus.pending || 0})</option>
              <option value="in progress">▶ In Progress ({countsByStatus['in progress'] || countsByStatus['in_progress'] || 0})</option>
              <option value="done">✓ Done ({countsByStatus.done || 0})</option>
              <option value="blocked">⛔ Blocked ({countsByStatus.blocked || 0})</option>
              <option value="rejected">✗ Rejected ({countsByStatus.rejected || 0})</option>
              <option value="deprecated">⊘ Deprecated ({countsByStatus.deprecated || 0})</option>
              <option value="none">No Status ({countsByStatus.none || 0})</option>
            </Select>
          </div>

          <div className="control-item">
            <Select
              label="Root Path"
              value={rootFilter}
              onChange={(e) => setRootFilter(e.target.value)}
            >
              <option value="all">All Scan Roots</option>
              {uniqueRoots.map((r) => (
                <option key={r} value={r}>
                  {r.split('/').slice(-2).join('/')}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="control-row">
          <div className="control-item">
            <Select
              label="Sort By"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
            >
              <option value="title-asc">A → Z (Alphabetical)</option>
              <option value="title-desc">Z → A (Reverse)</option>
              <option value="date-desc">Newest Date</option>
              <option value="date-asc">Oldest Date</option>
              <option value="status">By Status</option>
            </Select>
          </div>

          <div className="control-item">
            <Select
              label="Group By"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupOption)}
            >
              <option value="root">Root Directory</option>
              <option value="folder">Subfolder</option>
              <option value="module">Module Field</option>
              <option value="none">Flat (No Grouping)</option>
            </Select>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="active-filters-bar">
            <span className="results-count">
              {filteredDocs.length} of {docs.length} docs
            </span>
            <Button variant="ghost" size="xs" onClick={resetFilters}>
              Reset filters
            </Button>
          </div>
        )}
      </div>

      {/* Documents List / Tree */}
      <div className="doc-sidebar-list">
        {isLoading ? (
          <div className="sidebar-state-msg">
            <div className="btn-spinner" />
            <span>Scanning documents…</span>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="sidebar-state-msg">
            <span>No documents match your filters.</span>
          </div>
        ) : (
          Object.entries(groupedDocs).map(([groupTitle, items]) => (
            <div key={groupTitle} className="doc-group-section">
              <div className="doc-group-title">
                <FolderTree size={12} />
                <span>{groupTitle}</span>
                <span className="doc-group-count">{items.length}</span>
              </div>
              <div className="doc-group-items">
                {items.map((doc) => (
                  <DocItemRow key={doc.path} doc={doc} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
};
