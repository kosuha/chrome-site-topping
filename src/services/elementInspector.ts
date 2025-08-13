const EXT = 'site-topping-';
const ROOT_ID = 'site-topping-root';

let active = false;
let boxEl: HTMLDivElement | null = null;
let labelEl: HTMLDivElement | null = null;
let lastTarget: Element | null = null;

// 기존 루트 스타일 복원용 저장소
let prevRootPointerEvents: string | null = null;
let prevRootOpacity: string | null = null;
let prevRootTransition: string | null = null;

function ensureOverlay() {
  if (boxEl && labelEl) return;

  boxEl = document.createElement('div');
  boxEl.id = `${EXT}inspector-box`;
  Object.assign(boxEl.style, {
    position: 'fixed',
    left: '0px',
    top: '0px',
    width: '0px',
    height: '0px',
    pointerEvents: 'none',
    zIndex: '2147483646',
    border: '2px solid #4F46E5',
    boxShadow: '0 0 0 2px rgba(79,70,229,.35), 0 0 0 6px rgba(79,70,229,.15)',
    borderRadius: '2px',
    transition: 'all 40ms ease',
    boxSizing: 'border-box',
    background: 'transparent',
  } as CSSStyleDeclaration);

  labelEl = document.createElement('div');
  labelEl.id = `${EXT}inspector-label`;
  Object.assign(labelEl.style, {
    position: 'fixed',
    padding: '4px 8px',
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
    fontSize: '12px',
    color: '#fff',
    background: '#4F46E5',
    borderRadius: '4px',
    pointerEvents: 'none',
    zIndex: '2147483647',
    maxWidth: '50vw',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    boxShadow: '0 2px 8px rgba(0,0,0,.2)'
  } as CSSStyleDeclaration);

  document.body.appendChild(boxEl);
  document.body.appendChild(labelEl);
}

function clearOverlay() {
  boxEl?.remove();
  labelEl?.remove();
  boxEl = null;
  labelEl = null;
}

function isOurUI(el: Element | null) {
  if (!el) return false;
  const root = document.getElementById(ROOT_ID);
  if (root && (el === root || root.contains(el))) return true;
  if ((el as HTMLElement).id && (el as HTMLElement).id.startsWith(EXT)) return true;
  return false;
}

function getCssSelector(el: Element): string {
  if (!(el instanceof Element)) return '';
  const id = (el as HTMLElement).id;
  if (id) return `#${CSS.escape(id)}`;

  const parts: string[] = [];
  let cur: Element | null = el;
  let depth = 0;

  while (
    cur &&
    cur.nodeType === 1 &&
    depth < 6 &&
    cur !== document.body &&
    cur !== document.documentElement
  ) {
    const curId = (cur as HTMLElement).id;
    if (curId) {
      parts.unshift(`#${CSS.escape(curId)}`);
      break;
    }
    const tag = cur.tagName.toLowerCase();
    const cls = Array.from((cur as HTMLElement).classList)
      .slice(0, 2)
      .map((c) => `.${CSS.escape(c)}`)
      .join('');
    let part = `${tag}${cls}`;
    const parent = cur.parentElement;
    if (parent) {
      const sameTagSiblings = Array.from(parent.children).filter(
        (ch) => (ch as Element).tagName === cur!.tagName
      );
      if (sameTagSiblings.length > 1) {
        const idx = sameTagSiblings.indexOf(cur) + 1;
        part += `:nth-of-type(${idx})`;
      }
    }
    parts.unshift(part);
    cur = cur.parentElement;
    depth++;
  }
  return parts.join(' > ') || el.tagName.toLowerCase();
}

function updateUIFor(el: Element) {
  if (!boxEl || !labelEl) return;
  const r = (el as HTMLElement).getBoundingClientRect();
  boxEl.style.left = `${r.left}px`;
  boxEl.style.top = `${r.top}px`;
  boxEl.style.width = `${Math.max(0, r.width)}px`;
  boxEl.style.height = `${Math.max(0, r.height)}px`;

  const sel = getCssSelector(el);
  labelEl.textContent = sel;

  const pad = 6;
  const labelHeight = 24;
  let lx = Math.min(window.innerWidth - 12, Math.max(pad, r.left));
  let ly = r.top - labelHeight - 6;
  if (ly < pad) ly = r.bottom + 6;
  labelEl.style.left = `${lx}px`;
  labelEl.style.top = `${ly}px`;
}

function pickElementAt(x: number, y: number): Element | null {
  const el = document.elementFromPoint(x, y) as Element | null;
  if (!el || isOurUI(el)) return null;
  return el;
}

function onMouseMove(e: MouseEvent) {
  if (!active) return;
  const target = pickElementAt(e.clientX, e.clientY);
  if (!target) return;
  if (target === lastTarget) return;
  lastTarget = target;
  updateUIFor(target);
}

function onClick(e: MouseEvent) {
  if (!active) return;
  e.preventDefault();
  e.stopPropagation();
  const target = pickElementAt(e.clientX, e.clientY);
  if (!target) return;
  const selector = getCssSelector(target);
  try {
    window.postMessage({ type: 'SITE_TOPPING_ELEMENT_PICKED', selector }, '*');
  } catch {}
  disableElementInspector();
}

function onKeyDown(e: KeyboardEvent) {
  if (!active) return;
  if (e.key === 'Escape') {
    disableElementInspector();
  }
}

function setExtensionNonInteractive(enable: boolean) {
  const root = document.getElementById(ROOT_ID) as HTMLElement | null;
  if (!root) return;
  if (enable) {
    // 기존 인라인 스타일 백업
    prevRootPointerEvents = root.getAttribute('style')?.includes('pointer-events') ? root.style.pointerEvents : null;
    prevRootOpacity = root.getAttribute('style')?.includes('opacity') ? root.style.opacity : null;
    prevRootTransition = root.getAttribute('style')?.includes('transition') ? root.style.transition : null;
    // 투명도/포인터 비활성화 적용 (!important 로 우선순위 높임)
    root.style.setProperty('pointer-events', 'none', 'important');
    root.style.setProperty('opacity', '0.3', 'important');
    root.style.transition = 'opacity 120ms ease';
  } else {
    // 원복
    root.style.removeProperty('pointer-events');
    root.style.removeProperty('opacity');
    if (prevRootPointerEvents !== null) root.style.pointerEvents = prevRootPointerEvents;
    if (prevRootOpacity !== null) root.style.opacity = prevRootOpacity;
    if (prevRootTransition !== null) root.style.transition = prevRootTransition; else root.style.removeProperty('transition');
    prevRootPointerEvents = prevRootOpacity = prevRootTransition = null;
  }
}

export function enableElementInspector() {
  if (active) return;
  active = true;
  ensureOverlay();
  setExtensionNonInteractive(true);
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
  try {
    window.postMessage({ type: 'SITE_TOPPING_PICKER_START' }, '*');
  } catch {}
}

export function disableElementInspector() {
  if (!active) return;
  active = false;
  document.removeEventListener('mousemove', onMouseMove, true);
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('keydown', onKeyDown, true);
  clearOverlay();
  setExtensionNonInteractive(false);
  lastTarget = null;
  try {
    window.postMessage({ type: 'SITE_TOPPING_PICKER_STOP' }, '*');
  } catch {}
}

export function isElementInspectorActive() {
  return active;
}
