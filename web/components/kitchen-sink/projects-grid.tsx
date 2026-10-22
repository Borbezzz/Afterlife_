"use client";

import { useMemo, useState } from "react";
import {
  type ColumnDef,
  type PaginationState,
  type SortingState,
  useTable,
} from "@tanstack/react-table";

import { Badge } from "@/components/reui/badge";
import {
  DataGrid,
  DataGridContainer,
  dataGridFeatures,
  type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import type { Liveness } from "@/lib/data";

export interface ProjectRow {
  id: string;
  title: string;
  event: string;
  liveness: Liveness;
  stars: number | null;
  team: number;
}

const LIVENESS_VARIANT = {
  alive: "success-light",
  dormant: "warning-light",
  dead: "secondary",
  unknown: "outline",
} as const;

/** ReUI Data Grid over the real project list (sortable, paginated). */
export function ProjectsGrid({ rows }: { rows: ProjectRow[] }) {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 8 });
  const [sorting, setSorting] = useState<SortingState>([{ id: "stars", desc: true }]);

  const columns = useMemo<ColumnDef<DataGridFeatures, ProjectRow>[]>(
    () => [
      { accessorKey: "title", header: "Project", size: 220 },
      { accessorKey: "event", header: "Event", size: 180 },
      {
        accessorKey: "liveness",
        header: "Liveness",
        size: 110,
        cell: (info) => {
          const value = info.getValue() as Liveness;
          return <Badge variant={LIVENESS_VARIANT[value]}>{value}</Badge>;
        },
      },
      {
        accessorKey: "stars",
        header: "GitHub stars",
        size: 110,
        cell: (info) => <>{(info.getValue() as number | null) ?? "-"}</>,
        meta: { headerClassName: "text-right", cellClassName: "text-right" },
      },
      {
        accessorKey: "team",
        header: "Team",
        size: 80,
        meta: { headerClassName: "text-right", cellClassName: "text-right" },
      },
    ],
    [],
  );

  const table = useTable({
    features: dataGridFeatures,
    columns,
    data: rows,
    pageCount: Math.ceil(rows.length / pagination.pageSize),
    getRowId: (row: ProjectRow) => row.id,
    state: { pagination, sorting },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
  });

  return (
    <DataGrid table={table} recordCount={rows.length}>
      <div className="w-full space-y-2.5">
        <DataGridContainer>
          <DataGridScrollArea>
            <DataGridTable />
          </DataGridScrollArea>
        </DataGridContainer>
        <DataGridPagination />
      </div>
    </DataGrid>
  );
}
