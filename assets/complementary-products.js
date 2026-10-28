import { Component } from '@theme/component';

/**
 * Shows complementary products for a product, fetched from the Product Recommendations API with
 * `intent=complementary` and rendered by `sections/complementary-products.liquid`.
 *
 * In the cart, the product is the most recently added line. Cart morphs update the data attributes
 * but skip the list's subtree, so `updatedCallback` decides whether the list needs re-rendering.
 *
 * @typedef {object} Refs
 * @property {HTMLElement} list - The container the fetched items are rendered into.
 *
 * @extends {Component<Refs>}
 */
class ComplementaryProducts extends Component {
  requiredRefs = ['list'];

  /**
   * Defers the first fetch until the element is near the viewport (or its drawer is opened).
   * @type {IntersectionObserver}
   */
  #intersectionObserver = new IntersectionObserver(
    (entries, observer) => {
      if (!entries[0]?.isIntersecting) return;

      observer.disconnect();
      this.#hasIntersected = true;
      this.#load();
    },
    { rootMargin: '0px 0px 400px 0px' }
  );

  #hasIntersected = false;

  /**
   * Section markup per product ID. The response doesn't depend on the cart, so it's safe to reuse.
   * @type {Map<string, string>}
   */
  #cache = new Map();

  /** @type {AbortController | null} */
  #activeFetch = null;

  /**
   * The product and cart state the list was last rendered for.
   * @type {string | null}
   */
  #renderedKey = null;

  connectedCallback() {
    super.connectedCallback();
    this.#intersectionObserver.observe(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#intersectionObserver.disconnect();
    this.#activeFetch?.abort();
  }

  /**
   * Called after a cart section morph, which may have changed the product or the cart contents.
   */
  updatedCallback() {
    super.updatedCallback();
    if (this.#hasIntersected) this.#load();
  }

  async #load() {
    const { url, productId, sectionId, cartProductIds = '' } = this.dataset;
    if (!url || !productId || !sectionId) return;

    const key = `${productId}|${cartProductIds}`;
    if (key === this.#renderedKey) return;

    let html = this.#cache.get(productId);

    if (html === undefined) {
      this.#activeFetch?.abort();
      const controller = new AbortController();
      this.#activeFetch = controller;

      // Fetch the API maximum so there are still enough after filtering out cart products.
      const params = new URLSearchParams({
        product_id: productId,
        intent: 'complementary',
        limit: '10',
        section_id: sectionId,
      });

      try {
        const response = await fetch(`${url}?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Server returned ${response.status}`);

        html = await response.text();
        this.#cache.set(productId, html);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;

        // The Theme Editor preview can't always reach the Section Rendering API, so stay quiet there.
        if (!Shopify.designMode) console.error('Complementary products error:', error);
        this.refs.list.replaceChildren();
        return;
      } finally {
        if (this.#activeFetch === controller) this.#activeFetch = null;
      }
    }

    this.#renderedKey = key;
    this.#render(html, cartProductIds);
  }

  /**
   * Renders the section's items, minus anything already in the cart, up to the limit.
   * @param {string} html - The section markup.
   * @param {string} cartProductIds - Comma-separated IDs of products in the cart.
   */
  #render(html, cartProductIds) {
    const source = new DOMParser()
      .parseFromString(html, 'text/html')
      .querySelector('[data-complementary-products-list]');
    const inCart = new Set(cartProductIds.split(','));
    const limit = Number(this.dataset.limit) || 3;

    const items = Array.from(source?.children ?? [])
      .filter((item) => item instanceof HTMLElement && !inCart.has(item.dataset.productId ?? ''))
      .slice(0, limit);

    this.refs.list.replaceChildren(...items);
  }
}

if (!customElements.get('complementary-products')) {
  customElements.define('complementary-products', ComplementaryProducts);
}
