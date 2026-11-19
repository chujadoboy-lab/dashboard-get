import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

// 디자인겟 대시보드와 같은 구글시트입니다.
const CONFIG = {
  sheetId: '1HHT5zM80NA0WDa2Zq71MANTaRMqBt5Smr1Pdvz1x_6w',
  sheetName: '주문현황',
  refreshMilliseconds: 30_000,
  pageMilliseconds: 12_000,
};

interface Order {
  index: number;
  due: string;
  company: string;
  item: string;
  finishing: string;
}

interface SheetResponse {
  status?: string;
  table?: {
    cols: Array<{ label?: string }>;
    rows: Array<{ c: Array<{ v?: unknown } | null> }>;
  };
}

function headerKey(value: string): string {
  return value.replace(/\s/g, '');
}

function field(record: Record<string, unknown>, names: string[]): string {
  const keys = Object.keys(record);
  const exact = names
    .map((name) => keys.find((key) => headerKey(key) === name))
    .find(Boolean);
  const key = exact || keys.find((candidate) =>
    names.some((name) => headerKey(candidate).includes(name)),
  );
  return key ? String(record[key] ?? '').trim() : '';
}

function dateText(value: string): string {
  // Google gviz 날짜의 월은 0부터 시작합니다.
  const googleDate = value.match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})(?:,|\))/);
  if (googleDate) {
    return `${googleDate[1]}-${String(Number(googleDate[2]) + 1).padStart(2, '0')}-${googleDate[3].padStart(2, '0')}`;
  }
  const ordinary = value.match(/^(\d{4})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})/);
  if (ordinary) {
    return `${ordinary[1]}-${ordinary[2].padStart(2, '0')}-${ordinary[3].padStart(2, '0')}`;
  }
  return value || '-';
}

function parseOrders(text: string): Order[] {
  const prefix = 'google.visualization.Query.setResponse(';
  const start = text.indexOf(prefix);
  const end = text.lastIndexOf(');');
  if (start < 0 || end < start + prefix.length) {
    throw new Error('주문현황 시트 응답을 확인해 주세요.');
  }
  const response = JSON.parse(text.slice(start + prefix.length, end)) as SheetResponse;
  if (response.status === 'error' || !response.table) {
    throw new Error('주문현황 시트 연결을 확인해 주세요.');
  }
  const headers = response.table.cols.map((column) => (column.label || '').trim());
  if (!headers.some((header) => ['진행상태', '진행', '상태'].includes(headerKey(header)))) {
    throw new Error('주문현황 시트의 진행상태 열을 확인해 주세요.');
  }

  const orders: Order[] = [];
  response.table.rows.forEach((row, index) => {
    const record: Record<string, unknown> = {};
    headers.forEach((header, column) => {
      if (header) record[header] = row.c[column]?.v ?? '';
    });
    const status = field(record, ['진행상태', '진행', '상태']);
    const item = field(record, ['품목', '상품명']);
    if (!status.includes('대기') || headerKey(item).includes('추첨')) return;
    const project = field(record, ['주문건명']);
    orders.push({
      index,
      due: dateText(field(record, ['납기예정일', '납기일'])),
      company: field(record, ['상호', '업체명']) || '-',
      item: [item, project].filter(Boolean).join(' · ') || '-',
      finishing: field(record, ['후가공', '비고']) || '-',
    });
  });

  const sortDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '9999-99-99';
  return orders.sort((a, b) => sortDate(a.due).localeCompare(sortDate(b.due)) || b.index - a.index);
}

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const parts = Object.fromEntries(dateFormatter.formatToParts(now).map((part) => [part.type, part.value]));
  return (
    <time className="dg-tv-clock" dateTime={now.toISOString()}>
      {parts.year}년 {parts.month}월 {parts.day}일 {parts.weekday}
      <span>{parts.hour}:{parts.minute}</span>
    </time>
  );
}

