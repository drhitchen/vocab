import { useEffect, useRef, type KeyboardEvent } from 'react';
import { DESIGNS, useAppearance, type Design } from '../../appearance/appearance';

// The picker lives inside each design's chrome, so it remounts when the design changes.
// This flag lets the new instance take focus back so keyboard users keep their place.
let restoreFocus = false;

// Each design styles this group differently (text links, segmented control)
export default function DesignPicker() {
  const { design, setDesign } = useAppearance();
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!restoreFocus) return;
    restoreFocus = false;
    groupRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, []);

  function choose(next: Design) {
    if (next === design) return;
    restoreFocus = true;
    setDesign(next);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const current = DESIGNS.findIndex(d => d.id === design);
    choose(DESIGNS[(current + step + DESIGNS.length) % DESIGNS.length].id);
  }

  return (
    <div ref={groupRef} className="design-picker" role="radiogroup" aria-label="Design" onKeyDown={onKeyDown}>
      {DESIGNS.map(d => (
        <button
          key={d.id}
          type="button"
          role="radio"
          aria-checked={design === d.id}
          tabIndex={design === d.id ? 0 : -1}
          className="design-option"
          data-option={d.id}
          title={`${d.label} design`}
          onClick={() => choose(d.id)}
        >
          <span className="design-glyph" aria-hidden="true">{d.glyph}</span>
          <span className="design-label">{d.label}</span>
        </button>
      ))}
    </div>
  );
}
