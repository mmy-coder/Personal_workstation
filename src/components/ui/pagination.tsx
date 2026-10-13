import { Button } from "./button";

export function Pagination({
  page,
  pageSize,
  total,
  loading,
  label,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
  label: string;
  onPage: (page: number) => void;
}) {
  if (total <= pageSize) return null;
  return (
    <nav className="pagination" aria-label={label}>
      <span>
        共 {total} 条 · 第 {page} / {Math.ceil(total / pageSize)} 页
      </span>
      <Button
        variant="outline"
        disabled={loading || page <= 1}
        onClick={() => onPage(page - 1)}
      >
        上一页
      </Button>
      <Button
        variant="outline"
        disabled={loading || page * pageSize >= total}
        onClick={() => onPage(page + 1)}
      >
        下一页
      </Button>
    </nav>
  );
}
