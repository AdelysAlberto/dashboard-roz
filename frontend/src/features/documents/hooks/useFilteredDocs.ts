import { useMemo } from 'react';
import { useFilterStore } from '../../../stores/useFilterStore';
import { DocItem } from '../../../types/document';

export function useFilteredDocs(docs: DocItem[] = []) {
  const search = useFilterStore((state) => state.search);
  const statusFilter = useFilterStore((state) => state.statusFilter);
  const rootFilter = useFilterStore((state) => state.rootFilter);
  const sortBy = useFilterStore((state) => state.sortBy);
  const groupBy = useFilterStore((state) => state.groupBy);

  const { filteredDocs, countsByStatus, uniqueRoots, groupedDocs } = useMemo(() => {
    const q = search.toLowerCase().trim();
    const counts: Record<string, number> = {
      all: docs.length,
      pending: 0,
      'in progress': 0,
      in_progress: 0,
      done: 0,
      blocked: 0,
      rejected: 0,
      deprecated: 0,
      none: 0,
    };
    const rootsSet = new Set<string>();

    const normStatus = (s?: string) => (s || '').toLowerCase().trim().replace(/[\s_]+/g, '-');

    // Calculate baseline counts
    docs.forEach((doc) => {
      if (doc.root) rootsSet.add(doc.root);
      const st = doc.status ? doc.status.toLowerCase().trim() : 'none';
      if (counts[st] !== undefined) {
        counts[st]++;
      } else {
        counts[st] = 1;
      }
      const normalized = normStatus(doc.status);
      if (normalized === 'in-progress') {
        counts['in_progress'] = (counts['in_progress'] || 0) + 1;
        counts['in progress'] = (counts['in progress'] || 0) + 1;
      }
    });

    // Filter
    let result = docs.filter((doc) => {
      // Status filter
      if (statusFilter === 'none' && doc.status) return false;
      if (
        statusFilter !== 'all' &&
        statusFilter !== 'none' &&
        normStatus(doc.status) !== normStatus(statusFilter)
      ) {
        return false;
      }

      // Root filter
      if (rootFilter !== 'all' && doc.root !== rootFilter) {
        return false;
      }

      // Text search
      if (q) {
        const fullText = `${doc.title || ''} ${doc.name || ''} ${doc.description || ''} ${doc.module || ''} ${doc.path || ''}`.toLowerCase();
        if (!fullText.includes(q)) return false;
      }

      return true;
    });

    // Sort
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'title-asc':
          return (a.title || a.name).localeCompare(b.title || b.name);
        case 'title-desc':
          return (b.title || b.name).localeCompare(a.title || a.name);
        case 'date-desc':
          return (b.date || '').localeCompare(a.date || '');
        case 'date-asc':
          return (a.date || '').localeCompare(b.date || '');
        case 'status':
          return (a.status || 'zzz').localeCompare(b.status || 'zzz');
        default:
          return 0;
      }
    });

    // Grouping
    const groups: Record<string, DocItem[]> = {};
    if (groupBy === 'none') {
      groups['All Documents'] = result;
    } else if (groupBy === 'folder') {
      result.forEach((doc) => {
        const key = doc.parent ? doc.parent.split('/').slice(-2).join('/') : 'Root';
        (groups[key] ||= []).push(doc);
      });
    } else if (groupBy === 'module') {
      result.forEach((doc) => {
        const key = doc.module || 'No Module';
        (groups[key] ||= []).push(doc);
      });
    } else {
      // Default: root grouping
      result.forEach((doc) => {
        const key = doc.root ? doc.root.split('/').slice(-2).join('/') : 'General';
        (groups[key] ||= []).push(doc);
      });
    }

    return {
      filteredDocs: result,
      countsByStatus: counts,
      uniqueRoots: Array.from(rootsSet),
      groupedDocs: groups,
    };
  }, [docs, search, statusFilter, rootFilter, sortBy, groupBy]);

  return {
    filteredDocs,
    groupedDocs,
    countsByStatus,
    uniqueRoots,
    totalFilteredCount: filteredDocs.length,
  };
}