const STYLES = `
:root { color-scheme: dark; }
html, body, #root {
  margin: 0 !important; padding: 0 !important; width: 100% !important;
  height: 100% !important; max-width: none !important; min-width: 0 !important;
  overflow: hidden !important; background: #1e293b !important;
}
body, #root { display: block !important; text-align: left !important; }
.dg-tv, .dg-tv * { box-sizing: border-box; }
.dg-tv {
  --tv-font: clamp(20px, 1.45vw, 56px);
  position: fixed; inset: 0; z-index: 9999; width: 100%; height: 100%;
  display: flex; flex-direction: column; gap: clamp(14px, 1.2vw, 46px);
  padding: clamp(20px, 2vw, 76px); overflow: hidden;
  background: #1e293b; color: #f8fafc;
  font-family: Pretendard, 'Noto Sans KR', 'Malgun Gothic', system-ui, sans-serif;
  font-weight: 700; line-height: 1.45; text-align: left;
}
.dg-tv-header { display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-shrink: 0; }
.dg-tv-heading { display: flex; align-items: center; gap: clamp(12px, 1vw, 38px); white-space: nowrap; }
.dg-tv h1 { margin: 0; color: #f8fafc; font-size: clamp(26px, 1.85vw, 72px); font-weight: 700; line-height: 1.3; }
.dg-tv-icon { width: 1em; height: 1em; border: 3px solid #60a5fa; border-radius: 50%; position: relative; font-size: clamp(26px, 1.85vw, 72px); flex-shrink: 0; }
.dg-tv-icon::before { content: ''; position: absolute; left: 46%; top: 16%; height: 34%; width: 3px; background: #60a5fa; }
.dg-tv-icon::after { content: ''; position: absolute; left: 46%; top: 46%; width: 28%; height: 3px; background: #60a5fa; transform: rotate(28deg); transform-origin: left center; }
.dg-tv-count { border-radius: 999px; background: #233b70; color: #93c5fd; font-size: var(--tv-font); padding: .3em .85em; font-variant-numeric: tabular-nums; }
.dg-tv-clock { display: block; white-space: nowrap; border: 1px solid #475569; border-radius: 9px; background: #334155; padding: .45em .9em; font-size: clamp(16px, 1.25vw, 48px); font-variant-numeric: tabular-nums; }
.dg-tv-clock span { color: #60a5fa; margin-left: .5em; }
.dg-tv-board { position: relative; flex: 1; min-height: 0; overflow: hidden; }
.dg-tv-table { width: 100%; margin: 0; border-collapse: collapse; table-layout: fixed; font-size: var(--tv-font); }
.dg-tv-table th { text-align: left; font-weight: 700; color: #93c5fd; border-bottom: 2px solid #3b82f6; padding: .2em 1em .5em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dg-tv-row { height: clamp(54px, 4vw, 154px); }
.dg-tv-table td { padding: 0 1em; border-bottom: 1px solid #475569; line-height: 1.45; vertical-align: middle; overflow: hidden; font-weight: 700; }
.dg-tv-table tr:last-child td { border-bottom: 0; }
.dg-tv-table td:first-child { font-variant-numeric: tabular-nums; }
.dg-tv-cell { display: block; width: 100%; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.dg-tv-empty { margin: 0; padding: 12vh 1em; text-align: center; color: #94a3b8; font-size: var(--tv-font); }
.dg-tv-bottom { display: flex; justify-content: space-between; align-items: center; gap: 16px; min-height: 1.4em; flex-shrink: 0; color: #94a3b8; font-size: clamp(14px, .95vw, 36px); }
.dg-tv-error { color: #fbbf24; margin: 0; font-weight: 500; }
.dg-tv-measure { position: absolute; top: 0; left: 0; visibility: hidden; pointer-events: none; }
@media (max-width: 850px) {
  .dg-tv { padding: 16px; }
  .dg-tv-header { align-items: flex-start; flex-wrap: wrap; gap: 12px; }
  .dg-tv-clock { margin-left: auto; }
  .dg-tv-table th, .dg-tv-table td { padding-inline: .5em; }
}
`;

function Columns() {
  return (
    <colgroup>
      <col style={{ width: '17%' }} /><col style={{ width: '30%' }} />
      <col style={{ width: '38%' }} /><col style={{ width: '15%' }} />
    </colgroup>
  );
}

