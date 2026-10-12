import { partId, toKatex } from '@tutor/shared';
import katex from 'katex';
import { useEffect, useMemo, useRef } from 'react';
import type { Block, BoardState } from '../board';

const blockDomId = (id: string) => `blk-${id}`;

function Equation({ block }: { block: Block }) {
  const html = useMemo(
    () => katex.renderToString(toKatex(block.content, block.id), { throwOnError: false, trust: true, strict: false, displayMode: true }),
    [block.content, block.id],
  );
  return <div id={blockDomId(block.id)} className="my-2 w-fit px-1" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Whiteboard({ board }: { board: BoardState }) {
  const ref = useRef<HTMLDivElement>(null);

  // Highlights are classes on rendered nodes, so they are re-applied after every render.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.querySelectorAll('.hl').forEach((el) => el.classList.remove('hl'));
    let last: Element | null = null;
    for (const h of board.highlights) {
      const el = document.getElementById(h.part ? partId(h.target, h.part) : blockDomId(h.target));
      if (el && root.contains(el)) {
        el.classList.add('hl');
        last = el;
      }
    }
    (last ?? root.lastElementChild)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [board]);

  return (
    <div
      ref={ref}
      className="board h-full min-h-72 overflow-auto rounded-xl border border-stone-300 bg-white p-5 shadow-sm"
      aria-label="Whiteboard"
      aria-live="polite"
    >
      {board.blocks.length === 0 && <p className="text-stone-400">The whiteboard is empty.</p>}
      {board.blocks.map((block, i) =>
        block.kind === 'equation' ? (
          <Equation key={block.id} block={block} />
        ) : (
          <p
            key={block.id}
            id={blockDomId(block.id)}
            className={`my-2 w-fit px-1 ${i === 0 ? 'text-xl font-semibold text-stone-800' : 'text-lg text-stone-700'}`}
          >
            {block.content}
          </p>
        ),
      )}
    </div>
  );
}
