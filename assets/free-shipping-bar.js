import { Component } from '@theme/component';
import { formatMoney } from '@theme/money-formatting';
import { StandardEvents, CartLinesUpdateEvent, CartDiscountUpdateEvent } from '@shopify/events';

/**
 * A custom element that shows progress towards the free shipping threshold.
 * Re-renders from cart events, so it never polls the cart.
 *
 * @typedef {object} Refs
 * @property {HTMLElement} message - The progress message.
 * @property {HTMLElement} track - The progress bar track.
 *
 * @extends {Component<Refs>}
 */
class FreeShippingBar extends Component {
  requiredRefs = ['message', 'track'];

  connectedCallback() {
    super.connectedCallback();

    document.addEventListener(StandardEvents.cartLinesUpdate, this.#handleCartUpdate);
    document.addEventListener(StandardEvents.cartDiscountUpdate, this.#handleCartUpdate);

    // Liquid can't convert the threshold into the buyer's currency, so always render once on connect.
    this.#render();
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    document.removeEventListener(StandardEvents.cartLinesUpdate, this.#handleCartUpdate);
    document.removeEventListener(StandardEvents.cartDiscountUpdate, this.#handleCartUpdate);
  }

  /**
   * Called after a cart section morph, which restores the unconverted server markup.
   */
  updatedCallback() {
    super.updatedCallback();
    this.#render();
  }

  /**
   * Handles cart line and discount updates.
   * @param {CartLinesUpdateEvent | CartDiscountUpdateEvent} event - The cart update event.
   */
  #handleCartUpdate = (event) => {
    event.promise
      ?.then(({ cart }) => {
        const totalAmount = cart?.cost?.totalAmount;
        const amount = Number(totalAmount?.amount);
        if (!totalAmount || !Number.isFinite(amount)) return;

        // Keep the same units as Liquid's `cart.total_price` so events and morphs agree.
        this.dataset.total = String(Math.round(amount * 100));
        this.dataset.currency = totalAmount.currencyCode;
        this.#render();
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') console.warn('[free-shipping-bar] Event promise rejected:', error);
      });
  };

  /**
   * Renders the message and progress from the element's data attributes.
   */
  #render() {
    const { message, track } = this.refs;
    const { currency, moneyFormat = '{{amount}}', remainingTemplate = '', unlockedMessage = '' } = this.dataset;
    if (!currency) return;

    const rate = Number(window.Shopify?.currency?.rate) || 1;
    const precision = FreeShippingBar.#getCurrencyPrecision(currency);
    /** @param {number} amount - An amount in major units. */
    const toMinorUnits = (amount) => Math.round(amount * 10 ** precision);

    const threshold = toMinorUnits(Number(this.dataset.threshold) * rate);
    const total = toMinorUnits(Number(this.dataset.total) / 100);
    if (!(threshold > 0) || !Number.isFinite(total)) return;

    const remaining = Math.max(threshold - total, 0);
    const progress = String(Math.min(Math.round((total / threshold) * 100), 100));
    const text =
      remaining > 0 ? remainingTemplate.replace('[amount]', formatMoney(remaining, moneyFormat, currency)) : unlockedMessage;

    // Only touch the live region when the text changes, so morphs don't trigger repeat announcements.
    if (message.textContent !== text) message.textContent = text;

    track.setAttribute('aria-valuenow', progress);
    track.style.setProperty('--free-shipping-progress', progress);
    this.toggleAttribute('data-unlocked', remaining === 0);
  }

  /**
   * Returns the number of decimal places a currency uses.
   * @param {string} currency - The currency code.
   * @returns {number}
   */
  static #getCurrencyPrecision(currency) {
    try {
      return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
    } catch (_) {
      return 2;
    }
  }
}

if (!customElements.get('free-shipping-bar')) {
  customElements.define('free-shipping-bar', FreeShippingBar);
}
