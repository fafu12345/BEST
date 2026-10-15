'use client';
import { useState, type ReactNode } from 'react';
export function PropertyFilters({ children, initiallyOpen }: { children: ReactNode; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return <div><button type="button" className="mb-3 text-sm font-semibold text-teal-800 md:hidden" aria-expanded={open} aria-controls="advanced-property-filters" onClick={() => setOpen(!open)}>{open ? '상세 필터 접기 −' : '상태·가격·면적·층수 필터 보기 ＋'}</button><div id="advanced-property-filters" className={`${open ? 'grid' : 'hidden'} gap-4 sm:grid-cols-2 md:grid lg:grid-cols-4`}>{children}</div></div>;
}