export default function App() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [page, setPage] = useState(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLTableSectionElement>(null);
  const measuringRowRef = useRef<HTMLTableRowElement>(null);

  useLayoutEffect(() => {
    const board = boardRef.current;
    const header = headerRef.current;
    const row = measuringRowRef.current;
    if (!board || !header || !row) return;
    const measure = () => {
      const rowHeight = row.getBoundingClientRect().height;
      if (rowHeight <= 0) return;
      const available = board.clientHeight - header.getBoundingClientRect().height - 2;
      setRowsPerPage(Math.max(1, Math.floor(available / rowHeight)));
    };
    measure();
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(board);
    observer?.observe(header);
    observer?.observe(row);
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let activeController: AbortController | null = null;
    let lastUpdated: Date | null = null;
    document.title = '디자인겟 · 작업 대기 목록';

    const refresh = async () => {
      if (disposed || inFlight) return;
      inFlight = true;
      const controller = new AbortController();
      activeController = controller;
      const timeout = window.setTimeout(() => controller.abort(), 15_000);
      try {
        const query = new URLSearchParams({
          tqx: 'out:json', headers: '1', sheet: CONFIG.sheetName, _: String(Date.now()),
        });
        const response = await fetch(
          `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?${query}`,
          { signal: controller.signal, cache: 'no-store' },
        );
        if (!response.ok) throw new Error('주문현황 시트 연결을 확인해 주세요.');
        const result = parseOrders(await response.text());
        if (disposed) return;
        lastUpdated = new Date();
        setOrders(result);
        setLoaded(true);
        setError('');
      } catch {
        if (disposed) return;
        const last = lastUpdated
          ? ` · 마지막 조회 ${lastUpdated.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false })}`
          : '';
        setError(`연결 지연 · 30초마다 다시 조회합니다${last}`);
      } finally {
        window.clearTimeout(timeout);
        inFlight = false;
      }
    };
    const refreshWhenVisible = () => { if (!document.hidden) void refresh(); };
    void refresh();
    const timer = window.setInterval(() => void refresh(), CONFIG.refreshMilliseconds);
    window.addEventListener('online', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      disposed = true;
      activeController?.abort();
      window.clearInterval(timer);
      window.removeEventListener('online', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  const pageCount = Math.max(1, Math.ceil(orders.length / rowsPerPage));
  const currentPage = page % pageCount;
  useEffect(() => {
    if (pageCount < 2) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setPage((previous) => (previous + 1) % pageCount);
    }, CONFIG.pageMilliseconds);
    return () => window.clearInterval(timer);
  }, [pageCount]);
  const visibleOrders = useMemo(
    () => orders.slice(currentPage * rowsPerPage, (currentPage + 1) * rowsPerPage),
    [orders, currentPage, rowsPerPage],
  );

  return (
    <>
      <style>{STYLES}</style>
      <main className="dg-tv">
        <header className="dg-tv-header">
          <div className="dg-tv-heading">
            <span className="dg-tv-icon" aria-hidden="true" />
            <h1>작업 대기 목록</h1>
            <span className="dg-tv-count" aria-label="작업대기 총건수">
              {loaded ? `${orders.length.toLocaleString('ko-KR')}건` : '—건'}
            </span>
          </div>
          <Clock />
        </header>
        <div className="dg-tv-board" ref={boardRef}>
          <table className="dg-tv-table" aria-label="작업대기 주문">
            <Columns />
            <thead ref={headerRef}>
              <tr>{['납기예정일', '상호', '품목', '후가공'].map((label) => <th scope="col" key={label}>{label}</th>)}</tr>
            </thead>
            <tbody>
              {visibleOrders.map((order) => (
                <tr className="dg-tv-row" key={order.index}>
                  {[order.due, order.company, order.item, order.finishing].map((value, column) => (
                    <td key={column}><span className="dg-tv-cell" title={value}>{value}</span></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && <p className="dg-tv-empty">
            {loaded ? '작업대기 내역이 없습니다.' : error ? '시트 연결을 확인해 주세요.' : '작업대기 목록을 불러오는 중입니다.'}
          </p>}
          <table className="dg-tv-table dg-tv-measure" aria-hidden="true">
            <Columns />
            <tbody><tr className="dg-tv-row" ref={measuringRowRef}>
              {['날짜', '상호', '품목', '후가공'].map((label) => <td key={label}><span className="dg-tv-cell">{label}</span></td>)}
            </tr></tbody>
          </table>
        </div>
        <footer className="dg-tv-bottom">
          <p className="dg-tv-error" role="status">{error}</p>
          {pageCount > 1 && <span>{currentPage + 1} / {pageCount}</span>}
        </footer>
      </main>
    </>
  );
}
