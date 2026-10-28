import { Component } from '@theme/component';
import { scrollIntoView } from '@theme/scrolling';
import { prefersReducedMotion, startViewTransition } from '@theme/utilities';

/**
 * A scrollytelling section: the media column pins in place while chapters scroll past,
 * and the pinned image swaps to match whichever chapter crosses the middle of the viewport.
 *
 * Image swaps run through a same-document view transition (via `startViewTransition`), which
 * already falls back to an instant swap for reduced motion, low power devices and unsupported browsers.
 *
 * @typedef {object} ScrollStoryRefs
 * @property {HTMLElement} mediaFrame - The pinned frame that holds every chapter's media
 * @property {HTMLElement[]} [mediaItems] - One media item per chapter
 * @property {HTMLElement[]} [chapters] - The chapter blocks that drive the active index
 * @property {HTMLButtonElement[]} [progressButtons] - Optional progress indicator buttons
 *
 * @extends {Component<ScrollStoryRefs>}
 */
export class ScrollStoryComponent extends Component {
  requiredRefs = ['mediaFrame'];

  /** @type {IntersectionObserver | undefined} */
  #observer;

  /** @type {number} */
  #activeIndex = 0;

  /**
   * The index requested while a transition was still running, applied once it finishes.
   * @type {number | null}
   */
  #queuedIndex = null;

  /** @type {boolean} */
  #transitioning = false;

  connectedCallback() {
    super.connectedCallback();

    // A thin band across the middle of the viewport: whichever chapter overlaps it is active
    this.#observer = new IntersectionObserver(this.#handleIntersection, {
      rootMargin: '-50% 0px -50% 0px',
    });

    this.#observeChapters();
  }

  updatedCallback() {
    super.updatedCallback();

    // Blocks were added, removed or reordered in the editor
    this.#observer?.disconnect();
    this.#observeChapters();
    this.#render(Math.max(0, Math.min(this.#activeIndex, (this.refs.chapters?.length ?? 1) - 1)));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#observer?.disconnect();
    this.#observer = undefined;
  }

  #observeChapters() {
    this.refs.chapters?.forEach((chapter) => this.#observer?.observe(chapter));
  }

  /**
   * Scrolls a chapter to the middle of the viewport. Triggered by the progress buttons.
   * @param {Event} event
   */
  goToChapter(event) {
    if (!(event.target instanceof HTMLElement)) return;

    const chapter = this.refs.chapters?.[Number(event.target.dataset.index)];
    if (!chapter) return;

    scrollIntoView(chapter, { block: 'center', behavior: prefersReducedMotion() ? 'instant' : 'smooth' });
  }

  /**
   * @param {IntersectionObserverEntry[]} entries
   */
  #handleIntersection = (entries) => {
    const entry = entries.find(({ isIntersecting }) => isIntersecting);
    if (!entry) return;

    const index = (this.refs.chapters ?? []).indexOf(/** @type {HTMLElement} */ (entry.target));
    if (index !== -1) this.#setActiveIndex(index);
  };

  /**
   * Swaps the pinned media to the given chapter, coalescing fast scrolls so only the
   * latest chapter is transitioned to once the running transition settles.
   * @param {number} index
   */
  async #setActiveIndex(index) {
    if (this.#transitioning) {
      this.#queuedIndex = index;
      return;
    }

    if (index === this.#activeIndex) return;

    const direction = index > this.#activeIndex ? 'forward' : 'backward';

    // Scopes the view-transition-name to this instance so other scroll stories on the page aren't captured
    this.#transitioning = true;
    this.toggleAttribute('data-transitioning', true);

    await startViewTransition(() => this.#render(index), ['scroll-story', `scroll-story-${direction}`]);

    this.#transitioning = false;
    this.removeAttribute('data-transitioning');

    if (this.#queuedIndex !== null) {
      const queuedIndex = this.#queuedIndex;
      this.#queuedIndex = null;
      this.#setActiveIndex(queuedIndex);
    }
  }

  /**
   * @param {number} index
   */
  #render(index) {
    const { mediaItems = [], chapters = [], progressButtons = [] } = this.refs;

    this.#activeIndex = index;

    mediaItems.forEach((item, i) => item.classList.toggle('is-active', i === index));
    chapters.forEach((chapter, i) => chapter.classList.toggle('is-active', i === index));
    progressButtons.forEach((button, i) => {
      if (i === index) {
        button.setAttribute('aria-current', 'step');
      } else {
        button.removeAttribute('aria-current');
      }
    });
  }
}

if (!customElements.get('scroll-story-component')) {
  customElements.define('scroll-story-component', ScrollStoryComponent);
}
